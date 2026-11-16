import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "@/i18n";
import { StrategyDetail } from "./StrategyDetail";
import { bffV1, managementConsoleReads, type Artifact, type Strategy } from "@/lib/bff-v1";

const ID_298E = "298e138c136c9840b0e4";
const ID_59B2 = "59b2143dcecf205acbf1";
const STRATEGY_ID = `strategy-persona-${ID_298E}`;

const artifactRow = (id: string): Artifact =>
  ({ id, name: id, kind: "paper", version: "1", state: "approved", risk: "low", hash: "h", owner: "operator", updatedAt: "2026-11-06T00:00:00Z", source_kind: "persona" }) as unknown as Artifact;

const ART_298E = `artifact-persona-paper-${ID_298E}`;
const ART_298E_BASE = `artifact-persona-paper-baseline-${ID_298E}`;
const ART_59B2 = `artifact-persona-paper-${ID_59B2}`;

const lineageOk = {
  nodes: [
    { id: ART_298E_BASE, label: ART_298E_BASE, type: "Artifact", state: "draft" },
    { id: ART_298E, label: ART_298E, type: "Artifact", state: "approved" },
    { id: `persona-${ID_298E}`, label: "p", type: "Persona" },
  ],
  edges: [],
  meta: { status: "ok", source: "service_client", surfaces: {} },
  page_info: { total: 3, page_size: 3, has_more: false },
  has_more: false,
};

const click = (el: HTMLElement) => {
  fireEvent.pointerDown(el); fireEvent.mouseDown(el); fireEvent.pointerUp(el); fireEvent.mouseUp(el); fireEvent.click(el);
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/management/strategies/${STRATEGY_ID}`]}>
      <Routes><Route path="/management/strategies/:id" element={<StrategyDetail />} /></Routes>
    </MemoryRouter>,
  );

const strategy = (alpha: string): Strategy =>
  ({
    id: STRATEGY_ID, name: "青禾 2330 台股 Paper 學習 R2", alpha, state: "draft", risk: "medium", owner: "operator",
    capitalPoolId: "", personaIds: [], pnl30d: 0, sharpe: 0, drawdown: 0, updatedAt: "2026-11-06T00:00:00Z",
  }) as Strategy;

describe("StrategyDetail spec & artifacts truth (FE-STRATEGY-DETAIL-TRUTH-20261106)", () => {
  beforeEach(() => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(strategy(""));
    vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.approvals, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.research, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.evolution, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
    vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([]);
    vi.spyOn(managementConsoleReads, "lineage").mockResolvedValue(lineageOk);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("artifact tab lists only this strategy's lineage artifacts, never another strategy's", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([
      artifactRow(ART_59B2), artifactRow(ART_298E), artifactRow(ART_298E_BASE),
    ]);
    renderPage();
    click(await screen.findByRole("tab", { name: /^(Artifacts|Artifact)/i }));
    expect((await screen.findAllByText(ART_298E)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ART_298E_BASE).length).toBeGreaterThan(0);
    expect(screen.queryByText(ART_59B2)).not.toBeInTheDocument();
  });

  it("renders an explicit 找不到 state when the strategy read answers 404, and keeps the load failure state for 5xx and network errors", async () => {
    await i18n.changeLanguage("zh-TW");
    try {
      vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
      const get = vi.spyOn(bffV1.strategies, "get");
      get.mockRejectedValue(Object.assign(new Error("HTTP 404"), { status: 404 }));
      const notFound = renderPage();
      expect(await screen.findByText(/找不到策略/)).toBeInTheDocument();
      expect(screen.queryByText("Strategy could not be loaded.")).not.toBeInTheDocument();
      notFound.unmount();

      get.mockRejectedValue(Object.assign(new Error("HTTP 503"), { status: 503 }));
      const serverError = renderPage();
      expect(await screen.findByText("Strategy could not be loaded.")).toBeInTheDocument();
      expect(screen.queryByText(/找不到/)).not.toBeInTheDocument();
      serverError.unmount();

      get.mockRejectedValue(new TypeError("Failed to fetch"));
      renderPage();
      expect(await screen.findByText("Strategy could not be loaded.")).toBeInTheDocument();
      expect(screen.queryByText(/找不到/)).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("en-US");
    }
  });

  it("a failed artifact read shows unavailable and no rows", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockRejectedValue(new Error("boom"));
    renderPage();
    click(await screen.findByRole("tab", { name: /^(Artifacts|Artifact)/i }));
    expect(await screen.findByText(/Artifacts unavailable|Artifact 資料暫時無法取得/)).toBeInTheDocument();
    expect(screen.queryByText(ART_59B2)).not.toBeInTheDocument();
  });

  it("a failed lineage read shows unavailable and never falls back to other strategy rows", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([artifactRow(ART_59B2)]);
    vi.spyOn(managementConsoleReads, "lineage").mockRejectedValue(new Error("down"));
    renderPage();
    click(await screen.findByRole("tab", { name: /^(Artifacts|Artifact)/i }));
    expect(await screen.findByText(/Artifacts unavailable|Artifact 資料暫時無法取得/)).toBeInTheDocument();
    expect(screen.queryByText(ART_59B2)).not.toBeInTheDocument();
  });

  it("spec tab shows no hardcoded crypto spec and no 'Alpha no data' sentence when alpha is absent", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    const { container } = renderPage();
    click(await screen.findByRole("tab", { name: /^(Spec|規格)/i }));
    await screen.findByText(/策略規格|Strategy specification/);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Top-50 perp|VWAP \/ 5min|BTC-PERP/);
    expect(text).not.toMatch(/Alpha (No data|無資料)/i);
    expect(text).not.toMatch(/Alpha 無資料 驅動|Alpha No data drives/i);
  });

  it("renders real spec values (TW / 2330.TWSE / benchmark) from data.spec for the persona strategy", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue({
      ...strategy("alpha-x"),
      spec: {
        spec_version: "1.0.0",
        market_scope: null,
        execution_profile: { execution_mode_hint: "paper" },
        evaluation_plan: { benchmark: "0050.TWSE" },
        metadata: { market: "TW", traits: { instruments: ["2330.TWSE"] } },
      },
    } as Strategy);
    const { container } = renderPage();
    click(await screen.findByRole("tab", { name: /^(Spec|規格)/i }));
    await screen.findByText(/策略規格|Strategy specification/);
    const text = container.textContent ?? "";
    expect(text).toContain("TW · 2330.TWSE");
    expect(text).toContain("paper");
    expect(text).toContain("0050.TWSE");
    expect(text).not.toMatch(/Top-50 perp|VWAP \/ 5min|BTC-PERP/);
  });

  it("shows operationalStatus and bound persona link with state next to the lifecycle stepper, and shows title, hypothesis, objective, plain-language rule sentence, rollback baseline label, unsupported rule kind, and read-only parameters with no edit/submit controls", async () => {
    await i18n.changeLanguage("zh-TW");
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    const realReleaseStrategy: Strategy = {
      id: "strategy-persona-b9f9e2e4d44cdd44d160",
      name: "Pantheon Dev Paper Release 42345302114 Attempt 1",
      owner: "persona-22582e56e0ad8a4f0ca7",
      updatedAt: "2026-11-07T07:40:00Z",
      state: "approved",
      risk: "low",
      alpha: "",
      capitalPoolId: "pool-persona-paper-b9f9e2e4d44cdd44d160",
      personaIds: ["persona-22582e56e0ad8a4f0ca7"],
      personaStates: [{ personaId: "persona-22582e56e0ad8a4f0ca7", state: "paper_running" }],
      operationalStatus: "running",
      symbols: ["2330.TW"],
      pnl: 0,
      pnl30d: 0,
      sharpe: null,
      drawdown: null,
      totalTrades: 0,
      metricsAsOf: "2026-11-07T07:40:00Z",
      metricsResolution: "fresh",
      metricsPersonaId: "persona-22582e56e0ad8a4f0ca7",
      availableActions: ["archive"],
      labelKey: "strategy.strategy-persona-b9f9e2e4d44cdd44d160",
      lifecycleStatus: "approved",
      spec: {
        spec_version_id: "reg-strategy-spec-persona-b9f9e2e4d44cdd44d160",
        spec_version: "1.0.0",
        title: "Pantheon Dev Paper Release 42345302114 Attempt 1",
        hypothesis: "Paper-only lifecycle verification in dev",
        objective: "Verify close-to-close momentum execution in dev",
        market_scope: { symbols: ["2330.TW"], asset_classes: ["equity"], frequency: "1d" },
        execution_profile: {
          signal_schema_version: "1.0",
          quantity_type: "SHARES",
          rebalance_cadence: "1d bar close, paper only",
          execution_mode_hint: "paper",
        },
        evaluation_plan: { metrics: ["sharpe", "max_drawdown"] },
        metadata: { market: "TW", execution_context: "paper" },
      },
      rules: [
        {
          registryId: "artifact-persona-paper-b9f9e2e4d44cdd44d160",
          version: "1.0.0",
          role: "trading",
          strategyLogic: {
            kind: "close_to_close_momentum",
            lookback_parameter: "lookback_bars",
            threshold_parameter: "momentum_threshold",
            positive_action: "BUY",
            non_positive_action: "SELL",
          },
          parameters: {
            market: "TW",
            symbols: ["2330.TW"],
            data_source: "source-ingest:paper/persona-bootstrap",
            bar_frequency: "1d",
            lookback_bars: 2,
            quantity_type: "SHARES",
            order_quantity: 1,
            momentum_threshold: 0,
            zero_momentum_action: "SELL",
          },
          adjustableControls: [
            {
              parameter_key: "lookback_bars",
              value_type: "integer",
              current_value: 2,
              allowed_range: { min: 2, max: 60 },
              step: 1,
            },
            {
              parameter_key: "momentum_threshold",
              value_type: "number",
              current_value: 0.0,
              allowed_range: { min: 0.0, max: 0.05 },
              step: 0.001,
            },
          ],
          immutableParameters: [
            "symbols",
            "bar_frequency",
            "data_source",
            "order_quantity",
            "quantity_type",
            "zero_momentum_action",
            "market",
          ],
        },
        {
          registryId: "artifact-persona-paper-baseline-b9f9e2e4d44cdd44d160",
          version: "1.0.0",
          role: "rollback_baseline",
          strategyLogic: {
            kind: "close_to_close_momentum",
            lookback_parameter: "lookback_bars",
            threshold_parameter: "momentum_threshold",
            positive_action: "HOLD",
            non_positive_action: "HOLD",
          },
          parameters: {
            market: "TW",
            symbols: ["2330.TW"],
            data_source: "source-ingest:paper/persona-bootstrap",
            bar_frequency: "1d",
            lookback_bars: 2,
            quantity_type: "SHARES",
            order_quantity: 0,
            momentum_threshold: 0,
            zero_momentum_action: "HOLD",
          },
          adjustableControls: [],
          immutableParameters: [
            "symbols",
            "bar_frequency",
            "data_source",
            "order_quantity",
            "quantity_type",
            "zero_momentum_action",
            "market",
          ],
        },
        {
          registryId: "artifact-persona-paper-unsupported-b9f9e2e4d44cdd44d160",
          version: "1.0.0",
          role: "trading",
          strategyLogic: {
            kind: "custom_grid_maker",
          },
          parameters: {},
          adjustableControls: [],
          immutableParameters: [],
        },
      ],
    };

    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(realReleaseStrategy);
    render(
      <MemoryRouter initialEntries={["/management/strategies/strategy-persona-b9f9e2e4d44cdd44d160"]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const statusBadge = await screen.findByTestId("strategy-detail-operational-status");
    expect(statusBadge).toHaveAttribute("data-operational-status", "running");
    expect(statusBadge).toHaveTextContent(/運行中|Running/);

    const personaLink = screen.getByTestId("strategy-bound-persona-persona-22582e56e0ad8a4f0ca7");
    expect(personaLink).toHaveAttribute("href", "/management/personas/persona-22582e56e0ad8a4f0ca7");
    expect(personaLink).toHaveAttribute("data-persona-state", "paper_running");
    expect(personaLink).toHaveTextContent("persona-22582e56e0ad8a4f0ca7");

    click(await screen.findByRole("tab", { name: /^(Spec|規格)/i }));

    expect(await screen.findByTestId("strategy-spec-title")).toHaveTextContent(
      "Pantheon Dev Paper Release 42345302114 Attempt 1",
    );
    expect(screen.getByTestId("strategy-spec-hypothesis")).toHaveTextContent(
      "Paper-only lifecycle verification in dev",
    );
    expect(screen.getByTestId("strategy-spec-objective")).toHaveTextContent(
      "Verify close-to-close momentum execution in dev",
    );

    const tradingRuleCard = screen.getByTestId(
      "strategy-rule-artifact-persona-paper-b9f9e2e4d44cdd44d160",
    );
    expect(within(tradingRuleCard).getByTestId("strategy-rule-text")).toHaveTextContent(
      "每根日K 收盤時，比較最新收盤價與 1 根前的收盤價：漲幅大於 0% 就買進 1 股，否則賣出 1 股。",
    );

    const baselineRuleCard = screen.getByTestId(
      "strategy-rule-artifact-persona-paper-baseline-b9f9e2e4d44cdd44d160",
    );
    expect(within(baselineRuleCard).getByTestId("strategy-rule-text")).toHaveAttribute(
      "data-rule-kind",
      "rollback_baseline",
    );
    expect(within(baselineRuleCard).getByTestId("strategy-rule-text")).toHaveTextContent(
      "不送單回滾基準（正負向皆不動作，下單數量 0）",
    );

    const unsupportedRuleCard = screen.getByTestId(
      "strategy-rule-artifact-persona-paper-unsupported-b9f9e2e4d44cdd44d160",
    );
    expect(within(unsupportedRuleCard).getByTestId("strategy-rule-text")).toHaveAttribute(
      "data-rule-kind",
      "unsupported",
    );
    expect(within(unsupportedRuleCard).getByTestId("strategy-rule-text")).toHaveTextContent(
      "不支援的規則類型：custom_grid_maker",
    );

    const paramsCard = screen.getByTestId("strategy-params-readonly");
    expect(within(paramsCard).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(paramsCard).queryByRole("button")).not.toBeInTheDocument();

    const lookbackRow = screen.getByTestId("strategy-param-adjustable-lookback_bars");
    expect(lookbackRow).toHaveTextContent("lookback_bars");
    expect(lookbackRow).toHaveTextContent("2");
    expect(lookbackRow).toHaveTextContent("2 – 60");
    expect(lookbackRow).toHaveTextContent("1");

    const thresholdRow = screen.getByTestId("strategy-param-adjustable-momentum_threshold");
    expect(thresholdRow).toHaveTextContent("momentum_threshold");
    expect(thresholdRow).toHaveTextContent("0");
    expect(thresholdRow).toHaveTextContent("0 – 0.05");
    expect(thresholdRow).toHaveTextContent("0.001");

    for (const fixedKey of [
      "symbols",
      "bar_frequency",
      "data_source",
      "order_quantity",
      "quantity_type",
      "zero_momentum_action",
      "market",
    ]) {
      expect(screen.getByTestId(`strategy-param-immutable-${fixedKey}`)).toBeInTheDocument();
      expect(screen.getByTestId(`strategy-param-fixed-${fixedKey}`)).toHaveTextContent(/固定|Fixed/);
    }
  });

  it("renders rules unavailable when rules is null, no rule recorded when rules is empty, and persona state could not be read when operationalStatus is unknown", async () => {
    await i18n.changeLanguage("en-US");
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    const rulesNullAndUnknownPersona: Strategy = {
      id: "strategy-persona-b9f9e2e4d44cdd44d160",
      name: "Pantheon Dev Paper Release 42345302114 Attempt 1",
      owner: "persona-22582e56e0ad8a4f0ca7",
      updatedAt: "2026-11-07T07:40:00Z",
      state: "approved",
      risk: "low",
      alpha: "",
      capitalPoolId: "pool-persona-paper-b9f9e2e4d44cdd44d160",
      personaIds: ["persona-22582e56e0ad8a4f0ca7"],
      personaStates: [{ personaId: "persona-22582e56e0ad8a4f0ca7", state: "unknown" }],
      operationalStatus: "unknown",
      symbols: ["2330.TW"],
      pnl: null,
      pnl30d: null,
      sharpe: null,
      drawdown: null,
      rules: null,
    };

    vi.spyOn(bffV1.strategies, "get").mockResolvedValueOnce(rulesNullAndUnknownPersona);
    const { unmount } = render(
      <MemoryRouter initialEntries={["/management/strategies/strategy-persona-b9f9e2e4d44cdd44d160"]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const statusBadge = await screen.findByTestId("strategy-detail-operational-status");
    expect(statusBadge).toHaveAttribute("data-operational-status", "unknown");
    expect(statusBadge).toHaveTextContent("Persona state could not be read");

    click(await screen.findByRole("tab", { name: /^(Spec|規格)/i }));
    expect(await screen.findByTestId("strategy-rules-unavailable")).toHaveTextContent(
      "Trading rules unavailable (execution bundle read failed).",
    );
    expect(screen.getByTestId("strategy-params-unavailable")).toHaveTextContent(
      "Trading rules unavailable (execution bundle read failed).",
    );
    unmount();

    vi.spyOn(bffV1.strategies, "get").mockResolvedValueOnce({
      ...rulesNullAndUnknownPersona,
      id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
      personaIds: [],
      personaStates: [],
      operationalStatus: "unbound",
      rules: [],
    });

    render(
      <MemoryRouter
        initialEntries={[
          "/management/strategies/strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
        ]}
      >
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    click(await screen.findByRole("tab", { name: /^(Spec|規格)/i }));
    expect(await screen.findByTestId("strategy-rules-empty")).toHaveTextContent(
      "No trading rule is recorded for this strategy.",
    );
    expect(screen.getByTestId("strategy-params-empty")).toHaveTextContent(
      "No trading rule is recorded for this strategy.",
    );
  });
});
