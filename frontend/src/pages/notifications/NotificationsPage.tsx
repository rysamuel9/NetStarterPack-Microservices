import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Trash2,
  Sliders,
  Smartphone,
  Send,
  RefreshCw,
  Mail,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/formatters';
import type {
  ApiResult,
  NotificationItem,
  NotificationListResponse,
  NotificationPreference,
  UserPushDevice,
} from '../../types';

const CATEGORIES = ['All', 'Workflow', 'Order', 'Tracking', 'Announcement', 'System'];

const CATEGORY_LABELS: Record<string, string> = {
  All: 'Semua',
  Workflow: 'Workflow & Approval',
  Order: 'Pesanan (Order)',
  Tracking: 'Live Tracking',
  Announcement: 'Pengumuman HR',
  System: 'Sistem',
};

function severityMeta(severity: string) {
  switch (severity.toLowerCase()) {
    case 'success':
      return {
        icon: CheckCircle2,
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'danger':
      return {
        icon: XCircle,
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
      };
    default:
      return {
        icon: Info,
        badge: 'bg-sky-50 text-sky-700 border-sky-200',
        dot: 'bg-teal-500',
      };
  }
}

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences' | 'devices'>('inbox');

  // Inbox state
  const [category, setCategory] = useState<string>('All');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [listData, setListData] = useState<NotificationListResponse>({
    items: [],
    totalCount: 0,
    unreadCount: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  const [loadingInbox, setLoadingInbox] = useState<boolean>(false);

  // Preferences state
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);

  // Devices state
  const [devices, setDevices] = useState<UserPushDevice[]>([]);
  const [sendingTestPush, setSendingTestPush] = useState<boolean>(false);

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const res = await api.get<ApiResult<NotificationListResponse>>('/notifications', {
        params: { category, unreadOnly, page, pageSize: 15 },
      });
      if (res.data.succeeded && res.data.data) {
        setListData(res.data.data);
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal memuat inbox notifikasi. Pastikan Notification.Api (:5088) sedang berjalan.' });
    } finally {
      setLoadingInbox(false);
    }
  }, [category, unreadOnly, page]);

  const loadPreferences = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<NotificationPreference[]>>('/notifications/preferences');
      if (res.data.succeeded && res.data.data) {
        setPreferences(res.data.data);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<UserPushDevice[]>>('/notifications/devices');
      if (res.data.succeeded && res.data.data) {
        setDevices(res.data.data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (activeTab === 'preferences') loadPreferences();
    if (activeTab === 'devices') loadDevices();
  }, [activeTab, loadPreferences, loadDevices]);

  useEffect(() => {
    const onRefresh = () => loadInbox();
    window.addEventListener('notification-updated', onRefresh);
    return () => window.removeEventListener('notification-updated', onRefresh);
  }, [loadInbox]);

  const handleOpenItem = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await api.post(`/notifications/${item.id}/read`);
        window.dispatchEvent(new Event('notification-updated'));
      } catch {
        // ignore
      }
    }

    if (item.actionUrl && item.actionUrl !== '/notifications') {
      navigate(item.actionUrl);
    } else {
      loadInbox();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await api.post<ApiResult<number>>('/notifications/read-all', null, {
        params: { category: category === 'All' ? undefined : category },
      });
      if (res.data.succeeded) {
        setBanner({ type: 'success', text: res.data.message || 'Semua notifikasi ditandai dibaca.' });
        window.dispatchEvent(new Event('notification-updated'));
        loadInbox();
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal menandai semua notifikasi sebagai dibaca.' });
    }
  };

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      window.dispatchEvent(new Event('notification-updated'));
      loadInbox();
    } catch {
      setBanner({ type: 'error', text: 'Gagal menghapus notifikasi.' });
    }
  };

  const togglePref = (cat: string, field: 'inAppEnabled' | 'emailEnabled' | 'pushEnabled') => {
    setPreferences((prev) =>
      prev.map((p) => (p.category === cat ? { ...p, [field]: !p[field] } : p))
    );
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    setBanner(null);
    try {
      const res = await api.put<ApiResult<NotificationPreference[]>>('/notifications/preferences', {
        preferences,
      });
      if (res.data.succeeded && res.data.data) {
        setPreferences(res.data.data);
        setBanner({ type: 'success', text: 'Preferensi notifikasi berhasil disimpan.' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal menyimpan preferensi notifikasi.' });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRemoveDevice = async (id: string) => {
    try {
      await api.delete(`/notifications/devices/${id}`);
      loadDevices();
      setBanner({ type: 'success', text: 'Perangkat push berhasil dihapus.' });
    } catch {
      setBanner({ type: 'error', text: 'Gagal menghapus perangkat push.' });
    }
  };

  const handleSendTestPush = async () => {
    setSendingTestPush(true);
    setBanner(null);
    try {
      const res = await api.post<ApiResult<number>>('/notifications/test-push', {
        title: 'Tes Notifikasi Real-Time',
        message: 'Jalur In-App SignalR & Mobile Push Notification berjalan normal.',
      });
      if (res.data.succeeded) {
        setBanner({ type: 'success', text: res.data.message });
        loadInbox();
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal mengirim tes notifikasi.' });
    } finally {
      setSendingTestPush(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-teal-600" />
            <span>Pusat Notifikasi</span>
            {listData.unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                {listData.unreadCount} belum dibaca
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Inbox terpusat lintas microservice (Workflow, Order, Tracking, Announcement) + pengaturan channel In-App, Email, &amp; Mobile Push.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSendTestPush}
            disabled={sendingTestPush}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sendingTestPush ? 'Mengirim...' : 'Tes SignalR & Push'}</span>
          </button>

          {hasPermission('Notifications.Manage') && (
            <button
              type="button"
              onClick={() => navigate('/notification-templates')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Kelola Template &amp; Log Email</span>
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`px-4 py-3 rounded-xl text-sm border flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-xs font-semibold underline ml-3">
            Tutup
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        {[
          { id: 'inbox' as const, label: 'Inbox Notifikasi', icon: Bell },
          { id: 'preferences' as const, label: 'Preferensi Channel', icon: Sliders },
          { id: 'devices' as const, label: 'Perangkat Mobile Push', icon: Smartphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                active
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    category === cat
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none px-2">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => {
                    setUnreadOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Belum dibaca saja</span>
              </label>

              <button
                type="button"
                onClick={loadInbox}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loadingInbox ? 'animate-spin' : ''}`} />
              </button>

              {listData.unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Tandai Semua Dibaca</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {loadingInbox && listData.items.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">Memuat notifikasi...</div>
            ) : listData.items.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">Inbox masih kosong</p>
                <p className="text-xs text-slate-500 mt-1">
                  Coba ajukan Workflow, buat Order, tugaskan Live Tracking, atau klik tombol "Tes SignalR &amp; Push" di kanan atas.
                </p>
              </div>
            ) : (
              listData.items.map((item) => {
                const meta = severityMeta(item.severity);
                const Icon = meta.icon;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleOpenItem(item)}
                    className={`p-4 flex items-start gap-3.5 cursor-pointer hover:bg-slate-50 transition-colors ${
                      !item.isRead ? 'bg-teal-50/35' : ''
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.badge}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {item.category}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">{item.sourceService}</span>
                        <span className="text-[11px] text-slate-400">• {formatRelativeTime(item.createdAt)}</span>
                        {!item.isRead && <span className={`w-2 h-2 rounded-full ${meta.dot}`} />}
                      </div>
                      <h3 className={`text-sm mt-1 ${!item.isRead ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.message}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.actionUrl && (
                        <span className="p-1.5 text-slate-400 hover:text-teal-600" title="Buka halaman terkait">
                          <ExternalLink className="w-4 h-4" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Hapus notifikasi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {listData.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Halaman {listData.page} dari {listData.totalPages} ({listData.totalCount} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={page >= listData.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'preferences' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Atur Channel Notifikasi per Kategori</h2>
            <p className="text-xs text-slate-500 mt-1">
              Kamu bebas mematikan Email atau Push di kategori tertentu tanpa mengganggu notifikasi lain.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-3 pr-4">Kategori</th>
                  <th className="py-3 px-4 text-center">In-App (SignalR)</th>
                  <th className="py-3 px-4 text-center">Email (Office 365 / Gmail)</th>
                  <th className="py-3 px-4 text-center">Mobile Push (Expo)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preferences.map((pref) => (
                  <tr key={pref.category}>
                    <td className="py-3.5 pr-4 font-semibold text-slate-800">
                      {CATEGORY_LABELS[pref.category] ?? pref.category}
                    </td>
                    {(['inAppEnabled', 'emailEnabled', 'pushEnabled'] as const).map((field) => (
                      <td key={field} className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={pref[field]}
                          onChange={() => togglePref(pref.category, field)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {savingPrefs ? 'Menyimpan...' : 'Simpan Preferensi'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Perangkat Mobile Push Terdaftar</h2>
              <p className="text-xs text-slate-500 mt-1">
                Perangkat Android/iOS otomatis terdaftar saat kamu login lewat aplikasi Mobile Expo.
              </p>
            </div>
            <button
              type="button"
              onClick={loadDevices}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500">
              Belum ada perangkat mobile yang terdaftar untuk akun ini. Login di app Mobile (`mobile/`) untuk mendaftarkan Expo Push Token secara otomatis.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {devices.map((d) => (
                <div key={d.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="text-sm font-semibold text-slate-900">{d.deviceName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                        {d.platform}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          d.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {d.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-400 truncate mt-1">{d.pushToken}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Terakhir aktif: {formatRelativeTime(d.lastSeenAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDevice(d.id)}
                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-50"
                    title="Hapus perangkat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
