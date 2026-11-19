import React from 'react';
import {
  CornerDownRight,
  Lock,
  MessageSquare,
  MessageSquareOff,
  Radio,
  Reply,
  Send,
  Trash2,
} from 'lucide-react';
import { EmojiPickerButton } from '../../components/EmojiPickerButton';
import { formatRelativeTime } from '../../utils/formatters';
import type { AnnouncementCommentItem } from '../../types';

interface AnnouncementCommentsSectionProps {
  comments: AnnouncementCommentItem[];
  commentCount: number;
  allowComments: boolean;
  canManage: boolean;
  currentUserId?: string;
  realtimeLive: boolean;
  commentText: string;
  sendingComment: boolean;
  replyingToId: string | null;
  replyingToName: string;
  replyText: string;
  sendingReply: boolean;
  onChangeCommentText: (value: string) => void;
  onAddComment: (e: React.FormEvent) => void;
  onStartReply: (rootCommentId: string, target: AnnouncementCommentItem, isNestedReply?: boolean) => void;
  onCancelReply: () => void;
  onChangeReplyText: (value: string) => void;
  onSendReply: (e: React.FormEvent) => void;
  onDeleteComment: (commentId: string) => void;
}

export const AnnouncementCommentsSection: React.FC<AnnouncementCommentsSectionProps> = ({
  comments,
  commentCount,
  allowComments,
  canManage,
  currentUserId,
  realtimeLive,
  commentText,
  sendingComment,
  replyingToId,
  replyingToName,
  replyText,
  sendingReply,
  onChangeCommentText,
  onAddComment,
  onStartReply,
  onCancelReply,
  onChangeReplyText,
  onSendReply,
  onDeleteComment,
}) => {
  const rootComments = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = comments.reduce<Record<string, AnnouncementCommentItem[]>>((acc, c) => {
    if (c.parentCommentId) {
      if (!acc[c.parentCommentId]) acc[c.parentCommentId] = [];
      acc[c.parentCommentId].push(c);
    }
    return acc;
  }, {});

  Object.values(repliesByParent).forEach((list) =>
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  );

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-600" />
            <span>Diskusi &amp; Komentar ({commentCount})</span>
          </h2>
          {realtimeLive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Radio className="w-3 h-3 animate-pulse text-emerald-500" />
              <span>LIVE</span>
            </span>
          )}
        </div>
        {!allowComments && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            <Lock className="w-3 h-3" /> Komentar Dinonaktifkan
          </span>
        )}
      </div>

      {allowComments ? (
        <form onSubmit={onAddComment} className="flex items-center gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => onChangeCommentText(e.target.value)}
            placeholder="Tulis tanggapan atau pertanyaan kamu di sini..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
          />
          <EmojiPickerButton
            align="right"
            title="Pilih Emoji untuk Komentar"
            onSelect={(emoji) => onChangeCommentText(`${commentText}${emoji}`)}
          />
          <button
            type="submit"
            disabled={sendingComment || !commentText.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">{sendingComment ? 'Mengirim...' : 'Kirim'}</span>
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

      {rootComments.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">
          Belum ada komentar. Jadilah yang pertama berkomentar!
        </p>
      ) : (
        <div className="space-y-4">
          {rootComments.map((c) => {
            const canDelete = c.userId === currentUserId || canManage;
            const replies = repliesByParent[c.id] || [];
            const isReplyingHere = replyingToId === c.id;

            return (
              <div key={c.id} className="space-y-2.5">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center shrink-0">
                        {c.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{c.fullName}</span>
                          <span className="px-1.5 py-0.2 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-500">
                            {c.userRole}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatRelativeTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap">{c.content}</p>

                        <div className="mt-2.5 flex items-center gap-3">
                          {allowComments && (
                            <button
                              type="button"
                              onClick={() => onStartReply(c.id, c, false)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
                            >
                              <Reply className="w-3.5 h-3.5" />
                              <span>Balas</span>
                            </button>
                          )}
                          {replies.length > 0 && (
                            <span className="text-[11px] text-slate-400 font-medium">
                              {replies.length} balasan
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(c.id)}
                        title="Hapus Komentar"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {replies.length > 0 && (
                  <div className="ml-5 sm:ml-8 pl-4 border-l-2 border-teal-200/80 space-y-2">
                    {replies.map((r) => {
                      const canDeleteReply = r.userId === currentUserId || canManage;
                      return (
                        <div
                          key={r.id}
                          className="p-3.5 rounded-2xl bg-white border border-slate-200/80 flex items-start justify-between gap-3"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-full bg-cyan-100 text-cyan-800 font-bold text-[11px] flex items-center justify-center shrink-0">
                              {r.fullName.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900">{r.fullName}</span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-50 border border-slate-200 text-[10px] font-medium text-slate-500">
                                  {r.userRole}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {formatRelativeTime(r.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{r.content}</p>
                              {allowComments && (
                                <button
                                  type="button"
                                  onClick={() => onStartReply(c.id, r, true)}
                                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900"
                                >
                                  <Reply className="w-3 h-3" />
                                  <span>Balas</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {canDeleteReply && (
                            <button
                              type="button"
                              onClick={() => onDeleteComment(r.id)}
                              title="Hapus Balasan"
                              className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {isReplyingHere && allowComments && (
                  <form
                    onSubmit={onSendReply}
                    className="ml-5 sm:ml-8 pl-4 border-l-2 border-teal-400 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] text-teal-700 font-semibold">
                      <span className="inline-flex items-center gap-1">
                        <CornerDownRight className="w-3.5 h-3.5" />
                        Membalas {replyingToName}
                      </span>
                      <button
                        type="button"
                        onClick={onCancelReply}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        Batal
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={replyText}
                        onChange={(e) => onChangeReplyText(e.target.value)}
                        placeholder="Tulis balasan komentar..."
                        className="flex-1 px-3.5 py-2 rounded-xl border border-teal-300 text-sm focus:outline-none focus:border-teal-500"
                      />
                      <EmojiPickerButton
                        align="right"
                        title="Pilih Emoji untuk Balasan"
                        onSelect={(emoji) => onChangeReplyText(`${replyText}${emoji}`)}
                      />
                      <button
                        type="submit"
                        disabled={sendingReply || !replyText.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold disabled:opacity-50 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{sendingReply ? '...' : 'Balas'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
