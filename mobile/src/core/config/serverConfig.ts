import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SERVER_URL_STORAGE_KEY = 'nsp_mobile_server_url';

const DEFAULT_GATEWAY_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:5080' : 'http://localhost:5080');

let activeGatewayUrl = normalizeGatewayUrl(DEFAULT_GATEWAY_URL);

export function normalizeGatewayUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:5080' : 'http://localhost:5080';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '').replace(/\/api(\/v\d+)?$/i, '');
}

export function getGatewayUrl(): string {
  return activeGatewayUrl;
}

export function getApiBaseUrl(): string {
  return `${activeGatewayUrl}/api/v1`;
}

export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${activeGatewayUrl}${normalizedPath}`;
}

export function getAvatarUrl(userId: string): string {
  return `${getApiBaseUrl()}/auth/avatar/${userId}`;
}

export async function loadSavedGatewayUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (saved) {
      activeGatewayUrl = normalizeGatewayUrl(saved);
    }
  } catch {
    // Fallback ke default jika AsyncStorage gagal dibaca
  }
  return activeGatewayUrl;
}

export async function saveGatewayUrl(url: string): Promise<string> {
  const normalized = normalizeGatewayUrl(url);
  activeGatewayUrl = normalized;
  await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
  return normalized;
}

export async function resetGatewayUrl(): Promise<string> {
  activeGatewayUrl = normalizeGatewayUrl(DEFAULT_GATEWAY_URL);
  await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY);
  return activeGatewayUrl;
}
