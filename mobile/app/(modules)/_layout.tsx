import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '@/core/theme/themeStore';

export default function ModulesLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
