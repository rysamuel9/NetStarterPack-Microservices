import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from '@/core/api/client';

const PUSH_TOKEN_STORAGE_KEY = 'nsp_mobile_push_token';

/**
 * Mendaftarkan perangkat mobile ke Notification.Api (/api/notifications/devices).
 * - Di Development Build / EAS Build dengan expo-notifications terpasang: otomatis mengambil ExpoPushToken[...] asli.
 * - Di Expo Go (SDK 53+ dimana remote Android push tidak lagi dibundel): otomatis mendaftarkan token perangkat lokal
 *   agar tetap tercatat di daftar perangkat dan menerima live push banner melalui SignalR NotificationHub.
 */
export async function registerMobilePushDeviceAsync(username?: string): Promise<string | null> {
  try {
    let token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

    if (!token) {
      const deviceSuffix =
        Constants.sessionId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      token = `LocalSignalRToken[${Platform.OS}-${username || 'device'}-${deviceSuffix}]`;
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    }

    const deviceName = `${Constants.deviceName || 'Mobile Device'} (${Platform.OS.toUpperCase()})`;
    await apiClient.post('/notifications/devices', {
      pushToken: token,
      platform: Platform.OS,
      deviceName,
    });

    return token;
  } catch {
    return null;
  }
}

export async function unregisterMobilePushDeviceAsync(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (!token) return;
    await apiClient.post('/notifications/devices/unregister', { pushToken: token });
  } catch {
    // ignore
  }
}
