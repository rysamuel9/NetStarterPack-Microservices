import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Activity, ArrowLeft, Database, Search, X } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, AuditLogItem } from '@/core/types';
import { formatDateTime } from '@/shared/utils/formatters';

export default function AuditLogsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('Semua');

  const logsQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<AuditLogItem[]>>('/dashboard/audit-logs?limit=150');
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat audit logs.');
      }
      return res.data.data;
    },
  });

  const modules = useMemo(() => {
    const items = logsQuery.data ?? [];
    const unique = Array.from(new Set(items.map((l) => l.module).filter(Boolean)));
    return ['Semua', ...unique];
  }, [logsQuery.data]);

  const filtered = useMemo(() => {
    const items = logsQuery.data ?? [];
    const term = search.trim().toLowerCase();
    return items.filter((log) => {
      const matchMod = selectedModule === 'Semua' || log.module === selectedModule;
      if (!matchMod) return false;
      if (!term) return true;
      return (
        log.userName.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        log.module.toLowerCase().includes(term) ||
        log.details.toLowerCase().includes(term)
      );
    });
  }, [logsQuery.data, search, selectedModule]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Audit Trail & Log</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Identity.Api (:5081) • Cross-Service EventBus Logs
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.filterBlock}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Filter aksi, modul, username, detail..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {modules.map((mod) => {
            const active = selectedModule === mod;
            return (
              <Pressable
                key={mod}
                onPress={() => setSelectedModule(mod)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? colors.primaryForeground : colors.textSecondary },
                  ]}
                >
                  {mod}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {logsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>Memuat audit logs...</Text>
        </View>
      ) : logsQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Audit Logs</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(logsQuery.error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={logsQuery.isRefetching}
              onRefresh={() => void logsQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Activity size={28} color={colors.textMuted} />
              <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
                Tidak ada log yang cocok.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.topRow}>
                <View style={[styles.actionBadge, { backgroundColor: colors.infoLight }]}>
                  <Activity size={11} color={colors.info} />
                  <Text style={[styles.actionText, { color: colors.info }]}>
                    {item.module} • {item.action}
                  </Text>
                </View>
                <Text style={[styles.timeText, { color: colors.textMuted }]}>
                  {formatDateTime(item.timestamp)}
                </Text>
              </View>
              <Text style={[styles.detailsText, { color: colors.text }]}>{item.details}</Text>
              <View style={styles.footerRow}>
                <Text style={[styles.userText, { color: colors.primary }]}>@{item.userName}</Text>
                <Text style={[styles.ipText, { color: colors.textMuted }]}>
                  IP: {item.ipAddress || '-'}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  nodeLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerSub: { fontSize: 11, fontWeight: '500' },
  filterBlock: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14 },
  chipsRow: { gap: 8, paddingBottom: 4 },
  filterChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  listContent: { padding: 16, gap: 10, paddingBottom: 28 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 15, fontWeight: '700' },
  mutedText: { fontSize: 13, textAlign: 'center' },
  emptyCard: { borderWidth: 1, borderRadius: radius.xl, padding: 24, alignItems: 'center', gap: 8 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  actionText: { fontSize: 10, fontWeight: '800' },
  timeText: { fontSize: 10, fontWeight: '500' },
  detailsText: { fontSize: 13, lineHeight: 18 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  userText: { fontSize: 12, fontWeight: '700' },
  ipText: { fontSize: 11 },
});
