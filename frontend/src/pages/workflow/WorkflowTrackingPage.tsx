import React, { useEffect, useState } from 'react';
import {
  GitBranch,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  FileEdit,
  Eye,
  X,
  RefreshCw,
  AlertCircle,
  Send,
  History,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  formatWorkflowFieldValue as formatFieldValue,
  workflowStatusBadge as statusBadge,
  workflowStatusLabel as statusLabel,
} from '../../utils/workflowMeta';
import type { ApiResult, WorkflowRequestItem } from '../../types';

export const WorkflowTrackingPage: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<WorkflowRequestItem[]>([]);
  const [scope, setScope] = useState<'all' | 'mine' | 'involved'>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [detailItem, setDetailItem] = useState<WorkflowRequestItem | null>(null);

  // Edit & Resubmit modal (for Draft or RevisionRequested owned by current user)
  const [resubmitItem, setResubmitItem] = useState<WorkflowRequestItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [resubmitNotes, setResubmitNotes] = useState('');
  const [resubmitting, setResubmitting] = useState(false);

  const loadTracking = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (scope !== 'all') params.set('scope', scope);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get<ApiResult<WorkflowRequestItem[]>>(
        `/workflows/tracking?${params.toString()}`
      );
      if (res.data.succeeded && res.data.data) {
        setItems(res.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat Tracking List dari Workflow.Api.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracking();
  }, [scope, statusFilter]);

  const openResubmitModal = (req: WorkflowRequestItem) => {
    setResubmitItem(req);
    setEditTitle(req.title);
    setEditFormData({ ...req.formData });
    setResubmitNotes('');
    setError(null);
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resubmitItem) return;
    setResubmitting(true);
    setError(null);
    try {
      const res = await api.put<ApiResult<WorkflowRequestItem>>(
        `/workflows/${resubmitItem.id}/resubmit`,
        {
          title: editTitle.trim(),
          formData: editFormData,
          resubmitNotes: resubmitNotes.trim() || 'Revisi sudah diperbaiki dan disubmit ulang.',
        }
      );

      if (res.data.succeeded && res.data.data) {
        setNotice(
          `${res.data.data.requestNumber} berhasil disubmit ulang! Sekarang antre di ${res.data.data.currentApproverRole}.`
        );
        setResubmitItem(null);
        await loadTracking();
      } else {
        setError(res.data.errors?.join(' • ') || res.data.message || 'Gagal resubmit pengajuan.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengirim revisi pengajuan.'));
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-100 text-teal-800 mb-1.5">
            <GitBranch className="w-3 h-3" />
            <span>Live Approval Stepper &amp; History Log</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tracking Pengajuan</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pantau posisi setiap pengajuan secara real-time—tahu persis sedang berhenti di approver mana.
          </p>
        </div>

        <button
          type="button"
          onClick={loadTracking}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'Semua Pengajuan' },
            { id: 'mine', label: 'Pengajuan Saya' },
            { id: 'involved', label: 'Pernah Saya Proses' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id as 'all' | 'mine' | 'involved')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                scope === tab.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
          >
            <option value="">Semua Status</option>
            <option value="InReview">In Review (Sedang Diproses)</option>
            <option value="Approved">Fully Approved</option>
            <option value="RevisionRequested">Perlu Revisi</option>
            <option value="Rejected">Rejected</option>
            <option value="Draft">Draft</option>
          </select>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadTracking();
            }}
            className="relative"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor / judul / pemohon..."
              className="pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs w-56 focus:outline-none focus:border-teal-500"
            />
          </form>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tracking Cards with Visual Approval Stepper */}
      {loading ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
          Memuat data tracking dari Workflow.Api...
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
          Belum ada pengajuan yang cocok dengan filter ini.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((req) => {
            const canResubmit =
              (req.status === 'Draft' || req.status === 'RevisionRequested') &&
              (req.requesterUserId === user?.id || req.requesterUsername === user?.username);

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
              >
                {/* Top Row */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
                        {req.requestNumber}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                        {req.templateName}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge(
                          req.status
                        )}`}
                      >
                        {statusLabel(req)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1.5">{req.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pemohon: <strong>{req.requesterFullName}</strong> (@{req.requesterUsername}) • Dibuat{' '}
                      {new Date(req.createdAt).toLocaleString('id-ID')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canResubmit && (
                      <button
                        type="button"
                        onClick={() => openResubmitModal(req)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Edit &amp; Submit Ulang</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailItem(req)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 text-xs font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detail &amp; Riwayat</span>
                    </button>
                  </div>
                </div>

                {/* Visual Approval Stepper */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {req.approvalSteps.map((step) => {
                      const isApproved = step.status === 'Approved';
                      const isPending = step.status === 'Pending';
                      const isRevision = step.status === 'RevisionRequested';
                      const isRejected = step.status === 'Rejected';

                      return (
                        <div
                          key={step.id}
                          className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                            isApproved
                              ? 'bg-emerald-50/80 border-emerald-200'
                              : isPending
                              ? 'bg-cyan-50 border-cyan-400 ring-2 ring-cyan-400/20'
                              : isRevision
                              ? 'bg-amber-50 border-amber-300'
                              : isRejected
                              ? 'bg-rose-50 border-rose-300'
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isApproved ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : isPending ? (
                              <Clock className="w-4 h-4 text-cyan-600 animate-pulse" />
                            ) : isRevision ? (
                              <RotateCcw className="w-4 h-4 text-amber-600" />
                            ) : isRejected ? (
                              <XCircle className="w-4 h-4 text-rose-600" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-slate-900 truncate">
                                L{step.stepOrder}: {step.approverRole}
                              </span>
                              <span className="text-[10px] font-bold uppercase">
                                {isPending ? 'AKTIF' : step.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 truncate">{step.stepName}</p>
                            {step.actionByFullName && (
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                                {step.actionByFullName}
                                {step.comment ? ` • "${step.comment}"` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail & Full History Modal */}
      {detailItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl my-8 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-mono font-bold">
                    {detailItem.requestNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold border ${statusBadge(
                      detailItem.status
                    )}`}
                  >
                    {statusLabel(detailItem)}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{detailItem.title}</h3>
                <p className="text-xs text-slate-500">
                  {detailItem.templateName} • Pemohon: {detailItem.requesterFullName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dynamic Form Values */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Data Formulir Dinamis
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {detailItem.templateFields.map((field) => (
                  <div
                    key={field.key}
                    className={`p-3 rounded-xl bg-slate-50 border border-slate-200 ${
                      field.type === 'textarea' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-slate-500">{field.label}</p>
                    <p className="text-sm text-slate-900 font-medium mt-0.5 whitespace-pre-wrap">
                      {formatFieldValue(field.type, detailItem.formData[field.key])}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Immutable History Log */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <History className="w-4 h-4 text-teal-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Riwayat Audit &amp; Transisi Status (Immutable)
                </h4>
              </div>
              <div className="space-y-2.5">
                {detailItem.historyLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-mono font-bold text-[10px]">
                          {log.action}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {log.actorFullName} ({log.actorRole})
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1">{log.notes}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Transisi: {log.fromStatus} &rarr; {log.toStatus}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {new Date(log.timestamp).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit & Submit Ulang (Draft / RevisionRequested) */}
      {resubmitItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Edit &amp; Submit Ulang ({resubmitItem.requestNumber})
                </h3>
                <p className="text-xs text-slate-500">
                  Perbaiki field yang diminta approver lalu kirim kembali ke jalur approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResubmitItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Pengajuan *</label>
                <input
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {resubmitItem.templateFields.map((field) => {
                  const val = editFormData[field.key] ?? '';
                  return (
                    <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={val}
                          onChange={(e) =>
                            setEditFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={val}
                          onChange={(e) =>
                            setEditFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                        >
                          <option value="">-- Pilih --</option>
                          {(field.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : 'text'}
                          value={val}
                          onChange={(e) =>
                            setEditFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Revisi untuk Approver
                </label>
                <input
                  value={resubmitNotes}
                  onChange={(e) => setResubmitNotes(e.target.value)}
                  placeholder="Contoh: Sudah diperbaiki spesifikasi dan estimasi harga sesuai arahan."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResubmitItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={resubmitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{resubmitting ? 'Mengirim...' : 'Submit Ulang Pengajuan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
