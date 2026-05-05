// Phase 16 — realtime helpers for UI.
import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { realtime, type RealtimeStatus } from "@/lib/bff/realtime";

/**
 * Subscribe to realtime status (live/stale/offline) and last-event timestamp.
 */
export function useRealtimeStatus(): { status: RealtimeStatus; lastEventAt: number } {
  const status = useSyncExternalStore(
    (cb) => {
      const off1 = realtime.onStatus(cb);
      // also tick when stale check might flip
      const t = setInterval(cb, 5_000);
      return () => { off1(); clearInterval(t); };
    },
    () => realtime.getStatus(),
    () => "live" as RealtimeStatus,
  );
  const lastEventAt = useSyncExternalStore(
    (cb) => realtime.onStatus(cb),
    () => realtime.getLastEventAt(),
    () => Date.now(),
  );
  return { status, lastEventAt };
}

/**
 * Auto-refetching list bound to a realtime "data" topic kind.
 * Returns rows + a `pending` count for "N new updates" banners.
 *
 * - `loader`   — async fetcher (typically a stable bff.* call)
 * - `kinds`    — which `data:{kind}` events should trigger refresh
 * - `auto`     — when true (default), refetch immediately. When false, only
 *                bumps the pending counter so the user can click to apply.
 */
export function useLiveList<T>(
  loader: () => Promise<T[]>,
  kinds: string[],
  opts: { auto?: boolean } = {},
): { rows: T[]; pending: number; refresh: () => void } {
  const auto = opts.auto ?? true;
  const [rows, setRows] = useState<T[]>([]);
  const [pending, setPending] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = () => {
    void loaderRef.current().then((next) => {
      setRows(next);
      setPending(0);
    });
  };

  useEffect(() => {
    refresh();
    const off = realtime.on("data", (p) => {
      const kind = (p as { kind?: string } | undefined)?.kind;
      if (!kind) return;
      if (kind !== "*" && !kinds.includes(kind)) return;
      if (auto) {
        void loaderRef.current().then(setRows);
      } else {
        setPending((n) => n + 1);
      }
    });
    return () => { off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join("|"), auto]);

  return { rows, pending, refresh };
}
