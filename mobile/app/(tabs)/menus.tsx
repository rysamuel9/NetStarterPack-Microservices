import React, { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { MenuItem } from '@/core/types';
import { DynamicLucideIcon } from '@/shared/components/LucideIcon';

export default function MenusTab() {
  const router = useRouter();
  const { colors } = useTheme();
  const menus = useAuthStore((s) => s.menus);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const refreshUserAndMenus = useAuthStore((s) => s.refreshUserAndMenus);
  const [refreshing, setRefreshing] = useState(false);

  const groupedMenus = useMemo(() => {
    const visible = menus
      .filter((m) => m.isVisible && hasPermission(m.requiredPermission))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const groups: Record<string, MenuItem[]> = {};
    for (const item of visible) {
      const group = item.groupName || 'Lainnya';
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    }
    return Object.entries(groups);
  }, [menus, hasPermission]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUserAndMenus();
    } finally {
      setRefreshing(false);
    }
  };

  const handlePressMenu = (item: MenuItem) => {
    const normalizedPath = item.path.replace(/^\/+/, '').toLowerCase();
    if (normalizedPath === 'dashboard') {
      router.push('/(tabs)');
      return;
    }
    if (normalizedPath === 'products') {
      router.push('/(modules)/products');
      return;
    }
    if (normalizedPath === 'orders') {
      router.push('/(modules)/orders');
      return;
    }
    if (normalizedPath === 'workflow-create') {
      router.push('/(modules)/workflow-create');
      return;
    }
    if (normalizedPath === 'workflow-tracking') {
      router.push('/(modules)/workflow-tracking');
      return;
    }
    if (normalizedPath === 'workflow-working-list') {
      router.push('/(tabs)/approvals');
      return;
    }
    if (normalizedPath === 'announcements' || normalizedPath === 'announcement') {
      router.push('/(tabs)/announcements');
      return;
    }
    if (normalizedPath === 'reports') {
      router.push('/(modules)/reports');
      return;
    }
    if (normalizedPath === 'audit-logs') {
      router.push('/(modules)/audit-logs');
      return;
    }
    if (normalizedPath === 'users') {
      router.push('/(modules)/users');
      return;
    }
    if (normalizedPath === 'organization') {
      router.push('/(modules)/organization');
      return;
    }
    if (normalizedPath === 'roles') {
      router.push('/(modules)/roles');
      return;
    }
    if (normalizedPath === 'menus') {
      router.push('/(modules)/menus-list');
      return;
    }
    if (normalizedPath === 'lookups') {
      router.push('/(modules)/lookups' as Href);
      return;
    }
    if (normalizedPath === 'tracking' || normalizedPath === 'live-tracking') {
      router.push('/(modules)/tracking' as Href);
      return;
    }
    if (normalizedPath === 'profile') {
      router.push('/(tabs)/profile');
      return;
    }

    Alert.alert(
      item.title,
      `Route "/${normalizedPath}" belum dipetakan di mobile. Tambahkan screen baru di mobile/app/(modules)/.`
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.pageTitle, { color: colors.text }]}>Semua Menu</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
          Dirender dinamis dari Identity.Api (/api/menus/my-menus) sesuai hak akses role kamu.
        </Text>

        {groupedMenus.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Belum ada menu yang tersedia. Tarik ke bawah untuk menyegarkan dari server.
            </Text>
          </View>
        ) : (
          groupedMenus.map(([groupName, items]) => (
            <View key={groupName} style={styles.groupSection}>
              <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>{groupName}</Text>
              <View style={styles.grid}>
                {items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => handlePressMenu(item)}
                    style={[
                      styles.menuTile,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <View style={[styles.iconBadge, { backgroundColor: colors.primaryLight }]}>
                      <DynamicLucideIcon name={item.icon} size={22} color={colors.primary} />
                    </View>
                    <Text numberOfLines={2} style={[styles.tileTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 16 },
  pageTitle: { fontSize: 22, fontWeight: '800' },
  pageSubtitle: { fontSize: 13, lineHeight: 19 },
  groupSection: { gap: 10 },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  menuTile: {
    width: '31%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
