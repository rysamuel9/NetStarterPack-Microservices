import type { ThemeColors } from '@/core/theme/tokens';
import type { FormFieldDefinition } from '@/core/types';
import { formatCurrency, formatShortDate } from '@/shared/utils/formatters';

export function getWorkflowStatusLabel(status: string): string {
  switch (status) {
    case 'Draft':
      return 'Draft';
    case 'InReview':
      return 'Dalam Review';
    case 'RevisionRequested':
      return 'Perlu Revisi';
    case 'Approved':
      return 'Disetujui';
    case 'Rejected':
      return 'Ditolak';
    case 'Pending':
      return 'Menunggu';
    case 'Waiting':
      return 'Antrean';
    default:
      return status;
  }
}

export function getWorkflowStatusColors(status: string, colors: ThemeColors) {
  switch (status) {
    case 'Approved':
      return { bg: colors.successLight, fg: colors.success };
    case 'Rejected':
      return { bg: colors.dangerLight, fg: colors.danger };
    case 'RevisionRequested':
      return { bg: colors.warningLight, fg: colors.warning };
    case 'InReview':
    case 'Pending':
      return { bg: colors.infoLight, fg: colors.info };
    default:
      return { bg: colors.surfaceMuted, fg: colors.textSecondary };
  }
}

export function formatWorkflowFieldValue(
  field: FormFieldDefinition,
  rawValue?: string | null
): string {
  if (rawValue === undefined || rawValue === null || rawValue === '') return '-';

  if (field.type === 'currency') {
    const num = Number(rawValue.replace(/[^0-9.-]/g, ''));
    return Number.isNaN(num) ? rawValue : formatCurrency(num);
  }
  if (field.type === 'date') {
    return formatShortDate(rawValue);
  }
  return rawValue;
}
