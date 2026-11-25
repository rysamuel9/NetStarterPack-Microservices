import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  CheckCircle2,
  Database,
  GitBranch,
  Network,
  Package,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShoppingCart,
  Users,
  XCircle,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type {
  ApiResult,
  DashboardSummary,
  GatewayHealthResponse,
  OrderStats,
  ServiceNodeHealth,
  WorkflowStats,
} from '@/core/types';
import { formatCurrency, formatDateTime } from '@/shared/utils/formatters';

const DEFAULT_CLUSTER_NODES: ServiceNodeHealth[] = [
  {
    service: 'Identity.Api',
    port: 5081,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_IdentityDb',
    latencyMs: 0,
  },
  {
    service: 'Catalog.Api',
    port: 5082,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_CatalogDb',
    latencyMs: 0,
  },
  {
    service: 'Order.Api',
    port: 5083,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_OrderDb',
    latencyMs: 0,
  },
  {
    service: 'Workflow.Api',
    port: 5084,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_WorkflowDb',
    latencyMs: 0,
  },
  {
    service: 'Announcement.Api',
    port: 5085,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_AnnouncementDb',
    latencyMs: 0,
  },
  {
    service: 'MasterData.Api',
    port: 5086,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_MasterDataDb',
    latencyMs: 0,
  },
];

export default function DashboardTab() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const menus = useAuthStore((s) => s.menus);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canViewDashboard = hasPermission('Dashboard.View');
  const canViewProducts = hasPermission('Products.View');
  const canViewOrders = hasPermission('Orders.View');

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary'],
    enabled: canViewDashboard,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<DashboardSummary>>('/dashboard/summary');
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat ringkasan dashboard.');
      }
      return res.data.data;
    },
  });

  const healthQuery = useQuery({
    queryKey: ['gateway', 'health'],
    refetchInterval: 30000, // Auto-pantau cluster setiap 30 detik saat layar aktif
    queryFn: async () => {
      const res = await apiClient.get<GatewayHealthResponse>('/health');
      return res.data;
    },
  });

  const orderStatsQuery = useQuery({
    queryKey: ['orders', 'stats'],
    enabled: canViewDashboard || canViewOrders,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<OrderStats>>('/orders/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const workflowStatsQuery = useQuery({
    queryKey: ['workflows', 'stats'],
    enabled: canViewDashboard,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<WorkflowStats>>('/workflows/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const isRefreshing =
    summaryQuery.isRefetching ||
    healthQuery.isRefetching ||
    orderStatsQuery.isRefetching ||
    workflowStatsQuery.isRefetching;

  const handleRefreshAll = () => {
    void Promise.all([
      summaryQuery.refetch(),
      healthQuery.refetch(),
      orderStatsQuery.refetch(),
      workflowStatsQuery.refetch(),
    ]);
  };

  const clusterServices = healthQuery.data?.services?.length
    ? healthQuery.data.services
    : DEFAULT_CLUSTER_NODES;
  const gatewayOnline = Boolean(healthQuery.data && !healthQuery.isError);
  const healthyCount = clusterServices.filter(
    (s) => s.status.toLowerCase() === 'healthy'
  ).length;
  const totalServices = clusterServices.length;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefreshAll}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero Mesh Control Center */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Radio size={12} color="#34D399" />
            <Text style={styles.heroBadgeText}>YARP GATEWAY (:5080) • MESH CONTROL</Text>
          </View>

          <Text style={styles.heroGreeting}>Halo, {user?.fullName || user?.username}!</Text>
          <Text style={styles.heroSubtext}>
            Role aktif: <Text style={styles.heroHighlight}>{user?.roles.join(', ')}</Text> •{' '}
            {menus.length} menu tersedia
          </Text>

          {/* 3-Pillar Architecture Pill Strip */}
          <View style={styles.topologyPillRow}>
            <View style={styles.topologyPill}>
              <Server size={12} color="#5EEAD4" />
              <Text style={styles.topologyPillText}>1 Gateway</Text>
            </View>
            <View style={styles.topologyPill}>
              <Network size={12} color="#38BDF8" />
              <Text style={styles.topologyPillText}>{totalServices} Cluster</Text>
            </View>
            <View style={styles.topologyPill}>
              <Database size={12} color="#C084FC" />
              <Text style={styles.topologyPillText}>{totalServices} Isolated DB</Text>
            </View>
          </View>
        </View>

        {/* Quick Operational Shortcuts */}
        {(canViewProducts || canViewOrders) ? (
          <View style={styles.shortcutRow}>
            {canViewProducts ? (
              <Pressable
                onPress={() => router.push('/(modules)/products')}
                style={[styles.shortcutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: colors.primaryLight }]}>
                  <Package size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>Katalog Produk</Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>
                    {summaryQuery.data?.totalProducts ?? 0} item aktif
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {canViewOrders ? (
              <Pressable
                onPress={() => router.push('/(modules)/orders')}
                style={[styles.shortcutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: colors.infoLight }]}>
                  <ShoppingCart size={18} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>Pesanan</Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>
                    {orderStatsQuery.data?.totalOrders ?? 0} transaksi
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Live Cluster Topology & Health Monitor */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.clusterHeader}>
            <View style={styles.clusterTitleRow}>
              <Network size={18} color={colors.primary} />
              <View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Status Live Cluster
                </Text>
                <Text style={[styles.clusterSubtitle, { color: colors.textMuted }]}>
                  1 Gateway • {healthyCount}/{totalServices} Service Reachable • {totalServices}{' '}
                  Isolated DB
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => void healthQuery.refetch()}
              style={[styles.refreshIconBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              accessibilityLabel="Segarkan status cluster"
            >
              <RefreshCw size={14} color={colors.primary} />
            </Pressable>
          </View>

          {/* Gateway Node Row */}
          <View
            style={[
              styles.gatewayRow,
              {
                backgroundColor: gatewayOnline ? colors.primaryLight : colors.dangerLight,
                borderColor: gatewayOnline ? colors.primary : colors.danger,
              },
            ]}
          >
            <View style={styles.nodeLeft}>
              <View style={styles.nodeTitleLine}>
                <Server size={15} color={gatewayOnline ? colors.primary : colors.danger} />
                <Text style={[styles.nodeName, { color: colors.text }]}>
                  1. Gateway.Api (:5080)
                </Text>
              </View>
              <Text style={[styles.nodeSub, { color: colors.textSecondary }]}>
                YARP Reverse Proxy • Stateless • Rate Limiter
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: gatewayOnline ? colors.success : colors.danger },
              ]}
            >
              {gatewayOnline ? (
                <CheckCircle2 size={12} color="#FFFFFF" />
              ) : (
                <XCircle size={12} color="#FFFFFF" />
              )}
              <Text style={styles.statusPillText}>
                {gatewayOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {/* 5 Microservice Cluster Nodes */}
          <View style={styles.clusterList}>
            {clusterServices.map((node, index) => {
              const isHealthy = gatewayOnline && node.status.toLowerCase() === 'healthy';
              return (
                <View
                  key={node.service}
                  style={[
                    styles.clusterNodeItem,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: isHealthy ? colors.border : colors.danger,
                    },
                  ]}
                >
                  <View style={styles.clusterNodeTop}>
                    <View style={styles.nodeTitleLine}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: isHealthy ? colors.success : colors.danger },
                        ]}
                      />
                      <Text style={[styles.nodeName, { color: colors.text }]}>
                        {index + 2}. {node.service}
                      </Text>
                      <Text style={[styles.portTag, { color: colors.textMuted }]}>
                        :{node.port}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.nodeStatusBadge,
                        { backgroundColor: isHealthy ? colors.successLight : colors.dangerLight },
                      ]}
                    >
                      <Text
                        style={[
                          styles.nodeStatusText,
                          { color: isHealthy ? colors.success : colors.danger },
                        ]}
                      >
                        {isHealthy ? `Reachable • ${node.latencyMs}ms` : 'Unreachable'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dbLine}>
                    <Database size={12} color={colors.textMuted} />
                    <Text numberOfLines={1} style={[styles.dbName, { color: colors.textSecondary }]}>
                      {node.database}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {healthQuery.data?.timestamp ? (
            <Text style={[styles.timestampNote, { color: colors.textMuted }]}>
              Pembaruan terakhir: {formatDateTime(healthQuery.data.timestamp)}
            </Text>
          ) : null}
        </View>

        {/* Cross-Service Financial & Operational Metrics */}
        {!canViewDashboard ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Ringkasan Terbatas</Text>
            <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
              Akun kamu tidak memiliki permission Dashboard.View. Buka tab Menu untuk modul lain
              yang tersedia bagi role kamu.
            </Text>
          </View>
        ) : summaryQuery.error ? (
          <View style={[styles.card, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
            <Text style={[styles.cardTitle, { color: colors.danger }]}>Gagal Memuat Ringkasan</Text>
            <Text style={[styles.mutedText, { color: colors.danger }]}>
              {getErrorMessage(summaryQuery.error)}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: colors.primaryLight }]}>
                  <Package size={16} color={colors.primary} />
                </View>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                  Aset Katalog (:5082)
                </Text>
                <Text numberOfLines={1} style={[styles.kpiValueMoney, { color: colors.text }]}>
                  {summaryQuery.isLoading
                    ? '...'
                    : formatCurrency(summaryQuery.data?.totalInventoryValue)}
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: colors.infoLight }]}>
                  <ShoppingCart size={16} color={colors.info} />
                </View>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                  Nilai Pesanan (:5083)
                </Text>
                <Text numberOfLines={1} style={[styles.kpiValueMoney, { color: colors.text }]}>
                  {orderStatsQuery.isLoading
                    ? '...'
                    : formatCurrency(orderStatsQuery.data?.totalRevenue)}
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: colors.warningLight }]}>
                  <GitBranch size={16} color={colors.warning} />
                </View>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                  Workflow Review (:5084)
                </Text>
                <Text style={[styles.kpiValue, { color: colors.text }]}>
                  {workflowStatsQuery.isLoading
                    ? '...'
                    : `${workflowStatsQuery.data?.inReviewRequests ?? 0} / ${workflowStatsQuery.data?.totalRequests ?? 0}`}
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: colors.successLight }]}>
                  <Users size={16} color={colors.success} />
                </View>
                <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                  Users & Roles (:5081)
                </Text>
                <Text style={[styles.kpiValue, { color: colors.text }]}>
                  {summaryQuery.isLoading
                    ? '...'
                    : `${summaryQuery.data?.activeUsers ?? 0} / ${summaryQuery.data?.totalRoles ?? 0}R`}
                </Text>
              </View>
            </View>

            {/* Role Distribution */}
            {summaryQuery.data?.roleDistribution?.length ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.sectionHeaderRow}>
                  <Shield size={16} color={colors.primary} />
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Distribusi Role</Text>
                </View>
                <View style={styles.roleChipsWrap}>
                  {summaryQuery.data.roleDistribution.map((r) => (
                    <View
                      key={r.roleName}
                      style={[
                        styles.roleDistChip,
                        { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.roleDistName, { color: colors.text }]}>
                        {r.displayName}
                      </Text>
                      <View style={[styles.roleDistCount, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.roleDistCountText, { color: colors.primary }]}>
                          {r.userCount}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Recent Activities */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeaderRow}>
                <Activity size={16} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Aktivitas Terbaru</Text>
              </View>
              {summaryQuery.data?.recentActivities?.length ? (
                summaryQuery.data.recentActivities.slice(0, 5).map((item) => (
                  <View
                    key={item.id}
                    style={[styles.activityItem, { borderTopColor: colors.border }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.activityTitle, { color: colors.text }]}>
                        {item.module} • {item.action}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={[styles.activityDetail, { color: colors.textSecondary }]}
                      >
                        {item.details}
                      </Text>
                    </View>
                    <Text style={[styles.activityUser, { color: colors.textMuted }]}>
                      {item.userName}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.mutedText, { color: colors.textMuted }]}>
                  {summaryQuery.isLoading ? 'Memuat aktivitas...' : 'Belum ada catatan aktivitas.'}
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: radius.xl,
    padding: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: '#134E4A',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(20, 184, 166, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  heroBadgeText: {
    color: '#5EEAD4',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heroGreeting: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 2,
  },
  heroSubtext: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  heroHighlight: {
    color: '#5EEAD4',
    fontWeight: '700',
  },
  topologyPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  topologyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  topologyPillText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
  },
  shortcutIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: { fontSize: 13, fontWeight: '700' },
  shortcutSub: { fontSize: 11, marginTop: 1 },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  clusterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  clusterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  clusterSubtitle: { fontSize: 11, marginTop: 2 },
  refreshIconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
  },
  nodeLeft: { flex: 1, gap: 2 },
  nodeTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nodeName: { fontSize: 13, fontWeight: '700' },
  nodeSub: { fontSize: 11 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  clusterList: { gap: 8 },
  clusterNodeItem: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 11,
    gap: 6,
  },
  clusterNodeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  portTag: { fontSize: 11, fontWeight: '600' },
  nodeStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  nodeStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dbLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 14,
  },
  dbName: { fontSize: 11, fontWeight: '500' },
  timestampNote: { fontSize: 11, textAlign: 'right' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    width: '48.3%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 13,
    gap: 6,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: { fontSize: 11, fontWeight: '600' },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiValueMoney: { fontSize: 14, fontWeight: '800' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleDistChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
  },
  roleDistName: { fontSize: 12, fontWeight: '600' },
  roleDistCount: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  roleDistCountText: { fontSize: 11, fontWeight: '800' },
  mutedText: { fontSize: 13, lineHeight: 19 },
  activityItem: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  activityTitle: { fontSize: 13, fontWeight: '700' },
  activityDetail: { fontSize: 12, lineHeight: 17 },
  activityUser: { fontSize: 11, fontWeight: '600' },
});
