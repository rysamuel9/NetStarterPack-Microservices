import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Megaphone } from 'lucide-react-native';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';

export default function AnnouncementsTab() {
  const { colors } = useTheme();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('Announcements.View');

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>HR Newsroom & Info</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
          Pengumuman internal perusahaan lengkap dengan notifikasi real-time SignalR.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: canView ? colors.primaryLight : colors.surfaceMuted },
            ]}
          >
            {canView ? (
              <Megaphone size={26} color={colors.primary} />
            ) : (
              <Lock size={26} color={colors.textMuted} />
            )}
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {canView ? 'Modul Announcements & SignalR (Fase 5)' : 'Akses Dibatasi'}
          </Text>
          <Text style={[styles.cardText, { color: colors.textSecondary }]}>
            {canView
              ? 'Shell tab sudah siap dan terproteksi permission Announcements.View. Feed pagination, detail HTML, Like/Comment, dan SignalR live unread badge akan dibangun di Fase 5.'
              : 'Akun kamu tidak memiliki permission Announcements.View.'}
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
