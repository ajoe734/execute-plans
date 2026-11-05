import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { bffV1, lists, type ListEnvelope, type Strategy } from "@/lib/bff-v1";
import { adaptPersonaLeagueRankedRows } from "@/lib/bff-v1/management";
import { adaptBffStrategyHealth } from "@/lib/bff-v1/v5";
import { compareNullableStrategyMetric } from "@/lib/v3/medium-low/B3-console";
import { adaptStrategyHealth } from "@/lib/v5/adapters/strategy";
import { sortByPreset, type PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
import { composePortfolioSummary, defaultPortfolioPools, type CapitalPoolSummaryRow } from "@/lib/v5/management/portfolio";
import { buildEntity } from "@/lib/writeIntents/createDefaults";
import { derivePersonaReadiness } from "@/management/lib/personaReadiness";
import { StrategiesList } from "./Lists";
import { StrategyDetail } from "./StrategyDetail";
import { AlphaFactoryBoardPage } from "./phase2/AlphaFactoryBoard";

// Canonical BFF row shapes from STRATEGY-METRICS-TRUTH-20261104 (services/control-plane/bff/tests/test_strategy_metrics_truth.py)
const REAL_BFF_STRATEGY_ROWS: Record<string, Strategy> = {
  "strat-paper-running-01": {
    id: "strat-paper-running-01",
    name: "Momentum Paper Runner",
    alpha: "alpha.momo.v1",
    capitalPoolId: "pool-persona-paper-fd1281847a3b1c6a9735",
    personaIds: ["persona-paper-running-01"],
    owner: "persona-paper-running-01",
    state: "deployed",
    lifecycleStatus: "paper",
    reviewStatus: "approved",
    deploymentStatus: "paper_active",
    risk: "medium",
    updatedAt: "2026-11-04T01:16:27Z",
    pnl: 110.0,
    drawdown: 0.0,
    totalTrades: 3,
    metricsAsOf: "2026-11-04T01:16:27Z",
    metricsResolution: "fresh",
    metricsPersonaId: "persona-paper-running-01",
    pnl30d: null,
    sharpe: null,
  },
  "strat-neg-pnl-02": {
    id: "strat-neg-pnl-02",
    name: "Mean Reversion Negative Runner",
    alpha: "alpha.meanrev.v1",
    capitalPoolId: "pool-persona-paper-neg",
    personaIds: ["persona-paper-neg-02"],
    owner: "persona-paper-neg-02",
    state: "deployed",
    lifecycleStatus: "paper",
    reviewStatus: "approved",
    deploymentStatus: "paper_active",
    risk: "medium",
    updatedAt: "2026-11-04T01:16:27Z",
    pnl: -5.5,
    drawdown: 0.000055,
    totalTrades: 2,
    metricsAsOf: "2026-11-04T01:16:27Z",
    metricsResolution: "fresh",
    metricsPersonaId: "persona-paper-neg-02",
    pnl30d: null,
    sharpe: null,
  },
  "strat-zero-pnl-03": {
    id: "strat-zero-pnl-03",
    name: "Carry Flat Runner",
    alpha: "alpha.carry.v1",
    capitalPoolId: "pool-persona-paper-zero",
    personaIds: ["persona-paper-zero-03"],
    owner: "persona-paper-zero-03",
    state: "deployed",
    lifecycleStatus: "paper",
    reviewStatus: "approved",
    deploymentStatus: "paper_active",
    risk: "low",
    updatedAt: "2026-11-04T01:16:27Z",
    pnl: 0.0,
    drawdown: 0.0,
    totalTrades: 1,
    metricsAsOf: "2026-11-04T01:16:27Z",
    metricsResolution: "fresh",
    metricsPersonaId: "persona-paper-zero-03",
    pnl30d: null,
    sharpe: null,
  },
  "strat-not-running-05": {
    id: "strat-not-running-05",
    name: "Unstarted Candidate Strategy",
    alpha: "",
    capitalPoolId: "",
    personaIds: [],
    owner: "persona-not-running-05",
    state: "draft",
    lifecycleStatus: "discovered",
    reviewStatus: "pending",
    deploymentStatus: "not_deployed",
    risk: "low",
    updatedAt: "2026-11-04T01:16:27Z",
    pnl: null,
    drawdown: null,
    totalTrades: null,
    metricsAsOf: null,
    metricsResolution: "missing",
    metricsPersonaId: "persona-not-running-05",
    pnl30d: null,
    sharpe: null,
  },
};

function renderStrategyDetail(strategyId: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/management/strategies/${strategyId}`]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function getStatCardByLabel(label: string): HTMLElement {
  const labelEl = screen.getByText(label);
  const card = labelEl.closest(".p-4") as HTMLElement | null;
  if (!card) {
    throw new Error(`StatCard for label "${label}" not found`);
  }
  return card;
}

describe("FE-STRATEGY-METRICS-TRUTH-20261104 StrategyDetail & StrategiesList", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    vi.spyOn(bffV1.strategies, "get").mockImplementation(async (id: string) => REAL_BFF_STRATEGY_ROWS[id]);
    vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.approvals, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.research, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.evolution, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
    vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders positive cumulative paper PnL with metricsAsOf, preserves real zero drawdown, and shows No data with neutral tone for null PnL 30d and Sharpe", async () => {
    renderStrategyDetail("strat-paper-running-01");

    expect(await screen.findByText("Momentum Paper Runner")).toBeInTheDocument();
    expect(screen.getByText("alpha.momo.v1 · strat-paper-running-01")).toBeInTheDocument();

    const cumPnlCard = getStatCardByLabel("Cumulative Paper PnL");
    const cumPnlValue = within(cumPnlCard).getByText("110.00");
    expect(cumPnlValue).toHaveClass("text-status-success");
    expect(within(cumPnlCard).getByText("As of 2026-11-04T01:16:27Z")).toBeInTheDocument();
    expect(cumPnlCard.textContent).not.toContain("11000");
    expect(cumPnlCard.textContent).not.toContain("%");

    const pnl30dCard = getStatCardByLabel("PnL 30d");
    const pnl30dValue = within(pnl30dCard).getByText("No data");
    expect(pnl30dValue).toHaveClass("text-foreground");
    expect(pnl30dValue).not.toHaveClass("text-status-success");
    expect(pnl30dValue).not.toHaveClass("text-status-failed");

    const sharpeCard = getStatCardByLabel("Sharpe");
    const sharpeValue = within(sharpeCard).getByText("No data");
    expect(sharpeValue).toHaveClass("text-foreground");

    const drawdownCard = getStatCardByLabel("Drawdown");
    const drawdownValue = within(drawdownCard).getByText("0.00%");
    expect(drawdownValue).toHaveClass("text-foreground");
    expect(drawdownValue).not.toHaveClass("text-status-warning");
  });

  it("renders negative cumulative paper PnL with danger tone and non-zero drawdown with warning tone", async () => {
    renderStrategyDetail("strat-neg-pnl-02");

    expect(await screen.findByText("Mean Reversion Negative Runner")).toBeInTheDocument();

    const cumPnlCard = getStatCardByLabel("Cumulative Paper PnL");
    const cumPnlValue = within(cumPnlCard).getByText("-5.50");
    expect(cumPnlValue).toHaveClass("text-status-failed");
    expect(within(cumPnlCard).getByText("As of 2026-11-04T01:16:27Z")).toBeInTheDocument();

    const drawdownCard = getStatCardByLabel("Drawdown");
    const drawdownValue = within(drawdownCard).getByText("0.01%");
    expect(drawdownValue).toHaveClass("text-status-warning");
  });

  it("preserves real zero cumulative paper PnL as 0.00 with neutral tone rather than No data", async () => {
    renderStrategyDetail("strat-zero-pnl-03");

    expect(await screen.findByText("Carry Flat Runner")).toBeInTheDocument();

    const cumPnlCard = getStatCardByLabel("Cumulative Paper PnL");
    const cumPnlValue = within(cumPnlCard).getByText("0.00");
    expect(cumPnlValue).toHaveClass("text-foreground");
    expect(within(cumPnlCard).getByText("As of 2026-11-04T01:16:27Z")).toBeInTheDocument();
  });

  it("shows No data for all null metrics and empty alpha/capitalPoolId, and omits leading separator in header when alpha is empty", async () => {
    renderStrategyDetail("strat-not-running-05");

    expect(await screen.findByText("Unstarted Candidate Strategy")).toBeInTheDocument();
    expect(screen.getAllByText("strat-not-running-05").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/·\s*strat-not-running-05/)).not.toBeInTheDocument();

    for (const label of ["Cumulative Paper PnL", "PnL 30d", "Sharpe", "Drawdown"]) {
      const card = getStatCardByLabel(label);
      const valueEl = within(card).getByText("No data");
      expect(valueEl).toHaveClass("text-foreground");
      expect(valueEl).not.toHaveClass("text-status-success");
      expect(valueEl).not.toHaveClass("text-status-failed");
      expect(valueEl).not.toHaveClass("text-status-warning");
    }

    // Alpha, Capital Pools, Personas fields + 4 StatCards = 7 "No data" instances in overview
    expect(screen.getAllByText("No data").length).toBeGreaterThanOrEqual(7);
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
  });

  it("renders StrategiesList columns with No data for null metrics and empty alpha/capital pool, and preserves real 0.00", async () => {
    const items = Object.values(REAL_BFF_STRATEGY_ROWS);
    const envelope: ListEnvelope<Strategy> = {
      items,
      cursor: {},
      pageSize: items.length,
      estimatedTotal: items.length,
      totalCountExact: true,
    };
    vi.spyOn(lists, "strategies").mockResolvedValue(envelope);

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/strategies"]}>
          <Routes>
            <Route path="/management/strategies" element={<StrategiesList />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Momentum Paper Runner")).toBeInTheDocument();
    expect(screen.getByText("110.00")).toHaveClass("text-status-success");
    expect(screen.getByText("-5.50")).toHaveClass("text-status-failed");
    expect(screen.getByText("0.00")).toHaveClass("text-foreground");
    expect(screen.getAllByText("As of 2026-11-04T01:16:27Z")).toHaveLength(3);
    expect(screen.getAllByText("0.00%")).toHaveLength(2);
    expect(screen.getByText("0.01%")).toHaveClass("text-status-warning");

    const notRunningRow = screen.getByText("Unstarted Candidate Strategy").closest("tr") as HTMLElement;
    expect(within(notRunningRow).getAllByText("No data")).toHaveLength(6);
  });
});

describe("FE-STRATEGY-METRICS-TRUTH-20261104 null-metric consumer truth", () => {
  it("adaptStrategyHealth accepts null pnl30d and drawdown without NaN and distinguishes null from 0", () => {
    const missingHealth = adaptStrategyHealth(REAL_BFF_STRATEGY_ROWS["strat-not-running-05"]);
    expect(Number.isNaN(missingHealth.score)).toBe(false);
    expect(missingHealth.inputs.performance).toBe(0);
    expect(missingHealth.inputs.executionQuality).toBe(0);
    expect(missingHealth.pnl30d).toBeNull();
    expect(missingHealth.drawdown).toBeNull();

    const zeroHealth = adaptStrategyHealth({
      ...REAL_BFF_STRATEGY_ROWS["strat-zero-pnl-03"],
      pnl30d: 0,
      drawdown: 0,
    });
    expect(zeroHealth.inputs.performance).toBe(50);
    expect(zeroHealth.inputs.executionQuality).toBe(80);
    expect(zeroHealth.pnl30d).toBe(0);
    expect(zeroHealth.drawdown).toBe(0);
  });

  it("adaptBffStrategyHealth preserves null pnl30d and drawdown instead of coercing to 0", () => {
    const adaptedNull = adaptBffStrategyHealth({
      strategy_id: "strat-not-running-05",
      status: "watch",
      pnl_30d: null,
      drawdown: null,
    });
    expect(adaptedNull.pnl30d).toBeNull();
    expect(adaptedNull.drawdown).toBeNull();

    const adaptedZero = adaptBffStrategyHealth({
      strategy_id: "strat-zero-pnl-03",
      status: "healthy",
      pnl_30d: 0,
      drawdown: 0,
    });
    expect(adaptedZero.pnl30d).toBe(0);
    expect(adaptedZero.drawdown).toBe(0);
  });

  it("composePortfolioSummary returns null pnl30d and undefined highestRiskPoolId when pool metrics are null", () => {
    const basePool = defaultPortfolioPools()[0];
    const nullPool: CapitalPoolSummaryRow = {
      ...basePool,
      capitalPoolId: "pool-null",
      capitalPoolName: "Null Pool",
      pnl30d: null,
      drawdown: null,
    };

    const summaryAllNull = composePortfolioSummary([nullPool], []);
    expect(summaryAllNull.pnl30d).toBeNull();
    expect(summaryAllNull.highestRiskPoolId).toBeUndefined();

    const realPool: CapitalPoolSummaryRow = {
      ...nullPool,
      capitalPoolId: "pool-real",
      pnl30d: -1200,
      drawdown: -0.04,
    };
    const summaryMixed = composePortfolioSummary([nullPool, realPool], []);
    expect(summaryMixed.pnl30d).toBe(-1200);
    expect(summaryMixed.highestRiskPoolId).toBe("pool-real");
  });

  it("sortByPreset and adaptPersonaLeagueRankedRows keep null metrics last and never treat null as 0", () => {
    const rows = adaptPersonaLeagueRankedRows({
      items: [
        { persona_id: "p-null", current_rank: 1, tier: "watch", score: 50, pnl_30d: null, sharpe: null, max_drawdown: null },
        { persona_id: "p-neg", current_rank: 2, tier: "C", score: 60, pnl_30d: -50, sharpe: -0.4, max_drawdown: -0.15 },
      ],
    });
    expect(rows[0].pnl30d).toBeNull();
    expect(rows[0].sharpe).toBeNull();
    expect(rows[0].maxDrawdown).toBeNull();

    const byPnl = sortByPreset(rows as PersonaLeagueRow[], "pnl");
    expect(byPnl.map((r) => r.personaId)).toEqual(["p-neg", "p-null"]);

    const bySharpe = sortByPreset(rows as PersonaLeagueRow[], "risk_adjusted");
    expect(bySharpe.map((r) => r.personaId)).toEqual(["p-neg", "p-null"]);

    const byConsistency = sortByPreset(rows as PersonaLeagueRow[], "consistency");
    expect(byConsistency.map((r) => r.personaId)).toEqual(["p-neg", "p-null"]);
  });

  it("compareNullableStrategyMetric places null metrics after negative and zero numbers", () => {
    const values = [null, -0.25, 0, 0.1];
    const desc = [...values].sort((a, b) => compareNullableStrategyMetric(a, b, "desc"));
    expect(desc).toEqual([0.1, 0, -0.25, null]);
    const asc = [...values].sort((a, b) => compareNullableStrategyMetric(a, b, "asc"));
    expect(asc).toEqual([-0.25, 0, 0.1, null]);
  });

  it("derivePersonaReadiness and buildEntity preserve null strategy/persona metrics", () => {
    const readiness = derivePersonaReadiness({
      data: {
        persona: { lifecycle_state: "paper_owner" },
        health: { status: "healthy", pnl: null, drawdown: null },
      },
    });
    expect(readiness.pnl).toBeNull();
    expect(readiness.drawdown).toBeNull();

    const draftStrategy = buildEntity("strategy", {
      name: "New Strategy",
      alpha: "alpha.new",
      capitalPoolId: "pool-1",
      personaIds: [],
    });
    expect(draftStrategy.pnl).toBeNull();
    expect(draftStrategy.pnl30d).toBeNull();
    expect(draftStrategy.sharpe).toBeNull();
    expect(draftStrategy.drawdown).toBeNull();
  });

  it("AlphaFactoryBoardPage renders No data for replicated strategy with null sharpe and omits empty alpha separator", async () => {
    const items = [REAL_BFF_STRATEGY_ROWS["strat-not-running-05"]];
    const envelope: ListEnvelope<Strategy> = {
      items,
      cursor: {},
      pageSize: items.length,
      estimatedTotal: items.length,
      totalCountExact: true,
      meta: { surfaces: { strategies: { status: "ok", source: "service_store" } } },
    };
    vi.spyOn(lists, "strategies").mockResolvedValue(envelope);

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <AlphaFactoryBoardPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Unstarted Candidate Strategy")).toBeInTheDocument();
    expect(screen.getByText("strat-not-running-05")).toBeInTheDocument();
    expect(screen.queryByText(/strat-not-running-05 ·/)).not.toBeInTheDocument();
    expect(screen.getByText("No data")).toBeInTheDocument();
  });
});
