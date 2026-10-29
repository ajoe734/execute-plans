import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { OneRingCockpitPage, TradingPulsePage } from "./_core";
import { Ep5CanaryReadinessPage } from "./Ep5CanaryReadiness";
import { PersonaIntentTracesPage } from "./PersonaIntentTraces";
import { PersonaLeaguePage } from "./PersonaLeague";
import { TotalCapitalSnapshot } from "@/management/components/cockpit/TotalCapitalSnapshot";
import { PersonaLeagueSnapshot } from "@/management/components/cockpit/PersonaLeagueSnapshot";
import { PortfolioBookPage } from "./PortfolioBook";
import { QuarterlyRankingPage } from "./QuarterlyRanking";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

vi.mock("@/management/components/openclaw/OpenClawLlmAuthPanel", () => ({
  OpenClawLlmAuthPanel: () => null,
}));

void i18n.changeLanguage("en-US");

function renderPage(element: ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        {element}
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("live-only management page fallbacks", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    mocks.useV5Live.mockReturnValue({ data: undefined, loading: false, refresh: vi.fn() });
  });

  it("does not render the local Trading Pulse seed model when live data is unavailable", () => {
    renderPage(<TradingPulsePage />);

    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Live Trading Pulse data is unavailable.")).not.toBeInTheDocument();
  });

  it("renders the actual cockpit aggregate and its degraded status without invented Loops", () => {
    mocks.useV5Live.mockReturnValueOnce({ loading: false, data: {
      snapshotAt: "2026-09-13T07:36:00Z", status: "degraded", message: "Telemetry is unavailable.",
      health: { status: "ok", headline: "Control plane healthy", message: "Owners responding." },
      cards: [{ id: "runtime", label: "Runtime", status: "ok", summary: "No active runtime bindings." }],
    } });
    renderPage(<OneRingCockpitPage />);
    expect(screen.getByText("Control plane healthy")).toBeInTheDocument();
    expect(screen.getByText("Telemetry is unavailable.")).toBeInTheDocument();
    expect(screen.getByText("No active runtime bindings.")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-live-aggregate")).toHaveTextContent("degraded");
    expect(screen.queryByText("Live data unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("cockpit-projection-unavailable")).toBeInTheDocument();
  });

  it("keeps the cockpit unavailable when no aggregate was returned", () => {
    renderPage(<OneRingCockpitPage />);
    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-live-aggregate")).not.toBeInTheDocument();
  });

  it("does not render seeded readiness checklist rows", () => {
    renderPage(<Ep5CanaryReadinessPage />);

    expect(screen.getByText("Live readiness data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("EP4 governed paper proof present")).not.toBeInTheDocument();
    expect(screen.queryByText("Kill-switch demo present")).not.toBeInTheDocument();
  });

  it("does not render deterministic Persona Intent traces", () => {
    renderPage(<PersonaIntentTracesPage />);

    expect(screen.queryByText("Rebalance momentum sleeve toward higher beta names.")).not.toBeInTheDocument();
    expect(screen.queryByText("trace-001")).not.toBeInTheDocument();
  });

  it("does not render seeded Persona League rows", () => {
    renderPage(<PersonaLeaguePage />);

    expect(screen.queryByText("Alpha Trader")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk Guard")).not.toBeInTheDocument();
  });

  it("does not render seeded Portfolio Book rows", () => {
    renderPage(<PortfolioBookPage />);

    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Alpha US Equity")).not.toBeInTheDocument();
    expect(screen.queryByText("BTCUSD")).not.toBeInTheDocument();
  });

  it("does not render seeded Quarterly Ranking rows", () => {
    renderPage(<QuarterlyRankingPage />);

    expect(screen.queryByText("Alpha Trader")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk Guard")).not.toBeInTheDocument();
  });

  it("does not render raw NaN values on the Quarterly Ranking empty state", () => {
    const { container } = renderPage(<QuarterlyRankingPage />);

    expect(container.textContent).not.toContain("NaN");
  });

  it("renders saved owner recommendation and rationale instead of fabricated no_change or legacy row action", () => {
    const rankingRows = [
      {
        persona_id: "persona-projection-test",
        score: 69.25,
        eligibility: "eligible",
      },
      {
        persona_id: "persona-counterexample-test",
        score: 68.0,
        eligibility: "eligible",
        recommendation: "promote_to_canary_candidate",
        recommendedAction: "promote_to_canary_candidate",
      },
    ];
    const savedRecommendations = [
      {
        persona_id: "persona-projection-test",
        action_id: "promote_to_canary_candidate",
        rationale: "Saved provider rationale for existing read-only report",
        ranking_snapshot_id: "ranking-projection-test",
        evaluator_run_id: "evaluator-projection-test",
        human_review_state: {
          status: "advisory_report",
          decision_status: "not_applicable",
          owner_decision: null,
        },
      },
      {
        persona_id: "persona-counterexample-test",
        action_id: "request_more_evidence",
        rationale: "Saved owner rationale overriding legacy row action",
        ranking_snapshot_id: "ranking-counterexample-test",
        evaluator_run_id: "evaluator-counterexample-test",
        human_review_state: {
          status: "advisory_report",
          decision_status: "not_applicable",
          owner_decision: null,
        },
      },
    ];
    mocks.useV5Live.mockImplementation((_loader, _deps, opts?: { cacheKey?: string }) => ({
      data: opts?.cacheKey?.includes("recommendations")
        ? savedRecommendations
        : opts?.cacheKey?.includes("formula")
          ? undefined
          : rankingRows,
      loading: false,
      refresh: vi.fn(),
    }));

    const quarterly = renderPage(<QuarterlyRankingPage />);
    expect(screen.getByText("Promote to canary candidate")).toBeInTheDocument();
    expect(screen.getByText("Saved provider rationale for existing read-only report")).toBeInTheDocument();
    expect(screen.getByText("evaluator-projection-test · ranking-projection-test")).toBeInTheDocument();
    expect(screen.getByText("request_more_evidence")).toBeInTheDocument();
    expect(screen.getByText("Saved owner rationale overriding legacy row action")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
    quarterly.unmount();

    renderPage(<PersonaLeaguePage />);
    expect(screen.getByText("Promote to canary candidate")).toBeInTheDocument();
    expect(screen.getByText("Saved provider rationale for existing read-only report")).toBeInTheDocument();
    expect(screen.getByText("evaluator-projection-test · ranking-projection-test")).toBeInTheDocument();
    expect(screen.getByText("request_more_evidence")).toBeInTheDocument();
    expect(screen.getByText("Saved owner rationale overriding legacy row action")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
  });

  it("does not fabricate no_change or legacy ranking actions on Quarterly Ranking or Persona League when saved owner recommendations are unavailable", () => {
    const rankingRows = [
      {
        persona_id: "persona-projection-test",
        score: 69.25,
        eligibility: "eligible",
        recommendation: "no_change",
        recommendedAction: "no_change",
      },
      {
        persona_id: "persona-legacy-promote",
        score: 71.0,
        eligibility: "eligible",
        recommendation: "promote_to_canary_candidate",
        recommendedAction: "promote_to_canary_candidate",
      },
    ];
    mocks.useV5Live.mockImplementation((_loader, _deps, opts?: { cacheKey?: string }) => ({
      data: opts?.cacheKey?.includes("recommendations") || opts?.cacheKey?.includes("formula")
        ? undefined
        : rankingRows,
      loading: false,
      refresh: vi.fn(),
    }));

    const quarterly = renderPage(<QuarterlyRankingPage />);
    expect(screen.getByText("persona-projection-test")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
    expect(screen.queryByText("Promote to canary candidate")).not.toBeInTheDocument();
    quarterly.unmount();

    renderPage(<PersonaLeaguePage />);
    expect(screen.getByText("persona-projection-test")).toBeInTheDocument();
    expect(screen.queryByText("No change")).not.toBeInTheDocument();
    expect(screen.queryByText("Promote to canary candidate")).not.toBeInTheDocument();
  });

  it("renders available capital facts with unknown financials as dashes, not zero", () => {
    renderPage(<TotalCapitalSnapshot summary={{
      totalNav: null, totalCash: null, grossExposure: null, leverage: null,
      unrealizedPnl: null, pnlToday: null, activeCapitalPools: 1, highestRiskPoolId: null,
      bindingCount: 89, activeRuntimeCount: 1, paperRuntimeCount: 87, liveRuntimeCount: 0,
      totalTrades: 3, totalPnl: -15, maxDrawdown: 0.00015, latestTelemetryAt: null,
    }} />);
    expect(screen.getByText("87 / 0")).toBeInTheDocument();
    expect(screen.getByText("-15")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("shows inventory personas as unranked with working links and no synthetic rank", () => {
    renderPage(<PersonaLeagueSnapshot rows={[]} inventory={[{
      personaId: "persona-contract-a", personaName: "Contract Persona A",
      eligible: false, exclusionReason: "insufficient telemetry",
      manageHref: "/management/personas/persona-contract-a",
    }]} />);
    const link = screen.getByRole("link", { name: "Contract Persona A" });
    expect(link).toHaveAttribute("href", "/management/personas/persona-contract-a");
    expect(screen.getByTestId("persona-league-unranked")).toHaveTextContent("No ranked rows returned");
    expect(screen.queryByText(/#\d/)).not.toBeInTheDocument();
  });

  it("shows ranked rows with links and does not claim a global bottom-3 from a truncated slice", () => {
    const mk = (n: number) => ({
      personaId: `p${n}`, personaName: `Persona ${n}`, currentRank: n, tier: "A", eligible: n !== 2,
      links: { manageHref: `/management/personas/p${n}` },
    }) as never;
    const inventory = Array.from({ length: 5 }, (_, i) => ({
      personaId: `p${i + 1}`, personaName: `Persona ${i + 1}`, manageHref: `/management/personas/p${i + 1}`,
    }));
    renderPage(<PersonaLeagueSnapshot rows={[mk(1), mk(2), mk(3)]} inventory={inventory.map((r) => ({ ...r, ownerTotal: 5 }))} />);
    expect(screen.getByRole("link", { name: "#1 Persona 1" })).toHaveAttribute("href", "/management/personas/p1");
    expect(screen.getByText("A · not eligible")).toBeInTheDocument();
    expect(screen.getByTestId("persona-league-bottom-incomplete")).toHaveTextContent("3 of 5");
    expect(screen.queryByTestId("persona-league-unranked")).not.toBeInTheDocument();
  });

  describe("global bottom-3 coverage", () => {
    const mk = (n: number) => ({
      personaId: `p${n}`, personaName: `Persona ${n}`, currentRank: n, tier: "A",
      links: { manageHref: `/management/personas/p${n}` },
    }) as never;
    const ranked = (n: number) => Array.from({ length: n }, (_, i) => mk(i + 1));
    const inv = (n: number, ownerTotal?: number) => Array.from({ length: n }, (_, i) => ({
      personaId: `p${i + 1}`, personaName: `Persona ${i + 1}`, manageHref: `/management/personas/p${i + 1}`, ownerTotal,
    }));

    it("20 ranked / 20 inventory / owner total 94 => bottom unavailable, top ranks stay visible", () => {
      renderPage(<PersonaLeagueSnapshot rows={ranked(20)} inventory={inv(20, 94)} />);
      expect(screen.getByTestId("persona-league-bottom-incomplete")).toHaveTextContent("20 of 94");
      expect(screen.getByRole("link", { name: "#1 Persona 1" })).toBeInTheDocument();
    });

    it("complete 94 ranked of owner total 94 => bottom available", () => {
      renderPage(<PersonaLeagueSnapshot rows={ranked(94)} inventory={inv(20, 94)} />);
      expect(screen.queryByTestId("persona-league-bottom-incomplete")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "#94 Persona 94" })).toBeInTheDocument();
    });

    it("unknown owner total => bottom unavailable", () => {
      renderPage(<PersonaLeagueSnapshot rows={ranked(20)} inventory={inv(20)} />);
      expect(screen.getByTestId("persona-league-bottom-incomplete")).toHaveTextContent("population unknown");
    });
  });

  describe("cockpit child load semantics", () => {
    type St = { data?: unknown; loading?: boolean; error?: unknown };
    const cockpit = { snapshotAt: "2026-10-23T00:00:00Z", status: "ok", health: { status: "ok", headline: "Cockpit ok" }, cards: [] };
    const keys = ["portfolioBook.summary", "personaLeague.rankings", "personaLeague.inventory", "quarterlyRanking.list", "quarterlyRanking.formula", "personaFleet"];
    let states: Record<string, St>;
    const apply = (next: Record<string, St>) => {
      states = { ...states, ...next };
    };
    const rerenderWith = (view: ReturnType<typeof renderPage>, next: Record<string, St>) => {
      apply(next);
      view.rerender(
        <I18nextProvider i18n={i18n}><MemoryRouter><OneRingCockpitPage /></MemoryRouter></I18nextProvider>,
      );
    };
    beforeEach(() => {
      states = Object.fromEntries(keys.map((k) => [k, { loading: true }]));
      mocks.useV5Live.mockImplementation((_l, _d, opts?: { cacheKey?: string }) => {
        const key = (opts?.cacheKey ?? "").replace("oversight.", "");
        const st = key === "cockpit" ? { data: cockpit, loading: false } : states[key] ?? {};
        return { data: st.data, loading: st.loading ?? false, error: st.error ?? null, refresh: vi.fn() };
      });
    });
    const qrow = (i: number, eligibility: string) => ({
      personaId: `q${i}`, quarter: "2026-Q4", eligibility, evidenceRefs: ["e"],
    });
    const page = [qrow(0, "eligible"), ...Array.from({ length: 19 }, (_, i) => qrow(i + 1, "insufficient_data"))];
    const rk = (n: number) => ({
      personaId: `p${n}`, personaName: `Persona ${n}`, currentRank: n, tier: "A",
      links: { manageHref: `/management/personas/p${n}` },
    });

    it("quarterly: formula before rows is not 0/0/0, then error, then 1+19 page", () => {
      apply({ "quarterlyRanking.formula": { data: { version: "9.9.9" } }, "quarterlyRanking.list": { loading: true } });
      const view = renderPage(<OneRingCockpitPage />);
      expect(screen.getByText(/Formula 9\.9\.9 loaded; waiting for ranking rows/)).toBeInTheDocument();
      expect(screen.queryByText("Disqualified / Insufficient data")).not.toBeInTheDocument();
      rerenderWith(view, { "quarterlyRanking.list": { loading: false, error: new Error("boom") } });
      expect(screen.getByText(/ranking rows unavailable/)).toBeInTheDocument();
      expect(screen.queryByText("Disqualified / Insufficient data")).not.toBeInTheDocument();
      rerenderWith(view, { "quarterlyRanking.list": { data: page } });
      const row = screen.getByText("Disqualified / Insufficient data").parentElement as HTMLElement;
      expect(within(row).getByText("19")).toBeInTheDocument();
      expect(screen.getByTestId("quarterly-loaded-scope")).toHaveTextContent("已載入項目");
      expect(screen.getByTestId("quarterly-loaded-scope")).toHaveTextContent("20 rows");
    });

    it("quarterly: a successful empty list is a genuine zero", () => {
      apply({ "quarterlyRanking.list": { data: [] }, "quarterlyRanking.formula": { data: { version: "1" } } });
      renderPage(<OneRingCockpitPage />);
      const row = screen.getByText("Disqualified / Insufficient data").parentElement as HTMLElement;
      expect(within(row).getByText("0")).toBeInTheDocument();
      expect(screen.getByTestId("quarterly-loaded-scope")).toHaveTextContent("0 rows");
    });

    it("capital: pending, error, then known facts", () => {
      const view = renderPage(<OneRingCockpitPage />);
      expect(screen.getAllByText("Waiting for live BFF data.").length).toBeGreaterThan(0);
      rerenderWith(view, { "portfolioBook.summary": { loading: false, error: new Error("x") } });
      expect(screen.getAllByText(/does not render seed/).length).toBeGreaterThan(0);
      rerenderWith(view, { "portfolioBook.summary": { data: {
        totalNav: null, totalCash: null, grossExposure: null, leverage: null, unrealizedPnl: null, pnlToday: null,
        activeCapitalPools: 1, highestRiskPoolId: null, bindingCount: 89, activeRuntimeCount: 1,
        paperRuntimeCount: 87, liveRuntimeCount: 0, totalTrades: 3, totalPnl: -15, maxDrawdown: 0.1, latestTelemetryAt: null,
      } } });
      expect(screen.getByText("87 / 0")).toBeInTheDocument();
      expect(screen.queryByText("$0")).not.toBeInTheDocument();
    });

    it("rankings: pending shows no unavailable claim, settles with Top3/Bottom3 and links", () => {
      const view = renderPage(<OneRingCockpitPage />);
      expect(screen.queryByText("Ranking unavailable.")).not.toBeInTheDocument();
      expect(screen.queryByText(/No ranked rows returned/)).not.toBeInTheDocument();
      const all = Array.from({ length: 94 }, (_, i) => rk(i + 1));
      rerenderWith(view, {
        "personaLeague.rankings": { data: all },
        "personaLeague.inventory": { data: [{ personaId: "p1", personaName: "Persona 1", manageHref: "/m/p1", ownerTotal: 94 }] },
      });
      expect(screen.getByRole("link", { name: "#1 Persona 1" })).toHaveAttribute("href", "/management/personas/p1");
      expect(screen.getByRole("link", { name: "#94 Persona 94" })).toBeInTheDocument();
      expect(screen.queryByTestId("persona-league-bottom-incomplete")).not.toBeInTheDocument();
    });

    it("rankings success with inventory pending keeps Top3 and labels coverage unknown", () => {
      apply({ "personaLeague.rankings": { data: Array.from({ length: 20 }, (_, i) => rk(i + 1)) } });
      renderPage(<OneRingCockpitPage />);
      expect(screen.getByRole("link", { name: "#1 Persona 1" })).toBeInTheDocument();
      expect(screen.getByTestId("persona-league-inventory-pending")).toHaveTextContent("waiting for inventory");
      expect(screen.getByTestId("persona-league-bottom-incomplete")).toHaveTextContent("population unknown");
    });

    it("fleet: pending, error, then 20 server-classified test rows is a scoped filtered-empty state", () => {
      const view = renderPage(<OneRingCockpitPage />);
      expect(screen.queryByText(/no source health is claimed/)).not.toBeInTheDocument();
      expect(screen.queryByText(/No attention|noAttention/i)).not.toBeInTheDocument();
      rerenderWith(view, { personaFleet: { loading: false, error: new Error("x") } });
      expect(screen.queryByText(/no source health is claimed/)).not.toBeInTheDocument();
      const paper = Array.from({ length: 20 }, (_, i) => ({ personaId: `f${i}`, personaName: `F${i}`, capitalMode: "paper", dataScope: "test" }));
      rerenderWith(view, { personaFleet: { data: paper } });
      expect(screen.getByText(/20 fleet rows; none match the current production filter/)).toBeInTheDocument();
    });

    it("fleet: label does not claim mode (server test scope excluded; regular paper and unnamed admitted)", () => {
      apply({ personaFleet: { data: [
        { personaId: "t1", personaName: "Acceptance Live", capitalMode: "live", dataScope: "test" },
        { personaId: "m1", personaName: "Normal" },
      ] } });
      renderPage(<OneRingCockpitPage />);
      const scope = screen.getByTestId("fleet-loaded-scope");
      expect(scope).toHaveTextContent("2 fleet rows, 1 match the current production filter");
      expect(scope).not.toHaveTextContent(/live\/canary/);
    });

    it("retained data + error is visibly marked stale for each child", () => {
      const all = Array.from({ length: 3 }, (_, i) => rk(i + 1));
      apply({
        "quarterlyRanking.list": { data: page, error: new Error("refetch") },
        "personaLeague.rankings": { data: all, error: new Error("refetch") },
        "personaLeague.inventory": { data: [{ personaId: "p1", personaName: "Persona 1", manageHref: "/m/p1", ownerTotal: 3 }] },
        personaFleet: { data: [{ personaId: "f1", personaName: "F1", capitalMode: "live" }], error: new Error("refetch") },
        "portfolioBook.summary": { data: {
          totalNav: null, totalCash: null, grossExposure: null, leverage: null, unrealizedPnl: null, pnlToday: null,
          activeCapitalPools: 1, highestRiskPoolId: null, bindingCount: 1, activeRuntimeCount: 1,
          paperRuntimeCount: 1, liveRuntimeCount: 0, totalTrades: 0, totalPnl: 0, maxDrawdown: 0, latestTelemetryAt: null,
        }, error: new Error("refetch") },
      });
      renderPage(<OneRingCockpitPage />);
      for (const id of ["quarterly-stale", "persona-league-stale", "fleet-stale", "capital-stale"]) {
        expect(screen.getByTestId(id)).toHaveTextContent("may be stale");
      }
      expect(screen.getAllByRole("link", { name: "#1 Persona 1" }).length).toBeGreaterThan(0);
    });
  });
});
