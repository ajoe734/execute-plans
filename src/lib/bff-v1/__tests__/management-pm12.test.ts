// 2026-05-22 PM-12 facade tests.
import { describe, it, expect } from "vitest";
import { mgmt } from "@/lib/bff-v1";
import {
  adaptPerformanceAttributionResult,
  adaptPerformanceAttributionRows,
  adaptPortfolioHoldingsMonitor,
  adaptQuarterlyRankingRows,
} from "@/lib/bff-v1/management";
import { paths } from "@/lib/bff-v1/paths";
import { defaultPortfolioBook, defaultPortfolioPools, defaultPortfolioHoldings } from "@/lib/v5/management/portfolio";
import { defaultPersonaLeague } from "@/lib/v5/management/personaLeague";
import { defaultQuarterlyRanking, defaultQuarterlyFormula } from "@/lib/v5/management/quarterlyRanking";
import { defaultPerformanceAttribution } from "@/lib/v5/management/performanceAttribution";

describe("PM12 paths", () => {
  it("portfolio book / pools / holdings", () => {
    expect(paths.mgmtPortfolioBook()).toBe("/bff/management/portfolio-book");
    expect(paths.mgmtPortfolioPools()).toBe("/bff/management/portfolio-book/pools");
    expect(paths.mgmtPortfolioHoldings()).toBe("/bff/management/portfolio-book/holdings");
    expect(paths.mgmtPortfolioExposure()).toBe("/bff/management/portfolio-book/exposure");
  });
  it("portfolio holdings serializes all monitor filters", () => {
    expect(paths.mgmtPortfolioHoldings({ deployment_stage: "canary", broker_id: "broker a", runtime_id: "rt-1", source_status: "stale", stale_telemetry: "true", risk_state: "stale_telemetry" }))
      .toBe("/bff/management/portfolio-book/holdings?deployment_stage=canary&broker_id=broker%20a&runtime_id=rt-1&source_status=stale&stale_telemetry=true&risk_state=stale_telemetry");
  });
  it("persona league", () => {
    expect(paths.mgmtPersonaLeague()).toBe("/bff/management/persona-league");
    expect(paths.mgmtPersonaLeagueRankings()).toBe("/bff/management/persona-league/rankings");
  });
  it("quarterly ranking with quarter qs", () => {
    expect(paths.mgmtQuarterlyRanking()).toBe("/bff/management/quarterly-ranking");
    expect(paths.mgmtQuarterlyRanking("2026-Q2")).toContain("quarter=2026-Q2");
    expect(paths.mgmtQuarterlyRanking("2026-Q2", { pageSize: 200, persona: "persona/live alpha" }))
      .toBe("/bff/management/quarterly-ranking?quarter=2026-Q2&page_size=200&persona=persona%2Flive%20alpha");
    expect(paths.mgmtQuarterlyRanking(undefined, { pageSize: 200, persona: "persona/live alpha" }))
      .toBe("/bff/management/quarterly-ranking?page_size=200&persona=persona%2Flive%20alpha");
    expect(paths.mgmtQuarterlyRankingFormula()).toBe("/bff/management/quarterly-ranking/formula");
    expect(paths.commandsV1()).toBe("/bff/v1/commands");
  });
  it("performance attribution", () => {
    expect(paths.mgmtPerformanceAttribution()).toBe("/bff/management/performance-attribution");
    expect(paths.mgmtPerformanceAttribution("persona", "30d"))
      .toBe("/bff/management/performance-attribution?dimension=persona&period=30d");
    expect(paths.mgmtOperationsReadModel("persona/alpha", "30d"))
      .toBe("/bff/management/operations-read-model/persona%2Falpha?period=30d");
  });
});

describe("portfolio holdings live monitor adapter", () => {
  it("preserves degraded rows, incidents, capital scope, and coverage truth", () => {
    const items = Array.from({ length: 14 }, (_, index) => ({ holding_id: `h-${index}`, runtime_id: `rt-${index}`, symbol: `SYM${index}`, deployment_stage: index % 4 === 0 ? "paper" : index % 4 === 1 ? "canary" : index % 4 === 2 ? "live" : "unknown", source_status: "degraded", risk_state: "missing_binding", telemetry_stale: false, source_issues: [{ code: "MISSING_PERSONA_BINDING", message: "Binding unavailable" }], capital_scope: { scope_kind: index % 4 === 0 ? "paper_ledger" : index % 4 === 1 ? "canary_sleeve" : index % 4 === 2 ? "live_capital_pool" : "unclassified", scope_id: index % 4 === 3 ? null : `scope-${index}` }, links: { human_review: `/management/human-inbox?holding_id=h-${index}` } }));
    const incidents = items.map((item) => ({ id: `incident-${item.holding_id}`, severity: "high", message: "Binding unavailable", risk_state: "missing_binding", source_status: "degraded", source_issues: item.source_issues, identity: { portfolio_id: item.holding_id }, links: item.links }));
    const result = adaptPortfolioHoldingsMonitor({ data: { items, summary: { holding_count: 14, incident_count: 14, source_coverage: { source_row_count: 4, runtime_count: 14, telemetry_runtime_count: 4, stale_row_count: 0, missing_binding_count: 10, degraded_source_count: 14 } } }, meta: { incidents, surfaces: { portfolio_book_holdings: { status: "degraded", message: "row-level coverage incidents" } } } });
    expect(result?.items).toHaveLength(14);
    expect(result?.incidents).toHaveLength(14);
    expect(result?.coverage.missingBindingCount).toBe(10);
    expect(result?.surfaceStatus).toBe("degraded");
    expect(result?.items.map((item) => item.capitalScope.scopeKind)).toContain("unclassified");
    expect(result?.items.every((item) => item.sourceStatus !== "ok")).toBe(true);
  });

  it("keeps empty, partial, stale, and unavailable source states distinct", () => {
    for (const status of ["partial", "stale", "unavailable"]) {
      const result = adaptPortfolioHoldingsMonitor({ data: { items: [], summary: { holding_count: 0, source_coverage: {} } }, meta: { incidents: [], surfaces: { portfolio_book_holdings: { status } } } });
      expect(result?.surfaceStatus).toBe(status);
      expect(result?.items).toEqual([]);
    }
  });

  it("retains explicit currency and preserves null currency, signed market_value, and unavailable unrealized_pnl from the BFF monitor DTO", () => {
    const result = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 3,
          incident_count: 0,
          source_coverage: {
            source_row_count: 3,
            runtime_count: 3,
            telemetry_runtime_count: 3,
            stale_row_count: 0,
            missing_binding_count: 0,
            degraded_source_count: 0,
          },
        },
        items: [
          {
            id: "rt-eb295fe2:2330.TW",
            holding_id: "rt-eb295fe2:2330.TW",
            capital_pool_id: "hosted-all12-h12-01a11-20261023-9aeb-pool",
            broker_id: "",
            runtime_id: "rt-eb295fe2",
            persona_id: "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
            symbol: "2330.TW",
            side: "short",
            quantity: -2.0,
            mark_price: 2385.0,
            market_value: -4770.0,
            unrealized_pnl: null,
            currency: null,
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
            links: {},
          },
          {
            id: "rt-twd:2330.TW",
            holding_id: "rt-twd:2330.TW",
            runtime_id: "rt-twd",
            symbol: "2330.TW",
            quantity: -2.0,
            market_value: -4770.0,
            unrealized_pnl: -120.0,
            currency: "TWD",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
            links: {},
          },
          {
            id: "rt-usd:AAPL",
            holding_id: "rt-usd:AAPL",
            runtime_id: "rt-usd",
            symbol: "AAPL",
            quantity: 10.0,
            market_value: 1926.0,
            unrealized_pnl: null,
            currency: "USD",
            deployment_stage: "live",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "live_exposure",
            source_issues: [],
            capital_scope: { stage: "live", scope_kind: "live_capital_pool", scope_id: "pool-us" },
            links: {},
          },
        ],
      },
      meta: {
        incidents: [],
        surfaces: { portfolio_book_holdings: { status: "ok" } },
      },
    });

    expect(result?.items).toHaveLength(3);
    expect(result?.items[0]).toEqual(expect.objectContaining({
      holdingId: "rt-eb295fe2:2330.TW",
      symbol: "2330.TW",
      currency: null,
      quantity: -2,
      averagePrice: undefined,
      markPrice: 2385,
      marketValue: -4770,
      unrealizedPnl: undefined,
      realizedPnl: undefined,
    }));
    expect(result?.items[1]).toEqual(expect.objectContaining({
      holdingId: "rt-twd:2330.TW",
      currency: "TWD",
      quantity: -2,
      averagePrice: undefined,
      markPrice: undefined,
      marketValue: -4770,
      unrealizedPnl: -120,
      realizedPnl: undefined,
    }));
    expect(result?.items[2]).toEqual(expect.objectContaining({
      holdingId: "rt-usd:AAPL",
      currency: "USD",
      quantity: 10,
      averagePrice: undefined,
      markPrice: undefined,
      marketValue: 1926,
      unrealizedPnl: undefined,
      realizedPnl: undefined,
    }));
  });

  it("maps average_price, mark_price, and realized_pnl to optional finite numbers for both 2026-11-06 BFF shapes without turning null into zero", () => {
    const preTelemetryRows = [
      {
        id: "rt-535a82a3:2330.TWSE",
        holding_id: "rt-535a82a3:2330.TWSE",
        runtime_id: "rt-535a82a3",
        broker_id: "",
        symbol: "2330.TWSE",
        side: "short",
        quantity: -5,
        average_price: null,
        mark_price: 2240,
        market_value: -11200,
        unrealized_pnl: null,
        realized_pnl: null,
        currency: null,
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
      {
        id: "rt-8b0d8649:0050.TWSE",
        holding_id: "rt-8b0d8649:0050.TWSE",
        runtime_id: "rt-8b0d8649",
        broker_id: "",
        symbol: "0050.TWSE",
        side: "short",
        quantity: -5,
        average_price: null,
        mark_price: 97.15,
        market_value: -485.75,
        unrealized_pnl: null,
        realized_pnl: null,
        currency: null,
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
      {
        id: "rt-c98e4223:2317.TWSE",
        holding_id: "rt-c98e4223:2317.TWSE",
        runtime_id: "rt-c98e4223",
        broker_id: "",
        symbol: "2317.TWSE",
        side: "short",
        quantity: -3,
        average_price: null,
        mark_price: 235,
        market_value: -705,
        unrealized_pnl: null,
        realized_pnl: null,
        currency: null,
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
      {
        id: "rt-342d76ff:2330.TW",
        holding_id: "rt-342d76ff:2330.TW",
        runtime_id: "rt-342d76ff",
        broker_id: "",
        symbol: "2330.TW",
        side: "short",
        quantity: -1,
        average_price: null,
        mark_price: 2240,
        market_value: -2240,
        unrealized_pnl: null,
        realized_pnl: null,
        currency: null,
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
    ];

    const preResult = adaptPortfolioHoldingsMonitor({
      data: {
        summary: { holding_count: 4, incident_count: 0, source_coverage: {} },
        items: preTelemetryRows,
      },
      meta: { incidents: [], surfaces: { portfolio_book_holdings: { status: "ok" } } },
    });

    expect(preResult?.items).toHaveLength(4);
    expect(preResult?.items.map((r) => ({
      holdingId: r.holdingId,
      brokerId: r.brokerId,
      currency: r.currency,
      quantity: r.quantity,
      averagePrice: r.averagePrice,
      markPrice: r.markPrice,
      marketValue: r.marketValue,
      unrealizedPnl: r.unrealizedPnl,
      realizedPnl: r.realizedPnl,
    }))).toEqual([
      {
        holdingId: "rt-535a82a3:2330.TWSE",
        brokerId: undefined,
        currency: null,
        quantity: -5,
        averagePrice: undefined,
        markPrice: 2240,
        marketValue: -11200,
        unrealizedPnl: undefined,
        realizedPnl: undefined,
      },
      {
        holdingId: "rt-8b0d8649:0050.TWSE",
        brokerId: undefined,
        currency: null,
        quantity: -5,
        averagePrice: undefined,
        markPrice: 97.15,
        marketValue: -485.75,
        unrealizedPnl: undefined,
        realizedPnl: undefined,
      },
      {
        holdingId: "rt-c98e4223:2317.TWSE",
        brokerId: undefined,
        currency: null,
        quantity: -3,
        averagePrice: undefined,
        markPrice: 235,
        marketValue: -705,
        unrealizedPnl: undefined,
        realizedPnl: undefined,
      },
      {
        holdingId: "rt-342d76ff:2330.TW",
        brokerId: undefined,
        currency: null,
        quantity: -1,
        averagePrice: undefined,
        markPrice: 2240,
        marketValue: -2240,
        unrealizedPnl: undefined,
        realizedPnl: undefined,
      },
    ]);

    const postTelemetryRows = [
      { ...preTelemetryRows[0], currency: "TWD", broker_id: "shioaji_paper", average_price: 2299, unrealized_pnl: 295, realized_pnl: 0 },
      { ...preTelemetryRows[1], currency: "TWD", broker_id: "shioaji_paper", average_price: 101.33, unrealized_pnl: 20.9, realized_pnl: 0 },
      { ...preTelemetryRows[2], currency: "TWD", broker_id: "shioaji_paper", average_price: 240.166667, unrealized_pnl: 15.5, realized_pnl: -5.5 },
      { ...preTelemetryRows[3], currency: "TWD", broker_id: "shioaji_paper", average_price: 2240, unrealized_pnl: 0, realized_pnl: 0 },
    ];

    const postResult = adaptPortfolioHoldingsMonitor({
      data: {
        summary: { holding_count: 4, incident_count: 0, source_coverage: {} },
        items: postTelemetryRows,
      },
      meta: { incidents: [], surfaces: { portfolio_book_holdings: { status: "ok" } } },
    });

    expect(postResult?.items.map((r) => ({
      holdingId: r.holdingId,
      brokerId: r.brokerId,
      currency: r.currency,
      quantity: r.quantity,
      averagePrice: r.averagePrice,
      markPrice: r.markPrice,
      marketValue: r.marketValue,
      unrealizedPnl: r.unrealizedPnl,
      realizedPnl: r.realizedPnl,
    }))).toEqual([
      {
        holdingId: "rt-535a82a3:2330.TWSE",
        brokerId: "shioaji_paper",
        currency: "TWD",
        quantity: -5,
        averagePrice: 2299,
        markPrice: 2240,
        marketValue: -11200,
        unrealizedPnl: 295,
        realizedPnl: 0,
      },
      {
        holdingId: "rt-8b0d8649:0050.TWSE",
        brokerId: "shioaji_paper",
        currency: "TWD",
        quantity: -5,
        averagePrice: 101.33,
        markPrice: 97.15,
        marketValue: -485.75,
        unrealizedPnl: 20.9,
        realizedPnl: 0,
      },
      {
        holdingId: "rt-c98e4223:2317.TWSE",
        brokerId: "shioaji_paper",
        currency: "TWD",
        quantity: -3,
        averagePrice: 240.166667,
        markPrice: 235,
        marketValue: -705,
        unrealizedPnl: 15.5,
        realizedPnl: -5.5,
      },
      {
        holdingId: "rt-342d76ff:2330.TW",
        brokerId: "shioaji_paper",
        currency: "TWD",
        quantity: -1,
        averagePrice: 2240,
        markPrice: 2240,
        marketValue: -2240,
        unrealizedPnl: 0,
        realizedPnl: 0,
      },
    ]);
  });

  it("adapts mark_status, last_mark_at, side, and signed quantity from the real 2026-11-05 hosted BFF rows without recomputing stale market_value or filling currency", () => {
    const result = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 2,
          incident_count: 0,
          source_coverage: {
            source_row_count: 2,
            runtime_count: 2,
            telemetry_runtime_count: 2,
            stale_row_count: 1,
            missing_binding_count: 0,
            degraded_source_count: 0,
          },
        },
        items: [
          {
            id: "rt-482f3e28:2317.TWSE",
            symbol: "2317.TWSE",
            side: "short",
            quantity: -1,
            average_price: null,
            mark_price: null,
            market_value: null,
            notional: null,
            unrealized_pnl: null,
            realized_pnl: null,
            total_pnl: 0,
            currency: null,
            source_status: "ok",
            source_issues: [],
            telemetry_available: true,
            telemetry_stale: true,
            mark_status: "stale",
            last_mark_at: "2026-10-29T00:00:00Z",
          },
          {
            id: "rt-c98e4223:2317.TWSE",
            symbol: "2317.TWSE",
            side: "short",
            quantity: -2,
            average_price: null,
            mark_price: 240,
            market_value: -480,
            notional: 480,
            unrealized_pnl: null,
            total_pnl: 0,
            currency: null,
            source_status: "ok",
            source_issues: [],
            telemetry_stale: false,
            mark_status: "available",
            last_mark_at: "2026-11-04T00:00:00Z",
          },
        ],
      },
      meta: {
        incidents: [],
        surfaces: { portfolio_book_holdings: { status: "partial" } },
      },
    });

    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]).toEqual(expect.objectContaining({
      holdingId: "rt-482f3e28:2317.TWSE",
      symbol: "2317.TWSE",
      side: "short",
      quantity: -1,
      marketValue: undefined,
      unrealizedPnl: undefined,
      currency: null,
      sourceStatus: "ok",
      sourceIssues: [],
      telemetryStale: true,
      markStatus: "stale",
      lastMarkAt: "2026-10-29T00:00:00Z",
    }));
    expect(result?.items[1]).toEqual(expect.objectContaining({
      holdingId: "rt-c98e4223:2317.TWSE",
      symbol: "2317.TWSE",
      side: "short",
      quantity: -2,
      marketValue: -480,
      unrealizedPnl: undefined,
      currency: null,
      sourceStatus: "ok",
      sourceIssues: [],
      telemetryStale: false,
      markStatus: "available",
      lastMarkAt: "2026-11-04T00:00:00Z",
    }));
  });
});

describe("quarterly ranking live adapter", () => {
  it("keeps focused BFF rows that identify the persona with persona", () => {
    const rows = adaptQuarterlyRankingRows({
      data: {
        items: [
          {
            persona: "persona-live-smoke-b",
            name: "Deploy Smoke Persona 2026-05-13 B Persisted",
            rank: 7,
            previous_quarter_rank: 9,
            rank_delta: 2,
            tier_label: "B",
            score: 71.25,
            eligibility: "eligible",
            metrics: { pnl: 12500, sharpe: 1.42 },
            evidence_refs: ["evidence:live-smoke-b"],
          },
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toEqual(expect.objectContaining({
      personaId: "persona-live-smoke-b",
      personaName: "Deploy Smoke Persona 2026-05-13 B Persisted",
      currentRank: 7,
      previousQuarterRank: 9,
      rankDelta: 2,
      tier: "B",
      score: 71.25,
      pnlQuarter: 12500,
      sharpeQuarter: 1.42,
      eligibility: "eligible",
      evidenceRefs: ["evidence:live-smoke-b"],
    }));
  });
});

describe("PM12 mgmt facade — mock branch returns seed", () => {
  it("portfolioBook.summary", async () => {
    const seed = defaultPortfolioBook().summary;
    const out = await mgmt.portfolioBook.summary(() => seed);
    expect(out.totalNav).toBe(seed.totalNav);
  });
  it("portfolioBook.pools / holdings", async () => {
    const p = await mgmt.portfolioBook.pools(() => defaultPortfolioPools());
    const h = await mgmt.portfolioBook.holdings(() => defaultPortfolioHoldings());
    expect(p).toHaveLength(defaultPortfolioPools().length);
    expect(h.length).toBeGreaterThan(0);
  });
  it("personaLeague.list", async () => {
    const out = await mgmt.personaLeague.list(() => defaultPersonaLeague());
    expect(out.length).toBeGreaterThan(0);
  });
  it("quarterlyRanking.list / formula", async () => {
    const r = await mgmt.quarterlyRanking.list("2026-Q2", () => defaultQuarterlyRanking());
    const f = await mgmt.quarterlyRanking.formula(() => defaultQuarterlyFormula());
    expect(r.length).toBeGreaterThan(0);
    expect(f.version).toBe("1.0.0");
  });
  it("performanceAttribution.list", async () => {
    const out = await mgmt.performanceAttribution.list(
      undefined, "30d", () => defaultPerformanceAttribution(),
    );
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("performance attribution live adapter and dimension guard", () => {
  it("normalizes BFF pool, asset, and regime rows and preserves unknown dimensions without falling back to persona", () => {
    const result = adaptPerformanceAttributionResult({
      data: {
        items: [
          {
            id: "attribution:pool:pool-hosted-all12:latest",
            dimension: "pool",
            dimension_key: "pool-hosted-all12",
            label: "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool",
            period: "latest",
            data_confidence: "formal",
            source_status: "available",
            rank: 1,
            metrics: { total_pnl: 15420, pnl_contribution_pct: 0.24, worst_drawdown: 0.04 },
            total_pnl: 15420,
            pnl_contribution_pct: 0.24,
            notional_weight: 0.35,
            runtime_count: 1,
            holding_count: 2,
            source_refs: {
              runtime_ids: ["runtime-hosted-all12"],
              capital_pool_ids: ["pool-hosted-all12"],
              persona_ids: ["persona-strat-hosted-all12"],
              strategy_ids: ["strat-hosted-all12"],
            },
            links: {
              runtime: "/bff/runtimes/runtime-hosted-all12",
              capital_pool: "/bff/capital-pools/pool-hosted-all12",
              persona: "/bff/personas/persona-strat-hosted-all12",
              strategy: "/bff/strategies/strat-hosted-all12",
            },
          },
          {
            id: "attribution:asset:2330.TW:latest",
            dimension: "asset",
            dimension_key: "2330.TW",
            label: "2330.TW",
            period: "latest",
            data_confidence: "formal",
            source_status: "available",
            rank: 1,
            metrics: { total_pnl: 8910, pnl_contribution_pct: 0.14, worst_drawdown: 0.02 },
            total_pnl: 8910,
            pnl_contribution_pct: 0.14,
            notional_weight: 0.22,
            runtime_count: 1,
            holding_count: 1,
            source_refs: {
              runtime_ids: ["runtime-hosted-all12"],
              capital_pool_ids: ["pool-hosted-all12"],
              persona_ids: ["persona-strat-hosted-all12"],
              strategy_ids: ["strat-hosted-all12"],
            },
            links: {},
          },
          {
            id: "attribution:regime:unknown:latest",
            dimension: "regime",
            dimension_key: "unknown",
            label: "unknown",
            period: "latest",
            data_confidence: "formal",
            source_status: "available",
            rank: 1,
            metrics: { total_pnl: 64200, pnl_contribution_pct: 1.0, worst_drawdown: 0.06 },
            total_pnl: 64200,
            pnl_contribution_pct: 1.0,
            notional_weight: 1.0,
            runtime_count: 11,
            holding_count: 4,
            source_refs: {},
            links: {},
          },
          {
            id: "attribution:custom_factor:val-1:latest",
            dimension: "custom_factor",
            dimension_key: "val-1",
            label: "Value Factor",
            period: "latest",
            data_confidence: "formal",
            source_status: "available",
            rank: 1,
            metrics: { total_pnl: 1200, pnl_contribution_pct: 0.02, worst_drawdown: 0.01 },
            total_pnl: 1200,
            pnl_contribution_pct: 0.02,
            notional_weight: 0.05,
            runtime_count: 1,
            holding_count: 1,
            source_refs: {},
            links: {},
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

    expect(result?.rows).toHaveLength(4);
    expect(result?.rows[0]).toEqual(expect.objectContaining({
      dimension: "capital_pool",
      key: "pool-hosted-all12",
      label: "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool",
      links: expect.objectContaining({
        manageHref: "/management/governance-decisions?tab=capital&capital_id=pool-hosted-all12",
      }),
    }));
    expect(result?.rows[1]).toEqual(expect.objectContaining({
      dimension: "symbol",
      key: "2330.TW",
      label: "2330.TW",
      links: expect.objectContaining({
        manageHref: "/management/evidence",
      }),
    }));
    expect(result?.rows[2]).toEqual(expect.objectContaining({
      dimension: "market_regime",
      key: "unknown",
      label: "unknown",
      links: expect.objectContaining({
        manageHref: "/management/evidence",
      }),
    }));
    expect(result?.rows[3]).toEqual(expect.objectContaining({
      dimension: "custom_factor",
      key: "val-1",
      label: "Value Factor",
      links: expect.objectContaining({
        manageHref: "/management/evidence",
      }),
    }));
    expect(adaptPerformanceAttributionRows({ data: { items: [{ dimension: "pool", dimension_key: "pool-1", label: "Pool 1" }] } })?.[0]?.dimension).toBe("capital_pool");
  });

  it("short-circuits unsupported BFF dimensions before issuing a transport request", async () => {
    for (const unsupported of ["asset_class", "sector", "region", "research_backend", "quarter"] as const) {
      await expect(mgmt.performanceAttribution.getLiveOnly(unsupported, "latest")).resolves.toEqual({
        rows: [],
        period: {
          requested: "latest",
          windowed: false,
          reason: "unsupported_attribution_dimension",
          message: `Dimension "${unsupported}" is not supported by the BFF.`,
          source: "missing",
        },
      });
      await expect(mgmt.performanceAttribution.listLiveOnly(unsupported, "latest")).resolves.toEqual([]);
    }
  });
});
