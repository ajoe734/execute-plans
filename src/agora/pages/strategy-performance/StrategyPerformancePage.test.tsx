import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StrategyPerformancePage } from "./StrategyPerformancePage";
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

    expect(await screen.findByRole("heading", { name: "Strategy Performance" })).toBeDefined();
    expect(screen.getByText("Breakout Alpha")).toBeDefined();
    expect(screen.getAllByText("$1,250").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-4.20%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2/3").length).toBeGreaterThan(0);
    expect(screen.getByText("live attribution")).toBeDefined();
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

    expect(await screen.findByText("Carry Beta")).toBeDefined();
    expect(screen.getByText("missing attribution")).toBeDefined();
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

    const named = await screen.findByText("Breakout Alpha");
    const unassigned = screen.getByText("Unassigned");
    expect(named.compareDocumentPosition(unassigned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("performance-row-attribution-row-unassigned-description").textContent).toContain(
      "could not link to a named Trading Room strategy",
    );
  });

  it("distinguishes measured zero from values the BFF did not report", async () => {
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

    await screen.findByText("Breakout Alpha");
    const zero = screen.getByTitle("Measured value: zero");
    const unreported = screen.getByTitle("No measurement was reported by the BFF");
    expect(zero.textContent).toBe("$0");
    expect(zero.getAttribute("data-metric-state")).toBe("measured");
    expect(unreported.textContent).toBe("not reported");
    expect(unreported.getAttribute("data-metric-state")).toBe("not-reported");
  });

  it("shows the live BFF error state without rendering fallback rows", async () => {
    tradingRoomMocks.getTradingRoom.mockRejectedValue(new Error("AUTH_REQUIRED"));
    tradingRoomMocks.getTradingRoomPerformanceAttribution.mockResolvedValue(attributionResponse());
    tradingRoomMocks.listDecisionEvents.mockResolvedValue({ etag: null, items: [] });

    render(<MemoryRouter><StrategyPerformancePage /></MemoryRouter>);

    expect(await screen.findByText("Live performance data unavailable")).toBeDefined();
    expect(screen.getByText("AUTH_REQUIRED")).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText("Breakout Alpha")).toBeNull();
    });
  });
});
