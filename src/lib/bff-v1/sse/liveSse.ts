// BFF Contract v1 — Live SSE connector.
// In live mode, opens the `/bff/events/stream` channel with an authenticated
// streaming `fetch()` (browser `EventSource` cannot send the `Authorization`
// header the BFF requires — it would otherwise 401 and permanently fall back
// to snapshot data) and emits each typed envelope onto the in-memory realtime
// bus topic `sse:<channel>`. This makes `subscribe(channel, handler)` from
// `./bridge` work uniformly across mock + live.
//
// On transport failure (network down, non-2xx before any frame arrives),
// reports fallback to liveStatus and the existing in-memory mock bus
// continues to drive UI.

import { realtime } from "@/lib/bff/realtime";
import { liveStatus } from "../liveStatus";
import { buildHeaders } from "../headers";
import { isSseEvent, type SseEvent } from "./channels";
import { buildSseUrl, nextBackoffMs, readSseFrames, type SseConnectInit } from "./protocol";
import { paths } from "../paths";

let current: { close: () => void } | null = null;
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
  if (!isLiveModeConfigured() || typeof fetch === "undefined") {
    return () => {};
  }
  // Single-flight.
  if (current) return current.close;

  const base = readBaseUrl();
  const url = `${base}${buildSseUrl(paths.sse(), { ...init, lastEventId: init.lastEventId ?? lastEventId })}`;

  const controller = new AbortController();
  let closedByCaller = false;

  // Gate on the *configured* mode, not the effective one: after a fallback the
  // effective mode is "mock", but we still want to keep retrying to recover.
  function scheduleReconnect() {
    if (closedByCaller || !isLiveModeConfigured()) return;
    const delay = nextBackoffMs(attempt++);
    clearTimer();
    reconnectTimer = setTimeout(() => connectLiveSse(init), delay);
  }

  /** `opened=false` means the stream never delivered a single frame (never
   *  opened → transport failure). `opened=true` means it was live and then
   *  dropped. Either way we KEEP probing so connectivity recovery auto-clears
   *  the banner and resumes live — previously this gave up and latched until
   *  a manual retry click. */
  function finish(opened: boolean) {
    current = null;
    if (closedByCaller) return;
    realtime.markLiveError();
    if (!opened) liveStatus.reportFallback("sse_open_failed");
    scheduleReconnect();
  }

  void (async () => {
    const headers = buildHeaders({
      method: "GET",
      extra: {
        Accept: "text/event-stream",
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
    });
    let res: Response;
    try {
      res = await fetch(url, { headers, credentials: "include", signal: controller.signal });
    } catch {
      finish(false);
      return;
    }
    if (!res.ok || !res.body) {
      finish(false);
      return;
    }

    attempt = 0;
    realtime.markLiveOpen();
    liveStatus.reportSuccess();

    try {
      await readSseFrames(res.body, (frame) => {
        if (frame.id) lastEventId = frame.id;
        if (!frame.data) return;
        try {
          dispatch(JSON.parse(frame.data));
        } catch {
          /* ignore malformed line */
        }
      });
    } catch {
      /* stream read error — falls through to finish(true) below */
    }
    finish(true);
  })();

  current = {
    close: () => {
      closedByCaller = true;
      clearTimer();
      try { controller.abort(); } catch { /* noop */ }
      current = null;
    },
  };
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
