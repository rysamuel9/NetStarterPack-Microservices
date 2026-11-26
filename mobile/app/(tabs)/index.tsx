import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  Database,
  FilePlus2,
  GitBranch,
  Layers,
  MapPin,
  Megaphone,
  Navigation,
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
  AnnouncementStats,
  ApiResult,
  DashboardSummary,
  GatewayHealthResponse,
  MasterDataStats,
  OrderStats,
  ServiceNodeHealth,
  TrackingStats,
  TrackingSummaryItem,
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
  {
    service: 'Tracking.Api',
    port: 5087,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_TrackingDb',
    latencyMs: 0,
  },
  {
    service: 'Notification.Api',
    port: 5088,
    url: '',
    status: 'Unreachable',
    database: 'NetStarterPack_NotificationDb',
    latencyMs: 0,
  },
];

const SERVICE_NODE_META: Record<
  string,
  { subtitle: string; route: Href; permission?: string; accent: string }
> = {
  'Identity.Api': {
    subtitle: 'Zero-Trust JWT • RBAC • Org • Audit Hub',
    route: '/(modules)/users' as Href,
    permission: 'Users.View',
    accent: '#06B6D4',
  },
  'Catalog.Api': {
    subtitle: 'Products CRUD • Cache L1/L2 • Idempotent',
    route: '/(modules)/products' as Href,
    permission: 'Products.View',
    accent: '#10B981',
  },
  'Order.Api': {
    subtitle: 'Orders CRUD • Idempotent • Audit Event',
    route: '/(modules)/orders' as Href,
    permission: 'Orders.View',
    accent: '#F59E0B',
  },
  'Workflow.Api': {
    subtitle: 'Dynamic Form • Multi-Level Approval',
    route: '/(modules)/workflow-tracking' as Href,
    permission: 'Workflows.View',
    accent: '#8B5CF6',
  },
  'Announcement.Api': {
    subtitle: 'HR Newsroom • SignalR Hub • Uploads',
    route: '/(tabs)/announcements' as Href,
    permission: 'Announcements.View',
    accent: '#F43F5E',
  },
  'MasterData.Api': {
    subtitle: 'Unified 1-Table Lookups • Cascading • Cache',
    route: '/(modules)/lookups' as Href,
    permission: 'Lookups.View',
    accent: '#14B8A6',
  },
  'Tracking.Api': {
    subtitle: 'Field Dispatch • Live GPS • Haversine Geofence',
    route: '/(modules)/tracking' as Href,
    permission: 'Tracking.View',
    accent: '#0284C7',
  },
  'Notification.Api': {
    subtitle: 'In-App SignalR • Email O365/Gmail • Expo Push',
    route: '/(modules)/notifications' as Href,
    permission: 'Notifications.View',
    accent: '#7C3AED',
  },
};

const SHARED_KERNEL_TAGS = [
  'Zero-Trust JWT',
  'Hybrid Cache L1/L2',
  'Idempotent',
  'Polly v8',
  'API v1',
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
  const canViewLookups = hasPermission('Lookups.View');
  const canViewTracking = hasPermission('Tracking.View');
  const canDispatchTracking = hasPermission('Tracking.Dispatch');
  const canApproveWorkflow = hasPermission('Workflows.Approve');
  const canCreateWorkflow = hasPermission('Workflows.Create');
  const canViewWorkflow = hasPermission('Workflows.View');
  const canViewAnnouncements = hasPermission('Announcements.View');

  const isTechAdmin =
    Boolean(user?.roles.some((r) => ['superadmin', 'admin', 'itlead'].includes(r.toLowerCase()))) ||
    hasPermission('AuditLogs.View') ||
    hasPermission('Roles.View');

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
    enabled: isTechAdmin,
    refetchInterval: 30000, // Auto-pantau cluster setiap 30 detik saat layar aktif
    queryFn: async () => {
      const res = await apiClient.get<GatewayHealthResponse>('/health');
      return res.data;
    },
  });

  const orderStatsQuery = useQuery({
    queryKey: ['orders', 'stats'],
    enabled: isTechAdmin || canViewOrders,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<OrderStats>>('/orders/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const workflowStatsQuery = useQuery({
    queryKey: ['workflows', 'stats'],
    enabled: isTechAdmin || canViewWorkflow,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<WorkflowStats>>('/workflows/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const announcementStatsQuery = useQuery({
    queryKey: ['announcements', 'stats'],
    enabled: isTechAdmin || canViewAnnouncements,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<AnnouncementStats>>('/announcements/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const masterDataStatsQuery = useQuery({
    queryKey: ['lookups', 'stats'],
    enabled: isTechAdmin || canViewLookups,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<MasterDataStats>>('/lookups/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const trackingStatsQuery = useQuery({
    queryKey: ['tracking', 'stats'],
    enabled: isTechAdmin || canViewTracking,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<TrackingStats>>('/tracking/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  const myTrackingsQuery = useQuery({
    queryKey: ['tracking', 'list-preview'],
    enabled: canViewTracking,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<TrackingSummaryItem[]>>('/tracking');
      return res.data.succeeded && res.data.data ? res.data.data : [];
    },
  });

  const isRefreshing =
    summaryQuery.isRefetching ||
    healthQuery.isRefetching ||
    orderStatsQuery.isRefetching ||
    workflowStatsQuery.isRefetching ||
    announcementStatsQuery.isRefetching ||
    masterDataStatsQuery.isRefetching ||
    trackingStatsQuery.isRefetching ||
    myTrackingsQuery.isRefetching;

  const handleRefreshAll = () => {
    void Promise.all([
      summaryQuery.refetch(),
      isTechAdmin ? healthQuery.refetch() : Promise.resolve(),
      orderStatsQuery.refetch(),
      workflowStatsQuery.refetch(),
      announcementStatsQuery.refetch(),
      masterDataStatsQuery.refetch(),
      trackingStatsQuery.refetch(),
      myTrackingsQuery.refetch(),
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
  const avgLatencyMs =
    clusterServices.length > 0
      ? Math.round(
          clusterServices.reduce((acc, s) => acc + (s.latencyMs || 0), 0) / clusterServices.length
        )
      : 0;

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
        {/* Hero Card (adaptif: Mesh Control untuk Admin/Tech, Workspace Operasional untuk Staff/Role Bisnis) */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            {isTechAdmin ? <Radio size={12} color="#34D399" /> : <Shield size={12} color="#34D399" />}
            <Text style={styles.heroBadgeText}>
              {isTechAdmin
                ? 'YARP GATEWAY (:5080) • API V1 • MESH CONTROL'
                : `WORKSPACE ${(user?.roles[0] || 'USER').toUpperCase()}`}
            </Text>
          </View>

          <Text style={styles.heroGreeting}>Halo, {user?.fullName || user?.username}!</Text>
          <Text style={styles.heroSubtext}>
            Role aktif: <Text style={styles.heroHighlight}>{user?.roles.join(', ')}</Text> •{' '}
            {menus.length} menu tersedia
          </Text>

          {isTechAdmin ? (
            <View style={styles.topologyPillRow}>
              <View style={styles.topologyPill}>
                <Server size={12} color="#5EEAD4" />
                <Text style={styles.topologyPillText}>1 Gateway</Text>
              </View>
              <View style={styles.topologyPill}>
                <Network size={12} color="#38BDF8" />
                <Text style={styles.topologyPillText}>{totalServices} Services</Text>
              </View>
              <View style={styles.topologyPill}>
                <Database size={12} color="#C084FC" />
                <Text style={styles.topologyPillText}>{totalServices} Isolated DB</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Quick Operational Shortcuts (sesuai permission masing-masing role) */}
        {canViewTracking || canApproveWorkflow || canCreateWorkflow || canViewProducts || canViewOrders || canViewLookups ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shortcutScroll}
          >
            {canViewTracking ? (
              <Pressable
                onPress={() => router.push('/(modules)/tracking' as Href)}
                style={[styles.shortcutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: '#E0F2FE' }]}>
                  <Navigation size={17} color="#0284C7" />
                </View>
                <View>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>
                    {canDispatchTracking ? 'Live Tracking' : 'Tugas Saya'}
                  </Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>
                    {(myTrackingsQuery.data ?? []).filter((t) =>
                      ['Assigned', 'InTransit', 'Arrived', 'IssueReported'].includes(t.status)
                    ).length}{' '}
                    aktif
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {canApproveWorkflow ? (
              <Pressable
                onPress={() => router.push('/(tabs)/approvals')}
                style={[styles.shortcutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: colors.warningLight }]}>
                  <ClipboardCheck size={17} color={colors.warning} />
                </View>
                <View>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>Approval</Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>
                    {workflowStatsQuery.data?.inReviewRequests ?? 0} review
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {canCreateWorkflow ? (
              <Pressable
                onPress={() => router.push('/(modules)/workflow-create')}
                style={[styles.shortcutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: '#EDE9FE' }]}>
                  <FilePlus2 size={17} color="#7C3AED" />
                </View>
                <View>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>Pengajuan</Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>Buat form</Text>
                </View>
              </Pressable>
            ) : null}

            {canViewProducts ? (
              <Pressable
                onPress={() => router.push('/(modules)/products')}
                style={[styles.shortcutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: colors.primaryLight }]}>
                  <Package size={17} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>Katalog</Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>
                    {summaryQuery.data?.totalProducts ?? 0} produk
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
                  <ShoppingCart size={17} color={colors.info} />
                </View>
                <View>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>Pesanan</Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>
                    {orderStatsQuery.data?.totalOrders ?? 0} order
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {canViewLookups ? (
              <Pressable
                onPress={() => router.push('/(modules)/lookups' as Href)}
                style={[styles.shortcutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: colors.successLight }]}>
                  <Layers size={17} color={colors.success} />
                </View>
                <View>
                  <Text style={[styles.shortcutTitle, { color: colors.text }]}>Lookups</Text>
                  <Text style={[styles.shortcutSub, { color: colors.textMuted }]}>
                    {masterDataStatsQuery.data?.totalGroups ?? 0} grup
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}

        {/* Ringkasan Tugas Lapangan untuk Role Operasional (Staff / Manager / Viewer) */}
        {!isTechAdmin && canViewTracking ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.clusterHeader}>
              <View style={styles.clusterTitleRow}>
                <View style={[styles.topologyHeaderIcon, { backgroundColor: '#E0F2FE' }]}>
                  <MapPin size={16} color="#0284C7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {canDispatchTracking ? 'Tugas Lapangan Tim' : 'Tugas Lapangan Saya'}
                  </Text>
                  <Text style={[styles.clusterSubtitle, { color: colors.textMuted }]}>
                    {(myTrackingsQuery.data ?? []).filter((t) =>
                      ['Assigned', 'InTransit', 'Arrived', 'IssueReported'].includes(t.status)
                    ).length}{' '}
                    aktif •{' '}
                    {(myTrackingsQuery.data ?? []).filter((t) => t.status === 'PendingVerification').length}{' '}
                    verifikasi • {(myTrackingsQuery.data ?? []).filter((t) => t.status === 'Completed').length}{' '}
                    selesai
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/(modules)/tracking' as Href)}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Buka Semua</Text>
              </Pressable>
            </View>

            {(myTrackingsQuery.data ?? []).length === 0 ? (
              <Text style={[styles.mutedText, { color: colors.textMuted }]}>
                Belum ada tugas lapangan aktif saat ini.
              </Text>
            ) : (
              (myTrackingsQuery.data ?? []).slice(0, 3).map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => router.push('/(modules)/tracking' as Href)}
                  style={[styles.activityItem, { borderTopColor: colors.border }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.activityTitle, { color: colors.text }]} numberOfLines={1}>
                      {t.assignmentCode} • {t.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.activityDetail, { color: colors.textSecondary }]}>
                      Tujuan: {t.destinationLabel} ({t.status})
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {/* Visual 3-Tier Live Cluster Topology (Khusus SuperAdmin / Admin / ITLead) */}
        {isTechAdmin ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.clusterHeader}>
            <View style={styles.clusterTitleRow}>
              <View style={[styles.topologyHeaderIcon, { backgroundColor: colors.primaryLight }]}>
                <Network size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Topologi Live Cluster
                </Text>
                <Text style={[styles.clusterSubtitle, { color: colors.textMuted }]}>
                  {healthyCount}/{totalServices} Healthy • Avg {avgLatencyMs}ms • {totalServices}{' '}
                  Isolated DB
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => void healthQuery.refetch()}
              style={[
                styles.refreshIconBtn,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
              accessibilityLabel="Segarkan status cluster"
            >
              <RefreshCw size={14} color={colors.primary} />
            </Pressable>
          </View>

          {/* TIER 1: Gateway Hub */}
          <View
            style={[
              styles.gatewayHub,
              {
                borderColor: gatewayOnline ? '#14B8A6' : colors.danger,
              },
            ]}
          >
            <View style={styles.nodeLeft}>
              <View style={styles.nodeTitleLine}>
                <Server size={15} color={gatewayOnline ? '#5EEAD4' : '#FDA4AF'} />
                <Text style={styles.gatewayTitle}>Gateway.Api (:5080)</Text>
              </View>
              <Text style={styles.gatewaySub}>
                YARP Reverse Proxy • API v1 • Polly v8 • Rate Limit
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: gatewayOnline ? '#10B981' : colors.danger },
              ]}
            >
              {gatewayOnline ? (
                <CheckCircle2 size={11} color="#FFFFFF" />
              ) : (
                <XCircle size={11} color="#FFFFFF" />
              )}
              <Text style={styles.statusPillText}>{gatewayOnline ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
          </View>

          {/* Visual Vertical Trunk from Gateway */}
          <View style={styles.trunkStemWrap}>
            <View style={[styles.trunkStem, { backgroundColor: colors.primary }]} />
          </View>

          {/* TIER 2: Branch Rail -> 6 Microservices + Isolated DB Cylinders */}
          <View style={[styles.branchRail, { borderLeftColor: colors.primary }]}>
            {clusterServices.map((node) => {
              const isHealthy = gatewayOnline && node.status.toLowerCase() === 'healthy';
              const meta = SERVICE_NODE_META[node.service];
              const canOpen = Boolean(meta && (!meta.permission || hasPermission(meta.permission)));

              return (
                <View key={node.service} style={styles.branchRow}>
                  {/* Horizontal branch tick */}
                  <View style={[styles.branchTick, { backgroundColor: colors.primary }]} />

                  <Pressable
                    disabled={!canOpen}
                    onPress={() => {
                      if (meta && canOpen) router.push(meta.route);
                    }}
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
                            { backgroundColor: isHealthy ? (meta?.accent ?? colors.success) : colors.danger },
                          ]}
                        />
                        <Text style={[styles.nodeName, { color: colors.text }]}>{node.service}</Text>
                        <Text style={[styles.portTag, { color: colors.textMuted }]}>:{node.port}</Text>
                      </View>

                      <View style={styles.nodeRightMeta}>
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
                            {isHealthy ? `${node.latencyMs}ms` : 'OFFLINE'}
                          </Text>
                        </View>
                        {canOpen ? <ChevronRight size={14} color={colors.textMuted} /> : null}
                      </View>
                    </View>

                    {meta ? (
                      <Text numberOfLines={1} style={[styles.nodeCapability, { color: colors.textSecondary }]}>
                        {meta.subtitle}
                      </Text>
                    ) : null}

                    {/* Attached Isolated DB Pill */}
                    <View style={styles.isolatedDbPill}>
                      <Database size={11} color="#5EEAD4" />
                      <Text numberOfLines={1} style={styles.isolatedDbText}>
                        {node.database}
                      </Text>
                      <Text style={styles.isolatedDbTag}>DB</Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* TIER 3: BuildingBlocks Shared Kernel Bar */}
          <View style={styles.sharedKernelCard}>
            <View style={styles.sharedKernelHeader}>
              <Cpu size={13} color="#5EEAD4" />
              <Text style={styles.sharedKernelTitle}>BUILDINGBLOCKS SHARED KERNEL</Text>
            </View>
            <View style={styles.sharedKernelTags}>
              {SHARED_KERNEL_TAGS.map((tag) => (
                <View key={tag} style={styles.sharedKernelChip}>
                  <Text style={styles.sharedKernelChipText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          {healthQuery.data?.timestamp ? (
            <Text style={[styles.timestampNote, { color: colors.textMuted }]}>
              Pembaruan terakhir: {formatDateTime(healthQuery.data.timestamp)}
            </Text>
          ) : null}
        </View>
        ) : null}

        {/* Cross-Service Operational Metrics (terfilter sesuai hak akses role) */}
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
              {(isTechAdmin || canViewProducts) ? (
                <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.primaryLight }]}>
                    <Package size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                    {isTechAdmin ? 'Aset Katalog (:5082)' : 'Katalog Produk'}
                  </Text>
                  <Text numberOfLines={1} style={[styles.kpiValueMoney, { color: colors.text }]}>
                    {summaryQuery.isLoading
                      ? '...'
                      : formatCurrency(summaryQuery.data?.totalInventoryValue)}
                  </Text>
                </View>
              ) : null}

              {(isTechAdmin || canViewOrders) ? (
                <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.infoLight }]}>
                    <ShoppingCart size={16} color={colors.info} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                    {isTechAdmin ? 'Nilai Pesanan (:5083)' : 'Total Pesanan'}
                  </Text>
                  <Text numberOfLines={1} style={[styles.kpiValueMoney, { color: colors.text }]}>
                    {orderStatsQuery.isLoading
                      ? '...'
                      : formatCurrency(orderStatsQuery.data?.totalRevenue)}
                  </Text>
                </View>
              ) : null}

              {(isTechAdmin || canViewWorkflow) ? (
                <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.warningLight }]}>
                    <GitBranch size={16} color={colors.warning} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                    {isTechAdmin ? 'Workflow Review (:5084)' : 'Pengajuan Aktif'}
                  </Text>
                  <Text style={[styles.kpiValue, { color: colors.text }]}>
                    {workflowStatsQuery.isLoading
                      ? '...'
                      : `${workflowStatsQuery.data?.inReviewRequests ?? 0} / ${workflowStatsQuery.data?.totalRequests ?? 0}`}
                  </Text>
                </View>
              ) : null}

              {isTechAdmin ? (
                <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.successLight }]}>
                    <Users size={16} color={colors.success} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                    Users &amp; Roles (:5081)
                  </Text>
                  <Text style={[styles.kpiValue, { color: colors.text }]}>
                    {summaryQuery.isLoading
                      ? '...'
                      : `${summaryQuery.data?.activeUsers ?? 0} / ${summaryQuery.data?.totalRoles ?? 0}R`}
                  </Text>
                </View>
              ) : null}

              {(isTechAdmin || canViewAnnouncements) ? (
                <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.dangerLight }]}>
                    <Megaphone size={16} color={colors.danger} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                    {isTechAdmin ? 'Newsroom (:5085)' : 'Pengumuman HR'}
                  </Text>
                  <Text style={[styles.kpiValue, { color: colors.text }]}>
                    {announcementStatsQuery.isLoading
                      ? '...'
                      : `${announcementStatsQuery.data?.publishedAnnouncements ?? 0} Berita`}
                  </Text>
                </View>
              ) : null}

              {(isTechAdmin || canViewLookups) ? (
                <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: colors.primaryLight }]}>
                    <Layers size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                    {isTechAdmin ? 'Master Lookups (:5086)' : 'Master Lookups'}
                  </Text>
                  <Text style={[styles.kpiValue, { color: colors.text }]}>
                    {masterDataStatsQuery.isLoading
                      ? '...'
                      : `${masterDataStatsQuery.data?.totalGroups ?? 0}G / ${masterDataStatsQuery.data?.activeItems ?? 0}`}
                  </Text>
                </View>
              ) : null}

              {(isTechAdmin || canViewTracking) ? (
                <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: '#E0F2FE' }]}>
                    <MapPin size={16} color="#0284C7" />
                  </View>
                  <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                    {isTechAdmin ? 'Live Tracking (:5087)' : 'Live Tracking'}
                  </Text>
                  <Text style={[styles.kpiValue, { color: colors.text }]}>
                    {trackingStatsQuery.isLoading
                      ? '...'
                      : canDispatchTracking || isTechAdmin
                        ? `${trackingStatsQuery.data?.activeInTransit ?? 0} Aktif / ${trackingStatsQuery.data?.totalAssignments ?? 0}`
                        : `${(myTrackingsQuery.data ?? []).length} Tugas`}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Role Distribution (khusus Admin / Tech) */}
            {isTechAdmin && summaryQuery.data?.roleDistribution?.length ? (
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

            {/* Recent Activities (khusus Admin / Tech) */}
            {isTechAdmin ? (
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
            ) : null}
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
  shortcutScroll: {
    gap: 10,
    paddingRight: 4,
  },
  shortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 13,
    minWidth: 140,
  },
  shortcutIcon: {
    width: 34,
    height: 34,
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
    gap: 10,
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
  topologyHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
  gatewayHub: {
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 13,
  },
  gatewayTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  gatewaySub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  nodeLeft: { flex: 1, gap: 2 },
  nodeTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nodeName: { fontSize: 13, fontWeight: '700' },
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
  trunkStemWrap: {
    paddingLeft: 18,
    marginVertical: -6,
  },
  trunkStem: {
    width: 2,
    height: 12,
  },
  branchRail: {
    marginLeft: 18,
    borderLeftWidth: 2,
    gap: 8,
    paddingTop: 2,
    paddingBottom: 2,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  branchTick: {
    width: 12,
    height: 2,
  },
  clusterNodeItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    gap: 6,
  },
  clusterNodeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  nodeRightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  portTag: { fontSize: 11, fontWeight: '600' },
  nodeStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  nodeStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  nodeCapability: {
    fontSize: 11,
  },
  isolatedDbPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  isolatedDbText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '600',
  },
  isolatedDbTag: {
    color: '#5EEAD4',
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: 'rgba(20, 184, 166, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  sharedKernelCard: {
    backgroundColor: '#0F172A',
    borderRadius: radius.lg,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 2,
  },
  sharedKernelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sharedKernelTitle: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sharedKernelTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sharedKernelChip: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  sharedKernelChipText: {
    color: '#5EEAD4',
    fontSize: 10,
    fontWeight: '600',
  },
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
  kpiValue: { fontSize: 17, fontWeight: '800' },
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
