import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Truck,
  X,
  XCircle,
  ZoomIn,
  ExternalLink,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  getTrackingHubConnection,
  joinTrackingCommandCenter,
  leaveTrackingCommandCenter,
  type AssignmentStatusChangedEvent,
} from '../../services/trackingHub';
import { validateFileForUpload } from '../../utils/fileUpload';
import { LiveTrackingMap } from './LiveTrackingMap';
import type {
  ApiResult,
  LivePositionEvent,
  TrackingDetailItem,
  TrackingStats,
  TrackingSummaryItem,
  UserItem,
} from '../../types';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  Assigned: { label: 'Ditugaskan', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  InTransit: { label: 'Dalam Perjalanan', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  IssueReported: { label: 'Ada Kendala', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  Arrived: { label: 'Tiba di Lokasi', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  PendingVerification: { label: 'Perlu Verifikasi', cls: 'bg-orange-50 text-orange-800 border-orange-300' },
  Completed: { label: 'Selesai', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Rejected: { label: 'Ditolak', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  Cancelled: { label: 'Dibatalkan', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const TASK_TYPE_LABEL: Record<string, string> = {
  Delivery: 'Pengiriman',
  FieldVisit: 'Kunjungan Klien',
  Maintenance: 'Maintenance / Teknisi',
};

function formatDistance(meters?: number | null): string {
  if (meters == null) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export const LiveTrackingPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canDispatch = hasPermission('Tracking.Dispatch');
  const canOperate = hasPermission('Tracking.Operate');
  const isFieldStaff = canOperate && !canDispatch;
  const isAuditorOnly = !canOperate && !canDispatch;

  const [assignments, setAssignments] = useState<TrackingSummaryItem[]>([]);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<TrackingDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const simTimerRef = useRef<number | null>(null);

  // Create Dispatch Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState('Delivery');
  const [newRefCode, setNewRefCode] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newAssigneeUsername, setNewAssigneeUsername] = useState('staff');
  const [newDestLabel, setNewDestLabel] = useState('');
  const [newDestAddress, setNewDestAddress] = useState('');
  const [newDestLat, setNewDestLat] = useState(-6.224495);
  const [newDestLng, setNewDestLng] = useState(106.807755);
  const [newRadius, setNewRadius] = useState(150);

  // Complete POD Modal state
  const [podOpen, setPodOpen] = useState(false);
  const [podRecipient, setPodRecipient] = useState('');
  const [podNotes, setPodNotes] = useState('');
  const [podPhotoUrl, setPodPhotoUrl] = useState<string | null>(null);
  const [uploadingPod, setUploadingPod] = useState(false);

  // Verify Modal & Photo Lightbox state
  const [verifyNotes, setVerifyNotes] = useState('');
  const [issueNote, setIssueNote] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<{ url: string; caption: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get<ApiResult<TrackingSummaryItem[]>>('/tracking'),
        api.get<ApiResult<TrackingStats>>('/tracking/stats'),
      ]);
      if (listRes.data.succeeded && listRes.data.data) {
        setAssignments(listRes.data.data);
        setSelectedId((prev) => prev ?? listRes.data.data?.[0]?.id ?? null);
      }
      if (statsRes.data.succeeded && statsRes.data.data) {
        setStats(statsRes.data.data);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: getErrorMessage(err, 'Gagal memuat data Live Tracking.') });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await api.get<ApiResult<TrackingDetailItem>>(`/tracking/${id}`);
      if (res.data.succeeded && res.data.data) {
        setSelectedDetail(res.data.data);
      }
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setSelectedDetail(null);
    }
  }, [selectedId, loadDetail]);

  // SignalR Command Center live telemetry subscription
  useEffect(() => {
    let mounted = true;
    const conn = getTrackingHubConnection();

    const onLocationUpdated = (pos: LivePositionEvent) => {
      setAssignments((prev) =>
        prev.map((item) =>
          item.id === pos.assignmentId
            ? {
                ...item,
                lastLatitude: pos.latitude,
                lastLongitude: pos.longitude,
                lastAccuracyMeters: pos.accuracyMeters,
                lastSpeedKmh: pos.speedKmh,
                lastDistanceToDestinationMeters: pos.distanceToDestinationMeters,
                lastPingAt: pos.recordedAtUtc,
                isInsideGeofence: pos.isInsideGeofence,
                isSuspicious: pos.isSuspicious,
                suspiciousReason: pos.suspiciousReason,
              }
            : item
        )
      );

      setSelectedDetail((prev) => {
        if (!prev || prev.summary.id !== pos.assignmentId) return prev;
        return {
          ...prev,
          summary: {
            ...prev.summary,
            lastLatitude: pos.latitude,
            lastLongitude: pos.longitude,
            lastAccuracyMeters: pos.accuracyMeters,
            lastSpeedKmh: pos.speedKmh,
            lastDistanceToDestinationMeters: pos.distanceToDestinationMeters,
            lastPingAt: pos.recordedAtUtc,
            isInsideGeofence: pos.isInsideGeofence,
            isSuspicious: pos.isSuspicious,
            suspiciousReason: pos.suspiciousReason,
          },
          breadcrumbs: [
            ...prev.breadcrumbs,
            {
              id: `live-${pos.recordedAtUtc}`,
              latitude: pos.latitude,
              longitude: pos.longitude,
              accuracyMeters: pos.accuracyMeters,
              speedKmh: pos.speedKmh,
              distanceToDestinationMeters: pos.distanceToDestinationMeters,
              isMocked: false,
              isSuspicious: pos.isSuspicious,
              eventTag: 'LIVE',
              recordedAt: pos.recordedAtUtc,
            },
          ],
        };
      });
    };

    const onStatusChanged = (evt: AssignmentStatusChangedEvent) => {
      setAssignments((prev) =>
        prev.map((item) => (item.id === evt.summary.id ? evt.summary : item))
      );
      if (evt.summary.id === selectedId) {
        loadDetail(evt.summary.id);
      }
      api.get<ApiResult<TrackingStats>>('/tracking/stats').then((r) => {
        if (r.data.succeeded && r.data.data) setStats(r.data.data);
      }).catch(() => {});
    };

    const onAssignmentCreated = (summary: TrackingSummaryItem) => {
      setAssignments((prev) => (prev.some((a) => a.id === summary.id) ? prev : [summary, ...prev]));
    };

    conn.on('LocationUpdated', onLocationUpdated);
    conn.on('AssignmentStatusChanged', onStatusChanged);
    conn.on('AssignmentCreated', onAssignmentCreated);

    joinTrackingCommandCenter().then((ok) => {
      if (mounted) setRealtimeConnected(ok);
    });

    return () => {
      mounted = false;
      conn.off('LocationUpdated', onLocationUpdated);
      conn.off('AssignmentStatusChanged', onStatusChanged);
      conn.off('AssignmentCreated', onAssignmentCreated);
      leaveTrackingCommandCenter();
    };
  }, [selectedId, loadDetail]);

  useEffect(() => {
    return () => {
      if (simTimerRef.current) window.clearInterval(simTimerRef.current);
    };
  }, []);

  const openCreateModal = async () => {
    setCreateOpen(true);
    if (usersList.length === 0) {
      try {
        const res = await api.get<ApiResult<UserItem[]>>('/users');
        if (res.data.succeeded && res.data.data) {
          setUsersList(res.data.data);
        }
      } catch {
        // Fallback manual assignee jika user tidak punya Users.View
      }
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setFeedback(null);
    try {
      const matchedUser = usersList.find((u) => u.username === newAssigneeUsername);
      const res = await api.post<ApiResult<TrackingDetailItem>>('/tracking', {
        title: newTitle,
        taskType: newTaskType,
        referenceCode: newRefCode || null,
        notes: newNotes || null,
        assigneeUserId: matchedUser?.id ?? '00000000-0000-0000-0000-000000000000',
        assigneeUsername: newAssigneeUsername,
        assigneeFullName: matchedUser?.fullName ?? newAssigneeUsername,
        originLabel: 'HQ Jakarta (Monas)',
        originLatitude: -6.175392,
        originLongitude: 106.827153,
        destinationLabel: newDestLabel,
        destinationAddress: newDestAddress || newDestLabel,
        destinationLatitude: newDestLat,
        destinationLongitude: newDestLng,
        geofenceRadiusMeters: newRadius,
      });

      if (res.data.succeeded && res.data.data) {
        setFeedback({ type: 'success', text: res.data.message || 'Tugas tracking berhasil dibuat.' });
        setCreateOpen(false);
        setNewTitle('');
        setNewRefCode('');
        setNewNotes('');
        setNewDestLabel('');
        setNewDestAddress('');
        await loadData();
        setSelectedId(res.data.data.summary.id);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: getErrorMessage(err, 'Gagal membuat tugas tracking.') });
    } finally {
      setBusyAction(false);
    }
  };

  const runAction = async (fn: () => Promise<void>, successFallback: string) => {
    setBusyAction(true);
    setFeedback(null);
    try {
      await fn();
      setFeedback({ type: 'success', text: successFallback });
      await loadData();
      if (selectedId) await loadDetail(selectedId);
    } catch (err) {
      setFeedback({ type: 'error', text: getErrorMessage(err, 'Aksi gagal diproses.') });
    } finally {
      setBusyAction(false);
    }
  };

  const stopSimulation = () => {
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setSimulatingId(null);
  };

  const startRouteSimulation = (item: TrackingSummaryItem, mode: 'normal' | 'outside' = 'normal') => {
    stopSimulation();
    setSimulatingId(item.id);
    const startLat = item.lastLatitude ?? item.originLatitude;
    const startLng = item.lastLongitude ?? item.originLongitude;
    // Mode 'outside' mendarat ~350m di luar titik tujuan untuk uji alur PendingVerification
    const targetLat = mode === 'outside' ? item.destinationLatitude + 0.0032 : item.destinationLatitude;
    const targetLng = mode === 'outside' ? item.destinationLongitude + 0.0005 : item.destinationLongitude;
    const totalSteps = 8;
    let step = 1;

    simTimerRef.current = window.setInterval(async () => {
      const progress = Math.min(1, step / totalSteps);
      const lat = startLat + (targetLat - startLat) * progress;
      const lng = startLng + (targetLng - startLng) * progress;
      try {
        await api.post(`/tracking/${item.id}/ping`, {
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          accuracyMeters: 10,
          speedMps: 9.5,
          isMocked: false,
        });
      } catch {
        stopSimulation();
        return;
      }

      if (step >= totalSteps) {
        stopSimulation();
        setFeedback({
          type: 'success',
          text:
            mode === 'outside'
              ? 'Simulasi berhenti ~350m di luar radius geofence. Submit POD sekarang akan masuk antrean verifikasi Manager.'
              : 'Simulasi rute sampai di titik tujuan (dalam radius geofence)!',
        });
        if (selectedId === item.id) loadDetail(item.id);
      }
      step += 1;
    }, 1200);
  };

  const triggerMockGpsSimulation = async (item: TrackingSummaryItem) => {
    await runAction(
      () =>
        api
          .post(`/tracking/${item.id}/ping`, {
            latitude: item.destinationLatitude,
            longitude: item.destinationLongitude,
            accuracyMeters: 5,
            speedMps: 0,
            isMocked: true,
          })
          .then(() => undefined),
      'Simulasi Fake GPS dikirim! Server langsung menandai anomali GPS & mewajibkan verifikasi Manager.'
    );
  };

  const handlePodUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = await validateFileForUpload(file, 'image');
    if (validationError) {
      setFeedback({ type: 'error', text: validationError });
      return;
    }
    setUploadingPod(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<ApiResult<{ url: string }>>('/tracking/upload-pod', formData);
      if (res.data.succeeded && res.data.data) {
        setPodPhotoUrl(res.data.data.url);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: getErrorMessage(err, 'Gagal mengunggah foto POD.') });
    } finally {
      setUploadingPod(false);
    }
  };

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (statusFilter === 'ACTIVE' && !['Assigned', 'InTransit', 'Arrived', 'IssueReported'].includes(a.status)) {
        return false;
      }
      if (statusFilter === 'VERIFY' && a.status !== 'PendingVerification') return false;
      if (statusFilter === 'DONE' && !['Completed', 'Rejected', 'Cancelled'].includes(a.status)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          a.assignmentCode.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.assigneeFullName.toLowerCase().includes(q) ||
          a.destinationLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assignments, statusFilter, search]);

  const activeSummary = selectedDetail?.summary ?? assignments.find((a) => a.id === selectedId) ?? null;
  const isAssigneeOrSuperAdmin =
    !!activeSummary &&
    (activeSummary.assigneeUsername.toLowerCase() === user?.username?.toLowerCase() ||
      user?.roles.some((r) => r.toLowerCase() === 'superadmin'));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">
              {isFieldStaff
                ? 'Tugas Lapangan Saya'
                : isAuditorOnly
                  ? 'Monitoring Live Tracking'
                  : 'Field Dispatch & Live Tracking'}
            </h1>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                isFieldStaff
                  ? 'bg-teal-50 text-teal-700 border-teal-200'
                  : isAuditorOnly
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {isFieldStaff
                ? 'MODE PETUGAS LAPANGAN'
                : isAuditorOnly
                  ? 'MODE AUDITOR (READ-ONLY)'
                  : 'MODE DISPATCHER / MANAGER'}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                realtimeConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${realtimeConnected ? 'animate-pulse text-emerald-600' : ''}`} />
              {realtimeConnected ? 'LIVE SIGNALR' : 'POLLING'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isFieldStaff
              ? 'Daftar tugas yang ditugaskan khusus ke kamu. Jalankan perjalanan, kirim GPS / simulasi rute, dan unggah bukti serah terima (POD).'
              : isAuditorOnly
                ? 'Pemantauan read-only seluruh rute petugas lapangan, status geofence, dan bukti serah terima (POD).'
                : 'Command Center realtime untuk dispatch tugas, pantau posisi petugas, verifikasi geofence & POD, dan deteksi anomali GPS.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadData()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          {canDispatch && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Buat Tugas Lapangan
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="p-1 rounded-lg hover:bg-black/5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Cards (adaptif: Staff lihat angka pribadinya, Dispatcher/Auditor lihat angka global) */}
      {isFieldStaff ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500">Tugas Saya</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{assignments.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-sky-200 p-4">
            <p className="text-xs font-semibold text-sky-600">Aktif / Sedang Jalan</p>
            <p className="text-2xl font-bold text-sky-700 mt-1">
              {assignments.filter((a) => ['Assigned', 'InTransit', 'Arrived', 'IssueReported'].includes(a.status)).length}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-orange-200 p-4">
            <p className="text-xs font-semibold text-orange-600">Menunggu Verifikasi</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">
              {assignments.filter((a) => a.status === 'PendingVerification').length}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-200 p-4">
            <p className="text-xs font-semibold text-emerald-600">Selesai</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">
              {assignments.filter((a) => a.status === 'Completed').length}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500">Total Tugas</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats?.totalAssignments ?? assignments.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-sky-200 p-4">
            <p className="text-xs font-semibold text-sky-600">Aktif di Lapangan</p>
            <p className="text-2xl font-bold text-sky-700 mt-1">{stats?.activeInTransit ?? 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-orange-200 p-4">
            <p className="text-xs font-semibold text-orange-600">Perlu Verifikasi</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">{stats?.pendingVerification ?? 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-200 p-4">
            <p className="text-xs font-semibold text-emerald-600">Selesai</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{stats?.completedAssignments ?? 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-rose-200 p-4">
            <p className="text-xs font-semibold text-rose-600">Flag Anomali GPS</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{stats?.suspiciousFlags ?? 0}</p>
          </div>
        </div>
      )}

      {/* Main Split Command Center */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Live Map + Selected Detail */}
        <div className="xl:col-span-8 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Navigation className="w-4 h-4 text-teal-600" />
                <span>
                  {activeSummary
                    ? `Peta Rute: ${activeSummary.assignmentCode} — ${activeSummary.destinationLabel}`
                    : 'Peta Command Center (Semua Tugas)'}
                </span>
              </div>
              {activeSummary && (
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  Lihat Semua Pin di Peta
                </button>
              )}
            </div>

            <LiveTrackingMap
              assignments={assignments}
              selectedId={selectedId}
              breadcrumbs={selectedDetail?.breadcrumbs ?? []}
              onSelectAssignment={(id) => setSelectedId(id)}
              heightClass="h-[420px]"
            />
          </div>

          {/* Detail & Action Controls */}
          {activeSummary && (
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-slate-900 text-white">
                      {activeSummary.assignmentCode}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        STATUS_BADGE[activeSummary.status]?.cls ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {STATUS_BADGE[activeSummary.status]?.label ?? activeSummary.status}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700">
                      {TASK_TYPE_LABEL[activeSummary.taskType] ?? activeSummary.taskType}
                    </span>
                    {activeSummary.referenceCode && (
                      <span className="text-xs font-mono text-slate-500">Ref: {activeSummary.referenceCode}</span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-2">{activeSummary.title}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Petugas: <b className="text-slate-700">{activeSummary.assigneeFullName}</b> (@{activeSummary.assigneeUsername}) • Dispatcher: {activeSummary.dispatcherFullName}
                  </p>
                </div>

                <div className="text-right text-xs space-y-1">
                  <div className="font-bold text-slate-800">
                    Jarak ke Tujuan: <span className="text-teal-700">{formatDistance(activeSummary.lastDistanceToDestinationMeters)}</span>
                  </div>
                  <div className="text-slate-500">
                    Geofence: {activeSummary.geofenceRadiusMeters} m ({activeSummary.isInsideGeofence ? 'Di Dalam Radius' : 'Di Luar Radius'})
                  </div>
                  <div className="text-slate-500">
                    Tempuh: {formatDistance(activeSummary.totalDistanceMeters)} • {(activeSummary.lastSpeedKmh ?? 0).toFixed(1)} km/j
                  </div>
                </div>
              </div>

              {activeSummary.isSuspicious && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
                  <div>
                    <p className="font-bold">Peringatan Anti-Fraud GPS</p>
                    <p className="mt-0.5">{activeSummary.suspiciousReason}</p>
                  </div>
                </div>
              )}

              {activeSummary.issueNote && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-bold">Catatan Kendala Lapangan</p>
                    <p className="mt-0.5">{activeSummary.issueNote}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {canOperate && isAssigneeOrSuperAdmin && activeSummary.status === 'Assigned' && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() =>
                      runAction(
                        () => api.post(`/tracking/${activeSummary.id}/start`, {}).then(() => undefined),
                        'Perjalanan dimulai! Live GPS aktif.'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
                  >
                    <Play className="w-4 h-4" />
                    Mulai Perjalanan
                  </button>
                )}

                {canOperate && isAssigneeOrSuperAdmin && ['InTransit', 'Arrived'].includes(activeSummary.status) && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        simulatingId === activeSummary.id
                          ? stopSimulation()
                          : startRouteSimulation(activeSummary, 'normal')
                      }
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border ${
                        simulatingId === activeSummary.id
                          ? 'bg-rose-50 text-rose-700 border-rose-300'
                          : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                      {simulatingId === activeSummary.id ? 'Hentikan Simulasi' : 'Simulasi Normal (Masuk Geofence)'}
                    </button>

                    {simulatingId !== activeSummary.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => startRouteSimulation(activeSummary, 'outside')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100"
                          title="Simulasikan berhenti ~350m di luar geofence untuk tes verifikasi Manager"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          Simulasi Luar Geofence
                        </button>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => triggerMockGpsSimulation(activeSummary)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          title="Kirim ping isMocked=true untuk tes deteksi Anti Fake-GPS"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Test Fake GPS
                        </button>
                      </>
                    )}

                    {activeSummary.status === 'InTransit' && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() =>
                          runAction(
                            () => api.post(`/tracking/${activeSummary.id}/arrive`, {}).then(() => undefined),
                            'Check-In tiba tercatat.'
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                      >
                        <MapPin className="w-4 h-4" />
                        Check-In Tiba
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setPodRecipient('');
                        setPodNotes('');
                        setPodPhotoUrl(null);
                        setPodOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                    >
                      <Camera className="w-4 h-4" />
                      Upload POD &amp; Selesai
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIssueNote('');
                        setIssueOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Lapor Kendala
                    </button>
                  </>
                )}

                {canOperate && isAssigneeOrSuperAdmin && activeSummary.status === 'IssueReported' && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() =>
                      runAction(
                        () => api.post(`/tracking/${activeSummary.id}/resume`).then(() => undefined),
                        'Perjalanan dilanjutkan.'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
                  >
                    <Play className="w-4 h-4" />
                    Lanjutkan Perjalanan
                  </button>
                )}

                {canDispatch && !['Completed', 'Cancelled'].includes(activeSummary.status) && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() =>
                      runAction(
                        () => api.post(`/tracking/${activeSummary.id}/cancel`, { reason: 'Dibatalkan oleh Dispatcher.' }).then(() => undefined),
                        'Tugas dibatalkan.'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold"
                  >
                    <XCircle className="w-4 h-4" />
                    Batalkan Tugas
                  </button>
                )}
              </div>

              {/* Verification Panel for Dispatcher/Manager */}
              {canDispatch && activeSummary.status === 'PendingVerification' && (
                <div className="p-4 rounded-2xl bg-orange-50/80 border border-orange-200 space-y-3">
                  <p className="text-xs font-bold text-orange-900">
                    Panel Verifikasi Manager (POD di luar radius geofence / flag GPS)
                  </p>
                  <input
                    type="text"
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    placeholder="Catatan verifikasi (wajib jika menolak)..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-orange-200 text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        runAction(
                          () =>
                            api
                              .post(`/tracking/${activeSummary.id}/verify`, {
                                approved: true,
                                verificationNotes: verifyNotes || 'Disetujui setelah tinjauan peta & POD.',
                              })
                              .then(() => setVerifyNotes('')),
                          'Verifikasi disetujui. Tugas selesai!'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Setujui (Completed)
                    </button>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        runAction(
                          () =>
                            api
                              .post(`/tracking/${activeSummary.id}/verify`, {
                                approved: false,
                                verificationNotes: verifyNotes,
                              })
                              .then(() => setVerifyNotes('')),
                          'Verifikasi ditolak.'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                    >
                      <XCircle className="w-4 h-4" />
                      Tolak (Rejected)
                    </button>
                  </div>
                </div>
              )}

              {/* Info Banner untuk Staff saat menunggu verifikasi Manager */}
              {!canDispatch && activeSummary.status === 'PendingVerification' && (
                <div className="p-3.5 rounded-2xl bg-orange-50 border border-orange-200 text-orange-900 text-xs">
                  <p className="font-bold">Menunggu Verifikasi Manager / Dispatcher</p>
                  <p className="mt-0.5 text-orange-800">
                    Bukti POD kamu sudah diterima sistem dan sedang menunggu persetujuan Manager karena lokasi submit berada di luar radius geofence atau terdapat flag GPS.
                  </p>
                </div>
              )}

              {/* POD & Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Bukti Penyelesaian (POD)</h3>
                  {selectedDetail?.podRecipientName || selectedDetail?.podNotes || activeSummary.podPhotoUrl || selectedDetail?.verificationNotes ? (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Nama Penerima / PIC</p>
                          <p className="font-bold text-slate-900 mt-0.5">{selectedDetail?.podRecipientName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Waktu Selesai / Submit</p>
                          <p className="font-semibold text-slate-700 mt-0.5">
                            {activeSummary.completedAt
                              ? new Date(activeSummary.completedAt).toLocaleString('id-ID')
                              : activeSummary.arrivedAt
                                ? new Date(activeSummary.arrivedAt).toLocaleString('id-ID')
                                : '-'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">Catatan Serah Terima</p>
                        <p className="text-slate-700 mt-0.5">{selectedDetail?.podNotes || 'Tidak ada catatan tambahan.'}</p>
                      </div>

                      {(selectedDetail?.verifiedByUsername || selectedDetail?.verificationNotes) && (
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-0.5">
                          <p className="text-[10px] font-bold uppercase text-teal-700">
                            Verifikasi oleh @{selectedDetail?.verifiedByUsername || '-'}
                            {selectedDetail?.verifiedAt ? ` • ${new Date(selectedDetail.verifiedAt).toLocaleString('id-ID')}` : ''}
                          </p>
                          <p className="text-slate-700">{selectedDetail?.verificationNotes}</p>
                        </div>
                      )}

                      {activeSummary.podPhotoUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setPhotoLightbox({
                              url: activeSummary.podPhotoUrl!,
                              caption: `${activeSummary.assignmentCode} — Penerima: ${selectedDetail?.podRecipientName || '-'}`,
                            })
                          }
                          className="group relative block w-full overflow-hidden rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >
                          <img
                            src={activeSummary.podPhotoUrl}
                            alt="Bukti POD"
                            className="w-full h-44 object-cover group-hover:scale-[1.02] transition-transform"
                          />
                          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/75 text-white text-[11px] font-semibold backdrop-blur-xs">
                            <ZoomIn className="w-3.5 h-3.5" />
                            Klik untuk perbesar
                          </span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Belum ada bukti POD yang disubmit.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Timeline Status</h3>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(selectedDetail?.statusLogs ?? []).map((log) => (
                      <div key={log.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">{log.fromStatus} &rarr; {log.toStatus}</span>
                          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(log.timestamp).toLocaleTimeString('id-ID')}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1">{log.notes}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Oleh: {log.actorFullName}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Assignment List */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-slate-200 p-4 flex flex-col gap-3 max-h-[840px]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode, petugas, atau tujuan..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'ALL', label: 'Semua' },
              { key: 'ACTIVE', label: 'Aktif' },
              { key: 'VERIFY', label: 'Verifikasi' },
              { key: 'DONE', label: 'Selesai' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {filteredAssignments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Tidak ada tugas yang cocok dengan filter.</p>
            ) : (
              filteredAssignments.map((item) => {
                const isSelected = item.id === selectedId;
                const badge = STATUS_BADGE[item.status];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all space-y-1.5 ${
                      isSelected
                        ? 'bg-teal-50/70 border-teal-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-700">{item.assignmentCode}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge?.cls ?? ''}`}>
                        {badge?.label ?? item.status}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 line-clamp-1">{item.title}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      <MapPin className="w-3 h-3 inline mr-1 text-teal-600" />
                      {item.destinationLabel}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>@{item.assigneeUsername}</span>
                      <span className="font-semibold text-teal-700">
                        {formatDistance(item.lastDistanceToDestinationMeters)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Create Dispatch Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAssignment}
            className="bg-white rounded-3xl border border-slate-200 w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Buat Tugas Lapangan / Dispatch Baru</h2>
              <button type="button" onClick={() => setCreateOpen(false)} className="p-1.5 rounded-xl hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Judul Tugas *</label>
                <input
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Misal: Pengiriman Perangkat Kantor ke Cabang Sudirman"
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Jenis Tugas</label>
                <select
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="Delivery">Pengiriman (Delivery)</option>
                  <option value="FieldVisit">Kunjungan Klien (Field Visit)</option>
                  <option value="Maintenance">Maintenance / Teknisi</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Petugas Lapangan (Assignee) *</label>
                {usersList.length > 0 ? (
                  <select
                    value={newAssigneeUsername}
                    onChange={(e) => setNewAssigneeUsername(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {usersList.map((u) => (
                      <option key={u.id} value={u.username}>
                        {u.fullName} (@{u.username})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={newAssigneeUsername}
                    onChange={(e) => setNewAssigneeUsername(e.target.value)}
                    placeholder="staff"
                    className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Kode Referensi (Opsional)</label>
                <input
                  value={newRefCode}
                  onChange={(e) => setNewRefCode(e.target.value)}
                  placeholder="ORD-2026-005"
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Radius Geofence: {newRadius} meter</label>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  step={25}
                  value={newRadius}
                  onChange={(e) => setNewRadius(Number(e.target.value))}
                  className="w-full mt-2 accent-teal-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Nama Lokasi Tujuan *</label>
                <input
                  required
                  value={newDestLabel}
                  onChange={(e) => setNewDestLabel(e.target.value)}
                  placeholder="Menara BCA Thamrin"
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Alamat Lengkap</label>
                <input
                  value={newDestAddress}
                  onChange={(e) => setNewDestAddress(e.target.value)}
                  placeholder="Jl. M.H. Thamrin No. 1, Jakarta Pusat"
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Klik Titik Tujuan pada Peta (Geofence Preview)
              </label>
              <LiveTrackingMap
                assignments={[]}
                pickerMode
                pickerLat={newDestLat}
                pickerLng={newDestLng}
                pickerRadiusMeters={newRadius}
                onPickCoordinate={(lat, lng) => {
                  setNewDestLat(lat);
                  setNewDestLng(lng);
                }}
                heightClass="h-60"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
              >
                {busyAction ? 'Menyimpan...' : 'Terbitkan Tugas'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Complete POD Modal */}
      {podOpen && activeSummary && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Bukti Penyelesaian (POD)</h3>
              <button type="button" onClick={() => setPodOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Nama Penerima / PIC *</label>
                <input
                  value={podRecipient}
                  onChange={(e) => setPodRecipient(e.target.value)}
                  placeholder="Contoh: Ibu Rina (Admin Gedung)"
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Catatan Serah Terima</label>
                <textarea
                  rows={2}
                  value={podNotes}
                  onChange={(e) => setPodNotes(e.target.value)}
                  placeholder="Unit diterima dalam kondisi baik..."
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Foto Bukti POD (Magic-Bytes Verified)</label>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePodUpload} className="text-xs" />
                {uploadingPod && <p className="text-xs text-teal-600 mt-1">Mengunggah foto...</p>}
                {podPhotoUrl && (
                  <img src={podPhotoUrl} alt="Preview POD" className="mt-2 w-full h-32 object-cover rounded-xl border border-slate-200" />
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPodOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold">
                Batal
              </button>
              <button
                type="button"
                disabled={busyAction || !podRecipient.trim()}
                onClick={() =>
                  runAction(
                    () =>
                      api
                        .post(`/tracking/${activeSummary.id}/complete`, {
                          recipientName: podRecipient,
                          notes: podNotes || null,
                          podPhotoUrl,
                        })
                        .then(() => setPodOpen(false)),
                    'Bukti POD berhasil dikirim!'
                  )
                }
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                Kirim &amp; Selesaikan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Modal */}
      {issueOpen && activeSummary && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Laporkan Kendala Lapangan</h3>
            <textarea
              rows={3}
              value={issueNote}
              onChange={(e) => setIssueNote(e.target.value)}
              placeholder="Contoh: Akses jalan ditutup pengalihan arus, estimasi mundur 20 menit."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIssueOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold">
                Batal
              </button>
              <button
                type="button"
                disabled={busyAction || !issueNote.trim()}
                onClick={() =>
                  runAction(
                    () =>
                      api
                        .post(`/tracking/${activeSummary.id}/issue`, { issueNote })
                        .then(() => setIssueOpen(false)),
                    'Kendala berhasil dikirim ke Command Center.'
                  )
                }
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                Kirim Laporan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fullscreen POD Photo Lightbox Modal */}
      {photoLightbox && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-4"
          onClick={() => setPhotoLightbox(null)}
        >
          <div
            className="w-full max-w-4xl flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white">
              <p className="text-sm font-semibold truncate">{photoLightbox.caption}</p>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={photoLightbox.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka Tab Baru
                </a>
                <button
                  type="button"
                  onClick={() => setPhotoLightbox(null)}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <img
              src={photoLightbox.url}
              alt="Foto Bukti POD Fullscreen"
              className="max-h-[80vh] w-auto max-w-full object-contain rounded-2xl border border-white/15 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
