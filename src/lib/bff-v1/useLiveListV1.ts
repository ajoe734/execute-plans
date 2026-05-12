// BFF Contract v1 — envelope-aware live list hook.
// Drop-in replacement for `useLiveList` with `ListEnvelope<T>` semantics:
// returns `items`, `pageSize`, `estimatedTotal`, `totalCountExact` plus the
// existing realtime `pending` / `refresh` ergonomics.
//
// Internally still subscribes to the legacy realtime bus; once the BFF
// SSE bridge replaces it (VI-3+), only this hook needs swapping.

import { useEffect, useRef, useState } from "react";
import { realtime } from "@/lib/bff/realtime";
import type { ListEnvelope } from "./dto";

export interface UseLiveListV1Result<T> {
  items: T[];
  pending: number;
  pageSize: number;
  estimatedTotal?: number;
  totalCountExact: boolean;
  meta?: unknown;
  refresh: () => void;
  loading: boolean;
}

export function useLiveListV1<T>(
  loader: () => Promise<ListEnvelope<T>>,
  kinds: string[],
  opts: { auto?: boolean } = {},
): UseLiveListV1Result<T> {
  const auto = opts.auto ?? true;
  const [env, setEnv] = useState<ListEnvelope<T>>({
    items: [], cursor: {}, pageSize: 0, totalCountExact: true,
  });
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = () => {
    setLoading(true);
    void loaderRef.current().then((next) => {
      setEnv(next);
      setPending(0);
      setLoading(false);
    });
  };

  useEffect(() => {
    refresh();
    const off = realtime.on("data", (p) => {
      const kind = (p as { kind?: string } | undefined)?.kind;
      if (!kind) return;
      if (kind !== "*" && !kinds.includes(kind)) return;
      if (auto) {
        void loaderRef.current().then((next) => setEnv(next));
      } else {
        setPending((n) => n + 1);
      }
    });
    return () => { off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join("|"), auto]);

  return {
    items: env.items,
    pending,
    pageSize: env.pageSize,
    estimatedTotal: env.estimatedTotal,
    totalCountExact: env.totalCountExact,
    meta: env.meta,
    refresh,
    loading,
  };
}
