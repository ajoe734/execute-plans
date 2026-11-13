import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { paths } from "../paths";
import { normalizeAlphaFactoryCard, normalizeAlphaFactoryEnvelope } from "../alphaFactory";
import { normalizeEvolutionRun } from "../evolution";
import {
  adaptPerformanceAttributionResult,
  adaptPortfolioHoldingRows,
  adaptPortfolioHoldingsMonitor,
} from "../management";
import { queryKeys } from "../queryKeys";
import { ERROR_CODES } from "@/lib/v4/errorCodes";
import {
  ACTION_COMMAND_STATUSES,
  EVIDENCE_CAPABILITY_MAP,
  EVOLUTION_QUALIFICATION_CRITERIA,
} from "../dto";
import { SSE_CHANNELS } from "../sse/channels";
import {
  AGORA_CAPABILITIES,
  AGORA_CONTRACT_SNAPSHOT,
  AGORA_ROUTE_PATHS,
  AGORA_SCHEMA_FILES,
  AGORA_SCHEMA_DEFINITION_CHECKSUMS,
} from "../agora/types";
import contractSnapshot from "../agora/contract-snapshot.json";
import type {
  TradingRoomWidgetSpec,
  TradingRoomWorkspaceProposal,
  WidgetRevisionProposal,
} from "../agora/types";

const repoRoot = process.cwd();

function readIfExists(rel: string): string {
  const p = path.join(repoRoot, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const openApi = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_OpenAPI_3_1.yaml");
const asyncApi = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_AsyncAPI_SSE.md")
  || readIfExists(".lovable/spec/bff/2026-05-07-H/Pantheon_BFF_AsyncAPI_SSE.md");

describe("BFF v1 contract drift", () => {
  it("canonical frontend path builders are reflected in OpenAPI text", () => {
    expect(openApi.length, "OpenAPI artifact must be present").toBeGreaterThan(1000);

    const canonicalPaths = [
      paths.me(),
      paths.authRefresh(),
      paths.logout(),
      paths.strategies(),
      paths.personas(),
      paths.capitalPools(),
      paths.rebalances(),
      paths.deployments(),
      paths.evolutionPrograms(),
      paths.researchExperiments(),
      paths.artifacts(),
      paths.jobs(),
      paths.approvals(),
      paths.approvalDecide("{id}").replace("%7Bid%7D", "{id}"),
      paths.alerts(),
      paths.incidents(),
      paths.audit(),
      paths.runtimes(),
      paths.mcpServers(),
      paths.mcpServerImportTools("{id}").replace("%7Bid%7D", "{id}"),
      paths.mcpTools(),
      paths.skills(),
      paths.channels(),
      paths.tools(),
      paths.rankingFormulas(),
      paths.sse(),
      paths.agoraJournal(),
      paths.v5LoopRuns(),
      paths.v5ExecutionPersonaHealth(),
    ];

    for (const p of canonicalPaths) {
      expect(openApi, `OpenAPI must include ${p}`).toContain(p);
    }

    expect(paths.strategies()).toBe("/bff/strategies");
    expect(paths.strategies({ exclude_state: "draft", page_size: 20 })).toBe(
      "/bff/strategies?exclude_state=draft&page_size=20",
    );
    expect(paths.strategies({ state: "approved", pageSize: 20, pageToken: "20" })).toBe(
      "/bff/strategies?state=approved&page_size=20&page_token=20",
    );
    expect(paths.researchTasks()).toBe("/bff/research-tasks");
    expect(paths.researchTask("rtask-20261023-008")).toBe("/bff/research-tasks/rtask-20261023-008");
    expect(paths.alphaFactory()).toBe("/bff/alpha-factory");
    expect(paths.alphaFactory({ lane: "replicated", page: 1, page_size: 20 })).toBe(
      "/bff/alpha-factory?lane=replicated&page=1&page_size=20",
    );
    expect(paths.mgmtEvolutionQualification()).toBe("/bff/management/evolution-qualification");
    expect(paths.mgmtEvolutionQualification({ qualified: false, offset: 0, pageSize: 50 })).toBe(
      "/bff/management/evolution-qualification?qualified=false&offset=0&page_size=50",
    );
    expect(paths.evolutionProgramRuns("evp-001")).toBe("/bff/evolution-programs/evp-001/runs");
    expect(EVOLUTION_QUALIFICATION_CRITERIA).toEqual([
      "real_threshold_signal",
      "real_target",
      "persistent_breach",
      "fresh_evidence",
      "executable_action",
      "no_open_duplicate",
    ]);
    expect(queryKeys.oversight.evolutionQualification({ tenantId: "default", mode: "live" })).toContain(
      "evolutionQualification",
    );
  });

  it("ActionCommandStatus is a named schema and does not contain requires_* success states", () => {
    expect(ACTION_COMMAND_STATUSES).toEqual(["accepted", "queued", "completed"]);
    expect(openApi).toMatch(/ActionCommandStatus:/);
    expect(openApi).not.toMatch(/requires_confirm_token.*enum|requires_approval.*enum|requires_two_man.*enum/s);
  });

  it("ErrorCode runtime list is represented in OpenAPI or final docs", () => {
    const finalDoc = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md");
    const corpus = `${openApi}\n${finalDoc}`;
    for (const code of ERROR_CODES) {
      expect(corpus, `contract docs must include ErrorCode ${code}`).toContain(code);
    }
  });

  it("SSE channel runtime list is represented in AsyncAPI or final docs", () => {
    const finalDoc = readIfExists(".lovable/feedback/2026-05-07-final/Pantheon_BFF_Contract_Spec_2026-05-07_Final.md");
    const corpus = `${asyncApi}\n${finalDoc}`;
    for (const channel of SSE_CHANNELS) {
      expect(corpus, `SSE contract docs must include channel ${channel}`).toContain(channel);
    }
  });

  it("Evidence capability map has a capability for every accepted evidence kind", () => {
    for (const [kind, cap] of Object.entries(EVIDENCE_CAPABILITY_MAP)) {
      expect(kind.length).toBeGreaterThan(0);
      expect(cap.length).toBeGreaterThan(0);
      expect(cap).toMatch(/^([a-z0-9_]+|\*)(\.[a-z0-9_*]+)*$/);
    }
  });

  it("Agora generated types carry the v1.13 dynamic Trading Room bundle snapshot", () => {
    expect(AGORA_CONTRACT_SNAPSHOT.bundleVersion).toBe("1.13");
    expect(AGORA_CONTRACT_SNAPSHOT.sourceBundle).toBe(
      "services/control-plane/specs/agora/bundle_index.v1_13.json",
    );
    expect(AGORA_SCHEMA_FILES).toContain("specs/agora/trading_room_workspace.schema.json");
    expect(AGORA_CAPABILITIES.map((capability) => capability.name)).toEqual(
      expect.arrayContaining([
        "agora.trading_room.workspace_proposal.v1",
        "agora.trading_room.workspace_editing.v1",
        "agora.trading_room.widget_revision.v1",
        "agora.trading_room.workspace_versions.v1",
      ]),
    );
    expect(AGORA_ROUTE_PATHS).toContain("/bff/agora/strategies/{strategy_id}/trading-room/proposals");
    expect(AGORA_ROUTE_PATHS).toContain(
      "/bff/agora/trading-room/workspaces/{workspace_id}/widgets/{widget_id}/revision-proposals",
    );
    expect(AGORA_ROUTE_PATHS).toContain(
      "/bff/agora/trading-room/workspaces/{workspace_id}/versions/{version_id}/rollback",
    );
    expect(AGORA_CONTRACT_SNAPSHOT.files["openapi/agora_v1_13.openapi.yaml"]).toMatch(/^[0-9a-f]{64}$/);
    expect(AGORA_CONTRACT_SNAPSHOT.files["specs/agora/trading_room_workspace.schema.json"]).toMatch(/^[0-9a-f]{64}$/);
    expect(contractSnapshot.contract_version).toBe("1.13");
    expect(contractSnapshot.source_bundle).toBe(AGORA_CONTRACT_SNAPSHOT.sourceBundle);
    expect(contractSnapshot.required_definition_checksums).toEqual(AGORA_SCHEMA_DEFINITION_CHECKSUMS);
  });

  it("dynamic Trading Room generated types are usable by frontend clients", () => {
    const widget: TradingRoomWidgetSpec = {
      id: "w-score",
      widgetType: "winner_branch_score",
      title: "Winner Branch Score",
      purpose: "Rank candidates by branch score.",
      whyIncluded: "Core V11 Winner Branch view widget.",
      dataSource: "winner_branch_score",
      query: { filters: {} },
      chartSpec: { spec_version: "1.0", kind: "table", encodings: {} },
      interactions: [],
      placement: { x: 0, y: 0, width: 6, height: 4, minWidth: 3, minHeight: 2 },
      minSize: { width: 3, height: 2 },
      maxSize: { width: 12, height: 8 },
      sensitivity: "public_market",
    };
    const workspaceProposal: TradingRoomWorkspaceProposal = {
      strategyId: "strategy-winner-branch",
      strategyVersion: "v4",
      proposalId: "trp-1",
      generatedAt: "2026-06-29T00:00:00Z",
      status: "preview",
      views: [
        {
          id: "strategy_overview",
          title: "Strategy Overview",
          purpose: "Summarize Winner Branch strategy readiness.",
          order: 1,
          layoutTemplate: "overview",
          widgetCount: 1,
          widgets: [widget],
        },
      ],
      rationale: "Trading servant generated the complete V11 workspace preview.",
      dataAvailability: { status: "complete", sources: [{ dataSource: "winner_branch_score", status: "complete" }] },
      warnings: [],
      personalizationApplied: { status: "not_applied", items: [] },
    };
    const revision: WidgetRevisionProposal = {
      id: "wrp-1",
      workspaceId: "trw-1",
      viewId: "strategy_overview",
      widgetId: widget.id,
      instruction: "Show score as a heatmap.",
      beforeSpec: widget,
      proposedSpec: { ...widget, title: "Winner Branch Score Heatmap" },
      rationale: "The heatmap improves comparison across branches.",
      warnings: [],
      dataAvailability: "complete",
      status: "preview",
    };

    expect(workspaceProposal.views[0].widgets[0].id).toBe(widget.id);
    expect(revision.proposedSpec.title).toBe("Winner Branch Score Heatmap");
  });
});

describe("Evolution run outcome fields (BFF_API_CONTRACT.md retrain run outcome)", () => {
  it("passes the six structured fields through and never defaults them", () => {
    const run = normalizeEvolutionRun({
      run_id: "resrun-1",
      status: "completed",
      outcome: "candidate_created",
      outcome_reason: "ok",
      candidate_artifact_id: "art-1",
      baseline_metrics: { sharpe_ratio: 0.8, sharpe_defined: true },
      candidate_metrics: { sharpe_ratio: 1.2, sharpe_defined: true },
      session_id: "ts-1",
    }, "evp-1");
    expect(run).toMatchObject({
      outcome: "candidate_created",
      outcome_reason: "ok",
      candidate_artifact_id: "art-1",
      baseline_metrics: { sharpe_ratio: 0.8 },
      candidate_metrics: { sharpe_ratio: 1.2 },
      session_id: "ts-1",
    });
    const bare = normalizeEvolutionRun({ run_id: "resrun-2", status: "queued" }, "evp-1");
    expect(bare).toMatchObject({
      outcome: null,
      outcome_reason: null,
      candidate_artifact_id: null,
      baseline_metrics: null,
      candidate_metrics: null,
      session_id: null,
    });
  });

  it("normalizes AlphaFactory card replay, revalidation, strategy_state, and surface fields (BFF-EVO-ALPHA-PAGE-TRUTH-20261107)", () => {
    const card = normalizeAlphaFactoryCard(
      {
        id: "adm-h12-01a11",
        admission_id: "adm-h12-01a11",
        lane: "replicated",
        strategy_id: "strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
        strategy_spec_id: "reg-strategy-spec-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
        status: "admitted",
        queue_status: "completed",
        attempt_count: 0,
        replay_count: 1,
        revalidation_count: 1,
        last_replayed_at: "2026-10-24T02:28:22Z",
        last_error: null,
        strategy_state: "retired",
        experiment_run_ids: ["r1", "r2", "r3", "r4"],
      },
      "replicated",
    );
    expect(card).toMatchObject({
      id: "adm-h12-01a11",
      attempt_count: 0,
      replay_count: 1,
      revalidation_count: 1,
      last_replayed_at: "2026-10-24T02:28:22Z",
      last_error: null,
      strategy_state: "retired",
    });

    const envelope = normalizeAlphaFactoryEnvelope({
      data: {
        id: "alpha-factory",
        discovered_reason: "no_candidate_source",
        discovered: [],
        scaffolded: [],
        replicated: [card],
        items: [card],
      },
      items: [card],
      page_info: { page: 1, page_size: 20, total: 1, next_page_token: null },
      meta: {
        surfaces: {
          alpha_factory: { status: "ok", source: "research_orchestrator" },
          alpha_factory_strategy_state: { status: "ok", source: "bff_strategy_registry" },
        },
      },
    });
    expect(envelope.meta.surfaces?.alpha_factory_strategy_state).toEqual({
      status: "ok",
      source: "bff_strategy_registry",
    });
  });

  it("covers optional holdings instrument fields (instrument_id, instrument_kind/kind, contract_month, multiplier, margin_reserved, reason_code) and tolerates their absence (INSTRUMENT-AWARE-TELEMETRY-BFF-DRIFT-20261107)", () => {
    const monitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 3,
          incident_count: 0,
          source_coverage: {
            source_row_count: 3,
            runtime_count: 2,
            telemetry_runtime_count: 2,
            stale_row_count: 0,
            missing_binding_count: 0,
            degraded_source_count: 0,
          },
        },
        items: [
          {
            holding_id: "rt-fut:ssf:QFF:202611",
            runtime_id: "rt-fut",
            persona_id: "persona-fut",
            capital_pool_id: "pool-fut",
            broker_id: "shioaji_paper",
            symbol: "2330.TWSE",
            instrument_id: "ssf:QFF:202611",
            instrument_kind: "stock_future",
            contract_month: "202611",
            multiplier: 100,
            margin_reserved: 92000,
            reason_code: "short_via_future",
            side: "long",
            currency: "TWD",
            quantity: 2,
            average_price: 2300,
            mark_price: 2250,
            market_value: 450000,
            unrealized_pnl: -10000,
            realized_pnl: 0,
            mark_status: "available",
            last_mark_at: "2026-11-07T06:00:00Z",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-fut",
            },
            links: {},
          },
          {
            holding_id: "rt-cash-alias:2330.TWSE",
            runtime_id: "rt-cash",
            symbol: "2330.TWSE",
            instrument_id: "eq:2330",
            kind: "cash_share",
            contract_month: null,
            multiplier: 1,
            initial_margin_reserved: null,
            reason_code: "long_cash",
            currency: "TWD",
            quantity: 5,
            average_price: 2299,
            mark_price: 2240,
            market_value: 11200,
            unrealized_pnl: -295,
            mark_status: "available",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-cash",
            },
            links: {},
          },
          {
            holding_id: "rt-legacy:2317.TWSE",
            runtime_id: "rt-legacy",
            symbol: "2317.TWSE",
            currency: "TWD",
            quantity: -3,
            average_price: 240,
            mark_price: 235,
            market_value: -705,
            unrealized_pnl: 15,
            mark_status: "available",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-legacy",
            },
            links: {},
          },
        ],
      },
      meta: {
        incidents: [],
        surfaces: { portfolio_book_holdings: { status: "ok" } },
      },
    });

    expect(monitor).not.toBeNull();
    expect(monitor?.items[0]).toMatchObject({
      holdingId: "rt-fut:ssf:QFF:202611",
      symbol: "2330.TWSE",
      instrumentId: "ssf:QFF:202611",
      instrumentKind: "stock_future",
      contractMonth: "202611",
      multiplier: 100,
      marginReserved: 92000,
      reasonCode: "short_via_future",
      marketValue: 450000,
      unrealizedPnl: -10000,
    });
    expect(monitor?.items[1]).toMatchObject({
      holdingId: "rt-cash-alias:2330.TWSE",
      instrumentId: "eq:2330",
      instrumentKind: "cash_share",
      multiplier: 1,
      reasonCode: "long_cash",
      marketValue: 11200,
      unrealizedPnl: -295,
    });
    expect(monitor?.items[1].contractMonth).toBeUndefined();
    expect(monitor?.items[1].marginReserved).toBeUndefined();
    expect(monitor?.items[2].instrumentId).toBeUndefined();
    expect(monitor?.items[2].instrumentKind).toBeUndefined();
    expect(monitor?.items[2].contractMonth).toBeUndefined();
    expect(monitor?.items[2].multiplier).toBeUndefined();
    expect(monitor?.items[2].marginReserved).toBeUndefined();
    expect(monitor?.items[2].reasonCode).toBeUndefined();

    const rows = adaptPortfolioHoldingRows({
      data: {
        items: [
          {
            holding_id: "rt-fut:ssf:QFF:202611",
            capital_pool_id: "pool-fut",
            symbol: "2330.TWSE",
            instrument_id: "ssf:QFF:202611",
            kind: "stock_future",
            contract_month: "202611",
            multiplier: 100,
            margin_reserved: 92000,
            reason_code: "long_lever",
            quantity: 2,
            average_price: 2300,
            mark_price: 2250,
            market_value: 450000,
            notional: 450000,
            weight_pct: 0.45,
            unrealized_pnl: -10000,
            realized_pnl: 0,
            pnl_pct: -0.0217,
            exposure_pct: 0.45,
            currency: "TWD",
          },
          {
            holding_id: "rt-legacy:2330.TWSE",
            capital_pool_id: "pool-cash",
            symbol: "2330.TWSE",
            quantity: 1,
            average_price: 2299,
            mark_price: 2240,
            market_value: 2240,
            notional: 2240,
            weight_pct: 0.1,
            unrealized_pnl: -59,
            realized_pnl: 0,
            pnl_pct: -0.0257,
            exposure_pct: 0.1,
            currency: "TWD",
          },
        ],
      },
    });
    expect(rows?.[0]).toMatchObject({
      holdingId: "rt-fut:ssf:QFF:202611",
      instrumentId: "ssf:QFF:202611",
      instrumentKind: "stock_future",
      contractMonth: "202611",
      multiplier: 100,
      marginReserved: 92000,
      reasonCode: "long_lever",
      marketValue: 450000,
      unrealizedPnl: -10000,
    });
    expect(rows?.[1]?.instrumentId).toBeUndefined();
    expect(rows?.[1]?.instrumentKind).toBeUndefined();
    expect(rows?.[1]?.contractMonth).toBeUndefined();
    expect(rows?.[1]?.multiplier).toBeUndefined();
    expect(rows?.[1]?.marginReserved).toBeUndefined();
    expect(rows?.[1]?.reasonCode).toBeUndefined();
  });

  it("covers optional performance attribution summary.instrument_learning and summary.instrument_breakdown fields and tolerates their absence (FE-ATTRIBUTION-INSTRUMENT-LEARNING-20261110)", () => {
    const withSummary = adaptPerformanceAttributionResult({
      data: {
        period: "latest",
        summary: {
          period: "latest",
          requested_period: "latest",
          period_windowed: false,
          instrument_learning: {
            direction_hit_rate: 0.75,
            direction_hit_count: 3,
            direction_graded_count: 4,
            instrument_regret: 42.5,
            instrument_regret_graded_count: 4,
            margin_use: 0.174,
            decision_count: 4,
            decisions: [
              {
                decision_id: "rt-1:dec-1",
                chosen_instrument_id: "ssf:SRF:202611",
                best_instrument_id: "ssf:SRF:202611",
                direction_hit: true,
                instrument_regret: 0,
                margin_use: 0.174,
                chosen_pnl: 1200,
              },
            ],
          },
          instrument_breakdown: [
            {
              instrument_key: "ssf:SRF:202611",
              instrument_id: "ssf:SRF:202611",
              symbol: "0050.TWSE",
              instrument_kind: "stock_future",
              contract_month: "202611",
              multiplier: 1000,
              margin_reserved: 17400,
              holding_count: 1,
              market_value: null,
              total_notional: null,
              total_pnl: 0,
              unrealized_pnl: null,
              realized_pnl: 0,
            },
          ],
        },
        items: [
          {
            dimension: "persona",
            dimension_key: "persona-1",
            label: "Persona 1",
            period: "latest",
            metrics: { total_pnl: 1200 },
          },
        ],
      },
      meta: {
        period: {
          requested: "latest",
          applied: "latest",
          windowed: false,
          basis: "latest_runtime_telemetry_snapshot",
        },
      },
    });

    expect(withSummary.rows).toHaveLength(1);
    expect(withSummary.summary?.instrument_learning).toEqual({
      direction_hit_rate: 0.75,
      direction_hit_count: 3,
      direction_graded_count: 4,
      instrument_regret: 42.5,
      instrument_regret_graded_count: 4,
      margin_use: 0.174,
      decision_count: 4,
      decisions: [
        {
          decision_id: "rt-1:dec-1",
          chosen_instrument_id: "ssf:SRF:202611",
          best_instrument_id: "ssf:SRF:202611",
          direction_hit: true,
          instrument_regret: 0,
          margin_use: 0.174,
          chosen_pnl: 1200,
        },
      ],
    });
    expect(withSummary.summary?.instrument_breakdown).toEqual([
      {
        instrument_key: "ssf:SRF:202611",
        instrument_id: "ssf:SRF:202611",
        symbol: "0050.TWSE",
        instrument_kind: "stock_future",
        contract_month: "202611",
        multiplier: 1000,
        margin_reserved: 17400,
        holding_count: 1,
        market_value: null,
        total_notional: null,
        total_pnl: 0,
        unrealized_pnl: null,
        realized_pnl: 0,
      },
    ]);

    const withoutSummary = adaptPerformanceAttributionResult({
      data: {
        period: "latest",
        summary: { period: "latest", requested_period: "latest", period_windowed: false },
        items: [
          {
            dimension: "persona",
            dimension_key: "persona-1",
            label: "Persona 1",
            period: "latest",
            metrics: { total_pnl: 1200 },
          },
        ],
      },
      meta: {
        period: {
          requested: "latest",
          applied: "latest",
          windowed: false,
          basis: "latest_runtime_telemetry_snapshot",
        },
      },
    });

    expect(withoutSummary.rows).toHaveLength(1);
    expect(withoutSummary.summary).toBeUndefined();
    expect(Object.keys(withoutSummary)).toEqual(["rows", "period"]);
  });
});
