import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../services/api';
import type { ApiResult, LookupItem } from '../types';

interface UseLookupOptions {
  activeOnly?: boolean;
  parentId?: string;
  enabled?: boolean;
}

/**
 * Reusable hook untuk mengambil daftar item lookup dari MasterData.Api (:5086)
 * berdasarkan GroupCode (misal: 'PRODUCT_CATEGORY', 'UNIT_OF_MEASURE', 'PAYMENT_METHOD').
 */
export function useLookup(groupCode: string, options: UseLookupOptions = {}) {
  const { activeOnly = true, parentId, enabled = true } = options;
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLookup = useCallback(async () => {
    if (!enabled || !groupCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResult<LookupItem[]>>('/lookups', {
        params: {
          groupCode,
          activeOnly,
          parentId: parentId || undefined,
        },
      });
      if (res.data.succeeded && res.data.data) {
        setItems(res.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err, `Gagal memuat lookup ${groupCode}.`));
    } finally {
      setLoading(false);
    }
  }, [groupCode, activeOnly, parentId, enabled]);

  useEffect(() => {
    fetchLookup();
  }, [fetchLookup]);

  return { items, loading, error, reload: fetchLookup };
}

/**
 * Reusable hook untuk mengambil beberapa grup lookup sekaligus dalam 1 HTTP request (/api/lookups/batch).
 */
export function useLookups(groupCodes: string[], activeOnly = true) {
  const key = groupCodes.map((g) => g.trim().toUpperCase()).filter(Boolean).sort().join(',');
  const [data, setData] = useState<Record<string, LookupItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBatch = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResult<Record<string, LookupItem[]>>>('/lookups/batch', {
        params: { groups: key, activeOnly },
      });
      if (res.data.succeeded && res.data.data) {
        setData(res.data.data);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memuat batch lookup.'));
    } finally {
      setLoading(false);
    }
  }, [key, activeOnly]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  return { data, loading, error, reload: fetchBatch };
}
