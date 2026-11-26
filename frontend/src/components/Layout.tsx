import React, { useEffect, useRef, useState } from 'react';
import { UserAvatar } from './UserAvatar';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Boxes,
  LogOut,
  Menu as MenuIcon,
  X,
  Shield,
  ChevronRight,
  User as UserIcon,
  ExternalLink,
  Smartphone,
  Network,
  Radio,
  Bell,
  CheckCheck,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  ensureAnnouncementHubStarted,
  getAnnouncementHubConnection,
  stopAnnouncementHub,
} from '../services/announcementHub';
import { DynamicIcon } from './DynamicIcon';
import { announcementTypeStyle } from '../utils/announcementMeta';
import { formatRelativeTime } from '../utils/formatters';
import type { AnnouncementBellResponse, AnnouncementSummaryItem, ApiResult, MenuItem } from '../types';

export const Layout: React.FC = () => {
  const { user, menus, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isTechAdmin =
    Boolean(
      user?.roles.some((r) => ['superadmin', 'admin', 'itlead'].includes(r.toLowerCase()))
    ) ||
    hasPermission('AuditLogs.View') ||
    hasPermission('Roles.View');

  const getWorkspaceLabel = (role: string) => {
    switch (role.toLowerCase()) {
      case 'manager':
        return 'Workspace Manager & Approver';
      case 'hrmanager':
      case 'hrsupervisor':
      case 'hrstaff':
        return 'Workspace HR & People Ops';
      case 'financedirector':
        return 'Workspace Finance & Budget';
      case 'staff':
        return 'Workspace Staff & Petugas Lapangan';
      case 'viewer':
        return 'Mode Audit (Read-Only)';
      default:
        return 'Workspace Operasional';
    }
  };

  // Bell Announcement Notifications state + Live SignalR Toast
  const [bellOpen, setBellOpen] = useState(false);
  const [bellData, setBellData] = useState<AnnouncementBellResponse>({ unreadCount: 0, items: [] });
  const [liveToast, setLiveToast] = useState<AnnouncementSummaryItem | null>(null);
  const bellRef = useRef<HTMLDivElement | null>(null);

  const loadBell = async () => {
    try {
      const res = await api.get<ApiResult<AnnouncementBellResponse>>('/announcements/bell');
      if (res.data.succeeded && res.data.data) {
        setBellData(res.data.data);
      }
    } catch {
      // Abaikan jika Announcement.Api sedang booting
    }
  };

  useEffect(() => {
    loadBell();
    const handler = () => loadBell();
    window.addEventListener('announcement-read-updated', handler);
    return () => window.removeEventListener('announcement-read-updated', handler);
  }, [location.pathname]);

  // Global SignalR listener: update angka Bell & tampilkan toast instan saat HR publish pengumuman baru
  useEffect(() => {
    const conn = getAnnouncementHubConnection();
    let toastTimer: number | undefined;

    const onAnnouncementPublished = (summary: AnnouncementSummaryItem) => {
      loadBell();
      if (summary.authorUsername !== user?.username) {
        setLiveToast(summary);
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => setLiveToast(null), 7000);
      }
    };

    conn.on('AnnouncementPublished', onAnnouncementPublished);
    ensureAnnouncementHubStarted();

    return () => {
      conn.off('AnnouncementPublished', onAnnouncementPublished);
      window.clearTimeout(toastTimer);
    };
  }, [user?.username]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllBellRead = async () => {
    try {
      await api.post('/announcements/mark-all-read');
      await loadBell();
    } catch {
      // ignore
    }
  };

  const handleConfirmLogout = async (allDevices = false) => {
    setLoggingOut(true);
    try {
      await stopAnnouncementHub();
      await logout(allDevices);
      setLogoutModalOpen(false);
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  const groupedMenus = menus.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const group = item.groupName || 'MAIN';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  const primaryRole = user?.roles[0] || 'User';

  const roleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'superadmin':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'admin':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'manager':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'itlead':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      case 'hrmanager':
        return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
      case 'hrsupervisor':
        return 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30';
      case 'hrstaff':
        return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
      case 'financedirector':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'staff':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 text-slate-100 flex flex-col border-r border-teal-950/60 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-teal-950/40 to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/25">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-sm tracking-tight text-white">NetStarterPack</h1>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  MESH
                </span>
              </div>
              <p className="text-[11px] text-cyan-400/90 font-medium">.NET 10 • Microservices + YARP</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 mx-3 mt-3 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center gap-3">
            <UserAvatar
              userId={user?.id}
              name={user?.fullName}
              sizeClass="w-9 h-9 text-sm"
              shapeClass="rounded-lg"
              colorClass="bg-teal-500/20 border border-teal-500/40 text-teal-300"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{user?.fullName}</p>
              <p className="text-[11px] text-slate-400 truncate">@{user?.username} • Identity.Api</p>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${roleBadgeColor(
                primaryRole
              )}`}
            >
              <Shield className="w-3 h-3" />
              {user?.roles.join(', ')}
            </span>
            <span className="text-[11px] text-teal-400 font-mono">
              {user?.permissions.length || 0} claims
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {Object.entries(groupedMenus).map(([groupName, groupItems]) => (
            <div key={groupName}>
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-teal-500/80">
                {groupName}
              </p>
              <div className="space-y-1">
                {groupItems.map((menu) => (
                  <NavLink
                    key={menu.id}
                    to={menu.path}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/25'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`
                    }
                  >
                    <div className="flex items-center gap-3">
                      <DynamicIcon name={menu.icon} className="w-4 h-4 shrink-0" />
                      <span>{menu.title}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {isTechAdmin && (
          <div className="mx-3 mb-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Active Cluster Nodes
              </span>
              <span className="text-teal-400 font-mono">7 Services</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-300 pt-1">
              <a href="http://localhost:5080/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 truncate">
                :5080 Gateway
              </a>
              <a href="http://localhost:5081/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 truncate">
                :5081 Identity
              </a>
              <a href="http://localhost:5082/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 truncate">
                :5082 Catalog
              </a>
              <a href="http://localhost:5083/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 truncate">
                :5083 Order
              </a>
              <a href="http://localhost:5084/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 truncate">
                :5084 Workflow
              </a>
              <a href="http://localhost:5085/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-teal-950/70 hover:bg-teal-900/80 border border-teal-800/70 text-teal-300 truncate">
                :5085 Announce
              </a>
              <a href="http://localhost:5086/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 truncate">
                :5086 Lookups
              </a>
              <a href="http://localhost:5087/swagger" target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-sky-950/70 hover:bg-sky-900/80 border border-sky-800/70 text-sky-300 truncate">
                :5087 Tracking
              </a>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-slate-800/80">
          <button
            onClick={() => setLogoutModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Sesi (Logout)</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            {isTechAdmin ? (
              <div className="hidden xl:flex items-center gap-2 text-xs text-teal-900 bg-teal-50 border border-teal-200/80 px-3 py-1.5 rounded-lg">
                <Network className="w-3.5 h-3.5 text-teal-600" />
                <span className="font-medium">Gateway (:5080)</span>
                <span className="text-teal-400">&rarr;</span>
                <span className="font-mono text-[11px] text-teal-700">
                  Identity (:5081) • Catalog (:5082) • Order (:5083) • Workflow (:5084) • Announce (:5085) • MasterData (:5086) • Tracking (:5087)
                </span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-700 bg-slate-100/90 border border-slate-200 px-3 py-1.5 rounded-lg">
                <Shield className="w-3.5 h-3.5 text-teal-600" />
                <span className="font-semibold text-slate-800">{getWorkspaceLabel(primaryRole)}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500">{user?.roles.join(', ')}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isTechAdmin && (
              <>
                <a
                  href="http://localhost:5080/swagger"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/70 transition-colors"
                  title="Buka Unified Gateway Swagger UI (:5080)"
                >
                  <span>Unified Swagger</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href="http://localhost:5080/scalar/v1"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 transition-colors"
                  title="Buka Unified Scalar API Docs (:5080)"
                >
                  <span>Scalar Docs</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            )}

            {/* Bell Notification Dropdown dekat Profile */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setBellOpen((o) => !o);
                  if (!bellOpen) loadBell();
                }}
                className="relative p-2 rounded-xl text-slate-600 hover:bg-teal-50 hover:text-teal-700 border border-transparent hover:border-teal-200 transition-colors"
                title="Pengumuman Terbaru"
              >
                <Bell className="w-5 h-5" />
                {bellData.unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {bellData.unreadCount > 9 ? '9+' : bellData.unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-teal-600" />
                        <span>Pengumuman Perusahaan</span>
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {bellData.unreadCount > 0
                          ? `${bellData.unreadCount} belum dibaca`
                          : 'Semua sudah dibaca • 3 terbaru'}
                      </p>
                    </div>
                    {bellData.unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllBellRead}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Tandai dibaca</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {bellData.items.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Belum ada pengumuman.
                      </div>
                    ) : (
                      bellData.items.map((ann) => {
                        const style = announcementTypeStyle(ann.type);
                        return (
                          <button
                            key={ann.id}
                            type="button"
                            onClick={() => {
                              setBellOpen(false);
                              navigate(`/announcements/${ann.id}`);
                            }}
                            className={`w-full text-left p-3.5 hover:bg-teal-50/50 transition-colors flex items-start gap-3 ${
                              !ann.isReadByMe ? 'bg-teal-50/30' : ''
                            }`}
                          >
                            {ann.bannerUrl ? (
                              <img
                                src={ann.bannerUrl}
                                alt=""
                                className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                                <Bell className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${style.badge}`}
                                >
                                  {style.label}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {formatRelativeTime(ann.publishedAt)}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-slate-900 line-clamp-2 mt-1">
                                {ann.title}
                              </p>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[11px] text-slate-500 truncate">
                                  {ann.authorFullName}
                                </span>
                                {!ann.isReadByMe && (
                                  <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setBellOpen(false);
                        navigate('/announcements');
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <span>View All Announcements</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <UserIcon className="w-4 h-4 text-teal-600" />
              <span className="hidden sm:inline font-medium">{user?.username}</span>
            </button>

            <button
              onClick={() => setLogoutModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              title="Keluar Sesi (Logout)"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Live Realtime Toast saat HR menerbitkan pengumuman baru */}
      {liveToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-slate-950 text-white rounded-2xl border border-teal-500/40 shadow-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
              Pengumuman Baru • Live
            </p>
            <p className="text-xs font-bold text-white line-clamp-2 mt-0.5">{liveToast.title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Oleh {liveToast.authorFullName}</p>
            <button
              type="button"
              onClick={() => {
                const targetId = liveToast.id;
                setLiveToast(null);
                navigate(`/announcements/${targetId}`);
              }}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-300 hover:text-teal-200"
            >
              <span>Baca Sekarang</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {logoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-rose-600">
                <LogOut className="w-5 h-5" />
                <h3 className="text-lg font-bold text-slate-900">Konfirmasi Logout</h3>
              </div>
              <button
                onClick={() => setLogoutModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mt-4">
              Kamu lagi login di cluster microservice sebagai <strong>{user?.fullName}</strong> (<code>@{user?.username}</code>).
              Mau keluar dari sesi browser ini aja, atau sekalian cabut semua sesi di perangkat lain?
            </p>

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => handleConfirmLogout(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>{loggingOut ? 'Memproses...' : 'Logout dari Browser Ini'}</span>
              </button>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() => handleConfirmLogout(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center justify-center gap-2"
              >
                <Smartphone className="w-4 h-4" />
                <span>Logout dari Semua Perangkat (Cabut Semua Refresh Token)</span>
              </button>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setLogoutModalOpen(false)}
                className="w-full py-2 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
