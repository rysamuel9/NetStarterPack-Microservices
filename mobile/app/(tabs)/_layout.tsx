import { Tabs } from 'expo-router';
import React from 'react';
import { CheckSquare, Grid2x2, LayoutDashboard, Megaphone, User } from 'lucide-react-native';
import { useTheme } from '@/core/theme/themeStore';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'Approval',
          tabBarIcon: ({ color, size }) => <CheckSquare size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Info',
          tabBarIcon: ({ color, size }) => <Megaphone size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menus"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, size }) => <Grid2x2 size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <User size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}
