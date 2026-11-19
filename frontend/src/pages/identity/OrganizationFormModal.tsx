import React from 'react';
import { X } from 'lucide-react';
import type { DirectorateItem, DivisionItem, UserItem } from '../../types';

export type OrganizationModalKind = 'directorate' | 'division' | 'department' | 'position';

interface OrganizationFormModalProps {
  modalKind: OrganizationModalKind;
  editingId: string | null;
  formCode: string;
  formName: string;
  formDesc: string;
  formParentId: string;
  formHeadUserId: string;
  formLevel: number;
  saving: boolean;
  directorates: DirectorateItem[];
  divisions: DivisionItem[];
  users: UserItem[];
  onChangeCode: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeDesc: (value: string) => void;
  onChangeParentId: (value: string) => void;
  onChangeHeadUserId: (value: string) => void;
  onChangeLevel: (value: number) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const OrganizationFormModal: React.FC<OrganizationFormModalProps> = ({
  modalKind,
  editingId,
  formCode,
  formName,
  formDesc,
  formParentId,
  formHeadUserId,
  formLevel,
  saving,
  directorates,
  divisions,
  users,
  onChangeCode,
  onChangeName,
  onChangeDesc,
  onChangeParentId,
  onChangeHeadUserId,
  onChangeLevel,
  onClose,
  onSubmit,
}) => {
  const entityLabel =
    modalKind === 'directorate'
      ? 'Direktorat'
      : modalKind === 'division'
      ? 'Divisi'
      : modalKind === 'department'
      ? 'Departemen'
      : 'Posisi';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">
            {editingId ? 'Edit' : 'Tambah'} Master {entityLabel}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
          {modalKind === 'division' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Direktorat Induk *</label>
              <select
                required
                value={formParentId}
                onChange={(e) => onChangeParentId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {directorates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
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
                onChange={(e) => onChangeParentId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {divisions.map((dv) => (
                  <option key={dv.id} value={dv.id}>
                    {dv.name} — {dv.directorateName}
                  </option>
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
                onChange={(e) => onChangeCode(e.target.value)}
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
                  onChange={(e) => onChangeLevel(Number(e.target.value))}
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
              onChange={(e) => onChangeName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          {modalKind !== 'position' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kepala / Bos (User)</label>
              <select
                value={formHeadUserId}
                onChange={(e) => onChangeHeadUserId(e.target.value)}
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
              onChange={(e) => onChangeDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-sm">
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
