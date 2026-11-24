import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
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
import { Eye, EyeOff, Layers, Lock, Server, Settings, User } from 'lucide-react-native';
import { z } from 'zod';
import { getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import { ServerUrlModal } from '@/shared/components/ServerUrlModal';

const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1, 'Username atau email wajib diisi.'),
  password: z.string().min(1, 'Password wajib diisi.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  { label: 'SuperAdmin', username: 'superadmin' },
  { label: 'Manager', username: 'manager' },
  { label: 'Staff', username: 'staff' },
  { label: 'Viewer', username: 'viewer' },
];

export default function LoginScreen() {
  const { colors } = useTheme();
  const login = useAuthStore((s) => s.login);
  const isAuthenticating = useAuthStore((s) => s.isAuthenticating);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const [showPassword, setShowPassword] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      usernameOrEmail: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    try {
      await login(values.usernameOrEmail, values.password);
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Gagal login. Periksa kembali kredensial kamu.'));
    }
  };

  const applyDemoAccount = (username: string) => {
    setValue('usernameOrEmail', username, { shouldValidate: true });
    setValue('password', 'Password123!', { shouldValidate: true });
    setSubmitError(null);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar: Gateway Server URL Switcher */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => setServerModalOpen(true)}
              style={[
                styles.serverChip,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Server size={14} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.serverChipText, { color: colors.textSecondary }]}>
                {serverUrl.replace(/^https?:\/\//i, '')}
              </Text>
              <Settings size={14} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Brand Header */}
          <View style={styles.brandBlock}>
            <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
              <Layers size={28} color={colors.primaryForeground} />
            </View>
            <Text style={[styles.brandTitle, { color: colors.text }]}>NetStarterPack</Text>
            <Text style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
              Mobile Starterpack • .NET 10 Microservices & YARP Gateway
            </Text>
          </View>

          {/* Login Card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Masuk ke Akun</Text>

            {submitError ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.dangerLight }]}>
                <Text style={[styles.errorBannerText, { color: colors.danger }]}>{submitError}</Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Username atau Email</Text>
              <Controller
                control={control}
                name="usernameOrEmail"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: errors.usernameOrEmail ? colors.danger : colors.border,
                      },
                    ]}
                  >
                    <User size={18} color={colors.textMuted} />
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="superadmin"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.text }]}
                    />
                  </View>
                )}
              />
              {errors.usernameOrEmail ? (
                <Text style={[styles.fieldError, { color: colors.danger }]}>
                  {errors.usernameOrEmail.message}
                </Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: errors.password ? colors.danger : colors.border,
                      },
                    ]}
                  >
                    <Lock size={18} color={colors.textMuted} />
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.text }]}
                    />
                    <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
                      {showPassword ? (
                        <EyeOff size={18} color={colors.textMuted} />
                      ) : (
                        <Eye size={18} color={colors.textMuted} />
                      )}
                    </Pressable>
                  </View>
                )}
              />
              {errors.password ? (
                <Text style={[styles.fieldError, { color: colors.danger }]}>
                  {errors.password.message}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => void handleSubmit(onSubmit)()}
              disabled={isAuthenticating}
              style={[
                styles.submitBtn,
                { backgroundColor: colors.primary, opacity: isAuthenticating ? 0.7 : 1 },
              ]}
            >
              {isAuthenticating ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>Masuk</Text>
              )}
            </Pressable>
          </View>

          {/* Quick Demo Accounts (Development Only) */}
          {__DEV__ ? (
            <View style={[styles.demoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.demoTitle, { color: colors.textSecondary }]}>
                Isi Cepat Akun Dummy (Dev)
              </Text>
              <View style={styles.demoChips}>
                {DEMO_ACCOUNTS.map((acc) => (
                  <Pressable
                    key={acc.username}
                    onPress={() => applyDemoAccount(acc.username)}
                    style={[
                      styles.demoChip,
                      { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.demoChipText, { color: colors.text }]}>{acc.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ServerUrlModal visible={serverModalOpen} onClose={() => setServerModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'center',
    gap: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  serverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '85%',
  },
  serverChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  brandBlock: {
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorBanner: {
    padding: 12,
    borderRadius: radius.md,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  fieldError: {
    fontSize: 12,
    fontWeight: '500',
  },
  submitBtn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  demoBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  demoTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  demoChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  demoChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
