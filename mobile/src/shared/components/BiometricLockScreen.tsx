import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Fingerprint, LogOut, ShieldCheck } from 'lucide-react-native';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';

export const BiometricLockScreen: React.FC = () => {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const biometricLabel = useAuthStore((s) => s.biometricLabel);
  const unlockWithBiometric = useAuthStore((s) => s.unlockWithBiometric);
  const logout = useAuthStore((s) => s.logout);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUnlock = async () => {
    setErrorMsg(null);
    const result = await unlockWithBiometric();
    if (!result.success && result.error) {
      setErrorMsg(result.error);
    }
  };

  useEffect(() => {
    void handleUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
          <ShieldCheck size={36} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Sesi Terkunci</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Halo {user?.fullName || user?.username}, verifikasi dengan {biometricLabel} untuk melanjutkan.
        </Text>

        {errorMsg ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void handleUnlock()}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <Fingerprint size={20} color={colors.primaryForeground} />
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
            Buka dengan {biometricLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void logout(false)}
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
        >
          <LogOut size={16} color={colors.textSecondary} />
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
            Ganti Akun / Login Ulang
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBox: {
    width: '100%',
    padding: 10,
    borderRadius: radius.md,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
