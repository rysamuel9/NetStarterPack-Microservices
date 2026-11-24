import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, BarChart3, Share2 } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, OrderStats, ProductItem, WorkflowStats } from '@/core/types';
import { formatCurrency } from '@/shared/utils/formatters';

export default function ReportsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canExport = hasPermission('Reports.Export');

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<ProductItem[]>>('/products');
      if (!res.data.succeeded || !res.data.data) throw new Error(res.data.message);
      return res.data.data;
    },
  });

  const orderStatsQuery = useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<OrderStats>>('/orders/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const wfStatsQuery = useQuery({
    queryKey: ['workflows', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<WorkflowStats>>('/workflows/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const byCategory = useMemo(() => {
    const map: Record<string, { count: number; totalStock: number; value: number }> = {};
    for (const p of productsQuery.data ?? []) {
      if (!map[p.category]) map[p.category] = { count: 0, totalStock: 0, value: 0 };
      map[p.category].count += 1;
      map[p.category].totalStock += p.stock;
      map[p.category].value += p.price * p.stock;
    }
    return Object.entries(map);
  }, [productsQuery.data]);

  const totalInventoryValue = byCategory.reduce((acc, [, v]) => acc + v.value, 0);

  const handleShareReport = async () => {
    const lines = [
      `Laporan Ringkas NetStarterPack (${new Date().toLocaleDateString('id-ID')})`,
      `Total Nilai Aset Katalog: ${formatCurrency(totalInventoryValue)}`,
      `Total Pesanan: ${orderStatsQuery.data?.totalOrders ?? 0} (${formatCurrency(orderStatsQuery.data?.totalRevenue)})`,
      `Total Workflow: ${wfStatsQuery.data?.totalRequests ?? 0} (${wfStatsQuery.data?.approvedRequests ?? 0} Approved)`,
      '',
      'Rincian Kategori Katalog:',
      ...byCategory.map(
        ([cat, stat]) => `- ${cat}: ${stat.count} produk (${stat.totalStock} unit) = ${formatCurrency(stat.value)}`
      ),
    ];

    await Share.share({
      title: 'Laporan NetStarterPack',
      message: lines.join('\n'),
    });
  };

  const handleRefresh = () => {
    void Promise.all([
      productsQuery.refetch(),
      orderStatsQuery.refetch(),
      wfStatsQuery.refetch(),
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Laporan & Analitik</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            Agregasi Catalog, Order, & Workflow
          </Text>
        </View>
        {canExport ? (
          <Pressable
            onPress={() => void handleShareReport()}
            style={[styles.shareBtn, { backgroundColor: colors.success }]}
          >
            <Share2 size={14} color="#FFFFFF" />
            <Text style={styles.shareText}>Bagikan</Text>
          </Pressable>
        ) : null}
      </View>

      {productsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>Menyusun laporan...</Text>
        </View>
      ) : productsQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Laporan</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(productsQuery.error)}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={productsQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Executive Summary Card */}
          <View style={styles.summaryHero}>
            <Text style={styles.heroLabel}>TOTAL ESTIMASI ASET KATALOG</Text>
            <Text style={styles.heroValue}>{formatCurrency(totalInventoryValue)}</Text>
            <View style={styles.heroGrid}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Revenue Order</Text>
                <Text style={styles.heroStatVal}>
                  {formatCurrency(orderStatsQuery.data?.totalRevenue)}
                </Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Workflow Approved</Text>
                <Text style={styles.heroStatVal}>
                  {wfStatsQuery.data?.approvedRequests ?? 0} / {wfStatsQuery.data?.totalRequests ?? 0}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            RINGKASAN PER KATEGORI KATALOG
          </Text>

          {byCategory.map(([cat, stat]) => (
            <View
              key={cat}
              style={[styles.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.catLabelRow}>
                  <BarChart3 size={14} color={colors.primary} />
                  <Text style={[styles.catTitle, { color: colors.text }]}>{cat}</Text>
                </View>
                <Text style={[styles.catSub, { color: colors.textMuted }]}>
                  {stat.count} jenis produk • {stat.totalStock} total unit stok
                </Text>
              </View>
              <Text style={[styles.catValue, { color: colors.success }]}>
                {formatCurrency(stat.value)}
              </Text>
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
  headerSub: { fontSize: 11, marginTop: 1 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  shareText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 15, fontWeight: '700' },
  mutedText: { fontSize: 13, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  summaryHero: {
    backgroundColor: '#0F172A',
    borderRadius: radius.xl,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: '#134E4A',
  },
  heroLabel: { color: '#5EEAD4', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  heroValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  heroGrid: { flexDirection: 'row', gap: 10, marginTop: 8 },
  heroStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    padding: 10,
    gap: 2,
  },
  heroStatLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  heroStatVal: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },
  catCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  catLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catTitle: { fontSize: 14, fontWeight: '700' },
  catSub: { fontSize: 12 },
  catValue: { fontSize: 14, fontWeight: '800' },
});
