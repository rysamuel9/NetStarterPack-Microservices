import React, { useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { api } from '../../services/api';
import type { ApiResult, AuditLogItem } from '../../types';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ApiResult<AuditLogItem[]>>('/dashboard/audit-logs?limit=150')
      .then((res) => {
        if (res.data.succeeded && res.data.data) setLogs(res.data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(
    (l) =>
      l.userName.toLowerCase().includes(filter.toLowerCase()) ||
      l.action.toLowerCase().includes(filter.toLowerCase()) ||
      l.module.toLowerCase().includes(filter.toLowerCase()) ||
      l.details.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit Trail & Log Keamanan</h1>
        <p className="text-sm text-slate-500">
          Rekam jejak otomatis untuk aktivitas login, perubahan pengguna, role, menu, dan data
          bisnis.
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter berdasarkan aksi (LOGIN, CREATE_USER, UPDATE_ROLE), modul, atau username..."
          className="w-full text-sm focus:outline-none"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                <th className="py-3.5 px-4">Waktu</th>
                <th className="py-3.5 px-4">Pengguna</th>
                <th className="py-3.5 px-4">Modul & Aksi</th>
                <th className="py-3.5 px-4">Detail Aktivitas</th>
                <th className="py-3.5 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    Memuat riwayat audit log...
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{log.userName}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700">
                        <Activity className="w-3 h-3" />
                        {log.module} • {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{log.details}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">
                      {log.ipAddress || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
