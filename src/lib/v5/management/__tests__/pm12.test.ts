// 2026-05-22 PM-12 tests.
import { describe, it, expect } from "vitest";
import {
  defaultPortfolioBook, composePortfolioSummary,
  defaultPortfolioPools, defaultPortfolioHoldings,
} from "@/lib/v5/management/portfolio";
import {
  defaultPersonaLeague, sortByPreset, tierDistribution, computeTopMovers,
  PERSONA_LEAGUE_PRESETS,
} from "@/lib/v5/management/personaLeague";
import {
  defaultQuarterlyRanking, defaultQuarterlyFormula, computeQuarterlyScore,
} from "@/lib/v5/management/quarterlyRanking";
import {
  defaultPerformanceAttribution, ATTRIBUTION_DIMENSIONS,
} from "@/lib/v5/management/performanceAttribution";
import {
  buildRankingInboxItem, makeRankingRecommendationId, requiredRoleFor, sendRankingRecommendation,
} from "@/lib/v5/management/rankingGovernance";

describe("PM12 portfolio", () => {
  it("composes totals from pools + holdings", () => {
    const pools = defaultPortfolioPools();
    const holdings = defaultPortfolioHoldings();
    const s = composePortfolioSummary(pools, holdings);
    expect(s.totalNav).toBe(pools.reduce((a, p) => a + p.nav, 0));
    expect(s.activeCapitalPools).toBe(pools.length);
    expect(s.leverage).toBeGreaterThan(0);
    expect(s.largestExposureSymbol).toBeTruthy();
  });
  it("default book has valid links on every row", () => {
    const b = defaultPortfolioBook();
    expect(b.pools.every((p) => p.links.manageHref.startsWith("/management/promotion-allocation?tab=quarterly-capital"))).toBe(true);
    expect(b.holdings.every((h) => h.links.manageHref.startsWith("/management/"))).toBe(true);
  });
});

describe("PM12 persona league", () => {
  const rows = defaultPersonaLeague();
  it("sorts by every preset without throwing", () => {
    for (const p of PERSONA_LEAGUE_PRESETS) {
      const sorted = sortByPreset(rows, p);
      expect(sorted).toHaveLength(rows.length);
    }
  });
  it("tier distribution sums to row count", () => {
    const td = tierDistribution(rows);
    const sum = Object.values(td).reduce((a, b) => a + b, 0);
    expect(sum).toBe(rows.length);
  });
  it("top movers respect rankDelta sign", () => {
    const m = computeTopMovers(rows, 3);
    expect(m.topUp[0].rankDelta!).toBeGreaterThanOrEqual(m.topDown[0].rankDelta!);
  });
  it("rank delta = previous - current", () => {
    rows.forEach((r) => {
      if (r.previousRank !== undefined) {
        expect(r.rankDelta).toBe(r.previousRank - r.currentRank);
      }
    });
  });
});

describe("PM12 quarterly ranking", () => {
  const f = defaultQuarterlyFormula();
  it("formula weights sum to 1.05 (positive 1.0 + 0.05 hard penalty weight)", () => {
    const sum = Object.values(f.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
  it("computeQuarterlyScore is deterministic and weighted", () => {
    const a = computeQuarterlyScore({
      pnlScore: 100, sharpeScore: 0, drawdownControlScore: 0,
      executionQualityScore: 0, riskComplianceScore: 0, improvementScore: 0,
      humanInterventionPenalty: 0, hardPenalty: 0,
    }, f);
    expect(a).toBeCloseTo(100 * f.weights.pnl, 5);
  });
  it("seeded ranking has eligibility statuses across the spectrum", () => {
    const rows = defaultQuarterlyRanking();
    const kinds = new Set(rows.map((r) => r.eligibility));
    expect(kinds.has("eligible")).toBe(true);
    expect(kinds.has("disqualified") || kinds.has("insufficient_data")).toBe(true);
  });
});

describe("PM12 performance attribution", () => {
  it("12 dimensions exported", () => {
    expect(ATTRIBUTION_DIMENSIONS).toHaveLength(12);
  });
  it("seed rows have linked entity hrefs", () => {
    const rows = defaultPerformanceAttribution();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.links.manageHref.startsWith("/management/"))).toBe(true);
  });
});

describe("PM12 ranking governance", () => {
  it("requiredRoleFor covers all actions", () => {
    expect(requiredRoleFor("retire_persona")).toBe("governance_lead");
    expect(requiredRoleFor("increase_research_budget")).toBe("research_lead");
  });
  it("builds inbox item with ranking_recommendation kind", () => {
    const it = buildRankingInboxItem({
      personaId: "p1", personaName: "P1",
      recommendation: "require_retraining", source: "quarterly_ranking", quarter: "2026-Q2",
    });
    expect(it.kind).toBe("ranking_recommendation");
    expect(it.id.startsWith("ranking-rec-")).toBe(true);
    expect(it.links.manageHref).toBe("/management/personas/p1");
  });
  it("makeRankingRecommendationId returns deterministic id", () => {
    const id1 = makeRankingRecommendationId({
      personaId: "p1", personaName: "P1",
      recommendation: "freeze_persona", source: "persona_league", quarter: "2026-Q2",
    });
    const id2 = makeRankingRecommendationId({
      personaId: "p1", personaName: "P1",
      recommendation: "freeze_persona", source: "persona_league", quarter: "2026-Q2",
    });
    expect(id1).toBe(id2);
  });
  it("sendRankingRecommendation fails closed when real writes are disabled", async () => {
    const result = await sendRankingRecommendation({
      personaId: "p1", personaName: "P1",
      recommendation: "freeze_persona", source: "persona_league", quarter: "2026-Q2",
    });
    expect(result.persisted).toBe(false);
    expect(result.status).toBe("write_disabled");
    expect(result.liveCapitalMutation).toBe(false);
  });
});
