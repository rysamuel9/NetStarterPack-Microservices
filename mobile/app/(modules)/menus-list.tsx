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
import { ArrowLeft, Database } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, MenuItem } from '@/core/types';
import { DynamicLucideIcon } from '@/shared/components/LucideIcon';

export default function MenusDirectoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const menusQuery = useQuery({
    queryKey: ['identity', 'menus-all'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<MenuItem[]>>('/menus');
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
          <Text style={[styles.headerTitle, { color: colors.text }]}>Konfigurasi Menu</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Identity.Api (:5081) • {menusQuery.data?.length ?? 0} item terdaftar
            </Text>
          </View>
        </View>
      </View>

      {menusQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>Memuat daftar menu...</Text>
        </View>
      ) : menusQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Menu</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(menusQuery.error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={menusQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={menusQuery.isRefetching}
              onRefresh={() => void menusQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}>
                  <DynamicLucideIcon name={item.icon} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.path, { color: colors.textMuted }]}>
                    {item.path} • Grup: {item.groupName}
                  </Text>
                  {item.requiredPermission ? (
                    <Text style={[styles.perm, { color: colors.primary }]}>
                      Permission: {item.requiredPermission}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.visBadge,
                    { backgroundColor: item.isVisible ? colors.successLight : colors.surfaceMuted },
                  ]}
                >
                  <Text
                    style={[
                      styles.visText,
                      { color: item.isVisible ? colors.success : colors.textMuted },
                    ]}
                  >
                    {item.isVisible ? 'Aktif' : 'Hidden'}
                  </Text>
                </View>
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
  listContent: { padding: 16, gap: 10, paddingBottom: 28 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700' },
  path: { fontSize: 11 },
  perm: { fontSize: 11, fontWeight: '600' },
  visBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  visText: { fontSize: 10, fontWeight: '700' },
});
