import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FilePlus2,
  GitBranch,
  Lock,
  RotateCcw,
  User,
  X,
  XCircle,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, WorkflowRequestItem } from '@/core/types';
import {
  formatWorkflowFieldValue,
  getWorkflowStatusColors,
  getWorkflowStatusLabel,
} from '@/features/workflow/workflowMeta';
import { formatDateTime } from '@/shared/utils/formatters';

type ApprovalActionType = 'approve' | 'request-revision' | 'reject';

export default function ApprovalsTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canApprove = hasPermission('Workflows.Approve');
  const canCreate = hasPermission('Workflows.Create');
  const canViewTracking = hasPermission('Workflows.View');

  const [selected, setSelected] = useState<WorkflowRequestItem | null>(null);
  const [comment, setComment] = useState('');

  const workingListQuery = useQuery({
    queryKey: ['workflows', 'working-list'],
    enabled: canApprove,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<WorkflowRequestItem[]>>('/workflows/working-list');
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat antrean approval.');
      }
      return res.data.data;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
      note,
    }: {
      id: string;
      action: ApprovalActionType;
      note: string | null;
    }) => {
      const res = await apiClient.post<ApiResult<WorkflowRequestItem>>(
        `/workflows/${id}/${action}`,
        { comment: note }
      );
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Aksi approval gagal diproses.');
      }
      return { action, updated: res.data.data };
    },
    onSuccess: ({ action, updated }) => {
      setSelected(null);
      setComment('');
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });

      const msg =
        action === 'approve'
          ? updated.status === 'Approved'
            ? `${updated.requestNumber} resmi FULLY APPROVED!`
            : `${updated.requestNumber} disetujui & diteruskan ke ${updated.currentApproverRole}.`
          : action === 'request-revision'
            ? `${updated.requestNumber} dikembalikan ke ${updated.requesterFullName} untuk revisi.`
            : `${updated.requestNumber} ditolak (Rejected).`;
      Alert.alert('Keputusan Tersimpan', msg);
    },
    onError: (err) => {
      Alert.alert('Gagal Memproses', getErrorMessage(err));
    },
  });

  const triggerAction = (action: ApprovalActionType) => {
    if (!selected) return;
    if ((action === 'request-revision' || action === 'reject') && !comment.trim()) {
      Alert.alert(
        'Catatan Wajib Diisi',
        action === 'request-revision'
          ? 'Isi catatan revisi agar pemohon tahu bagian mana yang perlu diperbaiki.'
          : 'Isi alasan penolakan terlebih dahulu.'
      );
      return;
    }

    const label =
      action === 'approve'
        ? 'Setujui Pengajuan'
        : action === 'request-revision'
          ? 'Minta Revisi'
          : 'Tolak Pengajuan';

    Alert.alert(label, `Proses ${selected.requestNumber} (${selected.title})?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Lanjutkan',
        style: action === 'reject' ? 'destructive' : 'default',
        onPress: () =>
          actionMutation.mutate({
            id: selected.id,
            action,
            note: comment.trim() || null,
          }),
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header & Quick Links */}
      <View style={styles.headerBlock}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.text }]}>Workflow Approval</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
              Working List • Role: {user?.roles.join(', ')}
            </Text>
          </View>
          {canApprove ? (
            <View style={[styles.countPill, { backgroundColor: colors.warningLight }]}>
              <Text style={[styles.countPillText, { color: colors.warning }]}>
                {workingListQuery.data?.length ?? 0} Pending
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.quickBtnRow}>
          {canCreate ? (
            <Pressable
              onPress={() => router.push('/(modules)/workflow-create')}
              style={[styles.quickBtn, { backgroundColor: colors.primary }]}
            >
              <FilePlus2 size={15} color={colors.primaryForeground} />
              <Text style={[styles.quickBtnText, { color: colors.primaryForeground }]}>
                Buat Pengajuan
              </Text>
            </Pressable>
          ) : null}
          {canViewTracking ? (
            <Pressable
              onPress={() => router.push('/(modules)/workflow-tracking')}
              style={[
                styles.quickBtn,
                { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <GitBranch size={15} color={colors.primary} />
              <Text style={[styles.quickBtnText, { color: colors.text }]}>Tracking List</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!canApprove ? (
        <View style={styles.padWrap}>
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surfaceMuted }]}>
              <Lock size={26} color={colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Tidak Memiliki Akses Approval
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Role akun kamu tidak punya permission Workflows.Approve. Gunakan tombol di atas untuk
              membuat pengajuan baru atau memantau status di Tracking List.
            </Text>
          </View>
        </View>
      ) : workingListQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Memeriksa antrean approval...
          </Text>
        </View>
      ) : workingListQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.emptyTitle, { color: colors.danger }]}>Gagal Memuat Working List</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {getErrorMessage(workingListQuery.error)}
          </Text>
          <Pressable
            onPress={() => void workingListQuery.refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.quickBtnText, { color: colors.primaryForeground }]}>Coba Lagi</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={workingListQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={workingListQuery.isRefetching}
              onRefresh={() => void workingListQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.iconCircle, { backgroundColor: colors.successLight }]}>
                <ClipboardCheck size={28} color={colors.success} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Working List Kosong — Semua Beres!
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Belum ada pengajuan yang berhenti di meja role kamu. Coba buat pengajuan baru atau
                tarik ke bawah untuk menyegarkan.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const activeStep = item.approvalSteps.find((s) => s.stepOrder === item.currentStepOrder);
            return (
              <Pressable
                onPress={() => {
                  setSelected(item);
                  setComment('');
                }}
                style={[styles.reqCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.reqTopRow}>
                  <View style={[styles.reqNoBadge, { backgroundColor: '#0F172A' }]}>
                    <Text style={styles.reqNoText}>{item.requestNumber}</Text>
                  </View>
                  <View style={[styles.stepBadge, { backgroundColor: colors.warningLight }]}>
                    <Clock size={11} color={colors.warning} />
                    <Text style={[styles.stepBadgeText, { color: colors.warning }]}>
                      Step {item.currentStepOrder}/{item.totalSteps}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.reqTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.templateLine, { color: colors.primary }]}>
                  {item.templateName} • {activeStep?.stepName || item.currentApproverRole}
                </Text>

                <View style={styles.metaRow}>
                  <User size={13} color={colors.textMuted} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    {item.requesterFullName} (@{item.requesterUsername})
                  </Text>
                </View>

                {item.templateFields.slice(0, 2).map((field) => (
                  <View key={field.key} style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                      {field.label}:
                    </Text>
                    <Text numberOfLines={1} style={[styles.previewValue, { color: colors.text }]}>
                      {formatWorkflowFieldValue(field, item.formData[field.key])}
                    </Text>
                  </View>
                ))}

                <View style={[styles.cardCtaBar, { borderTopColor: colors.border }]}>
                  <Text style={[styles.dateText, { color: colors.textMuted }]}>
                    {formatDateTime(item.submittedAt || item.createdAt)}
                  </Text>
                  <Text style={[styles.ctaLink, { color: colors.primary }]}>
                    Tinjau & Proses →
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Approval Action Bottom Sheet Modal */}
      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalCode, { color: colors.primary }]}>
                  {selected?.requestNumber} • {selected?.templateName}
                </Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{selected?.title}</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
                Pemohon: {selected?.requesterFullName} (@{selected?.requesterUsername})
              </Text>

              {/* Dynamic Form Data */}
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                  DATA FORMULIR
                </Text>
                {selected?.templateFields.map((field) => (
                  <View key={field.key} style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                      {field.label}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatWorkflowFieldValue(field, selected.formData[field.key])}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Vertical Stepper */}
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                  ALUR PERSETUJUAN
                </Text>
                {selected?.approvalSteps.map((step) => {
                  const stColor = getWorkflowStatusColors(step.status, colors);
                  return (
                    <View key={step.id} style={styles.stepperRow}>
                      <View style={[styles.stepDot, { backgroundColor: stColor.fg }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepTitle, { color: colors.text }]}>
                          {step.stepOrder}. {step.stepName} ({step.approverRole})
                        </Text>
                        {step.comment ? (
                          <Text style={[styles.stepComment, { color: colors.textSecondary }]}>
                            “{step.comment}” — {step.actionByFullName}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.miniStatusPill, { backgroundColor: stColor.bg }]}>
                        <Text style={[styles.miniStatusText, { color: stColor.fg }]}>
                          {getWorkflowStatusLabel(step.status)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Comment Input */}
              <View style={{ gap: 6 }}>
                <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                  CATATAN APPROVER (WAJIB UNTUK REVISI / TOLAK)
                </Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  numberOfLines={3}
                  placeholder="Tulis catatan persetujuan, revisi, atau alasan penolakan..."
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.commentInput,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              {/* 3 Decision Buttons */}
              <View style={styles.decisionRow}>
                <Pressable
                  onPress={() => triggerAction('approve')}
                  disabled={actionMutation.isPending}
                  style={[styles.decisionBtn, { backgroundColor: colors.success }]}
                >
                  {actionMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <CheckCircle2 size={16} color="#FFFFFF" />
                      <Text style={styles.decisionText}>Setujui</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => triggerAction('request-revision')}
                  disabled={actionMutation.isPending}
                  style={[styles.decisionBtn, { backgroundColor: colors.warning }]}
                >
                  <RotateCcw size={16} color="#FFFFFF" />
                  <Text style={styles.decisionText}>Revisi</Text>
                </Pressable>

                <Pressable
                  onPress={() => triggerAction('reject')}
                  disabled={actionMutation.isPending}
                  style={[styles.decisionBtn, { backgroundColor: colors.danger }]}
                >
                  <XCircle size={16} color="#FFFFFF" />
                  <Text style={styles.decisionText}>Tolak</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pageTitle: { fontSize: 22, fontWeight: '800' },
  pageSubtitle: { fontSize: 12, marginTop: 2 },
  countPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  countPillText: { fontSize: 11, fontWeight: '800' },
  quickBtnRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  quickBtnText: { fontSize: 13, fontWeight: '700' },
  padWrap: { padding: 16 },
  listContent: { padding: 16, gap: 12, paddingBottom: 28 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, marginTop: 4 },
  emptyCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 26,
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  reqCard: { borderWidth: 1, borderRadius: radius.xl, padding: 15, gap: 6 },
  reqTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reqNoBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.sm },
  reqNoText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  stepBadgeText: { fontSize: 11, fontWeight: '700' },
  reqTitle: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  templateLine: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaText: { fontSize: 12 },
  previewRow: { flexDirection: 'row', gap: 6 },
  previewLabel: { fontSize: 12, fontWeight: '600' },
  previewValue: { flex: 1, fontSize: 12, fontWeight: '500' },
  cardCtaBar: {
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: { fontSize: 11 },
  ctaLink: { fontSize: 12, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  modalCode: { fontSize: 11, fontWeight: '700' },
  modalTitle: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  modalBody: { gap: 12, paddingBottom: 24 },
  sectionCaption: { fontSize: 12, fontWeight: '600' },
  detailBox: { borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 8 },
  detailSectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  detailField: { gap: 2 },
  detailLabel: { fontSize: 11, fontWeight: '600' },
  detailValue: { fontSize: 13, fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: radius.full },
  stepTitle: { fontSize: 12, fontWeight: '700' },
  stepComment: { fontSize: 11, fontStyle: 'italic', marginTop: 1 },
  miniStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  miniStatusText: { fontSize: 10, fontWeight: '700' },
  commentInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 74,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  decisionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  decisionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  decisionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
