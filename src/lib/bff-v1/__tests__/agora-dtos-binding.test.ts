import { describe, expect, it } from "vitest";
import type {
  AdjustmentSuggestion,
  ComplianceMetric,
  ExecutionHistoryRow,
  InterventionRecord,
  PerformanceProjectionEnvelope,
  PerformanceWarning,
  SourceAvailability,
  StrategyPerformanceProjection,
  SuggestionActionEnvelope,
  SuggestionActionReceipt,
} from "../agora/performance";
import type {
  CandidateComponentDigest,
  CandidateConcernsValue,
  CandidateDetailsValue,
  CandidateEvidenceItem,
  CandidateEvidenceValue,
  CandidateFieldProvenance,
  CandidateFieldState,
  CandidateNextEventValue,
  CandidatePoolMember,
  CandidateRationaleValue,
  CandidateScoreResult,
  CandidateScoreSemantics,
  CandidateTruthFields,
} from "../agora/candidatePool";
import type {
  WorkshopCard,
  WorkshopConcludeEnvelope,
  WorkshopConsultationEnvelope,
  WorkshopReadinessAssessment,
  WorkshopResearchRunEnvelope,
  WorkshopStreamEvent,
  WorkshopVersionCreateEnvelope,
  WorkshopVersionListEnvelope,
  WorkshopVersionSelectEnvelope,
} from "../agora/workshops";
import type {
  AdjustmentSuggestion as GeneratedAdjustmentSuggestion,
  CandidateScoreResult as GeneratedCandidateScoreResult,
  CandidateTruthFields as GeneratedCandidateTruthFields,
  PerformanceProjectionEnvelope as GeneratedPerformanceProjectionEnvelope,
  StrategyPerformanceProjection as GeneratedStrategyPerformanceProjection,
  WorkshopCard as GeneratedWorkshopCard,
  WorkshopConcludeEnvelope as GeneratedWorkshopConcludeEnvelope,
  WorkshopConsultationEnvelope as GeneratedWorkshopConsultationEnvelope,
  StrategyReadinessAssessment as GeneratedWorkshopReadinessAssessment,
  WorkshopResearchRunEnvelope as GeneratedWorkshopResearchRunEnvelope,
  WorkshopStreamEvent as GeneratedWorkshopStreamEvent,
  WorkshopVersionCreateEnvelope as GeneratedWorkshopVersionCreateEnvelope,
  WorkshopVersionListEnvelope as GeneratedWorkshopVersionListEnvelope,
  WorkshopVersionSelectEnvelope as GeneratedWorkshopVersionSelectEnvelope,
} from "../agora/types";

describe("Agora generated DTO client bindings", () => {
  it("performance.ts exports generated DTO types", () => {
    const projection: StrategyPerformanceProjection = {
      strategy_id: "strat-1",
      period: "latest",
      environment: "paper",
      availability: "available",
      freshness: {
        status: "available",
        snapshot_at: "2026-07-23T00:00:00Z",
        as_of: "2026-07-23T00:00:00Z",
        source_watermarks: {},
        projection_revision: 1,
        projection_generation: 1,
        unavailable_sources: [],
      },
      compliance: {
        availability: { status: "available", as_of: "2026-07-23T00:00:00Z", source_ids: ["src-1"], reason: null },
        metrics: [],
      },
      interventions: {
        availability: { status: "available", as_of: "2026-07-23T00:00:00Z", source_ids: ["src-1"], reason: null },
        aggregate: { total: 0, by_status: {} },
        items: [],
      },
      execution_history: {
        availability: { status: "available", as_of: "2026-07-23T00:00:00Z", source_ids: ["src-1"], reason: null },
        items: [],
      },
      warnings: {
        availability: { status: "available", as_of: "2026-07-23T00:00:00Z", source_ids: ["src-1"], reason: null },
        items: [],
      },
      adjustment_suggestions: {
        availability: { status: "available", as_of: "2026-07-23T00:00:00Z", source_ids: ["src-1"], reason: null },
        items: [],
      },
      no_order_route_proof: "agora_performance_read_only",
    };

    const envelope: PerformanceProjectionEnvelope = {
      data: projection,
      meta: {},
    };

    const genEnvelope: GeneratedPerformanceProjectionEnvelope = envelope;
    expect(genEnvelope.data.strategy_id).toBe("strat-1");
  });

  it("candidatePool.ts exports generated Candidate Truth DTO types", () => {
    const scoreResult: CandidateScoreResult = {
      candidate_id: "cand-1",
      pool_id: "pool-1",
      recipe_id: "recipe-1",
      recipe_version: 1,
      raw_score: 85,
      penalty_score: 0,
      evidence_confidence: 0.9,
      effective_score: 85,
      rank: 1,
      band: "priority_review",
      components: [],
      blockers: [],
      data_cutoff: "2026-07-23T00:00:00Z",
      scored_at: "2026-07-23T00:00:00Z",
      override_reason: null,
    };

    const genScoreResult: GeneratedCandidateScoreResult = scoreResult;
    expect(genScoreResult.band).toBe("priority_review");
  });

  it("workshops.ts exports generated v1.13 operation envelope DTO types and function signatures", () => {
    const listEnv: WorkshopVersionListEnvelope = {
      data: {
        versions: [],
        selected_version_id: null,
        active_strategy_spec_registry_id: null,
      },
      meta: {
        capability: "agora.workshop.v1",
        audience: "operator",
        canonical_authority: "strategy_registry",
        etag: "etag-1",
        no_direct_action: "agora_workshop_read_only",
      },
    };

    const genListEnv: GeneratedWorkshopVersionListEnvelope = listEnv;
    expect(genListEnv.meta.canonical_authority).toBe("strategy_registry");

    // Verify workshops.ts client function return types assignability
    type ListFnReturn = ReturnType<typeof import("../agora/workshops").listWorkshopVersions>;
    type CreateFnReturn = ReturnType<typeof import("../agora/workshops").createWorkshopVersion>;
    type SelectFnReturn = ReturnType<typeof import("../agora/workshops").selectWorkshopVersion>;
    type ResearchFnReturn = ReturnType<typeof import("../agora/workshops").dispatchWorkshopResearchRun>;
    type ConsultFnReturn = ReturnType<typeof import("../agora/workshops").openWorkshopConsultation>;
    type ConcludeFnReturn = ReturnType<typeof import("../agora/workshops").concludeWorkshop>;

    const _testListRet: Promise<GeneratedWorkshopVersionListEnvelope> = null as unknown as ListFnReturn;
    const _testCreateRet: Promise<GeneratedWorkshopVersionCreateEnvelope> = null as unknown as CreateFnReturn;
    const _testSelectRet: Promise<GeneratedWorkshopVersionSelectEnvelope> = null as unknown as SelectFnReturn;
    const _testResearchRet: Promise<GeneratedWorkshopResearchRunEnvelope> = null as unknown as ResearchFnReturn;
    const _testConsultRet: Promise<GeneratedWorkshopConsultationEnvelope> = null as unknown as ConsultFnReturn;
    const _testConcludeRet: Promise<GeneratedWorkshopConcludeEnvelope> = null as unknown as ConcludeFnReturn;

    expect(_testListRet).toBeNull();
    expect(_testCreateRet).toBeNull();
    expect(_testSelectRet).toBeNull();
    expect(_testResearchRet).toBeNull();
    expect(_testConsultRet).toBeNull();
    expect(_testConcludeRet).toBeNull();
  });
});
