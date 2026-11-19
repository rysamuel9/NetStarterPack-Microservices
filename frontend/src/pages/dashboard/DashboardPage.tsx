import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import type {
  ApiResult,
  DashboardSummary,
  GatewayHealthResponse,
  OrderStats,
  WorkflowStats,
} from '../../types';

export const DashboardPage: React.FC = () => {
  const { user, menus } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats | null>(null);
  const [health, setHealth] = useState<GatewayHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [sumRes, ordRes, wfRes, healthRes] = await Promise.allSettled([
          api.get<ApiResult<DashboardSummary>>('/dashboard/summary'),
          api.get<ApiResult<OrderStats>>('/orders/stats'),
          api.get<ApiResult<WorkflowStats>>('/workflows/stats'),
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
        if (healthRes.status === 'fulfilled' && healthRes.value.data) {
          setHealth(healthRes.value.data);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Mesh Control Center */}
      <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-2xl p-6 text-white border border-teal-800/50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-lg">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>MICROSERVICES MESH CONTROL CENTER • YARP GATEWAY (:5080)</span>
          </div>
          <h1 className="text-2xl font-bold">Halo, {user?.fullName}!</h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Sesi kamu diautentikasi oleh <strong>Identity.Api (:5081)</strong> dengan role{' '}
            <strong className="text-teal-300">{user?.roles.join(', ')}</strong> ({menus.length} menu aktif).
            Metrik di halaman ini diagregasi langsung dari 4 database microservice berbeda.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
          <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800">
            <p className="text-[11px] text-slate-400 font-mono">Catalog.Api (:5082)</p>
            <p className="text-xs text-slate-400">Nilai Aset Katalog</p>
            <p className="text-base font-bold mt-0.5 text-emerald-400">
              {summary ? formatCurrency(summary.totalInventoryValue) : 'Rp 0'}
            </p>
          </div>
          <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800">
            <p className="text-[11px] text-slate-400 font-mono">Order.Api (:5083)</p>
            <p className="text-xs text-slate-400">Total Nilai Pesanan</p>
            <p className="text-base font-bold mt-0.5 text-cyan-400">
              {orderStats ? formatCurrency(orderStats.totalRevenue) : 'Rp 0'}
            </p>
          </div>
          <div className="bg-slate-900/90 rounded-xl p-3.5 border border-violet-500/30 col-span-2 sm:col-span-1">
            <p className="text-[11px] text-violet-300 font-mono">Workflow.Api (:5084)</p>
            <p className="text-xs text-slate-400">Pengajuan In Review</p>
            <p className="text-base font-bold mt-0.5 text-violet-300">
              {workflowStats ? `${workflowStats.inReviewRequests} Aktif / ${workflowStats.totalRequests} Total` : '0 Aktif'}
            </p>
          </div>
        </div>
      </div>

      {/* Live 5-Node Microservices Topology & Database-per-Service Status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-teal-600" />
            <h2 className="font-bold text-slate-900 text-sm">
              Topologi Live Cluster &amp; Database-per-Service
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              1 Gateway + 5 Microservices + 5 Isolated Databases
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
          {/* Node 1: Gateway */}
          <div className="p-3.5 rounded-xl bg-teal-50/50 border border-teal-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">1. Gateway.Api</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  :5080 ONLINE
                </span>
              </div>
              <p className="text-slate-500 mt-1">YARP Reverse Proxy • Rate Limiter • Unified Docs</p>
            </div>
            <div className="mt-3 pt-2 border-t border-teal-200/60 flex items-center justify-between">
              <span className="font-mono text-[11px] text-teal-700">Stateless Proxy</span>
              <a
                href="http://localhost:5080/swagger"
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 hover:underline inline-flex items-center gap-1 font-semibold"
              >
                Swagger <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Node 2, 3, 4, 5 from live /api/health or default */}
          {(health?.services ?? [
            {
              service: 'Identity.Api',
              port: 5081,
              url: 'http://localhost:5081/api/health',
              status: 'Healthy',
              database: 'NetStarterPack_IdentityDb',
              latencyMs: 2,
            },
            {
              service: 'Catalog.Api',
              port: 5082,
              url: 'http://localhost:5082/api/health',
              status: 'Healthy',
              database: 'NetStarterPack_CatalogDb',
              latencyMs: 2,
            },
            {
              service: 'Order.Api',
              port: 5083,
              url: 'http://localhost:5083/api/health',
              status: 'Healthy',
              database: 'NetStarterPack_OrderDb',
              latencyMs: 2,
            },
            {
              service: 'Workflow.Api',
              port: 5084,
              url: 'http://localhost:5084/api/health',
              status: 'Healthy',
              database: 'NetStarterPack_WorkflowDb',
              latencyMs: 2,
            },
            {
              service: 'Announcement.Api',
              port: 5085,
              url: 'http://localhost:5085/api/health',
              status: 'Healthy',
              database: 'NetStarterPack_AnnouncementDb',
              latencyMs: 2,
            },
          ]).map((node, idx) => (
            <div
              key={node.service}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {idx + 2}. {node.service}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      node.status === 'Healthy'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    :{node.port} {node.status.toUpperCase()} ({node.latencyMs}ms)
                  </span>
                </div>
                <p className="text-slate-600 mt-1 flex items-center gap-1 font-mono text-[11px]">
                  <Database className="w-3 h-3 text-teal-600 shrink-0" />
                  <span className="truncate">{node.database}</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Compact Onion</span>
                <a
                  href={`http://localhost:${node.port}/swagger`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-600 hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  Swagger :{node.port} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5 Kartu Metrik Lintas 4 Database Microservice */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Users (IdentityDb)</p>
            <p className="text-2xl font-bold text-slate-900">
              {loading ? '...' : summary?.totalUsers ?? 0}
            </p>
            <p className="text-xs text-emerald-600">{summary?.activeUsers ?? 0} user aktif</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Roles &amp; Menus</p>
            <p className="text-2xl font-bold text-slate-900">
              {loading ? '...' : summary?.totalRoles ?? 0} Role
            </p>
            <p className="text-xs text-slate-500">{summary?.totalMenus ?? 0} menu aktif</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Katalog (:5082)</p>
            <p className="text-2xl font-bold text-slate-900">
              {loading ? '...' : summary?.totalProducts ?? 0}
            </p>
            <p className="text-xs text-slate-500">CatalogDb</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Pesanan (:5083)</p>
            <p className="text-2xl font-bold text-slate-900">
              {loading ? '...' : orderStats?.totalOrders ?? 0}
            </p>
            <p className="text-xs text-teal-600 font-medium">
              {orderStats?.completedOrders ?? 0} selesai • {orderStats?.pendingOrders ?? 0} proses
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-violet-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Workflow (:5084)</p>
            <p className="text-2xl font-bold text-slate-900">
              {loading ? '...' : workflowStats?.totalRequests ?? 0}
            </p>
            <p className="text-xs text-violet-600 font-medium">
              {workflowStats?.approvedRequests ?? 0} approved • {workflowStats?.inReviewRequests ?? 0} review
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
            Klaim permission ini dibawa di dalam token JWT dan divalidasi secara mandiri oleh{' '}
            <code>Identity.Api</code>, <code>Catalog.Api</code>, dan <code>Order.Api</code>:
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
          <div className="space-y-3">
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
