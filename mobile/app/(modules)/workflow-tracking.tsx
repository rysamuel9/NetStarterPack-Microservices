import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
  ArrowLeft,
  Database,
  FileEdit,
  FilePlus2,
  GitBranch,
  History,
  Search,
  Send,
  X,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, WorkflowRequestItem } from '@/core/types';
import { DynamicFieldInput } from '@/features/workflow/DynamicFieldInput';
import {
  formatWorkflowFieldValue,
  getWorkflowStatusColors,
  getWorkflowStatusLabel,
} from '@/features/workflow/workflowMeta';
import { formatDateTime } from '@/shared/utils/formatters';

type ScopeType = 'all' | 'mine' | 'involved';

const SCOPE_TABS: Array<{ id: ScopeType; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'mine', label: 'Saya Ajukan' },
  { id: 'involved', label: 'Pernah Proses' },
];

const STATUS_FILTERS = ['Semua', 'InReview', 'Approved', 'RevisionRequested', 'Rejected', 'Draft'];

export default function WorkflowTrackingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission('Workflows.Create');

  const [scope, setScope] = useState<ScopeType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [search, setSearch] = useState('');

  const [detailItem, setDetailItem] = useState<WorkflowRequestItem | null>(null);

  // Resubmit modal state
  const [resubmitItem, setResubmitItem] = useState<WorkflowRequestItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [resubmitNotes, setResubmitNotes] = useState('');

  const trackingQuery = useQuery({
    queryKey: ['workflows', 'tracking', scope, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (scope !== 'all') params.scope = scope;
      if (statusFilter !== 'Semua') params.status = statusFilter;

      const res = await apiClient.get<ApiResult<WorkflowRequestItem[]>>('/workflows/tracking', {
        params,
      });
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat tracking pengajuan.');
      }
      return res.data.data;
    },
  });

  const resubmitMutation = useMutation({
    mutationFn: async () => {
      if (!resubmitItem) throw new Error('Item tidak valid.');
      const res = await apiClient.put<ApiResult<WorkflowRequestItem>>(
        `/workflows/${resubmitItem.id}/resubmit`,
        {
          title: editTitle.trim(),
          formData: editFormData,
          resubmitNotes: resubmitNotes.trim() || 'Revisi sudah diperbaiki dan disubmit ulang.',
        }
      );
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(
          res.data.errors?.join(' • ') || res.data.message || 'Gagal resubmit pengajuan.'
        );
      }
      return res.data.data;
    },
    onSuccess: (updated) => {
      setResubmitItem(null);
      setDetailItem(null);
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
      Alert.alert(
        'Resubmit Berhasil',
        `${updated.requestNumber} kembali masuk antrean ${updated.currentApproverRole}.`
      );
    },
    onError: (err) => {
      Alert.alert('Gagal Resubmit', getErrorMessage(err));
    },
  });

  const filteredItems = useMemo(() => {
    const items = trackingQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (x) =>
        x.requestNumber.toLowerCase().includes(term) ||
        x.title.toLowerCase().includes(term) ||
        x.templateName.toLowerCase().includes(term) ||
        x.requesterFullName.toLowerCase().includes(term)
    );
  }, [trackingQuery.data, search]);

  const openResubmit = (item: WorkflowRequestItem) => {
    setDetailItem(null);
    setResubmitItem(item);
    setEditTitle(item.title);
    setEditFormData({ ...item.formData });
    setResubmitNotes('');
  };

  const canResubmit = (item?: WorkflowRequestItem | null) =>
    Boolean(
      item &&
        item.requesterUserId === user?.id &&
        (item.status === 'Draft' || item.status === 'RevisionRequested')
    );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Tracking Pengajuan</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Workflow.Api (:5084) • Live Stepper & History
            </Text>
          </View>
        </View>
        {canCreate ? (
          <Pressable
            onPress={() => router.push('/(modules)/workflow-create')}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <FilePlus2 size={15} color={colors.primaryForeground} />
            <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Ajukan</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Scope Tabs, Search, Status Chips */}
      <View style={styles.filterBlock}>
        <View style={styles.scopeRow}>
          {SCOPE_TABS.map((tab) => {
            const active = scope === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setScope(tab.id)}
                style={[
                  styles.scopeChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.scopeText,
                    { color: active ? colors.primaryForeground : colors.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nomor request, judul, pemohon..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {STATUS_FILTERS.map((st) => {
            const active = statusFilter === st;
            return (
              <Pressable
                key={st}
                onPress={() => setStatusFilter(st)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primaryLight : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {st === 'Semua' ? 'Semua Status' : getWorkflowStatusLabel(st)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      {trackingQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            Memuat tracking pengajuan...
          </Text>
        </View>
      ) : trackingQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Tracking</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(trackingQuery.error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={trackingQuery.isRefetching}
              onRefresh={() => void trackingQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <GitBranch size={30} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum Ada Pengajuan</Text>
              <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
                Tidak ada data pengajuan untuk filter saat ini.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getWorkflowStatusColors(item.status, colors);
            return (
              <Pressable
                onPress={() => setDetailItem(item)}
                style={[styles.reqCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.reqNoPill, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.reqNoText, { color: colors.primary }]}>
                      {item.requestNumber}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusText, { color: badge.fg }]}>
                      {getWorkflowStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.reqTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.templateSub, { color: colors.textMuted }]}>
                  {item.templateName} • Pemohon: {item.requesterFullName}
                </Text>

                {/* Compact Progress Strip */}
                <View style={styles.progressBarRow}>
                  {item.approvalSteps.map((step) => {
                    const stepCol = getWorkflowStatusColors(step.status, colors);
                    return (
                      <View
                        key={step.id}
                        style={[styles.progressSegment, { backgroundColor: stepCol.fg }]}
                      />
                    );
                  })}
                </View>

                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
                    {item.status === 'InReview' && item.currentApproverRole
                      ? `Antre di: ${item.currentApproverRole} (${item.currentStepOrder}/${item.totalSteps})`
                      : formatDateTime(item.completedAt || item.submittedAt || item.createdAt)}
                  </Text>
                  <Text style={[styles.detailLink, { color: colors.primary }]}>Detail →</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Detail + Stepper + History Modal */}
      <Modal
        visible={Boolean(detailItem)}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalCode, { color: colors.primary }]}>
                  {detailItem?.requestNumber} • {detailItem?.templateName}
                </Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{detailItem?.title}</Text>
              </View>
              <Pressable onPress={() => setDetailItem(null)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {canResubmit(detailItem) ? (
                <Pressable
                  onPress={() => detailItem && openResubmit(detailItem)}
                  style={[styles.resubmitBannerBtn, { backgroundColor: colors.warning }]}
                >
                  <FileEdit size={16} color="#FFFFFF" />
                  <Text style={styles.resubmitBannerText}>Edit & Submit Ulang Pengajuan</Text>
                </Pressable>
              ) : null}

              {/* Form Data */}
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                  DATA FORMULIR
                </Text>
                {detailItem?.templateFields.map((field) => (
                  <View key={field.key} style={{ gap: 2 }}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                      {field.label}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatWorkflowFieldValue(field, detailItem.formData[field.key])}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Vertical Approval Stepper */}
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                  APPROVAL STEPPER
                </Text>
                {detailItem?.approvalSteps.map((step, idx) => {
                  const stColor = getWorkflowStatusColors(step.status, colors);
                  const isLast = idx === (detailItem.approvalSteps.length - 1);
                  return (
                    <View key={step.id} style={styles.stepperItem}>
                      <View style={styles.stepperTrack}>
                        <View style={[styles.stepCircle, { backgroundColor: stColor.fg }]}>
                          <Text style={styles.stepCircleText}>{step.stepOrder}</Text>
                        </View>
                        {!isLast ? (
                          <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 12, gap: 2 }}>
                        <View style={styles.stepTopRow}>
                          <Text style={[styles.stepTitle, { color: colors.text }]}>
                            {step.stepName}
                          </Text>
                          <View style={[styles.miniPill, { backgroundColor: stColor.bg }]}>
                            <Text style={[styles.miniPillText, { color: stColor.fg }]}>
                              {getWorkflowStatusLabel(step.status)}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.stepRole, { color: colors.textMuted }]}>
                          Role: {step.approverRole}
                          {step.actionByFullName ? ` • Oleh ${step.actionByFullName}` : ''}
                        </Text>
                        {step.comment ? (
                          <Text style={[styles.stepComment, { color: colors.textSecondary }]}>
                            “{step.comment}”
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* History Log */}
              {detailItem?.historyLogs?.length ? (
                <View style={[styles.detailBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                  <View style={styles.historyHeader}>
                    <History size={14} color={colors.primary} />
                    <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                      RIWAYAT AKTIVITAS
                    </Text>
                  </View>
                  {detailItem.historyLogs.map((log) => (
                    <View key={log.id} style={[styles.logRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.logAction, { color: colors.text }]}>
                        {log.action} • {log.actorFullName} ({log.actorRole})
                      </Text>
                      {log.notes ? (
                        <Text style={[styles.logNotes, { color: colors.textSecondary }]}>
                          {log.notes}
                        </Text>
                      ) : null}
                      <Text style={[styles.logTime, { color: colors.textMuted }]}>
                        {formatDateTime(log.timestamp)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit & Resubmit Modal */}
      <Modal
        visible={Boolean(resubmitItem)}
        animationType="slide"
        transparent
        onRequestClose={() => setResubmitItem(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Revisi & Submit Ulang ({resubmitItem?.requestNumber})
              </Text>
              <Pressable onPress={() => setResubmitItem(null)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 6 }}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Judul Pengajuan</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  style={[
                    styles.input,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              {resubmitItem?.templateFields.map((field) => (
                <DynamicFieldInput
                  key={field.key}
                  field={field}
                  value={editFormData[field.key] ?? ''}
                  onChange={(val) => setEditFormData((prev) => ({ ...prev, [field.key]: val }))}
                />
              ))}

              <View style={{ gap: 6 }}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Catatan Revisi</Text>
                <TextInput
                  value={resubmitNotes}
                  onChangeText={setResubmitNotes}
                  placeholder="Jelaskan perbaikan yang sudah dilakukan..."
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              <Pressable
                onPress={() => resubmitMutation.mutate()}
                disabled={resubmitMutation.isPending}
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              >
                {resubmitMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <>
                    <Send size={15} color={colors.primaryForeground} />
                    <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                      Submit Ulang
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  nodeLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerSub: { fontSize: 11, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addBtnText: { fontSize: 12, fontWeight: '700' },
  filterBlock: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  scopeText: { fontSize: 12, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14 },
  chipsRow: { gap: 8, paddingBottom: 4 },
  filterChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: { fontSize: 11, fontWeight: '700' },
  listContent: { padding: 16, gap: 12, paddingBottom: 28 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errorTitle: { fontSize: 16, fontWeight: '700' },
  mutedText: { fontSize: 13, textAlign: 'center' },
  emptyCard: { borderWidth: 1, borderRadius: radius.xl, padding: 28, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  reqCard: { borderWidth: 1, borderRadius: radius.xl, padding: 15, gap: 6 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reqNoPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.sm },
  reqNoText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  reqTitle: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  templateSub: { fontSize: 12 },
  progressBarRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  progressSegment: { flex: 1, height: 5, borderRadius: radius.full },
  cardFooter: {
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerNote: { fontSize: 11, fontWeight: '600', flex: 1 },
  detailLink: { fontSize: 12, fontWeight: '800' },
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
  modalTitle: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  modalBody: { gap: 12, paddingBottom: 24 },
  resubmitBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  resubmitBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  detailBox: { borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 8 },
  detailSectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  detailLabel: { fontSize: 11, fontWeight: '600' },
  detailValue: { fontSize: 13, fontWeight: '600' },
  stepperItem: { flexDirection: 'row', gap: 10 },
  stepperTrack: { alignItems: 'center', width: 24 },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  stepLine: { width: 2, flex: 1, marginVertical: 2 },
  stepTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  stepTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  miniPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  miniPillText: { fontSize: 10, fontWeight: '700' },
  stepRole: { fontSize: 11 },
  stepComment: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logRow: { borderTopWidth: 1, paddingTop: 8, gap: 2 },
  logAction: { fontSize: 12, fontWeight: '700' },
  logNotes: { fontSize: 12 },
  logTime: { fontSize: 10 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: 4,
  },
  saveBtnText: { fontSize: 14, fontWeight: '800' },
});
