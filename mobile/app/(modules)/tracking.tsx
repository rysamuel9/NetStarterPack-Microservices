import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Navigation,
  Play,
  Radio,
  ShieldAlert,
  Square,
  Truck,
  UserCheck,
  X,
  XCircle,
  ZoomIn,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { resolveMediaUrl } from '@/core/config/serverConfig';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, TrackingDetailItem, TrackingSummaryItem } from '@/core/types';
import { MobileLiveMap } from '@/features/tracking/MobileLiveMap';
import { validatePickedMedia } from '@/shared/utils/fileUpload';
import { formatDateTime } from '@/shared/utils/formatters';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  Assigned: { label: 'Ditugaskan', color: '#475569', bg: '#F1F5F9' },
  InTransit: { label: 'Dalam Perjalanan', color: '#0369A1', bg: '#E0F2FE' },
  IssueReported: { label: 'Ada Kendala', color: '#B45309', bg: '#FEF3C7' },
  Arrived: { label: 'Tiba di Lokasi', color: '#4338CA', bg: '#E0E7FF' },
  PendingVerification: { label: 'Perlu Verifikasi', color: '#C2410C', bg: '#FFEDD5' },
  Completed: { label: 'Selesai', color: '#047857', bg: '#D1FAE5' },
  Rejected: { label: 'Ditolak', color: '#BE123C', bg: '#FFE4E6' },
  Cancelled: { label: 'Dibatalkan', color: '#64748B', bg: '#F1F5F9' },
};

function fmtDistance(m?: number | null): string {
  if (m == null) return '-';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export default function LiveTrackingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canDispatch = hasPermission('Tracking.Dispatch');
  const canOperate = hasPermission('Tracking.Operate');
  const isFieldStaff = canOperate && !canDispatch;
  const isAuditorOnly = !canOperate && !canDispatch;

  const [items, setItems] = useState<TrackingSummaryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'VERIFY' | 'DONE'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TrackingDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Live GPS & Simulator state
  const [gpsActive, setGpsActive] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // POD Modal & Fullscreen Photo Lightbox state
  const [podVisible, setPodVisible] = useState(false);
  const [podRecipient, setPodRecipient] = useState('');
  const [podNotes, setPodNotes] = useState('');
  const [podPhotoUrl, setPodPhotoUrl] = useState<string | null>(null);
  const [uploadingPod, setUploadingPod] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<{ url: string; caption: string } | null>(null);

  // Issue Modal state
  const [issueVisible, setIssueVisible] = useState(false);
  const [issueNote, setIssueNote] = useState('');

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter === 'ACTIVE') {
        return ['Assigned', 'InTransit', 'Arrived', 'IssueReported'].includes(item.status);
      }
      if (statusFilter === 'VERIFY') return item.status === 'PendingVerification';
      if (statusFilter === 'DONE') {
        return ['Completed', 'Rejected', 'Cancelled'].includes(item.status);
      }
      return true;
    });
  }, [items, statusFilter]);

  const loadList = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiClient.get<ApiResult<TrackingSummaryItem[]>>('/tracking');
      if (res.data.succeeded && res.data.data) {
        setItems(res.data.data);
      }
    } catch (err) {
      Alert.alert('Gagal Memuat', getErrorMessage(err, 'Tidak dapat memuat daftar tugas tracking.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await apiClient.get<ApiResult<TrackingDetailItem>>(`/tracking/${id}`);
      if (res.data.succeeded && res.data.data) {
        setDetail(res.data.data);
      }
    } catch {
      // ignore transient
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const stopLiveTracking = useCallback(() => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setGpsActive(false);
    setSimulating(false);
  }, []);

  useEffect(() => {
    return () => stopLiveTracking();
  }, [stopLiveTracking]);

  const sendPing = async (
    assignmentId: string,
    lat: number,
    lng: number,
    accuracy = 15,
    speedMps: number | null = null,
    isMocked = false
  ) => {
    try {
      const res = await apiClient.post<
        ApiResult<{
          latitude: number;
          longitude: number;
          speedKmh: number;
          distanceToDestinationMeters: number;
          isInsideGeofence: boolean;
          isSuspicious: boolean;
          suspiciousReason?: string | null;
          recordedAt: string;
        }>
      >(`/tracking/${assignmentId}/ping`, {
        latitude: lat,
        longitude: lng,
        accuracyMeters: accuracy,
        speedMps,
        isMocked,
      });

      if (res.data.succeeded && res.data.data) {
        const d = res.data.data;
        setDetail((prev) => {
          if (!prev || prev.summary.id !== assignmentId) return prev;
          return {
            ...prev,
            summary: {
              ...prev.summary,
              lastLatitude: d.latitude,
              lastLongitude: d.longitude,
              lastSpeedKmh: d.speedKmh,
              lastDistanceToDestinationMeters: d.distanceToDestinationMeters,
              isInsideGeofence: d.isInsideGeofence,
              isSuspicious: d.isSuspicious,
              suspiciousReason: d.suspiciousReason,
              lastPingAt: d.recordedAt,
            },
            breadcrumbs: [
              ...prev.breadcrumbs,
              {
                id: `live-${d.recordedAt}`,
                latitude: d.latitude,
                longitude: d.longitude,
                accuracyMeters: accuracy,
                speedKmh: d.speedKmh,
                distanceToDestinationMeters: d.distanceToDestinationMeters,
                isMocked,
                isSuspicious: d.isSuspicious,
                eventTag: 'LIVE',
                recordedAt: d.recordedAt,
              },
            ],
          };
        });
      }
    } catch {
      // Abaikan ping transient offline
    }
  };

  const toggleRealGps = async (summary: TrackingSummaryItem) => {
    if (gpsActive) {
      stopLiveTracking();
      return;
    }

    stopLiveTracking();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Izin Lokasi Diperlukan',
        'Aktifkan izin lokasi di pengaturan perangkat untuk mengirim GPS realtime.'
      );
      return;
    }

    setGpsActive(true);
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await sendPing(
        summary.id,
        current.coords.latitude,
        current.coords.longitude,
        current.coords.accuracy ?? 15,
        current.coords.speed,
        Boolean(current.mocked)
      );

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (loc) => {
          void sendPing(
            summary.id,
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.accuracy ?? 15,
            loc.coords.speed,
            Boolean(loc.mocked)
          );
        }
      );
    } catch (err) {
      setGpsActive(false);
      Alert.alert('Gagal Membaca GPS', getErrorMessage(err, 'Pastikan GPS perangkat aktif.'));
    }
  };

  const toggleRouteSimulator = (
    summary: TrackingSummaryItem,
    mode: 'normal' | 'outside' = 'normal'
  ) => {
    if (simulating) {
      stopLiveTracking();
      return;
    }

    stopLiveTracking();
    setSimulating(true);
    const startLat = summary.lastLatitude ?? summary.originLatitude;
    const startLng = summary.lastLongitude ?? summary.originLongitude;
    // Mode 'outside' mendarat ~350m di luar titik tujuan agar bisa tes alur verifikasi Manager
    const targetLat =
      mode === 'outside' ? summary.destinationLatitude + 0.0032 : summary.destinationLatitude;
    const targetLng =
      mode === 'outside' ? summary.destinationLongitude + 0.0005 : summary.destinationLongitude;
    const totalSteps = 8;
    let step = 1;

    simTimerRef.current = setInterval(() => {
      const progress = Math.min(1, step / totalSteps);
      const lat = Number((startLat + (targetLat - startLat) * progress).toFixed(6));
      const lng = Number((startLng + (targetLng - startLng) * progress).toFixed(6));
      void sendPing(summary.id, lat, lng, 10, 9.2, false);

      if (step >= totalSteps) {
        stopLiveTracking();
        Alert.alert(
          'Simulasi Selesai',
          mode === 'outside'
            ? 'Posisi berhenti ~350m di luar geofence. Jika kamu submit POD sekarang, tugas akan masuk antrean verifikasi Manager.'
            : 'Posisi simulasi sudah tiba di dalam radius geofence tujuan.'
        );
      }
      step += 1;
    }, 1200);
  };

  const triggerMockGpsTest = async (summary: TrackingSummaryItem) => {
    await sendPing(summary.id, summary.destinationLatitude, summary.destinationLongitude, 5, 0, true);
    Alert.alert(
      'Simulasi Fake GPS Terkirim',
      'Server langsung mendeteksi flag isMocked=true dan menandai tugas ini sebagai anomali GPS (wajib verifikasi Manager).'
    );
    await loadList();
    if (selectedId) await loadDetail(selectedId);
  };

  const runAction = async (fn: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      Alert.alert('Berhasil', successMsg);
      await loadList();
      if (selectedId) await loadDetail(selectedId);
    } catch (err) {
      Alert.alert('Gagal', getErrorMessage(err, 'Aksi tidak dapat diproses.'));
    } finally {
      setBusy(false);
    }
  };

  const handlePickPodPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Izin Galeri Ditolak', 'Izinkan akses galeri untuk mengunggah foto bukti POD.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const validation = validatePickedMedia(picked.assets[0], 'image', 'pod');
    if (!validation.valid) {
      Alert.alert('File Tidak Valid', validation.message);
      return;
    }

    setUploadingPod(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: picked.assets[0].uri,
        name: validation.fileName,
        type: validation.mimeType,
      } as unknown as Blob);

      const res = await apiClient.post<ApiResult<{ url: string }>>('/tracking/upload-pod', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.succeeded && res.data.data) {
        setPodPhotoUrl(res.data.data.url);
      }
    } catch (err) {
      Alert.alert('Upload Gagal', getErrorMessage(err, 'Tidak dapat mengunggah foto POD.'));
    } finally {
      setUploadingPod(false);
    }
  };

  const activeSummary = detail?.summary ?? items.find((i) => i.id === selectedId) ?? null;
  const isAssigneeOrSuperAdmin =
    !!activeSummary &&
    (activeSummary.assigneeUsername.toLowerCase() === user?.username?.toLowerCase() ||
      user?.roles.some((r) => r.toLowerCase() === 'superadmin'));

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable
          onPress={() => {
            if (selectedId) {
              stopLiveTracking();
              setSelectedId(null);
            } else {
              router.back();
            }
          }}
          style={styles.backBtn}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {activeSummary
              ? activeSummary.assignmentCode
              : isFieldStaff
                ? 'Tugas Lapangan Saya'
                : isAuditorOnly
                  ? 'Monitoring Live Tracking'
                  : 'Command Center Tracking'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {activeSummary
              ? activeSummary.destinationLabel
              : isFieldStaff
                ? 'Mode Petugas • GPS, Simulasi & POD'
                : isAuditorOnly
                  ? 'Mode Auditor (Read-Only)'
                  : 'Mode Dispatcher / Manager • Semua Petugas'}
          </Text>
        </View>
        {(gpsActive || simulating) && (
          <View style={styles.liveBadge}>
            <Radio size={12} color="#FFFFFF" />
            <Text style={styles.liveBadgeText}>{gpsActive ? 'GPS LIVE' : 'SIMULASI'}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : activeSummary ? (
        /* Detail & Live Trip Cockpit */
        <ScrollView contentContainerStyle={styles.content}>
          <MobileLiveMap
            originLat={activeSummary.originLatitude}
            originLng={activeSummary.originLongitude}
            destLat={activeSummary.destinationLatitude}
            destLng={activeSummary.destinationLongitude}
            destLabel={activeSummary.destinationLabel}
            geofenceRadiusMeters={activeSummary.geofenceRadiusMeters}
            currentLat={activeSummary.lastLatitude}
            currentLng={activeSummary.lastLongitude}
            isInsideGeofence={activeSummary.isInsideGeofence}
            breadcrumbs={detail?.breadcrumbs ?? []}
            height={260}
          />

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                {activeSummary.title}
              </Text>
            </View>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              Petugas: {activeSummary.assigneeFullName} (@{activeSummary.assigneeUsername})
            </Text>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              Tujuan: {activeSummary.destinationAddress}
            </Text>
            {activeSummary.notes ? (
              <View style={[styles.noteBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>Instruksi Tugas</Text>
                <Text style={[styles.metaText, { color: colors.text }]}>{activeSummary.notes}</Text>
              </View>
            ) : null}

            <View style={styles.metricsRow}>
              <View style={[styles.metricBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Jarak ke Tujuan</Text>
                <Text style={[styles.metricValue, { color: colors.primary }]}>
                  {fmtDistance(activeSummary.lastDistanceToDestinationMeters)}
                </Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Geofence</Text>
                <Text
                  style={[
                    styles.metricValue,
                    { color: activeSummary.isInsideGeofence ? '#059669' : '#D97706' },
                  ]}
                >
                  {activeSummary.isInsideGeofence ? 'Di Dalam' : `>${activeSummary.geofenceRadiusMeters}m`}
                </Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Status</Text>
                <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
                  {STATUS_META[activeSummary.status]?.label ?? activeSummary.status}
                </Text>
              </View>
            </View>

            {activeSummary.isSuspicious && (
              <View style={styles.alertDanger}>
                <ShieldAlert size={16} color="#BE123C" />
                <Text style={styles.alertDangerText}>{activeSummary.suspiciousReason}</Text>
              </View>
            )}

            {activeSummary.issueNote ? (
              <View style={styles.alertWarn}>
                <AlertTriangle size={16} color="#B45309" />
                <Text style={styles.alertWarnText}>Kendala: {activeSummary.issueNote}</Text>
              </View>
            ) : null}

            {!canDispatch && activeSummary.status === 'PendingVerification' ? (
              <View style={styles.verifyBox}>
                <Text style={styles.verifyTitle}>Menunggu Verifikasi Manager</Text>
                <Text style={[styles.metaText, { color: '#9A3412' }]}>
                  Bukti POD kamu sudah terkirim dan sedang ditinjau oleh Manager/Dispatcher (di luar radius geofence atau ada flag GPS).
                </Text>
              </View>
            ) : null}

            {/* Operator Controls */}
            {canOperate && isAssigneeOrSuperAdmin && (
              <View style={styles.actionsWrap}>
                {activeSummary.status === 'Assigned' && (
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      void runAction(
                        async () => {
                          await apiClient.post(`/tracking/${activeSummary.id}/start`, {});
                        },
                        'Perjalanan dimulai! Sekarang kamu bisa menyalakan Live GPS atau Simulasi.'
                      )
                    }
                    style={[styles.btnPrimary, { backgroundColor: '#0D9488' }]}
                  >
                    <Play size={16} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>Mulai Perjalanan</Text>
                  </Pressable>
                )}

                {['InTransit', 'Arrived'].includes(activeSummary.status) && (
                  <>
                    <Pressable
                      onPress={() => void toggleRealGps(activeSummary)}
                      style={[
                        styles.btnPrimary,
                        { backgroundColor: gpsActive ? '#E11D48' : '#0284C7' },
                      ]}
                    >
                      {gpsActive ? <Square size={15} color="#FFF" /> : <Navigation size={15} color="#FFF" />}
                      <Text style={styles.btnPrimaryText}>
                        {gpsActive ? 'Matikan Live GPS' : 'Nyalakan Live GPS'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => toggleRouteSimulator(activeSummary, 'normal')}
                      style={[
                        styles.btnOutline,
                        { borderColor: simulating ? '#E11D48' : '#0284C7' },
                      ]}
                    >
                      <Truck size={15} color={simulating ? '#E11D48' : '#0284C7'} />
                      <Text
                        style={[
                          styles.btnOutlineText,
                          { color: simulating ? '#E11D48' : '#0284C7' },
                        ]}
                      >
                        {simulating ? 'Stop Simulasi' : 'Simulasi Normal (Masuk Geofence)'}
                      </Text>
                    </Pressable>

                    {!simulating && (
                      <View style={styles.simSecondaryRow}>
                        <Pressable
                          onPress={() => toggleRouteSimulator(activeSummary, 'outside')}
                          style={[styles.btnSmallOutline, { borderColor: '#EA580C', flex: 1 }]}
                        >
                          <MapPin size={13} color="#EA580C" />
                          <Text style={[styles.btnSmallText, { color: '#EA580C' }]}>
                            Simulasi Luar Geofence
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={busy}
                          onPress={() => void triggerMockGpsTest(activeSummary)}
                          style={[styles.btnSmallOutline, { borderColor: '#BE123C', flex: 1 }]}
                        >
                          <ShieldAlert size={13} color="#BE123C" />
                          <Text style={[styles.btnSmallText, { color: '#BE123C' }]}>
                            Test Fake GPS
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {activeSummary.status === 'InTransit' && (
                      <Pressable
                        disabled={busy}
                        onPress={() =>
                          void runAction(
                            async () => {
                              await apiClient.post(`/tracking/${activeSummary.id}/arrive`, {
                                latitude: activeSummary.lastLatitude,
                                longitude: activeSummary.lastLongitude,
                              });
                            },
                            'Check-In tiba di lokasi tercatat.'
                          )
                        }
                        style={[styles.btnPrimary, { backgroundColor: '#4F46E5' }]}
                      >
                        <MapPin size={15} color="#FFFFFF" />
                        <Text style={styles.btnPrimaryText}>Check-In Tiba</Text>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => {
                        setPodRecipient('');
                        setPodNotes('');
                        setPodPhotoUrl(null);
                        setPodVisible(true);
                      }}
                      style={[styles.btnPrimary, { backgroundColor: '#059669' }]}
                    >
                      <Camera size={15} color="#FFFFFF" />
                      <Text style={styles.btnPrimaryText}>Upload POD &amp; Selesai</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setIssueNote('');
                        setIssueVisible(true);
                      }}
                      style={[styles.btnOutline, { borderColor: '#D97706' }]}
                    >
                      <AlertTriangle size={15} color="#D97706" />
                      <Text style={[styles.btnOutlineText, { color: '#D97706' }]}>Lapor Kendala</Text>
                    </Pressable>
                  </>
                )}

                {activeSummary.status === 'IssueReported' && (
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      void runAction(
                        async () => {
                          await apiClient.post(`/tracking/${activeSummary.id}/resume`);
                        },
                        'Perjalanan dilanjutkan.'
                      )
                    }
                    style={[styles.btnPrimary, { backgroundColor: '#0D9488' }]}
                  >
                    <Play size={15} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>Lanjutkan Perjalanan</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Dispatcher Verification Controls */}
            {canDispatch && activeSummary.status === 'PendingVerification' && (
              <View style={styles.verifyBox}>
                <Text style={styles.verifyTitle}>Verifikasi Manager Diperlukan</Text>
                <View style={styles.verifyBtns}>
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      void runAction(
                        async () => {
                          await apiClient.post(`/tracking/${activeSummary.id}/verify`, {
                            approved: true,
                            verificationNotes: 'Disetujui dari Mobile Manager.',
                          });
                        },
                        'Verifikasi disetujui.'
                      )
                    }
                    style={[styles.btnPrimary, { backgroundColor: '#059669', flex: 1 }]}
                  >
                    <CheckCircle2 size={15} color="#FFF" />
                    <Text style={styles.btnPrimaryText}>Setujui</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      void runAction(
                        async () => {
                          await apiClient.post(`/tracking/${activeSummary.id}/verify`, {
                            approved: false,
                            verificationNotes: 'Ditolak oleh verifikator.',
                          });
                        },
                        'Verifikasi ditolak.'
                      )
                    }
                    style={[styles.btnPrimary, { backgroundColor: '#E11D48', flex: 1 }]}
                  >
                    <XCircle size={15} color="#FFF" />
                    <Text style={styles.btnPrimaryText}>Tolak</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {/* Detail Bukti Penyelesaian (POD) — menampilkan Nama Penerima, Notes, Waktu, Verifikasi, & Foto Klik-Perbesar */}
          {(detail?.podRecipientName ||
            detail?.podNotes ||
            activeSummary.podPhotoUrl ||
            detail?.verificationNotes ||
            activeSummary.status === 'Completed' ||
            activeSummary.status === 'PendingVerification') && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <View style={styles.podHeaderRow}>
                  <FileText size={15} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Bukti Penyelesaian (POD)
                  </Text>
                </View>
                <View
                  style={[
                    styles.pill,
                    {
                      backgroundColor: activeSummary.isInsideGeofence ? '#D1FAE5' : '#FFEDD5',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: activeSummary.isInsideGeofence ? '#047857' : '#C2410C' },
                    ]}
                  >
                    {activeSummary.isInsideGeofence ? 'Dalam Geofence' : 'Luar Geofence'}
                  </Text>
                </View>
              </View>

              <View style={[styles.podDetailGrid, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.podFieldRow}>
                  <UserCheck size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.podFieldLabel, { color: colors.textSecondary }]}>
                      Nama Penerima / PIC
                    </Text>
                    <Text style={[styles.podFieldValue, { color: colors.text }]}>
                      {detail?.podRecipientName || '-'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.podFieldRow, styles.podFieldDivider, { borderTopColor: colors.border }]}>
                  <FileText size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.podFieldLabel, { color: colors.textSecondary }]}>
                      Catatan Serah Terima
                    </Text>
                    <Text style={[styles.podFieldValue, { color: colors.text }]}>
                      {detail?.podNotes || 'Tidak ada catatan tambahan.'}
                    </Text>
                  </View>
                </View>

                {(activeSummary.completedAt || activeSummary.arrivedAt) && (
                  <View style={[styles.podFieldRow, styles.podFieldDivider, { borderTopColor: colors.border }]}>
                    <Clock size={14} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.podFieldLabel, { color: colors.textSecondary }]}>
                        {activeSummary.completedAt ? 'Waktu Selesai' : 'Waktu Submit POD'}
                      </Text>
                      <Text style={[styles.podFieldValue, { color: colors.text }]}>
                        {formatDateTime(activeSummary.completedAt ?? activeSummary.arrivedAt)}
                      </Text>
                    </View>
                  </View>
                )}

                {(detail?.verifiedByUsername || detail?.verificationNotes) && (
                  <View style={[styles.podFieldRow, styles.podFieldDivider, { borderTopColor: colors.border }]}>
                    <CheckCircle2 size={14} color="#059669" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.podFieldLabel, { color: '#059669' }]}>
                        Verifikasi oleh @{detail?.verifiedByUsername || '-'}
                        {detail?.verifiedAt ? ` • ${formatDateTime(detail.verifiedAt)}` : ''}
                      </Text>
                      <Text style={[styles.podFieldValue, { color: colors.text }]}>
                        {detail?.verificationNotes || '-'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {activeSummary.podPhotoUrl ? (
                <Pressable
                  onPress={() => {
                    const resolvedUrl = resolveMediaUrl(activeSummary.podPhotoUrl);
                    if (!resolvedUrl) return;
                    setPhotoViewer({
                      url: resolvedUrl,
                      caption: `${activeSummary.assignmentCode} • Penerima: ${detail?.podRecipientName || '-'}`,
                    });
                  }}
                  style={styles.podPhotoWrap}
                >
                  <Image
                    source={{ uri: resolveMediaUrl(activeSummary.podPhotoUrl) }}
                    style={styles.podPreview}
                    resizeMode="cover"
                  />
                  <View style={styles.podZoomBadge}>
                    <ZoomIn size={13} color="#FFFFFF" />
                    <Text style={styles.podZoomText}>Tap untuk lihat foto</Text>
                  </View>
                </Pressable>
              ) : (
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  Tidak ada lampiran foto POD pada tugas ini.
                </Text>
              )}
            </View>
          )}

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Riwayat Status</Text>
            {(detail?.statusLogs ?? []).map((log) => (
              <View key={log.id} style={[styles.logItem, { borderColor: colors.border }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.logTitle, { color: colors.text }]}>
                    {log.fromStatus} → {log.toStatus}
                  </Text>
                  <Text style={[styles.logTime, { color: colors.textSecondary }]}>
                    {formatDateTime(log.timestamp)}
                  </Text>
                </View>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{log.notes}</Text>
                <Text style={[styles.logActor, { color: colors.textSecondary }]}>
                  Oleh: {log.actorFullName}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        /* Assignment List */
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadList(true)}
              tintColor={colors.primary}
            />
          }
        >
          {/* Mini Stats Bar */}
          <View style={styles.summaryStrip}>
            <View style={[styles.summaryMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryMiniNum, { color: colors.text }]}>{items.length}</Text>
              <Text style={[styles.summaryMiniLabel, { color: colors.textSecondary }]}>
                {isFieldStaff ? 'Tugas Saya' : 'Total'}
              </Text>
            </View>
            <View style={[styles.summaryMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryMiniNum, { color: '#0284C7' }]}>
                {items.filter((i) => ['Assigned', 'InTransit', 'Arrived', 'IssueReported'].includes(i.status)).length}
              </Text>
              <Text style={[styles.summaryMiniLabel, { color: colors.textSecondary }]}>Aktif</Text>
            </View>
            <View style={[styles.summaryMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryMiniNum, { color: '#EA580C' }]}>
                {items.filter((i) => i.status === 'PendingVerification').length}
              </Text>
              <Text style={[styles.summaryMiniLabel, { color: colors.textSecondary }]}>Verifikasi</Text>
            </View>
            <View style={[styles.summaryMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryMiniNum, { color: '#059669' }]}>
                {items.filter((i) => i.status === 'Completed').length}
              </Text>
              <Text style={[styles.summaryMiniLabel, { color: colors.textSecondary }]}>Selesai</Text>
            </View>
          </View>

          {/* Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(
              [
                { key: 'ALL', label: 'Semua' },
                { key: 'ACTIVE', label: 'Aktif' },
                { key: 'VERIFY', label: 'Verifikasi' },
                { key: 'DONE', label: 'Selesai' },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setStatusFilter(tab.key)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {filteredItems.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.metaText, { color: colors.textSecondary, textAlign: 'center' }]}>
                Belum ada tugas lapangan yang cocok dengan filter ini.
              </Text>
            </View>
          ) : (
            filteredItems.map((item) => {
              const st = STATUS_META[item.status] ?? {
                label: item.status,
                color: '#475569',
                bg: '#F1F5F9',
              };
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.rowBetween}>
                    <Text style={[styles.codeText, { color: colors.primary }]}>{item.assignmentCode}</Text>
                    <View style={[styles.pill, { backgroundColor: st.bg }]}>
                      <Text style={[styles.pillText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                    Tujuan: {item.destinationLabel}
                  </Text>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      @{item.assigneeUsername}
                    </Text>
                    <Text style={[styles.distText, { color: colors.primary }]}>
                      {fmtDistance(item.lastDistanceToDestinationMeters)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* POD Modal */}
      <Modal visible={podVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Bukti Penyelesaian (POD)</Text>
            <TextInput
              value={podRecipient}
              onChangeText={setPodRecipient}
              placeholder="Nama Penerima / PIC *"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
            <TextInput
              value={podNotes}
              onChangeText={setPodNotes}
              placeholder="Catatan serah terima (opsional)"
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: 68 }]}
            />
            <Pressable
              onPress={() => void handlePickPodPhoto()}
              disabled={uploadingPod}
              style={[styles.btnOutline, { borderColor: colors.primary }]}
            >
              <Camera size={16} color={colors.primary} />
              <Text style={[styles.btnOutlineText, { color: colors.primary }]}>
                {uploadingPod ? 'Mengunggah foto...' : podPhotoUrl ? 'Ganti Foto POD' : 'Pilih Foto Bukti POD'}
              </Text>
            </Pressable>
            {podPhotoUrl && (
              <Pressable
                onPress={() => {
                  const resolvedUrl = resolveMediaUrl(podPhotoUrl);
                  if (!resolvedUrl) return;
                  setPhotoViewer({
                    url: resolvedUrl,
                    caption: `Preview Foto POD — ${activeSummary?.assignmentCode ?? ''}`,
                  });
                }}
                style={styles.podPhotoWrap}
              >
                <Image source={{ uri: resolveMediaUrl(podPhotoUrl) }} style={styles.podPreview} />
                <View style={styles.podZoomBadge}>
                  <ZoomIn size={13} color="#FFFFFF" />
                  <Text style={styles.podZoomText}>Tap untuk perbesar</Text>
                </View>
              </Pressable>
            )}
            <View style={styles.verifyBtns}>
              <Pressable onPress={() => setPodVisible(false)} style={[styles.btnOutline, { borderColor: colors.border, flex: 1 }]}>
                <Text style={[styles.btnOutlineText, { color: colors.textSecondary }]}>Batal</Text>
              </Pressable>
              <Pressable
                disabled={busy || !podRecipient.trim()}
                onPress={() => {
                  if (!activeSummary) return;
                  stopLiveTracking();
                  void runAction(
                    async () => {
                      await apiClient.post(`/tracking/${activeSummary.id}/complete`, {
                        recipientName: podRecipient.trim(),
                        notes: podNotes.trim() || null,
                        podPhotoUrl,
                        latitude: activeSummary.lastLatitude,
                        longitude: activeSummary.lastLongitude,
                      });
                      setPodVisible(false);
                    },
                    'POD berhasil dikirim!'
                  );
                }}
                style={[styles.btnPrimary, { backgroundColor: '#059669', flex: 1 }]}
              >
                <Text style={styles.btnPrimaryText}>Selesaikan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Issue Modal */}
      <Modal visible={issueVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Laporkan Kendala Lapangan</Text>
            <TextInput
              value={issueNote}
              onChangeText={setIssueNote}
              placeholder="Jelaskan kendala di jalan..."
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: 80 }]}
            />
            <View style={styles.verifyBtns}>
              <Pressable onPress={() => setIssueVisible(false)} style={[styles.btnOutline, { borderColor: colors.border, flex: 1 }]}>
                <Text style={[styles.btnOutlineText, { color: colors.textSecondary }]}>Batal</Text>
              </Pressable>
              <Pressable
                disabled={busy || !issueNote.trim()}
                onPress={() => {
                  if (!activeSummary) return;
                  void runAction(
                    async () => {
                      await apiClient.post(`/tracking/${activeSummary.id}/issue`, {
                        issueNote: issueNote.trim(),
                        latitude: activeSummary.lastLatitude,
                        longitude: activeSummary.lastLongitude,
                      });
                      setIssueVisible(false);
                    },
                    'Kendala terkirim ke Command Center.'
                  );
                }}
                style={[styles.btnPrimary, { backgroundColor: '#D97706', flex: 1 }]}
              >
                <Text style={styles.btnPrimaryText}>Kirim</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* Fullscreen Photo Lightbox Modal */}
      <Modal
        visible={Boolean(photoViewer)}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoViewer(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <SafeAreaView style={styles.lightboxSafe}>
            <View style={styles.lightboxHeader}>
              <Text style={styles.lightboxCaption} numberOfLines={2}>
                {photoViewer?.caption || 'Foto Bukti POD'}
              </Text>
              <Pressable onPress={() => setPhotoViewer(null)} style={styles.lightboxCloseBtn}>
                <X size={20} color="#FFFFFF" />
              </Pressable>
            </View>
            <Pressable style={styles.lightboxImageWrap} onPress={() => setPhotoViewer(null)}>
              {photoViewer?.url ? (
                <Image
                  source={{ uri: photoViewer.url }}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                />
              ) : null}
            </Pressable>
            <Text style={styles.lightboxHint}>Ketuk di mana saja untuk menutup</Text>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub: { fontSize: 12 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E11D48',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  content: { padding: 14, gap: 12, paddingBottom: 32 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  codeText: { fontSize: 12, fontWeight: '800' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  metaText: { fontSize: 12, lineHeight: 18 },
  distText: { fontSize: 12, fontWeight: '700' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  metricBox: { flex: 1, borderRadius: radius.md, padding: 10, gap: 2 },
  metricLabel: { fontSize: 10, fontWeight: '600' },
  metricValue: { fontSize: 13, fontWeight: '800' },
  alertDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFE4E6',
    padding: 10,
    borderRadius: radius.md,
  },
  alertDangerText: { flex: 1, color: '#9F1239', fontSize: 12, fontWeight: '600' },
  alertWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: radius.md,
  },
  alertWarnText: { flex: 1, color: '#92400E', fontSize: 12, fontWeight: '600' },
  noteBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    gap: 2,
  },
  noteLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  actionsWrap: { gap: 8, marginTop: 6 },
  simSecondaryRow: { flexDirection: 'row', gap: 8 },
  btnSmallOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  btnSmallText: { fontSize: 11, fontWeight: '700' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  btnOutlineText: { fontSize: 13, fontWeight: '700' },
  verifyBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
    marginTop: 6,
  },
  verifyTitle: { color: '#9A3412', fontSize: 12, fontWeight: '700' },
  verifyBtns: { flexDirection: 'row', gap: 8 },
  podHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  podDetailGrid: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    gap: 8,
  },
  podFieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  podFieldDivider: { borderTopWidth: 1, paddingTop: 8 },
  podFieldLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  podFieldValue: { fontSize: 13, fontWeight: '600', marginTop: 2, lineHeight: 18 },
  podPhotoWrap: { position: 'relative', borderRadius: radius.md, overflow: 'hidden' },
  podPreview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: '#E2E8F0' },
  podZoomBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  podZoomText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  summaryStrip: { flexDirection: 'row', gap: 8 },
  summaryMini: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  summaryMiniNum: { fontSize: 16, fontWeight: '800' },
  summaryMiniLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  logItem: { borderTopWidth: 1, paddingTop: 8, gap: 2 },
  logTitle: { fontSize: 12, fontWeight: '700' },
  logTime: { fontSize: 10, fontWeight: '600' },
  logActor: { fontSize: 11, fontStyle: 'italic' },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.96)',
  },
  lightboxSafe: { flex: 1, padding: 16, justifyContent: 'space-between' },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lightboxCaption: { flex: 1, color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  lightboxCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  lightboxImage: { width: '100%', height: '100%' },
  lightboxHint: { color: '#94A3B8', fontSize: 11, textAlign: 'center', paddingBottom: 6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalCard: { borderRadius: 22, padding: 18, gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
});
