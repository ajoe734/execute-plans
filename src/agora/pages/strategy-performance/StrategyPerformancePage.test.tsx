import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n";
import type {
  AdjustmentSuggestion,
  PerformanceProjectionEnvelope,
  SuggestionActionEnvelope,
} from "@/lib/bff-v1/agora/performance";
import type {
  TradingRoomAggregate,
  TradingRoomPerformanceAttributionResponse,
} from "@/lib/bff-v1/agora/tradingRoom";
import { StrategyPerformancePage } from "./StrategyPerformancePage";

const tradingRoomMocks = vi.hoisted(() => ({
  getTradingRoom: vi.fn(),
  getTradingRoomPerformanceAttribution: vi.fn(),
}));

const performanceMocks = vi.hoisted(() => ({
  getStrategyPerformance: vi.fn(),
  actOnPerformanceSuggestion: vi.fn(),
}));

const accessMocks = vi.hoisted(() => ({
  useAgoraWriteAccess: vi.fn(),
}));

const zhPerformance = i18n.getFixedT("zh-TW", undefined, "agora.performance");

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  getTradingRoom: tradingRoomMocks.getTradingRoom,
  getTradingRoomPerformanceAttribution: tradingRoomMocks.getTradingRoomPerformanceAttribution,
}));

vi.mock("@/lib/bff-v1/agora/performance", () => ({
  getStrategyPerformance: performanceMocks.getStrategyPerformance,
  actOnPerformanceSuggestion: performanceMocks.actOnPerformanceSuggestion,
}));

vi.mock("@/agora/useAgoraWriteAccess", () => ({
  useAgoraWriteAccess: accessMocks.useAgoraWriteAccess,
}));

const baseAggregate: TradingRoomAggregate = {
  data_cutoff: "2026-07-22T10:00:00Z",
  queue_summary: { add: 0, entry: 1, exit: 0, reduce: 0, review: 1 },
  risk_summary: { alerts: [], state: "normal" },
  snapshot_at: "2026-07-22T10:05:00Z",
  spec_version: "1.0",
  strategies: [
    {
      monitoring_state: "monitoring",
      pending_event_counts: { add: 0, entry: 1, exit: 0, reduce: 0, review: 0 },
      readiness_state: "ready",
      strategy_id: "strat-alpha",
      strategy_spec_registry_id: "reg-alpha",
      title: "Breakout Alpha",
    },
  ],
  user_scope_ref: "tenant:test",
};

function attributionResponse(
  overrides: Partial<TradingRoomPerformanceAttributionResponse> = {},
): TradingRoomPerformanceAttributionResponse {
  return {
    data: {
      dimensions: ["strategy"],
      id: "perf-latest",
      items: [
        {
          dimension: "strategy",
          dimension_key: "strat-alpha",
          holding_count: 1,
          id: "row-alpha",
          label: "Breakout Alpha",
          metrics: {
            holding_count: 1,
            latest_telemetry_at: "2026-07-22T10:04:00Z",
            runtime_count: 3,
            telemetry_runtime_count: 2,
            total_pnl: 1250,
            total_trades: 17,
            worst_drawdown: -0.042,
          },
          period: "latest",
          pnl_contribution_pct: 0.63,
          rank: 1,
          runtime_count: 3,
          source_refs: { strategy_ids: ["strat-alpha"] },
        },
      ],
      period: "latest",
      summary: {
        average_fill_rate: 0.98,
        average_slippage_bps: 1.2,
        basis: "live_telemetry",
        dimensions: ["strategy"],
        holding_count: 1,
        latest_telemetry_at: "2026-07-22T10:04:00Z",
        period: "latest",
        returned_row_count: 1,
        row_count: 1,
        runtime_count: 3,
        supported_dimensions: ["strategy"],
        telemetry_runtime_count: 2,
        total_exposure: 50000,
        total_notional: 75000,
        total_pnl: 1250,
        total_trades: 17,
        worst_drawdown: -0.042,
      },
    },
    meta: {
      composition_sources: ["portfolio_book", "runtime_telemetry"],
      policy: "read_only_performance_attribution",
      snapshot_at: "2026-07-22T10:04:00Z",
      surfaces: {
        portfolio_book: { status: "healthy" },
        runtime_telemetry: { status: "healthy" },
      },
    },
    page_info: { next_page_token: null, page_size: 50, total: 1 },
    ...overrides,
  };
}

function suggestion(overrides: Partial<AdjustmentSuggestion> = {}): AdjustmentSuggestion {
  return {
    suggestion_id: "suggestion-1",
    strategy_id: "strat-alpha",
    period: "latest",
    status: "proposed",
    version: 1,
    title: "Persisted threshold review",
    rationale: "BFF-authored rationale",
    expected_effect: { drawdown_delta: -0.01 },
    expected_risk: { turnover_delta: 0.02 },
    provenance: {
      source_id: "servant-run-1",
      source_type: "servant_analysis",
      produced_at: "2026-07-22T10:00:00Z",
      source_version: "v4",
      evidence_refs: ["sensitive://evidence-must-not-render"],
    },
    as_of: "2026-07-22T10:00:00Z",
    updated_at: null,
    no_order_route_proof: "agora_suggestion_state_only",
    ...overrides,
  };
}

function performanceEnvelope(): PerformanceProjectionEnvelope {
  const available = {
    status: "available" as const,
    as_of: "2026-07-22T10:00:00Z",
    source_ids: ["truth-projector"],
    reason: null,
  };
  return {
    data: {
      strategy_id: "strat-alpha",
      period: "latest",
      environment: "paper",
      availability: "available",
      freshness: {
        status: "available",
        snapshot_at: "2026-07-22T10:05:00Z",
        as_of: "2026-07-22T10:00:00Z",
        source_watermarks: { truth_projector: "2026-07-22T10:00:00Z" },
        projection_revision: 3,
        projection_generation: 9,
        unavailable_sources: [],
      },
      compliance: {
        availability: available,
        metrics: [{
          metric_id: "compliance-rate",
          label: "Policy compliance",
          value: 92,
          unit: "%",
          calculation_id: "calc-1",
          source_id: "compliance-projector",
          as_of: "2026-07-22T10:00:00Z",
          evidence_refs: ["sensitive://compliance-evidence"],
        }],
      },
      interventions: {
        availability: available,
        aggregate: { total: 1, by_status: { recorded: 1 } },
        items: [{
          intervention_id: "intervention-1",
          kind: "manual_override",
          status: "recorded",
          occurred_at: "2026-07-22T09:00:00Z",
          source_id: "intervention-ledger",
          evidence_refs: ["sensitive://intervention-evidence"],
        }],
      },
      execution_history: {
        availability: available,
        items: [{
          journey_id: "journey-1",
          status: "reconciled",
          occurred_at: "2026-07-22T08:00:00Z",
          updated_at: "2026-07-22T09:00:00Z",
          decision_ids: ["decision-1"],
          order_ids: ["order-1"],
          fill_ids: ["fill-1"],
          reconciliation_ids: ["reconciliation-1"],
          evidence_refs: ["sensitive://journey-evidence"],
          source_id: "canonical_trade_journey_projector",
        }],
      },
      warnings: {
        availability: available,
        items: [{
          warning_id: "warning-1",
          code: "THRESHOLD_BREACH",
          severity: "warning",
          occurred_at: "2026-07-22T09:30:00Z",
          source_id: "warning-projector",
          evidence_refs: ["sensitive://warning-evidence"],
          message: "BFF-authored threshold warning",
          details: { private_payload: "not rendered" },
        }],
      },
      adjustment_suggestions: { availability: available, items: [suggestion()] },
      no_order_route_proof: "agora_performance_read_only",
    },
    meta: { capability: "agora.performance.truth.v1" },
  };
}

function actionEnvelope(): SuggestionActionEnvelope {
  const readback = suggestion({
    status: "applied",
    version: 2,
    updated_at: "2026-07-22T10:06:00Z",
  });
  return {
    data: {
      receipt_id: "receipt-1",
      audit_event_id: "audit-1",
      suggestion_id: readback.suggestion_id,
      strategy_id: readback.strategy_id,
      action: "apply",
      previous_status: "proposed",
      status: "applied",
      previous_version: 1,
      version: 2,
      actor_id: "operator-1",
      reason: null,
      recorded_at: "2026-07-22T10:06:00Z",
      authoritative_readback: readback,
      idempotent_replay: false,
      execution_authority: "none",
      no_order_route_proof: "agora_suggestion_state_only",
    },
    meta: { authoritative_store: "agora_performance_sqlite" },
  };
}

function arrangeLoaded(
  aggregate: TradingRoomAggregate = baseAggregate,
  attribution: TradingRoomPerformanceAttributionResponse = attributionResponse(),
  detail: PerformanceProjectionEnvelope = performanceEnvelope(),
): void {
  tradingRoomMocks.getTradingRoom.mockResolvedValue(aggregate);
  tradingRoomMocks.getTradingRoomPerformanceAttribution.mockResolvedValue(attribution);
  performanceMocks.getStrategyPerformance.mockResolvedValue(detail);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
  accessMocks.useAgoraWriteAccess.mockReturnValue({
    actorId: "operator-1",
    agoraCapabilities: ["agora.performance.truth.v1"],
    capabilities: [],
    roles: ["operator"],
    loading: false,
    interactionAllowed: true,
    interactionDisabledReason: null,
    writeAllowed: true,
    writeDisabledReason: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StrategyPerformancePage", () => {
  it("renders live attribution plus authoritative details and never exposes evidence refs", async () => {
    arrangeLoaded();
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "策略執行與績效" })).toBeDefined();
    expect((await screen.findAllByText("Breakout Alpha")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,250").length).toBeGreaterThan(0);
    expect(await screen.findByText("Policy compliance")).toBeDefined();
    expect(screen.getAllByText("BFF-authored threshold warning").length).toBeGreaterThan(0);
    expect(screen.getByText(/servant_analysis\/servant-run-1@v4/)).toBeDefined();
    expect(screen.queryByText(/sensitive:\/\//)).toBeNull();
    expect(screen.queryByText(/台積電|聯電|預估年化報酬|表現穩定/)).toBeNull();
    expect(performanceMocks.getStrategyPerformance).toHaveBeenCalledWith("strat-alpha", { period: "latest" });
  });

  it("keeps Trading Room strategies visible when attribution is missing", async () => {
    arrangeLoaded({
      ...baseAggregate,
      strategies: [
        ...baseAggregate.strategies,
        {
          monitoring_state: "shadow",
          pending_event_counts: { add: 0, entry: 0, exit: 0, reduce: 0, review: 0 },
          readiness_state: "conditional",
          strategy_id: "strat-beta",
          strategy_spec_registry_id: "reg-beta",
          title: "Carry Beta",
        },
      ],
    });
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findAllByText("Carry Beta")).toBeDefined();
    expect(screen.getAllByText("缺少歸因資料").length).toBeGreaterThan(0);
  });

  it("places the explained Unassigned bucket after named strategies", async () => {
    const attribution = attributionResponse();
    attribution.data.items = [
      {
        dimension: "strategy",
        dimension_key: "unassigned",
        holding_count: 0,
        id: "row-unassigned",
        label: "Unassigned",
        metrics: { runtime_count: 0, telemetry_runtime_count: 0, holding_count: 0, total_pnl: 0, total_trades: 6841 },
        period: "latest",
        rank: 1,
        runtime_count: 0,
      },
      { ...attribution.data.items[0], rank: 2 },
    ];
    arrangeLoaded(baseAggregate, attribution);
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    const named = await screen.findAllByText("Breakout Alpha");
    const unassigned = screen.getAllByText("Unassigned");
    expect(named[0].compareDocumentPosition(unassigned[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("performance-row-attribution-row-unassigned-description").textContent).toContain("無法連結至具名交易操盤室策略");
  });

  it("distinguishes measured zero from fields the attribution BFF did not report", async () => {
    const attribution = attributionResponse();
    attribution.data.items[0].metrics = {
      ...attribution.data.items[0].metrics,
      total_pnl: 0,
      total_trades: undefined as unknown as number,
    };
    arrangeLoaded(baseAggregate, attribution);
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    await screen.findAllByText("Breakout Alpha");
    expect(screen.getAllByTitle("已量測：零").some((node) => node.textContent === "$0")).toBe(true);
    expect(screen.getAllByTitle("BFF 未回報量測值").some((node) => node.textContent === "未回報")).toBe(true);
  });

  it("shows the strict aggregate BFF error state without fallback rows", async () => {
    tradingRoomMocks.getTradingRoom.mockRejectedValue(new Error("AUTH_REQUIRED"));
    tradingRoomMocks.getTradingRoomPerformanceAttribution.mockResolvedValue(attributionResponse());
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findByText("無法取得即時績效資料。")).toBeDefined();
    expect(screen.getByText("AUTH_REQUIRED")).toBeDefined();
    expect(screen.queryByText("Breakout Alpha")).toBeNull();
  });

  it("shows a strict detail error without inventing strategy details", async () => {
    arrangeLoaded();
    performanceMocks.getStrategyPerformance.mockRejectedValue(new Error("BACKEND_UNAVAILABLE"));
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findAllByText(/BACKEND_UNAVAILABLE/)).toHaveLength(2);
    expect(screen.getAllByText("Breakout Alpha").length).toBeGreaterThan(0);
    expect(screen.queryByText("Policy compliance")).toBeNull();
    expect(screen.queryByText("Persisted threshold review")).toBeNull();
  });

  it.each([
    ["不可用", (detail: PerformanceProjectionEnvelope) => {
      detail.data.availability = "unavailable";
      detail.data.freshness.status = "unavailable";
      detail.data.compliance.metrics = [];
      detail.data.interventions.items = [];
      detail.data.execution_history.items = [];
      detail.data.warnings.items = [];
      detail.data.adjustment_suggestions.items = [];
    }],
    [zhPerformance("states.partial"), (detail: PerformanceProjectionEnvelope) => {
      detail.data.availability = "partial";
      detail.data.compliance.availability.status = "unavailable";
      detail.data.compliance.availability.reason = "source unavailable";
    }],
    ["已過期", (detail: PerformanceProjectionEnvelope) => {
      detail.data.warnings.availability.reason = "stale watermark from BFF";
    }],
    ["無資料", (detail: PerformanceProjectionEnvelope) => {
      detail.data.compliance.metrics = [];
      detail.data.interventions.items = [];
      detail.data.execution_history.items = [];
      detail.data.warnings.items = [];
      detail.data.adjustment_suggestions.items = [];
    }],
  ])("renders the BFF-derived %s projection state", async (label, mutate) => {
    const detail = performanceEnvelope();
    mutate(detail);
    arrangeLoaded(baseAggregate, attributionResponse(), detail);
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId("performance-projection-state").textContent).toContain(label));
  });

  it("changes periods and requests both attribution and authoritative detail for the new period", async () => {
    arrangeLoaded();
    const { container } = render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);
    await screen.findByText("Policy compliance");

    const select = container.querySelector("select");
    expect(select).toBeDefined();
    fireEvent.change(select!, { target: { value: "7d" } });
    await waitFor(() => {
      expect(tradingRoomMocks.getTradingRoomPerformanceAttribution).toHaveBeenCalledWith({ pageSize: 50, period: "7d" });
      expect(performanceMocks.getStrategyPerformance).toHaveBeenCalledWith("strat-alpha", { period: "7d" });
    });
  });

  it("renders only BFF-authored intervention and canonical execution history", async () => {
    arrangeLoaded();
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);
    await screen.findByText("Policy compliance");

    fireEvent.click(screen.getByRole("button", { name: "干預追蹤" }));
    expect(screen.getByText("manual_override")).toBeDefined();
    expect(screen.getByText(/權威干預總數：1/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "執行歷史" }));
    expect(screen.getByText("journey-1")).toBeDefined();
    expect(screen.getByText(/決策 1 · 訂單 1 · 成交 1 · 對帳 1/)).toBeDefined();
    expect(screen.getByText("canonical_trade_journey_projector")).toBeDefined();
    expect(screen.queryByText("order-1")).toBeNull();
  });

  it("keeps one explicit narrow pane active with keyboard-addressable controls", async () => {
    arrangeLoaded();
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);
    await screen.findByText("Policy compliance");

    const decisionPane = screen.getByTestId("performance-decision-pane");
    const outcomePane = screen.getByTestId("performance-outcome-pane");
    const strategyPane = screen.getByTestId("performance-strategy-pane");
    expect(decisionPane.getAttribute("data-mobile-pane-hidden")).toBe("false");
    expect(screen.getByTestId("performance-mobile-priority").textContent).toContain("Breakout Alpha");
    expect(screen.getByRole("combobox", { name: "期間" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "所選結果" }));
    expect(decisionPane.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(outcomePane.getAttribute("data-mobile-pane-hidden")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "策略" }));
    expect(outcomePane.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(strategyPane.getAttribute("data-mobile-pane-hidden")).toBe("false");
  });

  it("shows success only from receipt readback and replaces suggestion state", async () => {
    arrangeLoaded();
    performanceMocks.actOnPerformanceSuggestion.mockResolvedValue(actionEnvelope());
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);
    await screen.findByText("Persisted threshold review");

    fireEvent.click(screen.getByRole("button", { name: "套用" }));
    await waitFor(() => expect(performanceMocks.actOnPerformanceSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      strategyId: "strat-alpha",
      suggestionId: "suggestion-1",
      action: "apply",
      expectedVersion: 1,
      idempotencyKey: "agperf-00000000-0000-4000-8000-000000000001",
    })));
    expect(await screen.findByTestId("performance-receipt-receipt-1")).toHaveTextContent("Receipt receipt-1 · audit audit-1");
    expect(screen.getByText("已套用")).toBeDefined();
    expect(screen.queryByRole("button", { name: "套用" })).toBeNull();
  });

  it("keeps authoritative suggestion state unchanged and communicates typed action failure", async () => {
    arrangeLoaded();
    performanceMocks.actOnPerformanceSuggestion.mockRejectedValue(new Error("STATE_CONFLICT: stale version"));
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);
    await screen.findByText("Persisted threshold review");

    fireEvent.click(screen.getByRole("button", { name: "駁回" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("STATE_CONFLICT: stale version");
    expect(screen.getByText("提議中")).toBeDefined();
    expect(screen.queryByTestId(/performance-receipt-/)).toBeNull();
  });

  it("disables suggestion writes for a viewer even when a generic write gate is open", async () => {
    accessMocks.useAgoraWriteAccess.mockReturnValue({
      actorId: "viewer-1",
      agoraCapabilities: ["agora.performance.truth.v1"],
      capabilities: [],
      roles: ["viewer"],
      loading: false,
      interactionAllowed: false,
      interactionDisabledReason: "role",
      writeAllowed: true,
      writeDisabledReason: null,
    });
    arrangeLoaded();
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);
    await screen.findByText("Persisted threshold review");

    expect(screen.getByText(/需要 operator、reviewer、approver 或 admin/)).toBeDefined();
    expect(screen.getByRole("button", { name: "套用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "駁回" })).toBeDisabled();
  });

  it("renders a terminal status returned by a fresh projection after reload", async () => {
    const detail = performanceEnvelope();
    detail.data.adjustment_suggestions.items = [suggestion({ status: "applied", version: 2 })];
    arrangeLoaded(baseAggregate, attributionResponse(), detail);
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findByText("已套用")).toBeDefined();
    expect(screen.queryByRole("button", { name: "套用" })).toBeNull();
    expect(performanceMocks.actOnPerformanceSuggestion).not.toHaveBeenCalled();
  });
});
