import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getApiBaseUrl } from '@/core/config/serverConfig';
import { tokenStorage } from '@/core/storage/secureStorage';
import type { ApiResult, AuthResponse, CurrentUser } from '@/core/types';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
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
  },
});

// Request interceptor: selalu pakai baseURL terbaru + attach Access Token dari SecureStore
apiClient.interceptors.request.use(async (config) => {
  config.baseURL = getApiBaseUrl();

  const token = await tokenStorage.getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Upload file (FormData): hapus Content-Type manual agar boundary multipart otomatis diset
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
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

    const shouldAttemptRefresh =
      error.response?.status === 401 &&
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
      return 'Tidak dapat terhubung ke API Gateway. Cek koneksi Wi-Fi & alamat server di pengaturan.';
    }
    const data = error.response.data as ApiResult | undefined;
    if (data?.message) return data.message;
    if (data?.errors?.length) return data.errors.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
