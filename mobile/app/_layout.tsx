import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/core/auth/authStore';
import { asyncStoragePersister, queryClient } from '@/core/storage/queryClient';
import { useTheme, useThemeStore } from '@/core/theme/themeStore';
import { BiometricLockScreen } from '@/shared/components/BiometricLockScreen';
import { OfflineBanner } from '@/shared/components/OfflineBanner';

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { colors, isDark } = useTheme();

  const isHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);
  const biometricLocked = useAuthStore((s) => s.biometricLocked);
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrateTheme);

  useEffect(() => {
    void hydrateTheme();
    void hydrate();
  }, [hydrate, hydrateTheme]);

  useEffect(() => {
    if (!isHydrated) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && !biometricLocked && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isHydrated, user, biometricLocked, segments, router]);

  if (!isHydrated) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.splashText, { color: colors.textSecondary }]}>
          Menyiapkan sesi...
        </Text>
      </View>
    );
  }

  if (user && biometricLocked) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OfflineBanner />
        <BiometricLockScreen />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(modules)" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister }}
        >
          <RootNavigator />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  splashText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
