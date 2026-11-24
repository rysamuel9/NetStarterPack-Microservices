import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import { darkColors, lightColors, type ThemeColors } from '@/core/theme/tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'nsp_mobile_theme_mode';

interface ThemeState {
  mode: ThemeMode;
  hydrateTheme: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',

  hydrateTheme: async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        set({ mode: saved });
      }
    } catch {
      // Fallback ke system
    }
  },

  setMode: async (mode) => {
    set({ mode });
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore storage error
    }
  },
}));

export function useTheme(): {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
} {
  const systemScheme = useColorScheme();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    mode,
    setMode,
  };
}
