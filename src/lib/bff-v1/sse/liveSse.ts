// BFF Contract v1 — Live SSE connector.
// In live mode, opens an EventSource against `/bff/events/stream` and emits
// each typed envelope onto the in-memory realtime bus topic
// `sse:<channel>`. This makes `subscribe(channel, handler)` from
// `./bridge` work uniformly across mock + live.
//
// On transport failure (network down, EventSource error before any open),
// reports fallback to liveStatus and the existing in-memory mock bus
// continues to drive UI.

import { realtime } from "@/lib/bff/realtime";
import { liveStatus } from "../liveStatus";
import { buildHeaders, getAuthProvider } from "../headers";
import { isSseEvent, type SseEvent } from "./channels";
import {
  buildSseUrl,
  extractSseFrames,
  nextBackoffMs,
  type RawSseFrame,
  type SseConnectInit,
} from "./protocol";
import { paths } from "../paths";

let current: { close: () => void } | null = null;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastEventId: string | undefined;

function clearTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function dispatch(raw: unknown): void {
  if (!isSseEvent(raw)) return;
  const ev = raw as SseEvent;
  lastEventId = ev.id;
  realtime.emit(`sse:${ev.channel}`, ev);
}

function readBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    return env.VITE_BFF_BASE_URL ?? "";
  } catch {
    return "";
  }
}

/** Configured live mode (not the *effective* mode). We keep probing SSE while
 *  configured for live even after a fallback, so a transient outage recovers
 *  on its own instead of latching until a manual retry. */
function isLiveModeConfigured(): boolean {
  return liveStatus.get().mode === "live";
}

export interface FetchSseOptions {
  url: string;
  headers?: Record<string, string>;
  lastEventId?: string;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  onOpen?: (res: Response) => void;
  onMessage?: (frame: RawSseFrame) => void;
  onError?: (error: Error) => void;
  onResyncRequired?: (reason?: string) => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  fetchFn?: typeof fetch;
}

export interface FetchSseController {
  close: () => void;
}

/**
 * Fetch-based SSE client that supports custom headers (Authorization, X-Tenant-Id,
 * Last-Event-ID) and strict Content-Type validation.
 */
export function fetchSse(options: FetchSseOptions): FetchSseController {
  let closed = false;
  let abortController = new AbortController();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let currentLastEventId = options.lastEventId;

  const clearTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed || options.autoReconnect === false) return;
    clearTimer();
    const delay = nextBackoffMs(attempt++, true);
    reconnectTimer = setTimeout(() => {
      if (!closed) void connect();
    }, delay);
  };

  async function connect() {
    if (closed) return;
    abortController = new AbortController();
    if (options.signal) {
      options.signal.addEventListener(
        "abort",
        () => {
          controller.close();
        },
        { once: true },
      );
      if (options.signal.aborted) {
        controller.close();
        return;
      }
    }

    const headers = buildHeaders({
      method: "GET",
      extra: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        ...(currentLastEventId ? { "Last-Event-ID": currentLastEventId } : {}),
        ...(options.headers ?? {}),
      },
    });

    const fetchFn = options.fetchFn ?? globalThis.fetch;

    try {
      const res = await fetchFn(options.url, {
        method: "GET",
        headers,
        credentials: options.credentials ?? "include",
        signal: abortController.signal,
      });

      if (closed || abortController.signal.aborted) return;

      // Stop on 401 / 403 until the auth layer refreshes/reverifies.
      if (res.status === 401 || res.status === 403) {
        const error = new Error(`SSE auth failed with status ${res.status}`);
        options.onError?.(error);
        return;
      }

      // Treat 409 replay-unavailable as a signal to fetch a canonical snapshot and reconnect.
      if (res.status === 409) {
        options.onResyncRequired?.("replay_unavailable");
        currentLastEventId = undefined;
        scheduleReconnect();
        return;
      }

      if (!res.ok) {
        options.onError?.(new Error(`HTTP ${res.status}: ${res.statusText || "Request failed"}`));
        scheduleReconnect();
        return;
      }

      // Require HTTP 200 and Content-Type beginning text/event-stream (reject HTML fallback).
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.startsWith("text/event-stream")) {
        options.onError?.(
          new Error(`Invalid SSE Content-Type: ${contentType || "none"}; expected text/event-stream`),
        );
        scheduleReconnect();
        return;
      }

      attempt = 0;
      options.onOpen?.(res);

      if (res.body && typeof (res.body as unknown as { getReader?: unknown }).getReader === "function") {
        const reader = (res.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!closed && !abortController.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const result = extractSseFrames(buffer);
            buffer = result.remainder;
            for (const frame of result.frames) {
              if (frame.id) currentLastEventId = frame.id;
              options.onMessage?.(frame);
            }
          }
          if (buffer.trim()) {
            const finalResult = extractSseFrames(buffer + "\n\n");
            for (const frame of finalResult.frames) {
              if (frame.id) currentLastEventId = frame.id;
              options.onMessage?.(frame);
            }
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // Ignore releaseLock error
          }
        }
      } else {
        const text = await res.text();
        const result = extractSseFrames(text + "\n\n");
        for (const frame of result.frames) {
          if (frame.id) currentLastEventId = frame.id;
          options.onMessage?.(frame);
        }
      }

      if (!closed && !abortController.signal.aborted) {
        scheduleReconnect();
      }
    } catch (err) {
      if (closed || abortController.signal.aborted) return;
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);
      scheduleReconnect();
    }
  }

  void connect();

  const controller: FetchSseController = {
    close: () => {
      if (closed) return;
      closed = true;
      clearTimer();
      try {
        abortController.abort();
      } catch {
        // Ignore abort error
      }
      options.onClose?.();
    },
  };

  return controller;
}

/** Open / re-open the live SSE connection. No-op when not configured for live. */
export function connectLiveSse(init: SseConnectInit = {}): () => void {
  if (!isLiveModeConfigured()) {
    return () => {};
  }
  // Single-flight.
  if (current) return current.close;

  const base = readBaseUrl();
  const url = `${base}${buildSseUrl(paths.sse(), { ...init, lastEventId: init.lastEventId ?? lastEventId })}`;
  const token = getAuthProvider().getToken();
  const hasBearer = Boolean(token);

  if (hasBearer) {
    const controller = fetchSse({
      url,
      lastEventId: init.lastEventId ?? lastEventId,
      autoReconnect: true,
      onOpen: () => {
        attempt = 0;
        realtime.markLiveOpen();
        liveStatus.reportSuccess();
      },
      onMessage: (frame) => {
        if (frame.id) lastEventId = frame.id;
        if (!frame.data) return;
        try {
          const data = JSON.parse(frame.data);
          dispatch(data);
        } catch {
          /* ignore malformed line */
        }
      },
      onError: () => {
        realtime.markLiveError();
        liveStatus.reportFallback("sse_open_failed");
      },
      onClose: () => {
        realtime.markLiveError();
      },
    });

    current = {
      close: () => {
        controller.close();
        current = null;
      },
    };
    return current.close;
  }

  if (typeof EventSource === "undefined") {
    return () => {};
  }

  let opened = false;
  const es = new EventSource(url, { withCredentials: true });

  es.addEventListener("open", () => {
    opened = true;
    attempt = 0;
    realtime.markLiveOpen();
    liveStatus.reportSuccess();
  });

  es.addEventListener("message", (e: MessageEvent) => {
    try {
      const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      dispatch(data);
    } catch {
      /* ignore malformed line */
    }
  });

  es.addEventListener("error", () => {
    realtime.markLiveError();
    if (!opened) {
      liveStatus.reportFallback("sse_open_failed");
      cleanup(true);
      return;
    }
    cleanup(true);
  });

  function cleanup(scheduleReconnect = false) {
    try { es.close(); } catch { /* noop */ }
    current = null;
    if (scheduleReconnect && isLiveModeConfigured()) {
      const delay = nextBackoffMs(attempt++, true);
      clearTimer();
      reconnectTimer = setTimeout(() => connectLiveSse(init), delay);
    }
  }

  current = { close: () => { clearTimer(); cleanup(false); } };
  return current.close;
}

export function disconnectLiveSse(): void {
  if (current) current.close();
  clearTimer();
}

/** Test helper. */
export function _resetLiveSse(): void {
  disconnectLiveSse();
  attempt = 0;
  lastEventId = undefined;
}

