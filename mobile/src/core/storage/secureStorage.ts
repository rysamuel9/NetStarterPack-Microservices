import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'nsp_access_token';
const REFRESH_TOKEN_KEY = 'nsp_refresh_token';
const BIOMETRIC_CRED_KEY = 'nsp_biometric_cred';

export interface BiometricSavedCredential {
  usernameOrEmail: string;
  password: string;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // Ignore web storage failure
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore web storage failure
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const tokenStorage = {
  getAccessToken: () => getItem(ACCESS_TOKEN_KEY),
  setAccessToken: (token: string) => setItem(ACCESS_TOKEN_KEY, token),
  getRefreshToken: () => getItem(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string) => setItem(REFRESH_TOKEN_KEY, token),
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      setItem(ACCESS_TOKEN_KEY, accessToken),
      setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },
  async clearTokens(): Promise<void> {
    await Promise.all([removeItem(ACCESS_TOKEN_KEY), removeItem(REFRESH_TOKEN_KEY)]);
  },
  async saveBiometricCredential(cred: BiometricSavedCredential): Promise<void> {
    await setItem(BIOMETRIC_CRED_KEY, JSON.stringify(cred));
  },
  async getBiometricCredential(): Promise<BiometricSavedCredential | null> {
    const raw = await getItem(BIOMETRIC_CRED_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as BiometricSavedCredential;
      if (parsed.usernameOrEmail && parsed.password) return parsed;
      return null;
    } catch {
      return null;
    }
  },
  async clearBiometricCredential(): Promise<void> {
    await removeItem(BIOMETRIC_CRED_KEY);
  },
};
