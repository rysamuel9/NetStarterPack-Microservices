import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FilePlus2,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { DynamicIcon } from '../../components/DynamicIcon';
import { formatRupiahHint } from '../../utils/formatters';
import { WorkflowTemplateModal } from './WorkflowTemplateModal';
import type { ApiResult, FormTemplateItem, WorkflowRequestItem } from '../../types';

export const WorkflowCreatePage: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<FormTemplateItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [title, setTitle] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const canManageTemplates = hasPermission('Workflows.ManageTemplates');

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResult<FormTemplateItem[]>>('/workflows/templates');
      if (res.data.succeeded && res.data.data) {
        setTemplates(res.data.data);
        if (res.data.data.length > 0 && !selectedCode) {
          setSelectedCode(res.data.data[0].code);
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat template form dari Workflow.Api (:5084).'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const selectedTemplate = templates.find((t) => t.code === selectedCode) ?? null;

  const handleSelectTemplate = (code: string) => {
    setSelectedCode(code);
    setFormData({});
    setError(null);
    setSuccessMsg(null);
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmitForm = async (submitImmediately: boolean) => {
    if (!selectedTemplate) return;
    if (!title.trim()) {
      setError('Judul pengajuan wajib diisi dulu ya.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await api.post<ApiResult<WorkflowRequestItem>>('/workflows', {
        templateCode: selectedTemplate.code,
        title: title.trim(),
        formData,
        submitImmediately,
      });

      if (res.data.succeeded && res.data.data) {
        const created = res.data.data;
        setSuccessMsg(
          submitImmediately
            ? `Pengajuan ${created.requestNumber} berhasil disubmit! Sekarang sedang antre di ${created.currentApproverRole}.`
            : `Draft ${created.requestNumber} berhasil disimpan. Bisa dilanjutkan kapan aja di menu Tracking.`
        );
        setTitle('');
        setFormData({});
      } else {
        setError(res.data.errors?.join(' • ') || res.data.message || 'Gagal menyimpan pengajuan.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengirim pengajuan ke Workflow.Api.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTemplateCreated = async (created: FormTemplateItem) => {
    setTemplateModalOpen(false);
    await loadTemplates();
    setSelectedCode(created.code);
    setSuccessMsg(`Template baru "${created.name}" berhasil dibuat & langsung siap dipakai!`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-violet-100 text-violet-800 mb-1.5">
            <span>Workflow.Api (:5084)</span>
            <span>•</span>
            <span>Schema-Driven Dynamic Form</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Buat Pengajuan Form</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pilih tipe dokumen di bawah—field formulir &amp; urutan approver bakal menyesuaikan otomatis dari database.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageTemplates && (
            <button
              type="button"
              onClick={() => setTemplateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Template Form Baru</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/workflow-tracking')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold transition-colors"
          >
            <span>Lihat Tracking List</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/workflow-tracking')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
          >
            Buka Tracking Pengajuan &rarr;
          </button>
        </div>
      )}

      {/* Step 1: Pilih Tipe Dokumen */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          1. Pilih Tipe Dokumen / Formulir
        </h2>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
            Memuat template formulir dinamis dari Workflow.Api...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((tpl) => {
              const active = tpl.code === selectedCode;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl.code)}
                  className={`text-left p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    active
                      ? 'bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-teal-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <DynamicIcon name={tpl.icon || 'FileText'} className="w-5 h-5" />
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                        {tpl.category}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">{tpl.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tpl.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{tpl.fields.length} field dinamis</span>
                    <span className="font-semibold text-teal-700">
                      {tpl.approvalFlow.length} tahap approval
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2: Dynamic Form + Live Approval Chain Preview */}
      {selectedTemplate && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <FilePlus2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">{selectedTemplate.name}</h2>
                  <p className="text-xs text-slate-500 font-mono">Template Code: {selectedTemplate.code}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                Validasi Backend Aktif
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Judul Pengajuan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Contoh: ${selectedTemplate.name} untuk Tim Backend Q4`}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedTemplate.fields.map((field) => {
                const value = formData[field.key] ?? '';
                const isFullWidth = field.type === 'textarea';
                return (
                  <div key={field.key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {field.label}{' '}
                      {field.required && <span className="text-rose-500">*</span>}
                    </label>

                    {field.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        placeholder={field.placeholder || ''}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-teal-500"
                      >
                        <option value="">-- Pilih {field.label} --</option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'date' ? (
                      <input
                        type="date"
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
                      />
                    ) : field.type === 'number' || field.type === 'currency' ? (
                      <div>
                        <input
                          type="number"
                          value={value}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          placeholder={field.placeholder || '0'}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
                        />
                        {field.type === 'currency' && value && formatRupiahHint(value) && (
                          <p className="text-[11px] text-teal-700 font-semibold mt-1">
                            Terbaca: {formatRupiahHint(value)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        placeholder={field.placeholder || ''}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmitForm(false)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Simpan sebagai Draft</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmitForm(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm font-semibold shadow-md shadow-teal-600/20 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Mengirim...' : 'Submit Pengajuan Sekarang'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-slate-900 text-sm">Preview Alur Approval</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Saat kamu klik <strong>Submit</strong>, dokumen otomatis berjalan berurutan lewat approver berikut:
              </p>

              <div className="space-y-3">
                {selectedTemplate.approvalFlow.map((step, idx) => (
                  <div key={step.stepOrder} className="relative pl-8 pb-3 last:pb-0">
                    {idx < selectedTemplate.approvalFlow.length - 1 && (
                      <div className="absolute left-3 top-7 bottom-0 w-0.5 bg-teal-200" />
                    )}
                    <div className="absolute left-0 top-0.5 w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                      {step.stepOrder}
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">{step.stepName}</span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100 text-teal-800">
                          {step.approverRole}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 text-slate-200 rounded-2xl p-5 border border-slate-800 text-xs space-y-2">
              <div className="flex items-center gap-2 text-teal-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Security Guard Aktif di Backend</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                <li><strong>Schema Validation:</strong> Field bertanda wajib divalidasi ulang di server (anti-bypass Postman).</li>
                <li><strong>Anti-Self-Approval:</strong> Pembuat form tidak bisa menyetujui pengajuannya sendiri.</li>
                <li><strong>Strict Step Guard:</strong> Approver L2/L3 tidak bisa melompati antrean sebelum L1 approve.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {templateModalOpen && (
        <WorkflowTemplateModal
          onClose={() => setTemplateModalOpen(false)}
          onCreated={handleTemplateCreated}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
};
