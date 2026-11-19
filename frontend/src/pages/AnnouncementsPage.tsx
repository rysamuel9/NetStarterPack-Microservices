import React, { useEffect, useRef, useState } from 'react';
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
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  X,
  Upload,
  Trash2,
  Edit3,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  CheckCheck,
} from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { EmojiPickerButton } from '../components/EmojiPickerButton';
import type {
  AnnouncementAttachmentItem,
  AnnouncementDetailItem,
  AnnouncementSummaryItem,
  ApiResult,
  PagedAnnouncementsResponse,
} from '../types';

const ANNOUNCEMENT_TYPES = [
  { value: '', label: 'Semua Tipe' },
  { value: 'Urgent', label: 'Urgent' },
  { value: 'HRPolicy', label: 'HR Policy' },
  { value: 'Event', label: 'Event' },
  { value: 'Celebration', label: 'Celebration' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'General', label: 'General' },
];

export const announcementTypeStyle = (type: string) => {
  switch (type) {
    case 'Urgent':
      return { badge: 'bg-rose-100 text-rose-800 border-rose-200', gradient: 'from-rose-700 to-orange-600', label: 'Urgent' };
    case 'HRPolicy':
      return { badge: 'bg-teal-100 text-teal-800 border-teal-200', gradient: 'from-teal-700 to-cyan-700', label: 'HR Policy' };
    case 'Event':
      return { badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', gradient: 'from-indigo-700 to-violet-700', label: 'Event' };
    case 'Celebration':
      return { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', gradient: 'from-emerald-700 to-teal-600', label: 'Celebration' };
    case 'Maintenance':
      return { badge: 'bg-amber-100 text-amber-800 border-amber-200', gradient: 'from-amber-700 to-orange-700', label: 'Maintenance' };
    default:
      return { badge: 'bg-slate-100 text-slate-700 border-slate-200', gradient: 'from-slate-800 to-slate-700', label: 'General' };
  }
};

export const formatRelativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const AnnouncementsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const canManage = hasPermission('Announcements.Manage');

  const [data, setData] = useState<PagedAnnouncementsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Composer Modal state (Create / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [type, setType] = useState('HRPolicy');
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [allowComments, setAllowComments] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [attachments, setAttachments] = useState<AnnouncementAttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const [initialEditorHtml, setInitialEditorHtml] = useState('');

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
    if (modalOpen && editorRef.current) {
      editorRef.current.innerHTML = initialEditorHtml;
    }
  }, [modalOpen, initialEditorHtml]);

  const openCreateModal = () => {
    setEditingId(null);
    setTitle('');
    setSummary('');
    setType('HRPolicy');
    setBannerUrl('');
    setAllowComments(true);
    setIsPinned(false);
    setAttachments([]);
    setInitialEditorHtml('<p></p>');
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await api.get<ApiResult<AnnouncementDetailItem>>(`/announcements/${id}?markAsRead=false`);
      if (res.data.succeeded && res.data.data) {
        const d = res.data.data;
        setEditingId(d.id);
        setTitle(d.title);
        setSummary(d.summary);
        setType(d.type);
        setBannerUrl(d.bannerUrl || '');
        setAllowComments(d.allowComments);
        setIsPinned(d.isPinned);
        setAttachments(d.attachments);
        setInitialEditorHtml(d.contentHtml);
        setModalOpen(true);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat data pengumuman untuk diedit.'));
    }
  };

  const applyFormat = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const handleInsertLink = () => {
    const url = window.prompt('Masukkan URL tautan (https://...):', 'https://');
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      applyFormat('createLink', url);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'Banner' | 'Image' | 'File'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post<ApiResult<AnnouncementAttachmentItem>>(
          `/announcements/upload?kind=${kind}`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        if (res.data.succeeded && res.data.data) {
          const uploaded = res.data.data;
          if (kind === 'Banner') {
            setBannerUrl(uploaded.url);
          } else {
            setAttachments((prev) => [...prev, uploaded]);
          }
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengunggah file lampiran.'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const contentHtml = editorRef.current?.innerHTML || '';
    if (!title.trim()) {
      setError('Judul pengumuman wajib diisi.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        title: title.trim(),
        summary: summary.trim() || null,
        type,
        contentHtml,
        bannerUrl: bannerUrl || null,
        allowComments,
        isPinned,
        attachments: attachments.map((a) => ({
          fileName: a.fileName,
          storedFileName: a.storedFileName,
          contentType: a.contentType,
          fileSizeBytes: a.fileSizeBytes,
          kind: a.kind,
          url: a.url,
        })),
      };

      const res = editingId
        ? await api.put<ApiResult<AnnouncementDetailItem>>(`/announcements/${editingId}`, payload)
        : await api.post<ApiResult<AnnouncementDetailItem>>('/announcements', payload);

      if (res.data.succeeded) {
        setModalOpen(false);
        setNotice(editingId ? 'Pengumuman berhasil diperbarui.' : 'Pengumuman baru berhasil dipublish!');
        setPage(1);
        await loadFeed(1, typeFilter, search);
        window.dispatchEvent(new Event('announcement-read-updated'));
      } else {
        setError(res.data.message || 'Gagal menyimpan pengumuman.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menyimpan pengumuman ke Announcement.Api.'));
    } finally {
      setSaving(false);
    }
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

  const formatBytes = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Editorial Newsroom Header */}
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

      {/* Editorial Card Grid (NOT a plain table!) */}
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
                {/* Visual Banner */}
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

                  {/* Top Badges Overlay */}
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

                {/* Body Content */}
                <div className={`p-5 flex flex-col justify-between flex-1 ${isHero ? 'md:p-6' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold text-[11px] flex items-center justify-center shrink-0">
                          {item.authorFullName.charAt(0)}
                        </div>
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

                    {/* Attachment badges */}
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

                  {/* Footer Actions */}
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

      {/* Pagination Bar (10 per page) */}
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

      {/* Compact Word-Like Composer Modal (HRStaff, HRSupervisor, HRManager) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingId ? 'Edit Pengumuman' : 'Buat Pengumuman Baru (HR Newsroom)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Mendukung format ringkas (Bold, Italic, List, Link), Banner visual, Lampiran Gambar, &amp; Lampiran File.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAnnouncement} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Judul Pengumuman <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Jadwal Townhall Q4 & Kebijakan Hybrid Baru"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Pengumuman</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-teal-500"
                  >
                    {ANNOUNCEMENT_TYPES.filter((t) => t.value).map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ringkasan Singkat (Opsional — otomatis diambil dari isi jika dikosongkan)
                </label>
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Satu kalimat pengantar yang tampil di kartu feed & notifikasi bel..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Banner Upload */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-teal-600" />
                    Banner Utama Pengumuman (Opsional)
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-teal-500 text-xs font-semibold text-slate-700">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading ? 'Mengunggah...' : 'Upload Banner'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'Banner')}
                    />
                  </label>
                </div>
                {bannerUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 h-36">
                    <img src={bannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setBannerUrl('')}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/70 text-white hover:bg-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Compact Word-Like Rich Text Editor */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Isi Pengumuman <span className="text-rose-500">*</span>
                </label>
                <div className="rounded-2xl border border-slate-300 overflow-hidden focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/15">
                  <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyFormat('bold')}
                      title="Bold (Ctrl+B)"
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
                    >
                      <Bold className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('italic')}
                      title="Italic (Ctrl+I)"
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
                    >
                      <Italic className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('underline')}
                      title="Underline (Ctrl+U)"
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
                    >
                      <Underline className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-slate-300 mx-1" />
                    <button
                      type="button"
                      onClick={() => applyFormat('insertUnorderedList')}
                      title="Bullet List"
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('insertOrderedList')}
                      title="Numbered List"
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
                    >
                      <ListOrdered className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleInsertLink}
                      title="Sisipkan Link"
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-slate-300 mx-1" />
                    <EmojiPickerButton
                      size="sm"
                      align="left"
                      title="Sisipkan Emoji ke Isi Pengumuman"
                      onSelect={(emoji) => applyFormat('insertText', emoji)}
                    />
                  </div>

                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="min-h-40 max-h-72 overflow-y-auto p-4 text-sm text-slate-800 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-teal-700 [&_a]:underline"
                  />
                </div>
              </div>

              {/* Attachment Gambar & Attachment File */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Lampiran Gambar</span>
                    <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-teal-500 text-[11px] font-semibold text-teal-700">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>+ Gambar</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'Image')}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {attachments
                      .filter((a) => a.kind === 'Image')
                      .map((img) => (
                        <div key={img.storedFileName} className="relative rounded-lg overflow-hidden border h-16">
                          <img src={img.url} alt={img.fileName} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() =>
                              setAttachments((prev) =>
                                prev.filter((x) => x.storedFileName !== img.storedFileName)
                              )
                            }
                            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-slate-950/70 text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Lampiran File (PDF/DOCX/XLSX)</span>
                    <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-teal-500 text-[11px] font-semibold text-slate-700">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>+ File</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'File')}
                      />
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    {attachments
                      .filter((a) => a.kind === 'File')
                      .map((f) => (
                        <div
                          key={f.storedFileName}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px]"
                        >
                          <span className="truncate font-medium text-slate-700">
                            {f.fileName} ({formatBytes(f.fileSizeBytes)})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachments((prev) =>
                                prev.filter((x) => x.storedFileName !== f.storedFileName)
                              )
                            }
                            className="text-rose-500 hover:text-rose-700 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Publish Options: Allow Comments + Pin */}
              <div className="flex flex-wrap items-center gap-6 p-4 rounded-2xl bg-teal-50/60 border border-teal-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                    className="w-4 h-4 accent-teal-600 rounded"
                  />
                  <span>Aktifkan Komentar (bisa di-On/Off lagi setelah publish)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="w-4 h-4 accent-teal-600 rounded"
                  />
                  <span>Sematkan di Atas (Pinned)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm font-bold disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Publish Pengumuman'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
