// 2026-05-22 PM-Live — verifies the mgmt.* façade returns seed shape in mock
// mode and that all 14 mgmt paths are reachable through the helpers.

import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import {
  adaptManagementEvidenceDetail,
  adaptManagementEvidenceOverview,
  adaptTradingPulseOverview,
  adaptHumanInboxDetail,
  adaptHumanInboxList,
  adaptManagementPersonaFleet,
  adaptOperationsReadModel,
  adaptPersonaIntent,
  adaptPortfolioExposureMonitor,
  adaptPortfolioHoldingRows,
  adaptQuarterlyRankingRows,
  defaultTradingPulseModel,
  mgmt,
} from "@/lib/bff-v1/management";
import { paths } from "@/lib/bff-v1/paths";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { composeCockpit, defaultCockpitSeed } from "@/lib/v5/management/cockpit";
import { defaultPulseRankings } from "@/lib/v5/management/tradingRankings";

beforeEach(() => {
  // Force mock mode regardless of env (matches detectMode test-mode pinning).
});

afterEach(() => {
  process.env.VITE_BFF_REAL_WRITES = "false";
  window.sessionStorage?.clear();
  window.localStorage?.clear();
  liveStatus._reset();
  vi.restoreAllMocks();
});

function writeSessionResponse(): Response {
  return new Response(JSON.stringify({
    data: {
      session: { authenticated: true, session_kind: "bearer" },
      environment: { name: "dev", strict_auth: false },
    },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mgmt façade (PM-Live)", () => {
  it("normalizes snake_case quarterly ranking rows for Persona focus", () => {
    const rows = adaptQuarterlyRankingRows({
      data: {
        items: [{
          persona_id: "persona-20260528-04688755",
          name: "Crypto-Alt-Hunter",
          rank: 9,
          overall_score: 53.875,
          tier: "tier-4",
          tier_label: "Incubation",
          eligible: false,
          exclusion_reason: "No telemetry coverage",
          quarter: "2026-Q3",
          metrics: { pnl: null, drawdown: null },
          components: { risk_score: 77.5, execution_score: 50, activity_score: 30 },
        }],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-20260528-04688755",
      personaName: "Crypto-Alt-Hunter",
      currentRank: 9,
      score: 53.875,
      eligibility: "insufficient_data",
      quarter: "2026-Q3",
      links: { manageHref: "/management/personas/persona-20260528-04688755" },
    });
    expect(Number.isNaN(rows?.[0].pnlQuarter)).toBe(true);
  });

  it("normalizes the operations read model confidence envelope", () => {
    const model = adaptOperationsReadModel({
      data: {
        identity: {
          persona_id: "persona-alpha",
          runtime_ids: ["runtime-alpha"],
          paper_ledger_ids: ["paper-alpha"],
          capital_pool_ids: ["pool-alpha"],
          sleeve_ids: [],
          strategy_ids: ["strategy-alpha"],
          artifact_ids: [],
          broker_ids: [],
          period: "30d",
          as_of: "2026-07-10T00:00:00Z",
        },
        data_confidence: "fallback",
        performance: { pnl: 48000, pnl_pct: 0.182, risk_pct: null },
        sources: [{ source_name: "persona_fleet", source_status: "ok", source_row_count: 1 }],
        diagnostics: [{ source_name: "performance_attribution", code: "MISSING_ATTRIBUTION_MATCH", message: "No match" }],
      },
    });

    expect(model?.identity.personaId).toBe("persona-alpha");
    expect(model?.identity.runtimeIds).toEqual(["runtime-alpha"]);
    expect(model?.dataConfidence).toBe("fallback");
    expect(model?.performance.pnl).toBe(48000);
    expect(model?.performance.riskPct).toBeUndefined();
    expect(model?.diagnostics[0].code).toBe("MISSING_ATTRIBUTION_MATCH");
  });

  it("normalizes portfolio exposure and holdings from the BFF snake_case envelope", () => {
    const exposure = adaptPortfolioExposureMonitor({
      data: {
        summary: {
          exposure_count: 1,
          risk_budget_total: 100,
          current_exposure_total: 40,
          available_budget_total: 60,
          risk_budget_utilization: 0.4,
          over_budget_count: 0,
          near_limit_count: 0,
          unknown_exposure_count: 0,
          telemetry_runtime_count: 1,
        },
        items: [{
          id: "portfolio-book-exposure-pool-alpha",
          capital_pool_id: "pool-alpha",
          name: "Alpha Pool",
          risk_budget: 100,
          current_exposure: 40,
          available_budget: 60,
          risk_budget_utilization: 0.4,
          risk_state: "within_budget",
          runtime_count: 1,
          active_runtime_count: 1,
          paper_runtime_count: 1,
          live_runtime_count: 0,
          telemetry: { total_pnl: 8 },
          source_refs: { runtime_ids: ["runtime-alpha"] },
        }],
      },
      meta: { surfaces: { portfolio_book_exposure: { status: "ok" } } },
    });
    const holdings = adaptPortfolioHoldingRows({
      data: {
        items: [{
          holding_id: "runtime-alpha:TXF",
          capital_pool_id: "pool-alpha",
          persona_id: "persona-alpha",
          runtime_id: "runtime-alpha",
          strategy_id: "strategy-alpha",
          symbol: "TXF",
          asset_class: "futures",
          side: "long",
          quantity: 2,
          mark_price: 15300,
          market_value: 30600,
          unrealized_pnl: 200,
          last_mark_at: "2026-07-10T00:00:00Z",
        }],
      },
    });

    expect(exposure?.summary.currentExposureTotal).toBe(40);
    expect(exposure?.items[0]).toMatchObject({
      capitalPoolId: "pool-alpha",
      riskState: "within_budget",
      runtimeIds: ["runtime-alpha"],
      telemetryAvailable: true,
    });
    expect(holdings?.[0]).toMatchObject({
      holdingId: "runtime-alpha:TXF",
      capitalPoolId: "pool-alpha",
      personaId: "persona-alpha",
      runtimeId: "runtime-alpha",
      symbol: "TXF",
      marketValue: 30600,
    });
  });

  it("cockpit.get falls through to seed in mock/test mode", async () => {
    const out = await mgmt.cockpit.get();
    const expected = composeCockpit(defaultCockpitSeed());
    expect(out.strip.fields.length).toBe(expected.strip.fields.length);
    expect(out.loopFlow.nodes.length).toBe(expected.loopFlow.nodes.length);
    expect(out.matrix.phases).toEqual(expected.matrix.phases);
  });

  it("tradingPulse.rankings returns default 8 blocks", async () => {
    const out = await mgmt.tradingPulse.rankings();
    expect(out).toEqual(defaultPulseRankings());
  });

  it("tradingPulse.get returns an explicit non-metric seed in mock/test mode", async () => {
    const seed = defaultTradingPulseModel();
    const out = await mgmt.tradingPulse.get(() => seed);
    expect(out).toBe(seed);
    expect(out.cards).toEqual([]);
    expect(out.meta.surfaces.management_trading_pulse.source).toBe("local_snapshot");
  });

  it("live-only management readers do not expose seeded data in mock/test mode", async () => {
    expect(await mgmt.cockpit.getLiveOnly()).toBeUndefined();
    expect(await mgmt.tradingPulse.getLiveOnly()).toBeUndefined();
    expect(await mgmt.tradingPulse.rankingsLiveOnly()).toEqual([]);
    expect(await mgmt.evidence.overviewLiveOnly()).toBeUndefined();
    expect(await mgmt.evidence.detailLiveOnly("evref-demo-readiness-001")).toBeUndefined();
    expect(await mgmt.personaIntent.listLiveOnly()).toEqual([]);
    expect(await mgmt.readiness.ep5LiveOnly()).toBeUndefined();
    expect(await mgmt.readiness.brokerLiveOnly()).toBeUndefined();
    expect(await mgmt.portfolioBook.summaryLiveOnly()).toBeUndefined();
    expect(await mgmt.portfolioBook.poolsLiveOnly()).toEqual([]);
    expect(await mgmt.portfolioBook.holdingsLiveOnly()).toEqual([]);
    expect(await mgmt.portfolioBook.exposureLiveOnly()).toBeUndefined();
    expect(await mgmt.personaLeague.listLiveOnly()).toEqual([]);
    expect(await mgmt.quarterlyRanking.listLiveOnly("2026-Q2")).toEqual([]);
    expect(await mgmt.quarterlyRanking.formulaLiveOnly()).toBeUndefined();
    expect(await mgmt.performanceAttribution.listLiveOnly("persona", "30d")).toEqual([]);
    expect(await mgmt.operationsReadModel.getLiveOnly("persona-alpha", "30d")).toBeUndefined();
  });

  it("adapts live Trading Pulse aggregate without falling back to legacy rows", () => {
    const out = adaptTradingPulseOverview({
      data: {
        id: "management-trading-pulse",
        summary: {
          runtime_count: 2,
          telemetry_coverage_count: 2,
          total_pnl: -12.5,
          average_fill_rate: 0.71234,
          baseline_comparison_count: 1,
          baseline_breached_count: 0,
          by_status: { active: 2 },
          by_stage: { paper: 2 },
          by_baseline_status: { ok: 1, unavailable: 1 },
        },
        cards: [
          { card_id: "pnl", label: "P&L", value: -12.5 },
          { card_id: "execution-quality", label: "Execution Quality", value: 0.71234 },
        ],
        runtime_rows: [
          {
            runtime_id: "rt-live-1",
            runtime_binding_id: "rb-live-1",
            deployment_stage: "paper",
            status: "active",
            telemetry_summary: {
              metrics: { pnl: -12.5, fill_rate: 0.71234, total_trades: 4 },
            },
            row_health: {
              status: "degraded",
              degraded_checks: ["paper_runtime_monitoring"],
            },
            baseline_comparison: {
              runtime_id: "rt-live-1",
              status: "ok",
              metric_count: 3,
              breached_metric_count: 0,
            },
          },
        ],
        baseline_comparisons: [
          { runtime_id: "rt-live-1", status: "ok", metric_count: 3 },
        ],
      },
      meta: {
        snapshot_at: "2026-06-30T01:38:44Z",
        surfaces: {
          management_trading_pulse: { status: "degraded", source: "bff_composed", message: "partial coverage" },
          paper_live_drift: { status: "degraded", source: "service_store" },
        },
        coverage: {
          runtimeCount: 2,
          missingMonitoringRuntimeIds: ["rt-live-1"],
        },
      },
    });

    expect(out?.summary.runtimeCount).toBe(2);
    expect(out?.summary.totalPnl).toBe(-12.5);
    expect(out?.cards.map((card) => card.cardId)).toEqual(["pnl", "execution-quality"]);
    expect(out?.runtimeRows[0]).toMatchObject({
      runtimeId: "rt-live-1",
      runtimeBindingId: "rb-live-1",
      deploymentStage: "paper",
      metrics: { pnl: -12.5, fill_rate: 0.71234, total_trades: 4 },
      baselineComparison: { status: "ok", metricCount: 3 },
      rowHealth: { status: "degraded", degraded_checks: ["paper_runtime_monitoring"] },
    });
    expect(out?.meta.surfaces.paper_live_drift.status).toBe("degraded");
    expect(out?.meta.coverage).toMatchObject({ missingMonitoringRuntimeIds: ["rt-live-1"] });
  });

  it("adapts legacy Trading Pulse rows as degraded local snapshots", () => {
    const out = adaptTradingPulseOverview({
      data: [
        { surface: "paper", current: 1.42, baselineKind: "previous_artifact", baselineValue: 1.31 },
      ],
    });

    expect(out?.cards[0]).toMatchObject({ cardId: "paper", value: 1.42 });
    expect(out?.meta.surfaces.management_trading_pulse.source).toBe("local_snapshot");
  });

  it("humanInbox.list returns no mock rows outside live mode", async () => {
    const out = await mgmt.humanInbox.list();
    expect(out).toEqual([]);
  });

  it("humanInbox.get returns no mock detail outside live mode", async () => {
    const out = await mgmt.humanInbox.get("abc-1");
    expect(out).toBeUndefined();
  });

  it("adapts live Human Inbox list records to existing FE detail routes", () => {
    const out = adaptHumanInboxList({
      data: {
        items: [
          {
            id: "readiness_blocker:persona:persona-us-equity",
            inboxType: "readiness_blocker",
            title: "Persona needs review: US Equity Persona",
            summary: "paper observation and OOS cost review",
            action_state: "pending",
            can_proceed: false,
            allowed_actions: { can_decide: false },
            route: "/management/persona-fleet?persona=persona-us-equity",
            blocking_reasons: ["Missing validation packet"],
            research_context: {
              current_research_projects: [
                { evidence_refs: ["support/evidence/MGMT-QLIB-001/dataset_manifest.json"] },
              ],
              data_source_status: {
                readback_refs: ["support/evidence/readback/ibkr.json"],
              },
            },
          },
          {
            id: "governance-review:approval-1",
            source_type: "governance_review",
            title: "Governance review: ApprovalDecision",
            route: "/governance-review-queue?item=approval-1",
          },
        ],
      },
    });

    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({
      id: "readiness_blocker:persona:persona-us-equity",
      kind: "readiness_blocker",
      canDecide: false,
      canProceed: false,
      detailHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-us-equity",
      blockingReasons: ["Missing validation packet"],
      evidenceRefs: [
        "support/evidence/MGMT-QLIB-001/dataset_manifest.json",
        "support/evidence/readback/ibkr.json",
      ],
      links: {
        manageHref: "/management/persona-fleet?persona=persona-us-equity",
        recommendedActionHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-us-equity",
      },
    });
    expect(out?.[1]).toMatchObject({
      kind: "approval",
      detailHref: "/management/human-inbox/governance-review%3Aapproval-1",
      links: {
        manageHref: "/management/governance?item=approval-1",
      },
    });
  });

  it("adapts live Human Inbox detail records with safe detail-page defaults", () => {
    const out = adaptHumanInboxDetail({
      data: {
        item: {
          id: "readiness_blocker:persona:persona-crypto",
          source_type: "readiness_blocker",
          title: "Persona needs review: Crypto Persona",
          summary: "paper broker sandbox readback and funding-rate stress review",
          canProceed: false,
          allowedActions: { canDecide: false },
          route: "/management/persona-fleet?persona=persona-crypto",
          research_context: {
            recommendation: "hold_for_risk_owner_review",
            current_research_projects: [
              {
                evidence_refs: [
                  {
                    ref_type: "management_linkage_packet",
                    ref_id: "mgmt-crypto-linkage-v1",
                    ref: "support/evidence/research/crypto.json",
                  },
                ],
              },
            ],
            data_source_status: {
              readback_refs: ["support/evidence/readback/kraken.json"],
              unavailable_refs: ["support/evidence/unavailable/coingecko.json"],
              research_dataset_manifest_ref: "support/evidence/datasets/crypto-manifest.json",
            },
          },
        },
      },
    });

    expect(out).toMatchObject({
      id: "readiness_blocker:persona:persona-crypto",
      kind: "readiness_blocker",
      requiredRole: "risk-owner",
      canDecide: false,
      decisionType: "single",
      signatures: [],
      evidenceRefs: [
        "support/evidence/research/crypto.json",
        "support/evidence/readback/kraken.json",
        "support/evidence/unavailable/coingecko.json",
        "support/evidence/datasets/crypto-manifest.json",
      ],
      decisionHistory: [],
      auditRefs: [],
      detailHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-crypto",
      links: {
        manageHref: "/management/persona-fleet?persona=persona-crypto",
      },
    });
  });

  it("adapts promotion review inbox records as decidable review items", () => {
    const out = adaptHumanInboxList({
      items: [
        {
          review_id: "review-persona-paper-1",
          kind: "promotion_review",
          source_type: "promotion_review",
          persona_id: "persona-paper-1",
          review_type: "promotion_to_canary",
          title: "Paper to Canary promotion review: Paper Persona",
          summary: "promotion_to_canary is awaiting human decision.",
          status: "pending",
          action_state: "pending",
          canDecide: true,
          canProceed: false,
          decisionHref: "/bff/management/promotion-reviews/review-persona-paper-1/decisions",
          evidence_refs: ["evidence:persona-paper-1:paper-score"],
          allowedActions: {
            canApprove: true,
            canReject: true,
            canRequestEvidence: true,
          },
        },
      ],
    });

    expect(out).toHaveLength(1);
    expect(out?.[0]).toMatchObject({
      id: "promotion_review:review-persona-paper-1",
      kind: "promotion_review",
      reviewId: "review-persona-paper-1",
      reviewType: "promotion_to_canary",
      personaId: "persona-paper-1",
      status: "pending",
      canDecide: true,
      canProceed: false,
      decisionHref: "/bff/management/promotion-reviews/review-persona-paper-1/decisions",
      evidenceRefs: ["evidence:persona-paper-1:paper-score"],
      allowedActions: {
        canDecide: true,
        canApprove: true,
        canReject: true,
        canRequestEvidence: true,
      },
      detailHref: "/management/human-inbox/promotion_review%3Areview-persona-paper-1",
      links: {
        manageHref: "/management/persona-fleet?persona=persona-paper-1",
      },
    });
  });

  it("does not POST promotion review decisions when real writes are disabled", async () => {
    process.env.VITE_BFF_REAL_WRITES = "false";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await mgmt.humanInbox.decidePromotionReview(
      "promotion_review:review-disabled",
      { decision: "approve", rationale: "Paper evidence passed." },
      { idempotencyKey: "idk-disabled" },
    );

    expect(result).toMatchObject({
      ok: true,
      persisted: false,
      reviewId: "review-disabled",
      status: "write_disabled",
      idempotencyKey: "idk-disabled",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs promotion review decisions to the governed BFF route when real writes are enabled", async () => {
    process.env.VITE_BFF_REAL_WRITES = "true";
    window.sessionStorage.setItem("pantheon.bff.bearerToken", "tok-review-test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    let decisionUrl = "";
    let decisionBody: Record<string, unknown> = {};
    let decisionHeaders: Record<string, string> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) return writeSessionResponse();
      decisionUrl = url;
      decisionBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      decisionHeaders = init?.headers as Record<string, string>;
      return jsonResponse({
        status: "approved",
        decision: { decision_id: "approval-review-enabled", outcome: "approved" },
        meta: { idempotency: { idempotencyKey: "idk-review-enabled", replayed: false } },
      });
    });

    const result = await mgmt.humanInbox.decidePromotionReview(
      "promotion_review:review-enabled",
      {
        decision: "approve",
        rationale: "Paper evidence passed risk and cost gates.",
        evidenceRefs: ["evidence:review-enabled"],
      },
      { idempotencyKey: "idk-review-enabled" },
    );

    expect(decisionUrl.endsWith("/bff/management/promotion-reviews/review-enabled/decisions")).toBe(true);
    expect(decisionBody).toMatchObject({
      decision: "approve",
      rationale: "Paper evidence passed risk and cost gates.",
      evidence_refs: ["evidence:review-enabled"],
    });
    expect(decisionHeaders["Idempotency-Key"]).toBe("idk-review-enabled");
    expect(result).toMatchObject({
      ok: true,
      persisted: true,
      reviewId: "review-enabled",
      status: "approved",
      idempotencyKey: "idk-review-enabled",
      replayed: false,
    });
  });

  it("does not POST ranking recommendations when real writes are disabled", async () => {
    process.env.VITE_BFF_REAL_WRITES = "false";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await mgmt.quarterlyRanking.submitRecommendation(
      {
        recommendationId: "pm12-rec-disabled",
        actionId: "promote_to_canary_candidate",
        quarter: "2026-Q3",
        personaId: "persona-disabled",
        personaName: "Disabled Persona",
        source: "quarterly_ranking",
        evidenceRefs: ["evidence:disabled"],
      },
      { idempotencyKey: "idk-ranking-disabled" },
    );

    expect(result).toMatchObject({
      ok: true,
      persisted: false,
      recommendationId: "pm12-rec-disabled",
      actionId: "promote_to_canary_candidate",
      quarter: "2026-Q3",
      personaId: "persona-disabled",
      status: "write_disabled",
      idempotencyKey: "idk-ranking-disabled",
      liveCapitalMutation: false,
      governanceDestinations: ["human_inbox", "governance_queue", "human_gate_decision"],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs ranking recommendations as governed commands when real writes are enabled", async () => {
    process.env.VITE_BFF_REAL_WRITES = "true";
    window.sessionStorage.setItem("pantheon.bff.bearerToken", "tok-ranking-test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    let commandUrl = "";
    let commandBody: Record<string, unknown> = {};
    let commandHeaders: Record<string, string> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) return writeSessionResponse();
      commandUrl = url;
      commandBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      commandHeaders = init?.headers as Record<string, string>;
      return jsonResponse({
        status: "accepted",
        data: {
          status: "accepted",
          commandId: "cmd-ranking-enabled",
          humanInboxId: "promotion_review:review-ranking-enabled",
          detailHref: "/management/human-inbox/promotion_review%3Areview-ranking-enabled",
        },
        meta: { idempotency: { idempotencyKey: "idk-ranking-enabled", replayed: false } },
      }, 202);
    });

    const result = await mgmt.quarterlyRanking.submitRecommendation(
      {
        recommendationId: "pm12-rec-enabled",
        actionId: "promote_to_canary_candidate",
        quarter: "2026-Q3",
        personaId: "persona-enabled",
        personaName: "Enabled Persona",
        source: "persona_league",
        evidenceRefs: ["evidence:enabled"],
        governanceDestinations: ["human_inbox", "human_gate_decision"],
      },
      { idempotencyKey: "idk-ranking-enabled" },
    );

    expect(commandUrl.endsWith("/bff/management/quarterly-ranking/recommendations/pm12-rec-enabled/submit")).toBe(true);
    expect(commandBody).toMatchObject({
      quarter: "2026-Q3",
      recommendation_id: "pm12-rec-enabled",
      recommendationId: "pm12-rec-enabled",
      recommendation_action_id: "promote_to_canary_candidate",
      recommendationActionId: "promote_to_canary_candidate",
      actionId: "promote_to_canary_candidate",
      persona_id: "persona-enabled",
      personaId: "persona-enabled",
      evidence_refs: ["evidence:enabled"],
      governance_destinations: ["human_inbox", "human_gate_decision"],
      live_capital_mutation: false,
      liveCapitalMutation: false,
      direct_live_capital_mutation: false,
      runtime_mutation: false,
    });
    expect(commandHeaders["Idempotency-Key"]).toBe("idk-ranking-enabled");
    expect(result).toMatchObject({
      ok: true,
      persisted: true,
      recommendationId: "pm12-rec-enabled",
      actionId: "promote_to_canary_candidate",
      quarter: "2026-Q3",
      personaId: "persona-enabled",
      status: "accepted",
      idempotencyKey: "idk-ranking-enabled",
      commandId: "cmd-ranking-enabled",
      humanInboxId: "promotion_review:review-ranking-enabled",
      detailHref: "/management/human-inbox/promotion_review%3Areview-ranking-enabled",
      replayed: false,
      liveCapitalMutation: false,
    });
  });

  it("readiness helpers all pass seed through", async () => {
    const seed = { header: { title: "t" }, checklist: [], packets: [], blockers: [] } as never;
    for (const fn of [
      mgmt.readiness.ep5, mgmt.readiness.brokerLive,
      mgmt.readiness.capitalBinding, mgmt.readiness.bffHa,
      mgmt.readiness.strictPublish,
    ]) {
      const out = await fn(() => seed);
      expect(out).toBe(seed);
    }
  });

  it("array helpers pass seed through", async () => {
    const seed = [{ id: 1 }, { id: 2 }] as never[];
    expect(await mgmt.evolutionJournal.list(() => seed)).toBe(seed);
    expect(await mgmt.evidence.list(() => seed)).toBe(seed);
    expect(await mgmt.personaIntent.list(() => seed as never)).toBe(seed);
  });

  it("adapts management Evidence Explorer envelopes into production evidence rows", () => {
    const out = adaptManagementEvidenceOverview({
      data: [
        {
          id: "evref-rart-20260615-002",
          refId: "evref-rart-20260615-002",
          title: "TW momentum candidate",
          sourceType: null,
          sourceRef: "object://opaque/not-for-ui",
          capturedAt: "2026-06-15T13:06:00Z",
          linkType: "provenance",
          credibility: { tier: "producer_record", verified: true },
          linkedObjectSummary: {
            entity_type: "artifact",
            entity_ref: "rart-20260615-002",
            display_label: "TW momentum candidate",
          },
          linkedObjectLink: {
            availability: "available",
            route_href: "/management/artifacts/rart-20260615-002",
            display_label: "TW momentum candidate",
            entity_type: "artifact",
            entity_ref: "rart-20260615-002",
          },
          resolvedLink: {
            availability: "unavailable",
            route_href: null,
            display_label: "Source unavailable",
            open_in_new_tab: false,
          },
          actionability: {
            state: "unresolved_source",
            severity: "warning",
            reasons: ["resolved_link_unavailable"],
            can_trace: false,
            can_open_source: false,
            can_open_linked_object: true,
          },
          operation: {
            status: "needs_evidence",
            reviewer: "ops-reviewer",
            task_refs: ["EVID-OPS-20260615-abc123"],
            command_refs: ["cmd-001"],
            audit_refs: ["audit-001"],
          },
          allowedActions: {
            canOpenSource: false,
            canOpenLinkedObject: true,
            canInspectChain: true,
            canMarkStale: true,
            canRequestEvidence: true,
            canCreateDispositionTask: false,
            canAssignReviewer: true,
            canResolve: true,
          },
          disabledActionReasons: {
            canOpenSource: "Source link is unavailable or incomplete.",
            canCreateDispositionTask: "A disposition task is already attached.",
          },
          managementHref: "/management/evidence?ref_id=evref-rart-20260615-002",
        },
      ],
      summary: {
        totalEvidence: 1,
        visibleEvidence: 1,
        verifiedEvidence: 1,
        redactedEvidence: 0,
        byCredibilityTier: { producer_record: 1 },
        traceableEvidence: 0,
        needsAttentionEvidence: 1,
        openOperationEvidence: 1,
        byActionabilityState: { unresolved_source: 1 },
        byOperationStatus: { needs_evidence: 1 },
      },
      meta: {
        snapshot_at: "2026-06-30T12:23:04Z",
        surfaces: {
          management_evidence: { status: "ok", source: "bff_composed" },
          evidence_refs: { status: "ok", source: "service_store" },
        },
      },
    });

    expect(out?.summary.verifiedEvidence).toBe(1);
    expect(out?.items[0]).toMatchObject({
      refId: "evref-rart-20260615-002",
      title: "TW momentum candidate",
      linkType: "provenance",
      credibility: { tier: "producer_record", verified: true },
      linkedObjectSummary: {
        entityType: "artifact",
        entityRef: "rart-20260615-002",
        displayLabel: "TW momentum candidate",
      },
      linkedObjectLink: {
        availability: "available",
        routeHref: "/management/artifacts/rart-20260615-002",
        displayLabel: "TW momentum candidate",
        entityType: "artifact",
        entityRef: "rart-20260615-002",
      },
      resolvedLink: {
        availability: "unavailable",
        routeHref: null,
        displayLabel: "Source unavailable",
      },
      actionability: {
        state: "unresolved_source",
        severity: "warning",
        reasons: ["resolved_link_unavailable"],
        canOpenLinkedObject: true,
      },
      operation: {
        status: "needs_evidence",
        reviewer: "ops-reviewer",
        taskRefs: ["EVID-OPS-20260615-abc123"],
        commandRefs: ["cmd-001"],
        auditRefs: ["audit-001"],
      },
      allowedActions: {
        canOpenSource: false,
        canOpenLinkedObject: true,
        canCreateDispositionTask: false,
        canResolve: true,
      },
      disabledActionReasons: {
        canOpenSource: "Source link is unavailable or incomplete.",
        canCreateDispositionTask: "A disposition task is already attached.",
      },
      managementHref: "/management/evidence?ref_id=evref-rart-20260615-002",
    });
    expect(out?.summary).toMatchObject({
      traceableEvidence: 0,
      needsAttentionEvidence: 1,
      openOperationEvidence: 1,
      byActionabilityState: { unresolved_source: 1 },
      byOperationStatus: { needs_evidence: 1 },
    });
    expect(out?.items[0] as unknown as Record<string, unknown>).not.toHaveProperty("sourceRef");
  });

  it("adapts knowledge evidence detail without exposing opaque storage refs", () => {
    const out = adaptManagementEvidenceDetail({
      ref_id: "evref-note-001",
      source_document: {
        title: "Admission readiness packet",
        source_type: "research_note",
        excerpt: "Plain text excerpt",
        source_ref: "storage://opaque/not-for-ui",
        storage_preview: {
          available: true,
          preview_type: "pdf",
          preview_token: "short-lived-token",
        },
        captured_at: "2026-06-15T13:02:00Z",
        captured_by: "Research Orchestrator",
      },
      link_type: "supporting_evidence",
      credibility: {
        tier: "primary",
        verified: true,
        last_verified_at: "2026-06-15T13:04:00Z",
        verification_method: "readiness_review",
      },
      resolved_link: {
        availability: "available",
        route_href: "/knowledge/notes/note-001",
        display_label: "Open source note",
        open_in_new_tab: false,
      },
      linked_object_summary: {
        entity_type: "artifact",
        entity_ref: "rart-20260615-001",
        display_label: "TW momentum factor candidate model",
      },
      linked_object_link: {
        availability: "available",
        route_href: "/management/artifacts/rart-20260615-001",
        display_label: "TW momentum factor candidate model",
        entity_type: "artifact",
        entity_ref: "rart-20260615-001",
      },
      linked_decisions: [
        {
          entity_type: "decision",
          entity_ref: "decision-001",
          display_label: "Approve artifact admission",
          route_href: "/management/human-inbox/decision-001",
          link_type: "supporting_evidence",
          relationship_note: "Supports admission",
        },
      ],
      source_note_context: {
        note_id: "note-001",
        title: "Admission note",
        excerpt: "Note context",
        route_href: "/knowledge/notes/note-001",
      },
      source_memory_context: null,
      created_at: "2026-06-15T13:02:00Z",
      actionability: {
        state: "traceable",
        severity: "ok",
        reasons: [],
        can_trace: true,
        can_open_source: true,
        can_open_linked_object: true,
      },
      operation: {
        status: "needs_reviewer",
        reviewer: "risk-reviewer",
        task_refs: ["EVID-OPS-20260615-001"],
        command_refs: ["cmd-001"],
        audit_refs: ["audit-001"],
      },
      relationships: {
        artifacts: [
          {
            entity_type: "artifact",
            entity_ref: "rart-20260615-001",
            display_label: "TW momentum factor candidate model",
            route_href: "/management/artifacts/rart-20260615-001",
            link_type: "supporting_evidence",
          },
        ],
        decisions: [
          {
            entity_type: "decision",
            entity_ref: "decision-001",
            display_label: "Approve artifact admission",
            route_href: "/management/human-inbox/decision-001",
          },
        ],
      },
      chain: {
        nodes: [
          { id: "source:note-001", type: "research_note", label: "Admission note", route_href: "/knowledge/notes/note-001" },
          { id: "evidence:evref-note-001", type: "evidence_ref", label: "Admission readiness packet", route_href: "/management/evidence?ref_id=evref-note-001" },
          { id: "artifact:rart-20260615-001", type: "artifact", label: "TW momentum factor candidate model", route_href: "/management/artifacts/rart-20260615-001" },
        ],
        edges: [
          { from: "source:note-001", to: "evidence:evref-note-001", relationship: "captured_as_evidence" },
          { from: "evidence:evref-note-001", to: "artifact:rart-20260615-001", relationship: "supporting_evidence" },
        ],
      },
      tasks: [
        {
          task_ref: "EVID-OPS-20260615-001",
          status: "linked",
          materialization: "operation_projection",
        },
      ],
      audit_events: [
        {
          audit_ref: "audit-001",
          event_id: "evop-001",
          action: "assign_reviewer",
          actor_id: "operator",
          created_at: "2026-06-15T13:05:00Z",
          status_after: "needs_reviewer",
          command_id: "cmd-001",
        },
      ],
      allowed_actions: {
        can_open_source: true,
        can_open_linked_object: true,
        can_inspect_chain: true,
        can_mark_stale: true,
        can_request_evidence: true,
        can_create_disposition_task: false,
        can_assign_reviewer: true,
        can_resolve: true,
      },
      disabled_action_reasons: {
        can_create_disposition_task: "A disposition task is already attached.",
      },
      meta: {
        snapshot_at: "2026-06-30T12:23:04Z",
        surfaces: {
          evidence_ref_detail: "ok",
          resolved_link: "ok",
          linked_decisions: "ok",
        },
        redacted_evidence_count: 0,
      },
    });

    expect(out).toMatchObject({
      refId: "evref-note-001",
      sourceDocument: {
        title: "Admission readiness packet",
        sourceType: "research_note",
        excerpt: "Plain text excerpt",
        storagePreview: { available: true, previewType: "pdf" },
      },
      credibility: {
        tier: "primary",
        verified: true,
        lastVerifiedAt: "2026-06-15T13:04:00Z",
        verificationMethod: "readiness_review",
      },
      resolvedLink: {
        availability: "available",
        routeHref: "/knowledge/notes/note-001",
        displayLabel: "Open source note",
      },
      linkedObjectSummary: {
        entityType: "artifact",
        entityRef: "rart-20260615-001",
        displayLabel: "TW momentum factor candidate model",
      },
      linkedObjectLink: {
        availability: "available",
        routeHref: "/management/artifacts/rart-20260615-001",
        displayLabel: "TW momentum factor candidate model",
      },
      linkedDecisions: [
        {
          entityType: "decision",
          entityRef: "decision-001",
          routeHref: "/management/human-inbox/decision-001",
        },
      ],
      actionability: {
        state: "traceable",
        severity: "ok",
        canTrace: true,
        canOpenSource: true,
        canOpenLinkedObject: true,
      },
      operation: {
        status: "needs_reviewer",
        reviewer: "risk-reviewer",
        taskRefs: ["EVID-OPS-20260615-001"],
        commandRefs: ["cmd-001"],
        auditRefs: ["audit-001"],
      },
      relationships: {
        artifacts: [
          {
            entityType: "artifact",
            entityRef: "rart-20260615-001",
            routeHref: "/management/artifacts/rart-20260615-001",
          },
        ],
        decisions: [
          {
            entityType: "decision",
            entityRef: "decision-001",
            routeHref: "/management/human-inbox/decision-001",
          },
        ],
      },
      chain: {
        nodes: [
          { id: "source:note-001", routeHref: "/knowledge/notes/note-001" },
          { id: "evidence:evref-note-001", routeHref: "/management/evidence?ref_id=evref-note-001" },
          { id: "artifact:rart-20260615-001", routeHref: "/management/artifacts/rart-20260615-001" },
        ],
        edges: [
          { from: "source:note-001", to: "evidence:evref-note-001", relationship: "captured_as_evidence" },
          { from: "evidence:evref-note-001", to: "artifact:rart-20260615-001", relationship: "supporting_evidence" },
        ],
      },
      tasks: [
        {
          taskRef: "EVID-OPS-20260615-001",
          status: "linked",
        },
      ],
      auditEvents: [
        {
          auditRef: "audit-001",
          eventId: "evop-001",
          action: "assign_reviewer",
          statusAfter: "needs_reviewer",
        },
      ],
      allowedActions: {
        canOpenSource: true,
        canOpenLinkedObject: true,
        canInspectChain: true,
        canCreateDispositionTask: false,
      },
      disabledActionReasons: {
        canCreateDispositionTask: "A disposition task is already attached.",
      },
    });
    expect(out?.sourceDocument as unknown as Record<string, unknown>).not.toHaveProperty("sourceRef");
    expect(out?.sourceDocument.storagePreview as unknown as Record<string, unknown>).not.toHaveProperty("previewToken");
  });

  it("adapts live Persona Intent aggregates into safe UI rows", () => {
    const rows = adaptPersonaIntent({
      items: [
        {
          id: "persona_trace:sess-001",
          source_type: "persona_trace",
          source_id: "sess-001",
          persona_id: "persona-alpha",
          title: "Persona trace sess-001",
          summary: "Interactive session intent summary.",
          status: "active",
          occurred_at: "2026-04-11T11:55:00Z",
          redacted: true,
          redaction: {
            policy: "management_persona_intent_public_summary",
            redacted_by: "bff",
          },
          raw_prompt: "debug raw prompt if BFF sends one",
          risk_flags: ["policy-flag"],
          evidence_refs: ["ev-001"],
        },
      ],
    });

    expect(rows?.[0]).toMatchObject({
      id: "persona_trace:sess-001",
      sourceType: "persona_trace",
      sourceId: "sess-001",
      sourceStatus: "active",
      ringPersonaId: "persona-alpha",
      visibility: "redacted",
      userIntentSummary: "Interactive session intent summary.",
      redaction: {
        status: "redacted",
        policyRef: "management_persona_intent_public_summary",
        redactedBy: "bff",
      },
      riskFlags: ["policy-flag"],
      evidenceRefs: ["ev-001"],
      createdAt: "2026-04-11T11:55:00Z",
    });
    expect(rows?.[0].debugRecord).toMatchObject({
      raw_prompt: "debug raw prompt if BFF sends one",
      summary: "Interactive session intent summary.",
    });
  });

  it("personaFleet.get does not serve demo rows in mock mode", async () => {
    await expect(mgmt.personaFleet.get()).rejects.toThrow("demo fallback is disabled");
  });

  // PPL-ALLOC-006 — allocationPolicy.evaluate posts the caller's rows to the
  // PPL-ALLOC-004 policy endpoint and adapts the returned lines; it never
  // computes target weights or cap reasons itself.
  it("posts allocation-policy rows and adapts the returned target-weight lines", async () => {
    let requestUrl = "";
    let requestBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return jsonResponse({
        data: {
          ranking_snapshot_id: "snap-2026-q3",
          lines: [{
            persona_id: "persona-canary-alpha",
            stage: "canary_running",
            capital_scope: "real",
            capital_sleeve_id: "sleeve-canary-01",
            current_weight: 0.03,
            target_weight: 0.05,
            delta: 0.02,
            rank_score: 0.42,
            capacity_adjusted_score: 0.42,
            recommendation: "canary_to_live_review",
            cap_reasons: ["canary_cap"],
            exclusions: [],
            evidence_refs: ["evidence:canary-alpha-q3"],
            requires_human_approval: true,
          }],
          applied: false,
        },
      });
    });

    const lines = await mgmt.allocationPolicy.evaluate([{
      personaId: "persona-canary-alpha",
      stage: "canary_running",
      capitalScope: "real",
      capitalSleeveId: "sleeve-canary-01",
      currentWeight: 0.03,
      pnlScore: 80,
    }], { rankingSnapshotId: "snap-2026-q3" });

    expect(requestUrl).toMatch(/management\/allocation-policy\/evaluate$/);
    expect(requestBody).toMatchObject({
      ranking_snapshot_id: "snap-2026-q3",
      rows: [expect.objectContaining({ persona_id: "persona-canary-alpha", current_weight: 0.03, pnl_score: 80 })],
    });
    expect(lines).toEqual([{
      personaId: "persona-canary-alpha",
      stage: "canary_running",
      capitalScope: "real",
      capitalPoolId: undefined,
      capitalSleeveId: "sleeve-canary-01",
      currentWeight: 0.03,
      targetWeight: 0.05,
      delta: 0.02,
      rankScore: 0.42,
      capacityAdjustedScore: 0.42,
      recommendation: "canary_to_live_review",
      capReasons: ["canary_cap"],
      exclusions: [],
      evidenceRefs: ["evidence:canary-alpha-q3"],
      requiresHumanApproval: true,
    }]);
  });

  it("adapts Pathreon management fleet envelopes into UI-safe rows", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        persona_fleet: [
          {
            persona_id: "persona-tw-equity",
            persona_name: "Taiwan Equity Persona",
            owner: "pathreon-management",
            ooda_stage: "decide",
            governance_required: true,
            recommendation: "hold_for_risk_owner_review",
            runtime_id: "rt-rescue-0260528-5937dea1",
            runtime_binding_id: "rb-433f2a614995432b9e7a463c882dbefb",
            deployment_stage: "paper",
            capital_mode: "paper",
            paper_ledger_id: "paper-ledger-persona-tw-equity",
            paper_ledger: {
              id: "paper-ledger-persona-tw-equity",
              mode: "paper",
              isolated: true,
              benchmark_budget: 1000000,
            },
            capital_pool_id: "cp-paper-tw-equity",
            paper_capital_pool_id: "cp-paper-tw-equity",
            capital_pool: {
              id: "cp-paper-tw-equity",
              mode: "paper",
              live_capital_enabled: false,
            },
            runtime_binding: {
              id: "rb-433f2a614995432b9e7a463c882dbefb",
              runtime_id: "rt-rescue-0260528-5937dea1",
              state: "running",
              deployment_stage: "paper",
              capital_mode: "paper",
              health: "healthy",
            },
            runtime_health: { status: "healthy" },
            review: {
              id: "review-paper-to-live-tw",
              type: "paper_to_live",
              status: "pending_human_review",
              inbox_id: "promotion_review:review-paper-to-live-tw",
              requires_human_gate: true,
            },
            rank: {
              league_rank: 2,
              league_score: 91.7,
              basis: "quarterly_paper_live_league",
            },
            metrics: { training_improvement_pct: 9.5 },
            updated_at: "2026-06-07T13:00:00Z",
            status: "needs_human_approval",
            data_source_status: {
              state: "partial_readback",
              provider_statuses: {
                twse: "read_unavailable",
                tpex: "read_unavailable",
                mops: "public_reference_unavailable",
                tej: "credential_unavailable",
                shioaji: "read_ok",
              },
              readback_refs: ["support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-quote-readback/shioaji.json"],
              unavailable_refs: ["support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/twse.json"],
              live_ingestion_enabled: false,
              order_side_effects_allowed: false,
              capital_side_effects_allowed: false,
            },
            data_sources: [
              {
                provider_key: "shioaji",
                provider: "Shioaji quote",
                source_class: "broker_execution",
                status: "read_ok",
                evidence_ref: "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-quote-readback/shioaji.json",
                order_path: "disabled_for_marketdata_smoke",
                order_capable_provider: true,
                read_only: true,
                order_side_effects_allowed: false,
                capital_side_effects_allowed: false,
              },
              {
                provider_key: "twse",
                provider: "TWSE OpenAPI",
                source_class: "official_reference",
                status: "read_unavailable",
                evidence_ref: "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/twse.json",
                order_path: "not_applicable",
              },
            ],
            research_status: {
              stage: "management_review_linked",
              framework: "qlib",
              frameworks: ["qlib", "vectorbt"],
              experiment_id: "exp-mgmt-qlib-006",
              artifact_id: "qlib-tw-cross-sectional-alpha-model-draft-v1",
              registry_admission_status: "pending_upstream_task",
              pending_task_ids: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
              can_deploy: false,
            },
            current_research_projects: [
              {
                project_id: "MGMT-QLIB-006",
                title: "Qlib TW cross-sectional equity alpha admission linkage",
                stage: "management_review_linked",
                frameworks: ["qlib", "vectorbt"],
                artifact_id: "qlib-tw-cross-sectional-alpha-model-draft-v1",
                experiment_id: "exp-mgmt-qlib-006",
                blocked_by_task_ids: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
                can_deploy: false,
              },
            ],
          },
          {},
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-tw-equity",
      personaName: "Taiwan Equity Persona",
      owner: "pathreon-management",
      ooda: "Decide",
      autonomy: "supervised",
      perfDelta: 0.095,
      humanNeeded: true,
      lastMutation: "2026-06-07",
      state: "needs_human_approval",
      runtimeId: "rt-rescue-0260528-5937dea1",
      runtimeBindingId: "rb-433f2a614995432b9e7a463c882dbefb",
      deploymentStage: "paper",
      capitalMode: "paper",
      paperLedgerId: "paper-ledger-persona-tw-equity",
      paperCapitalPoolId: "cp-paper-tw-equity",
      runtimeHealth: { status: "healthy" },
      reviewId: "review-paper-to-live-tw",
      reviewType: "paper_to_live",
      reviewStatus: "pending_human_review",
      inboxId: "promotion_review:review-paper-to-live-tw",
      leagueRank: 2,
      leagueScore: 91.7,
      rank: {
        leagueRank: 2,
        leagueScore: 91.7,
        basis: "quarterly_paper_live_league",
      },
    });
    expect(rows?.[0].capitalPoolId).toBeUndefined();
    expect(rows?.[0].capitalPool).toBeUndefined();
    expect(rows?.[0].paperLedger).toMatchObject({
      id: "paper-ledger-persona-tw-equity",
      mode: "paper",
      isolated: true,
      benchmarkBudget: 1000000,
    });
    expect(rows?.[0].runtimeBinding).toMatchObject({
      id: "rb-433f2a614995432b9e7a463c882dbefb",
      runtimeId: "rt-rescue-0260528-5937dea1",
      state: "running",
      deploymentStage: "paper",
      capitalMode: "paper",
      health: "healthy",
    });
    expect(rows?.[0].review).toMatchObject({
      id: "review-paper-to-live-tw",
      type: "paper_to_live",
      status: "pending_human_review",
      inboxId: "promotion_review:review-paper-to-live-tw",
      requiresHumanGate: true,
    });
    expect(rows?.[0].dataSourceStatus).toMatchObject({
      state: "partial_readback",
      providerStatuses: {
        twse: "read_unavailable",
        shioaji: "read_ok",
      },
      liveIngestionEnabled: false,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    });
    expect(rows?.[0].dataSources?.map((source) => source.providerKey)).toEqual(["shioaji", "twse"]);
    expect(rows?.[0].researchStatus).toMatchObject({
      stage: "management_review_linked",
      framework: "qlib",
      experimentId: "exp-mgmt-qlib-006",
      artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
      registryAdmissionStatus: "pending_upstream_task",
      canDeploy: false,
    });
    expect(rows?.[0].currentResearchProjects?.[0]).toMatchObject({
      projectId: "MGMT-QLIB-006",
      artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
      blockedByTaskIds: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
      canDeploy: false,
    });
    expect(Number.isFinite(rows?.[0].perfDelta)).toBe(true);
  });

  // PPL-ALLOC-006 — PPL-ALLOC-003 read model adds current/target weight,
  // capital sleeve, and binding state to the persona-fleet row; the fleet
  // adapter must surface them so the Real ranking tab can render them.
  it("adapts real-allocation capital binding fields from flat snake_case keys", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        persona_fleet: [{
          persona_id: "persona-canary-alpha",
          persona_name: "Canary Alpha",
          owner: "pathreon-management",
          deployment_stage: "canary_running",
          capital_mode: "canary",
          capital_scope: "canary_sleeve",
          capital_scope_id: "sleeve-canary-01",
          capital_sleeve_id: "sleeve-canary-01",
          current_weight: 0.03,
          target_weight: 0.04,
          binding_state: "bound",
          updated_at: "2026-07-11T00:00:00Z",
          status: "active",
        }],
      },
    });
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-canary-alpha",
      capitalScope: "canary_sleeve",
      capitalScopeId: "sleeve-canary-01",
      capitalSleeveId: "sleeve-canary-01",
      currentWeight: 0.03,
      targetWeight: 0.04,
      bindingState: "bound",
    });
  });

  it("adapts real-allocation capital binding fields from the nested capital_binding object", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        persona_fleet: [{
          persona_id: "persona-live-beta",
          persona_name: "Live Beta",
          owner: "pathreon-management",
          deployment_stage: "live_running",
          capital_mode: "live",
          capital_binding: {
            capital_scope: "live_sleeve",
            capital_sleeve_id: "sleeve-live-02",
            current_weight: 0.12,
            target_weight: 0.15,
            binding_state: "bound",
          },
          updated_at: "2026-07-11T00:00:00Z",
          status: "active",
        }],
      },
    });
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-live-beta",
      capitalScope: "live_sleeve",
      capitalSleeveId: "sleeve-live-02",
      currentWeight: 0.12,
      targetWeight: 0.15,
      bindingState: "bound",
    });
  });

  it("normalizes legacy deployed fleet rows to paper-running when live capital is absent", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        items: [{
          persona_id: "persona-legacy-deployed",
          name: "Legacy Deployed Persona",
          state: "deployed",
          capital_mode: "paper",
          deployment_stage: "paper",
          capital_pool_id: "shared-legacy-paper-pool",
          runtime_id: "rt-paper-legacy",
          runtime_binding_id: "rb-paper-legacy",
        }],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-legacy-deployed",
      state: "paper_running",
      capitalMode: "paper",
      deploymentStage: "paper",
      paperLedgerId: "paper-ledger-persona-legacy-deployed",
      runtimeId: "rt-paper-legacy",
      runtimeBindingId: "rb-paper-legacy",
    });
    expect(rows?.[0].capitalPoolId).toBeUndefined();
    expect(rows?.[0].paperCapitalPoolId).toBeUndefined();
    expect(rows?.[0].capitalPool).toBeUndefined();
    expect(rows?.[0].paperLedger).toMatchObject({
      id: "paper-ledger-persona-legacy-deployed",
      mode: "paper",
      isolated: true,
    });
  });

  it("normalizes legacy paper capital pool ids into paper fleet bindings", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        items: [{
          persona_id: "persona-20260704-5d946ca4",
          name: "Cron Scope Smoke 2",
          state: "paper_running",
          capital_mode: "paper",
          deployment_stage: "paper",
          paper_ledger_id: "paper-ledger-persona-20260704-5d946ca4",
          legacy_paper_capital_pool_id: "paper-pool-persona-20260704-5d946ca4",
          runtime_id: "runtime-persona-20260704-5d946ca4-paper",
        }],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-20260704-5d946ca4",
      personaName: "Cron Scope Smoke 2",
      capitalMode: "paper",
      deploymentStage: "paper",
      paperLedgerId: "paper-ledger-persona-20260704-5d946ca4",
      paperCapitalPoolId: "paper-pool-persona-20260704-5d946ca4",
      runtimeId: "runtime-persona-20260704-5d946ca4-paper",
    });
    expect(rows?.[0].capitalPoolId).toBeUndefined();
  });

  it("adapts live persona fleet summary fields instead of dropping them to nan", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        items: [{
          id: "persona-crypto",
          persona_id: "persona-crypto",
          name: "Crypto Persona",
          owner: "pantheon-dev-browser",
          ooda: "Act",
          autonomy: "supervised",
          perf_delta: 0.182,
          human_needed: true,
          last_mutation: "2026-06-07",
          state: "paper_running",
          current_work: "paper broker sandbox readback and funding-rate stress review",
          runtime_id: "runtime-crypto-paper",
          data_source_summary: {
            state: "datasource_smoke_ok",
            provider_count: 2,
            provider_status_counts: {
              datasource_smoke_ok: 1,
              read_unavailable: 1,
            },
            entries: [
              {
                provider_key: "kraken",
                provider: "Kraken REST",
                status: "datasource_smoke_ok",
                link_targets: {
                  dataSource: "/management/data-sources?persona=persona-crypto&source=kraken",
                },
              },
              {
                provider_key: "coingecko",
                provider: "CoinGecko",
                status: "read_unavailable",
              },
            ],
            degraded_provider_count: 1,
            configured_source_count: 2,
            live_ingestion_enabled: false,
          },
          research_summary: {
            stage: "act",
            framework: "vectorbt",
            framework_count: 3,
            artifact_id: "artifact-crypto-trend-carry-v1",
            registry_admission_status: "not_requested",
            can_deploy: false,
            current_project_count: 1,
          },
          link_targets: {
            dataSources: "/management/data-sources?persona=persona-crypto",
            performance: "/management/performance-attribution?dimension=persona&persona=persona-crypto",
            act: "/management/runtimes?persona=persona-crypto&runtime=runtime-crypto-paper",
          },
        }],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0].dataSourceStatus).toMatchObject({
      state: "datasource_smoke_ok",
      providerStatusCounts: {
        datasource_smoke_ok: 1,
        read_unavailable: 1,
      },
      providerCount: 2,
      configuredSourceCount: 2,
      degradedProviderCount: 1,
      liveIngestionEnabled: false,
    });
    expect(rows?.[0].dataSources?.map((source) => `${source.providerKey}:${source.status}`)).toEqual([
      "kraken:datasource_smoke_ok",
      "coingecko:read_unavailable",
    ]);
    expect(rows?.[0].dataSources?.[0].linkTargets?.dataSource).toBe(
      "/management/data-sources?persona=persona-crypto&source=kraken",
    );
    expect(rows?.[0].researchStatus).toMatchObject({
      stage: "act",
      framework: "vectorbt",
      frameworks: ["vectorbt"],
      frameworkCount: 3,
      artifactId: "artifact-crypto-trend-carry-v1",
      registryAdmissionStatus: "not_requested",
      canDeploy: false,
      currentProjectCount: 1,
    });
    expect(rows?.[0].linkTargets).toMatchObject({
      dataSources: "/management/data-sources?persona=persona-crypto",
      performance: "/management/performance-attribution?dimension=persona&persona=persona-crypto",
      act: "/management/runtimes?persona=persona-crypto&runtime=runtime-crypto-paper",
    });
  });

  it("normalizes invalid mutation identities before they reach Fleet link builders", () => {
    const rows = adaptManagementPersonaFleet({
      data: {
        items: [{
          id: "persona-20260528-04688755",
          name: "Crypto-Alt-Hunter",
          owner: "pantheon-dev-browser",
          last_mutation: "2026-06-03",
          last_mutation_kind: "fleet_summary",
          mutation_entry_id: "NaN",
          evolution_entry_id: "2026-06-03",
          evolution_href: "/management/evolution-journal?persona=persona-20260528-04688755&mutation_review=NaN",
        }],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      personaId: "persona-20260528-04688755",
      mutationEntryId: null,
      evolutionEntryId: null,
      evolutionHref: null,
    });
  });

  it("management paths exist on paths catalog", () => {
    expect(paths.mgmtCockpit()).toMatch(/management\/cockpit$/);
    expect(paths.mgmtPersonaFleet()).toMatch(/management\/persona-fleet$/);
    expect(paths.mgmtPersonaFleet({ q: "persona/live alpha", pageSize: 100 })).toBe(
      "/bff/management/persona-fleet?q=persona%2Flive+alpha&page_size=100",
    );
    expect(paths.mgmtHumanInbox()).toMatch(/human-inbox$/);
    expect(paths.mgmtHumanInboxItem("xyz")).toMatch(/human-inbox\/xyz$/);
    expect(paths.mgmtPromotionReviews()).toMatch(/promotion-reviews$/);
    expect(paths.mgmtPromotionReview("review-1")).toBe("/bff/management/promotion-reviews/review-1");
    expect(paths.mgmtPromotionReviewDecision("review-1")).toBe("/bff/management/promotion-reviews/review-1/decisions");
    expect(paths.mgmtTradingPulse()).toMatch(/trading-pulse$/);
    expect(paths.mgmtTradingRankings()).toMatch(/trading-pulse\/rankings$/);
    expect(paths.mgmtEvolutionJournal()).toMatch(/evolution-journal$/);
    expect(paths.mgmtEvidenceExplorer()).toMatch(/management\/evidence$/);
    expect(paths.mgmtEvidenceRef("evref-1")).toBe("/bff/management/evidence/evref-1");
    expect(paths.knowledgeEvidenceRef("evref-1")).toBe("/api/v1/knowledge/evidence/evref-1");
    expect(paths.mgmtPersonaIntent()).toMatch(/persona-intent$/);
    expect(paths.mgmtReadinessEp5()).toMatch(/readiness\/ep5$/);
    expect(paths.mgmtReadinessBrokerLive()).toMatch(/readiness\/broker-live$/);
    expect(paths.mgmtReadinessCapitalBinding()).toMatch(/capital-binding-live$/);
    expect(paths.mgmtReadinessBffHa()).toMatch(/bff-ha$/);
    expect(paths.mgmtReadinessStrictPublish()).toMatch(/strict-publish$/);
  });
});
