import React, { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Ekspresi & Reaksi',
    emojis: ['😀', '😄', '😊', '😍', '🤩', '😂', '🥳', '😎', '🤔', '😅', '🙏', '🙌'],
  },
  {
    label: 'Apresiasi',
    emojis: ['👍', '👏', '❤️', '🔥', '🎉', '✨', '💯', '🤝', '💪', '🚀', '⭐', '💐'],
  },
  {
    label: 'Kerja & Pengumuman',
    emojis: ['📢', '📌', '✅', '⚠️', '📅', '💡', '📎', '📝', '💻', '☕', '🏢', '🎯'],
  },
];

interface EmojiPickerButtonProps {
  onSelect: (emoji: string) => void;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  title?: string;
}

export const EmojiPickerButton: React.FC<EmojiPickerButtonProps> = ({
  onSelect,
  align = 'right',
  size = 'md',
  title = 'Sisipkan Emoji',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-xl border transition-colors inline-flex items-center justify-center ${
          size === 'sm'
            ? 'p-1.5 text-slate-500 hover:bg-slate-200 border-transparent'
            : 'p-2.5 text-slate-600 bg-slate-50 hover:bg-teal-50 hover:text-teal-700 border-slate-300'
        }`}
      >
        <Smile className={size === 'sm' ? 'w-4 h-4' : 'w-4 h-4'} />
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl p-3 z-50 space-y-2.5 ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {group.label}
              </p>
              <div className="grid grid-cols-6 gap-1">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelect(emoji);
                      setOpen(false);
                    }}
                    className="h-9 rounded-lg hover:bg-teal-50 text-lg flex items-center justify-center transition-transform hover:scale-115"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
