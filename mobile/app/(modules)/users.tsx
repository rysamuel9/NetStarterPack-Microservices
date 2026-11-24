import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Building2, Database, Search, Users, X } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, UserItem } from '@/core/types';
import { UserAvatar } from '@/shared/components/UserAvatar';

export default function UsersDirectoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const usersQuery = useQuery({
    queryKey: ['identity', 'users'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<UserItem[]>>('/users');
      if (!res.data.succeeded || !res.data.data) throw new Error(res.data.message);
      return res.data.data;
    },
  });

  const filtered = useMemo(() => {
    const items = usersQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (u) =>
        u.fullName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.departmentName || u.department || '').toLowerCase().includes(term) ||
        u.roles.some((r) => r.toLowerCase().includes(term))
    );
  }, [usersQuery.data, search]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Direktori Pengguna</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Identity.Api (:5081) • {usersQuery.data?.length ?? 0} akun terdaftar
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama, username, role, departemen..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {usersQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>Memuat pengguna...</Text>
        </View>
      ) : usersQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Pengguna</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(usersQuery.error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={usersQuery.isRefetching}
              onRefresh={() => void usersQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Users size={28} color={colors.textMuted} />
              <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
                Tidak ditemukan pengguna.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActive = item.status.toLowerCase() === 'active';
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.row}>
                  <UserAvatar
                    userId={item.id}
                    name={item.fullName}
                    size={44}
                    borderColor={colors.border}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                        {item.fullName}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: isActive ? colors.successLight : colors.dangerLight },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: isActive ? colors.success : colors.danger },
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.sub, { color: colors.textSecondary }]}>
                      @{item.username} • {item.email}
                    </Text>
                    {item.positionName || item.departmentName ? (
                      <View style={styles.orgRow}>
                        <Building2 size={11} color={colors.textMuted} />
                        <Text numberOfLines={1} style={[styles.orgText, { color: colors.textMuted }]}>
                          {[item.positionName, item.departmentName].filter(Boolean).join(' • ')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.roleRow}>
                  {item.roles.map((r) => (
                    <View key={r} style={[styles.roleChip, { backgroundColor: colors.primaryLight }]}>
                      <Text style={[styles.roleText, { color: colors.primary }]}>{r}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          }}
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
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
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
  listContent: { padding: 16, gap: 10, paddingBottom: 28 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 15, fontWeight: '700' },
  mutedText: { fontSize: 13, textAlign: 'center' },
  emptyCard: { borderWidth: 1, borderRadius: radius.xl, padding: 24, alignItems: 'center', gap: 8 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 14, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  statusText: { fontSize: 10, fontWeight: '700' },
  sub: { fontSize: 12 },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  orgText: { fontSize: 11, flex: 1 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  roleText: { fontSize: 11, fontWeight: '700' },
});
