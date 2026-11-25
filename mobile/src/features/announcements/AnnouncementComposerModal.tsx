import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ImagePlus, Send, Trash2, Upload, X } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { resolveMediaUrl } from '@/core/config/serverConfig';
import { validatePickedMedia } from '@/shared/utils/fileUpload';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { AnnouncementAttachmentItem, ApiResult } from '@/core/types';

const COMPOSER_TYPES = [
  { value: 'HRPolicy', label: 'HR Policy' },
  { value: 'General', label: 'Umum' },
  { value: 'Urgent', label: 'Urgent' },
  { value: 'Event', label: 'Event' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Celebration', label: 'Celebration' },
];

interface AnnouncementComposerModalProps {
  visible: boolean;
  onClose: () => void;
  onPublished: () => void;
}

function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export const AnnouncementComposerModal: React.FC<AnnouncementComposerModalProps> = ({
  visible,
  onClose,
  onPublished,
}) => {
  const { colors } = useTheme();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [type, setType] = useState('HRPolicy');
  const [content, setContent] = useState('');
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AnnouncementAttachmentItem[]>([]);
  const [allowComments, setAllowComments] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setTitle('');
    setSummary('');
    setType('HRPolicy');
    setContent('');
    setBannerUrl(null);
    setAttachments([]);
    setAllowComments(true);
    setIsPinned(false);
  };

  const handlePickAndUpload = async (kind: 'Banner' | 'Image') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Izin Ditolak', 'Izinkan akses galeri foto untuk mengunggah gambar.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: kind === 'Banner',
      aspect: kind === 'Banner' ? [16, 9] : undefined,
      quality: 0.8,
    });

    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const check = validatePickedMedia(asset, 'image', kind.toLowerCase());
    if (!check.valid) {
      Alert.alert('Format Tidak Valid', check.message);
      return;
    }

    const fd = new FormData();
    fd.append('file', {
      uri: asset.uri,
      name: check.fileName,
      type: check.mimeType,
    } as unknown as Blob);

    setUploading(true);
    try {
      const uploadRes = await apiClient.post<ApiResult<AnnouncementAttachmentItem>>(
        `/announcements/upload?kind=${kind}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      if (uploadRes.data.succeeded && uploadRes.data.data) {
        if (kind === 'Banner') {
          setBannerUrl(uploadRes.data.data.url);
        } else {
          setAttachments((prev) => [...prev, uploadRes.data.data!]);
        }
      } else {
        Alert.alert('Upload Gagal', uploadRes.data.message || 'Tidak dapat mengunggah gambar.');
      }
    } catch (err) {
      Alert.alert('Upload Gagal', getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Validasi', 'Judul dan isi pengumuman wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.post<ApiResult>('/announcements', {
        title: title.trim(),
        summary: summary.trim() || content.trim().slice(0, 140),
        type,
        contentHtml: plainTextToHtml(content.trim()),
        bannerUrl: bannerUrl || null,
        allowComments,
        isPinned,
        attachments: attachments.map((a) => ({
          fileName: a.fileName,
          storedFileName: a.storedFileName,
          contentType: a.contentType,
          fileSizeBytes: a.fileSizeBytes,
          kind: a.kind,
          url: a.url,
        })),
      });

      if (!res.data.succeeded) {
        throw new Error(res.data.message || 'Gagal mempublikasikan pengumuman.');
      }

      resetForm();
      onPublished();
      onClose();
      Alert.alert('Berhasil', 'Pengumuman baru telah dipublikasikan secara real-time!');
    } catch (err) {
      Alert.alert('Gagal Publish', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resolvedBanner = resolveMediaUrl(bannerUrl);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Buat Pengumuman Baru</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} keyboardShouldPersistTaps="handled">
            <View style={styles.group}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Tipe Pengumuman</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {COMPOSER_TYPES.map((t) => {
                  const active = type === t.value;
                  return (
                    <Pressable
                      key={t.value}
                      onPress={() => setType(t.value)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? colors.primary : colors.surfaceMuted,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? colors.primaryForeground : colors.textSecondary },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Judul *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Contoh: Jadwal Libur Bersama & WFH..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Ringkasan Singkat</Text>
              <TextInput
                value={summary}
                onChangeText={setSummary}
                placeholder="Opsional — ringkasan 1-2 kalimat untuk kartu feed"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Isi Pengumuman *</Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={5}
                placeholder="Tulis detail informasi untuk seluruh karyawan..."
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  styles.textArea,
                  { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                ]}
              />
            </View>

            {/* Banner Upload */}
            <View style={styles.group}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Banner Cover</Text>
              {resolvedBanner ? (
                <View style={styles.bannerPreviewWrap}>
                  <Image source={{ uri: resolvedBanner }} style={styles.bannerPreview} contentFit="cover" />
                  <Pressable
                    onPress={() => setBannerUrl(null)}
                    style={[styles.removeBannerBtn, { backgroundColor: colors.danger }]}
                  >
                    <Trash2 size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => void handlePickAndUpload('Banner')}
                  disabled={uploading}
                  style={[styles.uploadBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Upload size={16} color={colors.primary} />
                      <Text style={[styles.uploadText, { color: colors.text }]}>
                        Pilih Banner (16:9) dari Galeri
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            {/* Additional Image Attachments */}
            <View style={styles.group}>
              <View style={styles.attachHeader}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Galeri Foto ({attachments.length})
                </Text>
                <Pressable
                  onPress={() => void handlePickAndUpload('Image')}
                  disabled={uploading}
                  style={[styles.miniAddBtn, { backgroundColor: colors.primaryLight }]}
                >
                  <ImagePlus size={14} color={colors.primary} />
                  <Text style={[styles.miniAddText, { color: colors.primary }]}>Tambah Foto</Text>
                </Pressable>
              </View>
              {attachments.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {attachments.map((att, idx) => {
                    const uri = resolveMediaUrl(att.url);
                    return (
                      <View key={att.storedFileName || idx} style={styles.thumbWrap}>
                        {uri ? (
                          <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />
                        ) : null}
                        <Pressable
                          onPress={() =>
                            setAttachments((prev) => prev.filter((_, i) => i !== idx))
                          }
                          style={[styles.removeThumbBtn, { backgroundColor: colors.danger }]}
                        >
                          <X size={11} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>

            {/* Switches */}
            <View style={[styles.switchCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>Izinkan Komentar</Text>
                <Switch
                  value={allowComments}
                  onValueChange={setAllowComments}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>Sematkan di Atas (Pin)</Text>
                <Switch
                  value={isPinned}
                  onValueChange={setIsPinned}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
            </View>

            <Pressable
              onPress={() => void handlePublish()}
              disabled={saving || uploading}
              style={[styles.publishBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Send size={15} color={colors.primaryForeground} />
                  <Text style={[styles.publishText, { color: colors.primaryForeground }]}>
                    Publish Pengumuman
                  </Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    padding: 20,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800' },
  formBody: { gap: 12, paddingBottom: 24 },
  group: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600' },
  chipsRow: { gap: 8 },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  uploadText: { fontSize: 13, fontWeight: '600' },
  bannerPreviewWrap: { position: 'relative' },
  bannerPreview: { width: '100%', height: 140, borderRadius: radius.md },
  removeBannerBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  miniAddText: { fontSize: 11, fontWeight: '700' },
  thumbWrap: { position: 'relative' },
  thumbImg: { width: 84, height: 64, borderRadius: radius.sm },
  removeThumbBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchCard: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  switchLabel: { fontSize: 13, fontWeight: '600' },
  divider: { height: 1 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 14,
    marginTop: 4,
  },
  publishText: { fontSize: 14, fontWeight: '800' },
});
