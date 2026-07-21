// Pack E E2/E3 — small hook: load async data + refresh on v5 events.
// Re-uses src/lib/bff/realtime.ts via onV5Event (Q15/Q22).

import { useEffect, useState, useCallback, useRef } from "react";
import { onV5Event } from "@/lib/v5";

interface UseV5LiveOptions {
  cacheKey?: string;
  staleMs?: number;
}

interface V5LiveCacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_CACHE_STALE_MS = 60_000;
const v5LiveCache = new Map<string, V5LiveCacheEntry<unknown>>();

function getCached<T>(cacheKey?: string): V5LiveCacheEntry<T> | undefined {
  if (!cacheKey) return undefined;
  return v5LiveCache.get(cacheKey) as V5LiveCacheEntry<T> | undefined;
}

export function __resetV5LiveCacheForTests(): void {
  v5LiveCache.clear();
}

export function useV5Live<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  opts: UseV5LiveOptions = {},
): {
  data: T | undefined;
  loading: boolean;
  error: any | null;
  refresh: () => void;
} {
  const cacheKey = opts.cacheKey;
  const staleMs = opts.staleMs ?? DEFAULT_CACHE_STALE_MS;
  const cached = getCached<T>(cacheKey);
  const [data, setData] = useState<T | undefined>(() => cached?.data);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState<any | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = useCallback((force = false) => {
    let alive = true;

    const fresh = getCached<T>(cacheKey);
    if (!force && fresh && fresh.expiresAt > Date.now()) {
      setData(fresh.data);
      setError(null);
      setLoading(false);
      return () => { alive = false; };
    }

    if (fresh) {
      setData(fresh.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    loaderRef.current()
      .then((d) => {
        if (cacheKey) {
          v5LiveCache.set(cacheKey, {
            data: d,
            expiresAt: Date.now() + staleMs,
          });
        }
        if (alive) {
          setData(d);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[useV5Live] loader failed", err);
        if (alive) {
          setError(err);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [cacheKey, staleMs]);


  useEffect(() => {
    const stop = refresh();
    const off = onV5Event(() => refresh(true));
    return () => { stop?.(); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refresh };
}

