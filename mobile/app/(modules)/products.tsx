import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Database,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, ProductItem } from '@/core/types';
import { formatCurrency } from '@/shared/utils/formatters';

const CATEGORY_PRESETS = [
  'Cloud & Infrastructure',
  'Security & Network',
  'Data & Analytics',
  'Developer Tools',
  'Enterprise License',
];

const STATUS_OPTIONS = ['Active', 'Inactive', 'Draft'];

interface ProductPayload {
  sku: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  status: string;
}

export default function ProductsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canCreate = hasPermission('Products.Create');
  const canEdit = hasPermission('Products.Edit');
  const canDelete = hasPermission('Products.Delete');

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORY_PRESETS[0]);
  const [priceText, setPriceText] = useState('1000000');
  const [stockText, setStockText] = useState('10');
  const [status, setStatus] = useState('Active');
  const [description, setDescription] = useState('');

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<ProductItem[]>>('/products');
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat daftar produk.');
      }
      return res.data.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ProductPayload) => {
      if (editing) {
        const res = await apiClient.put<ApiResult<ProductItem>>(`/products/${editing.id}`, payload);
        if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal memperbarui produk.');
        return res.data;
      }
      const res = await apiClient.post<ApiResult<ProductItem>>('/products', payload);
      if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal menambah produk.');
      return res.data;
    },
    onSuccess: () => {
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    },
    onError: (err) => {
      Alert.alert('Gagal Menyimpan', getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete<ApiResult>(`/products/${id}`);
      if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal menghapus produk.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    },
    onError: (err) => {
      Alert.alert('Gagal Menghapus', getErrorMessage(err));
    },
  });

  const categories = useMemo(() => {
    const items = productsQuery.data ?? [];
    const unique = Array.from(new Set(items.map((p) => p.category).filter(Boolean)));
    return ['Semua', ...unique];
  }, [productsQuery.data]);

  const filteredProducts = useMemo(() => {
    const items = productsQuery.data ?? [];
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchCat = selectedCategory === 'Semua' || item.category === selectedCategory;
      if (!matchCat) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term)
      );
    });
  }, [productsQuery.data, search, selectedCategory]);

  const openCreateModal = () => {
    setEditing(null);
    setSku(`PRD-${Math.floor(100 + Math.random() * 900)}`);
    setName('');
    setCategory(CATEGORY_PRESETS[0]);
    setPriceText('1000000');
    setStockText('10');
    setStatus('Active');
    setDescription('');
    setModalOpen(true);
  };

  const openEditModal = (item: ProductItem) => {
    setEditing(item);
    setSku(item.sku);
    setName(item.name);
    setCategory(item.category);
    setPriceText(String(item.price));
    setStockText(String(item.stock));
    setStatus(item.status);
    setDescription(item.description || '');
    setModalOpen(true);
  };

  const handleSave = () => {
    const parsedPrice = Number(priceText.replace(/[^0-9.]/g, ''));
    const parsedStock = Number(stockText.replace(/[^0-9]/g, ''));

    if (!sku.trim() || !name.trim()) {
      Alert.alert('Validasi', 'SKU dan Nama Produk wajib diisi.');
      return;
    }
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert('Validasi', 'Harga harus berupa angka valid (>= 0).');
      return;
    }
    if (Number.isNaN(parsedStock) || parsedStock < 0) {
      Alert.alert('Validasi', 'Stok harus berupa angka valid (>= 0).');
      return;
    }

    saveMutation.mutate({
      sku: sku.trim(),
      name: name.trim(),
      category: category.trim() || 'Umum',
      description: description.trim(),
      price: parsedPrice,
      stock: parsedStock,
      status,
    });
  };

  const confirmDelete = (item: ProductItem) => {
    Alert.alert('Hapus Produk', `Yakin ingin menghapus "${item.name}" (${item.sku})?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(item.id),
      },
    ]);
  };

  const getStatusStyle = (val: string) => {
    switch (val.toLowerCase()) {
      case 'active':
        return { bg: colors.successLight, fg: colors.success };
      case 'inactive':
        return { bg: colors.dangerLight, fg: colors.danger };
      default:
        return { bg: colors.warningLight, fg: colors.warning };
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Katalog Produk</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Catalog.Api (:5082) • NetStarterPack_CatalogDb
            </Text>
          </View>
        </View>
        {canCreate ? (
          <Pressable
            onPress={openCreateModal}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Plus size={16} color={colors.primaryForeground} />
            <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Tambah</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Search & Category Filter */}
      <View style={styles.filterBlock}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Search size={17} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama produk, SKU, kategori..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? colors.primaryForeground : colors.textSecondary },
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Product List */}
      {productsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>Memuat produk...</Text>
        </View>
      ) : productsQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Katalog</Text>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            {getErrorMessage(productsQuery.error)}
          </Text>
          <Pressable
            onPress={() => void productsQuery.refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Coba Lagi</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={productsQuery.isRefetching}
              onRefresh={() => void productsQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Package size={32} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Tidak Ada Produk</Text>
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                Tidak ditemukan produk yang cocok dengan pencarian kamu.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const st = getStatusStyle(item.status);
            return (
              <View
                style={[
                  styles.productCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.skuPill, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.skuText, { color: colors.primary }]}>{item.sku}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.fg }]}>{item.status}</Text>
                  </View>
                </View>

                <Text style={[styles.productName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.productCat, { color: colors.textMuted }]}>{item.category}</Text>

                {item.description ? (
                  <Text numberOfLines={2} style={[styles.productDesc, { color: colors.textSecondary }]}>
                    {item.description}
                  </Text>
                ) : null}

                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <View>
                    <Text style={[styles.priceText, { color: colors.text }]}>
                      {formatCurrency(item.price)}
                    </Text>
                    <Text style={[styles.stockText, { color: colors.textSecondary }]}>
                      Stok: {item.stock} unit
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    {canEdit ? (
                      <Pressable
                        onPress={() => openEditModal(item)}
                        style={[styles.iconActionBtn, { backgroundColor: colors.infoLight }]}
                      >
                        <Pencil size={15} color={colors.info} />
                      </Pressable>
                    ) : null}
                    {canDelete ? (
                      <Pressable
                        onPress={() => confirmDelete(item)}
                        style={[styles.iconActionBtn, { backgroundColor: colors.dangerLight }]}
                      >
                        <Trash2 size={15} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
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
                {editing ? 'Edit Produk' : 'Tambah Produk Baru'}
              </Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>SKU</Text>
                <TextInput
                  value={sku}
                  onChangeText={setSku}
                  autoCapitalize="characters"
                  placeholder="PRD-001"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nama Produk</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enterprise Cloud Server..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Kategori</Text>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  placeholder="Cloud & Infrastructure"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
                  {CATEGORY_PRESETS.map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => setCategory(preset)}
                      style={[
                        styles.miniChip,
                        {
                          backgroundColor: category === preset ? colors.primaryLight : colors.surfaceMuted,
                          borderColor: category === preset ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.miniChipText,
                          { color: category === preset ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {preset}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.twoCol}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Harga (IDR)</Text>
                  <TextInput
                    value={priceText}
                    onChangeText={setPriceText}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                  />
                </View>

                <View style={[styles.fieldGroup, { width: 110 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Stok</Text>
                  <TextInput
                    value={stockText}
                    onChangeText={setStockText}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Status</Text>
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map((opt) => {
                    const active = status === opt;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setStatus(opt)}
                        style={[
                          styles.statusChoice,
                          {
                            backgroundColor: active ? colors.primary : colors.surfaceMuted,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusChoiceText,
                            { color: active ? colors.primaryForeground : colors.textSecondary },
                          ]}
                        >
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Deskripsi</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  placeholder="Catatan singkat spesifikasi produk..."
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    styles.textArea,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
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
                    {editing ? 'Simpan Perubahan' : 'Simpan Produk'}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  nodeLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerSub: { fontSize: 11, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addBtnText: { fontSize: 13, fontWeight: '700' },
  filterBlock: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14 },
  chipsRow: { gap: 8, paddingBottom: 4 },
  filterChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  listContent: { padding: 16, gap: 12, paddingBottom: 28 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  errorTitle: { fontSize: 16, fontWeight: '700' },
  stateText: { fontSize: 13, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, marginTop: 4 },
  emptyCard: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  productCard: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 15,
    gap: 6,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skuPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.sm },
  skuText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  productName: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  productCat: { fontSize: 12, fontWeight: '500' },
  productDesc: { fontSize: 12, lineHeight: 17 },
  cardFooter: {
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceText: { fontSize: 15, fontWeight: '800' },
  stockText: { fontSize: 12, marginTop: 1 },
  actionRow: { flexDirection: 'row', gap: 8 },
  iconActionBtn: {
    width: 36,
    height: 36,
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
    borderTopWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalForm: { gap: 12, paddingBottom: 20 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 74, textAlignVertical: 'top' },
  presetRow: { gap: 6, paddingTop: 4 },
  miniChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  miniChipText: { fontSize: 11, fontWeight: '600' },
  twoCol: { flexDirection: 'row', gap: 10 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusChoice: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: 'center',
  },
  statusChoiceText: { fontSize: 12, fontWeight: '700' },
  saveBtn: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700' },
});
