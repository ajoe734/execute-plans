// Pack E E2/E3 — small hook: load async data + refresh on v5 events.
// onV5Event is owned by src/lib/bff-v1/v5.ts, the live V5 API owner
// (ACG-03-014/015); backed by TanStack Query with scoped query keys.

import { useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { onV5Event } from "@/lib/bff-v1";
import { getSharedQueryClient, queryKeys, resetSharedQueryClientForTests } from "@/lib/bff-v1/queryKeys";

export interface UseV5LiveOptions {
  cacheKey?: string;
  staleMs?: number;
}

export const DEFAULT_CACHE_STALE_MS = 60_000;

function useClient(): QueryClient {
  try {
    return useQueryClient();
  } catch {
    return getSharedQueryClient();
  }
}

export function __resetV5LiveCacheForTests(): void {
  resetSharedQueryClientForTests();
}

export function useV5Live<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  opts: UseV5LiveOptions = {},
): {
  data: T | undefined;
  loading: boolean;
  error: unknown | null;
  refresh: () => void;
} {
  const queryClient = useClient();
  const cacheKey = opts.cacheKey;
  const staleMs = opts.staleMs ?? DEFAULT_CACHE_STALE_MS;

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const queryKey = queryKeys.resource(
    cacheKey || "v5.live.anonymous",
    deps,
  );

  const query = useQuery<T>(
    {
      queryKey,
      queryFn: async () => {
        return await loaderRef.current();
      },
      staleTime: staleMs,
    },
    queryClient,
  );

  const refresh = useCallback((force = false) => {
    if (force) {
      void queryClient.invalidateQueries({ queryKey });
    } else {
      void query.refetch();
    }
  }, [query, queryClient, queryKey]);

  useEffect(() => {
    const off = onV5Event(() => {
      void queryClient.invalidateQueries({ queryKey });
    });
    return () => {
      off();
    };
  }, [queryClient, queryKey]);

  const loading = query.isLoading;
  return {
    data: query.data,
    loading,
    error: query.error ?? null,
    refresh,
  };
}
