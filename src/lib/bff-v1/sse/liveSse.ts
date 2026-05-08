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
import { liveStatus, shouldUseLive } from "../liveStatus";
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

/** Open / re-open the live SSE connection. No-op when not in live mode. */
export function connectLiveSse(init: SseConnectInit = {}): () => void {
  if (!shouldUseLive() || typeof EventSource === "undefined") {
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
    if (!opened) {
      // never opened → transport failure, fall back.
      liveStatus.reportFallback("sse_open_failed");
      cleanup();
      return;
    }
    // transient — schedule reconnect with backoff
    cleanup(/*scheduleReconnect*/ true);
  });

  function cleanup(scheduleReconnect = false) {
    try { es.close(); } catch { /* noop */ }
    current = null;
    if (scheduleReconnect && shouldUseLive()) {
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
