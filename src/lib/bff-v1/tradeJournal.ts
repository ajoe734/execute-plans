// BFF Contract v1 — Persona Trade Journal client.
import { paths } from "./paths";
import { bffFetch } from "./client";

export interface TradeEpisodeProjection {
  trade_episode_id: string;
  persona_id: string;
  environment: string;
  strategy_id: string;
  artifact_id: string;
  artifact_version?: string;
  runtime_binding_id?: string;
  capital_pool_id?: string;
  instrument_id: string;
  side: "long" | "short";
  status: string;
  opened_at: string;
  closed_at?: string;
  entry_actor?: string;
  exit_actor?: string;
  exit_reason?: string;
  requested_qty: number;
  filled_qty: number;
  remaining_qty: number;
  vwap: number;
  fees: number;
  slippage: number;
  rejects: number;
  realized_pnl: number;
  unrealized_pnl: number;
  return: number;
  mae: number;
  mfe: number;
  holding_duration?: number;
  benchmark_delta?: number;
  thesis?: string;
  expected_catalyst?: string;
  invalidation_conditions?: string;
  time_horizon?: string;
  confidence?: number;
  source_confidence?: string;
  reflection_summary?: string;
  coverage: Record<string, { state: string; missing_refs: string[]; as_of: string; source_system: string }>;
  timeline?: Array<{
    event_id: string;
    event_type: string;
    occurred_at: string;
    actor?: string;
    details: Record<string, unknown>;
  }>;
}

export interface PersonaTradeReflection {
  reflection_id: string;
  trade_episode_id: string;
  persona_id: string;
  reflection_version: number;
  trigger: "fill_review" | "episode_closed" | "scheduled_pattern" | "manual_retry";
  facts_snapshot_ref: string;
  facts_snapshot_hash: string;
  expected_vs_actual: {
    thesis?: string;
    entry_quality?: string;
    exit_quality?: string;
    sizing?: string;
    timing?: string;
    risk_adherence?: string;
  };
  counterfactuals: Array<{
    action: string;
    impact: string;
    assumption: string;
  }>;
  attribution: string;
  mistakes: string[];
  what_worked: string[];
  unknowns: string[];
  followups: string[];
  lesson_candidates: Array<{
    id: string;
    scope: string;
    proposed_change: string;
    supporting_episode_ids: string[];
    confidence: number;
    expiry?: string;
  }>;
  model: string;
  provider: string;
  prompt_version: string;
  generated_at: string;
  review_state: string;
}

export interface TradePattern {
  pattern_id: string;
  persona_id: string;
  environment: string;
  name: string;
  description: string;
  sample_size: number;
  confidence: number;
  mistake_taxonomy: string;
  occurrences: string[];
  recommendation: string;
}

export interface CommandReceipt {
  status: "accepted";
  commandId: string;
}

export interface TradeJournalResponse {
  data: TradeEpisodeProjection[];
  page_info: { next_cursor: number | null; has_more?: boolean };
  meta: { coverage_state: string; source: string; count: number };
}

export interface TradeJournalDetailResponse {
  data: TradeEpisodeProjection;
  meta: { source: string; source_confidence: string };
}

export interface TradeReflectionsResponse {
  data: PersonaTradeReflection[];
  page_info: { next_cursor: number | null };
  meta: { source: string };
}

export interface TradePatternsResponse {
  data: TradePattern[];
  meta: { source: string; coverage_state: string };
}

export interface CommandResponse {
  data: CommandReceipt;
  meta: { idempotent_replay: boolean; audit: { record_ref: string } };
}

export const tradeJournal = {
  list: (personaId: string, query?: Record<string, string | number | undefined>): Promise<TradeJournalResponse> => {
    return bffFetch<TradeJournalResponse>({
      method: "GET",
      path: paths.tradeJournal(personaId, query),
    });
  },

  get: (personaId: string, episodeId: string, environment?: string): Promise<TradeJournalDetailResponse> => {
    return bffFetch<TradeJournalDetailResponse>({
      method: "GET",
      path: paths.tradeJournalDetail(personaId, episodeId, environment),
    });
  },

  reflections: (personaId: string, query?: Record<string, string | number | undefined>): Promise<TradeReflectionsResponse> => {
    return bffFetch<TradeReflectionsResponse>({
      method: "GET",
      path: paths.tradeReflections(personaId, query),
    });
  },

  patterns: (personaId: string, environment?: string): Promise<TradePatternsResponse> => {
    return bffFetch<TradePatternsResponse>({
      method: "GET",
      path: paths.tradePatterns(personaId, environment),
    });
  },

  retry: (personaId: string, episodeId: string, reason: string): Promise<CommandResponse> => {
    return bffFetch<CommandResponse>({
      method: "POST",
      path: paths.tradeJournalReflectionRetry(personaId, episodeId),
      body: { reason },
      idempotencyKey: `idem-retry-${episodeId}-${Math.random().toString(36).substr(2, 9)}`,
    });
  },

  submitLessonReview: (personaId: string, lessonId: string, reason: string): Promise<CommandResponse> => {
    return bffFetch<CommandResponse>({
      method: "POST",
      path: paths.tradeLessonSubmitReview(personaId, lessonId),
      body: { reason },
      idempotencyKey: `idem-submit-${lessonId}-${Math.random().toString(36).substr(2, 9)}`,
    });
  },

  decideLesson: (
    personaId: string,
    lessonId: string,
    reason: string,
    decision: "endorsed" | "rejected" | "quarantined",
    varianceAttribution?: string,
  ): Promise<CommandResponse> => {
    return bffFetch<CommandResponse>({
      method: "POST",
      path: paths.tradeLessonDecide(personaId, lessonId),
      body: varianceAttribution ? { reason, decision, variance_attribution: varianceAttribution } : { reason, decision },
      idempotencyKey: `idem-decide-${lessonId}-${Math.random().toString(36).substr(2, 9)}`,
    });
  },
};
