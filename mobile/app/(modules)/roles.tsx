import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Database, Shield, Users } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, RoleItem } from '@/core/types';

export default function RolesScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const rolesQuery = useQuery({
    queryKey: ['identity', 'roles'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<RoleItem[]>>('/roles');
      if (!res.data.succeeded || !res.data.data) throw new Error(res.data.message);
      return res.data.data;
    },
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Roles & Permissions</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Identity.Api (:5081) • Matriks RBAC
            </Text>
          </View>
        </View>
      </View>

      {rolesQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>Memuat roles...</Text>
        </View>
      ) : rolesQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Roles</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(rolesQuery.error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rolesQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={rolesQuery.isRefetching}
              onRefresh={() => void rolesQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.topRow}>
                <View style={styles.roleTitleRow}>
                  <Shield size={16} color={colors.primary} />
                  <Text style={[styles.roleTitle, { color: colors.text }]}>
                    {item.displayName}
                  </Text>
                </View>
                <View style={[styles.countChip, { backgroundColor: colors.surfaceMuted }]}>
                  <Users size={11} color={colors.textSecondary} />
                  <Text style={[styles.countText, { color: colors.text }]}>
                    {item.userCount} user
                  </Text>
                </View>
              </View>

              <Text style={[styles.desc, { color: colors.textSecondary }]}>{item.description}</Text>

              <View style={styles.permWrap}>
                {item.permissions.slice(0, 12).map((perm) => (
                  <View
                    key={perm}
                    style={[
                      styles.permChip,
                      { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.permText, { color: colors.textSecondary }]}>{perm}</Text>
                  </View>
                ))}
                {item.permissions.length > 12 ? (
                  <View style={[styles.permChip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                    <Text style={[styles.permText, { color: colors.primary }]}>
                      +{item.permissions.length - 12} lainnya
                    </Text>
                  </View>
                ) : null}
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
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 15, fontWeight: '700' },
  mutedText: { fontSize: 13, textAlign: 'center' },
  listContent: { padding: 16, gap: 12, paddingBottom: 28 },
  card: { borderWidth: 1, borderRadius: radius.xl, padding: 15, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  roleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleTitle: { fontSize: 15, fontWeight: '800' },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  countText: { fontSize: 11, fontWeight: '700' },
  desc: { fontSize: 12, lineHeight: 17 },
  permWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  permChip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  permText: { fontSize: 10, fontWeight: '600' },
});
