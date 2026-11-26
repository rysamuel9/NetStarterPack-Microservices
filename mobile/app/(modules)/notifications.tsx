import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, CheckCheck, ChevronLeft, Send, Sliders, Smartphone } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type {
  ApiResult,
  NotificationItem,
  NotificationListResponse,
  NotificationPreference,
  UserPushDevice,
} from '@/core/types';
import { formatDateTime } from '@/shared/utils/formatters';

const CATEGORIES = ['All', 'Workflow', 'Order', 'Tracking', 'Announcement', 'System'];

function mapActionUrlToMobileRoute(actionUrl?: string | null): Href | null {
  if (!actionUrl) return null;
  const clean = actionUrl.replace(/^\/+/, '').toLowerCase();
  if (clean.startsWith('workflow-working-list')) return '/(tabs)/approvals';
  if (clean.startsWith('workflow-tracking')) return '/(modules)/workflow-tracking';
  if (clean.startsWith('workflow-create')) return '/(modules)/workflow-create';
  if (clean.startsWith('orders')) return '/(modules)/orders';
  if (clean.startsWith('tracking')) return '/(modules)/tracking' as Href;
  if (clean.startsWith('announcements')) return '/(tabs)/announcements';
  return null;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [tab, setTab] = useState<'inbox' | 'preferences' | 'devices'>('inbox');
  const [category, setCategory] = useState<string>('All');
  const [sendingTest, setSendingTest] = useState(false);

  const inboxQuery = useQuery({
    queryKey: ['notifications-inbox', category],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<NotificationListResponse>>('/notifications', {
        params: { category, page: 1, pageSize: 30 },
      });
      return res.data.data ?? { items: [], totalCount: 0, unreadCount: 0, page: 1, pageSize: 30, totalPages: 1 };
    },
  });

  const prefsQuery = useQuery({
    queryKey: ['notifications-prefs'],
    enabled: tab === 'preferences',
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<NotificationPreference[]>>('/notifications/preferences');
      return res.data.data ?? [];
    },
  });

  const devicesQuery = useQuery({
    queryKey: ['notifications-devices'],
    enabled: tab === 'devices',
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<UserPushDevice[]>>('/notifications/devices');
      return res.data.data ?? [];
    },
  });

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await apiClient.post(`/notifications/${item.id}/read`);
        void queryClient.invalidateQueries({ queryKey: ['notifications-inbox'] });
      } catch {
        // ignore
      }
    }

    const mobileRoute = mapActionUrlToMobileRoute(item.actionUrl);
    if (mobileRoute) {
      router.push(mobileRoute);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.post('/notifications/read-all');
      void queryClient.invalidateQueries({ queryKey: ['notifications-inbox'] });
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err));
    }
  };

  const handleTogglePreference = async (
    currentPrefs: NotificationPreference[],
    cat: string,
    field: 'inAppEnabled' | 'emailEnabled' | 'pushEnabled',
    value: boolean
  ) => {
    const updated = currentPrefs.map((p) => (p.category === cat ? { ...p, [field]: value } : p));
    try {
      await apiClient.put('/notifications/preferences', { preferences: updated });
      queryClient.setQueryData(['notifications-prefs'], updated);
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err));
    }
  };

  const handleSendTestPush = async () => {
    setSendingTest(true);
    try {
      const res = await apiClient.post<ApiResult<number>>('/notifications/test-push', {
        title: 'Tes Notifikasi Mobile',
        message: 'SignalR live banner & jalur push notification dari Notification.Api (:5088) aktif!',
      });
      Alert.alert('Berhasil', res.data.message || 'Notifikasi tes terkirim.');
      void inboxQuery.refetch();
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err));
    } finally {
      setSendingTest(false);
    }
  };

  const items = inboxQuery.data?.items ?? [];
  const unreadCount = inboxQuery.data?.unreadCount ?? 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Pusat Notifikasi</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua notifikasi sudah dibaca'}
          </Text>
        </View>
        <Pressable
          onPress={() => void handleSendTestPush()}
          disabled={sendingTest}
          style={[styles.actionChip, { backgroundColor: colors.primaryLight }]}
        >
          <Send size={14} color={colors.primary} />
          <Text style={[styles.actionChipText, { color: colors.primary }]}>Tes</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {[
          { id: 'inbox' as const, label: 'Inbox', icon: Bell },
          { id: 'preferences' as const, label: 'Preferensi', icon: Sliders },
          { id: 'devices' as const, label: 'Perangkat', icon: Smartphone },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[
                styles.tabBtn,
                active && { borderBottomWidth: 2, borderBottomColor: colors.primary },
              ]}
            >
              <Icon size={15} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.textSecondary }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'inbox' && (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={inboxQuery.isRefetching}
              onRefresh={() => void inboxQuery.refetch()}
              tintColor={colors.primary}
            />
          }
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.textSecondary }}>
                    {cat === 'All' ? 'Semua' : cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {unreadCount > 0 && (
            <Pressable
              onPress={() => void handleMarkAllRead()}
              style={[styles.markAllBtn, { backgroundColor: colors.primaryLight }]}
            >
              <CheckCheck size={16} color={colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                Tandai Semua Sudah Dibaca
              </Text>
            </Pressable>
          )}

          {items.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Bell size={28} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum ada notifikasi</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Notifikasi Workflow, Order, Tracking, dan Pengumuman akan muncul otomatis di sini.
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => void handleOpenNotification(item)}
                style={[
                  styles.card,
                  {
                    backgroundColor: !item.isRead ? colors.primaryLight : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.badgeText, { color: colors.primary }]}>{item.category.toUpperCase()}</Text>
                  <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                    {formatDateTime(item.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.itemMsg, { color: colors.textSecondary }]}>{item.message}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {tab === 'preferences' && (
        <ScrollView contentContainerStyle={styles.content}>
          {(prefsQuery.data ?? []).map((pref) => (
            <View
              key={pref.category}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.itemTitle, { color: colors.text, marginBottom: 8 }]}>{pref.category}</Text>
              {(
                [
                  { key: 'inAppEnabled', label: 'In-App (SignalR)' },
                  { key: 'emailEnabled', label: 'Email (Office 365 / Gmail)' },
                  { key: 'pushEnabled', label: 'Mobile Push Notification' },
                ] as const
              ).map((row) => (
                <View key={row.key} style={styles.prefRow}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>{row.label}</Text>
                  <Switch
                    value={pref[row.key]}
                    onValueChange={(val) =>
                      void handleTogglePreference(prefsQuery.data ?? [], pref.category, row.key, val)
                    }
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'devices' && (
        <ScrollView contentContainerStyle={styles.content}>
          {(devicesQuery.data ?? []).length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Smartphone size={28} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum ada perangkat terdaftar</Text>
            </View>
          ) : (
            (devicesQuery.data ?? []).map((d) => (
              <View
                key={d.id}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.itemTitle, { color: colors.text }]}>{d.deviceName}</Text>
                <Text style={[styles.timeText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {d.pushToken}
                </Text>
                <Text style={[styles.timeText, { color: colors.textSecondary, marginTop: 4 }]}>
                  Platform: {d.platform.toUpperCase()} • {d.isActive ? 'Aktif' : 'Nonaktif'}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  actionChipText: { fontSize: 12, fontWeight: '700' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  tabText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 14, gap: 10 },
  chipRow: { gap: 8, paddingBottom: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 13,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  timeText: { fontSize: 11 },
  itemTitle: { fontSize: 14, fontWeight: '700' },
  itemMsg: { fontSize: 12, lineHeight: 18 },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700' },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
