import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  TradingRoomWorkspace,
  WidgetRevisionProposal,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import {
  acceptWidgetRevisionProposal,
  createWidgetRevisionProposal,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError, type BffErrorEnvelope } from "@/lib/bff-v1/errors";
import { WorkspaceWidgetRevisionDrawer } from "./WorkspaceWidgetRevisionDrawer";

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  acceptWidgetRevisionProposal: vi.fn(),
  createWidgetRevisionProposal: vi.fn(),
}));

vi.mock("echarts-for-react", async () => {
  const ReactModule = await import("react");
  return {
    default: () => ReactModule.createElement("div", { "data-testid": "mock-echarts" }),
  };
});

vi.mock("recharts", async () => {
  const ReactModule = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("div", null, children);
  const Leaf = () => ReactModule.createElement("span");
  return {
    Area: Leaf,
    AreaChart: Box,
    Bar: Leaf,
    BarChart: Box,
    CartesianGrid: Leaf,
    Line: Leaf,
    LineChart: Box,
    ResponsiveContainer: Box,
    Tooltip: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
  };
});

const mockCreateRevision = vi.mocked(createWidgetRevisionProposal);
const mockAcceptRevision = vi.mocked(acceptWidgetRevisionProposal);

function sampleWidget(overrides: Partial<TradingRoomWidgetSpec> = {}): TradingRoomWidgetSpec {
  return {
    id: "widget-strat-status",
    widgetType: "strategy_status_summary",
    title: "Strategy Status",
    purpose: "Monitor strategy status",
    whyIncluded: "Primary health monitor",
    dataSource: "agora.strategy.summary",
    dataAvailability: "complete",
    query: { filters: { strategy_id: "strat-001" }, limit: 20 },
    chartSpec: {
      spec_version: "1.0",
      kind: "metric",
      encodings: {
        y: { field: "status", type: "nominal" },
        label: { field: "strategy_id", type: "nominal" },
      },
    },
    interactions: [{ kind: "open_strategy" }, { kind: "request_widget_revision" }],
    placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 12, height: 8 },
    sensitivity: "user_private",
    visible: true,
    ...overrides,
  };
}

function sampleWorkspace(): TradingRoomWorkspace {
  const widget = sampleWidget();
  return {
    id: "ws-001",
    userId: "user-001",
    strategyId: "strat-001",
    strategyVersion: "v1.0",
    dashboardVersion: 1,
    activeViewId: "view-overview",
    status: "active",
    generatedBy: "trading_servant",
    createdAt: "2026-07-14T02:00:00Z",
    updatedAt: "2026-07-14T02:00:00Z",
    views: [
      {
        id: "view-overview",
        title: "Overview View",
        purpose: "Overview purpose",
        order: 1,
        layoutTemplate: "grid",
        widgetCount: 1,
        dataAvailability: "complete",
        rationale: "View rationale",
        warnings: ["Regime change warning"],
        widgets: [widget],
      },
    ],
  };
}

function sampleProposal(): WidgetRevisionProposal {
  const beforeSpec = sampleWidget();
  const proposedSpec: TradingRoomWidgetSpec = {
    ...beforeSpec,
    title: "Strategy Status Heatmap",
    chartSpec: {
      spec_version: "1.0",
      kind: "heatmap",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "status", type: "nominal" },
        value: { field: "count", type: "quantitative" },
      },
    },
  };
  return {
    id: "wrp-001",
    workspaceId: "ws-001",
    viewId: "view-overview",
    widgetId: "widget-strat-status",
    instruction: "改成分點為列、日期為欄的熱圖",
    beforeSpec,
    proposedSpec,
    rationale: "Heatmap provides a clearer overview across time and status.",
    warnings: ["Some sparse cells may have missing telemetry."],
    dataAvailability: "partial",
    status: "preview",
  };
}

function makeBffError(status: number, code: string, message: string): BffError {
  const envelope: BffErrorEnvelope = {
    error: {
      code: code as any,
      correlationId: `corr-${status}`,
      i18nKey: `errors.${code}`,
      message,
      retryable: false,
      userActionable: status >= 400 && status < 500,
    },
  };
  return new BffError(status, envelope);
}

describe("WorkspaceWidgetRevisionDrawer", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders widget context, placement, sensitivity, and quick instruction chips", () => {
    const workspace = sampleWorkspace();
    const widget = workspace.views[0].widgets[0];
    const view = workspace.views[0];

    render(
      <WorkspaceWidgetRevisionDrawer
        currentEtag="etag-123"
        onClose={vi.fn()}
        onRevisionAccepted={vi.fn()}
        open
        view={view}
        widget={widget}
        workspace={workspace}
      />
    );

    expect(screen.getByTestId("workspace-widget-revision-drawer")).toBeTruthy();
    expect(screen.getByText("交代僕人修改 Widget")).toBeTruthy();
    expect(screen.getByTestId("workspace-widget-revision-context")).toBeTruthy();
    expect(screen.getAllByText("Strategy Status").length).toBeGreaterThan(0);
    expect(screen.getByText(/使用者私有/)).toBeTruthy();
    expect(screen.getByText("改成分點為列、日期為欄的熱圖")).toBeTruthy();
  });

  it("submits instruction to BFF and renders proposal diff and preview upon success", async () => {
    const workspace = sampleWorkspace();
    const widget = workspace.views[0].widgets[0];
    const view = workspace.views[0];
    const proposal = sampleProposal();

    mockCreateRevision.mockResolvedValue({
      proposal,
      etag: "rev-etag-1",
    });

    render(
      <WorkspaceWidgetRevisionDrawer
        currentEtag="etag-123"
        onClose={vi.fn()}
        onRevisionAccepted={vi.fn()}
        open
        view={view}
        widget={widget}
        workspace={workspace}
      />
    );

    const input = screen.getByTestId("workspace-widget-revision-input");
    fireEvent.change(input, { target: { value: "改成分點為列、日期為欄的熱圖" } });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));

    await waitFor(() => {
      expect(mockCreateRevision).toHaveBeenCalledWith(
        "ws-001",
        "widget-strat-status",
        {
          instruction: "改成分點為列、日期為欄的熱圖",
          viewId: "view-overview",
        },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    expect(await screen.findByTestId("workspace-widget-revision-proposal")).toBeTruthy();
    expect(screen.getByText("僕人準備這樣調整")).toBeTruthy();
    expect(screen.getByText("Heatmap provides a clearer overview across time and status.")).toBeTruthy();
    expect(screen.getByTestId("workspace-widget-before-after-diff")).toBeTruthy();
    expect(screen.getByTestId("workspace-widget-diff-chart-spec")).toBeTruthy();
  });

  it("applies accepted revision proposal with If-Match ETag and notifies parent", async () => {
    const workspace = sampleWorkspace();
    const widget = workspace.views[0].widgets[0];
    const view = workspace.views[0];
    const proposal = sampleProposal();
    const onRevisionAccepted = vi.fn();
    const onClose = vi.fn();

    mockCreateRevision.mockResolvedValue({
      proposal,
      etag: "rev-etag-1",
    });
    mockAcceptRevision.mockResolvedValue({
      workspace: { ...workspace, dashboardVersion: 2 },
      etag: "etag-456",
      proposal: { ...proposal, status: "accepted" },
      appliedAction: "apply",
    });

    render(
      <WorkspaceWidgetRevisionDrawer
        currentEtag="etag-123"
        onClose={onClose}
        onRevisionAccepted={onRevisionAccepted}
        open
        view={view}
        widget={widget}
        workspace={workspace}
      />
    );

    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "改成分點為列、日期為欄的熱圖" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));

    const applyButton = await screen.findByTestId("workspace-widget-revision-apply");
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockAcceptRevision).toHaveBeenCalledWith(
        "wrp-001",
        { acceptanceAction: "apply", copyWidgetId: undefined },
        { ifMatch: "etag-123", idempotencyKey: expect.any(String) },
      );
    });

    expect(onRevisionAccepted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("handles keep_original_add_modified_copy acceptance action", async () => {
    const workspace = sampleWorkspace();
    const widget = workspace.views[0].widgets[0];
    const view = workspace.views[0];
    const proposal = sampleProposal();
    const onRevisionAccepted = vi.fn();
    const onClose = vi.fn();

    mockCreateRevision.mockResolvedValue({
      proposal,
      etag: "rev-etag-1",
    });
    mockAcceptRevision.mockResolvedValue({
      workspace: { ...workspace, dashboardVersion: 2 },
      etag: "etag-456",
      proposal: { ...proposal, status: "accepted" },
      appliedAction: "keep_original_add_modified_copy",
      copiedWidgetId: "widget-copy-1",
    });

    render(
      <WorkspaceWidgetRevisionDrawer
        currentEtag="etag-123"
        onClose={onClose}
        onRevisionAccepted={onRevisionAccepted}
        open
        view={view}
        widget={widget}
        workspace={workspace}
      />
    );

    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "拆成兩張" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));

    const keepCopyButton = await screen.findByTestId("workspace-widget-revision-keep-copy");
    fireEvent.click(keepCopyButton);

    await waitFor(() => {
      expect(mockAcceptRevision).toHaveBeenCalledWith(
        "wrp-001",
        expect.objectContaining({ acceptanceAction: "keep_original_add_modified_copy" }),
        expect.objectContaining({ ifMatch: "etag-123" }),
      );
    });
  });

  it("surfaces typed BffError statuses and error messages honestly", async () => {
    const workspace = sampleWorkspace();
    const widget = workspace.views[0].widgets[0];
    const view = workspace.views[0];

    mockCreateRevision.mockRejectedValue(
      makeBffError(403, "PERMISSION_DENIED", "Access to widget revision is denied for read-only roles."),
    );

    render(
      <WorkspaceWidgetRevisionDrawer
        currentEtag="etag-123"
        onClose={vi.fn()}
        onRevisionAccepted={vi.fn()}
        open
        view={view}
        widget={widget}
        workspace={workspace}
      />
    );

    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "嘗試修改" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));

    const errorAlert = await screen.findByTestId("workspace-widget-revision-error");
    expect(errorAlert.getAttribute("data-error-status")).toBe("403");
    expect(errorAlert.getAttribute("data-error-code")).toBe("PERMISSION_DENIED");
    expect(errorAlert.textContent).toContain("目前權限或範圍無法建立這個 Widget revision proposal。");
  });

  it("disables submit and shows warning when disabledReason is provided", () => {
    const workspace = sampleWorkspace();
    const widget = workspace.views[0].widgets[0];
    const view = workspace.views[0];

    render(
      <WorkspaceWidgetRevisionDrawer
        currentEtag="etag-123"
        disabledReason="Workspace is in read-only audit mode"
        onClose={vi.fn()}
        onRevisionAccepted={vi.fn()}
        open
        view={view}
        widget={widget}
        workspace={workspace}
      />
    );

    expect(screen.getByTestId("workspace-widget-revision-disabled").textContent).toContain("Workspace is in read-only audit mode");
    expect((screen.getByTestId("workspace-widget-revision-submit") as HTMLButtonElement).disabled).toBe(true);
  });
});
