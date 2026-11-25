import React, { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  FolderKanban,
  ExternalLink,
  Lock,
  CheckCircle2,
  XCircle,
  Layers,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { ApiResult, LookupGroupSummary, LookupItem, MasterDataStats } from '../../types';

const COLOR_DOT_MAP: Record<string, string> = {
  teal: 'bg-teal-500',
  indigo: 'bg-indigo-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  slate: 'bg-slate-400',
};

function parseMetadataColor(metadataJson?: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { color?: string };
    return parsed?.color || null;
  } catch {
    return null;
  }
}

export const LookupsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('Lookups.Manage');

  const [groups, setGroups] = useState<LookupGroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [items, setItems] = useState<LookupItem[]>([]);
  const [stats, setStats] = useState<MasterDataStats | null>(null);

  const [groupSearch, setGroupSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LookupItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    groupCode: '',
    code: '',
    name: '',
    description: '',
    parentId: '',
    sortOrder: 1,
    isActive: true,
    metadataJson: '',
  });

  const loadGroupsAndStats = async (preserveGroup?: string) => {
    setLoadingGroups(true);
    try {
      const [groupsRes, statsRes] = await Promise.all([
        api.get<ApiResult<LookupGroupSummary[]>>('/lookups/groups'),
        api.get<ApiResult<MasterDataStats>>('/lookups/stats'),
      ]);

      if (groupsRes.data.succeeded && groupsRes.data.data) {
        const list = groupsRes.data.data;
        setGroups(list);
        const target = preserveGroup || selectedGroup;
        if (target && list.some((g) => g.groupCode === target)) {
          setSelectedGroup(target);
        } else if (list.length > 0) {
          setSelectedGroup(list[0].groupCode);
        } else {
          setSelectedGroup('');
        }
      }

      if (statsRes.data.succeeded && statsRes.data.data) {
        setStats(statsRes.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat grup Master Data dari MasterData.Api (:5086).'));
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadItems = async (groupCode: string, onlyActive = activeOnly) => {
    if (!groupCode) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    setError(null);
    try {
      const res = await api.get<ApiResult<LookupItem[]>>('/lookups', {
        params: {
          groupCode,
          activeOnly: onlyActive,
        },
      });
      if (res.data.succeeded && res.data.data) {
        setItems(res.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    loadGroupsAndStats();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadItems(selectedGroup, activeOnly);
    }
  }, [selectedGroup, activeOnly]);

  const filteredGroups = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => g.groupCode.toLowerCase().includes(term));
  }, [groups, groupSearch]);

  const filteredItems = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.code.toLowerCase().includes(term) ||
        i.name.toLowerCase().includes(term) ||
        (i.description || '').toLowerCase().includes(term) ||
        (i.parentName || '').toLowerCase().includes(term)
    );
  }, [items, itemSearch]);

  const openCreateModal = (forNewGroup = false) => {
    setEditing(null);
    setError(null);
    const nextOrder = forNewGroup
      ? 1
      : items.length > 0
        ? Math.max(...items.map((x) => x.sortOrder)) + 1
        : 1;

    setForm({
      groupCode: forNewGroup ? '' : selectedGroup,
      code: '',
      name: '',
      description: '',
      parentId: '',
      sortOrder: nextOrder,
      isActive: true,
      metadataJson: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (item: LookupItem) => {
    setEditing(item);
    setError(null);
    setForm({
      groupCode: item.groupCode,
      code: item.code,
      name: item.name,
      description: item.description || '',
      parentId: item.parentId || '',
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      metadataJson: item.metadataJson || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (form.metadataJson.trim()) {
      try {
        const parsed = JSON.parse(form.metadataJson);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setError('MetadataJson harus berupa JSON object (contoh: {"color":"teal"}).');
          return;
        }
      } catch {
        setError('Format MetadataJson tidak valid.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        groupCode: form.groupCode.trim().toUpperCase().replace(/\s+/g, '_'),
        code: form.code.trim().toUpperCase().replace(/\s+/g, '_'),
        name: form.name.trim(),
        description: form.description.trim() || null,
        parentId: form.parentId || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        metadataJson: form.metadataJson.trim() || null,
      };

      if (editing) {
        await api.put(`/lookups/${editing.id}`, payload);
        setNotice(`Item ${payload.code} berhasil diperbarui.`);
      } else {
        await api.post('/lookups', payload);
        setNotice(`Item ${payload.code} berhasil ditambahkan ke grup ${payload.groupCode}.`);
      }

      setModalOpen(false);
      await loadGroupsAndStats(payload.groupCode);
      await loadItems(payload.groupCode, activeOnly);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: LookupItem) => {
    if (!canManage) return;
    setError(null);
    try {
      await api.patch(`/lookups/${item.id}/status`, { isActive: !item.isActive });
      await loadGroupsAndStats(selectedGroup);
      await loadItems(selectedGroup, activeOnly);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDelete = async (item: LookupItem) => {
    if (!canManage || item.isSystem) return;
    if (!window.confirm(`Hapus lookup "${item.name}" (${item.code}) dari grup ${item.groupCode}?`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.delete(`/lookups/${item.id}`);
      setNotice(`Item ${item.code} berhasil dihapus.`);
      await loadGroupsAndStats(selectedGroup);
      await loadItems(selectedGroup, activeOnly);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const parentCandidates = useMemo(
    () => items.filter((x) => x.groupCode === form.groupCode && x.id !== editing?.id),
    [items, form.groupCode, editing?.id]
  );

  return (
    <div className="space-y-6">
      {/* Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-5 text-white border border-teal-800/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-300 text-xs font-semibold uppercase tracking-wider">
            <Database className="w-4 h-4" />
            <span>MasterData.Api (:5086) • NetStarterPack_MasterDataDb</span>
          </div>
          <h1 className="text-2xl font-bold mt-1">Master Data &amp; Unified Lookups</h1>
          <p className="text-sm text-slate-300 mt-1">
            Satu tabel referensi bersama (kategori produk, satuan, metode bayar, prioritas, dll.) yang di-cache Hybrid L1/L2 untuk semua microservice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="http://localhost:5086/swagger"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-teal-100 border border-white/10"
          >
            <span>Swagger :5086</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {canManage && (
            <>
              <button
                onClick={() => openCreateModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white border border-white/15"
              >
                <FolderKanban className="w-4 h-4" />
                <span>Grup Baru</span>
              </button>
              <button
                onClick={() => openCreateModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Item</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Ringkasan Statistik */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">Total Grup</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalGroups}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">Total Item Lookup</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalItems}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">Item Aktif</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.activeItems}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500">Item Nonaktif</p>
            <p className="text-2xl font-bold text-slate-500 mt-1">{stats.inactiveItems}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {/* Split Panel: Kiri Daftar Grup, Kanan Tabel Item */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Panel Kiri: Daftar GroupCode */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-4 space-y-3 h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-teal-600" />
              <span>Grup Lookup</span>
            </h2>
            <span className="text-xs text-slate-400">{groups.length} grup</span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari grup..."
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {loadingGroups ? (
            <div className="py-8 text-center text-xs text-slate-400">Memuat daftar grup...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">Belum ada grup yang cocok.</div>
          ) : (
            <div className="space-y-1.5">
              {filteredGroups.map((g) => {
                const active = g.groupCode === selectedGroup;
                return (
                  <button
                    key={g.groupCode}
                    onClick={() => setSelectedGroup(g.groupCode)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-teal-50 border-teal-300 text-teal-900 shadow-xs'
                        : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold truncate">{g.groupCode}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                        active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {g.activeCount}/{g.totalCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel Kanan: Daftar Item pada Grup Terpilih */}
        <div className="lg:col-span-9 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-900">
                  {selectedGroup || 'Pilih Grup'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {filteredItems.length} item
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dipanggil lewat <code className="text-teal-700 font-mono">GET /api/lookups?groupCode={selectedGroup || 'GROUP'}&amp;activeOnly=true</code>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari kode / nama..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Hanya Aktif</span>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-3 px-4 w-16">Urutan</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Label &amp; Deskripsi</th>
                  <th className="py-3 px-4">Parent / Metadata</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingItems ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                      Memuat item lookup...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                      Belum ada item lookup di grup ini.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const colorKey = parseMetadataColor(item.metadataJson);
                    const dotClass = colorKey ? COLOR_DOT_MAP[colorKey] || 'bg-slate-400' : null;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{item.sortOrder}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                              {item.code}
                            </span>
                            {item.isSystem && (
                              <span
                                title="Item sistem bawaan (tidak dapat dihapus)"
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200"
                              >
                                <Lock className="w-2.5 h-2.5" />
                                System
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {dotClass && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />}
                            <span className="font-semibold text-slate-900">{item.name}</span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500">
                          {item.parentName ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium">
                              Parent: {item.parentName}
                            </span>
                          ) : item.metadataJson ? (
                            <code className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.metadataJson}
                            </code>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => handleToggleStatus(item)}
                            title={canManage ? 'Klik untuk ubah status aktif/nonaktif' : undefined}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                              item.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                            } ${!canManage ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                          >
                            {item.isActive ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            <span>{item.isActive ? 'Aktif' : 'Nonaktif'}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            {canManage ? (
                              <>
                                <button
                                  onClick={() => openEditModal(item)}
                                  title="Ubah Item"
                                  className="p-2 rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(item)}
                                  disabled={item.isSystem}
                                  title={
                                    item.isSystem
                                      ? 'Item sistem bawaan tidak bisa dihapus (nonaktifkan saja statusnya)'
                                      : 'Hapus Item'
                                  }
                                  className={`p-2 rounded-lg ${
                                    item.isSystem
                                      ? 'text-slate-300 cursor-not-allowed'
                                      : 'text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Read-only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editing ? 'Ubah Item Master Lookup' : 'Tambah Item Master Lookup'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Group Code</label>
                  <input
                    type="text"
                    required
                    list="lookup-group-suggestions"
                    disabled={Boolean(editing?.isSystem)}
                    placeholder="PRODUCT_CATEGORY"
                    value={form.groupCode}
                    onChange={(e) => setForm({ ...form, groupCode: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <datalist id="lookup-group-suggestions">
                    {groups.map((g) => (
                      <option key={g.groupCode} value={g.groupCode} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Item Code</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editing?.isSystem)}
                    placeholder="CLOUD_INFRA"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Label Tampilan (Name)</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Cloud & Infrastructure"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Deskripsi (Opsional)</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Parent Lookup (Opsional)
                  </label>
                  <select
                    value={form.parentId}
                    onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="">— Tanpa Parent —</option>
                    {parentCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
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
                  Metadata JSON (Opsional)
                </label>
                <input
                  type="text"
                  placeholder='{"color":"teal"}'
                  value={form.metadataJson}
                  onChange={(e) => setForm({ ...form, metadataJson: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {Object.keys(COLOR_DOT_MAP).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, metadataJson: JSON.stringify({ color: c }) })}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      <span className={`w-2 h-2 rounded-full ${COLOR_DOT_MAP[c]}`} />
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded text-teal-600"
                />
                <span>Aktif (tampil di dropdown form)</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Lookup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
