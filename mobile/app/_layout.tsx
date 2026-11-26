import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/core/auth/authStore';
import { registerMobilePushDeviceAsync } from '@/core/notifications/pushRegistration';
import {
  ensureNotificationHubStarted,
  getNotificationHubConnection,
  stopNotificationHub,
  type NotificationReceivedEvent,
} from '@/core/realtime/notificationHub';
import { asyncStoragePersister, queryClient } from '@/core/storage/queryClient';
import { useTheme, useThemeStore } from '@/core/theme/themeStore';
import type { NotificationItem } from '@/core/types';
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
  const [liveNotif, setLiveNotif] = useState<NotificationItem | null>(null);

  useEffect(() => {
    void hydrateTheme();
    void hydrate();
  }, [hydrate, hydrateTheme]);

  // Register device push token & listen to real-time NotificationHub SignalR while logged in
  useEffect(() => {
    if (!user || biometricLocked) {
      void stopNotificationHub();
      return;
    }

    void registerMobilePushDeviceAsync(user.username);
    const conn = getNotificationHubConnection();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onReceived = (payload: NotificationReceivedEvent) => {
      if (payload?.notification) {
        setLiveNotif(payload.notification);
        void queryClient.invalidateQueries({ queryKey: ['notifications-inbox'] });
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setLiveNotif(null), 6000);
      }
    };

    conn.on('NotificationReceived', onReceived);
    void ensureNotificationHubStarted();

    return () => {
      conn.off('NotificationReceived', onReceived);
      if (timer) clearTimeout(timer);
    };
  }, [user, biometricLocked]);

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
      {liveNotif && (
        <Pressable
          onPress={() => {
            setLiveNotif(null);
            router.push('/(modules)/notifications' as Href);
          }}
          style={[styles.liveBanner, { backgroundColor: '#0F172A', borderColor: colors.primary }]}
        >
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#2DD4BF' }}>
            {liveNotif.category.toUpperCase()} • LIVE
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginTop: 2 }}>
            {liveNotif.title}
          </Text>
          <Text numberOfLines={2} style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>
            {liveNotif.message}
          </Text>
        </Pressable>
      )}
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
  liveBanner: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
