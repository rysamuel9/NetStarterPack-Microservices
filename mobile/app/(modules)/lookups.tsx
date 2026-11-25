import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FolderPlus,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type {
  ApiResult,
  LookupGroupSummary,
  LookupItem,
  MasterDataStats,
} from '@/core/types';

const COLOR_DOT_HEX: Record<string, string> = {
  teal: '#14B8A6',
  indigo: '#6366F1',
  amber: '#F59E0B',
  sky: '#0EA5E9',
  rose: '#F43F5E',
  violet: '#8B5CF6',
  emerald: '#10B981',
  slate: '#94A3B8',
};

function parseMetadataColor(metadataJson?: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { color?: string };
    return parsed?.color && COLOR_DOT_HEX[parsed.color] ? COLOR_DOT_HEX[parsed.color] : null;
  } catch {
    return null;
  }
}

interface LookupPayload {
  groupCode: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  metadataJson: string | null;
}

export default function LookupsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('Lookups.Manage');

  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LookupItem | null>(null);
  const [groupCode, setGroupCode] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [sortOrderText, setSortOrderText] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [metadataJson, setMetadataJson] = useState('');

  const groupsQuery = useQuery({
    queryKey: ['lookups', 'groups'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<LookupGroupSummary[]>>('/lookups/groups');
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat daftar grup lookup.');
      }
      return res.data.data;
    },
  });

  const statsQuery = useQuery({
    queryKey: ['lookups', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<MasterDataStats>>('/lookups/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  useEffect(() => {
    const groups = groupsQuery.data ?? [];
    if (groups.length > 0 && (!selectedGroup || !groups.some((g) => g.groupCode === selectedGroup))) {
      setSelectedGroup(groups[0].groupCode);
    }
  }, [groupsQuery.data, selectedGroup]);

  const itemsQuery = useQuery({
    queryKey: ['lookups', 'list', selectedGroup, activeOnly],
    enabled: Boolean(selectedGroup),
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<LookupItem[]>>('/lookups', {
        params: {
          groupCode: selectedGroup,
          activeOnly,
        },
      });
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat daftar item lookup.');
      }
      return res.data.data;
    },
  });

  const invalidateAllLookups = (nextGroup?: string) => {
    if (nextGroup) setSelectedGroup(nextGroup);
    void queryClient.invalidateQueries({ queryKey: ['lookups'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: LookupPayload) => {
      if (editing) {
        const res = await apiClient.put<ApiResult<LookupItem>>(`/lookups/${editing.id}`, payload);
        if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal memperbarui lookup.');
        return { data: res.data, group: payload.groupCode };
      }
      const res = await apiClient.post<ApiResult<LookupItem>>('/lookups', payload);
      if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal menambahkan lookup.');
      return { data: res.data, group: payload.groupCode };
    },
    onSuccess: (res) => {
      setModalOpen(false);
      invalidateAllLookups(res.group);
    },
    onError: (err) => {
      Alert.alert('Gagal Menyimpan', getErrorMessage(err));
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, nextActive }: { id: string; nextActive: boolean }) => {
      const res = await apiClient.patch<ApiResult<LookupItem>>(`/lookups/${id}/status`, {
        isActive: nextActive,
      });
      if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal mengubah status.');
      return res.data;
    },
    onSuccess: () => invalidateAllLookups(),
    onError: (err) => Alert.alert('Gagal Mengubah Status', getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete<ApiResult>(`/lookups/${id}`);
      if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal menghapus lookup.');
      return res.data;
    },
    onSuccess: () => invalidateAllLookups(),
    onError: (err) => Alert.alert('Gagal Menghapus', getErrorMessage(err)),
  });

  const filteredItems = useMemo(() => {
    const items = itemsQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.code.toLowerCase().includes(term) ||
        i.name.toLowerCase().includes(term) ||
        (i.description || '').toLowerCase().includes(term) ||
        (i.parentName || '').toLowerCase().includes(term)
    );
  }, [itemsQuery.data, search]);

  const parentCandidates = useMemo(() => {
    const items = itemsQuery.data ?? [];
    const normalizedFormGroup = groupCode.trim().toUpperCase().replace(/\s+/g, '_');
    return items.filter((x) => x.groupCode === normalizedFormGroup && x.id !== editing?.id);
  }, [itemsQuery.data, groupCode, editing?.id]);

  const openCreateModal = (forNewGroup = false) => {
    setEditing(null);
    const currentItems = itemsQuery.data ?? [];
    const nextOrder =
      forNewGroup || currentItems.length === 0
        ? 1
        : Math.max(...currentItems.map((x) => x.sortOrder)) + 1;

    setGroupCode(forNewGroup ? '' : selectedGroup);
    setCode('');
    setName('');
    setDescription('');
    setParentId('');
    setSortOrderText(String(nextOrder));
    setIsActive(true);
    setMetadataJson('');
    setModalOpen(true);
  };

  const openEditModal = (item: LookupItem) => {
    setEditing(item);
    setGroupCode(item.groupCode);
    setCode(item.code);
    setName(item.name);
    setDescription(item.description || '');
    setParentId(item.parentId || '');
    setSortOrderText(String(item.sortOrder));
    setIsActive(item.isActive);
    setMetadataJson(item.metadataJson || '');
    setModalOpen(true);
  };

  const handleSave = () => {
    const normalizedGroup = groupCode.trim().toUpperCase().replace(/\s+/g, '_');
    const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!normalizedGroup || !normalizedCode || !name.trim()) {
      Alert.alert('Validasi', 'GroupCode, Code, dan Nama wajib diisi.');
      return;
    }

    if (metadataJson.trim()) {
      try {
        const parsed = JSON.parse(metadataJson);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          Alert.alert('Validasi', 'MetadataJson harus berupa objek JSON (contoh: {"color":"teal"}).');
          return;
        }
      } catch {
        Alert.alert('Validasi', 'Format MetadataJson tidak valid.');
        return;
      }
    }

    saveMutation.mutate({
      groupCode: normalizedGroup,
      code: normalizedCode,
      name: name.trim(),
      description: description.trim() || null,
      parentId: parentId || null,
      sortOrder: Number.parseInt(sortOrderText, 10) || 0,
      isActive,
      metadataJson: metadataJson.trim() || null,
    });
  };

  const confirmDelete = (item: LookupItem) => {
    if (item.isSystem) {
      Alert.alert(
        'Item Sistem',
        'Item bawaan sistem tidak boleh dihapus. Nonaktifkan statusnya jika tidak ingin muncul di dropdown.'
      );
      return;
    }

    Alert.alert(
      'Hapus Lookup?',
      `Hapus "${item.name}" (${item.code}) dari grup ${item.groupCode}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(item.id),
        },
      ]
    );
  };

  const isRefreshing = groupsQuery.isRefetching || itemsQuery.isRefetching || statsQuery.isRefetching;
  const handleRefresh = () => {
    void Promise.all([groupsQuery.refetch(), itemsQuery.refetch(), statsQuery.refetch()]);
  };

  const stats = statsQuery.data;
  const groups = groupsQuery.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Master Lookups</Text>
          <View style={styles.subtitleRow}>
            <Database size={12} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              MasterData.Api (:5086) • Unified Lookup Table
            </Text>
          </View>
        </View>
        {canManage ? (
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => openCreateModal(true)}
              style={[styles.secondaryAddBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
            >
              <FolderPlus size={16} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => openCreateModal(false)}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Plus size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Ringkasan Statistik */}
      {stats ? (
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Grup</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalGroups}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalItems}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Aktif</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>{stats.activeItems}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Nonaktif</Text>
            <Text style={[styles.statValue, { color: colors.textSecondary }]}>{stats.inactiveItems}</Text>
          </View>
        </View>
      ) : null}

      {/* Daftar Group Chips */}
      <View style={styles.groupBarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupChips}>
          {groups.map((g) => {
            const active = g.groupCode === selectedGroup;
            return (
              <Pressable
                key={g.groupCode}
                onPress={() => setSelectedGroup(g.groupCode)}
                style={[
                  styles.groupChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.groupChipText,
                    { color: active ? colors.primaryForeground : colors.text },
                  ]}
                >
                  {g.groupCode}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    { backgroundColor: active ? 'rgba(255,255,255,0.22)' : colors.surfaceMuted },
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeText,
                      { color: active ? colors.primaryForeground : colors.textSecondary },
                    ]}
                  >
                    {g.activeCount}/{g.totalCount}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Search + Active Filter */}
      <View style={styles.filterRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari kode atau nama..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <X size={15} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={() => setActiveOnly((v) => !v)}
          style={[
            styles.activeFilterBtn,
            {
              backgroundColor: activeOnly ? colors.primaryLight : colors.surface,
              borderColor: activeOnly ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.activeFilterText,
              { color: activeOnly ? colors.primary : colors.textSecondary },
            ]}
          >
            Aktif saja
          </Text>
        </Pressable>
      </View>

      {/* List Lookup Items */}
      {groupsQuery.isLoading || itemsQuery.isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            Memuat Master Data dari MasterData.Api...
          </Text>
        </View>
      ) : groupsQuery.isError || itemsQuery.isError ? (
        <View style={styles.centerBox}>
          <Text style={[styles.centerText, { color: colors.danger }]}>
            {getErrorMessage(groupsQuery.error || itemsQuery.error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                Belum ada item lookup di grup ini.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const dotHex = parseMetadataColor(item.metadataJson);
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTopRow}>
                  <View style={styles.codeRow}>
                    <View style={[styles.orderBadge, { backgroundColor: colors.surfaceMuted }]}>
                      <Text style={[styles.orderText, { color: colors.textSecondary }]}>#{item.sortOrder}</Text>
                    </View>
                    <View style={[styles.codePill, { backgroundColor: colors.surfaceMuted }]}>
                      <Text style={[styles.codeText, { color: colors.primary }]}>{item.code}</Text>
                    </View>
                    {item.isSystem ? (
                      <View style={[styles.systemPill, { backgroundColor: colors.warningLight }]}>
                        <Lock size={10} color={colors.warning} />
                        <Text style={[styles.systemText, { color: colors.warning }]}>System</Text>
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    disabled={!canManage || toggleStatusMutation.isPending}
                    onPress={() =>
                      toggleStatusMutation.mutate({ id: item.id, nextActive: !item.isActive })
                    }
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: item.isActive ? colors.successLight : colors.surfaceMuted,
                      },
                    ]}
                  >
                    {item.isActive ? (
                      <CheckCircle2 size={12} color={colors.success} />
                    ) : (
                      <XCircle size={12} color={colors.textMuted} />
                    )}
                    <Text
                      style={[
                        styles.statusText,
                        { color: item.isActive ? colors.success : colors.textMuted },
                      ]}
                    >
                      {item.isActive ? 'Aktif' : 'Nonaktif'}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.nameRow}>
                  {dotHex ? <View style={[styles.colorDot, { backgroundColor: dotHex }]} /> : null}
                  <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                </View>

                {item.description ? (
                  <Text style={[styles.itemDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    {item.parentName ? (
                      <Text style={[styles.metaNote, { color: colors.info }]}>
                        Parent: {item.parentName}
                      </Text>
                    ) : item.metadataJson ? (
                      <Text style={[styles.metaNote, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.metadataJson}
                      </Text>
                    ) : (
                      <Text style={[styles.metaNote, { color: colors.textMuted }]}>{item.groupCode}</Text>
                    )}
                  </View>

                  {canManage ? (
                    <View style={styles.actionRow}>
                      <Pressable
                        onPress={() => openEditModal(item)}
                        style={[styles.iconActionBtn, { backgroundColor: colors.infoLight }]}
                      >
                        <Pencil size={14} color={colors.info} />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDelete(item)}
                        style={[
                          styles.iconActionBtn,
                          {
                            backgroundColor: item.isSystem ? colors.surfaceMuted : colors.dangerLight,
                            opacity: item.isSystem ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Trash2 size={14} color={item.isSystem ? colors.textMuted : colors.danger} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editing ? 'Edit Master Lookup' : 'Tambah Master Lookup'}
              </Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Group Code</Text>
                <TextInput
                  value={groupCode}
                  onChangeText={(t) => setGroupCode(t.toUpperCase())}
                  editable={!editing?.isSystem}
                  autoCapitalize="characters"
                  placeholder="PRODUCT_CATEGORY"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                      color: editing?.isSystem ? colors.textMuted : colors.text,
                    },
                  ]}
                />
              </View>

              <View style={styles.twoCol}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Item Code</Text>
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    editable={!editing?.isSystem}
                    autoCapitalize="characters"
                    placeholder="CLOUD_INFRA"
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: colors.border,
                        color: editing?.isSystem ? colors.textMuted : colors.text,
                      },
                    ]}
                  />
                </View>

                <View style={[styles.fieldGroup, { width: 92 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Urutan</Text>
                  <TextInput
                    value={sortOrderText}
                    onChangeText={setSortOrderText}
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: colors.border,
                        color: colors.text,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Label Tampilan (Name)</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Cloud & Infrastructure"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Deskripsi (Opsional)</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={2}
                  placeholder="Keterangan singkat..."
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    styles.textArea,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                />
              </View>

              {parentCandidates.length > 0 ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Parent Lookup (Opsional)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
                    <Pressable
                      onPress={() => setParentId('')}
                      style={[
                        styles.miniChip,
                        {
                          backgroundColor: !parentId ? colors.primaryLight : colors.surfaceMuted,
                          borderColor: !parentId ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.miniChipText,
                          { color: !parentId ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        Tanpa Parent
                      </Text>
                    </Pressable>
                    {parentCandidates.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => setParentId(p.id)}
                        style={[
                          styles.miniChip,
                          {
                            backgroundColor: parentId === p.id ? colors.primaryLight : colors.surfaceMuted,
                            borderColor: parentId === p.id ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniChipText,
                            { color: parentId === p.id ? colors.primary : colors.textSecondary },
                          ]}
                        >
                          {p.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Metadata JSON (Opsional)
                </Text>
                <TextInput
                  value={metadataJson}
                  onChangeText={setMetadataJson}
                  placeholder='{"color":"teal"}'
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
                  {Object.entries(COLOR_DOT_HEX).map(([colorName, hex]) => (
                    <Pressable
                      key={colorName}
                      onPress={() => setMetadataJson(JSON.stringify({ color: colorName }))}
                      style={[
                        styles.miniChip,
                        {
                          backgroundColor: colors.surfaceMuted,
                          borderColor: colors.border,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        },
                      ]}
                    >
                      <View style={[styles.colorDotSmall, { backgroundColor: hex }]} />
                      <Text style={[styles.miniChipText, { color: colors.textSecondary }]}>{colorName}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.switchRow}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Aktif di dropdown</Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>

              <Pressable
                onPress={handleSave}
                disabled={saveMutation.isPending}
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                    {editing ? 'Simpan Perubahan' : 'Simpan Lookup'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  headerSub: { fontSize: 11, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryAddBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statBox: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  statValue: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  groupBarWrapper: { paddingTop: 12 },
  groupChips: { paddingHorizontal: 16, gap: 8 },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  groupChipText: { fontSize: 12, fontWeight: '700' },
  countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  countBadgeText: { fontSize: 10, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 13 },
  activeFilterBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  activeFilterText: { fontSize: 12, fontWeight: '600' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  centerText: { fontSize: 13, textAlign: 'center' },
  emptyBox: { borderRadius: radius.lg, borderWidth: 1, padding: 24, alignItems: 'center' },
  listContent: { padding: 16, paddingTop: 4, gap: 10 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 14, gap: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  orderBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.sm },
  orderText: { fontSize: 10, fontWeight: '700' },
  codePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  codeText: { fontSize: 11, fontWeight: '700' },
  systemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  systemText: { fontSize: 10, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  colorDotSmall: { width: 8, height: 8, borderRadius: 4 },
  itemName: { fontSize: 15, fontWeight: '700', flex: 1 },
  itemDesc: { fontSize: 12, lineHeight: 17 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
    gap: 8,
  },
  metaNote: { fontSize: 11, fontWeight: '500' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalForm: { gap: 12, paddingBottom: 18 },
  twoCol: { flexDirection: 'row', gap: 10 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 68, textAlignVertical: 'top' },
  presetRow: { gap: 6, paddingTop: 2 },
  miniChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  miniChipText: { fontSize: 11, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  saveBtn: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700' },
});
