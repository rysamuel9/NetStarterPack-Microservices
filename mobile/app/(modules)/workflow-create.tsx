import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Database, GitBranch, Save, Send } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, FormTemplateItem, WorkflowRequestItem } from '@/core/types';
import { DynamicFieldInput } from '@/features/workflow/DynamicFieldInput';
import { DynamicLucideIcon } from '@/shared/components/LucideIcon';

export default function WorkflowCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [selectedCode, setSelectedCode] = useState<string>('');
  const [title, setTitle] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});

  const templatesQuery = useQuery({
    queryKey: ['workflows', 'templates'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<FormTemplateItem[]>>('/workflows/templates');
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat template formulir.');
      }
      return res.data.data;
    },
  });

  useEffect(() => {
    if (templatesQuery.data?.length && !selectedCode) {
      setSelectedCode(templatesQuery.data[0].code);
    }
  }, [templatesQuery.data, selectedCode]);

  const selectedTemplate =
    templatesQuery.data?.find((t) => t.code === selectedCode) ?? null;

  const submitMutation = useMutation({
    mutationFn: async (submitImmediately: boolean) => {
      if (!selectedTemplate) throw new Error('Pilih template terlebih dahulu.');
      const res = await apiClient.post<ApiResult<WorkflowRequestItem>>('/workflows', {
        templateCode: selectedTemplate.code,
        title: title.trim(),
        formData,
        submitImmediately,
      });
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(
          res.data.errors?.join(' • ') || res.data.message || 'Gagal menyimpan pengajuan.'
        );
      }
      return { created: res.data.data, submitImmediately };
    },
    onSuccess: ({ created, submitImmediately }) => {
      setTitle('');
      setFormData({});
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });

      Alert.alert(
        submitImmediately ? 'Pengajuan Terkirim' : 'Draft Tersimpan',
        submitImmediately
          ? `${created.requestNumber} berhasil disubmit! Saat ini antre di ${created.currentApproverRole}.`
          : `Draft ${created.requestNumber} tersimpan. Kamu bisa melanjutkannya kapan saja di Tracking List.`,
        [
          { text: 'Buat Lagi', style: 'cancel' },
          {
            text: 'Lihat Tracking',
            onPress: () => router.replace('/(modules)/workflow-tracking'),
          },
        ]
      );
    },
    onError: (err) => {
      Alert.alert('Gagal Menyimpan', getErrorMessage(err));
    },
  });

  const handleSelectTemplate = (code: string) => {
    setSelectedCode(code);
    setFormData({});
  };

  const handleSubmit = (submitImmediately: boolean) => {
    if (!selectedTemplate) return;
    if (!title.trim()) {
      Alert.alert('Validasi', 'Judul pengajuan wajib diisi.');
      return;
    }

    if (submitImmediately) {
      const missing = selectedTemplate.fields.filter(
        (f) => f.required && !(formData[f.key] || '').trim()
      );
      if (missing.length > 0) {
        Alert.alert(
          'Field Wajib Belum Lengkap',
          `Harap lengkapi: ${missing.map((m) => m.label).join(', ')}`
        );
        return;
      }
    }

    submitMutation.mutate(submitImmediately);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Buat Pengajuan Form</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Workflow.Api (:5084) • Dynamic Form Renderer
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/(modules)/workflow-tracking')}
          style={[styles.trackBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
        >
          <GitBranch size={14} color={colors.primary} />
          <Text style={[styles.trackBtnText, { color: colors.text }]}>Tracking</Text>
        </Pressable>
      </View>

      {templatesQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            Memuat template formulir...
          </Text>
        </View>
      ) : templatesQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Template</Text>
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
            {getErrorMessage(templatesQuery.error)}
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Template Selector */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                1. PILIH JENIS FORMULIR
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.templateRow}
              >
                {templatesQuery.data?.map((tpl) => {
                  const active = tpl.code === selectedCode;
                  return (
                    <Pressable
                      key={tpl.id}
                      onPress={() => handleSelectTemplate(tpl.code)}
                      style={[
                        styles.templateCard,
                        {
                          backgroundColor: active ? colors.primaryLight : colors.surface,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.tplIcon,
                          { backgroundColor: active ? colors.primary : colors.surfaceMuted },
                        ]}
                      >
                        <DynamicLucideIcon
                          name={tpl.icon}
                          size={18}
                          color={active ? colors.primaryForeground : colors.primary}
                        />
                      </View>
                      <Text
                        numberOfLines={2}
                        style={[styles.tplName, { color: colors.text }]}
                      >
                        {tpl.name}
                      </Text>
                      <Text style={[styles.tplMeta, { color: colors.textMuted }]}>
                        {tpl.fields.length} field • {tpl.approvalFlow.length} level
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Approval Flow Preview */}
            {selectedTemplate ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  ALUR APPROVAL OTOMATIS ({selectedTemplate.approvalFlow.length} TAHAP)
                </Text>
                <Text style={[styles.tplDesc, { color: colors.textSecondary }]}>
                  {selectedTemplate.description}
                </Text>
                <View style={styles.flowChips}>
                  {selectedTemplate.approvalFlow.map((step) => (
                    <View
                      key={step.stepOrder}
                      style={[
                        styles.flowChip,
                        { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.flowChipText, { color: colors.text }]}>
                        {step.stepOrder}. {step.approverRole}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Dynamic Form Fields */}
            {selectedTemplate ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  2. ISI DATA PENGAJUAN
                </Text>

                <View style={{ gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Judul Pengajuan <Text style={{ color: colors.danger }}>*</Text>
                  </Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder={`Contoh: ${selectedTemplate.name} — Q4`}
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.titleInput,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: colors.border,
                        color: colors.text,
                      },
                    ]}
                  />
                </View>

                {selectedTemplate.fields.map((field) => (
                  <DynamicFieldInput
                    key={field.key}
                    field={field}
                    value={formData[field.key] ?? ''}
                    onChange={(val) => setFormData((prev) => ({ ...prev, [field.key]: val }))}
                  />
                ))}

                {/* Action Buttons */}
                <View style={styles.btnRow}>
                  <Pressable
                    onPress={() => handleSubmit(false)}
                    disabled={submitMutation.isPending}
                    style={[
                      styles.draftBtn,
                      { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                    ]}
                  >
                    <Save size={16} color={colors.text} />
                    <Text style={[styles.draftBtnText, { color: colors.text }]}>Simpan Draft</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleSubmit(true)}
                    disabled={submitMutation.isPending}
                    style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <>
                        <Send size={16} color={colors.primaryForeground} />
                        <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>
                          Submit
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
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
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  trackBtnText: { fontSize: 12, fontWeight: '700' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errorTitle: { fontSize: 16, fontWeight: '700' },
  mutedText: { fontSize: 13, textAlign: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  templateRow: { gap: 10, paddingVertical: 2 },
  templateCard: {
    width: 156,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 12,
    gap: 6,
  },
  tplIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tplName: { fontSize: 13, fontWeight: '700' },
  tplMeta: { fontSize: 11, fontWeight: '500' },
  card: { borderWidth: 1, borderRadius: radius.xl, padding: 16, gap: 12 },
  tplDesc: { fontSize: 12, lineHeight: 18 },
  flowChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flowChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flowChipText: { fontSize: 11, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  titleInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  draftBtnText: { fontSize: 13, fontWeight: '700' },
  submitBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  submitBtnText: { fontSize: 13, fontWeight: '800' },
});
