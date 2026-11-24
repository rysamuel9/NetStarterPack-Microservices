import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Download,
  Heart,
  MessageSquare,
  MessageSquareOff,
  Paperclip,
  Pin,
  Radio,
  Reply,
  Send,
  Trash2,
  X,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { resolveMediaUrl } from '@/core/config/serverConfig';
import {
  getAnnouncementHubConnection,
  htmlToReadableText,
  joinAnnouncementRoom,
  leaveAnnouncementRoom,
  type CommentAddedEvent,
  type CommentDeletedEvent,
  type CommentsToggledEvent,
  type LikeUpdatedEvent,
} from '@/core/realtime/announcementHub';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type {
  AnnouncementCommentItem,
  AnnouncementDetailItem,
  ApiResult,
} from '@/core/types';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { formatDateTime } from '@/shared/utils/formatters';

export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('Announcements.Manage');

  const [item, setItem] = useState<AnnouncementDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeLive, setRealtimeLive] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{
    rootCommentId: string;
    target: AnnouncementCommentItem;
  } | null>(null);
  const composerInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<ApiResult<AnnouncementDetailItem>>(
        `/announcements/${id}?markAsRead=true`
      );
      if (res.data.succeeded && res.data.data) {
        setItem(res.data.data);
        void queryClient.invalidateQueries({ queryKey: ['announcements', 'unread-badge'] });
      } else {
        setError(res.data.message || 'Pengumuman tidak ditemukan.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat detail pengumuman.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // Real-time room SignalR
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const conn = getAnnouncementHubConnection();

    const onCommentAdded = (evt: CommentAddedEvent) => {
      if (evt.announcementId !== id) return;
      setItem((prev) => {
        if (!prev) return prev;
        if (prev.comments.some((c) => c.id === evt.comment.id)) {
          return { ...prev, commentCount: evt.commentCount };
        }
        return {
          ...prev,
          commentCount: evt.commentCount,
          comments: [evt.comment, ...prev.comments],
        };
      });
    };

    const onCommentDeleted = (evt: CommentDeletedEvent) => {
      if (evt.announcementId !== id) return;
      const deletedSet = new Set(evt.deletedCommentIds);
      setItem((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          commentCount: evt.commentCount,
          comments: prev.comments.filter((c) => !deletedSet.has(c.id)),
        };
      });
    };

    const onLikeUpdated = (evt: LikeUpdatedEvent) => {
      if (evt.announcementId !== id) return;
      setItem((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          likeCount: evt.likeCount,
          isLikedByMe: evt.actorUserId === user?.id ? evt.isLiked : prev.isLikedByMe,
        };
      });
    };

    const onCommentsToggled = (evt: CommentsToggledEvent) => {
      if (evt.announcementId !== id) return;
      setItem((prev) => (prev ? { ...prev, allowComments: evt.allowComments } : prev));
      if (!evt.allowComments) setReplyTarget(null);
    };

    conn.on('CommentAdded', onCommentAdded);
    conn.on('CommentDeleted', onCommentDeleted);
    conn.on('LikeUpdated', onLikeUpdated);
    conn.on('CommentsToggled', onCommentsToggled);

    void joinAnnouncementRoom(id).then((connected) => {
      if (mounted) setRealtimeLive(connected);
    });

    return () => {
      mounted = false;
      conn.off('CommentAdded', onCommentAdded);
      conn.off('CommentDeleted', onCommentDeleted);
      conn.off('LikeUpdated', onLikeUpdated);
      conn.off('CommentsToggled', onCommentsToggled);
      void leaveAnnouncementRoom(id);
    };
  }, [id, user?.id]);

  const handleToggleLike = async () => {
    if (!item) return;
    try {
      const res = await apiClient.post<ApiResult<{ isLiked: boolean; likeCount: number }>>(
        `/announcements/${item.id}/like`
      );
      if (res.data.succeeded && res.data.data) {
        const { isLiked, likeCount } = res.data.data;
        setItem((prev) => (prev ? { ...prev, isLikedByMe: isLiked, likeCount } : prev));
      }
    } catch {
      // Ignore error
    }
  };

  const handleToggleComments = async () => {
    if (!item) return;
    try {
      const res = await apiClient.patch<ApiResult<AnnouncementDetailItem>>(
        `/announcements/${item.id}/toggle-comments`,
        { allowComments: !item.allowComments }
      );
      if (res.data.succeeded && res.data.data) {
        setItem((prev) => (prev ? { ...prev, allowComments: res.data.data!.allowComments } : prev));
      }
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err));
    }
  };

  const handleStartReply = (
    rootCommentId: string,
    target: AnnouncementCommentItem,
    isNestedReply = false
  ) => {
    setReplyTarget({ rootCommentId, target });
    if (isNestedReply) {
      const mentionPrefix = `@${target.username} `;
      setCommentText((prev) => {
        const cleaned = prev.replace(/^@\S+\s+/, '');
        return `${mentionPrefix}${cleaned}`;
      });
    } else {
      setCommentText((prev) => prev.replace(/^@\S+\s+/, ''));
    }
    setTimeout(() => composerInputRef.current?.focus(), 60);
  };

  const handleCancelReply = () => {
    setReplyTarget(null);
    setCommentText((prev) => prev.replace(/^@\S+\s+/, ''));
  };

  const handleSendComment = async () => {
    if (!item || !commentText.trim()) return;
    setSendingComment(true);
    try {
      const parentId = replyTarget ? replyTarget.rootCommentId : null;
      const res = await apiClient.post<ApiResult<AnnouncementCommentItem>>(
        `/announcements/${item.id}/comments`,
        {
          content: commentText.trim(),
          parentCommentId: parentId,
        }
      );
      if (res.data.succeeded && res.data.data) {
        const created = res.data.data;
        setCommentText('');
        setReplyTarget(null);
        setItem((prev) => {
          if (!prev) return prev;
          if (prev.comments.some((c) => c.id === created.id)) return prev;
          return {
            ...prev,
            commentCount: prev.commentCount + 1,
            comments: [created, ...prev.comments],
          };
        });
      }
    } catch (err) {
      Alert.alert('Gagal Mengirim Komentar', getErrorMessage(err));
    } finally {
      setSendingComment(false);
    }
  };

  const renderCommentText = (text: string, isReply = false) => {
    const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
    return (
      <Text style={[isReply ? styles.replyContent : styles.commentContent, { color: colors.text }]}>
        {parts.map((part, idx) =>
          part.startsWith('@') ? (
            <Text key={idx} style={{ color: colors.primary, fontWeight: '700' }}>
              {part}
            </Text>
          ) : (
            <React.Fragment key={idx}>{part}</React.Fragment>
          )
        )}
      </Text>
    );
  };

  const handleDeleteComment = (comment: AnnouncementCommentItem) => {
    if (!item) return;
    Alert.alert('Hapus Komentar', 'Yakin ingin menghapus komentar ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/announcements/${item.id}/comments/${comment.id}`);
            setItem((prev) => {
              if (!prev) return prev;
              const remaining = prev.comments.filter(
                (c) => c.id !== comment.id && c.parentCommentId !== comment.id
              );
              return { ...prev, commentCount: remaining.length, comments: remaining };
            });
          } catch (err) {
            Alert.alert('Gagal', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const openAttachment = (url: string) => {
    const resolved = resolveMediaUrl(url);
    if (resolved) {
      void Linking.openURL(resolved);
    }
  };

  const bannerUri = resolveMediaUrl(item?.bannerUrl);
  const imageAttachments = item?.attachments.filter((a) => a.kind === 'Image') ?? [];
  const fileAttachments = item?.attachments.filter((a) => a.kind === 'File') ?? [];

  const rootComments = item?.comments.filter((c) => !c.parentCommentId) ?? [];
  const getReplies = (rootId: string) =>
    (item?.comments.filter((c) => c.parentCommentId === rootId) ?? []).reverse();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>
          Detail Pengumuman
        </Text>
        <View
          style={[
            styles.liveBadge,
            { backgroundColor: realtimeLive ? colors.successLight : colors.surfaceMuted },
          ]}
        >
          <Radio size={11} color={realtimeLive ? colors.success : colors.textMuted} />
          <Text style={[styles.liveText, { color: realtimeLive ? colors.success : colors.textMuted }]}>
            {realtimeLive ? 'LIVE' : 'SYNC'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.mutedText, { color: colors.textSecondary }]}>Memuat detail...</Text>
        </View>
      ) : error || !item ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>
            {error || 'Pengumuman tidak ditemukan.'}
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} style={styles.heroBanner} contentFit="cover" />
            ) : null}

            {/* Article Card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.tagRow}>
                <View style={[styles.typeBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.typeText, { color: colors.primary }]}>{item.type}</Text>
                </View>
                {item.isPinned ? (
                  <View style={[styles.pinBadge, { backgroundColor: colors.warningLight }]}>
                    <Pin size={10} color={colors.warning} />
                    <Text style={[styles.pinText, { color: colors.warning }]}>Pinned</Text>
                  </View>
                ) : null}
              </View>

              <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

              <View style={styles.authorRow}>
                <UserAvatar
                  userId={item.authorUserId}
                  name={item.authorFullName}
                  size={34}
                  borderColor={colors.border}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.authorName, { color: colors.text }]}>
                    {item.authorFullName} ({item.authorRole})
                  </Text>
                  <Text style={[styles.publishedAt, { color: colors.textMuted }]}>
                    {formatDateTime(item.publishedAt)}
                  </Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Text style={[styles.bodyText, { color: colors.text }]}>
                {htmlToReadableText(item.contentHtml) || item.summary}
              </Text>

              {/* Image Attachments */}
              {imageAttachments.length > 0 ? (
                <View style={{ gap: 8, marginTop: 6 }}>
                  <Text style={[styles.attachTitle, { color: colors.textSecondary }]}>
                    GALERI GAMBAR ({imageAttachments.length})
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {imageAttachments.map((att, idx) => {
                      const imgUri = resolveMediaUrl(att.url);
                      if (!imgUri) return null;
                      return (
                        <Pressable key={att.id || idx} onPress={() => openAttachment(att.url)}>
                          <Image source={{ uri: imgUri }} style={styles.galleryThumb} contentFit="cover" />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {/* File Attachments */}
              {fileAttachments.length > 0 ? (
                <View style={{ gap: 8, marginTop: 6 }}>
                  <Text style={[styles.attachTitle, { color: colors.textSecondary }]}>
                    LAMPIRAN FILE ({fileAttachments.length})
                  </Text>
                  {fileAttachments.map((att, idx) => (
                    <Pressable
                      key={att.id || idx}
                      onPress={() => openAttachment(att.url)}
                      style={[
                        styles.fileRow,
                        { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                      ]}
                    >
                      <Paperclip size={15} color={colors.primary} />
                      <Text numberOfLines={1} style={[styles.fileName, { color: colors.text }]}>
                        {att.fileName}
                      </Text>
                      <Download size={15} color={colors.primary} />
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {/* Like + Toggle Comment Action Bar */}
              <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
                <Pressable
                  onPress={() => void handleToggleLike()}
                  style={[
                    styles.likeBtn,
                    {
                      backgroundColor: item.isLikedByMe ? colors.dangerLight : colors.surfaceMuted,
                      borderColor: item.isLikedByMe ? colors.danger : colors.border,
                    },
                  ]}
                >
                  <Heart
                    size={16}
                    color={item.isLikedByMe ? colors.danger : colors.textSecondary}
                    fill={item.isLikedByMe ? colors.danger : 'transparent'}
                  />
                  <Text
                    style={[
                      styles.likeBtnText,
                      { color: item.isLikedByMe ? colors.danger : colors.text },
                    ]}
                  >
                    {item.isLikedByMe ? 'Disukai' : 'Suka'} ({item.likeCount})
                  </Text>
                </Pressable>

                {canManage ? (
                  <Pressable
                    onPress={() => void handleToggleComments()}
                    style={[
                      styles.toggleCommentBtn,
                      { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                    ]}
                  >
                    {item.allowComments ? (
                      <MessageSquareOff size={15} color={colors.warning} />
                    ) : (
                      <MessageSquare size={15} color={colors.success} />
                    )}
                    <Text style={[styles.toggleCommentText, { color: colors.text }]}>
                      {item.allowComments ? 'Tutup Komentar' : 'Buka Komentar'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Comments Section */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Komentar ({item.commentCount})
              </Text>

              {!item.allowComments ? (
                <View style={[styles.closedNotice, { backgroundColor: colors.surfaceMuted }]}>
                  <MessageSquareOff size={16} color={colors.textMuted} />
                  <Text style={[styles.closedText, { color: colors.textSecondary }]}>
                    Komentar dinonaktifkan untuk pengumuman ini.
                  </Text>
                </View>
              ) : null}

              {rootComments.length === 0 ? (
                <Text style={[styles.mutedText, { color: colors.textMuted }]}>
                  Belum ada komentar. Jadilah yang pertama berkomentar!
                </Text>
              ) : (
                rootComments.map((comment) => {
                  const replies = getReplies(comment.id);
                  const canDelete = canManage || comment.userId === user?.id;
                  return (
                    <View key={comment.id} style={[styles.commentBlock, { borderTopColor: colors.border }]}>
                      <View style={styles.commentHeader}>
                        <UserAvatar
                          userId={comment.userId}
                          name={comment.fullName}
                          size={28}
                          borderColor={colors.border}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.commentAuthor, { color: colors.text }]}>
                            {comment.fullName}
                          </Text>
                          <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                            {comment.userRole} • {formatDateTime(comment.createdAt)}
                          </Text>
                        </View>
                        {item.allowComments ? (
                          <Pressable
                            onPress={() => handleStartReply(comment.id, comment, false)}
                            hitSlop={6}
                            style={styles.replyActionBtn}
                          >
                            <Reply size={14} color={colors.primary} />
                            <Text style={[styles.replyActionLabel, { color: colors.primary }]}>
                              Balas
                            </Text>
                          </Pressable>
                        ) : null}
                        {canDelete ? (
                          <Pressable
                            onPress={() => handleDeleteComment(comment)}
                            hitSlop={6}
                            style={{ padding: 4 }}
                          >
                            <Trash2 size={14} color={colors.danger} />
                          </Pressable>
                        ) : null}
                      </View>
                      {renderCommentText(comment.content, false)}

                      {/* Replies (IG-style nested reply within the same root thread) */}
                      {replies.map((rep) => {
                        const canDeleteReply = canManage || rep.userId === user?.id;
                        return (
                          <View
                            key={rep.id}
                            style={[
                              styles.replyItem,
                              { backgroundColor: colors.surfaceMuted, borderLeftColor: colors.primary },
                            ]}
                          >
                            <View style={styles.commentHeader}>
                              <UserAvatar
                                userId={rep.userId}
                                name={rep.fullName}
                                size={22}
                                borderColor={colors.border}
                              />
                              <View style={{ flex: 1 }}>
                                <Text numberOfLines={1} style={[styles.replyAuthor, { color: colors.text }]}>
                                  {rep.fullName}{' '}
                                  <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                                    @{rep.username}
                                  </Text>
                                </Text>
                                <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                                  {formatDateTime(rep.createdAt)}
                                </Text>
                              </View>
                              {item.allowComments ? (
                                <Pressable
                                  onPress={() => handleStartReply(comment.id, rep, true)}
                                  hitSlop={6}
                                  style={styles.replyActionBtn}
                                >
                                  <Reply size={13} color={colors.primary} />
                                  <Text style={[styles.replyActionLabel, { color: colors.primary }]}>
                                    Balas
                                  </Text>
                                </Pressable>
                              ) : null}
                              {canDeleteReply ? (
                                <Pressable
                                  onPress={() => handleDeleteComment(rep)}
                                  hitSlop={6}
                                  style={{ padding: 4 }}
                                >
                                  <Trash2 size={13} color={colors.danger} />
                                </Pressable>
                              ) : null}
                            </View>
                            {renderCommentText(rep.content, true)}
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* Sticky Comment Composer */}
          {item.allowComments ? (
            <View style={[styles.composerWrap, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              {replyTarget ? (
                <View style={[styles.replyBanner, { backgroundColor: colors.primaryLight }]}>
                  <Text numberOfLines={1} style={[styles.replyBannerText, { color: colors.primary }]}>
                    Membalas @{replyTarget.target.username} ({replyTarget.target.fullName})
                  </Text>
                  <Pressable onPress={handleCancelReply} hitSlop={8}>
                    <X size={14} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.composerRow}>
                <TextInput
                  ref={composerInputRef}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder={
                    replyTarget
                      ? `Balas @${replyTarget.target.username}...`
                      : 'Tulis komentar...'
                  }
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.composerInput,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                />
                <Pressable
                  onPress={() => void handleSendComment()}
                  disabled={sendingComment || !commentText.trim()}
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: sendingComment || !commentText.trim() ? 0.5 : 1,
                    },
                  ]}
                >
                  {sendingComment ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Send size={16} color={colors.primaryForeground} />
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  liveText: { fontSize: 10, fontWeight: '800' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errorTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  mutedText: { fontSize: 13 },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  heroBanner: { width: '100%', height: 190, borderRadius: radius.xl },
  card: { borderWidth: 1, borderRadius: radius.xl, padding: 16, gap: 12 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  typeText: { fontSize: 11, fontWeight: '800' },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  pinText: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorName: { fontSize: 13, fontWeight: '700' },
  publishedAt: { fontSize: 11, marginTop: 1 },
  divider: { height: 1 },
  bodyText: { fontSize: 14, lineHeight: 22 },
  attachTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  galleryThumb: { width: 140, height: 100, borderRadius: radius.md },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 11,
  },
  fileName: { flex: 1, fontSize: 13, fontWeight: '600' },
  actionBar: {
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  likeBtnText: { fontSize: 13, fontWeight: '700' },
  toggleCommentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 'auto',
  },
  toggleCommentText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  closedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
  },
  closedText: { fontSize: 12, fontWeight: '600' },
  commentBlock: { borderTopWidth: 1, paddingTop: 12, gap: 6 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentAuthor: { fontSize: 13, fontWeight: '700' },
  commentTime: { fontSize: 11 },
  commentContent: { fontSize: 13, lineHeight: 19, paddingLeft: 36 },
  replyItem: {
    marginLeft: 36,
    marginTop: 4,
    padding: 10,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    gap: 4,
  },
  replyAuthor: { fontSize: 12, fontWeight: '700' },
  replyContent: { fontSize: 12, lineHeight: 18 },
  replyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  replyActionLabel: { fontSize: 11, fontWeight: '700' },
  composerWrap: { borderTopWidth: 1, padding: 12, gap: 8 },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  replyBannerText: { fontSize: 12, fontWeight: '700' },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
