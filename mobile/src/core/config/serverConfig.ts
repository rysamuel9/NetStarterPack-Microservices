import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const SERVER_URL_STORAGE_KEY = 'nsp_mobile_server_url';
const LAST_ENV_URL_STORAGE_KEY = 'nsp_mobile_last_env_url';

function detectHostFromExpoGo(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
      .manifest2?.extra?.expoClient?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.includes('.exp.direct')) {
    return null;
  }
  return `http://${host}:5080`;
}

const DEFAULT_GATEWAY_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  detectHostFromExpoGo() ||
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
  const currentDefault = normalizeGatewayUrl(DEFAULT_GATEWAY_URL);
  try {
    const [saved, lastEnvUrl] = await Promise.all([
      AsyncStorage.getItem(SERVER_URL_STORAGE_KEY),
      AsyncStorage.getItem(LAST_ENV_URL_STORAGE_KEY),
    ]);

    // Jika IP LAN di mobile/.env (EXPO_PUBLIC_API_URL) berubah dari sesi sebelumnya,
    // otomatis sinkronkan ke IP LAN terbaru supaya tidak nyangkut di IP lama yang sudah mati.
    if (process.env.EXPO_PUBLIC_API_URL && lastEnvUrl !== currentDefault) {
      await AsyncStorage.setItem(LAST_ENV_URL_STORAGE_KEY, currentDefault);
      if (saved && /^http:\/\/(192\.168\.|10\.|172\.)/i.test(saved) && saved !== currentDefault) {
        await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY);
        activeGatewayUrl = currentDefault;
        return activeGatewayUrl;
      }
    }

    if (saved) {
      activeGatewayUrl = normalizeGatewayUrl(saved);
    } else {
      activeGatewayUrl = currentDefault;
    }
  } catch {
    activeGatewayUrl = currentDefault;
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
