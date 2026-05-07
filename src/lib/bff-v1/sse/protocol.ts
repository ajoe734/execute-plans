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
  // Strip placeholder origin if input was relative.
  return base.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}

export function nextBackoffMs(attempt: number): number {
  const i = Math.min(Math.max(0, attempt), SSE_RECONNECT_BACKOFF_MS.length - 1);
  return SSE_RECONNECT_BACKOFF_MS[i];
}
