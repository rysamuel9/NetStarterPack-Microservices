import React, { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Save, Trash2, CheckSquare, Square, Menu as MenuIcon } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { ApiResult, MenuItem, PermissionItem, RoleItem } from '../../types';

export const RolesPage: React.FC = () => {
  const { hasPermission, refreshUserAndMenus } = useAuth();
  const canManage = hasPermission('Roles.Manage');

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);

  const [roleForm, setRoleForm] = useState({
    name: '',
    displayName: '',
    description: '',
    badgeColor: 'indigo',
    permissions: [] as string[],
    menuIds: [] as string[],
  });
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAll = async () => {
    try {
      const [rolesRes, permsRes, menusRes] = await Promise.all([
        api.get<ApiResult<RoleItem[]>>('/roles'),
        api.get<ApiResult<PermissionItem[]>>('/roles/permissions'),
        api.get<ApiResult<MenuItem[]>>('/menus'),
      ]);

      if (rolesRes.data.succeeded && rolesRes.data.data) {
        setRoles(rolesRes.data.data);
        if (!selectedRole && rolesRes.data.data.length > 0) {
          selectRoleForEdit(rolesRes.data.data[0]);
        }
      }
      if (permsRes.data.succeeded && permsRes.data.data) {
        setPermissions(permsRes.data.data);
      }
      if (menusRes.data.succeeded && menusRes.data.data) {
        setMenus(menusRes.data.data);
      }
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectRoleForEdit = (r: RoleItem) => {
    setIsCreatingNew(false);
    setSelectedRole(r);
    setRoleForm({
      name: r.name,
      displayName: r.displayName,
      description: r.description,
      badgeColor: r.badgeColor,
      permissions: r.permissions,
      menuIds: r.menuIds,
    });
    setMessage(null);
  };

  const startNewRole = () => {
    setIsCreatingNew(true);
    setSelectedRole(null);
    setRoleForm({
      name: '',
      displayName: '',
      description: '',
      badgeColor: 'emerald',
      permissions: ['Dashboard.View', 'Products.View'],
      menuIds: menus.filter((m) => m.code === 'dashboard' || m.code === 'profile').map((m) => m.id),
    });
    setMessage(null);
  };

  const togglePermission = (code: string) => {
    if (!canManage) return;
    setRoleForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(code)
        ? prev.permissions.filter((p) => p !== code)
        : [...prev.permissions, code],
    }));
  };

  const toggleMenuId = (menuId: string) => {
    if (!canManage) return;
    setRoleForm((prev) => ({
      ...prev,
      menuIds: prev.menuIds.includes(menuId)
        ? prev.menuIds.filter((id) => id !== menuId)
        : [...prev.menuIds, menuId],
    }));
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setMessage(null);

    try {
      if (isCreatingNew) {
        const res = await api.post<ApiResult<RoleItem>>('/roles', roleForm);
        if (res.data.succeeded && res.data.data) {
          setMessage({ type: 'success', text: 'Role baru berhasil dibuat!' });
          await loadAll();
          selectRoleForEdit(res.data.data);
        }
      } else if (selectedRole) {
        const res = await api.put<ApiResult<RoleItem>>(`/roles/${selectedRole.id}`, roleForm);
        if (res.data.succeeded && res.data.data) {
          setMessage({
            type: 'success',
            text: 'Konfigurasi Role, Permission Matrix, & Akses Menu berhasil diperbarui!',
          });
          await loadAll();
          await refreshUserAndMenus();
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole || selectedRole.isSystemRole) return;
    if (!window.confirm(`Hapus role "${selectedRole.displayName}"?`)) return;
    try {
      await api.delete(`/roles/${selectedRole.id}`);
      setSelectedRole(null);
      await loadAll();
      setMessage({ type: 'success', text: 'Role berhasil dihapus.' });
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const groupedPermissions = permissions.reduce<Record<string, PermissionItem[]>>((acc, item) => {
    if (!acc[item.module]) acc[item.module] = [];
    acc[item.module].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pengaturan Role & Hak Akses</h1>
          <p className="text-sm text-slate-500">
            Karena arah aplikasinya masih bisa berkembang, role dummy di bawah bisa langsung kamu
            ganti namanya, atur ulang centang permission-nya, atau pilih menu mana aja yang boleh
            dilihat.
          </p>
        </div>
        {canManage && (
          <button
            onClick={startNewRole}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Role Baru</span>
          </button>
        )}
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm border ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Role Selector List */}
        <div className="lg:col-span-4 space-y-3">
          {roles.map((r) => {
            const active = !isCreatingNew && selectedRole?.id === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRoleForEdit(r)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-5 h-5 ${active ? 'text-white' : 'text-indigo-600'}`} />
                    <span className="font-bold text-sm">{r.displayName}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {r.userCount} user
                  </span>
                </div>
                <p className={`text-xs mt-1.5 ${active ? 'text-indigo-100' : 'text-slate-500'}`}>
                  {r.description}
                </p>
                <div className="mt-3 flex items-center gap-2 text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded font-mono ${
                      active ? 'bg-black/20 text-indigo-100' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {r.name}
                  </span>
                  <span>• {r.permissions.length} permissions</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Role Configuration & Matrix */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <form onSubmit={handleSaveRole} className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {isCreatingNew
                    ? 'Buat Role Baru'
                    : `Konfigurasi Role: ${selectedRole?.displayName}`}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedRole?.isSystemRole
                    ? 'Role sistem utama (tidak dapat dihapus, namun hak akses dapat disesuaikan).'
                    : 'Role kustom/dummy — bebas diubah nama, deskripsi, dan hak aksesnya.'}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  {!isCreatingNew && selectedRole && !selectedRole.isSystemRole && (
                    <button
                      type="button"
                      onClick={handleDeleteRole}
                      className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50"
                      title="Hapus Role"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Kode Role (Tanpa Spasi)
                </label>
                <input
                  type="text"
                  required
                  disabled={!canManage || selectedRole?.name === 'SuperAdmin'}
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="Misal: FinanceManager"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nama Tampilan (Display Name)
                </label>
                <input
                  type="text"
                  required
                  disabled={!canManage}
                  value={roleForm.displayName}
                  onChange={(e) => setRoleForm({ ...roleForm, displayName: e.target.value })}
                  placeholder="Misal: Manajer Keuangan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Deskripsi Fungsi Role
              </label>
              <input
                type="text"
                disabled={!canManage}
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {/* Menu Access Matrix */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MenuIcon className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Akses Menu Navigasi Sidebar ({roleForm.menuIds.length} dipilih)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {menus.map((m) => {
                  const checked = roleForm.menuIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMenuId(m.id)}
                      className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                        checked
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{m.title}</p>
                        <p className="text-[11px] text-slate-500">{m.path}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Granular Permission Matrix */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                Matriks Izin Fitur Granular ({roleForm.permissions.length} dari {permissions.length}{' '}
                permissions)
              </h3>
              <div className="space-y-4">
                {Object.entries(groupedPermissions).map(([moduleName, modulePerms]) => (
                  <div
                    key={moduleName}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200/80"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2.5">
                      Modul: {moduleName}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {modulePerms.map((perm) => {
                        const checked = roleForm.permissions.includes(perm.code);
                        return (
                          <button
                            key={perm.code}
                            type="button"
                            onClick={() => togglePermission(perm.code)}
                            className={`p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-all ${
                              checked
                                ? 'bg-white border-indigo-300 shadow-2xs'
                                : 'bg-transparent border-slate-200 opacity-75'
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p className="text-xs font-semibold text-slate-900">{perm.name}</p>
                              <code className="text-[10px] text-indigo-600 font-mono">
                                {perm.code}
                              </code>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
