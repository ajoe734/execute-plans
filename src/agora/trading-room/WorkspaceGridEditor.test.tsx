import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkspaceGridEditor } from "./WorkspaceGridEditor";
import type { TradingRoomWorkspace } from "@/lib/bff-v1/agora/tradingRoomTypes";
import type { TradingDecisionEvent } from "@/lib/bff-v1/agora/tradingRoom";

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  listTradingRoomWorkspaceVersions: vi.fn().mockResolvedValue([]),
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
              {
                id: "widget-new",
                widgetType: "signal_decision_queue",
                title: "Proposed Widget",
                purpose: "proposed",
                whyIncluded: "proposed",
                dataSource: "agora.trading.events",
                dataAvailability: "complete",
                query: { filters: {} },
                chartSpec: {
                  spec_version: "1.0",
                  kind: "table",
                  encodings: {
                    x: { field: "event_id", type: "nominal" },
                  },
                },
                interactions: [],
                placement: { x: 0, y: 3, width: 6, height: 3, minWidth: 2, minHeight: 2 },
                minSize: { width: 2, height: 2 },
                maxSize: { width: 12, height: 8 },
                sensitivity: "user_private",
                visible: true,
              }
            ]
          }
        ]
      }
    });
  }),
  rollbackTradingRoomWorkspaceVersion: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("react-grid-layout", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ children }: { children: React.ReactNode }) => ReactModule.createElement("div", { "data-testid": "mock-grid-layout" }, children)
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
          interactions: [],
          placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
          minSize: { width: 2, height: 2 },
          maxSize: { width: 12, height: 8 },
          sensitivity: "user_private",
          visible: true,
        }
      ]
    }
  ]
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
    no_order_route_proof: "agora_decision_support_only"
  }
];

describe("WorkspaceGridEditor component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders views and control strip with correct reactive states", () => {
    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={dummyWorkspace}
        strategy={{
          strategy_id: "strat-1",
          strategy_spec_registry_id: "reg-1",
          title: "Winner Branch Test",
          readiness_state: "ready",
          monitoring_state: "monitoring",
          pending_event_counts: { entry: 1 }
        }}
        riskSummary={{ state: "watch", alerts: ["High correlation detected"] }}
        dataCutoff="2026-07-14T02:10:00Z"
      />
    );

    expect(screen.getByText("Winner Branch Test")).toBeTruthy();
    expect(screen.getByText(/ready/i)).toBeTruthy();
    expect(screen.getByText("● Data: Complete (02:10)")).toBeTruthy();
    expect(screen.getByText("Risk: watch")).toBeTruthy();
    expect(screen.getByText("1 Pending Decisions")).toBeTruthy();
  });

  it("renders honest unavailable state notice when there is no data", () => {
    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={dummyWorkspace}
      />
    );

    expect(screen.getByText("AWAITING TELEMETRY")).toBeTruthy();
    expect(screen.getByText("No status summary or progress logs have been synchronized.")).toBeTruthy();
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
                  color: { field: "status", type: "nominal" }
                }
              },
              interactions: [],
              placement: { x: 0, y: 0, width: 6, height: 4, minWidth: 2, minHeight: 2 },
              minSize: { width: 2, height: 2 },
              maxSize: { width: 12, height: 8 },
              sensitivity: "user_private",
              visible: true
            }
          ]
        }
      ]
    };

    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={workspaceWithQueue}
        workspaceEvents={mockEvents}
      />
    );

    expect(screen.getByTestId("chart-renderer-builtin")).toBeTruthy();
    expect(screen.getByText("EVENT_ID")).toBeTruthy();
    expect(screen.getByText("INSTRUMENT")).toBeTruthy();
    expect(screen.getByText("STATUS")).toBeTruthy();

    expect(screen.getByText("evt-001")).toBeTruthy();
    expect(screen.getByText("AAPL")).toBeTruthy();
    expect(screen.getByText("triggered")).toBeTruthy();
  });

  it("handles the Servant new-widget proposal flow: accept, adjust, reject, plugin request", async () => {
    const onWorkspaceChangeMock = vi.fn();
    render(
      <WorkspaceGridEditor
        initialEtag="etag-123"
        initialWorkspace={dummyWorkspace}
        onWorkspaceChange={onWorkspaceChangeMock}
      />
    );

    // 1. Click edit mode toggle
    const editToggle = screen.getByTestId("workspace-edit-mode-toggle");
    fireEvent.click(editToggle);

    // 2. Open widget library drawer
    const addWidgetBtn = screen.getByTestId("workspace-add-widget-button");
    fireEvent.click(addWidgetBtn);

    // 3. Find input and type command
    const commandInput = screen.getByTestId("workspace-ask-servant-widget-input");
    const submitBtn = screen.getByTestId("workspace-ask-servant-widget-submit");

    fireEvent.change(commandInput, { target: { value: "新增報酬折線圖" } });
    fireEvent.click(submitBtn);

    // Wait for modal to render
    const modal = await screen.findByTestId("workspace-widget-proposal-modal");
    expect(modal).toBeTruthy();
    expect(screen.getByText("Proposed Widget Preview:")).toBeTruthy();

    // Test Adjust button
    fireEvent.click(screen.getByTestId("workspace-widget-proposal-adjust"));
    expect(screen.getByTestId("workspace-widget-proposal-adjust-input")).toBeTruthy();

    // Type adjustment and apply
    fireEvent.change(screen.getByTestId("workspace-widget-proposal-adjust-input"), { target: { value: "change type to bar" } });
    fireEvent.click(screen.getByTestId("workspace-widget-proposal-adjust-submit"));

    await screen.findByText("Servant adjusted the widget spec according to your feedback.");

    // Test Plugin Request
    fireEvent.click(screen.getByTestId("workspace-widget-proposal-plugin"));
    await waitFor(() => {
      expect(screen.queryByTestId("workspace-widget-proposal-modal")).toBeNull();
    });
    expect(screen.getByText(/Frontend widget component request PLG-REQ-.* registered\./)).toBeTruthy();

    // Trigger proposal again to test Reject (drawer is already open)
    const freshCommandInput = screen.getByTestId("workspace-ask-servant-widget-input");
    const freshSubmitBtn = screen.getByTestId("workspace-ask-servant-widget-submit");
    fireEvent.change(freshCommandInput, { target: { value: "新增報酬折線圖" } });
    fireEvent.click(freshSubmitBtn);
    await screen.findByTestId("workspace-widget-proposal-modal");
    fireEvent.click(screen.getByTestId("workspace-widget-proposal-reject"));
    await waitFor(() => {
      expect(screen.queryByTestId("workspace-widget-proposal-modal")).toBeNull();
    });

    // Trigger proposal again to test Accept with auto-saving backend call (drawer is already open)
    fireEvent.change(freshCommandInput, { target: { value: "新增報酬折線圖" } });
    fireEvent.click(freshSubmitBtn);
    await screen.findByTestId("workspace-widget-proposal-modal");

    fireEvent.click(screen.getByTestId("workspace-widget-proposal-accept"));

    await waitFor(() => {
      expect(onWorkspaceChangeMock).toHaveBeenCalled();
    });

    expect(screen.getByText("🎉 New widget proposal accepted and durable layout version created successfully.")).toBeTruthy();
  });
});
