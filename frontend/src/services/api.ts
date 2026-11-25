import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ApiResult, AuthResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const avatarUrlFor = (userId: string) => `${API_BASE_URL}/auth/avatar/${userId}`;

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

interface IdempotentRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _idempotencyFingerprint?: string;
}

const recentIdempotencyKeys = new Map<string, { key: string; expiresAt: number }>();

/**
 * Membuat Idempotency-Key (UUID v4) untuk mencegah double-submit pada aksi mutasi kritis.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function shouldAttachIdempotencyKey(config: InternalAxiosRequestConfig): boolean {
  const method = (config.method || 'get').toLowerCase();
  if (!['post', 'put', 'patch'].includes(method)) return false;
  if (config.data instanceof FormData) return false;

  const url = (config.url || '').toLowerCase();
  return !IDEMPOTENCY_EXCLUDED_PATHS.some((excluded) => url.includes(excluded));
}

function resolveIdempotencyKey(config: IdempotentRequestConfig): string {
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

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT Access Token & automatic Idempotency-Key
api.interceptors.request.use((rawConfig) => {
  const config = rawConfig as IdempotentRequestConfig;
  const token = localStorage.getItem('nsp_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Upload file (FormData): biarkan browser yang set multipart/form-data + boundary
  if (config.data instanceof FormData && config.headers) {
    config.headers.delete('Content-Type');
  }
  // Otomatis pasang Idempotency-Key untuk POST/PUT/PATCH (cegah double-submit saat klik 2x / koneksi lambat)
  if (shouldAttachIdempotencyKey(config) && config.headers && !config.headers.get(IDEMPOTENCY_HEADER)) {
    config.headers.set(IDEMPOTENCY_HEADER, resolveIdempotencyKey(config));
  }
  return config;
});

// Response interceptor: automatic Refresh Token rotation on 401
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as IdempotentRequestConfig | undefined;
    const status = error.response?.status;

    // Jika gagal validasi/client error (bukan 401 refresh dan bukan 409 in-flight), bersihkan cache key lokal agar user bisa langsung retry setelah memperbaiki input
    if (originalRequest?._idempotencyFingerprint && status && status >= 400 && status !== 401 && status !== 409) {
      recentIdempotencyKeys.delete(originalRequest._idempotencyFingerprint);
    }

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      const refreshToken = localStorage.getItem('nsp_refresh_token');
      if (!refreshToken) {
        localStorage.removeItem('nsp_access_token');
        localStorage.removeItem('nsp_refresh_token');
        localStorage.removeItem('nsp_user');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post<ApiResult<AuthResponse>>(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken }
        );

        if (res.data.succeeded && res.data.data) {
          const { accessToken, refreshToken: newRefresh, user } = res.data.data;
          localStorage.setItem('nsp_access_token', accessToken);
          localStorage.setItem('nsp_refresh_token', newRefresh);
          localStorage.setItem('nsp_user', JSON.stringify(user));

          processQueue(null, accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('nsp_access_token');
        localStorage.removeItem('nsp_refresh_token');
        localStorage.removeItem('nsp_user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(error: unknown, fallback = 'Terjadi kesalahan pada permintaan.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiResult | undefined;
    if (data?.message) return data.message;
    if (data?.errors?.length) return data.errors.join(', ');
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
