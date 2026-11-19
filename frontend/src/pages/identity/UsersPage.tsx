import React, { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Users, Shield, X, Building2 } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type {
  ApiResult,
  DepartmentItem,
  DirectorateItem,
  DivisionItem,
  PositionItem,
  RoleItem,
  UserItem,
} from '../../types';

export const UsersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('Users.Create');
  const canEdit = hasPermission('Users.Edit');
  const canDelete = hasPermission('Users.Delete');

  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [directorates, setDirectorates] = useState<DirectorateItem[]>([]);
  const [divisions, setDivisions] = useState<DivisionItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [positions, setPositions] = useState<PositionItem[]>([]);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [dirFilter, setDirFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    fullName: '',
    employeeCode: '',
    password: 'Password123!',
    newPassword: '',
    phoneNumber: '',
    department: '',
    directorateId: '',
    divisionId: '',
    departmentId: '',
    positionId: '',
    managerUserId: '',
    status: 'Active',
    roles: ['Staff'] as string[],
  });

  const fetchData = async () => {
    if (users.length === 0) setLoading(true);
    try {
      const [usersRes, rolesRes, dirRes, divRes, deptRes, posRes] = await Promise.allSettled([
        api.get<ApiResult<UserItem[]>>('/users'),
        api.get<ApiResult<RoleItem[]>>('/roles'),
        api.get<ApiResult<DirectorateItem[]>>('/organizations/directorates'),
        api.get<ApiResult<DivisionItem[]>>('/organizations/divisions'),
        api.get<ApiResult<DepartmentItem[]>>('/organizations/departments'),
        api.get<ApiResult<PositionItem[]>>('/organizations/positions'),
      ]);

      if (usersRes.status === 'fulfilled' && usersRes.value.data.data) setUsers(usersRes.value.data.data);
      if (rolesRes.status === 'fulfilled' && rolesRes.value.data.data) setRoles(rolesRes.value.data.data);
      if (dirRes.status === 'fulfilled' && dirRes.value.data.data) setDirectorates(dirRes.value.data.data);
      if (divRes.status === 'fulfilled' && divRes.value.data.data) setDivisions(divRes.value.data.data);
      if (deptRes.status === 'fulfilled' && deptRes.value.data.data) setDepartments(deptRes.value.data.data);
      if (posRes.status === 'fulfilled' && posRes.value.data.data) setPositions(posRes.value.data.data);
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
    const matchesDir = !dirFilter || u.directorateId === dirFilter;
    if (!matchesRole || !matchesDir) return false;
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return (
      u.username.toLowerCase().includes(term) ||
      u.fullName.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.employeeCode?.toLowerCase().includes(term) ?? false) ||
      (u.directorateName?.toLowerCase().includes(term) ?? false) ||
      (u.divisionName?.toLowerCase().includes(term) ?? false) ||
      (u.departmentName?.toLowerCase().includes(term) ?? false) ||
      (u.positionName?.toLowerCase().includes(term) ?? false)
    );
  });

  const openCreateModal = () => {
    setEditing(null);
    setForm({
      username: '',
      email: '',
      fullName: '',
      employeeCode: '',
      password: 'Password123!',
      newPassword: '',
      phoneNumber: '',
      department: '',
      directorateId: '',
      divisionId: '',
      departmentId: '',
      positionId: '',
      managerUserId: '',
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
      employeeCode: u.employeeCode || '',
      password: '',
      newPassword: '',
      phoneNumber: u.phoneNumber || '',
      department: u.department || '',
      directorateId: u.directorateId || '',
      divisionId: u.divisionId || '',
      departmentId: u.departmentId || '',
      positionId: u.positionId || '',
      managerUserId: u.managerUserId || '',
      status: u.status,
      roles: u.roles,
    });
    setModalOpen(true);
  };

  const toggleRoleInForm = (roleName: string) => {
    setForm((prev) => {
      const exists = prev.roles.includes(roleName);
      const next = exists ? prev.roles.filter((r) => r !== roleName) : [...prev.roles, roleName];
      return { ...prev, roles: next.length > 0 ? next : [roleName] };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const orgPayload = {
        employeeCode: form.employeeCode || null,
        directorateId: form.directorateId || null,
        divisionId: form.divisionId || null,
        departmentId: form.departmentId || null,
        positionId: form.positionId || null,
        managerUserId: form.managerUserId || null,
      };

      if (editing) {
        await api.put(`/users/${editing.id}`, {
          email: form.email,
          fullName: form.fullName,
          phoneNumber: form.phoneNumber,
          department: form.department,
          status: form.status,
          newPassword: form.newPassword || null,
          roles: form.roles,
          ...orgPayload,
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
          ...orgPayload,
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

  const availableDivisions = form.directorateId
    ? divisions.filter((dv) => dv.directorateId === form.directorateId)
    : divisions;

  const availableDepartments = form.divisionId
    ? departments.filter((dp) => dp.divisionId === form.divisionId)
    : departments;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen User ({filteredUsers.length})</h1>
          <p className="text-sm text-slate-500">
            Kelola akun karyawan lengkap dengan NIK, Direktorat, Divisi, Departemen, Posisi, Atasan, dan Role akses.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold shadow-xs"
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
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIK, nama, username, posisi, direktorat, divisi, departemen..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
          />
        </div>
        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">Semua Direktorat</option>
          {directorates.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
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
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <th className="py-3.5 px-4">Karyawan &amp; NIK</th>
                <th className="py-3.5 px-4">Posisi &amp; Struktur Organisasi</th>
                <th className="py-3.5 px-4">Atasan Langsung</th>
                <th className="py-3.5 px-4">Role Sistem</th>
                <th className="py-3.5 px-4">Status</th>
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
                        <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center shrink-0">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-slate-900">{u.fullName}</p>
                            {u.employeeCode && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                                {u.employeeCode}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            @{u.username} • {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <p className="font-bold text-slate-800">
                        {u.positionName || 'Belum ada posisi'}
                      </p>
                      <p className="text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                        <Building2 className="w-3 h-3 text-teal-600 shrink-0" />
                        <span>{u.directorateName || '-'}</span>
                        {u.divisionName && <span>&rarr; {u.divisionName}</span>}
                        {u.departmentName && <span>&rarr; {u.departmentName}</span>}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {u.managerFullName || <span className="text-amber-700 font-semibold">Top Executive (C-Level)</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              r === 'SuperAdmin'
                                ? 'bg-rose-100 text-rose-700'
                                : r === 'Admin'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-teal-50 text-teal-800 border border-teal-200'
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
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-2 rounded-lg text-slate-600 hover:bg-teal-50 hover:text-teal-700"
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

      {/* Modal Tambah / Edit User dengan Cascading Organisasi */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Username *</label>
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">NIK / Employee Code</label>
                  <input
                    type="text"
                    value={form.employeeCode}
                    onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                    placeholder="EMP-0099"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">No. Telepon</label>
                  <input
                    type="text"
                    value={form.phoneNumber}
                    onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              {/* Profil Organisasi Cascading */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                  Profil Organisasi (Master Data)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Direktorat</label>
                    <select
                      value={form.directorateId}
                      onChange={(e) =>
                        setForm({ ...form, directorateId: e.target.value, divisionId: '', departmentId: '' })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="">-- Pilih Direktorat --</option>
                      {directorates.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Divisi</label>
                    <select
                      value={form.divisionId}
                      onChange={(e) => setForm({ ...form, divisionId: e.target.value, departmentId: '' })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="">-- Pilih Divisi --</option>
                      {availableDivisions.map((dv) => (
                        <option key={dv.id} value={dv.id}>{dv.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Departemen</label>
                    <select
                      value={form.departmentId}
                      onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="">-- Pilih Departemen --</option>
                      {availableDepartments.map((dp) => (
                        <option key={dp.id} value={dp.id}>{dp.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Posisi / Jabatan</label>
                    <select
                      value={form.positionId}
                      onChange={(e) => setForm({ ...form, positionId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="">-- Pilih Posisi --</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.id}>
                          [L{p.level}] {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Atasan Langsung</label>
                    <select
                      value={form.managerUserId}
                      onChange={(e) => setForm({ ...form, managerUserId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="">-- Tidak Ada (Top Executive) --</option>
                      {users
                        .filter((x) => x.id !== editing?.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} ({u.positionName || u.roles[0]})
                          </option>
                        ))}
                    </select>
                  </div>
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
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r) => {
                    const checked = form.roles.includes(r.name);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRoleInForm(r.name)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          checked
                            ? 'bg-teal-600 text-white border-teal-600'
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
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold"
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
