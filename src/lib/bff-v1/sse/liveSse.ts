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
import { isSseEvent, type SseEvent } from "./channels";
import { buildSseUrl, nextBackoffMs, type SseConnectInit } from "./protocol";
import { paths } from "../paths";

let current: { es: EventSource; close: () => void } | null = null;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastEventId: string | undefined;

function clearTimer() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
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

/** Open / re-open the live SSE connection. No-op when not configured for live. */
export function connectLiveSse(init: SseConnectInit = {}): () => void {
  if (!isLiveModeConfigured() || typeof EventSource === "undefined") {
    return () => {};
  }
  // Single-flight.
  if (current) return current.close;

  const base = readBaseUrl();
  const url = `${base}${buildSseUrl(paths.sse(), { ...init, lastEventId: init.lastEventId ?? lastEventId })}`;

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
      // Never opened → transport failure. Fall back to seed for reads, but KEEP
      // probing (scheduleReconnect) so connectivity recovery auto-clears the
      // banner and resumes live — previously this gave up and latched until a
      // manual retry click.
      liveStatus.reportFallback("sse_open_failed");
      cleanup(/*scheduleReconnect*/ true);
      return;
    }
    // transient — schedule reconnect with backoff
    cleanup(/*scheduleReconnect*/ true);
  });

  function cleanup(scheduleReconnect = false) {
    try { es.close(); } catch { /* noop */ }
    current = null;
    // Gate on the *configured* mode, not the effective one: after a fallback the
    // effective mode is "mock", but we still want to keep retrying to recover.
    if (scheduleReconnect && isLiveModeConfigured()) {
      const delay = nextBackoffMs(attempt++);
      clearTimer();
      reconnectTimer = setTimeout(() => connectLiveSse(init), delay);
    }
  }

  current = { es, close: () => { clearTimer(); cleanup(false); } };
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
