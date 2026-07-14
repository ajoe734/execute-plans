import { bffFetch, bffV1, detectBaseUrl } from "./client";
import { buildHeaders } from "./headers";

export type JourneyReadState = "formal" | "partial" | "degraded" | "unavailable";
export type JourneyEnvironment = "paper" | "canary" | "live";

export interface JourneyMeta {
  snapshot_at: string;
  read_state: JourneyReadState;
  warnings?: string[];
  freshness: { materializer_revision: number; rebuild_status?: string; source_watermarks?: Record<string, string> };
}

export type JourneyFlags = Record<string, boolean>;
export interface JourneyStage { status?: string; updated_at?: string; owner?: string; block_reason?: string; [key: string]: unknown }

export interface JourneyRow {
  journey_id: string;
  environment: JourneyEnvironment;
  status: string;
  current_stage: string;
  severity: string;
  persona_id?: string | null;
  strategy_id?: string | null;
  symbol?: string | null;
  side?: string | null;
  quantity?: number | null;
  decision_id?: string | null;
  broker_order_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  flags?: JourneyFlags;
  completeness?: { missing_stages?: string[]; [key: string]: unknown };
  read_state?: JourneyReadState;
  revision?: number;
}

export interface JourneyDetail extends JourneyRow {
  stages?: Record<string, JourneyStage>;
  diagnostics?: Array<Record<string, unknown>> | Record<string, unknown>;
  identifiers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface JourneyListEnvelope {
  data: { items: JourneyRow[] };
  page_info: { total: number; page_size: number; next_page_token?: string | null };
  meta: JourneyMeta;
}

export interface JourneyTimelineEvent {
  event_id: string;
  stage?: string;
  stage_status?: string;
  occurred_at?: string;
  recorded_at?: string;
  source?: string;
  [key: string]: unknown;
}

export interface JourneyTimelineEnvelope extends Omit<JourneyListEnvelope, "data"> {
  data: { items: JourneyTimelineEvent[] };
}

export interface JourneyDetailEnvelope<T = JourneyDetail> { data: T; meta: JourneyMeta }
export interface JourneyResolveData { ambiguous: boolean; journey_ids: string[]; candidates?: Array<{ identifier_type: string; identifier: string; journey_ids: string[]; match_count: number }> }

export const listTradeJourneys = (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
  bffFetch<JourneyListEnvelope>({ method: "GET", path: "/bff/management/trade-journeys", query, signal });

export const getTradeJourney = (journeyId: string, query: Record<string, string | undefined>, signal?: AbortSignal) =>
  bffFetch<JourneyDetailEnvelope>({ method: "GET", path: `/bff/management/trade-journeys/${encodeURIComponent(journeyId)}`, query, signal });

export const getTradeJourneyTimeline = (journeyId: string, query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
  bffFetch<JourneyTimelineEnvelope>({ method: "GET", path: `/bff/management/trade-journeys/${encodeURIComponent(journeyId)}/timeline`, query, signal });

export const getTradeJourneyEvidence = (journeyId: string, query: Record<string, string | undefined>, signal?: AbortSignal) =>
  bffFetch<JourneyDetailEnvelope<Record<string, unknown>>>({ method: "GET", path: `/bff/management/trade-journeys/${encodeURIComponent(journeyId)}/evidence`, query, signal });

export const resolveTradeJourney = (query: { q: string; tenant_id: string; environment: string }, signal?: AbortSignal) =>
  bffFetch<JourneyDetailEnvelope<JourneyResolveData>>({ method: "GET", path: "/bff/management/trade-journeys/resolve", query, signal });

export type JourneyLiveState = "connecting" | "live" | "stale";
export interface JourneyLiveSubscription { close(): void }

export const JOURNEY_EVENTS_POLL_MS = 15_000;

interface SseFrame { id?: string; event?: string; data?: string }

/** Minimal text/event-stream frame parser (id/event/data lines only). */
export function parseSseFrames(text: string): SseFrame[] {
  return text.split(/\n\n+/).map(block => {
    const frame: SseFrame = {};
    for (const line of block.split("\n")) {
      const match = /^(id|event|data):\s?(.*)$/.exec(line);
      if (!match) continue;
      if (match[1] === "data") frame.data = frame.data === undefined ? match[2] : `${frame.data}\n${match[2]}`;
      else frame[match[1] as "id" | "event"] = match[2];
    }
    return frame;
  }).filter(frame => frame.id !== undefined || frame.event !== undefined || frame.data !== undefined);
}

export function subscribeTradeJourneys(
  query: { tenant_id: string; environment: string },
  handlers: { onInvalidate: () => void; onState: (state: JourneyLiveState) => void },
): JourneyLiveSubscription {
  // Mock mode has no live invalidation channel; report live so the seeded
  // dataset does not render a permanently-stale badge.
  if (bffV1.detectMode() === "mock") {
    handlers.onState("live");
    return { close() {} };
  }
  // The BFF cursor endpoint authenticates via the Authorization header, which
  // the browser EventSource API cannot send, and the server closes the stream
  // after one revision frame by design — so poll it with an authenticated
  // fetch instead of EventSource (which also skipped VITE_BFF_BASE_URL).
  let closed = false;
  let highestRevision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const params = new URLSearchParams(query);
  const poll = async () => {
    if (closed) return;
    try {
      const headers = buildHeaders({ method: "GET", extra: { Accept: "text/event-stream", ...(highestRevision ? { "Last-Event-ID": String(highestRevision) } : {}) } });
      const res = await fetch(`${detectBaseUrl()}/bff/management/trade-journeys/events?${params}`, { headers, credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let invalidate = false;
      for (const frame of parseSseFrames(await res.text())) {
        if (frame.event !== "journeys_changed" && frame.event !== "snapshot_refetch_required") continue;
        const payload = JSON.parse(frame.data || "{}") as { revision?: number; gap?: boolean; snapshot_refetch?: boolean };
        const revision = Number(payload.revision ?? frame.id);
        if (!Number.isFinite(revision) || revision <= highestRevision) continue;
        highestRevision = revision;
        if (payload.snapshot_refetch || payload.gap) invalidate = true;
      }
      if (closed) return;
      handlers.onState("live");
      if (invalidate) handlers.onInvalidate();
    } catch {
      if (!closed) handlers.onState("stale");
    }
    if (!closed) timer = setTimeout(poll, JOURNEY_EVENTS_POLL_MS);
  };
  handlers.onState("connecting");
  void poll();
  return { close: () => { closed = true; if (timer) clearTimeout(timer); } };
}
