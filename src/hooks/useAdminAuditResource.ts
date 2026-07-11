'use client';

import { useCallback, useEffect, useState } from 'react';
import { isAdminAccessError } from '@/lib/admin/adminAccess';

export interface AdminResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAdminAuditResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  onForbidden: () => void,
): AdminResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(current => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError(null);
    loader(controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setData(null);
        setLoading(false);
        if (isAdminAccessError(reason)) {
          onForbidden();
          return;
        }
        setError(reason instanceof Error ? reason.message : '管理员数据读取失败');
      });

    return () => controller.abort();
  }, [loader, revision, onForbidden]);

  return { data, loading, error, reload };
}
