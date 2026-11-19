import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { EmojiPickerButton } from '../../components/EmojiPickerButton';
import { ANNOUNCEMENT_TYPES } from '../../utils/announcementMeta';
import { formatBytes } from '../../utils/formatters';
import type {
  AnnouncementAttachmentItem,
  AnnouncementDetailItem,
  ApiResult,
} from '../../types';

interface AnnouncementComposerModalProps {
  initialItem: AnnouncementDetailItem | null;
  onClose: () => void;
  onSaved: (wasEdit: boolean) => void;
  onError: (message: string) => void;
}

export const AnnouncementComposerModal: React.FC<AnnouncementComposerModalProps> = ({
  initialItem,
  onClose,
  onSaved,
  onError,
}) => {
  const editingId = initialItem?.id ?? null;

  const [title, setTitle] = useState(initialItem?.title ?? '');
  const [summary, setSummary] = useState(initialItem?.summary ?? '');
  const [type, setType] = useState(initialItem?.type ?? 'HRPolicy');
  const [bannerUrl, setBannerUrl] = useState(initialItem?.bannerUrl ?? '');
  const [allowComments, setAllowComments] = useState(initialItem?.allowComments ?? true);
  const [isPinned, setIsPinned] = useState(initialItem?.isPinned ?? false);
  const [attachments, setAttachments] = useState<AnnouncementAttachmentItem[]>(
    initialItem?.attachments ?? []
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialItem?.contentHtml ?? '<p></p>';
    }
  }, [initialItem]);

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
      onError(getErrorMessage(err, 'Gagal mengunggah file lampiran.'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const contentHtml = editorRef.current?.innerHTML || '';
    if (!title.trim()) {
      onError('Judul pengumuman wajib diisi.');
      return;
    }

    setSaving(true);
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
        onSaved(Boolean(editingId));
      } else {
        onError(res.data.message || 'Gagal menyimpan pengumuman.');
      }
    } catch (err) {
      onError(getErrorMessage(err, 'Gagal menyimpan pengumuman ke Announcement.Api.'));
    } finally {
      setSaving(false);
    }
  };

  return (
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
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-500"
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

          {/* Publish Options */}
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
              onClick={onClose}
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
  );
};
