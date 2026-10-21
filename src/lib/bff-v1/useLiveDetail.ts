// BFF Contract v1 — shared live detail load-state hook.
//
// Distinguishes `loading`, `ready`, `not-found`, and `error` for Management
// detail pages that load an entity by `id`, preventing pages from hanging on
// an endless loading state when a detail request returns 404, resolves to
// `undefined`, or fails with a 5xx / transport error.

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { BffError } from "./errors";
import { liveStatus } from "./liveStatus";
import { detectFallbackMode } from "./liveTransport";
import { realtime } from "./sse/bridge";

export type DetailLoadState = "loading" | "ready" | "not-found" | "error";

export interface UseLiveDetailOptions {
  /** Realtime `data:{kind}` events that should trigger a refresh. */
  kinds?: string[];
  /** When true (default), matching realtime events refetch immediately. */
  auto?: boolean;
}

export interface UseLiveDetailResult<T> {
  data: T | undefined;
  item: T | undefined;
  state: DetailLoadState;
  status: DetailLoadState;
  loadState: DetailLoadState;
  loading: boolean;
  notFound: boolean;
  isError: boolean;
  error: string | undefined;
  errorObject: unknown;
  pending: number;
  refresh: () => Promise<T | undefined>;
  setData: Dispatch<SetStateAction<T | undefined>>;
}

/**
 * Classify whether a rejected detail read represents a 404 / resource-not-found
 * condition rather than a 5xx or transport failure.
 */
export function isNotFoundError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object") {
    const record = err as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    const code = typeof record.code === "string" ? record.code.trim().toUpperCase() : "";
    if (code === "RESOURCE_NOT_FOUND" || code === "NOT_FOUND") {
      return true;
    }
    const msg = typeof record.message === "string" ? record.message : "";
    if (/\bHTTP\s+404\b/i.test(msg)) {
      return true;
    }
    if (/\bHTTP\s+[45]\d\d\b/i.test(msg)) {
      return false;
    }
    if (record.status === 404) {
      return true;
    }
    if (typeof record.status === "number" && record.status >= 500 && code !== "UNKNOWN_ERROR") {
      return false;
    }
    if (/\b404\b|not[_\s-]?found/i.test(msg)) {
      return true;
    }
    if (record.details && typeof record.details === "object") {
      const details = record.details as { detail?: unknown; message?: unknown; status?: unknown };
      if (details.status === 404) {
        return true;
      }
      const detailText = typeof details.detail === "string"
        ? details.detail
        : typeof details.message === "string"
          ? details.message
          : "";
      if (detailText && /\b404\b|not[_\s-]?found/i.test(detailText)) {
        return true;
      }
    }
  }
  if (typeof err === "string") {
    return /\b404\b|not[_\s-]?found/i.test(err) && !/\bHTTP\s+5\d\d\b/i.test(err);
  }
  return false;
}

export function formatDetailError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown; detail?: unknown }).message
      ?? (err as { detail?: unknown }).detail;
    if (typeof msg === "string" && msg.trim()) {
      return msg;
    }
  }
  return "live read failed";
}

function reportStrictDetailFailure(err: unknown, reason: string): void {
  const liveMode = liveStatus.get().mode === "live";
  const strictMode = detectFallbackMode() === "strict";
  const strictFallbackBlocked =
    liveMode && strictMode && (!(err instanceof BffError) || err.status === 0 || err.status >= 500);
  if (strictFallbackBlocked) {
    liveStatus.reportFallback(`strict: ${reason}`);
  }
}

export function useLiveDetail<T>(
  id: string | undefined | null,
  loader: (id: string) => Promise<T | undefined | null>,
  opts?: UseLiveDetailOptions,
): UseLiveDetailResult<T>;
export function useLiveDetail<T>(
  loader: () => Promise<T | undefined | null>,
  kindsOrDeps?: readonly unknown[],
  opts?: UseLiveDetailOptions,
): UseLiveDetailResult<T>;
export function useLiveDetail<T>(
  idOrLoader: string | undefined | null | (() => Promise<T | undefined | null>),
  loaderOrDeps?: ((id: string) => Promise<T | undefined | null>) | readonly unknown[],
  optsArg: UseLiveDetailOptions = {},
): UseLiveDetailResult<T> {
  const isZeroArgLoader = typeof idOrLoader === "function";
  const normalizedId = !isZeroArgLoader && typeof idOrLoader === "string" ? idOrLoader.trim() : "";
  const missingId = !isZeroArgLoader && !normalizedId;

  const kinds: string[] = optsArg.kinds
    ?? (isZeroArgLoader && Array.isArray(loaderOrDeps) && loaderOrDeps.every((d) => typeof d === "string")
      ? (loaderOrDeps as string[])
      : []);
  const auto = optsArg.auto ?? true;
  const depsKey = isZeroArgLoader
    ? (Array.isArray(loaderOrDeps) ? loaderOrDeps.map((d) => String(d ?? "")).join("|") : "")
    : normalizedId;

  const [data, setDataState] = useState<T | undefined>(undefined);
  const [status, setStatus] = useState<DetailLoadState>(() => (missingId ? "not-found" : "loading"));
  const [error, setError] = useState<string | undefined>(undefined);
  const [errorObject, setErrorObject] = useState<unknown>(undefined);
  const [pending, setPending] = useState(0);

  const runLoaderRef = useRef<() => Promise<T | undefined | null>>(() => Promise.resolve(undefined));
  runLoaderRef.current = () => {
    if (isZeroArgLoader) {
      return (idOrLoader as () => Promise<T | undefined | null>)();
    }
    if (!normalizedId || typeof loaderOrDeps !== "function") {
      return Promise.resolve(undefined);
    }
    return (loaderOrDeps as (id: string) => Promise<T | undefined | null>)(normalizedId);
  };

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const executeLoad = useCallback((resetData: boolean): Promise<T | undefined> => {
    const reqId = ++requestIdRef.current;
    if (missingId) {
      setDataState(undefined);
      setStatus("not-found");
      setError(undefined);
      setErrorObject(undefined);
      setPending(0);
      return Promise.resolve(undefined);
    }

    if (resetData) {
      setDataState(undefined);
    }
    setStatus("loading");
    setError(undefined);
    setErrorObject(undefined);

    return Promise.resolve()
      .then(() => runLoaderRef.current())
      .then((next) => {
        if (!mountedRef.current || reqId !== requestIdRef.current) {
          return undefined;
        }
        if (next === undefined || next === null || Array.isArray(next)) {
          setDataState(undefined);
          setStatus("not-found");
          setError(undefined);
          setErrorObject(undefined);
          setPending(0);
          return undefined;
        }
        setDataState(next);
        setStatus("ready");
        setError(undefined);
        setErrorObject(undefined);
        setPending(0);
        return next;
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || reqId !== requestIdRef.current) {
          return undefined;
        }
        if (isNotFoundError(err)) {
          setDataState(undefined);
          setStatus("not-found");
          setError(undefined);
          setErrorObject(err);
          setPending(0);
          return undefined;
        }
        const reason = formatDetailError(err);
        reportStrictDetailFailure(err, reason);
        setDataState(undefined);
        setStatus("error");
        setError(reason);
        setErrorObject(err);
        setPending(0);
        return undefined;
      });
  }, [missingId]);

  const refresh = useCallback((): Promise<T | undefined> => {
    return executeLoad(false);
  }, [executeLoad]);

  const setData: Dispatch<SetStateAction<T | undefined>> = useCallback((action) => {
    setDataState((prev) => {
      const next = typeof action === "function"
        ? (action as (prevState: T | undefined) => T | undefined)(prev)
        : action;
      if (next !== undefined && next !== null) {
        setStatus("ready");
        setError(undefined);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void executeLoad(true);
    if (kinds.length === 0) return;
    const off = realtime.on("data", (p) => {
      const kind = (p as { kind?: string } | undefined)?.kind;
      if (!kind) return;
      if (kind !== "*" && !kinds.includes(kind)) return;
      if (auto) {
        void executeLoad(false);
      } else if (mountedRef.current) {
        setPending((n) => n + 1);
      }
    });
    return () => {
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, executeLoad, kinds.join("|"), auto]);

  return {
    data,
    item: data,
    state: status,
    status,
    loadState: status,
    loading: status === "loading",
    notFound: status === "not-found",
    isError: status === "error",
    error,
    errorObject,
    pending,
    refresh,
    setData,
  };
}
