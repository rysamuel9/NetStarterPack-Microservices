import React, { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Users, Shield, X } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { ApiResult, RoleItem, UserItem } from '../types';

export const UsersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('Users.Create');
  const canEdit = hasPermission('Users.Edit');
  const canDelete = hasPermission('Users.Delete');

  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    fullName: '',
    password: 'Password123!',
    newPassword: '',
    phoneNumber: '',
    department: '',
    status: 'Active',
    roles: ['Staff'] as string[],
  });

  const fetchData = async () => {
    if (users.length === 0) setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get<ApiResult<UserItem[]>>('/users'),
        roles.length === 0 ? api.get<ApiResult<RoleItem[]>>('/roles') : Promise.resolve(null),
      ]);

      if (usersRes.data.succeeded && usersRes.data.data) setUsers(usersRes.data.data);
      if (rolesRes && rolesRes.data.succeeded && rolesRes.data.data) setRoles(rolesRes.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredUsers = users.filter((u) => {
    const matchesRole = !roleFilter || u.roles.some((r) => r.toLowerCase() === roleFilter.toLowerCase());
    if (!matchesRole) return false;
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return (
      u.username.toLowerCase().includes(term) ||
      u.fullName.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.department?.toLowerCase().includes(term) ?? false)
    );
  });

  const openCreateModal = () => {
    setEditing(null);
    setForm({
      username: '',
      email: '',
      fullName: '',
      password: 'Password123!',
      newPassword: '',
      phoneNumber: '',
      department: 'Operational',
      status: 'Active',
      roles: ['Staff'],
    });
    setModalOpen(true);
  };

  const openEditModal = (u: UserItem) => {
    setEditing(u);
    setForm({
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      password: '',
      newPassword: '',
      phoneNumber: u.phoneNumber || '',
      department: u.department || '',
      status: u.status,
      roles: u.roles,
    });
    setModalOpen(true);
  };

  const toggleRoleInForm = (roleName: string) => {
    setForm((prev) => {
      const exists = prev.roles.includes(roleName);
      const next = exists
        ? prev.roles.filter((r) => r !== roleName)
        : [...prev.roles, roleName];
      return { ...prev, roles: next.length > 0 ? next : [roleName] };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, {
          email: form.email,
          fullName: form.fullName,
          phoneNumber: form.phoneNumber,
          department: form.department,
          status: form.status,
          newPassword: form.newPassword || null,
          roles: form.roles,
        });
      } else {
        await api.post('/users', {
          username: form.username,
          email: form.email,
          fullName: form.fullName,
          password: form.password,
          phoneNumber: form.phoneNumber,
          department: form.department,
          status: form.status,
          roles: form.roles,
        });
      }
      setModalOpen(false);
      await fetchData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDelete = async (u: UserItem) => {
    if (!window.confirm(`Hapus akun pengguna "${u.fullName}" (@${u.username})?`)) return;
    setError(null);
    try {
      await api.delete(`/users/${u.id}`);
      await fetchData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen User</h1>
          <p className="text-sm text-slate-500">
            Daftar akun user yang terdaftar di database. Di sini kamu bisa tambah user baru, ganti
            role-nya, atau nonaktifkan akun.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah User</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
            placeholder="Cari username, nama lengkap, email, atau departemen..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">Semua Role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.name}>
              {r.displayName} ({r.name})
            </option>
          ))}
        </select>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          Filter
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <th className="py-3.5 px-4">Pengguna</th>
                <th className="py-3.5 px-4">Departemen</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Login Terakhir</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    Memuat daftar pengguna...
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{u.fullName}</p>
                          <p className="text-xs text-slate-500">
                            @{u.username} • {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{u.department || '-'}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              r === 'SuperAdmin'
                                ? 'bg-rose-100 text-rose-700'
                                : r === 'Admin'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Shield className="w-3 h-3" />
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          u.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString('id-ID')
                        : 'Belum pernah login'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-2 rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                            title="Ubah Pengguna"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && u.username !== 'superadmin' && (
                          <button
                            onClick={() => handleDelete(u)}
                            className="p-2 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                            title="Hapus Pengguna"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  {editing ? `Ubah Pengguna (@${editing.username})` : 'Tambah Pengguna Baru'}
                </h3>
              </div>
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    disabled={!!editing}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Departemen
                  </label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {editing ? 'Reset Password (Opsional)' : 'Password Awal'}
                  </label>
                  <input
                    type="password"
                    required={!editing}
                    placeholder={editing ? 'Kosongkan jika tidak diubah' : 'Password123!'}
                    value={editing ? form.newPassword : form.password}
                    onChange={(e) =>
                      editing
                        ? setForm({ ...form, newPassword: e.target.value })
                        : setForm({ ...form, password: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Pilih Role Pengguna (Bisa Lebih dari Satu)
                </label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => {
                    const checked = form.roles.includes(r.name);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRoleInForm(r.name)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          checked
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {r.displayName} ({r.name})
                      </button>
                    );
                  })}
                </div>
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
                  Simpan Pengguna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
