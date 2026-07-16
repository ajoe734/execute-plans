// 2026-05-22 PM-12 facade tests.
import { describe, it, expect } from "vitest";
import { mgmt } from "@/lib/bff-v1";
import { adaptPortfolioHoldingsMonitor, adaptQuarterlyRankingRows } from "@/lib/bff-v1/management";
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
    expect(paths.mgmtQuarterlyRankingRecommendationSubmit("pm12-rec-1"))
      .toBe("/bff/management/quarterly-ranking/recommendations/pm12-rec-1/submit");
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
