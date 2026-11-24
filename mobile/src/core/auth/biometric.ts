import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricCapabilities {
  isAvailable: boolean;
  label: string;
}

export async function getBiometricCapabilities(): Promise<BiometricCapabilities> {
  if (Platform.OS === 'web') {
    return { isAvailable: false, label: 'Biometrik' };
  }

  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    if (!hasHardware || !isEnrolled) {
      return { isAvailable: false, label: 'Biometrik' };
    }

    const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

    if (Platform.OS === 'ios' && hasFace) {
      return { isAvailable: true, label: 'Face ID' };
    }
    if (hasFingerprint) {
      return { isAvailable: true, label: 'Sidik Jari' };
    }
    if (hasFace) {
      return { isAvailable: true, label: 'Face Unlock' };
    }

    return { isAvailable: true, label: 'Biometrik' };
  } catch {
    return { isAvailable: false, label: 'Biometrik' };
  }
}

export async function authenticateBiometric(
  promptMessage = 'Verifikasi identitas untuk membuka sesi'
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Batal',
      fallbackLabel: 'Gunakan Password',
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      error: result.error === 'user_cancel' ? 'Verifikasi dibatalkan.' : 'Verifikasi biometrik gagal.',
    };
  } catch {
    return { success: false, error: 'Sensor biometrik tidak tersedia.' };
  }
}
