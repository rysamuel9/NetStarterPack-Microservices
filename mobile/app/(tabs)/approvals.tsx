import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckSquare, Lock } from 'lucide-react-native';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';

export default function ApprovalsTab() {
  const { colors } = useTheme();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canApprove = hasPermission('Workflows.Approve');

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Working List Approval</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
          Daftar pengajuan multi-level workflow yang menunggu persetujuan kamu.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: canApprove ? colors.primaryLight : colors.surfaceMuted },
            ]}
          >
            {canApprove ? (
              <CheckSquare size={26} color={colors.primary} />
            ) : (
              <Lock size={26} color={colors.textMuted} />
            )}
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {canApprove ? 'Modul Workflow Approval (Fase 4)' : 'Tidak Memiliki Akses Approval'}
          </Text>
          <Text style={[styles.cardText, { color: colors.textSecondary }]}>
            {canApprove
              ? 'Shell tab sudah siap dan terproteksi permission Workflows.Approve. Daftar working list, quick Approve/Reject/Revision, Dynamic Form Renderer, dan Tracking Stepper akan dibangun di Fase 4.'
              : 'Role akun kamu saat ini belum memiliki permission Workflows.Approve.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 12 },
  pageTitle: { fontSize: 22, fontWeight: '800' },
  pageSubtitle: { fontSize: 13, lineHeight: 19 },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  cardText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
