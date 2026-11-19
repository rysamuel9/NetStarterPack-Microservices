import type { WorkflowRequestItem } from '../types';
import { formatCurrency } from './formatters';

export const workflowStatusBadge = (status: string): string => {
  switch (status) {
    case 'Approved':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'InReview':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'RevisionRequested':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'Rejected':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const workflowStatusLabel = (req: WorkflowRequestItem): string => {
  switch (req.status) {
    case 'Approved':
      return 'Fully Approved';
    case 'InReview':
      return `Menunggu ${req.currentApproverRole || 'Approver'}`;
    case 'RevisionRequested':
      return 'Perlu Revisi Pemohon';
    case 'Rejected':
      return 'Ditolak (Rejected)';
    default:
      return 'Draft';
  }
};

export const formatWorkflowFieldValue = (type: string, val?: string): string => {
  if (!val) return '-';
  if (type === 'currency') {
    const num = Number(val);
    if (!Number.isNaN(num)) {
      return formatCurrency(num);
    }
  }
  return val;
};
