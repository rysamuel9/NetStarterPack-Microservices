import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getApiBaseUrl, getGatewayUrl } from '@/core/config/serverConfig';
import { tokenStorage } from '@/core/storage/secureStorage';
import type { ApiResult, AuthResponse, CurrentUser } from '@/core/types';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _idempotencyFingerprint?: string;
}

const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_WINDOW_MS = 5000;
const IDEMPOTENCY_EXCLUDED_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/logout-all',
  '/auth/change-password',
  '/like',
  '/toggle-comments',
];

const recentIdempotencyKeys = new Map<string, { key: string; expiresAt: number }>();

/**
 * Membuat Idempotency-Key unik per aksi submit untuk mencegah double-submit di jaringan mobile.
 */
export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `mob-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function shouldAttachIdempotencyKey(config: InternalAxiosRequestConfig): boolean {
  const method = (config.method || 'get').toLowerCase();
  if (!['post', 'put', 'patch'].includes(method)) return false;
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) return false;

  const url = (config.url || '').toLowerCase();
  return !IDEMPOTENCY_EXCLUDED_PATHS.some((excluded) => url.includes(excluded));
}

function resolveIdempotencyKey(config: RetryableRequestConfig): string {
  const now = Date.now();
  if (recentIdempotencyKeys.size > 50) {
    for (const [fp, entry] of recentIdempotencyKeys.entries()) {
      if (entry.expiresAt <= now) recentIdempotencyKeys.delete(fp);
    }
  }

  let serializedBody = '';
  try {
    serializedBody = typeof config.data === 'string' ? config.data : JSON.stringify(config.data ?? null);
  } catch {
    serializedBody = String(now);
  }

  const fingerprint = `${(config.method || '').toUpperCase()}:${config.url || ''}:${serializedBody}`;
  config._idempotencyFingerprint = fingerprint;

  const existing = recentIdempotencyKeys.get(fingerprint);
  if (existing && existing.expiresAt > now) {
    return existing.key;
  }

  const key = createIdempotencyKey();
  recentIdempotencyKeys.set(fingerprint, { key, expiresAt: now + IDEMPOTENCY_WINDOW_MS });
  return key;
}

type UnauthorizedCallback = () => Promise<void> | void;
type UserRefreshedCallback = (user: CurrentUser) => void;

let onUnauthorized: UnauthorizedCallback | null = null;
let onUserRefreshed: UserRefreshedCallback | null = null;

export function registerAuthCallbacks(callbacks: {
  onUnauthorized: UnauthorizedCallback;
  onUserRefreshed: UserRefreshedCallback;
}) {
  onUnauthorized = callbacks.onUnauthorized;
  onUserRefreshed = callbacks.onUserRefreshed;
}

export const apiClient = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'bypass-tunnel-reminder': 'true',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Request interceptor: selalu pakai baseURL terbaru + attach Access Token + Idempotency-Key
apiClient.interceptors.request.use(async (rawConfig) => {
  const config = rawConfig as RetryableRequestConfig;
  config.baseURL = getApiBaseUrl();

  const token = await tokenStorage.getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Upload file (FormData): hapus Content-Type manual agar boundary multipart otomatis diset
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }

  // Otomatis pasang Idempotency-Key untuk POST/PUT/PATCH (cegah double-tap saat sinyal mobile lambat)
  if (shouldAttachIdempotencyKey(config) && config.headers && !config.headers[IDEMPOTENCY_HEADER]) {
    config.headers[IDEMPOTENCY_HEADER] = resolveIdempotencyKey(config);
  }

  return config;
});

// Single-flight Refresh Token Queue agar request paralel yang kena 401 hanya memanggil /auth/refresh 1x
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const flushQueue = (error: unknown, newToken: string | null = null) => {
  failedQueue.forEach((entry) => {
    if (error) {
      entry.reject(error);
    } else if (newToken) {
      entry.resolve(newToken);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const requestUrl = originalRequest?.url ?? '';
    const status = error.response?.status;

    // Bersihkan cache key lokal saat gagal validasi (kecuali 401 refresh & 409 in-flight) agar user bisa langsung submit ulang
    if (originalRequest?._idempotencyFingerprint && status && status >= 400 && status !== 401 && status !== 409) {
      recentIdempotencyKeys.delete(originalRequest._idempotencyFingerprint);
    }

    const shouldAttemptRefresh =
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !requestUrl.includes('/auth/login') &&
      !requestUrl.includes('/auth/refresh') &&
      !requestUrl.includes('/auth/logout');

    if (!shouldAttemptRefresh) {
      return Promise.reject(error);
    }

    const currentRefreshToken = await tokenStorage.getRefreshToken();
    if (!currentRefreshToken) {
      await tokenStorage.clearTokens();
      await onUnauthorized?.();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((newAccessToken) => {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshRes = await axios.post<ApiResult<AuthResponse>>(
        `${getApiBaseUrl()}/auth/refresh`,
        { refreshToken: currentRefreshToken },
        { timeout: 15000 }
      );

      if (refreshRes.data.succeeded && refreshRes.data.data) {
        const { accessToken, refreshToken, user } = refreshRes.data.data;
        await tokenStorage.saveTokens(accessToken, refreshToken);
        onUserRefreshed?.(user);
        flushQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      }

      throw new Error(refreshRes.data.message || 'Sesi tidak valid.');
    } catch (refreshError) {
      flushQueue(refreshError, null);
      await tokenStorage.clearTokens();
      await onUnauthorized?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export function getErrorMessage(
  error: unknown,
  fallback = 'Terjadi kesalahan saat menghubungi server.'
): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return `Tidak dapat terhubung ke API Gateway (${getGatewayUrl()}). Cek koneksi Wi-Fi & alamat server di pengaturan.`;
    }
    const data = error.response.data as ApiResult | undefined;
    if (data?.message) return data.message;
    if (data?.errors?.length) return data.errors.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
