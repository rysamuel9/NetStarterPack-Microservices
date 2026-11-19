import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AVAILABLE_ICON_NAMES, DynamicIcon } from '../components/DynamicIcon';
import type { ApiResult, MenuItem, PermissionItem, RoleItem } from '../types';

export const MenusPage: React.FC = () => {
  const { hasPermission, refreshUserAndMenus } = useAuth();
  const canManage = hasPermission('Menus.Manage');

  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({
    code: '',
    title: '',
    path: '/',
    icon: 'LayoutDashboard',
    groupName: 'MAIN',
    sortOrder: 10,
    requiredPermission: '',
    isVisible: true,
    description: '',
    roleIds: [] as string[],
  });

  const loadData = async () => {
    if (menus.length === 0) setLoading(true);
    try {
      const [menusRes, rolesRes, permsRes] = await Promise.all([
        api.get<ApiResult<MenuItem[]>>('/menus'),
        api.get<ApiResult<RoleItem[]>>('/roles'),
        api.get<ApiResult<PermissionItem[]>>('/roles/permissions'),
      ]);
      if (menusRes.data.succeeded && menusRes.data.data) setMenus(menusRes.data.data);
      if (rolesRes.data.succeeded && rolesRes.data.data) setRoles(rolesRes.data.data);
      if (permsRes.data.succeeded && permsRes.data.data) setPermissions(permsRes.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditing(null);
    setForm({
      code: '',
      title: '',
      path: '/new-module',
      icon: 'Folder',
      groupName: 'OPERATIONAL',
      sortOrder: menus.length + 1,
      requiredPermission: '',
      isVisible: true,
      description: '',
      roleIds: roles.map((r) => r.id),
    });
    setModalOpen(true);
  };

  const openEditModal = (m: MenuItem) => {
    setEditing(m);
    setForm({
      code: m.code,
      title: m.title,
      path: m.path,
      icon: m.icon,
      groupName: m.groupName,
      sortOrder: m.sortOrder,
      requiredPermission: m.requiredPermission || '',
      isVisible: m.isVisible,
      description: m.description || '',
      roleIds: m.assignedRoleIds,
    });
    setModalOpen(true);
  };

  const toggleRoleId = (roleId: string) => {
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/menus/${editing.id}`, form);
      } else {
        await api.post('/menus', form);
      }
      setModalOpen(false);
      await loadData();
      await refreshUserAndMenus();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDelete = async (m: MenuItem) => {
    if (!window.confirm(`Hapus menu "${m.title}" (${m.path})?`)) return;
    try {
      await api.delete(`/menus/${m.id}`);
      await loadData();
      await refreshUserAndMenus();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pengaturan Menu Sidebar</h1>
          <p className="text-sm text-slate-500">
            Menu di sidebar kiri diambil dari tabel database. Kalau nanti kamu bikin halaman baru,
            tinggal daftarin path-nya di sini dan pilih role mana aja yang boleh lihat.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Menu</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <th className="py-3.5 px-4">Urutan & Menu</th>
                <th className="py-3.5 px-4">Grup</th>
                <th className="py-3.5 px-4">Route Path</th>
                <th className="py-3.5 px-4">Permission Wajib</th>
                <th className="py-3.5 px-4">Role yang Diizinkan</th>
                <th className="py-3.5 px-4">Visibilitas</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Memuat konfigurasi menu...
                  </td>
                </tr>
              ) : (
                menus.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                          {m.sortOrder}
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <DynamicIcon name={m.icon} className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{m.title}</p>
                          <p className="text-xs text-slate-500">{m.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                        {m.groupName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-indigo-600">{m.path}</td>
                    <td className="py-3.5 px-4">
                      {m.requiredPermission ? (
                        <code className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-xs">
                          {m.requiredPermission}
                        </code>
                      ) : (
                        <span className="text-xs text-slate-400">Semua user login</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {m.assignedRoles.map((r) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {m.isVisible ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <Eye className="w-3.5 h-3.5" /> Tampil
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                          <EyeOff className="w-3.5 h-3.5" /> Tersembunyi
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {canManage && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(m)}
                            className="p-2 rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(m)}
                            className="p-2 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editing ? 'Ubah Konfigurasi Menu' : 'Tambah Menu Navigasi Baru'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Judul Menu
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Path URL Frontend
                  </label>
                  <input
                    type="text"
                    required
                    value={form.path}
                    onChange={(e) => setForm({ ...form, path: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Grup Sidebar
                  </label>
                  <select
                    value={form.groupName}
                    onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="MAIN">MAIN</option>
                    <option value="OPERATIONAL">OPERATIONAL</option>
                    <option value="ADMINISTRATION">ADMINISTRATION</option>
                    <option value="SYSTEM">SYSTEM</option>
                    <option value="ACCOUNT">ACCOUNT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ikon</label>
                  <select
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {AVAILABLE_ICON_NAMES.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Urutan</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Permission Wajib (Opsional)
                </label>
                <select
                  value={form.requiredPermission}
                  onChange={(e) => setForm({ ...form, requiredPermission: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="">-- Tidak Ada (Semua yang diberi akses role) --</option>
                  {permissions.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Deskripsi</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Tampilkan Menu Ini untuk Role:
                </label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => {
                    const checked = form.roleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRoleId(r.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                          checked
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {r.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="menuVisible"
                  checked={form.isVisible}
                  onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="menuVisible" className="text-sm text-slate-700">
                  Tampilkan di Sidebar Navigasi
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                >
                  Simpan Menu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
