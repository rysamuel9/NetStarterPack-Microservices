import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { CheckSquare, Grid2x2, LayoutDashboard, Megaphone, User } from 'lucide-react-native';
import { apiClient } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import {
  ensureAnnouncementHubStarted,
  getAnnouncementHubConnection,
} from '@/core/realtime/announcementHub';
import { useTheme } from '@/core/theme/themeStore';
import type { ApiResult, PagedAnnouncementsResponse, WorkflowRequestItem } from '@/core/types';

export default function TabsLayout() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canApprove = hasPermission('Workflows.Approve');
  const canViewAnnouncements = hasPermission('Announcements.View');

  const pendingApprovalsQuery = useQuery({
    queryKey: ['workflows', 'working-list'],
    enabled: canApprove,
    refetchInterval: 45000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<WorkflowRequestItem[]>>('/workflows/working-list');
      return res.data.succeeded && res.data.data ? res.data.data : [];
    },
  });

  const unreadAnnouncementsQuery = useQuery({
    queryKey: ['announcements', 'unread-badge'],
    enabled: canViewAnnouncements,
    refetchInterval: 45000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<PagedAnnouncementsResponse>>('/announcements', {
        params: { page: 1, pageSize: 1 },
      });
      return res.data.succeeded && res.data.data ? res.data.data.unreadCount : 0;
    },
  });

  // Live refresh unread badge saat ada pengumuman baru lewat SignalR
  useEffect(() => {
    if (!canViewAnnouncements) return;
    const conn = getAnnouncementHubConnection();
    const handleNew = () => {
      void queryClient.invalidateQueries({ queryKey: ['announcements', 'unread-badge'] });
    };
    conn.on('AnnouncementPublished', handleNew);
    void ensureAnnouncementHubStarted();
    return () => {
      conn.off('AnnouncementPublished', handleNew);
    };
  }, [canViewAnnouncements, queryClient]);

  const pendingCount = pendingApprovalsQuery.data?.length ?? 0;
  const unreadCount = unreadAnnouncementsQuery.data ?? 0;

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
          href: canApprove ? undefined : null,
          tabBarBadge: pendingCount > 0 ? (pendingCount > 99 ? '99+' : pendingCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.warning, color: '#FFFFFF', fontSize: 10 },
          tabBarIcon: ({ color, size }) => <CheckSquare size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Info',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#FFFFFF', fontSize: 10 },
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
