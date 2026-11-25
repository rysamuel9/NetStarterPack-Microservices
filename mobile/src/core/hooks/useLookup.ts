import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type { ApiResult, LookupItem } from '@/core/types';

export type { LookupItem };

/**
 * Reusable React Query hook untuk mengambil daftar item lookup dari MasterData.Api (:5086)
 * berdasarkan GroupCode (misal 'PRODUCT_CATEGORY', 'UNIT_OF_MEASURE', 'PAYMENT_METHOD').
 */
export function useLookup(groupCode: string, activeOnly = true, parentId?: string) {
  return useQuery({
    queryKey: ['lookups', groupCode.toUpperCase(), activeOnly, parentId ?? null],
    enabled: Boolean(groupCode.trim()),
    staleTime: 1000 * 60 * 10, // 10 menit (data referensi jarang berubah)
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<LookupItem[]>>('/lookups', {
        params: {
          groupCode,
          activeOnly,
          parentId: parentId || undefined,
        },
      });
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || `Gagal memuat lookup ${groupCode}.`);
      }
      return res.data.data;
    },
  });
}

/**
 * Mengambil beberapa grup lookup sekaligus dalam 1 HTTP request (/api/lookups/batch).
 */
export function useLookups(groupCodes: string[], activeOnly = true) {
  const key = groupCodes.map((g) => g.trim().toUpperCase()).filter(Boolean).sort().join(',');

  return useQuery({
    queryKey: ['lookups', 'batch', key, activeOnly],
    enabled: Boolean(key),
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const res = await apiClient.get<ApiResult<Record<string, LookupItem[]>>>('/lookups/batch', {
        params: { groups: key, activeOnly },
      });
      if (!res.data.succeeded || !res.data.data) {
        throw new Error(res.data.message || 'Gagal memuat batch lookup.');
      }
      return res.data.data;
    },
  });
}
