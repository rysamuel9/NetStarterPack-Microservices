import React, { useEffect, useState } from 'react';
import {
  Network,
  Building2,
  Layers,
  Briefcase,
  Award,
  Plus,
  Pencil,
  Trash2,
  Users,
  Crown,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type {
  ApiResult,
  DepartmentItem,
  DirectorateItem,
  DirectorateTreeNode,
  DivisionItem,
  PositionItem,
  UserItem,
} from '../types';

type TabKey = 'tree' | 'directorates' | 'divisions' | 'departments' | 'positions';

export const OrganizationPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('Organization.Manage');

  const [activeTab, setActiveTab] = useState<TabKey>('tree');
  const [tree, setTree] = useState<DirectorateTreeNode[]>([]);
  const [directorates, setDirectorates] = useState<DirectorateItem[]>([]);
  const [divisions, setDivisions] = useState<DivisionItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal state
  const [modalKind, setModalKind] = useState<'directorate' | 'division' | 'department' | 'position' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formHeadUserId, setFormHeadUserId] = useState('');
  const [formLevel, setFormLevel] = useState(5);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeRes, dirRes, divRes, deptRes, posRes, usersRes] = await Promise.allSettled([
        api.get<ApiResult<DirectorateTreeNode[]>>('/organizations/tree'),
        api.get<ApiResult<DirectorateItem[]>>('/organizations/directorates'),
        api.get<ApiResult<DivisionItem[]>>('/organizations/divisions'),
        api.get<ApiResult<DepartmentItem[]>>('/organizations/departments'),
        api.get<ApiResult<PositionItem[]>>('/organizations/positions'),
        api.get<ApiResult<UserItem[]>>('/users'),
      ]);

      if (treeRes.status === 'fulfilled' && treeRes.value.data.data) setTree(treeRes.value.data.data);
      if (dirRes.status === 'fulfilled' && dirRes.value.data.data) setDirectorates(dirRes.value.data.data);
      if (divRes.status === 'fulfilled' && divRes.value.data.data) setDivisions(divRes.value.data.data);
      if (deptRes.status === 'fulfilled' && deptRes.value.data.data) setDepartments(deptRes.value.data.data);
      if (posRes.status === 'fulfilled' && posRes.value.data.data) setPositions(posRes.value.data.data);
      if (usersRes.status === 'fulfilled' && usersRes.value.data.data) setUsers(usersRes.value.data.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat data struktur organisasi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openModal = (
    kind: 'directorate' | 'division' | 'department' | 'position',
    existing?: DirectorateItem | DivisionItem | DepartmentItem | PositionItem
  ) => {
    setModalKind(kind);
    setError(null);
    if (!existing) {
      setEditingId(null);
      setFormCode('');
      setFormName('');
      setFormDesc('');
      setFormHeadUserId('');
      setFormLevel(5);
      if (kind === 'division') setFormParentId(directorates[0]?.id || '');
      else if (kind === 'department') setFormParentId(divisions[0]?.id || '');
      else setFormParentId('');
      return;
    }

    setEditingId(existing.id);
    setFormCode(existing.code);
    setFormName(existing.name);
    setFormDesc(existing.description || '');
    if (kind === 'directorate') {
      const d = existing as DirectorateItem;
      setFormHeadUserId(d.headUserId || '');
    } else if (kind === 'division') {
      const dv = existing as DivisionItem;
      setFormParentId(dv.directorateId);
      setFormHeadUserId(dv.headUserId || '');
    } else if (kind === 'department') {
      const dp = existing as DepartmentItem;
      setFormParentId(dp.divisionId);
      setFormHeadUserId(dp.headUserId || '');
    } else if (kind === 'position') {
      const p = existing as PositionItem;
      setFormLevel(p.level);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalKind) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (modalKind === 'directorate') {
        const payload = { code: formCode, name: formName, description: formDesc, headUserId: formHeadUserId || null, isActive: true };
        editingId
          ? await api.put(`/organizations/directorates/${editingId}`, payload)
          : await api.post('/organizations/directorates', payload);
      } else if (modalKind === 'division') {
        const payload = { directorateId: formParentId, code: formCode, name: formName, description: formDesc, headUserId: formHeadUserId || null, isActive: true };
        editingId
          ? await api.put(`/organizations/divisions/${editingId}`, payload)
          : await api.post('/organizations/divisions', payload);
      } else if (modalKind === 'department') {
        const payload = { divisionId: formParentId, code: formCode, name: formName, description: formDesc, headUserId: formHeadUserId || null, isActive: true };
        editingId
          ? await api.put(`/organizations/departments/${editingId}`, payload)
          : await api.post('/organizations/departments', payload);
      } else if (modalKind === 'position') {
        const payload = { code: formCode, name: formName, level: Number(formLevel), description: formDesc, isActive: true };
        editingId
          ? await api.put(`/organizations/positions/${editingId}`, payload)
          : await api.post('/organizations/positions', payload);
      }

      setModalKind(null);
      setNotice('Master organisasi berhasil disimpan.');
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menyimpan master organisasi.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (endpoint: string, label: string) => {
    if (!window.confirm(`Yakin ingin menghapus "${label}"?`)) return;
    setError(null);
    setNotice(null);
    try {
      await api.delete(endpoint);
      setNotice(`"${label}" berhasil dihapus.`);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menghapus item organisasi.'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-3xl p-6 text-white border border-teal-800/50 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <Network className="w-3.5 h-3.5" />
            <span>IDENTITY.API (:5081) • ORGANIZATION MASTER</span>
          </div>
          <h1 className="text-2xl font-bold">Struktur &amp; Master Organisasi</h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Hierarki korporat 4 lapis: <strong>Direktorat (Bos C-Level)</strong> &rarr;{' '}
            <strong>Divisi</strong> &rarr; <strong>Departemen</strong> &rarr;{' '}
            <strong>Master Posisi / Jabatan</strong>.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs shrink-0">
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
            <p className="text-lg font-bold text-teal-400">{directorates.length}</p>
            <p className="text-[11px] text-slate-400">Direktorat</p>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
            <p className="text-lg font-bold text-cyan-400">{divisions.length}</p>
            <p className="text-[11px] text-slate-400">Divisi</p>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
            <p className="text-lg font-bold text-emerald-400">{departments.length}</p>
            <p className="text-[11px] text-slate-400">Departemen</p>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
            <p className="text-lg font-bold text-amber-400">{positions.length}</p>
            <p className="text-[11px] text-slate-400">Posisi</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'tree', label: 'Pohon Organisasi', icon: Network },
          { id: 'directorates', label: `Master Direktorat (${directorates.length})`, icon: Building2 },
          { id: 'divisions', label: `Master Divisi (${divisions.length})`, icon: Layers },
          { id: 'departments', label: `Master Departemen (${departments.length})`, icon: Briefcase },
          { id: 'positions', label: `Master Posisi (${positions.length})`, icon: Award },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabKey)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
          Memuat struktur organisasi dari Identity.Api...
        </div>
      ) : activeTab === 'tree' ? (
        /* TAB 1: VISUAL ORG TREE */
        <div className="space-y-5">
          {tree.map((dir) => (
            <div key={dir.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
              {/* Directorate Header + Boss C-Level */}
              <div className="p-5 bg-gradient-to-r from-slate-900 to-teal-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-mono font-bold">
                      {dir.code}
                    </span>
                    <span className="text-xs text-slate-300">
                      {dir.divisions.length} Divisi • {dir.userCount} Karyawan
                    </span>
                  </div>
                  <h2 className="text-lg font-bold mt-1">{dir.name}</h2>
                  <p className="text-xs text-slate-300 mt-0.5">{dir.description}</p>
                </div>

                {dir.headFullName && (
                  <div className="px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 flex items-center gap-3 shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                      <Crown className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
                        Kepala Direktorat
                      </p>
                      <p className="text-sm font-bold text-white">{dir.headFullName}</p>
                      <p className="text-[11px] text-teal-200">
                        {dir.headPositionName || 'Director'} (@{dir.headUsername})
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Divisions Grid */}
              <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {dir.divisions.map((div) => (
                  <div key={div.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 text-[10px] font-mono font-bold">
                            {div.code}
                          </span>
                          <span className="text-[11px] text-slate-500">{div.userCount} orang</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm mt-1">{div.name}</h3>
                        {div.headFullName && (
                          <p className="text-xs text-teal-700 font-semibold mt-0.5">
                            Head: {div.headFullName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Departments under this Division */}
                    <div className="space-y-2.5">
                      {div.departments.map((dept) => (
                        <div key={dept.id} className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-mono text-slate-400">{dept.code}</span>
                              <p className="text-xs font-bold text-slate-800">{dept.name}</p>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                              <Users className="w-3 h-3" /> {dept.userCount}
                            </span>
                          </div>

                          {dept.members.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {dept.members.map((m) => (
                                <span
                                  key={m.id}
                                  className="px-2.5 py-1 rounded-lg bg-teal-50/70 border border-teal-200/70 text-[11px] text-slate-700"
                                >
                                  <strong className="text-slate-900">{m.fullName}</strong>
                                  {m.positionName && (
                                    <span className="text-teal-700"> • {m.positionName}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'directorates' ? (
        /* TAB 2: MASTER DIRECTORATES */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Master Direktorat</h2>
            {canManage && (
              <button
                onClick={() => openModal('directorate')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" /> Tambah Direktorat
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Nama Direktorat</th>
                  <th className="py-3 px-4">Bos / Kepala Direktorat</th>
                  <th className="py-3 px-4">Divisi &amp; Karyawan</th>
                  {canManage && <th className="py-3 px-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {directorates.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-teal-700">{d.code}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.description}</p>
                    </td>
                    <td className="py-3 px-4">
                      {d.headFullName ? (
                        <div>
                          <p className="font-semibold text-slate-800">{d.headFullName}</p>
                          <p className="text-xs text-slate-500">{d.headPositionName || `@${d.headUsername}`}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Belum ditetapkan</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {d.divisionCount} Divisi • {d.userCount} User
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => openModal('directorate', d)} className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-600 hover:text-teal-700"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(`/organizations/directorates/${d.id}`, d.name)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'divisions' ? (
        /* TAB 3: MASTER DIVISIONS */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Master Divisi (Turunan Direktorat)</h2>
            {canManage && (
              <button
                onClick={() => openModal('division')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" /> Tambah Divisi
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Nama Divisi</th>
                  <th className="py-3 px-4">Induk Direktorat</th>
                  <th className="py-3 px-4">Kepala Divisi</th>
                  <th className="py-3 px-4">Dept &amp; User</th>
                  {canManage && <th className="py-3 px-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {divisions.map((dv) => (
                  <tr key={dv.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-cyan-700">{dv.code}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{dv.name}</p>
                      <p className="text-xs text-slate-500">{dv.description}</p>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-teal-800">{dv.directorateName}</td>
                    <td className="py-3 px-4 text-xs text-slate-700">{dv.headFullName || '-'}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{dv.departmentCount} Dept • {dv.userCount} User</td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => openModal('division', dv)} className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-600 hover:text-teal-700"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(`/organizations/divisions/${dv.id}`, dv.name)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'departments' ? (
        /* TAB 4: MASTER DEPARTMENTS */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Master Departemen (Turunan Divisi)</h2>
            {canManage && (
              <button
                onClick={() => openModal('department')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" /> Tambah Departemen
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Nama Departemen</th>
                  <th className="py-3 px-4">Divisi &rarr; Direktorat</th>
                  <th className="py-3 px-4">PIC / Lead</th>
                  <th className="py-3 px-4">Anggota</th>
                  {canManage && <th className="py-3 px-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {departments.map((dp) => (
                  <tr key={dp.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-emerald-700">{dp.code}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{dp.name}</p>
                      <p className="text-xs text-slate-500">{dp.description}</p>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className="font-semibold text-slate-800">{dp.divisionName}</span>
                      <span className="block text-slate-400">{dp.directorateName}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{dp.headFullName || '-'}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{dp.userCount} User</td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => openModal('department', dp)} className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-600 hover:text-teal-700"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(`/organizations/departments/${dp.id}`, dp.name)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB 5: MASTER POSITIONS */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Master Posisi / Jabatan</h2>
            {canManage && (
              <button
                onClick={() => openModal('position')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" /> Tambah Posisi
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Level</th>
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Nama Posisi / Jabatan</th>
                  <th className="py-3 px-4">Pemegang Jabatan</th>
                  {canManage && <th className="py-3 px-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        Level {p.level}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700">{p.code}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.description}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{p.userCount} User</td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => openModal('position', p)} className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-600 hover:text-teal-700"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(`/organizations/positions/${p.id}`, p.name)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unified CRUD Modal */}
      {modalKind && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">
                {editingId ? 'Edit' : 'Tambah'} Master{' '}
                {modalKind === 'directorate'
                  ? 'Direktorat'
                  : modalKind === 'division'
                  ? 'Divisi'
                  : modalKind === 'department'
                  ? 'Departemen'
                  : 'Posisi'}
              </h3>
              <button onClick={() => setModalKind(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              {modalKind === 'division' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Direktorat Induk *</label>
                  <select
                    required
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {directorates.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {modalKind === 'department' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Divisi Induk *</label>
                  <select
                    required
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {divisions.map((dv) => (
                      <option key={dv.id} value={dv.id}>{dv.name} — {dv.directorateName}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Unik *</label>
                  <input
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="DIR-MKT"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono uppercase"
                  />
                </div>
                {modalKind === 'position' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Level (1=Tertinggi) *</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      required
                      value={formLevel}
                      onChange={(e) => setFormLevel(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama *</label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              {modalKind !== 'position' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kepala / Bos (User)</label>
                  <select
                    value={formHeadUserId}
                    onChange={(e) => setFormHeadUserId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="">-- Belum Ditetapkan --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} (@{u.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setModalKind(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm">Batal</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
