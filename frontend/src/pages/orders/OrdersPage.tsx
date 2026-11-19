import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ShoppingCart,
  X,
  Database,
  ExternalLink,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import type { ApiResult, OrderItem, OrderStats, ProductItem } from '../../types';

export const OrdersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('Orders.Create');
  const canEdit = hasPermission('Orders.Edit');
  const canDelete = hasPermission('Orders.Delete');

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [form, setForm] = useState({
    orderNumber: '',
    customerName: '',
    customerEmail: '',
    productSku: '',
    productName: '',
    quantity: 1,
    unitPrice: 0,
    status: 'Pending',
    notes: '',
  });

  const fetchOrdersAndStats = async (searchTerm = '', statusTerm = '') => {
    if (orders.length === 0) setLoading(true);
    try {
      const [ordersRes, statsRes] = await Promise.all([
        api.get<ApiResult<OrderItem[]>>('/orders', {
          params: {
            search: searchTerm || undefined,
            status: statusTerm || undefined,
          },
        }),
        api.get<ApiResult<OrderStats>>('/orders/stats'),
      ]);

      if (ordersRes.data.succeeded && ordersRes.data.data) {
        setOrders(ordersRes.data.data);
      }
      if (statsRes.data.succeeded && statsRes.data.data) {
        setStats(statsRes.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersAndStats();
    // Ambil daftar produk dari Catalog.Api (:5082) untuk pilihan dropdown saat buat pesanan baru
    api
      .get<ApiResult<ProductItem[]>>('/products')
      .then((res) => {
        if (res.data.succeeded && res.data.data) {
          setCatalogProducts(res.data.data);
        }
      })
      .catch(() => {});
  }, []);

  const filteredOrders = orders.filter((item) => {
    const matchStatus = !statusFilter || item.status === statusFilter;
    if (!search.trim()) return matchStatus;
    const term = search.trim().toLowerCase();
    const matchSearch =
      item.orderNumber.toLowerCase().includes(term) ||
      item.customerName.toLowerCase().includes(term) ||
      item.productName.toLowerCase().includes(term) ||
      item.productSku.toLowerCase().includes(term);
    return matchStatus && matchSearch;
  });

  const openCreateModal = () => {
    setEditing(null);
    const defaultProd = catalogProducts[0];
    setForm({
      orderNumber: `ORD-2026-${Math.floor(100 + Math.random() * 900)}`,
      customerName: '',
      customerEmail: '',
      productSku: defaultProd?.sku || 'PRD-CLOUD-001',
      productName: defaultProd?.name || 'Enterprise Cloud Server Instance (8 vCPU / 32GB)',
      quantity: 1,
      unitPrice: defaultProd?.price || 2450000,
      status: 'Pending',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (item: OrderItem) => {
    setEditing(item);
    setForm({
      orderNumber: item.orderNumber,
      customerName: item.customerName,
      customerEmail: item.customerEmail,
      productSku: item.productSku,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      status: item.status,
      notes: item.notes,
    });
    setModalOpen(true);
  };

  const handleSelectCatalogProduct = (sku: string) => {
    const found = catalogProducts.find((p) => p.sku === sku);
    if (found) {
      setForm({
        ...form,
        productSku: found.sku,
        productName: found.name,
        unitPrice: found.price,
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/orders/${editing.id}`, form);
      } else {
        await api.post('/orders', form);
      }
      setModalOpen(false);
      await fetchOrdersAndStats();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDelete = async (item: OrderItem) => {
    if (!window.confirm(`Hapus pesanan "${item.orderNumber}" milik ${item.customerName}?`)) return;
    setError(null);
    try {
      await api.delete(`/orders/${item.id}`);
      await fetchOrdersAndStats();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Processing':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'Cancelled':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Identitas Microservice Node */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-5 text-white border border-teal-800/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              NODE: Order.Api (:5083)
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-cyan-300 border border-slate-700 flex items-center gap-1">
              <Database className="w-3 h-3" /> NetStarterPack_OrderDb
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Customization Guide Example 2
            </span>
          </div>
          <h1 className="text-xl font-bold">Transaksi Pesanan (Order Microservice)</h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Microservice ke-3 yang punya database sendiri, mengambil referensi produk dari{' '}
            <code>Catalog.Api (:5082)</code>, dan mem-publish event audit ke{' '}
            <code>Identity.Api (:5081)</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="http://localhost:5083/swagger"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-xs font-semibold"
          >
            <span>Swagger :5083</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-teal-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Pesanan Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Ringkasan Statistik Order.Api */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Transaksi (OrderDb)</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats?.totalOrders ?? orders.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Nilai Pesanan Aktif</p>
            <p className="text-xl font-bold text-teal-700 mt-0.5">
              {formatCurrency(stats?.totalRevenue ?? 0)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Status Penyelesaian</p>
            <p className="text-sm font-bold text-slate-800 mt-1">
              <span className="text-emerald-600">{stats?.completedOrders ?? 0} Completed</span> •{' '}
              <span className="text-amber-600">{stats?.pendingOrders ?? 0} In-Progress</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor order (ORD-...), nama pelanggan, atau SKU produk..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white text-slate-700"
        >
          <option value="">Semua Status</option>
          <option value="Pending">Pending</option>
          <option value="Processing">Processing</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Tabel Orders */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <th className="py-3.5 px-4">No. Order &amp; Pelanggan</th>
                <th className="py-3.5 px-4">Item Produk (Catalog Ref)</th>
                <th className="py-3.5 px-4">Qty &times; Harga</th>
                <th className="py-3.5 px-4">Total Tagihan</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    Memuat transaksi pesanan dari Order.Api (:5083)...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    Tidak ada transaksi pesanan ditemukan.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((item) => (
                  <tr key={item.id} className="hover:bg-teal-50/30">
                    <td className="py-3.5 px-4">
                      <span className="text-[11px] font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                        {item.orderNumber}
                      </span>
                      <p className="font-semibold text-slate-900 mt-1">{item.customerName}</p>
                      <p className="text-xs text-slate-500">{item.customerEmail}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[11px] font-mono text-slate-500">{item.productSku}</span>
                      <p className="font-medium text-slate-800">{item.productName}</p>
                      {item.notes && <p className="text-xs text-slate-400 italic mt-0.5">{item.notes}</p>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      <strong>{item.quantity} unit</strong> &times; {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {formatCurrency(item.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => openEditModal(item)}
                            title="Ubah Pesanan"
                            className="p-2 rounded-lg text-slate-600 hover:bg-teal-50 hover:text-teal-700"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(item)}
                            title="Hapus Pesanan"
                            className="p-2 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {!canEdit && !canDelete && (
                          <span className="text-xs text-slate-400 italic">Read-only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create / Edit Order */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editing ? 'Ubah Transaksi Pesanan' : 'Buat Pesanan Baru (Order.Api :5083)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Tersimpan di <code>NetStarterPack_OrderDb</code> &amp; kirim event ke Identity.Api
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nomor Order</label>
                  <input
                    type="text"
                    required
                    value={form.orderNumber}
                    onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Status Order</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Processing">Processing</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nama Pelanggan / Perusahaan
                  </label>
                  <input
                    type="text"
                    required
                    value={form.customerName}
                    onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                    placeholder="PT Nusantara Cloud"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Email Pelanggan
                  </label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                    placeholder="billing@company.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              {catalogProducts.length > 0 && (
                <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80">
                  <label className="block text-xs font-semibold text-teal-800 mb-1">
                    Pilih Produk dari Catalog.Api (:5082) — Otomatis Isi SKU &amp; Harga
                  </label>
                  <select
                    value={form.productSku}
                    onChange={(e) => handleSelectCatalogProduct(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-teal-300 text-xs bg-white text-slate-800"
                  >
                    {catalogProducts.map((p) => (
                      <option key={p.id} value={p.sku}>
                        [{p.sku}] {p.name} — {formatCurrency(p.price)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">SKU Produk</label>
                  <input
                    type="text"
                    required
                    value={form.productSku}
                    onChange={(e) => setForm({ ...form, productSku: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Produk</label>
                  <input
                    type="text"
                    required
                    value={form.productName}
                    onChange={(e) => setForm({ ...form, productName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Qty</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Harga Satuan
                  </label>
                  <input
                    type="number"
                    required
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Total Tagihan
                  </label>
                  <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-teal-700 truncate">
                    {formatCurrency(form.quantity * form.unitPrice)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Catatan pengiriman atau nomor PO..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm font-semibold"
                >
                  Simpan Pesanan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
