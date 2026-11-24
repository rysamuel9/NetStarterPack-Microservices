import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiClient, registerAuthCallbacks } from '@/core/api/client';
import { authenticateBiometric, getBiometricCapabilities } from '@/core/auth/biometric';
import {
  getGatewayUrl,
  loadSavedGatewayUrl,
  resetGatewayUrl,
  saveGatewayUrl,
} from '@/core/config/serverConfig';
import { stopAnnouncementHub } from '@/core/realtime/announcementHub';
import { queryClient } from '@/core/storage/queryClient';
import { tokenStorage } from '@/core/storage/secureStorage';
import type { ApiResult, AuthResponse, CurrentUser, MenuItem } from '@/core/types';

const USER_CACHE_KEY = 'nsp_mobile_user';
const MENUS_CACHE_KEY = 'nsp_mobile_menus';
const BIOMETRIC_ENABLED_KEY = 'nsp_mobile_biometric_enabled';

// Hanya disimpan sementara di RAM selama sesi berjalan agar toggle Biometric di Profil
// bisa langsung menyimpan kredensial terenkripsi ke SecureStore tanpa minta ketik ulang password.
let volatileSessionCredential: { usernameOrEmail: string; password: string } | null = null;

interface AuthState {
  user: CurrentUser | null;
  menus: MenuItem[];
  serverUrl: string;
  isHydrated: boolean;
  isAuthenticating: boolean;
  biometricAvailable: boolean;
  biometricLabel: string;
  biometricEnabled: boolean;
  biometricLocked: boolean;
  biometricSavedUsername: string | null;

  hydrate: () => Promise<void>;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  loginWithBiometric: () => Promise<void>;
  logout: (allDevices?: boolean) => Promise<void>;
  refreshUserAndMenus: () => Promise<void>;
  updateServerUrl: (url: string) => Promise<string>;
  restoreDefaultServerUrl: () => Promise<string>;
  setBiometricEnabled: (enabled: boolean) => Promise<boolean>;
  unlockWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  hasPermission: (permissionCode?: string | null) => boolean;
  hasRole: (roleName: string) => boolean;
}

async function clearLocalSessionCache() {
  await stopAnnouncementHub();
  await Promise.all([
    tokenStorage.clearTokens(),
    AsyncStorage.multiRemove([USER_CACHE_KEY, MENUS_CACHE_KEY]),
  ]);
  queryClient.clear();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  menus: [],
  serverUrl: getGatewayUrl(),
  isHydrated: false,
  isAuthenticating: false,
  biometricAvailable: false,
  biometricLabel: 'Biometrik',
  biometricEnabled: false,
  biometricLocked: false,
  biometricSavedUsername: null,

  hydrate: async () => {
    try {
      const [savedServerUrl, biometricCaps, cachedEntries, accessToken, savedBioCred] =
        await Promise.all([
          loadSavedGatewayUrl(),
          getBiometricCapabilities(),
          AsyncStorage.multiGet([USER_CACHE_KEY, MENUS_CACHE_KEY, BIOMETRIC_ENABLED_KEY]),
          tokenStorage.getAccessToken(),
          tokenStorage.getBiometricCredential(),
        ]);

      const userRaw = cachedEntries[0]?.[1];
      const menusRaw = cachedEntries[1]?.[1];
      const biometricRaw = cachedEntries[2]?.[1];

      let cachedUser: CurrentUser | null = null;
      let cachedMenus: MenuItem[] = [];

      try {
        if (userRaw) cachedUser = JSON.parse(userRaw) as CurrentUser;
      } catch {
        cachedUser = null;
      }

      try {
        if (menusRaw) cachedMenus = JSON.parse(menusRaw) as MenuItem[];
      } catch {
        cachedMenus = [];
      }

      const biometricEnabled = biometricRaw === 'true' && biometricCaps.isAvailable;
      const hasSession = Boolean(accessToken);

      set({
        serverUrl: savedServerUrl,
        biometricAvailable: biometricCaps.isAvailable,
        biometricLabel: biometricCaps.label,
        biometricEnabled,
        biometricSavedUsername: biometricEnabled ? savedBioCred?.usernameOrEmail ?? null : null,
        user: hasSession ? cachedUser : null,
        menus: hasSession ? cachedMenus : [],
        biometricLocked: hasSession && biometricEnabled,
        isHydrated: true,
      });

      // Stale-while-revalidate: segarkan profil & menu di background jika punya token
      if (hasSession) {
        void get().refreshUserAndMenus();
      }
    } catch {
      set({ isHydrated: true });
    }
  },

  login: async (usernameOrEmail, password) => {
    set({ isAuthenticating: true });
    try {
      const trimmedUser = usernameOrEmail.trim();
      const res = await apiClient.post<ApiResult<AuthResponse>>('/auth/login', {
        usernameOrEmail: trimmedUser,
        password,
      });

      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Username atau password tidak sesuai.');
      }

      const { accessToken, refreshToken, user } = res.data.data;
      await tokenStorage.saveTokens(accessToken, refreshToken);
      await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));

      volatileSessionCredential = { usernameOrEmail: trimmedUser, password };

      // Jika biometrik aktif, perbarui juga kredensial terenkripsi di Keystore
      if (get().biometricEnabled) {
        await tokenStorage.saveBiometricCredential(volatileSessionCredential);
        set({ biometricSavedUsername: user.username || trimmedUser });
      }

      set({
        user,
        biometricLocked: false,
      });

      // Ambil dynamic menu sesuai RBAC user
      try {
        const menuRes = await apiClient.get<ApiResult<MenuItem[]>>('/menus/my-menus');
        if (menuRes.data.succeeded && menuRes.data.data) {
          await AsyncStorage.setItem(MENUS_CACHE_KEY, JSON.stringify(menuRes.data.data));
          set({ menus: menuRes.data.data });
        }
      } catch {
        // Biarkan login tetap lanjut walau fetch menu sementara gagal
      }
    } finally {
      set({ isAuthenticating: false });
    }
  },

  loginWithBiometric: async () => {
    const auth = await authenticateBiometric(
      `Gunakan ${get().biometricLabel} untuk masuk ke akun`
    );
    if (!auth.success) {
      throw new Error(auth.error || 'Verifikasi biometrik dibatalkan.');
    }

    const cred = await tokenStorage.getBiometricCredential();
    if (!cred) {
      set({ biometricSavedUsername: null });
      throw new Error('Kredensial biometrik belum tersimpan. Silakan login manual sekali lagi.');
    }

    await get().login(cred.usernameOrEmail, cred.password);
  },

  logout: async (allDevices = false) => {
    const refreshToken = await tokenStorage.getRefreshToken();
    try {
      if (allDevices) {
        await apiClient.post('/auth/logout-all');
      } else if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Tetap lanjut bersihkan sesi lokal walau jaringan offline
    } finally {
      await clearLocalSessionCache();
      volatileSessionCredential = null;
      if (allDevices) {
        await tokenStorage.clearBiometricCredential();
        await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false');
        set({
          user: null,
          menus: [],
          biometricLocked: false,
          biometricEnabled: false,
          biometricSavedUsername: null,
        });
      } else {
        set({
          user: null,
          menus: [],
          biometricLocked: false,
        });
      }
    }
  },

  refreshUserAndMenus: async () => {
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      set({ user: null, menus: [], biometricLocked: false });
      return;
    }

    try {
      const [meRes, menuRes] = await Promise.all([
        apiClient.get<ApiResult<CurrentUser>>('/auth/me'),
        apiClient.get<ApiResult<MenuItem[]>>('/menus/my-menus'),
      ]);

      if (meRes.data.succeeded && meRes.data.data) {
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(meRes.data.data));
        set({ user: meRes.data.data });
      }

      if (menuRes.data.succeeded && menuRes.data.data) {
        await AsyncStorage.setItem(MENUS_CACHE_KEY, JSON.stringify(menuRes.data.data));
        set({ menus: menuRes.data.data });
      }
    } catch {
      // Jika offline, biarkan cached user & menus tetap tampil;
      // jika 401 dan refresh token expired, interceptor sudah memanggil onUnauthorized.
    }
  },

  updateServerUrl: async (url: string) => {
    const normalized = await saveGatewayUrl(url);
    set({ serverUrl: normalized });
    return normalized;
  },

  restoreDefaultServerUrl: async () => {
    const defaultUrl = await resetGatewayUrl();
    set({ serverUrl: defaultUrl });
    return defaultUrl;
  },

  setBiometricEnabled: async (enabled: boolean) => {
    if (enabled) {
      const auth = await authenticateBiometric(
        `Aktifkan ${get().biometricLabel} untuk buka sesi & login cepat`
      );
      if (!auth.success) {
        return false;
      }

      if (volatileSessionCredential) {
        await tokenStorage.saveBiometricCredential(volatileSessionCredential);
        set({ biometricSavedUsername: get().user?.username || volatileSessionCredential.usernameOrEmail });
      }
    } else {
      await tokenStorage.clearBiometricCredential();
      set({ biometricSavedUsername: null });
    }

    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    set({ biometricEnabled: enabled, biometricLocked: false });
    return true;
  },

  unlockWithBiometric: async () => {
    const result = await authenticateBiometric(
      `Gunakan ${get().biometricLabel} untuk masuk kembali`
    );
    if (result.success) {
      set({ biometricLocked: false });
    }
    return result;
  },

  hasRole: (roleName: string) => {
    const user = get().user;
    if (!user) return false;
    return user.roles.some((r) => r.toLowerCase() === roleName.toLowerCase());
  },

  hasPermission: (permissionCode?: string | null) => {
    if (!permissionCode) return true;
    const user = get().user;
    if (!user) return false;
    if (user.roles.some((r) => r.toLowerCase() === 'superadmin')) return true;
    return user.permissions.some((p) => p.toLowerCase() === permissionCode.toLowerCase());
  },
}));

// Hubungkan callback interceptor Axios <-> AuthStore tanpa circular dependency
registerAuthCallbacks({
  onUnauthorized: async () => {
    await clearLocalSessionCache();
    useAuthStore.setState({
      user: null,
      menus: [],
      biometricLocked: false,
    });
  },
  onUserRefreshed: (user) => {
    void AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    useAuthStore.setState({ user });
  },
});
