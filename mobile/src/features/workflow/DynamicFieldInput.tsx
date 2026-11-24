import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { FormFieldDefinition } from '@/core/types';
import { formatCurrency } from '@/shared/utils/formatters';

interface DynamicFieldInputProps {
  field: FormFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}

export const DynamicFieldInput: React.FC<DynamicFieldInputProps> = ({
  field,
  value,
  onChange,
}) => {
  const { colors } = useTheme();

  const todayIso = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  if (field.type === 'select' && field.options && field.options.length > 0) {
    return (
      <View style={styles.group}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {field.label} {field.required ? <Text style={{ color: colors.danger }}>*</Text> : null}
        </Text>
        <View style={styles.chipsWrap}>
          {field.options.map((opt) => {
            const active = value === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onChange(opt)}
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceMuted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: active ? colors.primaryForeground : colors.textSecondary },
                  ]}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (field.type === 'date') {
    return (
      <View style={styles.group}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {field.label} {field.required ? <Text style={{ color: colors.danger }}>*</Text> : null}
          </Text>
          <Pressable onPress={() => onChange(todayIso())}>
            <Text style={[styles.helperAction, { color: colors.primary }]}>Isi Hari Ini</Text>
          </Pressable>
        </View>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={field.placeholder || 'YYYY-MM-DD (contoh: 2026-12-01)'}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
          ]}
        />
      </View>
    );
  }

  const isNumeric = field.type === 'number' || field.type === 'currency';
  const isTextarea = field.type === 'textarea';
  const numericHint =
    field.type === 'currency' && value.trim()
      ? formatCurrency(Number(value.replace(/[^0-9.-]/g, '')) || 0)
      : null;

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {field.label} {field.required ? <Text style={{ color: colors.danger }}>*</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={isNumeric ? 'numeric' : 'default'}
        multiline={isTextarea}
        numberOfLines={isTextarea ? 3 : 1}
        placeholder={field.placeholder || `Masukkan ${field.label.toLowerCase()}...`}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          isTextarea ? styles.textArea : null,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
        ]}
      />
      {numericHint ? (
        <Text style={[styles.hintText, { color: colors.primary }]}>Nominal: {numericHint}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  group: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '600' },
  helperAction: { fontSize: 11, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 78, textAlignVertical: 'top' },
  hintText: { fontSize: 11, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  optionText: { fontSize: 12, fontWeight: '600' },
});
