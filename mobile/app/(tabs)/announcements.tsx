import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Image as ImageIcon,
  Lock,
  Megaphone,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Radio,
  Search,
  X,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { resolveMediaUrl } from '@/core/config/serverConfig';
import {
  ensureAnnouncementHubStarted,
  getAnnouncementHubConnection,
  type AnnouncementPublishedEvent,
  type AnnouncementStatsChangedEvent,
} from '@/core/realtime/announcementHub';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type {
  AnnouncementSummaryItem,
  ApiResult,
  PagedAnnouncementsResponse,
} from '@/core/types';
import { AnnouncementComposerModal } from '@/features/announcements/AnnouncementComposerModal';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { formatDateTime } from '@/shared/utils/formatters';

const ANNOUNCEMENT_TYPES = [
  { value: '', label: 'Semua' },
  { value: 'Urgent', label: 'Urgent' },
  { value: 'HRPolicy', label: 'HR Policy' },
  { value: 'Event', label: 'Event' },
  { value: 'General', label: 'Umum' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Celebration', label: 'Celebration' },
];

export default function AnnouncementsTab() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('Announcements.View');
  const canManage = hasPermission('Announcements.Manage');

  const [data, setData] = useState<PagedAnnouncementsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signalrLive, setSignalrLive] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const loadFeed = useCallback(
    async (targetPage = page, targetType = typeFilter, targetSearch = search, isRefresh = false) => {
      if (!canView) return;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params: Record<string, string> = {
          page: String(targetPage),
          pageSize: '10',
        };
        if (targetType) params.type = targetType;
        if (targetSearch.trim()) params.search = targetSearch.trim();

        const res = await apiClient.get<ApiResult<PagedAnnouncementsResponse>>('/announcements', {
          params,
        });
        if (res.data.succeeded && res.data.data) {
          setData(res.data.data);
        } else {
          setError(res.data.message || 'Gagal memuat pengumuman.');
        }
      } catch (err) {
        setError(getErrorMessage(err, 'Gagal menghubungi Announcement.Api (:5085).'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canView, page, typeFilter, search]
  );

  useEffect(() => {
    void loadFeed(page, typeFilter, search, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter, canView]);

  // SignalR live feed subscription
  useEffect(() => {
    if (!canView) return;
    let mounted = true;
    const conn = getAnnouncementHubConnection();

    const onStatsChanged = (evt: AnnouncementStatsChangedEvent) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) => {
            if (item.id !== evt.announcementId) return item;
            return {
              ...item,
              likeCount: evt.likeCount ?? item.likeCount,
              commentCount: evt.commentCount ?? item.commentCount,
              allowComments: evt.allowComments ?? item.allowComments,
              isLikedByMe:
                evt.actorUserId && evt.actorUserId === user?.id && typeof evt.isLiked === 'boolean'
                  ? evt.isLiked
                  : item.isLikedByMe,
            };
          }),
        };
      });
    };

    const onPublished = (summary: AnnouncementPublishedEvent) => {
      setData((prev) => {
        if (!prev || prev.page !== 1) return prev;
        if (typeFilter && summary.type !== typeFilter) return prev;
        if (prev.items.some((x) => x.id === summary.id)) return prev;
        const isAuthor = summary.authorUsername === user?.username;
        const nextItem: AnnouncementSummaryItem = { ...summary, isReadByMe: isAuthor };
        return {
          ...prev,
          totalCount: prev.totalCount + 1,
          totalPages: Math.max(1, Math.ceil((prev.totalCount + 1) / prev.pageSize)),
          unreadCount: isAuthor ? prev.unreadCount : prev.unreadCount + 1,
          items: [nextItem, ...prev.items].slice(0, prev.pageSize),
        };
      });
    };

    conn.on('AnnouncementStatsChanged', onStatsChanged);
    conn.on('AnnouncementPublished', onPublished);

    void ensureAnnouncementHubStarted().then((started) => {
      if (mounted) setSignalrLive(Boolean(started));
    });

    return () => {
      mounted = false;
      conn.off('AnnouncementStatsChanged', onStatsChanged);
      conn.off('AnnouncementPublished', onPublished);
    };
  }, [canView, typeFilter, user?.id, user?.username]);

  const handleToggleLike = async (item: AnnouncementSummaryItem) => {
    try {
      const res = await apiClient.post<ApiResult<{ isLiked: boolean; likeCount: number }>>(
        `/announcements/${item.id}/like`
      );
      if (res.data.succeeded && res.data.data) {
        const { isLiked, likeCount } = res.data.data;
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((x) =>
              x.id === item.id ? { ...x, isLikedByMe: isLiked, likeCount } : x
            ),
          };
        });
      }
    } catch {
      // Ignore quick like error
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Urgent':
        return { bg: colors.dangerLight, fg: colors.danger };
      case 'HRPolicy':
        return { bg: colors.infoLight, fg: colors.info };
      case 'Event':
      case 'Celebration':
        return { bg: colors.successLight, fg: colors.success };
      case 'Maintenance':
        return { bg: colors.warningLight, fg: colors.warning };
      default:
        return { bg: colors.primaryLight, fg: colors.primary };
    }
  };

  if (!canView) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.padWrap}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>HR Newsroom & Info</Text>
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Lock size={28} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Akses Dibatasi</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Akun kamu belum memiliki permission Announcements.View.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.headerBlock}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.text }]}>HR Newsroom</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
              Announcement.Api (:5085) • {data?.unreadCount ?? 0} belum dibaca
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={[
                styles.livePill,
                { backgroundColor: signalrLive ? colors.successLight : colors.surfaceMuted },
              ]}
            >
              <Radio size={11} color={signalrLive ? colors.success : colors.textMuted} />
              <Text
                style={[
                  styles.liveText,
                  { color: signalrLive ? colors.success : colors.textMuted },
                ]}
              >
                {signalrLive ? 'LIVE' : 'POLL'}
              </Text>
            </View>
            {canManage ? (
              <Pressable
                onPress={() => setComposerOpen(true)}
                style={[styles.composeBtn, { backgroundColor: colors.primary }]}
              >
                <Plus size={14} color={colors.primaryForeground} />
                <Text style={[styles.composeBtnText, { color: colors.primaryForeground }]}>
                  Buat
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => {
              setPage(1);
              void loadFeed(1, typeFilter, search, false);
            }}
            returnKeyType="search"
            placeholder="Cari pengumuman..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable
              onPress={() => {
                setSearch('');
                setPage(1);
                void loadFeed(1, typeFilter, '', false);
              }}
              hitSlop={6}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Type Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {ANNOUNCEMENT_TYPES.map((t) => {
            const active = typeFilter === t.value;
            return (
              <Pressable
                key={t.label}
                onPress={() => {
                  setTypeFilter(t.value);
                  setPage(1);
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? colors.primaryForeground : colors.textSecondary },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Feed */}
      {loading && !data ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Memuat pengumuman...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={[styles.emptyTitle, { color: colors.danger }]}>Gagal Memuat Feed</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
          <Pressable
            onPress={() => void loadFeed(page, typeFilter, search, false)}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Coba Lagi</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadFeed(page, typeFilter, search, true)}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Megaphone size={30} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum Ada Pengumuman</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Tidak ada pengumuman yang cocok dengan filter saat ini.
              </Text>
            </View>
          }
          ListFooterComponent={
            data && data.totalPages > 1 ? (
              <View style={styles.paginationRow}>
                <Pressable
                  disabled={page <= 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: page <= 1 ? 0.4 : 1,
                    },
                  ]}
                >
                  <ChevronLeft size={16} color={colors.text} />
                  <Text style={[styles.pageBtnText, { color: colors.text }]}>Sebelumnya</Text>
                </Pressable>
                <Text style={[styles.pageIndicator, { color: colors.textSecondary }]}>
                  Hal {data.page} / {data.totalPages}
                </Text>
                <Pressable
                  disabled={page >= data.totalPages}
                  onPress={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: page >= data.totalPages ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.pageBtnText, { color: colors.text }]}>Berikutnya</Text>
                  <ChevronRight size={16} color={colors.text} />
                </Pressable>
              </View>
            ) : undefined
          }
          renderItem={({ item }) => {
            const typeCol = getTypeColor(item.type);
            const bannerUri = resolveMediaUrl(item.bannerUrl);

            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(modules)/announcement-detail',
                    params: { id: item.id },
                  })
                }
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {bannerUri ? (
                  <Image
                    source={{ uri: bannerUri }}
                    style={styles.bannerImage}
                    contentFit="cover"
                  />
                ) : null}

                <View style={styles.cardInner}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.typeBadge, { backgroundColor: typeCol.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: typeCol.fg }]}>{item.type}</Text>
                    </View>
                    {item.isPinned ? (
                      <View style={[styles.pinBadge, { backgroundColor: colors.warningLight }]}>
                        <Pin size={10} color={colors.warning} />
                        <Text style={[styles.pinText, { color: colors.warning }]}>Pinned</Text>
                      </View>
                    ) : null}
                    {!item.isReadByMe ? (
                      <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                    ) : null}
                  </View>

                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  {item.summary ? (
                    <Text numberOfLines={2} style={[styles.cardSummary, { color: colors.textSecondary }]}>
                      {item.summary}
                    </Text>
                  ) : null}

                  <View style={styles.authorRow}>
                    <UserAvatar
                      userId={item.authorUserId}
                      name={item.authorFullName}
                      size={26}
                      borderColor={colors.border}
                    />
                    <Text numberOfLines={1} style={[styles.authorName, { color: colors.textSecondary }]}>
                      {item.authorFullName} • {formatDateTime(item.publishedAt)}
                    </Text>
                  </View>

                  <View style={[styles.statsBar, { borderTopColor: colors.border }]}>
                    <Pressable
                      onPress={() => void handleToggleLike(item)}
                      style={styles.statAction}
                      hitSlop={6}
                    >
                      <Heart
                        size={15}
                        color={item.isLikedByMe ? colors.danger : colors.textMuted}
                        fill={item.isLikedByMe ? colors.danger : 'transparent'}
                      />
                      <Text
                        style={[
                          styles.statCount,
                          { color: item.isLikedByMe ? colors.danger : colors.textSecondary },
                        ]}
                      >
                        {item.likeCount}
                      </Text>
                    </Pressable>

                    <View style={styles.statAction}>
                      <MessageSquare size={15} color={colors.textMuted} />
                      <Text style={[styles.statCount, { color: colors.textSecondary }]}>
                        {item.commentCount}
                      </Text>
                    </View>

                    {item.imageCount > 0 ? (
                      <View style={styles.statAction}>
                        <ImageIcon size={14} color={colors.textMuted} />
                        <Text style={[styles.statCount, { color: colors.textSecondary }]}>
                          {item.imageCount}
                        </Text>
                      </View>
                    ) : null}

                    {item.fileCount > 0 ? (
                      <View style={styles.statAction}>
                        <Paperclip size={14} color={colors.textMuted} />
                        <Text style={[styles.statCount, { color: colors.textSecondary }]}>
                          {item.fileCount}
                        </Text>
                      </View>
                    ) : null}

                    <Text style={[styles.readLink, { color: colors.primary }]}>Baca →</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <AnnouncementComposerModal
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPublished={() => {
          setPage(1);
          void loadFeed(1, typeFilter, search, false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  padWrap: { padding: 16, gap: 12 },
  headerBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pageTitle: { fontSize: 22, fontWeight: '800' },
  pageSubtitle: { fontSize: 12, marginTop: 2 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  liveText: { fontSize: 10, fontWeight: '800' },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  composeBtnText: { fontSize: 12, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14 },
  chipsRow: { gap: 8, paddingBottom: 4 },
  filterChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  listContent: { padding: 16, gap: 14, paddingBottom: 28 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, marginTop: 4 },
  retryText: { fontSize: 13, fontWeight: '700' },
  emptyCard: { borderRadius: radius.xl, borderWidth: 1, padding: 28, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  bannerImage: { width: '100%', height: 150 },
  cardInner: { padding: 15, gap: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  pinText: { fontSize: 10, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: radius.full, marginLeft: 'auto' },
  cardTitle: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  cardSummary: { fontSize: 13, lineHeight: 19 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  authorName: { flex: 1, fontSize: 11, fontWeight: '500' },
  statsBar: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statCount: { fontSize: 12, fontWeight: '700' },
  readLink: { marginLeft: 'auto', fontSize: 12, fontWeight: '800' },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pageBtnText: { fontSize: 12, fontWeight: '700' },
  pageIndicator: { fontSize: 12, fontWeight: '700' },
});
