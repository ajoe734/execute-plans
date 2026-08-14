import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TradingRoomWorkspace } from "@/lib/bff-v1/agora/tradingRoomTypes";
import type { TradingDecisionEvent } from "@/lib/bff-v1/agora/tradingRoom";
import { patchTradingRoomWorkspaceLayout, rollbackTradingRoomWorkspaceVersion } from "@/lib/bff-v1/agora/tradingRoom";
import { WorkspaceGridEditor } from "./WorkspaceGridEditor";

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  listTradingRoomWorkspaceVersions: vi.fn().mockResolvedValue([
    {
      id: "ver-1",
      userId: "user-1",
      strategyId: "strat-1",
      strategyVersion: "v1.0",
      dashboardVersion: 1,
      generatedBy: "trading_servant",
      previousVersionId: null,
      changeSummary: "Initial version",
      views: [],
      createdAt: "2026-07-14T02:00:00Z",
      status: "active",
      changeLog: {
        changedAt: "2026-07-14T02:00:00Z",
        changedBy: "trading_servant",
        reason: "Initial baseline",
        affectedViews: ["strategy_overview"],
        affectedWidgets: ["widget-1"],
        effectEvaluation: "baseline",
        rollbackAvailable: false,
      },
    },
    {
      id: "ver-0",
      userId: "user-1",
      strategyId: "strat-1",
      strategyVersion: "v1.0",
      dashboardVersion: 0,
      generatedBy: "trading_servant",
      previousVersionId: null,
      changeSummary: "Seed layout",
      views: [],
      createdAt: "2026-07-13T02:00:00Z",
      status: "superseded",
      changeLog: {
        changedAt: "2026-07-13T02:00:00Z",
        changedBy: "trading_servant",
        reason: "Seed layout",
        affectedViews: ["strategy_overview"],
        affectedWidgets: ["widget-1"],
        effectEvaluation: "seed",
        rollbackAvailable: true,
      },
    },
  ]),
  patchTradingRoomWorkspaceLayout: vi.fn().mockImplementation((id, body, options) => {
    return Promise.resolve({
      etag: "new-etag-456",
      workspace: {
        id,
        userId: "user-1",
        strategyId: "strat-1",
        strategyVersion: "v1.0",
        dashboardVersion: 2,
        activeViewId: "strategy_overview",
        status: "active",
        generatedBy: "user_modified",
        createdAt: "2026-07-14T02:00:00Z",
        updatedAt: "2026-07-14T02:30:00Z",
        views: [
          {
            id: "strategy_overview",
            title: "Strategy overview",
            purpose: "overview test",
            order: 1,
            layoutTemplate: "grid",
            widgetCount: 2,
            dataAvailability: "complete",
            widgets: [
              {
                id: "widget-1",
                widgetType: "strategy_status_summary",
                title: "Strategy Status",
                purpose: "status purpose",
                whyIncluded: "why status",
                dataSource: "agora.strategy.summary",
                dataAvailability: "complete",
                query: { filters: {} },
                chartSpec: {
                  spec_version: "1.0",
                  kind: "metric",
                  encodings: {
                    y: { field: "value", type: "quantitative" },
                    label: { field: "label", type: "nominal" },
                  },
                },
                interactions: [],
                placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
                minSize: { width: 2, height: 2 },
                maxSize: { width: 12, height: 8 },
                sensitivity: "user_private",
                visible: true,
              },
            ],
          },
        ],
      },
    });
  }),
  rollbackTradingRoomWorkspaceVersion: vi.fn().mockImplementation((id, versionId) => {
    return Promise.resolve({
      etag: "rollback-etag-789",
      workspace: {
        id,
        userId: "user-1",
        strategyId: "strat-1",
        strategyVersion: "v1.0",
        dashboardVersion: 0,
        activeViewId: "strategy_overview",
        status: "active",
        generatedBy: "trading_servant",
        createdAt: "2026-07-14T02:00:00Z",
        updatedAt: "2026-07-14T02:40:00Z",
        views: [],
      },
    });
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("react-grid-layout", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement("div", { "data-testid": "mock-grid-layout" }, children),
  };
});
vi.mock("react-grid-layout/css/styles.css", () => ({}));
vi.mock("react-resizable/css/styles.css", () => ({}));

vi.mock("echarts-for-react", async () => {
  const ReactModule = await import("react");
  return {
    default: () => ReactModule.createElement("div", { "data-testid": "mock-echarts" }),
  };
});

vi.mock("recharts", async () => {
  const ReactModule = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("div", null, children);
  return {
    Area: () => null,
    AreaChart: Box,
    Bar: () => null,
    BarChart: Box,
    CartesianGrid: () => null,
    Line: () => null,
    LineChart: Box,
    ResponsiveContainer: Box,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

const dummyWorkspace: TradingRoomWorkspace = {
  id: "ws-test-123",
  userId: "user-1",
  strategyId: "strat-1",
  strategyVersion: "v1.0",
  dashboardVersion: 1,
  activeViewId: "strategy_overview",
  status: "active",
  generatedBy: "trading_servant",
  createdAt: "2026-07-14T02:00:00Z",
  updatedAt: "2026-07-14T02:00:00Z",
  views: [
    {
      id: "strategy_overview",
      title: "Strategy overview",
      purpose: "overview test",
      order: 1,
      layoutTemplate: "grid",
      widgetCount: 1,
      dataAvailability: "complete",
      widgets: [
        {
          id: "widget-1",
          widgetType: "strategy_status_summary",
          title: "Strategy Status",
          purpose: "status purpose",
          whyIncluded: "why status",
          dataSource: "agora.strategy.summary",
          dataAvailability: "complete",
          query: { filters: {} },
          chartSpec: {
            spec_version: "1.0",
            kind: "metric",
            encodings: {
              y: { field: "value", type: "quantitative" },
              label: { field: "label", type: "nominal" },
            },
          },
          interactions: [{ kind: "request_widget_revision" }],
          placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
          minSize: { width: 2, height: 2 },
          maxSize: { width: 12, height: 8 },
          sensitivity: "user_private",
          visible: true,
        },
      ],
    },
  ],
};

const mockEvents: TradingDecisionEvent[] = [
  {
    spec_version: "1.0",
    decision_event_id: "evt-001",
    event_kind: "entry",
    origin: "strategy_signal",
    strategy_id: "strat-1",
    strategy_spec_registry_id: "reg-1",
    candidate_ref: "cand-apple",
    subject: { symbol: "AAPL" },
    state: "triggered",
    triggered_at: "2026-07-14T02:05:00Z",
    confidence: { value: 0.92, basis: "model", calibration_state: "calibrated" },
    probability: { target_outcome: "upside", horizon: "20d", value: 0.75 },
    expected_value: { horizon: "20d", unit: "pct_return", gross: 0.08, cost: 0.01, net: 0.07, downside: -0.03 },
    rationale: [],
    risk_notes: [],
    evidence_refs: [],
    invalidation: { conditions: [], current_state: "valid" },
    suggested_action: "enter",
    no_order_route_proof: "agora_decision_support_only",
  },
];

describe("WorkspaceGridEditor component", () => {
  function setViewportWidth(width: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width, writable: true });
    act(() => window.dispatchEvent(new Event("resize")));
  }

  beforeEach(() => {
    setViewportWidth(1280);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders views and control strip with correct reactive states", () => {
    render(
      <WorkspaceGridEditor
        dataCutoff="2026-07-14T02:10:00Z"
        initialEtag="etag-123"
        initialWorkspace={dummyWorkspace}
        riskSummary={{
          active_circuit_breakers: [],
          correlation_cluster_exposure_pct: 12,
          gross_exposure_pct: 60,
          leverage_ratio: 1.0,
          max_drawdown_limit_pct: 15,
          net_exposure_pct: 40,
          portfolio_risk_budget_pct: 45,
          tail_risk_indicator: "normal",
        }}
        strategy={{
          available_views: ["overview"],
          data_status: "complete",
          last_signal_time: "2026-07-14T02:05:00Z",
          monitoring_mode: "continuous",
          name: "Winner Branch Test",
          pending_event_counts: { add: 0, entry: 1, exit: 0, reduce: 0, review: 0 },
          pipeline_phase: "live_monitoring",
          readiness_score: 95,
          state: "live_ready",
          strategy_id: "strat-1",
          strategy_version: "v1.0",
          symbol: "AAPL",
        }}
      />,
    );

    expect(screen.getByText("Winner Branch Test")).toBeTruthy();
    expect(screen.getByText("live_ready")).toBeTruthy();
    expect(screen.getByText("資料切齊: 2026-07-14T02:10:00Z")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("renders honest empty state notice when there is no chart data", () => {
    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={dummyWorkspace}
      />,
    );

    expect(screen.getByTestId("chart-render-notice")).toBeTruthy();
    expect(screen.getByTestId("chart-render-notice").textContent).toContain("AWAITING TELEMETRY");
  });

  it("wires events data to widgets correctly", () => {
    const workspaceWithQueue: TradingRoomWorkspace = {
      ...dummyWorkspace,
      views: [
        {
          ...dummyWorkspace.views[0],
          widgets: [
            {
              id: "widget-queue",
              widgetType: "signal_decision_queue",
              title: "Decision Queue",
              purpose: "purpose",
              whyIncluded: "why",
              dataSource: "agora.trading.events",
              dataAvailability: "complete",
              query: { filters: {} },
              chartSpec: {
                spec_version: "1.0",
                kind: "table",
                encodings: {
                  x: { field: "event_id", type: "nominal" },
                  y: { field: "instrument", type: "nominal" },
                  color: { field: "status", type: "nominal" },
                },
              },
              interactions: [],
              placement: { x: 0, y: 0, width: 6, height: 4, minWidth: 2, minHeight: 2 },
              minSize: { width: 2, height: 2 },
              maxSize: { width: 12, height: 8 },
              sensitivity: "user_private",
              visible: true,
            },
          ],
        },
      ],
    };

    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={workspaceWithQueue}
        workspaceEvents={mockEvents}
      />,
    );

    expect(screen.getByTestId("chart-renderer-builtin")).toBeTruthy();
    expect(screen.getByText("EVENT_ID")).toBeTruthy();
    expect(screen.getByText("INSTRUMENT")).toBeTruthy();
    expect(screen.getByText("STATUS")).toBeTruthy();
    expect(screen.getByText("evt-001")).toBeTruthy();
    expect(screen.getByText("AAPL")).toBeTruthy();
  });

  it("projects widgets as ordered stacked cards below 900px without changing desktop coordinates", () => {
    setViewportWidth(800);
    render(<WorkspaceGridEditor initialEtag="etag-123" initialWorkspace={dummyWorkspace} />);

    expect(screen.getByTestId("workspace-grid-stacked")).toBeTruthy();
    expect(screen.queryByTestId("mock-grid-layout")).toBeNull();
  });

  it("keeps the draggable grid at and above the 900px breakpoint", () => {
    setViewportWidth(1280);
    render(<WorkspaceGridEditor initialEtag="etag-123" initialWorkspace={dummyWorkspace} />);

    expect(screen.getByTestId("mock-grid-layout")).toBeTruthy();
    expect(screen.queryByTestId("workspace-stacked-view")).toBeNull();
  });

  it("opens the revision drawer when clicking header ask-servant button", async () => {
    render(<WorkspaceGridEditor initialEtag="etag-123" initialWorkspace={dummyWorkspace} />);
    const trigger = screen.getByTestId("workspace-header-ask-servant");
    fireEvent.click(trigger);

    expect(await screen.findByTestId("workspace-widget-revision-drawer")).toBeTruthy();
    expect(screen.getByText("交代僕人修改 Widget")).toBeTruthy();
  });

  it("opens the widget library dialog in edit mode and adds a registered widget", async () => {
    render(<WorkspaceGridEditor initialEtag="etag-123" initialWorkspace={dummyWorkspace} />);
    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));

    const addBtn = screen.getByTestId("workspace-add-widget-button");
    fireEvent.click(addBtn);

    const library = await screen.findByTestId("workspace-add-widget-library");
    expect(library).toBeTruthy();

    const addRegimeProb = screen.getByTestId("workspace-add-widget-regime_probability");
    fireEvent.click(addRegimeProb);

    expect(screen.getByTestId("workspace-save-layout")).toBeTruthy();
    expect((screen.getByTestId("workspace-save-layout") as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves modified layout as new version calling patchTradingRoomWorkspaceLayout", async () => {
    const onWorkspaceChange = vi.fn();
    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={dummyWorkspace}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );

    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));
    fireEvent.click(screen.getByTestId("workspace-add-widget-button"));
    const addRegimeProb = await screen.findByTestId("workspace-add-widget-regime_probability");
    fireEvent.click(addRegimeProb);

    const saveBtn = screen.getByTestId("workspace-save-layout");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(patchTradingRoomWorkspaceLayout).toHaveBeenCalledWith(
        "ws-test-123",
        expect.objectContaining({ operations: expect.any(Array) }),
        expect.objectContaining({ ifMatch: "etag-123" }),
      );
    });

    expect(onWorkspaceChange).toHaveBeenCalled();
  });

  it("handles rollback calling rollbackTradingRoomWorkspaceVersion", async () => {
    const onWorkspaceChange = vi.fn();
    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={dummyWorkspace}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );

    const rollbackBtn = await screen.findByTestId("workspace-rollback-ver-0");
    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(rollbackTradingRoomWorkspaceVersion).toHaveBeenCalledWith(
        "ws-test-123",
        "ver-0",
        expect.objectContaining({ reason: "rollback to dashboard version 0" }),
        expect.objectContaining({ ifMatch: "etag-123" }),
      );
    });

    expect(onWorkspaceChange).toHaveBeenCalled();
  });
});
