export type PplAlloc009JsonRecord = Record<string, unknown>;

const RECOMMENDATION_SNAPSHOT_ROW_FIELDS = [
  "persona_id",
  "rank",
  "score",
  "tier",
  "tier_id",
  "formula_version",
  "allocation_policy_input",
  "components",
  "metrics",
  "stage",
  "deployment_stage",
  "capital_mode",
  "capital_scope",
  "capital_scope_id",
  "capital_pool_id",
  "capital_sleeve_id",
  "paper_ledger_id",
  "current_weight",
  "target_weight",
  "delta",
  "current_weight_source",
  "binding_state",
  "binding_resolution",
  "runtime_resolution",
  "session_resolution",
  "telemetry_resolution",
  "binding_ids",
  "runtime_ids",
  "strategy_ids",
  "capital_pool_ids",
  "sleeve_ids",
  "artifact_ids",
  "broker_ids",
  "eligible",
  "exclusion_codes",
  "exclusion_reasons",
  "evidence_coverage",
  "source_confidence",
] as const;

export function bindPplAlloc009RecommendationSnapshot(
  recommendation: PplAlloc009JsonRecord,
  priorRankingSnapshotId: string,
): {
  priorRankingSnapshotId: string;
  rankingRow: PplAlloc009JsonRecord;
  recommendationSnapshotId: string;
  snapshotChangedSincePriorRanking: boolean;
} {
  if (recommendation.action_id !== "promote_to_canary_candidate") {
    throw new Error(
      "PPL-ALLOC-009 requires the authoritative promote_to_canary_candidate recommendation",
    );
  }
  const recommendationSnapshotId = String(
    recommendation.ranking_snapshot_id ?? "",
  ).trim();
  if (!recommendationSnapshotId) {
    throw new Error(
      "PPL-ALLOC-009 recommendation has no authoritative ranking snapshot",
    );
  }

  const rankingRow: PplAlloc009JsonRecord = {};
  for (const field of RECOMMENDATION_SNAPSHOT_ROW_FIELDS) {
    if (Object.hasOwn(recommendation, field)) {
      rankingRow[field] = recommendation[field];
    }
  }
  rankingRow.ranking_snapshot_id = recommendationSnapshotId;

  return {
    priorRankingSnapshotId,
    rankingRow,
    recommendationSnapshotId,
    snapshotChangedSincePriorRanking:
      recommendationSnapshotId !== priorRankingSnapshotId,
  };
}
