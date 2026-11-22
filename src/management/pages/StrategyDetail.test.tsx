// FE-RISK-STRATEGY-RESEARCH-UI-20261120 WP6.2 — StrategyDetail overview.
// Fixtures follow the BFF contract shape of GET /bff/strategies/{id} for a real
// pool strategy and for a strat-tw-official synthetic stub (is_synthetic_or_stub).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "@/i18n";
import { StrategyDetail } from "./StrategyDetail";
import { bffV1, type Strategy } from "@/lib/bff-v1";

const REAL_POOL_STRATEGY = {
  id: "strategy-persona-298e138c136c9840b0e4",
  name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
  alpha: "momentum.v1",
  state: "approved",
  risk: "low",
  owner: "operator",
  capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
  personaIds: ["persona-be19a1fac471247f2b2a"],
  personaStates: [{ personaId: "persona-be19a1fac471247f2b2a", state: "paper_owner" }],
  persona_display_names: { "persona-be19a1fac471247f2b2a": "青禾｜2330 台股 Paper 學習 R2" },
  operationalStatus: "running",
  symbols: ["2330"],
  rules: [
    {
      registryId: "rule-trading-1",
      role: "trading",
      strategyLogic: { kind: "momentum_threshold", lookback_parameter: "lookback", threshold_parameter: "threshold" },
      parameters: { lookback: 20, threshold: 0, symbols: ["2330"] },
    },
  ],
  is_synthetic_or_stub: false,
  pnl30d: 0.04,
  sharpe: 1.1,
  drawdown: 0.03,
  updatedAt: "2026-11-20T00:00:00Z",
} as unknown as Strategy;

const OFFICIAL_STUB = {
  id: "strat-tw-official",
  name: "strat-tw-official",
  alpha: "",
  state: "approved",
  risk: "low",
  owner: "system",
  capitalPoolId: "",
  personaIds: [],
  personaStates: [],
  operationalStatus: "unknown",
  rules: [],
  is_synthetic_or_stub: true,
  stub_reason: "no_rules",
  pnl30d: null,
  sharpe: null,
  drawdown: null,
  updatedAt: "2026-11-20T00:00:00Z",
} as unknown as Strategy;

function mockRest() {
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
}

function renderPage(id: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/management/strategies/${id}`]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("StrategyDetail overview (FE-RISK-STRATEGY-RESEARCH-UI-20261120)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-TW");
    mockRest();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("real pool strategy: shows persona display name with id secondary and a plain-language rules summary, no discovery dashes", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(REAL_POOL_STRATEGY);
    renderPage(REAL_POOL_STRATEGY.id);
    const name = await screen.findByTestId("strategy-bound-persona-name-persona-be19a1fac471247f2b2a");
    expect(name).toHaveTextContent("青禾｜2330 台股 Paper 學習 R2");
    expect(screen.getByTestId("strategy-bound-persona-persona-be19a1fac471247f2b2a")).toHaveTextContent(
      "persona-be19a1fac471247f2b2a",
    );
    const summary = screen.getByTestId("strategy-rules-summary");
    expect(summary).toHaveTextContent("2330");
    expect(screen.getByTestId("strategy-rules-summary-rule-0")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-rules-summary-spec-link")).toBeInTheDocument();
    expect(screen.queryByTestId("strategy-stub-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("strategy-discovery")).not.toBeInTheDocument();
    expect(screen.queryByTestId("strategy-discovery-hypothesis-claim")).not.toBeInTheDocument();
  });

  it("strat-tw-official stub: renders an explicit banner naming the stub reason instead of an empty rule list", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(OFFICIAL_STUB);
    renderPage(OFFICIAL_STUB.id);
    const banner = await screen.findByTestId("strategy-stub-banner");
    expect(banner).toHaveTextContent("測試／合成策略");
    expect(screen.getByTestId("strategy-stub-reason")).toHaveTextContent("尚未設定任何交易規則");
    expect(screen.queryByTestId("strategy-rules-summary")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("strategy-discovery")).not.toBeInTheDocument());
  });
});
