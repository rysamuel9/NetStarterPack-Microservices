import React, { useEffect, useState } from 'react';
import { BarChart3, Download, Activity, Search, UserCheck, KeyRound, Save } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { ApiResult, AuditLogItem, ProductItem } from '../types';

export const ReportsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('Reports.Export');
  const [products, setProducts] = useState<ProductItem[]>([]);

  useEffect(() => {
    api.get<ApiResult<ProductItem[]>>('/products').then((res) => {
      if (res.data.succeeded && res.data.data) setProducts(res.data.data);
    });
  }, []);

  const byCategory = products.reduce<Record<string, { count: number; value: number }>>(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = { count: 0, value: 0 };
      acc[item.category].count += 1;
      acc[item.category].value += item.price * item.stock;
      return acc;
    },
    {}
  );

  const exportCsv = () => {
    const header = 'SKU,Name,Category,Price,Stock,TotalValue,Status\n';
    const rows = products
      .map(
        (p) =>
          `"${p.sku}","${p.name}","${p.category}",${p.price},${p.stock},${p.price * p.stock},"${
            p.status
          }"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-katalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contoh Halaman Laporan</h1>
          <p className="text-sm text-slate-500">
            Halaman contoh buat ngetes pembatasan role. Secara default halaman ini cuma kebuka buat
            role yang punya permission <code>Reports.View</code> (SuperAdmin, Admin, Manager).
          </p>
        </div>
        {canExport && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Download CSV</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(byCategory).map(([cat, stats]) => (
          <div
            key={cat}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase">
                <BarChart3 className="w-4 h-4" />
                <span>Kategori Katalog</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">{cat}</h3>
              <p className="text-xs text-slate-500 mt-1">{stats.count} jenis produk terdaftar</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Estimasi Nilai Aset</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(stats.value)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ApiResult<AuditLogItem[]>>('/dashboard/audit-logs?limit=150')
      .then((res) => {
        if (res.data.succeeded && res.data.data) setLogs(res.data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(
    (l) =>
      l.userName.toLowerCase().includes(filter.toLowerCase()) ||
      l.action.toLowerCase().includes(filter.toLowerCase()) ||
      l.module.toLowerCase().includes(filter.toLowerCase()) ||
      l.details.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit Trail & Log Keamanan</h1>
        <p className="text-sm text-slate-500">
          Rekam jejak otomatis untuk aktivitas login, perubahan pengguna, role, menu, dan data
          bisnis.
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter berdasarkan aksi (LOGIN, CREATE_USER, UPDATE_ROLE), modul, atau username..."
          className="w-full text-sm focus:outline-none"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <th className="py-3.5 px-4">Waktu</th>
                <th className="py-3.5 px-4">Pengguna</th>
                <th className="py-3.5 px-4">Modul & Aksi</th>
                <th className="py-3.5 px-4">Detail Aktivitas</th>
                <th className="py-3.5 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    Memuat riwayat audit log...
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{log.userName}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700">
                        <Activity className="w-3 h-3" />
                        {log.module} • {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{log.details}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">
                      {log.ipAddress || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const { user, refreshUserAndMenus } = useAuth();

  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phoneNumber: user?.phoneNumber || '',
    department: user?.department || '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
  });

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.put('/auth/profile', profileForm);
      await refreshUserAndMenus();
      setMsg({ type: 'success', text: 'Profil berhasil diperbarui!' });
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/auth/change-password', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setMsg({ type: 'success', text: 'Password berhasil diperbarui!' });
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profil & Keamanan Akun</h1>
        <p className="text-sm text-slate-500">
          Kelola informasi profil Anda serta keamanan kredensial login.
        </p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-sm border ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-2xl p-6 text-white border border-teal-800/40 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-1.5">
              {user?.employeeCode || 'NO-NIK'} • PROFIL ORGANISASI
            </span>
            <h2 className="text-xl font-bold">{user?.fullName}</h2>
            <p className="text-sm text-teal-300 font-semibold mt-0.5">
              {user?.positionName || 'Posisi belum ditetapkan'}
              {user?.positionLevel ? ` (Level ${user.positionLevel})` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Direktorat</p>
              <p className="font-bold text-white mt-0.5">{user?.directorateName || '-'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Divisi</p>
              <p className="font-bold text-white mt-0.5">{user?.divisionName || '-'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Departemen</p>
              <p className="font-bold text-white mt-0.5">{user?.departmentName || user?.department || '-'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Atasan Langsung</p>
              <p className="font-bold text-amber-300 mt-0.5">{user?.managerFullName || 'Top Executive'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900">Informasi Pribadi</h2>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Username</label>
              <input
                type="text"
                disabled
                value={user?.username || ''}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input
                type="email"
                required
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  No. Telepon
                </label>
                <input
                  type="text"
                  value={profileForm.phoneNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Departemen
                </label>
                <input
                  type="text"
                  value={profileForm.department}
                  onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Perubahan Profil</span>
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900">Ganti Password</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Password Saat Ini
              </label>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Password Baru (Minimal 6 Karakter)
              </label>
              <input
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              <KeyRound className="w-4 h-4" />
              <span>Perbarui Password</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
