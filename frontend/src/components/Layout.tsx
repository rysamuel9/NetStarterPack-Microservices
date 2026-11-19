import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DynamicIcon } from './DynamicIcon';
import type { MenuItem } from '../types';

export const Layout: React.FC = () => {
  const { user, menus, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleConfirmLogout = async (allDevices = false) => {
    setLoggingOut(true);
    try {
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
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 font-bold text-sm">
              {user?.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
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

        <div className="mx-3 mb-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 font-semibold">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              Active Cluster Nodes
            </span>
            <span className="text-teal-400 font-mono">4 Services</span>
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
          </div>
        </div>

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
            <div className="hidden sm:flex items-center gap-2 text-xs text-teal-900 bg-teal-50 border border-teal-200/80 px-3 py-1.5 rounded-lg">
              <Network className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-medium">YARP Gateway (:5080)</span>
              <span className="text-teal-400">&rarr;</span>
              <span className="font-mono text-[11px] text-teal-700">Identity (:5081) • Catalog (:5082) • Order (:5083)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
