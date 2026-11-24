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
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react-native';
import { apiClient, getErrorMessage } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/authStore';
import { useTheme } from '@/core/theme/themeStore';
import { radius } from '@/core/theme/tokens';
import type { ApiResult, OrderItem, OrderStats, ProductItem } from '@/core/types';
import { formatCurrency, formatShortDate } from '@/shared/utils/formatters';

const ORDER_STATUSES = ['Pending', 'Processing', 'Completed', 'Cancelled'];

interface OrderPayload {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  status: string;
  notes: string;
}

export default function OrdersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canCreate = hasPermission('Orders.Create');
  const canEdit = hasPermission('Orders.Edit');
  const canDelete = hasPermission('Orders.Delete');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [productSku, setProductSku] = useState('');
  const [productName, setProductName] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [unitPriceText, setUnitPriceText] = useState('0');
  const [status, setStatus] = useState('Pending');
  const [notes, setNotes] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<OrderItem[]>>('/orders');
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat daftar pesanan.');
      }
      return res.data.data;
    },
  });

  const statsQuery = useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<OrderStats>>('/orders/stats');
      return res.data.succeeded ? res.data.data ?? null : null;
    },
  });

  // Ambil daftar produk dari Catalog.Api (:5082) untuk quick-select di form order
  const catalogQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<ProductItem[]>>('/products');
      return res.data.succeeded && res.data.data ? res.data.data : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: OrderPayload) => {
      if (editing) {
        const res = await apiClient.put<ApiResult<OrderItem>>(`/orders/${editing.id}`, payload);
        if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal memperbarui pesanan.');
        return res.data;
      }
      const res = await apiClient.post<ApiResult<OrderItem>>('/orders', payload);
      if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal membuat pesanan.');
      return res.data;
    },
    onSuccess: () => {
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'stats'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    },
    onError: (err) => {
      Alert.alert('Gagal Menyimpan', getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete<ApiResult>(`/orders/${id}`);
      if (!res.data.succeeded) throw new Error(res.data.message || 'Gagal menghapus pesanan.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'stats'] });
    },
    onError: (err) => {
      Alert.alert('Gagal Menghapus', getErrorMessage(err));
    },
  });

  const filteredOrders = useMemo(() => {
    const items = ordersQuery.data ?? [];
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchStatus = statusFilter === 'Semua' || item.status === statusFilter;
      if (!matchStatus) return false;
      if (!term) return true;
      return (
        item.orderNumber.toLowerCase().includes(term) ||
        item.customerName.toLowerCase().includes(term) ||
        item.productName.toLowerCase().includes(term) ||
        item.productSku.toLowerCase().includes(term)
      );
    });
  }, [ordersQuery.data, search, statusFilter]);

  const parsedQty = Math.max(0, Number(quantityText.replace(/[^0-9]/g, '')) || 0);
  const parsedPrice = Math.max(0, Number(unitPriceText.replace(/[^0-9.]/g, '')) || 0);
  const liveTotal = parsedQty * parsedPrice;

  const openCreateModal = () => {
    const defaultProd = catalogQuery.data?.[0];
    setEditing(null);
    setOrderNumber(`ORD-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setCustomerName('');
    setCustomerEmail('');
    setProductSku(defaultProd?.sku || 'PRD-001');
    setProductName(defaultProd?.name || '');
    setQuantityText('1');
    setUnitPriceText(String(defaultProd?.price ?? 1000000));
    setStatus('Pending');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (item: OrderItem) => {
    setEditing(item);
    setOrderNumber(item.orderNumber);
    setCustomerName(item.customerName);
    setCustomerEmail(item.customerEmail);
    setProductSku(item.productSku);
    setProductName(item.productName);
    setQuantityText(String(item.quantity));
    setUnitPriceText(String(item.unitPrice));
    setStatus(item.status);
    setNotes(item.notes || '');
    setModalOpen(true);
  };

  const selectCatalogProduct = (prod: ProductItem) => {
    setProductSku(prod.sku);
    setProductName(prod.name);
    setUnitPriceText(String(prod.price));
  };

  const handleSave = () => {
    if (!orderNumber.trim() || !customerName.trim() || !productName.trim()) {
      Alert.alert('Validasi', 'No. Order, Nama Customer, dan Nama Produk wajib diisi.');
      return;
    }
    if (parsedQty <= 0) {
      Alert.alert('Validasi', 'Quantity harus minimal 1.');
      return;
    }

    saveMutation.mutate({
      orderNumber: orderNumber.trim(),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      productSku: productSku.trim() || 'SKU-CUSTOM',
      productName: productName.trim(),
      quantity: parsedQty,
      unitPrice: parsedPrice,
      status,
      notes: notes.trim(),
    });
  };

  const confirmDelete = (item: OrderItem) => {
    Alert.alert('Hapus Pesanan', `Hapus "${item.orderNumber}" milik ${item.customerName}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(item.id),
      },
    ]);
  };

  const getStatusStyle = (val: string) => {
    switch (val) {
      case 'Completed':
        return { bg: colors.successLight, fg: colors.success };
      case 'Processing':
        return { bg: colors.infoLight, fg: colors.info };
      case 'Cancelled':
        return { bg: colors.dangerLight, fg: colors.danger };
      default:
        return { bg: colors.warningLight, fg: colors.warning };
    }
  };

  const handleRefresh = () => {
    void Promise.all([ordersQuery.refetch(), statsQuery.refetch()]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Transaksi Pesanan</Text>
          <View style={styles.nodeLine}>
            <Database size={11} color={colors.primary} />
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Order.Api (:5083) • NetStarterPack_OrderDb
            </Text>
          </View>
        </View>
        {canCreate ? (
          <Pressable
            onPress={openCreateModal}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Plus size={16} color={colors.primaryForeground} />
            <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Order</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Stats Strip */}
      <View style={styles.statsRow}>
        <View style={[styles.statMiniCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {statsQuery.data?.totalOrders ?? 0}
          </Text>
        </View>
        <View style={[styles.statMiniCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.warning }]}>Pending</Text>
          <Text style={[styles.statValue, { color: colors.warning }]}>
            {statsQuery.data?.pendingOrders ?? 0}
          </Text>
        </View>
        <View style={[styles.statMiniCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.success }]}>Selesai</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {statsQuery.data?.completedOrders ?? 0}
          </Text>
        </View>
        <View style={[styles.statMiniCardWide, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Revenue</Text>
          <Text numberOfLines={1} style={[styles.statMoney, { color: colors.primary }]}>
            {formatCurrency(statsQuery.data?.totalRevenue)}
          </Text>
        </View>
      </View>

      {/* Search & Status Filter */}
      <View style={styles.filterBlock}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={17} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari no. order, customer, produk..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {['Semua', ...ORDER_STATUSES].map((st) => {
            const active = statusFilter === st;
            return (
              <Pressable
                key={st}
                onPress={() => setStatusFilter(st)}
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
                  {st}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Orders List */}
      {ordersQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>Memuat pesanan...</Text>
        </View>
      ) : ordersQuery.error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>Gagal Memuat Pesanan</Text>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            {getErrorMessage(ordersQuery.error)}
          </Text>
          <Pressable onPress={handleRefresh} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Coba Lagi</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={ordersQuery.isRefetching || statsQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ShoppingCart size={32} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum Ada Pesanan</Text>
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                Tidak ada data pesanan yang cocok dengan filter saat ini.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusStyle(item.status);
            return (
              <View style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTopRow}>
                  <View style={[styles.orderNoPill, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.orderNoText, { color: colors.primary }]}>
                      {item.orderNumber}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusText, { color: badge.fg }]}>{item.status}</Text>
                  </View>
                </View>

                <Text style={[styles.customerName, { color: colors.text }]}>{item.customerName}</Text>
                {item.customerEmail ? (
                  <Text style={[styles.customerEmail, { color: colors.textMuted }]}>
                    {item.customerEmail}
                  </Text>
                ) : null}

                <View style={[styles.productSummaryBox, { backgroundColor: colors.surfaceMuted }]}>
                  <Text numberOfLines={1} style={[styles.productLine, { color: colors.text }]}>
                    {item.productName}
                  </Text>
                  <Text style={[styles.qtyLine, { color: colors.textSecondary }]}>
                    {item.productSku} • {item.quantity} × {formatCurrency(item.unitPrice)}
                  </Text>
                </View>

                {item.notes ? (
                  <Text numberOfLines={2} style={[styles.notesText, { color: colors.textSecondary }]}>
                    Catatan: {item.notes}
                  </Text>
                ) : null}

                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <View>
                    <Text style={[styles.totalText, { color: colors.text }]}>
                      {formatCurrency(item.totalAmount)}
                    </Text>
                    <Text style={[styles.dateText, { color: colors.textMuted }]}>
                      {formatShortDate(item.createdAt)}
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

      {/* Create / Edit Order Modal */}
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
                {editing ? 'Edit Pesanan' : 'Buat Pesanan Baru'}
              </Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>No. Pesanan</Text>
                <TextInput
                  value={orderNumber}
                  onChangeText={setOrderNumber}
                  autoCapitalize="characters"
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nama Customer</Text>
                <TextInput
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="PT Maju Jaya"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email Customer</Text>
                <TextInput
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="procurement@majujaya.co.id"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                />
              </View>

              {/* Quick Pick Product from Catalog.Api */}
              {catalogQuery.data && catalogQuery.data.length > 0 ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Pilih Cepat dari Katalog (Catalog.Api)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
                    {catalogQuery.data.map((prod) => {
                      const selected = productSku === prod.sku;
                      return (
                        <Pressable
                          key={prod.id}
                          onPress={() => selectCatalogProduct(prod)}
                          style={[
                            styles.miniChip,
                            {
                              backgroundColor: selected ? colors.primaryLight : colors.surfaceMuted,
                              borderColor: selected ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.miniChipText,
                              { color: selected ? colors.primary : colors.textSecondary },
                            ]}
                          >
                            {prod.sku} • {prod.name.slice(0, 22)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nama Produk</Text>
                <TextInput
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="Nama item yang dipesan"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                />
              </View>

              <View style={styles.twoCol}>
                <View style={[styles.fieldGroup, { width: 95 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Qty</Text>
                  <TextInput
                    value={quantityText}
                    onChangeText={setQuantityText}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Harga Satuan (IDR)</Text>
                  <TextInput
                    value={unitPriceText}
                    onChangeText={setUnitPriceText}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
                  />
                </View>
              </View>

              {/* Live Total Box */}
              <View style={[styles.totalBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                <Text style={[styles.totalBoxLabel, { color: colors.primary }]}>
                  Estimasi Total Otomatis
                </Text>
                <Text style={[styles.totalBoxValue, { color: colors.primary }]}>
                  {formatCurrency(liveTotal)}
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Status Pesanan</Text>
                <View style={styles.statusRow}>
                  {ORDER_STATUSES.map((opt) => {
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
                          numberOfLines={1}
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
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Catatan</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                  placeholder="Catatan tambahan..."
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
                    {editing ? 'Simpan Perubahan' : 'Simpan Pesanan'}
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
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statMiniCard: {
    width: '19%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statMiniCardWide: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  statLabel: { fontSize: 10, fontWeight: '600' },
  statValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  statMoney: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  filterBlock: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
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
  orderCard: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 15,
    gap: 6,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNoPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.sm },
  orderNoText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  customerName: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  customerEmail: { fontSize: 12 },
  productSummaryBox: {
    borderRadius: radius.md,
    padding: 10,
    gap: 2,
    marginTop: 4,
  },
  productLine: { fontSize: 13, fontWeight: '700' },
  qtyLine: { fontSize: 12 },
  notesText: { fontSize: 12, fontStyle: 'italic' },
  cardFooter: {
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalText: { fontSize: 15, fontWeight: '800' },
  dateText: { fontSize: 11, marginTop: 1 },
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
    maxHeight: '90%',
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
  textArea: { minHeight: 64, textAlignVertical: 'top' },
  presetRow: { gap: 6, paddingTop: 2 },
  miniChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  miniChipText: { fontSize: 11, fontWeight: '600' },
  twoCol: { flexDirection: 'row', gap: 10 },
  totalBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalBoxLabel: { fontSize: 12, fontWeight: '700' },
  totalBoxValue: { fontSize: 16, fontWeight: '800' },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusChoice: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  statusChoiceText: { fontSize: 11, fontWeight: '700' },
  saveBtn: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700' },
});
