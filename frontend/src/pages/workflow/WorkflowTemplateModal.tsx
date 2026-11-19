import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import type {
  ApiResult,
  ApprovalFlowStepDefinition,
  FormFieldDefinition,
  FormTemplateItem,
} from '../../types';

const AVAILABLE_APPROVER_ROLES = [
  'Manager',
  'ITLead',
  'HRManager',
  'FinanceDirector',
  'Admin',
];

const FIELD_TYPES = [
  { value: 'text', label: 'Teks Singkat (text)' },
  { value: 'textarea', label: 'Teks Panjang (textarea)' },
  { value: 'number', label: 'Angka (number)' },
  { value: 'currency', label: 'Nominal Rupiah (currency)' },
  { value: 'date', label: 'Tanggal (date)' },
  { value: 'select', label: 'Dropdown Pilihan (select)' },
];

interface WorkflowTemplateModalProps {
  onClose: () => void;
  onCreated: (template: FormTemplateItem) => void;
  onError: (message: string) => void;
}

export const WorkflowTemplateModal: React.FC<WorkflowTemplateModalProps> = ({
  onClose,
  onCreated,
  onError,
}) => {
  const [tplCode, setTplCode] = useState('');
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('Operasional');
  const [tplIcon, setTplIcon] = useState('FileText');
  const [tplDesc, setTplDesc] = useState('');
  const [tplFields, setTplFields] = useState<FormFieldDefinition[]>([
    { key: 'itemDetail', label: 'Detail Kebutuhan', type: 'text', required: true, placeholder: 'Masukkan detail...' },
    { key: 'estimatedBudget', label: 'Estimasi Biaya (Rp)', type: 'currency', required: true, placeholder: '2500000' },
  ]);
  const [tplSteps, setTplSteps] = useState<ApprovalFlowStepDefinition[]>([
    { stepOrder: 1, stepName: 'Approval Atasan Langsung', approverRole: 'Manager', description: 'Validasi kebutuhan operasional.' },
    { stepOrder: 2, stepName: 'Approval Budget Finance', approverRole: 'FinanceDirector', description: 'Persetujuan akhir anggaran.' },
  ]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      const normalizedSteps = tplSteps.map((s, idx) => ({ ...s, stepOrder: idx + 1 }));
      const res = await api.post<ApiResult<FormTemplateItem>>('/workflows/templates', {
        code: tplCode.trim().toUpperCase().replace(/\s+/g, '_'),
        name: tplName.trim(),
        category: tplCategory.trim(),
        icon: tplIcon,
        description: tplDesc.trim(),
        fields: tplFields,
        approvalFlow: normalizedSteps,
        isActive: true,
      });

      if (res.data.succeeded && res.data.data) {
        onCreated(res.data.data);
      } else {
        onError(res.data.message || 'Gagal membuat template form baru.');
      }
    } catch (err) {
      onError(getErrorMessage(err, 'Gagal membuat template form baru.'));
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Buat Template Form Dinamis Baru</h3>
            <p className="text-xs text-slate-500">
              Template ini langsung disimpan ke <code>FormTemplates</code> tanpa ubah kodingan atau bikin tabel baru.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateTemplate} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Unik *</label>
              <input
                required
                value={tplCode}
                onChange={(e) => setTplCode(e.target.value)}
                placeholder="REIMBURSEMENT_TRAVEL"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Formulir *</label>
              <input
                required
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Form Klaim Perjalanan Dinas"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori *</label>
              <input
                required
                value={tplCategory}
                onChange={(e) => setTplCategory(e.target.value)}
                placeholder="Finance & Travel"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ikon</label>
              <select
                value={tplIcon}
                onChange={(e) => setTplIcon(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="FileText">FileText</option>
                <option value="Laptop">Laptop</option>
                <option value="Calendar">Calendar</option>
                <option value="Briefcase">Briefcase</option>
                <option value="Package">Package</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat</label>
            <input
              value={tplDesc}
              onChange={(e) => setTplDesc(e.target.value)}
              placeholder="Jelaskan kegunaan formulir ini..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          {/* Builder Field Dinamis */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Daftar Field Formulir</span>
              <button
                type="button"
                onClick={() =>
                  setTplFields((prev) => [
                    ...prev,
                    { key: `field${prev.length + 1}`, label: `Field ${prev.length + 1}`, type: 'text', required: true },
                  ])
                }
                className="text-xs font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Field
              </button>
            </div>
            {tplFields.map((f, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  value={f.key}
                  onChange={(e) =>
                    setTplFields((prev) => prev.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item)))
                  }
                  placeholder="key"
                  className="col-span-3 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                />
                <input
                  value={f.label}
                  onChange={(e) =>
                    setTplFields((prev) => prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item)))
                  }
                  placeholder="Label Field"
                  className="col-span-4 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                />
                <select
                  value={f.type}
                  onChange={(e) =>
                    setTplFields((prev) => prev.map((item, i) => (i === idx ? { ...item, type: e.target.value } : item)))
                  }
                  className="col-span-3 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>
                      {ft.value}
                    </option>
                  ))}
                </select>
                <label className="col-span-1 flex items-center justify-center text-[10px] gap-0.5">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setTplFields((prev) => prev.map((item, i) => (i === idx ? { ...item, required: e.target.checked } : item)))
                    }
                  />
                  Wjb
                </label>
                <button
                  type="button"
                  onClick={() => setTplFields((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 text-rose-500 hover:text-rose-700 flex justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Builder Alur Approval */}
          <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-900">Tahapan Approval Berjenjang</span>
              <button
                type="button"
                onClick={() =>
                  setTplSteps((prev) => [
                    ...prev,
                    {
                      stepOrder: prev.length + 1,
                      stepName: `Approval Tahap ${prev.length + 1}`,
                      approverRole: 'FinanceDirector',
                      description: 'Review lanjutan.',
                    },
                  ])
                }
                className="text-xs font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Level Approval
              </button>
            </div>
            {tplSteps.map((s, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs font-bold text-teal-700">L{idx + 1}</span>
                <input
                  value={s.stepName}
                  onChange={(e) =>
                    setTplSteps((prev) => prev.map((item, i) => (i === idx ? { ...item, stepName: e.target.value } : item)))
                  }
                  placeholder="Nama Step"
                  className="col-span-6 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                />
                <select
                  value={s.approverRole}
                  onChange={(e) =>
                    setTplSteps((prev) => prev.map((item, i) => (i === idx ? { ...item, approverRole: e.target.value } : item)))
                  }
                  className="col-span-4 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {AVAILABLE_APPROVER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setTplSteps((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 text-rose-500 hover:text-rose-700 flex justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingTemplate}
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {savingTemplate ? 'Menyimpan...' : 'Simpan Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
