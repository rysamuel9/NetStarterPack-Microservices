import React, { useEffect, useState } from 'react';
import { UserAvatar } from '../../components/UserAvatar';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Plus,
  Search,
  Heart,
  MessageSquare,
  MessageSquareOff,
  Pin,
  Image as ImageIcon,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  CheckCheck,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  ensureAnnouncementHubStarted,
  getAnnouncementHubConnection,
  type AnnouncementStatsChangedEvent,
} from '../../services/announcementHub';
import { ANNOUNCEMENT_TYPES, announcementTypeStyle } from '../../utils/announcementMeta';
import { formatRelativeTime } from '../../utils/formatters';
import { AnnouncementComposerModal } from './AnnouncementComposerModal';
import type {
  AnnouncementDetailItem,
  AnnouncementSummaryItem,
  ApiResult,
  PagedAnnouncementsResponse,
} from '../../types';

export const AnnouncementsPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const canManage = hasPermission('Announcements.Manage');

  const [data, setData] = useState<PagedAnnouncementsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AnnouncementDetailItem | null>(null);

  const loadFeed = async (targetPage = page, targetType = typeFilter, targetSearch = search) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('pageSize', '10');
      if (targetType) params.set('type', targetType);
      if (targetSearch.trim()) params.set('search', targetSearch.trim());

      const res = await api.get<ApiResult<PagedAnnouncementsResponse>>(`/announcements?${params.toString()}`);
      if (res.data.succeeded && res.data.data) {
        setData(res.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat daftar pengumuman dari Announcement.Api (:5085).'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed(page, typeFilter, search);
  }, [page, typeFilter]);

  useEffect(() => {
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

    const onPublished = (summary: AnnouncementSummaryItem) => {
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
    ensureAnnouncementHubStarted();

    return () => {
      conn.off('AnnouncementStatsChanged', onStatsChanged);
      conn.off('AnnouncementPublished', onPublished);
    };
  }, [typeFilter, user?.id, user?.username]);

  const openCreateModal = () => {
    setEditingItem(null);
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await api.get<ApiResult<AnnouncementDetailItem>>(`/announcements/${id}?markAsRead=false`);
      if (res.data.succeeded && res.data.data) {
        setEditingItem(res.data.data);
        setError(null);
        setModalOpen(true);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat data pengumuman untuk diedit.'));
    }
  };

  const handleSaved = async (wasEdit: boolean) => {
    setModalOpen(false);
    setEditingItem(null);
    setNotice(wasEdit ? 'Pengumuman berhasil diperbarui.' : 'Pengumuman baru berhasil dipublish!');
    setPage(1);
    await loadFeed(1, typeFilter, search);
    window.dispatchEvent(new Event('announcement-read-updated'));
  };

  const handleToggleLike = async (e: React.MouseEvent, item: AnnouncementSummaryItem) => {
    e.stopPropagation();
    try {
      const res = await api.post<ApiResult<{ isLiked: boolean; likeCount: number }>>(
        `/announcements/${item.id}/like`
      );
      if (res.data.succeeded && res.data.data && data) {
        const { isLiked, likeCount } = res.data.data;
        setData({
          ...data,
          items: data.items.map((x) =>
            x.id === item.id ? { ...x, isLikedByMe: isLiked, likeCount } : x
          ),
        });
      }
    } catch {
      // ignore
    }
  };

  const handleToggleCommentsCard = async (e: React.MouseEvent, item: AnnouncementSummaryItem) => {
    e.stopPropagation();
    try {
      const res = await api.patch<ApiResult<AnnouncementDetailItem>>(
        `/announcements/${item.id}/toggle-comments`,
        { allowComments: !item.allowComments }
      );
      if (res.data.succeeded && data) {
        setData({
          ...data,
          items: data.items.map((x) =>
            x.id === item.id ? { ...x, allowComments: !item.allowComments } : x
          ),
        });
        setNotice(
          !item.allowComments
            ? `Komentar diaktifkan kembali pada "${item.title}".`
            : `Komentar dinonaktifkan pada "${item.title}".`
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengubah pengaturan komentar.'));
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: AnnouncementSummaryItem) => {
    e.stopPropagation();
    if (!window.confirm(`Yakin ingin menghapus pengumuman "${item.title}"?`)) return;
    try {
      await api.delete(`/announcements/${item.id}`);
      setNotice(`Pengumuman "${item.title}" berhasil dihapus.`);
      await loadFeed(page, typeFilter, search);
      window.dispatchEvent(new Event('announcement-read-updated'));
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menghapus pengumuman.'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/announcements/mark-all-read');
      await loadFeed(page, typeFilter, search);
      window.dispatchEvent(new Event('announcement-read-updated'));
      setNotice('Semua pengumuman telah ditandai sudah dibaca.');
    } catch {
      // ignore
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-3xl p-6 text-white border border-teal-800/50 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <Bell className="w-3.5 h-3.5" />
            <span>INTERNAL NEWSROOM • ANNOUNCEMENT.API (:5085)</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Papan Pengumuman Perusahaan</h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Update kebijakan HR, jadwal townhall, info urgent, dan kabar komunitas terbaru—10 pengumuman terbaru per halaman.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {(data?.unreadCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
            >
              <CheckCheck className="w-4 h-4 text-teal-400" />
              <span>Tandai Semua Dibaca ({data?.unreadCount})</span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 text-sm font-bold shadow-lg shadow-teal-500/25"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Pengumuman</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {ANNOUNCEMENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setTypeFilter(t.value);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                typeFilter === t.value
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            loadFeed(1, typeFilter, search);
          }}
          className="relative"
        >
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul, ringkasan, penulis..."
            className="pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs w-full md:w-64 focus:outline-none focus:border-teal-500"
          />
        </form>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-72 rounded-3xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-14 text-center bg-white rounded-3xl border border-slate-200 space-y-2">
          <Bell className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800">Belum ada pengumuman yang cocok</h3>
          <p className="text-xs text-slate-500">Coba ganti filter tipe atau kata kunci pencarian.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((item, idx) => {
            const style = announcementTypeStyle(item.type);
            const isHero = page === 1 && idx === 0 && item.isPinned;

            return (
              <article
                key={item.id}
                onClick={() => navigate(`/announcements/${item.id}`)}
                className={`group cursor-pointer bg-white rounded-3xl border overflow-hidden shadow-xs hover:shadow-lg hover:border-teal-300 transition-all flex flex-col justify-between ${
                  isHero ? 'md:col-span-2 md:flex-row' : ''
                } ${!item.isReadByMe ? 'border-teal-400/70 ring-1 ring-teal-500/15' : 'border-slate-200'}`}
              >
                <div
                  className={`relative overflow-hidden shrink-0 ${
                    isHero ? 'h-52 md:h-auto md:w-5/12' : 'h-44 w-full'
                  }`}
                >
                  {item.bannerUrl ? (
                    <img
                      src={item.bannerUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                    />
                  ) : (
                    <div
                      className={`w-full h-full bg-gradient-to-br ${style.gradient} p-6 flex flex-col justify-end`}
                    >
                      <Sparkles className="w-8 h-8 text-white/30 mb-2" />
                      <span className="text-xs font-mono uppercase tracking-widest text-white/80">
                        {style.label} Announcement
                      </span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-xs backdrop-blur-xs ${style.badge}`}
                    >
                      {style.label}
                    </span>
                    {item.isPinned && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-950/80 text-amber-300 backdrop-blur-xs">
                        <Pin className="w-3 h-3" /> Disematkan
                      </span>
                    )}
                    {!item.isReadByMe && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500 text-white shadow-sm">
                        BARU
                      </span>
                    )}
                  </div>
                </div>

                <div className={`p-5 flex flex-col justify-between flex-1 ${isHero ? 'md:p-6' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar
                          userId={item.authorUserId}
                          name={item.authorFullName}
                          sizeClass="w-6 h-6 text-[10px]"
                        />
                        <span className="font-semibold text-slate-700 truncate">{item.authorFullName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 text-[10px] font-medium shrink-0">
                          {item.authorRole}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {formatRelativeTime(item.publishedAt)}
                      </span>
                    </div>

                    <h2
                      className={`font-bold text-slate-900 group-hover:text-teal-700 transition-colors leading-snug ${
                        isHero ? 'text-xl' : 'text-base'
                      }`}
                    >
                      {item.title}
                    </h2>
                    <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                      {item.summary}
                    </p>

                    {(item.imageCount > 0 || item.fileCount > 0) && (
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {item.imageCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-medium">
                            <ImageIcon className="w-3 h-3" /> {item.imageCount} Gambar
                          </span>
                        )}
                        {item.fileCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-medium">
                            <Paperclip className="w-3 h-3" /> {item.fileCount} Lampiran File
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleToggleLike(e, item)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          item.isLikedByMe
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : 'bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600 border border-slate-200'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${item.isLikedByMe ? 'fill-rose-500' : ''}`} />
                        <span>{item.likeCount}</span>
                      </button>

                      {item.allowComments ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{item.commentCount}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-slate-100 text-slate-500">
                          <MessageSquareOff className="w-3.5 h-3.5" />
                          <span>Komentar Nonaktif</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleToggleCommentsCard(e, item)}
                            title={item.allowComments ? 'Matikan Komentar' : 'Aktifkan Komentar'}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors ${
                              item.allowComments
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            {item.allowComments ? 'Off Komentar' : 'On Komentar'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => openEditModal(e, item.id)}
                            title="Edit Pengumuman"
                            className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, item)}
                            title="Hapus Pengumuman"
                            className="p-1.5 rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <span className="text-xs font-semibold text-teal-700 pl-1">Baca &rarr;</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {data && data.totalCount > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Menampilkan{' '}
            <strong className="text-slate-800">
              {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.totalCount)}
            </strong>{' '}
            dari <strong className="text-slate-800">{data.totalCount}</strong> pengumuman (Halaman{' '}
            {data.page} / {data.totalPages})
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>

            {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-xl text-xs font-bold transition-colors ${
                  p === data.page
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <span>Berikutnya</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <AnnouncementComposerModal
          initialItem={editingItem}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
};
