import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Briefcase, Building2, Database, Layers, Users } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, DirectorateTreeNode } from '@/core/types';
import { UserAvatar } from '@/shared/components/UserAvatar';

export default function OrganizationScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const treeQuery = useQuery({
    queryKey: ['organizations', 'tree'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<DirectorateTreeNode[]>>('/organizations/tree');
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
          <Text style={[styles.headerTitle, { color: colors.text }]}>Struktur Organisasi</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Identity.Api (:5081) • Hierarki Direktorat ➔ Divisi ➔ Departemen
            </Text>
          </View>
        </View>
      </View>

      {treeQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            Memuat struktur organisasi...
          </Text>
        </View>
      ) : treeQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Organisasi</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(treeQuery.error)}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={treeQuery.isRefetching}
              onRefresh={() => void treeQuery.refetch()}
              tintColor={colors.primary}
            />
          }
        >
          {(treeQuery.data ?? []).map((dir) => (
            <View
              key={dir.id}
              style={[styles.dirCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.dirHeader}>
                <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}>
                  <Building2 size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.codeTag, { color: colors.primary }]}>{dir.code}</Text>
                  <Text style={[styles.dirTitle, { color: colors.text }]}>{dir.name}</Text>
                  {dir.headFullName ? (
                    <Text style={[styles.headLine, { color: colors.textSecondary }]}>
                      Pimpinan: {dir.headFullName}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.countChip, { backgroundColor: colors.surfaceMuted }]}>
                  <Users size={11} color={colors.textSecondary} />
                  <Text style={[styles.countText, { color: colors.text }]}>{dir.userCount}</Text>
                </View>
              </View>

              {/* Divisions */}
              {dir.divisions.map((div) => (
                <View
                  key={div.id}
                  style={[styles.divBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                >
                  <View style={styles.divTitleRow}>
                    <Layers size={14} color={colors.info} />
                    <Text style={[styles.divTitle, { color: colors.text }]}>
                      {div.name} ({div.code})
                    </Text>
                  </View>
                  {div.headFullName ? (
                    <Text style={[styles.subText, { color: colors.textMuted }]}>
                      Head: {div.headFullName}
                    </Text>
                  ) : null}

                  {/* Departments */}
                  {div.departments.map((dept) => (
                    <View
                      key={dept.id}
                      style={[
                        styles.deptBox,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.divTitleRow}>
                        <Briefcase size={13} color={colors.primary} />
                        <Text style={[styles.deptTitle, { color: colors.text }]}>
                          {dept.name}
                        </Text>
                        <Text style={[styles.deptCount, { color: colors.textMuted }]}>
                          {dept.userCount} org
                        </Text>
                      </View>
                      {dept.members.length > 0 ? (
                        <View style={styles.membersWrap}>
                          {dept.members.map((m) => (
                            <View key={m.id} style={styles.memberRow}>
                              <UserAvatar
                                userId={m.id}
                                name={m.fullName}
                                size={24}
                                borderColor={colors.border}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.memberName, { color: colors.text }]}>
                                  {m.fullName}
                                </Text>
                                <Text style={[styles.memberPos, { color: colors.textMuted }]}>
                                  {m.positionName || m.roles.join(', ')}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
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
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  dirCard: { borderWidth: 1, borderRadius: radius.xl, padding: 14, gap: 10 },
  dirHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  codeTag: { fontSize: 10, fontWeight: '800' },
  dirTitle: { fontSize: 15, fontWeight: '800' },
  headLine: { fontSize: 11, marginTop: 1 },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  countText: { fontSize: 11, fontWeight: '700' },
  divBox: { borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 8 },
  divTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  subText: { fontSize: 11 },
  deptBox: { borderWidth: 1, borderRadius: radius.md, padding: 10, gap: 8 },
  deptTitle: { fontSize: 12, fontWeight: '700', flex: 1 },
  deptCount: { fontSize: 11, fontWeight: '600' },
  membersWrap: { gap: 6, paddingTop: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 12, fontWeight: '600' },
  memberPos: { fontSize: 10 },
});
