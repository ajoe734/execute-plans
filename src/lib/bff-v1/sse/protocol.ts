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

export function nextBackoffMs(attempt: number, withJitter = false): number {
  const i = Math.min(Math.max(0, attempt), SSE_RECONNECT_BACKOFF_MS.length - 1);
  const base = SSE_RECONNECT_BACKOFF_MS[i];
  if (!withJitter) return base;
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(base * jitter);
}

export interface RawSseFrame {
  id?: string;
  event?: string;
  data?: string;
  retry?: number;
}

export function extractSseFrames(buffer: string): { frames: RawSseFrame[]; remainder: string } {
  const frames: RawSseFrame[] = [];
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    const frame: RawSseFrame = {};
    const lines = block.split("\n");
    for (const line of lines) {
      if (line.startsWith(":") || !line.length) {
        continue;
      }
      const colonIndex = line.indexOf(":");
      let field: string;
      let value: string;
      if (colonIndex === -1) {
        field = line;
        value = "";
      } else {
        field = line.slice(0, colonIndex);
        value = line.slice(colonIndex + 1);
        if (value.startsWith(" ")) {
          value = value.slice(1);
        }
      }

      if (field === "data") {
        frame.data = frame.data === undefined ? value : `${frame.data}\n${value}`;
      } else if (field === "id") {
        frame.id = value;
      } else if (field === "event") {
        frame.event = value;
      } else if (field === "retry") {
        const parsedRetry = parseInt(value, 10);
        if (Number.isFinite(parsedRetry)) {
          frame.retry = parsedRetry;
        }
      }
    }
    if (frame.data !== undefined || frame.id !== undefined || frame.event !== undefined) {
      frames.push(frame);
    }
  }

  return { frames, remainder };
}

export function parseSseFrames(text: string): RawSseFrame[] {
  return extractSseFrames(text + "\n\n").frames;
}

