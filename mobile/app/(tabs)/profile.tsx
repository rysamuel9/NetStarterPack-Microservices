import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Building2,
  Camera,
  Fingerprint,
  KeyRound,
  LogOut,
  Moon,
  Pencil,
  Server,
  ShieldAlert,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { type ThemeMode, useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import { ServerUrlModal } from '@/shared/components/ServerUrlModal';
import { UserAvatar } from '@/shared/components/UserAvatar';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'Sistem' },
  { value: 'light', label: 'Terang' },
  { value: 'dark', label: 'Gelap' },
];

export default function ProfileTab() {
  const { colors, mode, setMode } = useTheme();
  const user = useAuthStore((s) => s.user);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const biometricAvailable = useAuthStore((s) => s.biometricAvailable);
  const biometricLabel = useAuthStore((s) => s.biometricLabel);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const refreshUserAndMenus = useAuthStore((s) => s.refreshUserAndMenus);
  const logout = useAuthStore((s) => s.logout);

  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(() => Date.now());
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit Profile modal state
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [department, setDepartment] = useState('');

  // Change Password modal state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const uploadPickedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    const uri = asset.uri;
    const rawMime = asset.mimeType || (uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    const mimeType = rawMime === 'image/png' ? 'image/png' : 'image/jpeg';
    const fileName = asset.fileName || `avatar.${mimeType === 'image/png' ? 'png' : 'jpg'}`;

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);

    setUploadingAvatar(true);
    try {
      await apiClient.post('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUserAndMenus();
      setAvatarVersion(Date.now());
      Alert.alert('Berhasil', 'Foto profil berhasil diperbarui.');
    } catch (err) {
      Alert.alert('Gagal Upload', getErrorMessage(err));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const pickAvatarFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Izin Ditolak', 'Izinkan akses galeri foto di pengaturan HP untuk memilih avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPickedAsset(result.assets[0]);
    }
  };

  const pickAvatarFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Izin Ditolak', 'Izinkan akses kamera di pengaturan HP untuk mengambil foto.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPickedAsset(result.assets[0]);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try {
      await apiClient.delete('/auth/avatar');
      await refreshUserAndMenus();
      setAvatarVersion(Date.now());
      Alert.alert('Berhasil', 'Foto profil dihapus.');
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openAvatarPickerMenu = () => {
    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }> = [
      { text: 'Ambil dari Kamera', onPress: () => void pickAvatarFromCamera() },
      { text: 'Pilih dari Galeri', onPress: () => void pickAvatarFromLibrary() },
    ];
    if (user?.avatarUrl) {
      buttons.push({
        text: 'Hapus Foto Profil',
        style: 'destructive',
        onPress: () => void handleRemoveAvatar(),
      });
    }
    buttons.push({ text: 'Batal', style: 'cancel' });
    Alert.alert('Foto Profil', 'Pilih sumber foto (JPG/PNG maks 5 MB):', buttons);
  };

  const openEditProfile = () => {
    setFullName(user?.fullName || '');
    setEmail(user?.email || '');
    setPhoneNumber(user?.phoneNumber || '');
    setDepartment(user?.department || '');
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert('Validasi', 'Nama lengkap dan email wajib diisi.');
      return;
    }

    setSavingProfile(true);
    try {
      await apiClient.put('/auth/profile', {
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        department: department.trim(),
      });
      await refreshUserAndMenus();
      setEditProfileOpen(false);
      Alert.alert('Berhasil', 'Profil berhasil diperbarui.');
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword || newPassword.length < 6) {
      Alert.alert('Validasi', 'Isi password saat ini dan password baru minimal 6 karakter.');
      return;
    }

    setSavingPassword(true);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordModalOpen(false);
      Alert.alert('Berhasil', 'Password berhasil diperbarui.');
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  const confirmLogout = (allDevices: boolean) => {
    Alert.alert(
      allDevices ? 'Logout Semua Perangkat' : 'Keluar dari Akun',
      allDevices
        ? 'Semua sesi aktif di web maupun HP lain akan dicabut. Lanjutkan?'
        : 'Kamu yakin ingin keluar dari sesi saat ini?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluar',
          style: 'destructive',
          onPress: () => void logout(allDevices),
        },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Profil & Pengaturan</Text>

        {/* Hero Identity & Organization Card */}
        <View style={styles.heroCard}>
          <View style={styles.identityRow}>
            <Pressable
              onPress={openAvatarPickerMenu}
              disabled={uploadingAvatar}
              style={styles.avatarWrap}
            >
              <UserAvatar
                userId={user?.id}
                name={user?.fullName || user?.username}
                avatarUrl={user?.avatarUrl}
                size={68}
                cacheKey={avatarVersion}
              />

              <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
                {uploadingAvatar ? (
                  <ActivityIndicator size={11} color="#FFFFFF" />
                ) : (
                  <Camera size={12} color="#FFFFFF" />
                )}
              </View>
            </Pressable>

            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.nikBadge}>
                {user?.employeeCode || 'NO-NIK'} • @{user?.username}
              </Text>
              <Text style={styles.fullName}>{user?.fullName || user?.username}</Text>
              <Text style={styles.positionText}>
                {user?.positionName || user?.roles.join(', ')}
                {user?.positionLevel ? ` (Lv.${user.positionLevel})` : ''}
              </Text>
              <Text style={styles.emailText}>{user?.email}</Text>
            </View>
          </View>

          <View style={styles.orgGrid}>
            <View style={styles.orgTile}>
              <Text style={styles.orgLabel}>DIREKTORAT</Text>
              <Text numberOfLines={1} style={styles.orgValue}>
                {user?.directorateName || '-'}
              </Text>
            </View>
            <View style={styles.orgTile}>
              <Text style={styles.orgLabel}>DIVISI</Text>
              <Text numberOfLines={1} style={styles.orgValue}>
                {user?.divisionName || '-'}
              </Text>
            </View>
            <View style={styles.orgTile}>
              <Text style={styles.orgLabel}>DEPARTEMEN</Text>
              <Text numberOfLines={1} style={styles.orgValue}>
                {user?.departmentName || user?.department || '-'}
              </Text>
            </View>
            <View style={styles.orgTile}>
              <Text style={styles.orgLabel}>ATASAN LANGSUNG</Text>
              <Text numberOfLines={1} style={[styles.orgValue, { color: '#FCD34D' }]}>
                {user?.managerFullName || 'Top Executive'}
              </Text>
            </View>
          </View>

          <View style={styles.heroActionRow}>
            <Pressable onPress={openEditProfile} style={styles.heroActionBtn}>
              <Pencil size={14} color="#5EEAD4" />
              <Text style={styles.heroActionText}>Edit Profil</Text>
            </Pressable>
            <Pressable onPress={() => setPasswordModalOpen(true)} style={styles.heroActionBtn}>
              <KeyRound size={14} color="#5EEAD4" />
              <Text style={styles.heroActionText}>Ganti Password</Text>
            </Pressable>
            {user?.avatarUrl ? (
              <Pressable
                onPress={() => void handleRemoveAvatar()}
                disabled={uploadingAvatar}
                style={[styles.heroActionBtn, { borderColor: 'rgba(248,113,113,0.35)' }]}
              >
                <Trash2 size={14} color="#FCA5A5" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Security & Appearance */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Keamanan & Tampilan
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Fingerprint size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>
                  Kunci {biometricLabel}
                </Text>
                <Text style={[styles.settingSubtitle, { color: colors.textMuted }]}>
                  {biometricAvailable
                    ? 'Minta verifikasi biometrik saat membuka aplikasi'
                    : 'Sensor biometrik belum aktif di perangkat ini'}
                </Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              disabled={!biometricAvailable}
              onValueChange={(v) => void setBiometricEnabled(v)}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.themeBlock}>
            <View style={styles.settingLeft}>
              {mode === 'dark' ? (
                <Moon size={20} color={colors.primary} />
              ) : mode === 'light' ? (
                <Sun size={20} color={colors.primary} />
              ) : (
                <Smartphone size={20} color={colors.primary} />
              )}
              <Text style={[styles.settingTitle, { color: colors.text }]}>Tema Aplikasi</Text>
            </View>
            <View style={styles.themeChips}>
              {THEME_OPTIONS.map((opt) => {
                const active = mode === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => void setMode(opt.value)}
                    style={[
                      styles.themeChip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceMuted,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.themeChipText,
                        { color: active ? colors.primaryForeground : colors.textSecondary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable onPress={() => setServerModalOpen(true)} style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Server size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>API Gateway URL</Text>
                <Text numberOfLines={1} style={[styles.settingSubtitle, { color: colors.textMuted }]}>
                  {serverUrl}
                </Text>
              </View>
            </View>
            <Text style={[styles.editLink, { color: colors.primary }]}>Ubah</Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Building2 size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>Role & Permission</Text>
                <Text style={[styles.settingSubtitle, { color: colors.textMuted }]}>
                  {user?.roles.join(', ')} • {user?.permissions.length ?? 0} izin aktif
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Logout Actions */}
        <View style={styles.logoutGroup}>
          <Pressable
            onPress={() => confirmLogout(false)}
            style={[styles.logoutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <LogOut size={18} color={colors.danger} />
            <Text style={[styles.logoutBtnText, { color: colors.danger }]}>Keluar</Text>
          </Pressable>

          <Pressable
            onPress={() => confirmLogout(true)}
            style={[
              styles.logoutBtn,
              { backgroundColor: colors.dangerLight, borderColor: colors.danger },
            ]}
          >
            <ShieldAlert size={18} color={colors.danger} />
            <Text style={[styles.logoutBtnText, { color: colors.danger }]}>
              Logout Semua Perangkat
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={editProfileOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setEditProfileOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Informasi Profil</Text>
              <Pressable onPress={() => setEditProfileOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Nama Lengkap</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>No. Telepon</Text>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Departemen</Text>
              <TextInput
                value={department}
                onChangeText={setDepartment}
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <Pressable
              onPress={() => void handleSaveProfile()}
              disabled={savingProfile}
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
            >
              {savingProfile ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.modalSaveText, { color: colors.primaryForeground }]}>
                  Simpan Perubahan
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={passwordModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Ganti Password</Text>
              <Pressable onPress={() => setPasswordModalOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Password Saat Ini</Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Password Baru</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Minimal 6 karakter"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <Pressable
              onPress={() => void handleSavePassword()}
              disabled={savingPassword}
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
            >
              {savingPassword ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.modalSaveText, { color: colors.primaryForeground }]}>
                  Perbarui Password
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <ServerUrlModal visible={serverModalOpen} onClose={() => setServerModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 28 },
  pageTitle: { fontSize: 22, fontWeight: '800' },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: radius.xl,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: '#134E4A',
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(94, 234, 212, 0.5)',
  },
  avatarFallback: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: 'rgba(20, 184, 166, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(94, 234, 212, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '800', color: '#5EEAD4' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  nikBadge: {
    color: '#5EEAD4',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  fullName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  positionText: { color: '#2DD4BF', fontSize: 12, fontWeight: '600' },
  emailText: { color: '#94A3B8', fontSize: 12 },
  orgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  orgTile: {
    width: '48.5%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.md,
    padding: 10,
    gap: 2,
  },
  orgLabel: { color: '#94A3B8', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  orgValue: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  heroActionRow: { flexDirection: 'row', gap: 8 },
  heroActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  heroActionText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { fontSize: 14, fontWeight: '600' },
  settingSubtitle: { fontSize: 12, marginTop: 2 },
  editLink: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1 },
  themeBlock: { gap: 10 },
  themeChips: { flexDirection: 'row', gap: 8 },
  themeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  themeChipText: { fontSize: 12, fontWeight: '700' },
  logoutGroup: { gap: 10 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 14,
  },
  logoutBtnText: { fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  inputGroup: { gap: 5 },
  inputLabel: { fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalSaveBtn: {
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  modalSaveText: { fontSize: 14, fontWeight: '700' },
});
