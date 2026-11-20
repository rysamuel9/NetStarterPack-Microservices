import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { avatarUrlFor } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Simpan src yang sudah pernah 404 supaya tidak request ulang tiap render / tiap komentar dari user yang sama.
const failedSources = new Set<string>();

export const getInitials = (name?: string | null): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
};

interface UserAvatarProps {
  userId?: string | null;
  name?: string | null;
  /** Ukuran + teks inisial, contoh: "w-8 h-8 text-xs" */
  sizeClass?: string;
  /** Bentuk, contoh: "rounded-full" atau "rounded-xl" */
  shapeClass?: string;
  /** Warna latar + teks saat jatuh ke inisial */
  colorClass?: string;
  /** Klik foto untuk lihat ukuran besar (hanya aktif kalau user punya foto) */
  zoomable?: boolean;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  name,
  sizeClass = 'w-8 h-8 text-xs',
  shapeClass = 'rounded-full',
  colorClass = 'bg-teal-100 text-teal-800',
  zoomable = true,
}) => {
  const { user } = useAuth();

  // Untuk akun sendiri pakai avatarUrl dari /auth/me (ada ?v= supaya langsung segar setelah ganti foto).
  const src =
    userId && user?.id === userId && user.avatarUrl
      ? user.avatarUrl
      : userId
        ? avatarUrlFor(userId)
        : null;

  const [failed, setFailed] = useState(src ? failedSources.has(src) : true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setFailed(src ? failedSources.has(src) : true);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} ${shapeClass} ${colorClass} font-bold flex items-center justify-center shrink-0 select-none`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={name ?? 'Foto profil'}
        loading="lazy"
        onError={() => {
          failedSources.add(src);
          setFailed(true);
        }}
        onClick={zoomable ? () => setOpen(true) : undefined}
        className={`${sizeClass} ${shapeClass} object-cover shrink-0 ${zoomable ? 'cursor-zoom-in' : ''}`}
      />
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img
                src={src}
                alt={name ?? 'Foto profil'}
                className="max-w-[90vw] max-h-[80vh] rounded-2xl object-contain shadow-2xl"
              />
              {name && <p className="text-sm font-semibold text-white">{name}</p>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
