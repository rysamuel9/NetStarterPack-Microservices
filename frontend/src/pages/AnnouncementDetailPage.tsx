import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  MessageSquare,
  MessageSquareOff,
  Pin,
  Download,
  Image as ImageIcon,
  Paperclip,
  Send,
  Trash2,
  X,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { announcementTypeStyle, formatRelativeTime } from './AnnouncementsPage';
import type { AnnouncementDetailItem, ApiResult } from '../types';

export const AnnouncementDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();

  const canManage = hasPermission('Announcements.Manage');

  const [item, setItem] = useState<AnnouncementDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [togglingComments, setTogglingComments] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadDetail = async (markAsRead = true) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResult<AnnouncementDetailItem>>(
        `/announcements/${id}?markAsRead=${markAsRead}`
      );
      if (res.data.succeeded && res.data.data) {
        setItem(res.data.data);
        if (markAsRead) {
          window.dispatchEvent(new Event('announcement-read-updated'));
        }
      } else {
        setError(res.data.message || 'Pengumuman tidak ditemukan.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat detail pengumuman.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail(true);
  }, [id]);

  const handleToggleLike = async () => {
    if (!item) return;
    try {
      const res = await api.post<ApiResult<{ isLiked: boolean; likeCount: number }>>(
        `/announcements/${item.id}/like`
      );
      if (res.data.succeeded && res.data.data) {
        setItem({ ...item, isLikedByMe: res.data.data.isLiked, likeCount: res.data.data.likeCount });
      }
    } catch {
      // ignore
    }
  };

  const handleToggleComments = async () => {
    if (!item) return;
    setTogglingComments(true);
    setError(null);
    try {
      const res = await api.patch<ApiResult<AnnouncementDetailItem>>(
        `/announcements/${item.id}/toggle-comments`,
        { allowComments: !item.allowComments }
      );
      if (res.data.succeeded && res.data.data) {
        setItem(res.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengubah pengaturan komentar.'));
    } finally {
      setTogglingComments(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !commentText.trim()) return;
    setSendingComment(true);
    setError(null);
    try {
      const res = await api.post(`/announcements/${item.id}/comments`, {
        content: commentText.trim(),
      });
      if (res.data.succeeded) {
        setCommentText('');
        await loadDetail(false);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menambahkan komentar.'));
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!item) return;
    try {
      await api.delete(`/announcements/${item.id}/comments/${commentId}`);
      await loadDetail(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menghapus komentar.'));
    }
  };

  const formatBytes = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-10 text-center text-sm text-slate-500 bg-white rounded-3xl border border-slate-200">
        Memuat detail pengumuman...
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-3xl mx-auto p-10 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-slate-800">{error || 'Pengumuman tidak ditemukan.'}</p>
        <button
          type="button"
          onClick={() => navigate('/announcements')}
          className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold"
        >
          &larr; Kembali ke Daftar Pengumuman
        </button>
      </div>
    );
  }

  const style = announcementTypeStyle(item.type);
  const imageAttachments = item.attachments.filter((a) => a.kind === 'Image');
  const fileAttachments = item.attachments.filter((a) => a.kind === 'File');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/announcements')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Semua Pengumuman</span>
        </button>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={togglingComments}
              onClick={handleToggleComments}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                item.allowComments
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
              }`}
            >
              {item.allowComments ? (
                <>
                  <MessageSquareOff className="w-4 h-4" />
                  <span>Matikan Komentar</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>Aktifkan Komentar</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Article Card */}
      <article className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        {item.bannerUrl && (
          <div className="w-full h-56 sm:h-72 overflow-hidden bg-slate-900">
            <img src={item.bannerUrl} alt={item.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-3 py-0.5 rounded-full text-xs font-bold border ${style.badge}`}>
              {style.label}
            </span>
            {item.isPinned && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                <Pin className="w-3 h-3" /> Disematkan
              </span>
            )}
            <span className="text-xs text-slate-400">
              Diterbitkan {new Date(item.publishedAt).toLocaleString('id-ID')}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">{item.title}</h1>

          <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center">
              {item.authorFullName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{item.authorFullName}</p>
              <p className="text-xs text-slate-500">
                @{item.authorUsername} • <span className="text-teal-700 font-semibold">{item.authorRole}</span>
              </p>
            </div>
          </div>

          {/* Rendered Compact Rich HTML */}
          <div
            className="text-sm sm:text-base text-slate-700 leading-relaxed space-y-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-bold [&_strong]:text-slate-900 [&_em]:italic [&_a]:text-teal-700 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: item.contentHtml }}
          />

          {/* Image Attachments Gallery (Tampil Visual!) */}
          {imageAttachments.length > 0 && (
            <div className="pt-5 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-teal-600" />
                Lampiran Gambar ({imageAttachments.length}) — Klik untuk perbesar
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {imageAttachments.map((img) => (
                  <div
                    key={img.storedFileName}
                    onClick={() => setLightboxUrl(img.url)}
                    className="group cursor-pointer rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 hover:border-teal-400 transition-all"
                  >
                    <img
                      src={img.url}
                      alt={img.fileName}
                      className="w-full h-52 object-cover group-hover:scale-102 transition-transform"
                    />
                    <div className="px-3.5 py-2 text-xs text-slate-600 flex items-center justify-between">
                      <span className="truncate font-medium">{img.fileName}</span>
                      <span className="text-[11px] text-slate-400">{formatBytes(img.fileSizeBytes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Attachments */}
          {fileAttachments.length > 0 && (
            <div className="pt-5 border-t border-slate-100 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-teal-600" />
                Lampiran File ({fileAttachments.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fileAttachments.map((f) => (
                  <a
                    key={f.storedFileName}
                    href={`${f.url}?download=true`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 hover:bg-teal-50/70 border border-slate-200 hover:border-teal-300 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{f.fileName}</p>
                      <p className="text-[11px] text-slate-500">{formatBytes(f.fileSizeBytes)}</p>
                    </div>
                    <span className="p-2 rounded-xl bg-white border border-slate-200 text-teal-700 shrink-0">
                      <Download className="w-4 h-4" />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Like Bar */}
          <div className="pt-5 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handleToggleLike}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold border transition-all ${
                item.isLikedByMe
                  ? 'bg-rose-50 text-rose-600 border-rose-300 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-600'
              }`}
            >
              <Heart className={`w-4 h-4 ${item.isLikedByMe ? 'fill-rose-500' : ''}`} />
              <span>{item.isLikedByMe ? 'Disukai' : 'Sukai Pengumuman'} ({item.likeCount})</span>
            </button>

            <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-teal-600" />
              {item.commentCount} Komentar
            </span>
          </div>
        </div>
      </article>

      {/* Comments Section */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-5 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-600" />
            <span>Diskusi &amp; Komentar ({item.comments.length})</span>
          </h2>
          {!item.allowComments && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              <Lock className="w-3 h-3" /> Komentar Dinonaktifkan
            </span>
          )}
        </div>

        {item.allowComments ? (
          <form onSubmit={handleAddComment} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Tulis tanggapan atau pertanyaan kamu di sini..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
            />
            <button
              type="submit"
              disabled={sendingComment || !commentText.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{sendingComment ? 'Mengirim...' : 'Kirim'}</span>
            </button>
          </form>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2.5">
            <MessageSquareOff className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Komentar sedang dinonaktifkan oleh tim HR untuk pengumuman ini.
              {canManage && ' Kamu bisa mengaktifkannya kembali kapan saja lewat tombol "Aktifkan Komentar" di atas.'}
            </span>
          </div>
        )}

        {item.comments.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Belum ada komentar.</p>
        ) : (
          <div className="space-y-3">
            {item.comments.map((c) => {
              const canDelete = c.userId === user?.id || canManage;
              return (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center shrink-0">
                      {c.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{c.fullName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-500">
                          {c.userRole}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatRelativeTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{c.content}</p>
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(c.id)}
                      title="Hapus Komentar"
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Lightbox Image Modal */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Preview Lampiran"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[88vh] rounded-2xl shadow-2xl border border-white/10"
          />
        </div>
      )}
    </div>
  );
};
