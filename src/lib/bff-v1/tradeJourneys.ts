import { bffFetch } from "./client";

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
