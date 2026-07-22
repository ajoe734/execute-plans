// BFF Contract v1 — SSE resync / Last-Event-Id protocol.
// Source: AsyncAPI §1.1, §3.

import type { SseChannel } from "./channels";

export const SSE_HEARTBEAT_MS = 15_000;
export const SSE_RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export interface ResyncRequiredEvent {
  type: "resync_required";
  channel: SseChannel | "system";
  reason: "gap_too_large" | "replay_unavailable" | "schema_change" | "auth_changed";
  resyncUrl?: string;
}

export interface SseConnectInit {
  /** Last successfully processed envelope id; sent as Last-Event-Id header. */
  lastEventId?: string;
  channels?: SseChannel[];
}

export function buildSseHeaders(init: SseConnectInit): Record<string, string> {
  const h: Record<string, string> = { Accept: "text/event-stream" };
  if (init.lastEventId) h["Last-Event-Id"] = init.lastEventId;
  return h;
}

export function buildSseUrl(base: string, init: SseConnectInit): string {
  const url = new URL(base, "http://placeholder");
  if (init.channels?.length) url.searchParams.set("channels", init.channels.join(","));
  if (init.lastEventId) url.searchParams.set("lastEventId", init.lastEventId);
  // Strip placeholder origin if input was relative.
  return base.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}

export function nextBackoffMs(attempt: number): number {
  const i = Math.min(Math.max(0, attempt), SSE_RECONNECT_BACKOFF_MS.length - 1);
  return SSE_RECONNECT_BACKOFF_MS[i];
}

// ─── Streaming-fetch frame reader ──────────────────────────────────────────
// `EventSource` cannot send the `Authorization` header the BFF requires, so
// authenticated SSE consumers open the stream with `fetch()` instead and
// parse `text/event-stream` frames off the response body as they arrive.
// This keeps the transport genuinely push-based (the server holds the
// connection open for up to ~30s between events) rather than a
// poll-and-reopen loop.

export interface SseStreamFrame {
  id?: string;
  event?: string;
  data?: string;
}

/** Parses one blank-line-delimited SSE block. Comment lines (`:...`, used for
 *  heartbeats) and unrecognized fields are ignored. Returns null for blocks
 *  that carry no id/event/data field. */
export function parseSseFrame(block: string): SseStreamFrame | null {
  const frame: SseStreamFrame = {};
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep);
    const value = line.slice(sep + 1).replace(/^ /, "");
    if (field === "data") frame.data = frame.data === undefined ? value : `${frame.data}\n${value}`;
    else if (field === "id" || field === "event") frame[field] = value;
  }
  return frame.id !== undefined || frame.event !== undefined || frame.data !== undefined ? frame : null;
}

/** Reads a `text/event-stream` response body incrementally, invoking
 *  `onFrame` for each complete block as soon as it arrives — a genuine
 *  streaming reader, not a buffer-until-close parser. Resolves when the
 *  server ends the stream (or the underlying fetch is aborted, which surfaces
 *  as a rejected `reader.read()`). */
export async function readSseFrames(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseStreamFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const frame = parseSseFrame(block);
        if (frame) onFrame(frame);
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
}
