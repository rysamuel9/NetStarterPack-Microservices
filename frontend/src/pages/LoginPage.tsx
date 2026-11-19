import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Lock, User, ArrowRight, Terminal, AlertCircle, Network, Database } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';

interface DemoAccount {
  username: string;
  roleLabel: string;
  badgeClass: string;
  description: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'superadmin',
    roleLabel: 'SuperAdmin',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    description: 'God-mode lintas microservice: akses penuh Identity, Catalog, Order, Role, & Event Stream',
  },
  {
    username: 'admin',
    roleLabel: 'Admin',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    description: 'Kelola user, CRUD penuh di Catalog.Api (:5082) & Order.Api (:5083), serta pantau audit log',
  },
  {
    username: 'manager',
    roleLabel: 'Manager (Dummy)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    description: 'Lihat user, kelola katalog & pesanan, serta ekspor laporan analitik CSV',
  },
  {
    username: 'staff',
    roleLabel: 'Staff (Dummy)',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: 'Operasional harian: tambah & ubah item di Catalog.Api dan pesanan di Order.Api',
  },
  {
    username: 'viewer',
    roleLabel: 'Viewer (Dummy)',
    badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    description: 'Mode baca saja (read-only) untuk melihat dashboard, katalog, dan pesanan',
  },
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [usernameOrEmail, setUsernameOrEmail] = useState('superadmin');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(usernameOrEmail, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal login ke Identity.Api, cek lagi username/password-nya ya.'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoUsername: string) => {
    setUsernameOrEmail(demoUsername);
    setPassword('Password123!');
    setError(null);
    setLoading(true);
    try {
      await login(demoUsername, 'Password123!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal login pakai akun dummy.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      <div className="lg:w-7/12 p-8 lg:p-12 flex flex-col justify-between bg-gradient-to-br from-slate-950 via-teal-950/30 to-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="inline-flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/25">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white">NetStarterPack Microservices</h1>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  YARP + COMPACT ONION
                </span>
              </div>
              <p className="text-xs text-cyan-400">.NET 10 LTS • Database-per-Service • Zero-Trust JWT</p>
            </div>
          </div>

          <h2 className="text-2xl lg:text-3xl font-bold text-white leading-snug mb-2.5">
            Starter Pack Microservices Modern + Compact Onion Architecture
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed max-w-2xl mb-5">
            Setiap microservice punya database terpisah dan struktur Onion sendiri, disatukan lewat
            pintu <strong>YARP API Gateway (:5080)</strong> dan shared kernel <code>BuildingBlocks</code>.
            Waktu tekan <code>F5</code>, semua service langsung nyala bareng secara otomatis.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5 max-w-2xl text-xs">
            <div className="p-3 rounded-xl bg-slate-900/90 border border-teal-500/30">
              <div className="flex items-center gap-1.5 text-teal-400 font-bold">
                <Network className="w-3.5 h-3.5" />
                <span>Gateway.Api</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">Port :5080 (YARP)</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <Database className="w-3.5 h-3.5" />
                <span>Identity.Api</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">:5081 • IdentityDb</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Database className="w-3.5 h-3.5" />
                <span>Catalog.Api</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">:5082 • CatalogDb</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                <Database className="w-3.5 h-3.5" />
                <span>Order.Api</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">:5083 • OrderDb</p>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-400 mb-2.5">
              <Terminal className="w-4 h-4" />
              <span>Quick Login 5 Role Bawaan Seeder (Klik buat langsung tes JWT Claims lintas service)</span>
            </div>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickLogin(acc.username)}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-teal-500/40 transition-all flex items-center justify-between gap-4 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${acc.badgeClass}`}
                      >
                        {acc.roleLabel}
                      </span>
                      <code className="text-xs text-slate-300 font-mono">{acc.username}</code>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">{acc.description}</p>
                  </div>
                  <span className="text-xs font-semibold text-teal-400 shrink-0 flex items-center gap-1">
                    Masuk <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <span>Pintu dokumentasi gabungan seluruh microservice:</span>
          <div className="flex items-center gap-4">
            <a
              href="http://localhost:5080/swagger"
              target="_blank"
              rel="noreferrer"
              className="text-teal-400 hover:underline font-semibold"
            >
              Unified Swagger (:5080/swagger) &rarr;
            </a>
            <a
              href="http://localhost:5080/scalar/v1"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:underline font-semibold"
            >
              Unified Scalar (:5080/scalar/v1) &rarr;
            </a>
          </div>
        </div>
      </div>

      <div className="lg:w-5/12 p-8 lg:p-14 flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/30 mb-2">
              POST /api/auth/login &rarr; Identity.Api (:5081)
            </span>
            <h3 className="text-xl font-bold text-white">Autentikasi Cluster</h3>
            <p className="text-xs text-slate-400 mt-1">
              Token JWT yang diterbitkan berlaku Zero-Trust di seluruh microservice.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Username atau Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="superadmin"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20"
            >
              {loading ? (
                <span>Meminta token JWT ke Identity.Api...</span>
              ) : (
                <>
                  <span>Masuk ke Aplikasi</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400">
            Password default semua akun seeder: <code className="text-teal-300 font-mono">Password123!</code>
          </div>
        </div>
      </div>
    </div>
  );
};
