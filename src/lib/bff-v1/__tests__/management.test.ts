// 2026-05-22 PM-Live — verifies the mgmt.* façade returns seed shape in mock
// mode and that all 14 mgmt paths are reachable through the helpers.

import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import {
  adaptCockpitCapitalSummary,
  adaptPersonaLeagueInventory,
  adaptPersonaLeagueRankedRows,
  adaptManagementEvidenceDetail,
  adaptManagementEvidenceOverview,
  adaptTradingPulseOverview,
  adaptHumanInboxDetail,
  adaptHumanInboxList,
  adaptManagementPersonaFleet,
  adaptManagementPersonaFleetPage,
  adaptOperationsReadModel,
  adaptPersonaIntent,
  adaptPortfolioExposureMonitor,
  adaptPortfolioHoldingRows,
  adaptQuarterlyRankingRows,
  adaptEvolutionQualificationReport,
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
  it("reads the hosted cockpit aggregate instead of requiring a seed-only view model", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: {
        id: "management-cockpit", snapshot_at: "2026-09-13T07:36:00Z",
        runtime_health: { overall_status: "ok", headline: "Control plane healthy", message: "Owners responding." },
        operator_home: { cards: [
          { card_id: "runtime", label: "Runtime", status: "ok", summary: "No active runtime bindings." },
        ] },
      },
      meta: { surfaces: {
        management_cockpit: { status: "degraded", source: "bff_composed", message: "Telemetry is unavailable." },
      } },
    }));
    const out = await mgmt.cockpit.getLiveOnly();
    expect(out).toMatchObject({
      snapshotAt: "2026-09-13T07:36:00Z", status: "degraded", message: "Telemetry is unavailable.",
      health: { status: "ok", headline: "Control plane healthy", message: "Owners responding." },
      cards: [{ id: "runtime", label: "Runtime", status: "ok", summary: "No active runtime bindings." }],
    });
    expect(out).not.toHaveProperty("loopFlow");
    expect(out).not.toHaveProperty("matrix");
    expect(liveStatus.get().effective).toBe("live");
  });

  it("forwards Evolution journal focus as encoded server query and returns a target outside the default first page", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return jsonResponse(url.includes("decision=")
        ? {
            data: {
              id: "management_evolution_journal",
              items: [{ id: "evo-sweep-inc-drift-a24770da155d" }],
              summary: { total_items: 1, returned_items: 1 },
            },
            page_info: { next_page_token: null, total: 1, page_size: 20 },
          }
        : {
            data: {
              id: "management_evolution_journal",
              items: [{ id: "first-page-row" }],
              summary: { total_items: 124, returned_items: 20 },
            },
            page_info: { next_page_token: "20", total: 124, page_size: 20 },
          });
    });
    const unfiltered = await mgmt.evolutionJournal.list<{ id: string }>(() => []);
    expect(unfiltered.map((r) => r.id)).toEqual(["first-page-row"]);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/management\/evolution-journal$/);
    const focused = await mgmt.evolutionJournal.list<{ id: string }>(() => [], {
      persona: "p/1 a", mutationReview: "m&r", decision: "evo-sweep-inc-drift-a24770da155d",
    });
    expect(focused.map((r) => r.id)).toEqual(["evo-sweep-inc-drift-a24770da155d"]);
    expect(String(fetchSpy.mock.calls[1][0])).toContain(
      "/management/evolution-journal?persona=p%2F1+a&mutation_review=m%26r&decision=evo-sweep-inc-drift-a24770da155d",
    );
  });

  it("forwards view, page_size, and page_token to /bff/management/evolution-journal and adapts summary, auto_proposal_counts, page_info, and evidence_class", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        data: {
          id: "management_evolution_journal",
          items: [
            {
              id: "evolution_decision:evo-sweep-agent-000b205c0ef9-0000",
              entry_type: "evolution_decision",
              source_id: "evo-sweep-agent-000b205c0ef9-0000",
              title: "Evolution decision · flag_for_review",
              summary: "Candidate artifact infra-component-agent-finding-000b205c0ef9",
              status: "proposed",
              action_type: "flag_for_review",
              risk_level: "low",
              evidence_class: "incident_followup",
              target: {
                type: "candidate_artifact",
                id: "infra-component-agent-finding-000b205c0ef9",
              },
              occurred_at: "2026-11-04T01:00:00Z",
              created_at: "2026-11-04T01:00:00Z",
              record: {
                decision_id: "evo-sweep-agent-000b205c0ef9-0000",
                target_type: "candidate_artifact",
                target_id: "infra-component-agent-finding-000b205c0ef9",
                risk_level: "low",
                linked_incident_id: "agent-000b205c0ef9-0000",
                action_type: "flag_for_review",
                decision_state: "proposed",
                status: "proposed",
                evidence_class: "incident_followup",
                threshold_snapshots: [
                  {
                    breached: true,
                    comparator: "gte",
                    metric_name: "incident_followup_required",
                    observed_value: 1,
                    threshold_value: 1,
                    policy_source: "EVOLUTION_REVIEW_AND_THRESHOLDS.md section 7.5",
                    signal_type: "manual_review",
                    window: "active-incident",
                  },
                ],
              },
            },
          ],
          summary: {
            total_items: 6,
            returned_items: 1,
            decision_count: 2,
            mutation_review_count: 2,
            postmortem_count: 2,
            rollback_count: 0,
            freeze_order_count: 0,
            pending_review_count: 2,
            active_freeze_count: 0,
            completed_rollback_count: 0,
            by_type: { evolution_decision: 2, mutation_review: 2, postmortem: 2 },
            by_status: { proposed: 4, draft: 2 },
            by_risk_level: { low: 2, medium: 2, unknown: 2 },
          },
          auto_proposal_counts: {
            incident_followup: 1,
            incident_severity: 1,
            postmortem_draft: 2,
            total: 4,
          },
        },
        page_info: {
          next_page_token: "20",
          page_size: 20,
          total: 6,
        },
        meta: {
          snapshot_at: "2026-11-04T02:00:00Z",
          surfaces: {
            evolution_decisions: { status: "ok", source: "live" },
            postmortems: { status: "ok", source: "live" },
          },
        },
      }),
    );

    const out = await mgmt.evolutionJournal.list<{ id: string; evidence_class?: string }>(() => [], {
      view: "auto_proposals",
      pageSize: 20,
      pageToken: "20",
    });

    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "/bff/management/evolution-journal?view=auto_proposals&page_size=20&page_token=20",
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("evolution_decision:evo-sweep-agent-000b205c0ef9-0000");
    expect(out[0].evidence_class).toBe("incident_followup");
    expect(out.autoProposalCounts).toEqual({
      incident_followup: 1,
      incident_severity: 1,
      postmortem_draft: 2,
      total: 4,
      incidentFollowup: 1,
      incidentSeverity: 1,
      postmortemDraft: 2,
    });
    expect(out.auto_proposal_counts).toEqual(out.autoProposalCounts);
    expect(out.summary?.total_items).toBe(6);
    expect(out.summary?.decision_count).toBe(2);
    expect(out.pageInfo).toEqual({
      next_page_token: "20",
      nextPageToken: "20",
      page_size: 20,
      pageSize: 20,
      total: 6,
    });
    expect(out.meta?.surfaces?.evolution_decisions?.status).toBe("ok");
  });

  it("recommendations live read follows next_page_token past the first page", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const page = (id: string, next: string | null) => jsonResponse({ data: [{ personaId: id, rank: 1 }], page_info: { next_page_token: next } });
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(page("p1", "1"))
      .mockResolvedValueOnce(page("p2", null));
    const rows = await mgmt.quarterlyRanking.recommendationsLiveOnly("2026-Q4");
    expect(rows.map((r) => r.personaId)).toEqual(["p1", "p2"]);
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("quarter=2026-Q4&page_size=200");
    expect(urls[1]).toContain("page_token=1");
  });

  it("does not invent healthy status or cards for missing cockpit fields", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: { id: "management-cockpit", runtime_health: {}, operator_home: { cards: [] } },
    }));
    expect(await mgmt.cockpit.getLiveOnly()).toMatchObject({
      snapshotAt: null, status: "unknown", message: null,
      health: { status: "unknown", headline: null, message: null }, cards: [],
    });
  });

  it.each([null, { id: "management-cockpit" }, { strip: {}, loopFlow: {}, matrix: {} }])(
    "does not pass malformed or seed-only cockpit data as the live aggregate: %j", async (data) => {
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data }));
      expect(await mgmt.cockpit.getLiveOnly()).toBeUndefined();
    },
  );

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

  it("forwards MGMT-PERF-IA-003 exposure filters as query params to the shared BFF contract", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    let requestedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      requestedUrl = String(input);
      return jsonResponse({ data: { summary: {}, items: [] }, meta: { surfaces: {} } });
    });

    await mgmt.portfolioBook.exposureLiveOnly({
      capitalPoolId: "pool-alpha",
      personaId: "persona-alpha",
      runtimeId: "runtime-alpha",
      period: "30d",
    });

    expect(requestedUrl).toContain("/management/portfolio-book/exposure?");
    expect(requestedUrl).toContain("capital_pool_id=pool-alpha");
    expect(requestedUrl).toContain("persona_id=persona-alpha");
    expect(requestedUrl).toContain("runtime_id=runtime-alpha");
    expect(requestedUrl).toContain("period=30d");
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

  it("keeps top-level BFF meta.surfaces and page_info for both empty and non-empty humanInbox.list payloads", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const degradedMeta = {
      snapshot_at: "2026-11-04T12:00:00Z",
      surfaces: {
        human_inbox: {
          status: "degraded",
          reason: "read_timeout",
          source: "timeout_fallback",
          message: "Human inbox read timed out",
          snapshot_at: "2026-11-04T12:00:00Z",
        },
        governance_review_queue: {
          status: "unavailable",
          reason: "read_timeout",
          source: "timeout_fallback",
          message: "Governance review queue timed out",
          snapshot_at: "2026-11-04T12:00:00Z",
        },
      },
    };
    const realIncidentOwnerRow = {
      artifact_id: "art-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      artifact_version: "1.0.0",
      binding_id: "bind-persona-paper-1bad2eca6831457cd885",
      capital_pool_id: "pool-paper-default",
      created_at: "2026-11-04T11:58:00Z",
      deployment_plan_id: "deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      deployment_stage: "paper",
      evidence_summary: "Compensation saga entered safe mode after broker validation timeout.",
      incident_cluster_id: "cluster-deployment-comp-1bad2eca6831457cd885",
      incident_id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      lineage_ref: "lineage:deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      persona_capital_binding_id: "pcb-persona-paper-1bad2eca6831457cd885",
      reconciliation_ids: ["rec-1bad2eca6831457cd885"],
      resolved_at: null,
      runtime_id: "runtime-persona-paper-1bad2eca6831457cd885",
      severity: "critical",
      status: "open",
      telemetry_event_ids: ["tel-1bad2eca6831457cd885"],
      title: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      trace_id: "trace-1bad2eca6831457cd885",
    };

    const emptyPayload = {
      data: {
        id: "human_inbox",
        items: [],
        summary: { total: 0 },
        facets: { by_type: {}, by_priority: {}, by_status: {} },
      },
      page_info: {
        next_page_token: null,
        total: 0,
        page_size: 50,
      },
      meta: degradedMeta,
    };

    const nonEmptyPayload = {
      data: {
        id: "human_inbox",
        items: [
          {
            ...realIncidentOwnerRow,
            id: "incident:inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            inbox_id: "incident:inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            inboxType: "incident",
            source_type: "incident",
            source_id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            route: "/management/incidents/inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            allowedActions: {
              canReview: true,
              canRemediate: true,
            },
          },
        ],
        summary: { total: 3 },
        facets: { by_type: { incident: 1 }, by_priority: { critical: 1 }, by_status: { open: 1 } },
      },
      page_info: {
        next_page_token: "cursor-2",
        total: 3,
        page_size: 1,
      },
      meta: degradedMeta,
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(emptyPayload))
      .mockResolvedValueOnce(jsonResponse(nonEmptyPayload));

    const emptyResult = await mgmt.humanInbox.list();
    expect(emptyResult).toHaveLength(0);
    expect(emptyResult.meta?.surfaces).toEqual(degradedMeta.surfaces);
    expect(emptyResult.page_info?.total).toBe(0);

    const nonEmptyResult = await mgmt.humanInbox.list();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(nonEmptyResult).toHaveLength(1);
    expect(nonEmptyResult.meta?.surfaces).toEqual(degradedMeta.surfaces);
    expect(nonEmptyResult.page_info).toMatchObject({
      next_page_token: "cursor-2",
      total: 3,
      page_size: 1,
    });
    expect(nonEmptyResult[0]).toMatchObject({
      id: "incident:inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      kind: "incident",
      canDecide: false,
      allowedActions: {
        canDecide: false,
        canApprove: false,
        canReject: false,
      },
      links: {
        manageHref: "/management/incidents/inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      },
    });
  });

  it("adapts real owner incident and approval decision row shapes accurately", () => {
    const rawIncidentOwnerRow = {
      artifact_id: "art-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      artifact_version: "1.0.0",
      binding_id: "bind-persona-paper-1bad2eca6831457cd885",
      capital_pool_id: "pool-paper-default",
      created_at: "2026-11-04T11:58:00Z",
      deployment_plan_id: "deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      deployment_stage: "paper",
      evidence_summary: "Compensation saga entered safe mode after broker validation timeout.",
      incident_cluster_id: "cluster-deployment-comp-1bad2eca6831457cd885",
      incident_id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      lineage_ref: "lineage:deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      persona_capital_binding_id: "pcb-persona-paper-1bad2eca6831457cd885",
      reconciliation_ids: ["rec-1bad2eca6831457cd885"],
      resolved_at: null,
      runtime_id: "runtime-persona-paper-1bad2eca6831457cd885",
      severity: "critical",
      status: "open",
      telemetry_event_ids: ["tel-1bad2eca6831457cd885"],
      title: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      trace_id: "trace-1bad2eca6831457cd885",
    };

    const rawApprovalDecisionRow = {
      actor_id: "user-risk-lead-1",
      actor_role: "risk_owner",
      authority_status: "authorized",
      authorization_scope: "capital_pool",
      candidate_digest: "sha256:cand-1bad2eca6831457cd885",
      capital_pool_id: "pool-canary-tw-equity",
      conditions: [],
      controller_record_ref: "ctrl:rec-1bad2eca6831457cd885",
      created_at: "2026-11-04T11:45:00Z",
      decided_at: null,
      decision: "approve",
      decision_id: "dec-capital-pool-activation-001",
      decision_state: "proposed",
      event_id: "evt-dec-001",
      evidence_refs: ["evidence:pool-canary-tw-equity:readiness"],
      expires_at: "2026-11-05T11:45:00Z",
      metadata: { stage: "canary" },
      owner_user_id: "user-ops-1",
      persona_id: "persona-tw-equity-canary",
      proof_digest: "sha256:proof-001",
      proposal_content_digest: "sha256:prop-001",
      proposal_id: "prop-capital-pool-001",
      proposal_revision: 1,
      rationale: "Canary capital pool activation requires risk owner sign-off.",
      recorded_at: "2026-11-04T11:45:00Z",
      revoked_at: null,
      risk_level: "high",
      session_id: "sess-001",
      superseded_by: null,
      target_id: "pool-canary-tw-equity",
      target_type: "capital_pool_activation",
      target_version: "v1",
      tenant_id: "tenant-default",
      validation_result_digest: "sha256:val-001",
      version: 1,
    };

    const out = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [rawIncidentOwnerRow, rawApprovalDecisionRow],
      },
    });

    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({
      id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      kind: "incident",
      title: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      summary: "Compensation saga entered safe mode after broker validation timeout.",
      canDecide: false,
      links: {
        manageHref: "/management/incidents/inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      },
    });
    expect(out?.[1]).toMatchObject({
      id: "approval:dec-capital-pool-activation-001",
      kind: "approval",
      title: "capital_pool_activation approval",
      summary: "Canary capital pool activation requires risk owner sign-off.",
      requiredRole: "risk_owner",
      status: "proposed",
      personaId: "persona-tw-equity-canary",
      canDecide: true,
      canProceed: false,
      evidenceRefs: ["evidence:pool-canary-tw-equity:readiness"],
      links: {
        manageHref: "/management/approvals?approval=dec-capital-pool-activation-001",
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

  it("adapts bounded BFF /bff/management/evidence envelope with top-level page_info, meta, and mapped source_ingest_evidence_items rows", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const isSecondPage = url.includes("page_token=20");
      return jsonResponse({
        data: {
          id: "management-evidence",
          items: [
            isSecondPage
              ? {
                  id: "evitem-tw_price_daily-2330-2026-11-01-def456",
                  ref_id: "evitem-tw_price_daily-2330-2026-11-01-def456",
                  evidence_item_id: "evitem-tw_price_daily-2330-2026-11-01-def456",
                  title: "TW official tw_price_daily TWSE 2330 2026-11-01",
                  citation_label: "TW official tw_price_daily TWSE 2330 2026-11-01",
                  source_type: "official_reference",
                  captured_at: "2026-11-01T14:35:00+08:00",
                  available_time: "2026-11-01T14:35:00+08:00",
                  event_time: "2026-11-01T00:00:00+08:00",
                  item_type: "tw_price_daily",
                  link_type: "tw_price_daily",
                  metadata: { source_class: "official_reference" },
                  credibility: { tier: "producer_record", verified: true },
                }
              : {
                  id: "evitem-tw_price_daily-0050-2026-11-01-abc123",
                  ref_id: "evitem-tw_price_daily-0050-2026-11-01-abc123",
                  evidence_item_id: "evitem-tw_price_daily-0050-2026-11-01-abc123",
                  title: "TW official tw_price_daily TWSE 0050 2026-11-01",
                  citation_label: "TW official tw_price_daily TWSE 0050 2026-11-01",
                  source_type: "official_reference",
                  captured_at: "2026-11-01T14:30:00+08:00",
                  available_time: "2026-11-01T14:30:00+08:00",
                  event_time: "2026-11-01T00:00:00+08:00",
                  item_type: "tw_price_daily",
                  link_type: "tw_price_daily",
                  metadata: { source_class: "official_reference" },
                  credibility: { tier: "producer_record", verified: true },
                },
          ],
          summary: {
            total_evidence: 614,
            returned_evidence: 1,
            visible_evidence: 1,
            redacted_evidence: 0,
            verified_evidence: 1,
            by_source_type: { official_reference: 1 },
            by_link_type: { tw_price_daily: 1 },
            by_credibility_tier: { producer_record: 1 },
            traceable_evidence: 0,
            unresolved_source_evidence: 0,
            incomplete_evidence: 0,
            needs_attention_evidence: 0,
            open_operation_evidence: 0,
            by_actionability_state: {},
            by_actionability_severity: {},
            by_operation_status: {},
          },
          facets: {
            source_types: { official_reference: 1 },
            link_types: { tw_price_daily: 1 },
            credibility_tiers: { producer_record: 1 },
            actionability_states: {},
            actionability_severity: {},
            operation_statuses: {},
          },
        },
        page_info: {
          next_page_token: isSecondPage ? "40" : "20",
          total: 614,
          page_size: 20,
        },
        meta: {
          snapshot_at: "2026-11-04T00:00:00Z",
          surfaces: {
            management_evidence: { status: "ok", source: "service_store" },
            evidence_refs: { status: "ok", source: "service_store" },
          },
          redacted_evidence_count: 0,
        },
      });
    });

    const firstPage = await mgmt.evidence.overviewLiveOnly();
    expect(firstPage?.items[0]).toMatchObject({
      refId: "evitem-tw_price_daily-0050-2026-11-01-abc123",
      title: "TW official tw_price_daily TWSE 0050 2026-11-01",
      sourceType: "official_reference",
      source_type: "official_reference",
      capturedAt: "2026-11-01T14:30:00+08:00",
      captured_at: "2026-11-01T14:30:00+08:00",
      linkType: "tw_price_daily",
    });
    expect(firstPage?.pageInfo).toMatchObject({
      nextPageToken: "20",
      next_page_token: "20",
      hasMore: true,
      has_more: true,
      total: 614,
      pageSize: 20,
      page_size: 20,
    });
    expect(firstPage?.summary.totalEvidence).toBe(614);
    expect(firstPage?.meta.surfaces.management_evidence.status).toBe("ok");

    const secondPage = await mgmt.evidence.overviewLiveOnly({ pageToken: "20" });
    expect(requestedUrls[1]).toContain("/bff/management/evidence?page_token=20");
    expect(secondPage?.items[0].title).toBe("TW official tw_price_daily TWSE 2330 2026-11-01");
    expect(secondPage?.pageInfo.nextPageToken).toBe("40");
    expect(secondPage?.pageInfo.total).toBe(614);
  });

  it("preserves top-level unavailable surface status when BFF /bff/management/evidence read fails", () => {
    const out = adaptManagementEvidenceOverview({
      data: {
        id: "management-evidence",
        items: [],
        summary: {
          total_evidence: null,
          returned_evidence: null,
          visible_evidence: null,
          redacted_evidence: null,
          verified_evidence: null,
          by_source_type: {},
          by_link_type: {},
          by_credibility_tier: {},
          traceable_evidence: null,
          unresolved_source_evidence: null,
          incomplete_evidence: null,
          needs_attention_evidence: null,
          open_operation_evidence: null,
          by_actionability_state: {},
          by_actionability_severity: {},
          by_operation_status: {},
        },
        facets: {
          source_types: {},
          link_types: {},
          credibility_tiers: {},
          actionability_states: {},
          actionability_severity: {},
          operation_statuses: {},
        },
      },
      page_info: {
        next_page_token: null,
        total: null,
        page_size: 20,
      },
      meta: {
        snapshot_at: "2026-11-04T00:00:00Z",
        surfaces: {
          management_evidence: {
            status: "unavailable",
            source: "service_store",
            reason: "source_ingest_evidence_items_unavailable",
          },
          evidence_refs: {
            status: "unavailable",
            source: "service_store",
            reason: "source_ingest_evidence_items_unavailable",
          },
        },
        redacted_evidence_count: null,
      },
    });

    expect(out?.meta.surfaces.management_evidence).toMatchObject({
      status: "unavailable",
      source: "service_store",
      reason: "source_ingest_evidence_items_unavailable",
    });
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
            perf_delta: null,
            has_trading_telemetry: false,
            is_market_persona_default: true,
            seed_row: true,
            metrics: { training_improvement_pct: 9.5 },
            performance_summary: {
              source: "persona_league",
              telemetry_runtime_count: 0,
              total_trades: null,
            },
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
      hasTradingTelemetry: false,
      isMarketPersonaDefault: true,
      seedRow: true,
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
    expect(Number.isNaN(rows?.[0].perfDelta)).toBe(true);
    expect(rows?.[0].performanceSummary).toMatchObject({
      source: "persona_league",
      telemetryRuntimeCount: 0,
    });
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

  it("builds explicit fleet scope, archive and page-token query parameters", () => {
    expect(
      paths.mgmtPersonaFleet({ purpose: "trading", dataScope: "test", archived: "exclude", pageSize: 20, pageToken: "tok/1" }),
    ).toBe("/bff/management/persona-fleet?purpose=trading&data_scope=test&archived=exclude&page_size=20&page_token=tok%2F1");
  });

  it("adapts the fleet page envelope: server classification, totals and next token", () => {
    const page = adaptManagementPersonaFleetPage({
      data: {
        items: [
          { persona_id: "p-1", persona_purpose: "trading", data_scope: "unknown", classification_confirmed: false,
            classification_source: { purpose: "metadata", data_scope: "none" }, archived: false, state: "draft" },
          { persona_id: "servant-1", persona_purpose: "advisory_assistant", state: "advisory" },
        ],
        summary: { filtered_archived_total: 4, population: { authorized_total: 130, active_total: 120, archived_total: 10, by_purpose: { trading: 129 }, by_data_scope: { test: 3 } } },
      },
      page_info: { next_page_token: "20", total: 75, filtered_total: 75, page_size: 20 },
    });
    expect(page.rows.map((r) => [r.personaId, r.personaPurpose, r.dataScope, r.classificationConfirmed])).toEqual([
      ["p-1", "trading", "unknown", false],
      ["servant-1", "advisory_assistant", undefined, undefined],
    ]);
    expect(page.rows[0]?.classificationSource).toEqual({ purpose: "metadata", dataScope: "none" });
    expect(page).toMatchObject({ nextPageToken: "20", total: 75, pageSize: 20 });
    expect(page.filteredArchivedTotal).toBe(4);
    expect(page.population).toMatchObject({ authorizedTotal: 130, archivedTotal: 10, byDataScope: { test: 3 } });
  });

  it("reports an absent total and last page honestly instead of inventing zero", () => {
    const page = adaptManagementPersonaFleetPage({ data: { items: [{ persona_id: "p-1" }] }, page_info: { next_page_token: null } });
    expect(page.total).toBeUndefined();
    expect(page.nextPageToken).toBeNull();
    expect(page.population.archivedTotal).toBeUndefined();
    expect(page.filteredArchivedTotal).toBeUndefined();
  });

  it("maps a canonical owner-failure null filtered_archived_total to unknown, not zero or population", () => {
    const page = adaptManagementPersonaFleetPage({
      data: { items: [{ persona_id: "p-1" }], summary: { filtered_archived_total: null, population: { archived_total: 10 } } },
      page_info: { next_page_token: null },
    });
    expect(page.filteredArchivedTotal).toBeUndefined();
    expect(page.population.archivedTotal).toBe(10);
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

// PFG-FE-HONEST-LIVE-20260820 — strict-live (VITE_BFF_MODE=live +
// VITE_BFF_FALLBACK=strict, the hosted/production profile) must not mask an
// HTTP-200-but-contract-mismatch response behind seed data via safeAdapt.
describe("safeAdapt strict-live contract mismatch", () => {
  afterEach(() => {
    delete process.env.VITE_BFF_FALLBACK;
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("degrades to seed in dev-default auto fallback when the contract mismatches", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: "not-a-cockpit-shape" }));

    const out = await mgmt.cockpit.get();

    const expected = composeCockpit(defaultCockpitSeed());
    expect(out.strip.fields.length).toBe(expected.strip.fields.length);
    expect(liveStatus.get().effective).toBe("live");
  });

  it("never returns seed data in strict-live when the contract mismatches", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: "not-a-cockpit-shape" }));

    await expect(mgmt.cockpit.get()).rejects.toMatchObject({ name: "BffError" });
    expect(liveStatus.get().effective).toBe("mock");
    expect(liveStatus.get().lastError).toMatch(/^strict:/);
  });

  it("strict-live still returns real data when the contract matches", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: { strip: { fields: [] }, loopFlow: { nodes: [] }, matrix: { phases: [] } },
    }));

    const out = await mgmt.cockpit.get();
    expect(out.strip.fields).toEqual([]);
    expect(liveStatus.get().effective).toBe("live");
  });
});

describe("Cockpit child read contracts (actual-shaped owner payloads)", () => {
  const portfolio = {
    data: {
      totalCash: null, grossExposure: null, leverage: null, unrealizedPnl: null, pnlToday: null,
      activeCapitalPools: 1, highestRiskPoolId: null,
      summary: {
        active_capital_pool_count: 1, binding_count: 89, active_runtime_count: 1,
        paper_runtime_count: 87, live_runtime_count: 0, total_pnl: -15.0, total_trades: 3,
        max_drawdown: 0.00015, latest_telemetry_at: "2026-10-23T01:14:39Z",
      },
    },
  };

  it("keeps available facts and leaves absent financials unknown (no totalNav)", () => {
    const out = adaptCockpitCapitalSummary(portfolio);
    expect(out).toMatchObject({
      totalNav: null, totalCash: null, grossExposure: null, leverage: null,
      unrealizedPnl: null, pnlToday: null, activeCapitalPools: 1,
      activeRuntimeCount: 1, paperRuntimeCount: 87, liveRuntimeCount: 0,
      totalTrades: 3, totalPnl: -15, highestRiskPoolId: null,
    });
  });

  it("rejects payloads that carry no portfolio facts", () => {
    expect(adaptCockpitCapitalSummary({ data: {} })).toBeNull();
    expect(adaptCockpitCapitalSummary(null)).toBeNull();
  });

  const inventory = {
    data: {
      items: [{
        id: "persona-contract-a", persona_id: "persona-contract-a", name: "Contract Persona A",
        tenant_id: "tenant-x", eligible: false, exclusion_reason: "insufficient telemetry",
        links: { detail: "/bff/personas/persona-contract-a" },
      }],
    },
  };

  it("never turns inventory rows into ranked rows", () => {
    expect(adaptPersonaLeagueRankedRows(inventory)).toEqual([]);
  });

  it("presents inventory as unranked with canonical persona links", () => {
    expect(adaptPersonaLeagueInventory(inventory)).toEqual([{
      personaId: "persona-contract-a", personaName: "Contract Persona A", tenantId: "tenant-x",
      eligible: false, exclusionReason: "insufficient telemetry",
      manageHref: "/management/personas/persona-contract-a",
    }]);
  });

  it("carries the owner-reported population, not the page length, onto inventory rows", () => {
    const page = { ...inventory, data: { ...inventory.data, summary: { persona_count: 94, returned_count: 1 } } };
    expect(adaptPersonaLeagueInventory(page)![0].ownerTotal).toBe(94);
    expect(adaptPersonaLeagueInventory({ ...inventory, page_info: { total: 94 } })![0].ownerTotal).toBe(94);
    expect(adaptPersonaLeagueInventory(inventory)![0].ownerTotal).toBeUndefined();
  });

  it("selects the overall group's nested ranked rows from the grouped rankings payload", () => {
    const row = (n: number, crit: string) => ({
      rank: n, score: 50, criteria: crit, tier: "tier-4", eligible: false, exclusion_reason: "retired",
      id: `p-${crit}-${n}`, persona_id: `p-${crit}-${n}`, name: `Persona ${n}`,
      links: { detail: `/bff/personas/p-${crit}-${n}` },
    });
    const rows = adaptPersonaLeagueRankedRows({
      data: { items: [
        { ranking_id: "persona-league-pnl", criteria: "pnl", ranked_count: 1, items: [row(1, "pnl")] },
        { ranking_id: "persona-league-overall", criteria: "overall", ranked_count: 2, items: [row(1, "overall"), row(2, "overall")] },
      ] },
    });
    expect(rows!.map((r) => [r.personaId, r.currentRank, r.personaName])).toEqual([
      ["p-overall-1", 1, "Persona 1"], ["p-overall-2", 2, "Persona 2"],
    ]);
    expect(rows![0]).toMatchObject({ eligible: false, exclusionReason: "retired", links: { manageHref: "/management/personas/p-overall-1" } });
  });

  it("returns no rows when grouped payload has no overall group", () => {
    expect(adaptPersonaLeagueRankedRows({ data: { items: [{ criteria: "pnl", items: [{ rank: 1, persona_id: "x" }] }] } })).toEqual([]);
  });

  it("accepts owner-ranked rows (snake_case) with name, rank and link", () => {
    const rows = adaptPersonaLeagueRankedRows({
      data: { items: [
        { persona_id: "p1", persona_name: "One", current_rank: 1, tier: "A" },
        { persona_id: "", current_rank: 2 },
        { persona_id: "p3", name: "Three" },
      ] },
    });
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      personaId: "p1", personaName: "One", currentRank: 1, tier: "A",
      links: { manageHref: "/management/personas/p1" },
    });
  });
});

describe("evolutionQualification BFF contract", () => {
  const hostedZeroQualifiedPayload = {
    data: {
      tenant_id: "default",
      sweep_id: "evo-qual-sweep-20261105-0001",
      policy_version: "evolution-qualification.v1",
      evaluated_at: "2026-11-05T00:00:00Z",
      evaluated: 649,
      qualified: 0,
      drafted: 0,
      counts_by_first_failing_criterion: {
        real_threshold_signal: 649,
      },
      failure_reason: null,
      items: [
        {
          decision_id: "evo-sweep-agent-000b205c0ef9-0000",
          sweep_id: "evo-qual-sweep-20261105-0001",
          tenant_id: "default",
          target_type: "infra_component",
          target_id: "infra-component-agent-finding-000b205c0ef9",
          metric_name: "incident_followup_required",
          qualified: false,
          first_failing_criterion: "real_threshold_signal",
          failure_reason: "metric incident_followup_required is not a numeric threshold breach",
          policy_version: "evolution-qualification.v1",
          evaluated_at: "2026-11-05T00:00:00Z",
          program_id: null,
          criteria: [
            {
              criterion: "real_threshold_signal",
              result: "failed",
              observed: { metric_name: "incident_followup_required", action_type: "flag_for_review" },
              threshold: "numeric metric with finite observed_value and threshold_value",
              reason: "metric incident_followup_required is not a numeric threshold breach",
            },
            {
              criterion: "real_target",
              result: "failed",
              observed: { target_type: "infra_component", target_id: "infra-component-agent-finding-000b205c0ef9" },
              threshold: "resolvable persona, strategy, or runtime target",
              reason: "target_type infra_component is not an evolution target",
            },
            {
              criterion: "persistent_breach",
              result: "failed",
              observed: 0,
              threshold: 2,
              reason: "fewer than 2 distinct breach observations",
            },
            {
              criterion: "fresh_evidence",
              result: "passed",
              observed: "2026-11-05T00:00:00Z",
              threshold: "<= 24h",
              reason: null,
            },
            {
              criterion: "executable_action",
              result: "failed",
              observed: "flag_for_review",
              threshold: "executable research/mutation action",
              reason: "flag_for_review does not specify an executable evolution mutation",
            },
            {
              criterion: "no_open_duplicate",
              result: "passed",
              observed: 0,
              threshold: 0,
              reason: null,
            },
          ],
        },
      ],
      total: 649,
      limit: 50,
      offset: 0,
    },
    meta: {
      snapshot_at: "2026-11-05T00:00:00Z",
    },
  };

  it("adapts GET /bff/management/evolution-qualification hosted 649/0 report and all six criteria", () => {
    const report = adaptEvolutionQualificationReport(hostedZeroQualifiedPayload);
    expect(report).not.toBeNull();
    expect(report?.policy_version).toBe("evolution-qualification.v1");
    expect(report?.evaluated_at).toBe("2026-11-05T00:00:00Z");
    expect(report?.evaluated).toBe(649);
    expect(report?.qualified).toBe(0);
    expect(report?.counts_by_first_failing_criterion).toEqual({
      real_threshold_signal: 649,
    });
    expect(report?.items).toHaveLength(1);
    expect(report?.items[0].decision_id).toBe("evo-sweep-agent-000b205c0ef9-0000");
    expect(report?.items[0].criteria.map((c) => c.criterion)).toEqual([
      "real_threshold_signal",
      "real_target",
      "persistent_breach",
      "fresh_evidence",
      "executable_action",
      "no_open_duplicate",
    ]);
  });

  it("fetches GET /bff/management/evolution-qualification in live mode with query filters", async () => {
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const seenUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      seenUrls.push(String(input));
      return new Response(JSON.stringify(hostedZeroQualifiedPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const report = await mgmt.evolutionQualification.get({
      qualified: false,
      offset: 0,
      pageSize: 50,
    });

    expect(seenUrls).toEqual([
      "/bff/management/evolution-qualification?qualified=false&offset=0&page_size=50",
    ]);
    expect(report.evaluated).toBe(649);
    expect(report.qualified).toBe(0);
    expect(report.counts_by_first_failing_criterion.real_threshold_signal).toBe(649);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });
});
