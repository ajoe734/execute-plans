import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  bffV1,
  NON_TERMINAL_INCIDENT_STATUS_FILTER,
  type Alert,
  type CapitalPool,
  type Incident,
  type Persona,
  type Runtime,
  type Strategy,
} from "@/lib/bff-v1";
import { DRAWDOWN_BREACH_THRESHOLD, isDrawdownBreach, RiskCenter } from "./RiskCenter";

function renderRiskCenter() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/risk"]}>
        <RiskCenter />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("RiskCenter", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("drawdown breach sign check against owner-stored fractional ratio", () => {
    it("verifies drawdown breach fires when positive owner-stored max_drawdown exceeds 0.1", () => {
      expect(DRAWDOWN_BREACH_THRESHOLD).toBe(0.1);
      expect(isDrawdownBreach(0.18)).toBe(true);
      expect(isDrawdownBreach({ drawdown: 0.18 })).toBe(true);
      expect(isDrawdownBreach({ drawdown: 0.1001 })).toBe(true);
      expect(isDrawdownBreach({ drawdown: 0.1 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: 0.05 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: 0 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: -0.18 })).toBe(false);
      expect(isDrawdownBreach({ drawdown: null })).toBe(false);
      expect(isDrawdownBreach({ drawdown: Number.NaN })).toBe(false);
    });
  });

  it("loads non-draft strategies, all-page personas/pools/runtimes, and server-filtered open incidents while stating drafts are excluded", async () => {
    const strategies: Strategy[] = Array.from({ length: 26 }, (_, idx) => ({
      id: idx === 25 ? "strategy-persona-298e138c136c9840b0e4" : `strategy-approved-${idx + 1}`,
      name: idx === 25 ? "青禾｜2330 台股 Paper 學習 R2 Paper Strategy" : `Approved Strategy ${idx + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: idx === 0 ? "high" : "low",
      alpha: "alpha.v1",
      capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
      personaIds: ["persona-be19a1fac471247f2b2a"],
      pnl30d: 0.04,
      sharpe: 1.5,
      drawdown: idx === 0 ? 0.18 : 0.03,
    }));

    const personas: Persona[] = Array.from({ length: 25 }, (_, idx) => ({
      id: idx === 24 ? "persona-be19a1fac471247f2b2a" : `persona-${idx + 1}`,
      name: idx === 24 ? "青禾｜2330 台股 Paper 學習 R2" : `Persona ${idx + 1}`,
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.65,
    }));

    const pools: CapitalPool[] = [
      {
        id: "pool-1",
        name: "Primary Pool",
        owner: "treasury",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "low",
        currency: "USD",
        allocated: 1_000_000,
        utilized: 800_000,
        riskBudget: 0.05,
      },
      {
        id: "pool-persona-paper-298e138c136c9840b0e4",
        name: "pool-persona-paper-298e138c136c9840b0e4",
        owner: "treasury",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "medium",
        currency: "USD",
        allocated: 1_000_000,
        utilized: 950_000,
        riskBudget: 0.05,
      },
    ];

    const runtimes: Runtime[] = [
      {
        id: "rt-535a82a3",
        name: "rt-535a82a3",
        kind: "executor",
        env: "paper",
        status: "running",
        cpu: 0.2,
        memory: 0.3,
        latencyP95Ms: 12,
        uptimePct: 99.9,
        region: "asia-east1",
        updatedAt: "2026-10-18T17:20:36.224810Z",
      },
    ];

    const incidents: Incident[] = [
      {
        id: "inc-open-1",
        title: "Active Drawdown Alert",
        severity: "high",
        status: "open",
        openedAt: "2026-10-18T17:20:36.224810Z",
        affected: ["strategy-approved-1"],
        timeline: [],
      },
      {
        id: "inc-resolved-ignored",
        title: "Historical Resolved Incident",
        severity: "low",
        status: "resolved",
        openedAt: "2026-10-10T00:00:00Z",
        affected: [],
        timeline: [],
      },
    ];

    const alerts: Alert[] = [];

    const listNonDraftSpy = vi.spyOn(bffV1.strategies, "listNonDraft").mockResolvedValue(strategies);
    const personasSpy = vi.spyOn(bffV1.personas, "list").mockResolvedValue(personas);
    const poolsSpy = vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue(pools);
    const runtimesSpy = vi.spyOn(bffV1.runtimes, "list").mockResolvedValue(runtimes);
    const incidentsSpy = vi.spyOn(bffV1.incidents, "list").mockResolvedValue(incidents);
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue(alerts);
    vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);

    renderRiskCenter();

    await waitFor(() => {
      expect(listNonDraftSpy).toHaveBeenCalledTimes(1);
      expect(personasSpy).toHaveBeenCalledTimes(1);
      expect(poolsSpy).toHaveBeenCalledTimes(1);
      expect(runtimesSpy).toHaveBeenCalledTimes(1);
      expect(incidentsSpy).toHaveBeenCalledWith({ status: NON_TERMINAL_INCIDENT_STATUS_FILTER });
    });

    const incidentsCard = await screen.findByTestId("risk-card-incidents");
    expect(within(incidentsCard).getByText("1")).toBeInTheDocument();

    const drawdownCard = screen.getByTestId("risk-card-drawdown");
    expect(within(drawdownCard).getByText("1")).toBeInTheDocument();
    expect(within(drawdownCard).getByText(/Draft strategies excluded/i)).toBeInTheDocument();

    expect(screen.getByTestId("risk-matrix-drafts-excluded")).toHaveTextContent("Draft strategies excluded");
    const strategyMatrixRow = screen.getByTestId("breach-matrix-row-strategy");
    expect(within(strategyMatrixRow).getByText("1")).toBeInTheDocument();
    expect(within(strategyMatrixRow).getByText("25")).toBeInTheDocument();

    const strategiesTab = screen.getByRole("tab", { name: /Strategy/i });
    fireEvent.mouseDown(strategiesTab);
    fireEvent.click(strategiesTab);

    expect(await screen.findByTestId("risk-strategies-drafts-excluded")).toHaveTextContent(
      "Draft strategies excluded",
    );
    expect(screen.getByText("青禾｜2330 台股 Paper 學習 R2 Paper Strategy")).toBeInTheDocument();
  });

  it("shows loading state on cards while promises are pending and never shows 0 while loading", () => {
    vi.spyOn(bffV1.incidents, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.alerts, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.strategies, "listNonDraft").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.capitalPools, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.runtimes, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.personas, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.tools, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.mcpServers, "list").mockReturnValue(new Promise(() => {}));
    vi.spyOn(bffV1.skills, "list").mockReturnValue(new Promise(() => {}));

    renderRiskCenter();

    for (const testId of [
      "risk-card-incidents",
      "risk-card-drawdown",
      "risk-card-utilization",
      "risk-card-degraded",
    ]) {
      const card = screen.getByTestId(testId);
      expect(within(card).getByText("Loading…")).toBeInTheDocument();
      expect(within(card).queryByText("0")).not.toBeInTheDocument();
    }
  });

  it("shows unavailable state for failed reads while other cards still render their real values and never shows 0 on failure", async () => {
    vi.spyOn(bffV1.incidents, "list").mockRejectedValue(new Error("incidents down"));
    vi.spyOn(bffV1.strategies, "listNonDraft").mockRejectedValue(new Error("strategies down"));
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.tools, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.mcpServers, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.skills, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue([
      {
        id: "pool-util-breach",
        name: "High Util Pool",
        owner: "treasury",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "high",
        currency: "USD",
        allocated: 1_000_000,
        utilized: 950_000,
        riskBudget: 0.05,
      },
    ]);
    vi.spyOn(bffV1.runtimes, "list").mockResolvedValue([
      {
        id: "rt-degraded-1",
        name: "rt-degraded-1",
        kind: "executor",
        env: "paper",
        status: "warning",
        cpu: 0.8,
        memory: 0.7,
        latencyP95Ms: 140,
        uptimePct: 98.1,
        region: "asia-east1",
        updatedAt: "2026-10-18T17:20:36.224810Z",
      },
    ]);

    renderRiskCenter();

    const incidentsCard = await screen.findByTestId("risk-card-incidents");
    const drawdownCard = screen.getByTestId("risk-card-drawdown");
    const utilCard = screen.getByTestId("risk-card-utilization");
    const degradedCard = screen.getByTestId("risk-card-degraded");

    await waitFor(() => {
      expect(within(incidentsCard).getByText("Unavailable")).toBeInTheDocument();
      expect(within(drawdownCard).getByText("Unavailable")).toBeInTheDocument();
      expect(within(utilCard).getByText("1")).toBeInTheDocument();
      expect(within(degradedCard).getByText("1")).toBeInTheDocument();
    });

    expect(within(incidentsCard).queryByText("0")).not.toBeInTheDocument();
    expect(within(drawdownCard).queryByText("0")).not.toBeInTheDocument();
  });
});
