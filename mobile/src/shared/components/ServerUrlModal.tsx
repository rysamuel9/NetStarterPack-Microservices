import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CheckCircle2, RotateCcw, Server, X, XCircle } from 'lucide-react-native';
import { useAuthStore } from '@/core/auth/authStore';
import { normalizeGatewayUrl } from '@/core/config/serverConfig';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';

interface ServerUrlModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ServerUrlModal: React.FC<ServerUrlModalProps> = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const updateServerUrl = useAuthStore((s) => s.updateServerUrl);
  const restoreDefaultServerUrl = useAuthStore((s) => s.restoreDefaultServerUrl);

  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (visible) {
      setInputUrl(serverUrl);
      setTestResult(null);
    }
  }, [visible, serverUrl]);

  const handleTestConnection = async () => {
    const normalized = normalizeGatewayUrl(inputUrl);
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await axios.get(`${normalized}/api/health`, { timeout: 6000 });
      if (res.status >= 200 && res.status < 300) {
        setTestResult({ ok: true, text: `Terhubung ke Gateway (${normalized})` });
      } else {
        setTestResult({ ok: false, text: `Gateway merespons HTTP ${res.status}` });
      }
    } catch {
      setTestResult({
        ok: false,
        text: 'Gagal terhubung. Pastikan PC & HP satu Wi-Fi dan Gateway.Api berjalan di port 5080.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    await updateServerUrl(inputUrl);
    onClose();
  };

  const handleReset = async () => {
    const def = await restoreDefaultServerUrl();
    setInputUrl(def);
    setTestResult(null);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Server size={18} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>Alamat API Gateway</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            Arahkan ke port 5080 Gateway.Api. Untuk HP fisik di Wi-Fi yang sama, gunakan IP LAN PC
            (contoh: http://192.168.1.15:5080).
          </Text>

          <TextInput
            value={inputUrl}
            onChangeText={setInputUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.15:5080"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <View style={styles.presetRow}>
            {[
              { label: 'Emulator', url: 'http://10.0.2.2:5080' },
              { label: 'USB adb', url: 'http://localhost:5080' },
            ].map((preset) => (
              <Pressable
                key={preset.label}
                onPress={() => setInputUrl(preset.url)}
                style={[styles.presetChip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              >
                <Text style={[styles.presetText, { color: colors.textSecondary }]}>
                  {preset.label}: {preset.url.replace('http://', '')}
                </Text>
              </Pressable>
            ))}
          </View>

          {testResult ? (
            <View
              style={[
                styles.statusBox,
                { backgroundColor: testResult.ok ? colors.successLight : colors.dangerLight },
              ]}
            >
              {testResult.ok ? (
                <CheckCircle2 size={16} color={colors.success} />
              ) : (
                <XCircle size={16} color={colors.danger} />
              )}
              <Text
                style={[
                  styles.statusText,
                  { color: testResult.ok ? colors.success : colors.danger },
                ]}
              >
                {testResult.text}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => void handleTestConnection()}
              disabled={isTesting}
              style={[styles.outlineBtn, { borderColor: colors.border }]}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.outlineBtnText, { color: colors.text }]}>Tes Koneksi</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => void handleReset()}
              style={[styles.iconBtn, { borderColor: colors.border }]}
              accessibilityLabel="Reset default URL"
            >
              <RotateCcw size={16} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              onPress={() => void handleSave()}
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Simpan</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  presetText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  outlineBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
