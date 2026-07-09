// Pack E E2/E3 — small hook: load async data + refresh on v5 events.
// Re-uses src/lib/bff/realtime.ts via onV5Event (Q15/Q22).

import { useEffect, useState, useCallback, useRef } from "react";
import { onV5Event } from "@/lib/v5";

export function useV5Live<T>(loader: () => Promise<T>, deps: unknown[] = []): {
  data: T | undefined;
  loading: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = useCallback(() => {
    let alive = true;
    setLoading(true);
    loaderRef.current()
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[useV5Live] loader failed", err);
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);


  useEffect(() => {
    const stop = refresh();
    const off = onV5Event(() => refresh());
    return () => { stop?.(); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, refresh };
}
