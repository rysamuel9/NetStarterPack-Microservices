export const ANNOUNCEMENT_TYPES = [
  { value: '', label: 'Semua Tipe' },
  { value: 'Urgent', label: 'Urgent' },
  { value: 'HRPolicy', label: 'HR Policy' },
  { value: 'Event', label: 'Event' },
  { value: 'Celebration', label: 'Celebration' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'General', label: 'General' },
] as const;

export const announcementTypeStyle = (type: string) => {
  switch (type) {
    case 'Urgent':
      return {
        badge: 'bg-rose-100 text-rose-800 border-rose-200',
        gradient: 'from-rose-700 to-orange-600',
        label: 'Urgent',
      };
    case 'HRPolicy':
      return {
        badge: 'bg-teal-100 text-teal-800 border-teal-200',
        gradient: 'from-teal-700 to-cyan-700',
        label: 'HR Policy',
      };
    case 'Event':
      return {
        badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        gradient: 'from-indigo-700 to-violet-700',
        label: 'Event',
      };
    case 'Celebration':
      return {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        gradient: 'from-emerald-700 to-teal-600',
        label: 'Celebration',
      };
    case 'Maintenance':
      return {
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        gradient: 'from-amber-700 to-orange-700',
        label: 'Maintenance',
      };
    default:
      return {
        badge: 'bg-slate-100 text-slate-700 border-slate-200',
        gradient: 'from-slate-800 to-slate-700',
        label: 'General',
      };
  }
};
