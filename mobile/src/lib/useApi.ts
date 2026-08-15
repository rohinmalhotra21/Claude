import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '../api/client';

interface Options {
  /** Re-fetch whenever the screen regains focus. */
  refetchOnFocus?: boolean;
  /** Skip the request entirely (e.g. a trainer with no client selected). */
  enabled?: boolean;
}

/**
 * Minimal data-fetching hook: load, refresh, error, and pull-to-refresh state.
 * The app's screens are all "fetch one payload and render it", so this is all
 * the caching machinery they need.
 */
export function useApi<T>(
  path: string | null,
  query?: Record<string, string | number | boolean | undefined | null>,
  options: Options = {},
) {
  const { refetchOnFocus = true, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Serialised so the identity is stable across renders with equal values.
  const queryKey = JSON.stringify(query ?? {});

  const load = useCallback(
    async (isRefresh = false) => {
      if (!path || !enabled) {
        setLoading(false);
        setData(null);
        return;
      }

      if (isRefresh) setRefreshing(true);
      setError(null);

      try {
        const result = await api<T>(path, { query: JSON.parse(queryKey) as Record<string, string> });
        setData(result);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path, queryKey, enabled],
  );

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus) void load();
    }, [load, refetchOnFocus]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => load(true),
    reload: () => load(),
  };
}
