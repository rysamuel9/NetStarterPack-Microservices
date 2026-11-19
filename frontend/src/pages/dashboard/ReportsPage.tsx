import React, { useEffect, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import type { ApiResult, ProductItem } from '../../types';

export const ReportsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('Reports.Export');
  const [products, setProducts] = useState<ProductItem[]>([]);

  useEffect(() => {
    api.get<ApiResult<ProductItem[]>>('/products').then((res) => {
      if (res.data.succeeded && res.data.data) setProducts(res.data.data);
    });
  }, []);

  const byCategory = products.reduce<Record<string, { count: number; value: number }>>(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = { count: 0, value: 0 };
      acc[item.category].count += 1;
      acc[item.category].value += item.price * item.stock;
      return acc;
    },
    {}
  );

  const exportCsv = () => {
    const header = 'SKU,Name,Category,Price,Stock,TotalValue,Status\n';
    const rows = products
      .map(
        (p) =>
          `"${p.sku}","${p.name}","${p.category}",${p.price},${p.stock},${p.price * p.stock},"${
            p.status
          }"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-katalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contoh Halaman Laporan</h1>
          <p className="text-sm text-slate-500">
            Halaman contoh buat ngetes pembatasan role. Secara default halaman ini cuma kebuka buat
            role yang punya permission <code>Reports.View</code> (SuperAdmin, Admin, Manager).
          </p>
        </div>
        {canExport && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Download CSV</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(byCategory).map(([cat, stats]) => (
          <div
            key={cat}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase">
                <BarChart3 className="w-4 h-4" />
                <span>Kategori Katalog</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">{cat}</h3>
              <p className="text-xs text-slate-500 mt-1">{stats.count} jenis produk terdaftar</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Estimasi Nilai Aset</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(stats.value)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
