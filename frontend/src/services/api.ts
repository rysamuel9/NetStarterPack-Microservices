import axios from 'axios';
import type { ApiResult, AuthResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const avatarUrlFor = (userId: string) => `${API_BASE_URL}/auth/avatar/${userId}`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT Access Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nsp_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Upload file (FormData): biarkan browser yang set multipart/form-data + boundary
  if (config.data instanceof FormData && config.headers) {
    config.headers.delete('Content-Type');
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
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
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
