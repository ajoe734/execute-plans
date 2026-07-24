import { describe, expect, it } from "vitest";

import { bindPplAlloc009RecommendationSnapshot } from "../../e2e/helpers/pplAlloc009Recommendation";


describe("PPL-ALLOC-009 recommendation snapshot binding", () => {
  it("uses the recommendation snapshot and row when the earlier ranking moved", () => {
    const result = bindPplAlloc009RecommendationSnapshot(
      {
        action_id: "promote_to_canary_candidate",
        allocation_policy_input: {
          activity_score: 30,
          execution_score: 99,
          overall_score: 90,
          pnl_score: 100,
          risk_score: 93,
        },
        binding_ids: ["pcb-009"],
        capital_pool_id: "pool-009",
        capital_scope: "paper_ledger",
        capital_scope_id: "paper-ledger-009",
        capital_sleeve_id: "sleeve-009",
        components: {
          activity_score: 30,
          execution_score: 99,
          overall_score: 90,
          pnl_score: 100,
          risk_score: 93,
        },
        current_weight: 0.25,
        delta: 0.25,
        deployment_stage: "dev",
        eligible: true,
        evidence_ref_ids: ["metric-binding-009", "paper-session-009"],
        exclusion_codes: [],
        exclusion_reasons: [],
        formula_version: "pm12-v1",
        metrics: { pnl: 0.8, total_trades: 64 },
        paper_ledger_id: "paper-ledger-009",
        persona_id: "persona-009",
        ranking_snapshot_id: "ranking-recommendation-new",
        runtime_ids: ["runtime-009"],
        score: 90,
        stage: "paper_running",
        target_weight: 0.5,
        tier: "canary_candidate",
        tier_id: "tier-canary-candidate",
      },
      "ranking-prior-old",
    );

    expect(result.recommendationSnapshotId).toBe(
      "ranking-recommendation-new",
    );
    expect(result.snapshotChangedSincePriorRanking).toBe(true);
    expect(result.rankingRow).toMatchObject({
      allocation_policy_input: {
        overall_score: 90,
      },
      binding_ids: ["pcb-009"],
      capital_pool_id: "pool-009",
      capital_scope: "paper_ledger",
      capital_scope_id: "paper-ledger-009",
      capital_sleeve_id: "sleeve-009",
      components: {
        overall_score: 90,
      },
      current_weight: 0.25,
      delta: 0.25,
      deployment_stage: "dev",
      eligible: true,
      evidence_ref_ids: ["metric-binding-009", "paper-session-009"],
      exclusion_codes: [],
      exclusion_reasons: [],
      formula_version: "pm12-v1",
      metrics: { pnl: 0.8, total_trades: 64 },
      overall_score: 90,
      paper_ledger_id: "paper-ledger-009",
      persona_id: "persona-009",
      ranking_snapshot_id: "ranking-recommendation-new",
      runtime_ids: ["runtime-009"],
      score: 90,
      stage: "paper_running",
      target_weight: 0.5,
      tier: "canary_candidate",
      tier_id: "tier-canary-candidate",
    });
    expect(result.rankingRow.evidence_ref_ids).toEqual([
      "metric-binding-009",
      "paper-session-009",
    ]);
    expect(result.rankingRow.ranking_snapshot_id).not.toBe(
      result.priorRankingSnapshotId,
    );
  });

  it("rejects a non-promotion recommendation", () => {
    expect(() =>
      bindPplAlloc009RecommendationSnapshot(
        {
          action_id: "require_retraining",
          ranking_snapshot_id: "ranking-negative",
        },
        "ranking-prior",
      ),
    ).toThrow("promote_to_canary_candidate");
  });
});
