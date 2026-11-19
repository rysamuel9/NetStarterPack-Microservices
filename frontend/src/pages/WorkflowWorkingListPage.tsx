import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Clock,
  User,
  ShieldAlert,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { ApiResult, WorkflowRequestItem } from '../types';

export const WorkflowWorkingListPage: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<WorkflowRequestItem[]>([]);
  const [selected, setSelected] = useState<WorkflowRequestItem | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadWorkingList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResult<WorkflowRequestItem[]>>('/workflows/working-list');
      if (res.data.succeeded && res.data.data) {
        setItems(res.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat Working List dari Workflow.Api.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkingList();
  }, []);

  const handleAction = async (action: 'approve' | 'request-revision' | 'reject') => {
    if (!selected) return;
    if ((action === 'request-revision' || action === 'reject') && !comment.trim()) {
      setError(
        action === 'request-revision'
          ? 'Catatan revisi wajib diisi supaya pemohon tau bagian mana yang perlu diperbaiki.'
          : 'Alasan penolakan wajib diisi.'
      );
      return;
    }

    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<ApiResult<WorkflowRequestItem>>(`/workflows/${selected.id}/${action}`, {
        comment: comment.trim() || null,
      });

      if (res.data.succeeded && res.data.data) {
        const updated = res.data.data;
        const msg =
          action === 'approve'
            ? updated.status === 'Approved'
              ? `${updated.requestNumber} resmi FULLY APPROVED!`
              : `${updated.requestNumber} disetujui & diteruskan ke ${updated.currentApproverRole}.`
            : action === 'request-revision'
            ? `${updated.requestNumber} dikembalikan ke ${updated.requesterFullName} untuk direvisi.`
            : `${updated.requestNumber} ditolak (Rejected).`;

        setNotice(msg);
        setSelected(null);
        setComment('');
        await loadWorkingList();
      } else {
        setError(res.data.message || 'Aksi approval gagal.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memproses keputusan approval.'));
    } finally {
      setActing(false);
    }
  };

  const formatFieldValue = (type: string, val?: string) => {
    if (!val) return '-';
    if (type === 'currency') {
      const num = Number(val);
      if (!Number.isNaN(num)) {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0,
        }).format(num);
      }
    }
    return val;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 text-amber-800 mb-1.5">
            <span>Working List Inbox</span>
            <span>•</span>
            <span>Role Aktif: {user?.roles.join(', ')}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Working List (Approval)</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Daftar pengajuan yang posisinya sedang berhenti di meja role kamu dan menunggu keputusan.
          </p>
        </div>

        <button
          type="button"
          onClick={loadWorkingList}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Inbox ({items.length})</span>
        </button>
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

      {/* List Antrean */}
      {loading ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
          Memeriksa antrean approval di Workflow.Api...
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900">Working List Kosong — Semua Beres!</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Saat ini belum ada pengajuan yang menunggu persetujuan untuk role{' '}
            <strong>{user?.roles.join(', ')}</strong>. Coba login sebagai <code>staff</code> buat submit form baru, atau cek halaman Tracking.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((req) => {
            const activeStep = req.approvalSteps.find((s) => s.stepOrder === req.currentStepOrder);
            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-teal-400 p-5 shadow-xs transition-all flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-900 text-white">
                      {req.requestNumber}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                      {req.templateName}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800">
                      Step {req.currentStepOrder}/{req.totalSteps}: {activeStep?.stepName || req.currentApproverRole}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{req.title}</h3>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Pemohon: <strong className="text-slate-700">{req.requesterFullName}</strong> (@{req.requesterUsername})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Disubmit:{' '}
                      {req.submittedAt
                        ? new Date(req.submittedAt).toLocaleString('id-ID')
                        : new Date(req.createdAt).toLocaleString('id-ID')}
                    </span>
                  </div>

                  {/* Ringkasan 3 field pertama */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {req.templateFields.slice(0, 3).map((field) => (
                      <span
                        key={field.key}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700"
                      >
                        <span className="text-slate-400">{field.label}:</span>{' '}
                        <strong>{formatFieldValue(field.type, req.formData[field.key])}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(req);
                      setComment('');
                      setError(null);
                    }}
                    className="w-full lg:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm font-semibold shadow-sm"
                  >
                    Review &amp; Proses Approval
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Review & Keputusan Approval */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl my-8 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-mono font-bold">
                    {selected.requestNumber}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 text-xs font-semibold">
                    {selected.templateName}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{selected.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Diajukan oleh <strong>{selected.requesterFullName}</strong> (@{selected.requesterUsername})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Isi Form Dinamis */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Isi Formulir Pengajuan
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selected.templateFields.map((field) => (
                  <div
                    key={field.key}
                    className={`p-3 rounded-xl bg-slate-50 border border-slate-200 ${
                      field.type === 'textarea' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-slate-500">{field.label}</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5 whitespace-pre-wrap">
                      {formatFieldValue(field.type, selected.formData[field.key])}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Approval Steps */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Posisi Alur Persetujuan
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {selected.approvalSteps.map((step) => {
                  const isApproved = step.status === 'Approved';
                  const isPending = step.status === 'Pending';
                  return (
                    <div
                      key={step.id}
                      className={`p-3 rounded-xl border text-xs ${
                        isApproved
                          ? 'bg-emerald-50 border-emerald-200'
                          : isPending
                          ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20'
                          : 'bg-slate-50 border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>Step {step.stepOrder}: {step.approverRole}</span>
                        <span>{isApproved ? 'OK' : isPending ? 'GILIRANMU' : 'MENUNGGU'}</span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{step.stepName}</p>
                      {step.actionByFullName && (
                        <p className="text-[11px] text-emerald-700 mt-1">
                          Oleh {step.actionByFullName}
                          {step.comment ? ` — "${step.comment}"` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Input Catatan */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Catatan / Komentar Approver (Opsional untuk Approve, Wajib untuk Revisi &amp; Reject)
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tulis catatan persetujuan, arahan revisi, atau alasan penolakan..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Anti-Self-Approval info if somehow superadmin inspects own doc */}
            {selected.requesterUserId === user?.id && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Catatan keamanan: Kamu pembuat form ini. Sistem backend memblokir Anti-Self-Approval (403).</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={() => handleAction('reject')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject Final</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => handleAction('request-revision')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Minta Revisi</span>
                </button>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => handleAction('approve')}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{acting ? 'Memproses...' : 'Approve Step Ini'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
