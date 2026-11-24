export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  primaryForeground: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  info: string;
  infoLight: string;
  tabBar: string;
  tabBarBorder: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  primary: '#0D9488',
  primaryLight: '#CCFBF1',
  primaryForeground: '#FFFFFF',
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  info: '#2563EB',
  infoLight: '#DBEAFE',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  shadow: '#0F172A',
};

export const darkColors: ThemeColors = {
  background: '#0B1120',
  surface: '#111827',
  surfaceMuted: '#1E293B',
  border: '#273449',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  primary: '#14B8A6',
  primaryLight: '#134E4A',
  primaryForeground: '#042F2E',
  success: '#22C55E',
  successLight: '#14532D',
  warning: '#F59E0B',
  warningLight: '#451A03',
  danger: '#EF4444',
  dangerLight: '#450A0A',
  info: '#3B82F6',
  infoLight: '#1E3A8A',
  tabBar: '#111827',
  tabBarBorder: '#1E293B',
  shadow: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;
