import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  Package,
  ShoppingCart,
  GitBranch,
  CheckCircle2,
  Clock,
  KeyRound,
  Network,
  Database,
  ExternalLink,
  Radio,
  Megaphone,
  Layers,
  RefreshCw,
  Server,
  Monitor,
  Smartphone,
  Cpu,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import type {
  AnnouncementStats,
  ApiResult,
  DashboardSummary,
  GatewayHealthResponse,
  MasterDataStats,
  OrderStats,
  ServiceNodeHealth,
  WorkflowStats,
} from '../../types';

const DEFAULT_CLUSTER_NODES: ServiceNodeHealth[] = [
  {
    service: 'Identity.Api',
    port: 5081,
    url: 'http://localhost:5081/api/v1/health',
    status: 'Healthy',
    database: 'NetStarterPack_IdentityDb',
    latencyMs: 2,
  },
  {
    service: 'Catalog.Api',
    port: 5082,
    url: 'http://localhost:5082/api/v1/health',
    status: 'Healthy',
    database: 'NetStarterPack_CatalogDb',
    latencyMs: 2,
  },
  {
    service: 'Order.Api',
    port: 5083,
    url: 'http://localhost:5083/api/v1/health',
    status: 'Healthy',
    database: 'NetStarterPack_OrderDb',
    latencyMs: 2,
  },
  {
    service: 'Workflow.Api',
    port: 5084,
    url: 'http://localhost:5084/api/v1/health',
    status: 'Healthy',
    database: 'NetStarterPack_WorkflowDb',
    latencyMs: 2,
  },
  {
    service: 'Announcement.Api',
    port: 5085,
    url: 'http://localhost:5085/api/v1/health',
    status: 'Healthy',
    database: 'NetStarterPack_AnnouncementDb',
    latencyMs: 2,
  },
  {
    service: 'MasterData.Api',
    port: 5086,
    url: 'http://localhost:5086/api/v1/health',
    status: 'Healthy',
    database: 'NetStarterPack_MasterDataDb',
    latencyMs: 2,
  },
  {
    service: 'Tracking.Api',
    port: 5087,
    url: 'http://localhost:5087/api/v1/health',
    status: 'Healthy',
    database: 'NetStarterPack_TrackingDb',
    latencyMs: 2,
  },
];

interface ServiceTopologyMeta {
  label: string;
  route: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  tags: string[];
  icon: React.ComponentType<{ className?: string }>;
}

const SERVICE_META: Record<string, ServiceTopologyMeta> = {
  'Identity.Api': {
    label: 'Auth, RBAC, Org & Audit',
    route: '/users',
    accentBg: 'bg-cyan-50',
    accentText: 'text-cyan-700',
    accentBorder: 'border-cyan-200',
    tags: ['Zero-Trust JWT', 'RBAC', 'Audit Hub'],
    icon: ShieldCheck,
  },
  'Catalog.Api': {
    label: 'Manajemen Katalog Produk',
    route: '/products',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-700',
    accentBorder: 'border-emerald-200',
    tags: ['CRUD', 'Cache L1/L2', 'Idempotent'],
    icon: Package,
  },
  'Order.Api': {
    label: 'Transaksi & Pesanan',
    route: '/orders',
    accentBg: 'bg-amber-50',
    accentText: 'text-amber-700',
    accentBorder: 'border-amber-200',
    tags: ['Orders', 'Idempotent', 'Audit Event'],
    icon: ShoppingCart,
  },
  'Workflow.Api': {
    label: 'Dynamic Form & Approval',
    route: '/workflow-tracking',
    accentBg: 'bg-violet-50',
    accentText: 'text-violet-700',
    accentBorder: 'border-violet-200',
    tags: ['JSON Schema', 'Multi-Level', 'Idempotent'],
    icon: GitBranch,
  },
  'Announcement.Api': {
    label: 'HR Newsroom & Realtime',
    route: '/announcements',
    accentBg: 'bg-rose-50',
    accentText: 'text-rose-700',
    accentBorder: 'border-rose-200',
    tags: ['SignalR Hub', 'Media Upload', 'Comments'],
    icon: Megaphone,
  },
  'MasterData.Api': {
    label: 'Unified Lookup & Referensi',
    route: '/lookups',
    accentBg: 'bg-teal-50',
    accentText: 'text-teal-700',
    accentBorder: 'border-teal-200',
    tags: ['1-Table Lookup', 'Cascading', 'Cache L1/L2'],
    icon: Layers,
  },
  'Tracking.Api': {
    label: 'Field Dispatch & Live GPS',
    route: '/tracking',
    accentBg: 'bg-sky-50',
    accentText: 'text-sky-700',
    accentBorder: 'border-sky-200',
    tags: ['SignalR GPS', 'Haversine', 'Anti-Fraud'],
    icon: MapPin,
  },
};

const SHARED_KERNEL_PILLS = [
  'Zero-Trust JWT & [HasPermission]',
  'Hybrid Cache L1/L2 (Redis)',
  'IdempotencyMiddleware',
  'Polly v8 Retry + Circuit Breaker',
  'API Versioning (/api/v1)',
  'X-Correlation-Id Tracing',
];

export const DashboardPage: React.FC = () => {
  const { user, menus } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats | null>(null);
  const [announcementStats, setAnnouncementStats] = useState<AnnouncementStats | null>(null);
  const [masterDataStats, setMasterDataStats] = useState<MasterDataStats | null>(null);
  const [health, setHealth] = useState<GatewayHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingHealth, setRefreshingHealth] = useState(false);

  const loadDashboard = useCallback(async (onlyHealth = false) => {
    if (onlyHealth) {
      setRefreshingHealth(true);
    }
    try {
      if (onlyHealth) {
        const healthRes = await api.get<GatewayHealthResponse>('/health');
        if (healthRes.data) setHealth(healthRes.data);
        return;
      }

      const [sumRes, ordRes, wfRes, annRes, mdRes, healthRes] = await Promise.allSettled([
        api.get<ApiResult<DashboardSummary>>('/dashboard/summary'),
        api.get<ApiResult<OrderStats>>('/orders/stats'),
        api.get<ApiResult<WorkflowStats>>('/workflows/stats'),
        api.get<ApiResult<AnnouncementStats>>('/announcements/stats'),
        api.get<ApiResult<MasterDataStats>>('/lookups/stats'),
        api.get<GatewayHealthResponse>('/health'),
      ]);

      if (sumRes.status === 'fulfilled' && sumRes.value.data.succeeded && sumRes.value.data.data) {
        setSummary(sumRes.value.data.data);
      }
      if (ordRes.status === 'fulfilled' && ordRes.value.data.succeeded && ordRes.value.data.data) {
        setOrderStats(ordRes.value.data.data);
      }
      if (wfRes.status === 'fulfilled' && wfRes.value.data.succeeded && wfRes.value.data.data) {
        setWorkflowStats(wfRes.value.data.data);
      }
      if (annRes.status === 'fulfilled' && annRes.value.data.succeeded && annRes.value.data.data) {
        setAnnouncementStats(annRes.value.data.data);
      }
      if (mdRes.status === 'fulfilled' && mdRes.value.data.succeeded && mdRes.value.data.data) {
        setMasterDataStats(mdRes.value.data.data);
      }
      if (healthRes.status === 'fulfilled' && healthRes.value.data) {
        setHealth(healthRes.value.data);
      }
    } finally {
      setLoading(false);
      setRefreshingHealth(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  const clusterNodes = health?.services?.length ? health.services : DEFAULT_CLUSTER_NODES;
  const healthyCount = clusterNodes.filter((n) => n.status.toLowerCase() === 'healthy').length;
  const totalServices = clusterNodes.length;
  const avgLatencyMs =
    clusterNodes.length > 0
      ? Math.round(clusterNodes.reduce((acc, n) => acc + (n.latencyMs || 0), 0) / clusterNodes.length)
      : 0;

  const getServiceMetricSnippet = (serviceName: string): string => {
    switch (serviceName) {
      case 'Identity.Api':
        return `${summary?.activeUsers ?? 0} user aktif • ${summary?.totalRoles ?? 0} role`;
      case 'Catalog.Api':
        return `${summary?.totalProducts ?? 0} produk • ${formatCurrency(summary?.totalInventoryValue ?? 0)}`;
      case 'Order.Api':
        return `${orderStats?.totalOrders ?? 0} pesanan • ${orderStats?.completedOrders ?? 0} selesai`;
      case 'Workflow.Api':
        return `${workflowStats?.inReviewRequests ?? 0} review • ${workflowStats?.approvedRequests ?? 0} approved`;
      case 'Announcement.Api':
        return `${announcementStats?.publishedAnnouncements ?? 0} pengumuman • ${announcementStats?.totalComments ?? 0} komentar`;
      case 'MasterData.Api':
        return `${masterDataStats?.totalGroups ?? 0} grup • ${masterDataStats?.activeItems ?? 0} lookup aktif`;
      default:
        return 'Compact Onion Service';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Mesh Control Center */}
      <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-2xl p-6 text-white border border-teal-800/50 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5 shadow-lg">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>MICROSERVICES MESH CONTROL CENTER • YARP GATEWAY (:5080) • API V1</span>
          </div>
          <h1 className="text-2xl font-bold">Halo, {user?.fullName}!</h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Sesi diautentikasi oleh <strong>Identity.Api (:5081)</strong> dengan role{' '}
            <strong className="text-teal-300">{user?.roles.join(', ')}</strong> ({menus.length} menu aktif).
            Metrik dan status kesehatan di bawah diagregasi langsung dari{' '}
            <strong>{totalServices} microservice</strong> dan{' '}
            <strong>{totalServices} isolated database</strong>.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800">
            <p className="text-[11px] text-emerald-300 font-mono">Catalog (:5082)</p>
            <p className="text-[11px] text-slate-400">Nilai Katalog</p>
            <p className="text-sm font-bold mt-0.5 text-emerald-400">
              {summary ? formatCurrency(summary.totalInventoryValue) : 'Rp 0'}
            </p>
          </div>
          <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800">
            <p className="text-[11px] text-amber-300 font-mono">Order (:5083)</p>
            <p className="text-[11px] text-slate-400">Nilai Pesanan</p>
            <p className="text-sm font-bold mt-0.5 text-amber-300">
              {orderStats ? formatCurrency(orderStats.totalRevenue) : 'Rp 0'}
            </p>
          </div>
          <div className="bg-slate-900/90 rounded-xl p-3 border border-violet-500/30">
            <p className="text-[11px] text-violet-300 font-mono">Workflow (:5084)</p>
            <p className="text-[11px] text-slate-400">In Review</p>
            <p className="text-sm font-bold mt-0.5 text-violet-300">
              {workflowStats ? `${workflowStats.inReviewRequests} / ${workflowStats.totalRequests}` : '0 / 0'}
            </p>
          </div>
          <div className="bg-slate-900/90 rounded-xl p-3 border border-teal-500/30">
            <p className="text-[11px] text-teal-300 font-mono">MasterData (:5086)</p>
            <p className="text-[11px] text-slate-400">Unified Lookups</p>
            <p className="text-sm font-bold mt-0.5 text-teal-300">
              {masterDataStats ? `${masterDataStats.totalGroups} Grup / ${masterDataStats.activeItems} Aktif` : '0 Grup'}
            </p>
          </div>
        </div>
      </div>

      {/* Visual Architecture Topology Map (3-Tier Mesh Canvas) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Topology Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">
                Topologi Live Cluster &amp; Database-per-Service
              </h2>
              <p className="text-xs text-slate-500">
                Visualisasi alur trafik dari Client → YARP API Gateway → {totalServices} Microservices → {totalServices} Isolated SQL Databases
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {healthyCount}/{totalServices} Service Healthy
            </span>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Avg {avgLatencyMs}ms
            </span>
            <button
              type="button"
              onClick={() => loadDashboard(true)}
              disabled={refreshingHealth}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${refreshingHealth ? 'animate-spin' : ''}`} />
              <span>Cek Ulang</span>
            </button>
          </div>
        </div>

        {/* Blueprint Dot-Grid Topology Canvas */}
        <div
          className="p-5 sm:p-6 bg-slate-50/60"
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {/* TIER 1: Client Channels -> YARP Gateway Hub */}
          <div className="flex flex-col items-center">
            {/* Client Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs">
                <Monitor className="w-3.5 h-3.5 text-teal-600" />
                Web React 19 (:5173)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs">
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                Mobile Expo SDK 58
              </span>
            </div>

            {/* Connector: Clients -> Gateway */}
            <div className="w-0.5 h-4 bg-gradient-to-b from-slate-300 to-teal-500" />

            {/* Gateway.Api Hub Node */}
            <div className="w-full max-w-2xl rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-4 border border-teal-500/40 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center shrink-0">
                    <Server className="w-5 h-5 text-teal-300" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm">Gateway.Api</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold">
                        :5080 ONLINE
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-teal-200">
                        Stateless YARP Proxy
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Single Entry Point • Route <code>/api/v1/*</code> &amp; <code>/hubs/*</code> • Rate Limit 300 req/m • Polly v8 Aggregator
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="http://localhost:5080/swagger"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition"
                  >
                    <span>Unified Swagger</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="http://localhost:5080/scalar/v1"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition"
                  >
                    <span>Scalar</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Connector Trunk: Gateway -> Distribution Bus -> 6 Microservices */}
            <div className="w-0.5 h-5 bg-teal-500/70" />
            <div className="hidden md:block w-4/5 h-0.5 bg-gradient-to-r from-transparent via-teal-400/70 to-transparent" />
          </div>

          {/* TIER 2: 6 Microservice Nodes + Attached Isolated Database Cylinders */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
            {clusterNodes.map((node) => {
              const isHealthy = node.status.toLowerCase() === 'healthy';
              const meta = SERVICE_META[node.service] ?? {
                label: 'Compact Onion Microservice',
                route: '/dashboard',
                accentBg: 'bg-slate-100',
                accentText: 'text-slate-700',
                accentBorder: 'border-slate-200',
                tags: ['Compact Onion', 'API v1'],
                icon: Server,
              };
              const Icon = meta.icon;

              return (
                <div key={node.service} className="flex flex-col items-center">
                  {/* Small vertical drop stem from bus */}
                  <div className="hidden md:block w-0.5 h-3 bg-teal-400/60" />

                  {/* Microservice Card */}
                  <div
                    className={`w-full rounded-2xl bg-white border p-4 shadow-2xs transition hover:shadow-md flex flex-col justify-between ${
                      isHealthy ? 'border-slate-200 hover:border-teal-300' : 'border-rose-300 bg-rose-50/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl ${meta.accentBg} ${meta.accentText} border ${meta.accentBorder} flex items-center justify-center shrink-0`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-bold text-slate-900 text-sm truncate">{node.service}</h3>
                              <span className="font-mono text-[11px] font-semibold text-slate-500">
                                :{node.port}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">{meta.label}</p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            isHealthy
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-100 text-rose-700 border border-rose-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isHealthy ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {isHealthy ? `${node.latencyMs}ms` : 'OFFLINE'}
                        </span>
                      </div>

                      {/* Live Metric Line */}
                      <p className="mt-2.5 text-xs font-medium text-slate-700 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                        {getServiceMetricSnippet(node.service)}
                      </p>

                      {/* Capability Tags */}
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {meta.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <Link
                        to={meta.route}
                        className="text-teal-700 hover:text-teal-800 font-semibold inline-flex items-center gap-1"
                      >
                        <span>Buka Modul</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                      <a
                        href={`http://localhost:${node.port}/swagger`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-500 hover:text-teal-700 inline-flex items-center gap-1 font-medium"
                      >
                        <span>Swagger</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Connector Line: Service -> Isolated Database */}
                  <div className="w-0.5 h-3 bg-slate-300" />

                  {/* Isolated Database Cylinder Pill */}
                  <div className="w-[92%] rounded-xl bg-slate-900 text-slate-100 px-3 py-2 border border-slate-700 flex items-center justify-between gap-2 shadow-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Database className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span className="font-mono text-[11px] font-semibold truncate">{node.database}</span>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 shrink-0">
                      Isolated DB
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* TIER 3: Shared Kernel BuildingBlocks Foundation */}
          <div className="mt-5 rounded-2xl bg-slate-900 text-slate-200 px-4 py-3.5 border border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Cpu className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">
                BuildingBlocks Shared Kernel
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                (dipakai bersama seluruh {totalServices} service)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SHARED_KERNEL_PILLS.map((pill) => (
                <span
                  key={pill}
                  className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-teal-300 border border-slate-700"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 6 Kartu Metrik Lintas 6 Database Microservice */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Users (:5081)</p>
            <p className="text-xl font-bold text-slate-900">
              {loading ? '...' : summary?.totalUsers ?? 0}
            </p>
            <p className="text-[11px] text-emerald-600 truncate">
              {summary?.activeUsers ?? 0} aktif • {summary?.totalRoles ?? 0} role
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Katalog (:5082)</p>
            <p className="text-xl font-bold text-slate-900">
              {loading ? '...' : summary?.totalProducts ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 truncate">CatalogDb</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Pesanan (:5083)</p>
            <p className="text-xl font-bold text-slate-900">
              {loading ? '...' : orderStats?.totalOrders ?? 0}
            </p>
            <p className="text-[11px] text-teal-600 font-medium truncate">
              {orderStats?.completedOrders ?? 0} selesai • {orderStats?.pendingOrders ?? 0} proses
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-violet-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Workflow (:5084)</p>
            <p className="text-xl font-bold text-slate-900">
              {loading ? '...' : workflowStats?.totalRequests ?? 0}
            </p>
            <p className="text-[11px] text-violet-600 font-medium truncate">
              {workflowStats?.approvedRequests ?? 0} ok • {workflowStats?.inReviewRequests ?? 0} review
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Newsroom (:5085)</p>
            <p className="text-xl font-bold text-slate-900">
              {loading ? '...' : announcementStats?.publishedAnnouncements ?? 0}
            </p>
            <p className="text-[11px] text-rose-600 font-medium truncate">
              {announcementStats?.totalLikes ?? 0} like • {announcementStats?.totalComments ?? 0} komen
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-teal-200 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Lookups (:5086)</p>
            <p className="text-xl font-bold text-slate-900">
              {loading ? '...' : masterDataStats?.totalItems ?? 0}
            </p>
            <p className="text-[11px] text-teal-700 font-medium truncate">
              {masterDataStats?.totalGroups ?? 0} grup • {masterDataStats?.activeItems ?? 0} aktif
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Klaim Permission JWT */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="w-5 h-5 text-teal-600" />
            <h2 className="font-bold text-slate-900">Zero-Trust JWT Claims</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Klaim permission ini dibawa di dalam token JWT dan divalidasi secara mandiri oleh seluruh 6 microservice (
            <code>Identity</code>, <code>Catalog</code>, <code>Order</code>, <code>Workflow</code>,{' '}
            <code>Announcement</code>, &amp; <code>MasterData</code>):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {user?.permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-50/70 text-teal-900 border border-teal-200/70"
              >
                <CheckCircle2 className="w-3 h-3 text-teal-600" />
                {perm}
              </span>
            ))}
          </div>
        </div>

        {/* Distribusi User per Role */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            <h2 className="font-bold text-slate-900">Distribusi Role (Identity.Api)</h2>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {summary?.roleDistribution.map((item) => (
              <div
                key={item.roleName}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.displayName}</p>
                  <p className="text-xs text-slate-500 font-mono">{item.roleName}</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                  {item.userCount} User
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stream Event Audit Lintas Microservice */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-teal-600" />
            <h2 className="font-bold text-slate-900">Cross-Service Event Stream</h2>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {summary?.recentActivities.map((act) => (
              <div
                key={act.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-teal-700 font-mono">{act.action}</span>
                  <span className="text-slate-400">
                    {new Date(act.timestamp).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-slate-700">{act.details}</p>
                <p className="text-slate-400">Actor: @{act.userName}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
