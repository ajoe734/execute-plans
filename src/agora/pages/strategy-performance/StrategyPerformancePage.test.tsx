import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StrategyPerformancePage } from "./StrategyPerformancePage";
import "@/i18n";
import type {
  TradingDecisionEvent,
  TradingRoomAggregate,
  TradingRoomPerformanceAttributionResponse,
} from "@/lib/bff-v1/agora/tradingRoom";

const tradingRoomMocks = vi.hoisted(() => ({
  getTradingRoom: vi.fn(),
  getTradingRoomPerformanceAttribution: vi.fn(),
  listDecisionEvents: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  getTradingRoom: tradingRoomMocks.getTradingRoom,
  getTradingRoomPerformanceAttribution: tradingRoomMocks.getTradingRoomPerformanceAttribution,
  listDecisionEvents: tradingRoomMocks.listDecisionEvents,
}));

const baseAggregate: TradingRoomAggregate = {
  data_cutoff: "2026-07-08T10:00:00Z",
  queue_summary: { add: 0, entry: 1, exit: 0, reduce: 0, review: 1 },
  risk_summary: { alerts: [], state: "normal" },
  snapshot_at: "2026-07-08T10:05:00Z",
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
            latest_telemetry_at: "2026-07-08T10:04:00Z",
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
        latest_telemetry_at: "2026-07-08T10:04:00Z",
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
      snapshot_at: "2026-07-08T10:04:00Z",
      surfaces: {
        portfolio_book: { status: "healthy" },
        runtime_telemetry: { status: "healthy" },
      },
    },
    page_info: { next_page_token: null, page_size: 50, total: 1 },
    ...overrides,
  };
}

function arrangeLoaded(
  aggregate: TradingRoomAggregate = baseAggregate,
  attribution: TradingRoomPerformanceAttributionResponse = attributionResponse(),
  decisionEvents: TradingDecisionEvent[] = [{ decision_event_id: "evt-1" } as TradingDecisionEvent],
) {
  tradingRoomMocks.getTradingRoom.mockResolvedValue(aggregate);
  tradingRoomMocks.getTradingRoomPerformanceAttribution.mockResolvedValue(attribution);
  tradingRoomMocks.listDecisionEvents.mockResolvedValue({ etag: '"events"', items: decisionEvents });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StrategyPerformancePage", () => {
  it("renders live strategy attribution, source health, and no placeholder copy", async () => {
    arrangeLoaded();

    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "策略執行與績效" })).toBeDefined();
    expect(screen.getAllByText("Breakout Alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,250").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-4.20%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2/3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("即時歸因").length).toBeGreaterThan(0);
    expect(screen.getByText("portfolio_book")).toBeDefined();
    expect(screen.getByText(/read_only_performance_attribution/)).toBeDefined();
    expect(screen.queryByText(/coming soon|即將推出/i)).toBeNull();
    expect(tradingRoomMocks.getTradingRoomPerformanceAttribution).toHaveBeenCalledWith({
      pageSize: 50,
      period: "latest",
    });
  });

  it("keeps Trading Room strategies visible when attribution is missing for them", async () => {
    arrangeLoaded(
      {
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
      },
      attributionResponse(),
    );

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
        metrics: { total_pnl: 0, total_trades: 6841 },
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
    expect(screen.getByTestId("performance-row-attribution-row-unassigned-description").textContent).toContain(
      "無法連結至具名交易操盤室策略",
    );
  });

  it("distinguishes measured zero from values the BFF did not report in both list and table", async () => {
    const attribution = attributionResponse();
    attribution.data.items = [
      {
        ...attribution.data.items[0],
        metrics: {
          ...attribution.data.items[0].metrics,
          total_pnl: 0,
          total_trades: undefined,
        },
      },
    ];
    arrangeLoaded(baseAggregate, attribution);

    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    await screen.findAllByText("Breakout Alpha");
    
    // Both list and table should render zero PNL and unreported total_trades
    const zeros = screen.getAllByTitle("已量測：零");
    expect(zeros.length).toBeGreaterThanOrEqual(2); // one in list, one in table, one in top summary card too!
    zeros.forEach((zero) => {
      expect(zero.textContent).toBe("$0");
      expect(zero.getAttribute("data-metric-state")).toBe("measured");
    });

    const unreporteds = screen.getAllByTitle("BFF 未回報量測值");
    expect(unreporteds.length).toBeGreaterThanOrEqual(2); // one in list, one in table, one in top summary card too!
    unreporteds.forEach((unreported) => {
      expect(unreported.textContent).toBe("未回報");
      expect(unreported.getAttribute("data-metric-state")).toBe("not-reported");
    });
  });

  it("shows the live BFF error state without rendering fallback rows", async () => {
    tradingRoomMocks.getTradingRoom.mockRejectedValue(new Error("AUTH_REQUIRED"));
    tradingRoomMocks.getTradingRoomPerformanceAttribution.mockResolvedValue(attributionResponse());
    tradingRoomMocks.listDecisionEvents.mockResolvedValue({ etag: null, items: [] });

    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findByText("無法取得即時績效資料。")).toBeDefined();
    expect(screen.getByText("AUTH_REQUIRED")).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText("Breakout Alpha")).toBeNull();
    });
  });

  it("supports period changes and updates the query parameters", async () => {
    arrangeLoaded();
    const { container } = render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    await screen.findAllByText("Breakout Alpha");

    const select = container.querySelector("select");
    expect(select).toBeDefined();
    if (select) {
      fireEvent.change(select, { target: { value: "7d" } });
      await waitFor(() => {
        expect(tradingRoomMocks.getTradingRoomPerformanceAttribution).toHaveBeenCalledWith({
          pageSize: 50,
          period: "7d",
        });
      });
    }
  });

  it("supports tab switching to Interventions and Execution History", async () => {
    arrangeLoaded();
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    await screen.findAllByText("Breakout Alpha");

    // Click on Interventions tab
    const intvButton = screen.getByText("干預追蹤");
    fireEvent.click(intvButton);
    expect(screen.getByText("過去 20 筆候選的處理結果")).toBeDefined();
    expect(screen.getByText("主動加碼 (未達訊號條件)")).toBeDefined();

    // Click on Execution History tab
    const histButton = screen.getByText("執行歷史");
    fireEvent.click(histButton);
    expect(screen.getByText("日期")).toBeDefined();
    expect(screen.getByText("台積電")).toBeDefined();
    expect(screen.getByText("聯電")).toBeDefined();
  });

  it("keeps one explicit narrow pane active while preserving every performance task", async () => {
    arrangeLoaded();
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    await screen.findAllByText("Breakout Alpha");
    const decisionPane = screen.getByTestId("performance-decision-pane");
    const outcomePane = screen.getByTestId("performance-outcome-pane");
    const strategyPane = screen.getByTestId("performance-strategy-pane");

    expect(decisionPane.getAttribute("data-mobile-pane-hidden")).toBe("false");
    expect(outcomePane.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(strategyPane.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(screen.getByTestId("performance-mobile-priority").textContent).toContain("Breakout Alpha");

    fireEvent.click(screen.getByRole("button", { name: "Selected outcome" }));
    expect(decisionPane.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(outcomePane.getAttribute("data-mobile-pane-hidden")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Strategies" }));
    expect(outcomePane.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(strategyPane.getAttribute("data-mobile-pane-hidden")).toBe("false");
  });

  it("supports applying Servant suggestions with interactive toasts", async () => {
    arrangeLoaded();
    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    await screen.findAllByText("Breakout Alpha");

    const applyButton = screen.getAllByText("套用")[0];
    fireEvent.click(applyButton);
    expect(screen.getByText("套用調整建議成功！已送至策略工坊")).toBeDefined();
    expect(screen.getByText("已套用")).toBeDefined();
  });
});
