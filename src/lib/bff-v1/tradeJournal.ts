// BFF Contract v1 — Persona Trade Journal client.
import { paths } from "./paths";
import { withLiveOrMock } from "./liveTransport";
import * as seed from "@/mocks/seed";

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

const mockTradeEpisodes = seed.tradeEpisodes as TradeEpisodeProjection[];
const mockTradeReflections = seed.tradeReflections as PersonaTradeReflection[];
const mockTradePatterns = seed.tradePatterns as TradePattern[];

export const tradeJournal = {
  list: (personaId: string, query?: Record<string, string | number | undefined>): Promise<TradeJournalResponse> => {
    const mockFn = async (): Promise<TradeJournalResponse> => {
      const items = mockTradeEpisodes.map((item) => ({
        ...item,
        persona_id: personaId,
      }));
      let filtered = items;
      if (query?.environment) filtered = filtered.filter((x) => x.environment === query.environment);
      if (query?.status) filtered = filtered.filter((x) => x.status === query.status);
      const limit = Number(query?.limit ?? 20);
      const cursor = Number(query?.cursor ?? 0);
      const page = filtered.slice(cursor, cursor + limit);
      const state = page.every((x) => !Object.values(x.coverage).some((coverage) => coverage.missing_refs.length > 0))
        ? "complete"
        : "partial";
      return {
        data: page,
        page_info: {
          next_cursor: cursor + limit < filtered.length ? cursor + limit : null,
          has_more: cursor + limit < filtered.length,
        },
        meta: {
          coverage_state: state,
          source: "mock_projection",
          count: filtered.length,
        },
      };
    };

    return withLiveOrMock<TradeJournalResponse>(
      {
        method: "GET",
        path: paths.tradeJournal(personaId, query),
      },
      mockFn,
    );
  },

  get: (personaId: string, episodeId: string, environment?: string): Promise<TradeJournalDetailResponse> => {
    const mockFn = async (): Promise<TradeJournalDetailResponse> => {
      const row = mockTradeEpisodes.find((x) => x.trade_episode_id === episodeId);
      if (!row) {
        throw new Error("Trade episode not found");
      }
      return {
        data: { ...row, persona_id: personaId },
        meta: { source: "mock_projection", source_confidence: "canonical_refs" },
      };
    };

    return withLiveOrMock<TradeJournalDetailResponse>(
      {
        method: "GET",
        path: paths.tradeJournalDetail(personaId, episodeId, environment),
      },
      mockFn,
    );
  },

  reflections: (personaId: string, query?: Record<string, string | number | undefined>): Promise<TradeReflectionsResponse> => {
    const mockFn = async (): Promise<TradeReflectionsResponse> => {
      const items = mockTradeReflections.map((item) => ({
        ...item,
        persona_id: personaId,
      }));
      let filtered = items;
      if (query?.review_state) {
        filtered = filtered.filter((x) => x.review_state === query.review_state);
      }
      const limit = Number(query?.limit ?? 20);
      const cursor = Number(query?.cursor ?? 0);
      const page = filtered.slice(cursor, cursor + limit);
      return {
        data: page,
        page_info: {
          next_cursor: cursor + limit < filtered.length ? cursor + limit : null,
        },
        meta: { source: "mock_reflection" },
      };
    };

    return withLiveOrMock<TradeReflectionsResponse>(
      {
        method: "GET",
        path: paths.tradeReflections(personaId, query),
      },
      mockFn,
    );
  },

  patterns: (personaId: string, environment?: string): Promise<TradePatternsResponse> => {
    const mockFn = async (): Promise<TradePatternsResponse> => {
      const items = mockTradePatterns.map((item) => ({
        ...item,
        persona_id: personaId,
      }));
      return {
        data: items,
        meta: { source: "mock_pattern_review", coverage_state: "complete" },
      };
    };

    return withLiveOrMock<TradePatternsResponse>(
      {
        method: "GET",
        path: paths.tradePatterns(personaId, environment),
      },
      mockFn,
    );
  },

  retry: (personaId: string, episodeId: string, reason: string): Promise<CommandResponse> => {
    const mockFn = async (): Promise<CommandResponse> => {
      return {
        data: { status: "accepted", commandId: `cmd-retry-${Math.random().toString(36).substr(2, 9)}` },
        meta: { idempotent_replay: false, audit: { record_ref: `audit-retry-${episodeId}` } },
      };
    };

    return withLiveOrMock<CommandResponse>(
      {
        method: "POST",
        path: paths.tradeJournalReflectionRetry(personaId, episodeId),
        body: { reason },
        idempotencyKey: `idem-retry-${episodeId}-${Math.random().toString(36).substr(2, 9)}`,
      },
      mockFn,
    );
  },

  submitLessonReview: (personaId: string, lessonId: string, reason: string): Promise<CommandResponse> => {
    const mockFn = async (): Promise<CommandResponse> => {
      return {
        data: { status: "accepted", commandId: `cmd-submit-${Math.random().toString(36).substr(2, 9)}` },
        meta: { idempotent_replay: false, audit: { record_ref: `audit-submit-${lessonId}` } },
      };
    };

    return withLiveOrMock<CommandResponse>(
      {
        method: "POST",
        path: paths.tradeLessonSubmitReview(personaId, lessonId),
        body: { reason },
        idempotencyKey: `idem-submit-${lessonId}-${Math.random().toString(36).substr(2, 9)}`,
      },
      mockFn,
    );
  },

  decideLesson: (
    personaId: string,
    lessonId: string,
    reason: string,
    decision: "endorsed" | "rejected" | "quarantined",
    varianceAttribution?: string,
  ): Promise<CommandResponse> => {
    const mockFn = async (): Promise<CommandResponse> => {
      return {
        data: { status: "accepted", commandId: `cmd-decide-${Math.random().toString(36).substr(2, 9)}` },
        meta: { idempotent_replay: false, audit: { record_ref: `audit-decide-${lessonId}` } },
      };
    };

    return withLiveOrMock<CommandResponse>(
      {
        method: "POST",
        path: paths.tradeLessonDecide(personaId, lessonId),
        body: varianceAttribution ? { reason, decision, variance_attribution: varianceAttribution } : { reason, decision },
        idempotencyKey: `idem-decide-${lessonId}-${Math.random().toString(36).substr(2, 9)}`,
      },
      mockFn,
    );
  },
};
