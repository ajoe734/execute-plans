// 2026-05-22 PM-12 facade tests.
import { describe, it, expect } from "vitest";
import { mgmt } from "@/lib/bff-v1";
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
  it("persona league", () => {
    expect(paths.mgmtPersonaLeague()).toBe("/bff/management/persona-league");
    expect(paths.mgmtPersonaLeagueRankings()).toBe("/bff/management/persona-league/rankings");
  });
  it("quarterly ranking with quarter qs", () => {
    expect(paths.mgmtQuarterlyRanking()).toBe("/bff/management/quarterly-ranking");
    expect(paths.mgmtQuarterlyRanking("2026-Q2")).toContain("quarter=2026-Q2");
    expect(paths.mgmtQuarterlyRanking("2026-Q3", "persona/alpha"))
      .toBe("/bff/management/quarterly-ranking?quarter=2026-Q3&persona=persona%2Falpha");
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
