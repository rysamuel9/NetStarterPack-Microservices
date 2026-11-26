import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  MapPin,
  Navigation,
  Play,
  Radio,
  ShieldAlert,
  Square,
  Truck,
  XCircle,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { resolveMediaUrl } from '@/core/config/serverConfig';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, TrackingDetailItem, TrackingSummaryItem } from '@/core/types';
import { MobileLiveMap } from '@/features/tracking/MobileLiveMap';
import { validatePickedMedia } from '@/shared/utils/fileUpload';

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

  const [items, setItems] = useState<TrackingSummaryItem[]>([]);
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

  // POD Modal state
  const [podVisible, setPodVisible] = useState(false);
  const [podRecipient, setPodRecipient] = useState('');
  const [podNotes, setPodNotes] = useState('');
  const [podPhotoUrl, setPodPhotoUrl] = useState<string | null>(null);
  const [uploadingPod, setUploadingPod] = useState(false);

  // Issue Modal state
  const [issueVisible, setIssueVisible] = useState(false);
  const [issueNote, setIssueNote] = useState('');

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

  const toggleRouteSimulator = (summary: TrackingSummaryItem) => {
    if (simulating) {
      stopLiveTracking();
      return;
    }

    stopLiveTracking();
    setSimulating(true);
    const startLat = summary.lastLatitude ?? summary.originLatitude;
    const startLng = summary.lastLongitude ?? summary.originLongitude;
    const totalSteps = 10;
    let step = 1;

    simTimerRef.current = setInterval(() => {
      const progress = Math.min(1, step / totalSteps);
      const lat = Number((startLat + (summary.destinationLatitude - startLat) * progress).toFixed(6));
      const lng = Number((startLng + (summary.destinationLongitude - startLng) * progress).toFixed(6));
      void sendPing(summary.id, lat, lng, 10, 9.2, false);

      if (step >= totalSteps) {
        stopLiveTracking();
        Alert.alert('Simulasi Selesai', 'Posisi simulasi sudah tiba di dalam radius geofence tujuan.');
      }
      step += 1;
    }, 1500);
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
            {activeSummary ? activeSummary.assignmentCode : 'Live Location Tracking'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {activeSummary ? activeSummary.destinationLabel : 'Tracking.Api (:5087) • GPS & Geofence'}
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
                      onPress={() => toggleRouteSimulator(activeSummary)}
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
                        {simulating ? 'Stop Simulasi' : 'Simulasi Jalan (Demo)'}
                      </Text>
                    </Pressable>

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

          {/* POD Preview & Timeline */}
          {activeSummary.podPhotoUrl && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Foto Bukti POD</Text>
              <Image
                source={{ uri: resolveMediaUrl(activeSummary.podPhotoUrl) }}
                style={styles.podPreview}
              />
            </View>
          )}

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Riwayat Status</Text>
            {(detail?.statusLogs ?? []).map((log) => (
              <View key={log.id} style={[styles.logItem, { borderColor: colors.border }]}>
                <Text style={[styles.logTitle, { color: colors.text }]}>
                  {log.fromStatus} → {log.toStatus}
                </Text>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{log.notes}</Text>
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
          {items.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.metaText, { color: colors.textSecondary, textAlign: 'center' }]}>
                Belum ada tugas lapangan yang ditugaskan.
              </Text>
            </View>
          ) : (
            items.map((item) => {
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
              <Image source={{ uri: resolveMediaUrl(podPhotoUrl) }} style={styles.podPreview} />
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
  actionsWrap: { gap: 8, marginTop: 6 },
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
  podPreview: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: '#E2E8F0' },
  logItem: { borderTopWidth: 1, paddingTop: 8, gap: 2 },
  logTitle: { fontSize: 12, fontWeight: '700' },
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
