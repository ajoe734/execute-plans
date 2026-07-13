import React from "react";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layout } from "react-grid-layout";

const gridCallbacks = vi.hoisted(() => ({
  onLayoutChange: undefined as ((layout: Layout[]) => void) | undefined,
}));

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  acceptTradingRoomWorkspaceProposalWithMeta: vi.fn(),
  acceptWidgetRevisionProposal: vi.fn(),
  createTradingRoomWorkspaceProposal: vi.fn(),
  createWidgetRevisionProposal: vi.fn(),
  getTradingRoom: vi.fn(),
  listDecisionEvents: vi.fn(),
  listTradingRoomWorkspaceVersions: vi.fn(),
  patchTradingRoomWorkspaceLayout: vi.fn(),
  rollbackTradingRoomWorkspaceVersion: vi.fn(),
  decideOnEvent: vi.fn(),
}));

vi.mock("react-grid-layout", async () => {
  const ReactModule = await import("react");
  const MockGridLayout = ({
    children,
    cols: _cols,
    draggableHandle: _draggableHandle,
    isDraggable: _isDraggable,
    isResizable: _isResizable,
    onLayoutChange,
    layout,
    rowHeight: _rowHeight,
    ...rest
  }: {
    children: React.ReactNode;
    cols?: number;
    draggableHandle?: string;
    isDraggable?: boolean;
    isResizable?: boolean;
    onLayoutChange?: (layout: Layout[]) => void;
    layout?: Layout[];
    rowHeight?: number;
    [key: string]: unknown;
  }) => {
    gridCallbacks.onLayoutChange = onLayoutChange;
    return ReactModule.createElement(
      "div",
      {
        "data-layout": JSON.stringify(layout ?? []),
        "data-testid": "mock-workspace-grid-layout",
        ...rest,
      },
      children,
    );
  };
  MockGridLayout.displayName = "MockGridLayout";
  return { default: MockGridLayout };
});

vi.mock("react-grid-layout/css/styles.css", () => ({}));
vi.mock("react-resizable/css/styles.css", () => ({}));

vi.mock("@/agora/widgets/ChartSpecRenderer", () => ({
  default: ({ spec }: { spec: { kind: string } }) => (
    <div data-testid="mock-chart-spec-renderer">{spec.kind}</div>
  ),
}));

import { TradingRoomPage } from "./TradingRoomPage";
import * as tradingRoomModule from "@/lib/bff-v1/agora/tradingRoom";
import { BffError, type ErrorCode } from "@/lib/bff-v1/errors";
import type {
  ChartSpecV1,
  TradingRoomDashboardVersion,
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  TradingRoomWorkspace,
  TradingRoomWorkspaceProposal,
  WidgetRevisionProposal,
} from "@/lib/bff-v1/agora/tradingRoomTypes";

function makeBffError(status: number, code: ErrorCode, message: string): BffError {
  return new BffError(status, {
    error: {
      code,
      correlationId: "corr-test",
      i18nKey: `errors.${code}`,
      message,
      retryable: status >= 500,
      userActionable: status >= 400 && status < 500,
    },
  });
}

const MOCK_AGGREGATE = {
  spec_version: "1.0" as const,
  user_scope_ref: "scope-001",
  strategies: [
    {
      strategy_id: "strat-001",
      strategy_spec_registry_id: "reg-001",
      title: "Alpha Momentum",
      readiness_state: "ready" as const,
      monitoring_state: "monitoring" as const,
      pending_event_counts: { entry: 2, add: 0, reduce: 1, exit: 0, review: 1 },
      dashboard_recipe_id: "recipe-001",
    },
    {
      strategy_id: "strat-002",
      strategy_spec_registry_id: "reg-002",
      title: "Pairs Arbitrage",
      readiness_state: "conditional" as const,
      monitoring_state: "shadow" as const,
      pending_event_counts: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
    },
  ],
  queue_summary: { entry: 2, add: 0, reduce: 1, exit: 0, review: 1 },
  risk_summary: { state: "normal" as const },
  snapshot_at: "2026-06-22T10:00:00Z",
  data_cutoff: "2026-06-22T09:55:00Z",
};

const MOCK_DECISION_EVENT = {
  spec_version: "1.0" as const,
  decision_event_id: "evt-001",
  event_kind: "entry" as const,
  origin: "strategy_signal" as const,
  strategy_id: "strat-001",
  strategy_spec_registry_id: "reg-001",
  subject: { symbol: "AAPL", asset_class: "equity" },
  state: "pending_review" as const,
  triggered_at: "2026-06-22T09:50:00Z",
  confidence: {
    value: 0.78,
    basis: "model" as const,
    calibration_state: "calibrated" as const,
    sample_size: 120,
  },
  probability: {
    target_outcome: "price_increase_5pct",
    horizon: "5d",
    value: 0.72,
    ci_lower: 0.65,
    ci_upper: 0.79,
  },
  expected_value: {
    horizon: "5d",
    unit: "pct_return" as const,
    gross: 0.05,
    cost: 0.002,
    net: 0.048,
    downside: -0.02,
  },
  rationale: [
    { claim: "Strong momentum signal confirmed by volume.", confidence: 0.78 },
  ],
  risk_notes: [
    { severity: "watch" as const, domain: "volatility", summary: "IV elevated 10% above 30d avg" },
  ],
  evidence_refs: [
    { ref_type: "evidence_bundle" as const, ref_id: "eb-001", summary: "Momentum backtest bundle" },
  ],
  invalidation: {
    conditions: ["Gap up >5% before entry"],
    current_state: "valid" as const,
  },
  suggested_action: "enter" as const,
  suggested_size: {
    size_hint: "medium" as const,
    portfolio_pct: 0.04,
    non_binding: true as const,
  },
  data_cutoff: "2026-06-22T09:55:00Z",
  no_order_route_proof: "agora_decision_support_only" as const,
};

function chartSpec(kind: ChartSpecV1["kind"], encodings: ChartSpecV1["encodings"]): ChartSpecV1 {
  return { spec_version: "1.0", kind, encodings };
}

function widget(
  id: string,
  title: string,
  widgetType: string,
  dataSource: string,
  chart: ChartSpecV1,
  interactionKind: TradingRoomWidgetSpec["interactions"][number]["kind"],
  placement: Pick<TradingRoomWidgetSpec["placement"], "x" | "y" | "width" | "height">,
): TradingRoomWidgetSpec {
  return {
    id,
    widgetType,
    title,
    purpose: `${title} purpose`,
    whyIncluded: `${title} is required for the V11 proposal.`,
    dataSource,
    query: { filters: { strategy_id: "strat-001" }, limit: 50 },
    chartSpec: chart,
    interactions: [{ kind: interactionKind }],
    placement: { ...placement, minWidth: 2, minHeight: 2 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 12, height: 6 },
    sensitivity: "user_private",
  };
}

const PROPOSAL_VIEWS: TradingRoomViewSpec[] = [
  {
    id: "strategy-overview",
    title: "Strategy Overview",
    purpose: "策略總覽",
    order: 1,
    layoutTemplate: "overview-grid",
    widgetCount: 1,
    dataAvailability: "complete",
    widgets: [
      widget(
        "w-status",
        "策略狀態摘要",
        "strategy_status_summary",
        "agora.strategy.summary",
        chartSpec("metric", {
          label: { field: "strategy_id", type: "nominal" },
          y: { field: "status", type: "nominal" },
        }),
        "open_strategy",
        { x: 0, y: 0, width: 4, height: 3 },
      ),
    ],
  },
  {
    id: "candidate-entry",
    title: "候選與進場",
    purpose: "候選與進場規則",
    order: 2,
    layoutTemplate: "candidate-grid",
    widgetCount: 1,
    dataAvailability: "complete",
    widgets: [
      widget(
        "w-candidates",
        "候選漏斗",
        "candidate_funnel",
        "agora.candidate.members",
        chartSpec("bar", {
          x: { field: "status", type: "nominal" },
          y: { field: "count", type: "quantitative" },
        }),
        "open_candidate",
        { x: 0, y: 0, width: 5, height: 3 },
      ),
    ],
  },
  {
    id: "winner-branch-intel",
    title: "贏家分點情報",
    purpose: "分點排名、得分與樣本",
    order: 3,
    layoutTemplate: "intel-grid",
    widgetCount: 1,
    dataAvailability: "complete",
    widgets: [
      widget(
        "w-scoreboard",
        "贏家分點排名",
        "winner_branch_scoreboard",
        "winner_branch.branch_profitability",
        chartSpec("table", {
          label: { field: "branch_id", type: "nominal" },
          value: { field: "effective_score", type: "quantitative" },
        }),
        "open_evidence",
        { x: 0, y: 0, width: 6, height: 3 },
      ),
    ],
  },
  {
    id: "branch-relationship",
    title: "分點關係與資金遷移",
    purpose: "關係分點與遷移模型",
    order: 4,
    layoutTemplate: "relationship-grid",
    widgetCount: 1,
    dataAvailability: "partial",
    warnings: ["Runtime bindings are not part of this proposal."],
    widgets: [
      widget(
        "w-network",
        "關聯分點網路",
        "related_branch_network",
        "winner_branch.related_branch_flow",
        chartSpec("network", {
          source: { field: "source_branch", type: "nominal" },
          target: { field: "target_branch", type: "nominal" },
          value: { field: "net_value", type: "quantitative" },
        }),
        "open_evidence",
        { x: 0, y: 0, width: 6, height: 4 },
      ),
    ],
  },
  {
    id: "event-lead",
    title: "事件領先研究",
    purpose: "事件領先與異常交易",
    order: 5,
    layoutTemplate: "event-grid",
    widgetCount: 1,
    dataAvailability: "complete",
    widgets: [
      widget(
        "w-event-lead",
        "事件領先時間軸",
        "event_lead_timeline",
        "winner_branch.event_lead",
        chartSpec("timeline", {
          time: { field: "event_date", type: "temporal" },
          label: { field: "lead_days", type: "quantitative" },
        }),
        "open_evidence",
        { x: 0, y: 0, width: 7, height: 3 },
      ),
    ],
  },
  {
    id: "position-exit",
    title: "持倉、加碼、減碼與出場",
    purpose: "持倉與出場規則",
    order: 6,
    layoutTemplate: "position-grid",
    widgetCount: 1,
    dataAvailability: "complete",
    widgets: [
      widget(
        "w-position-plan",
        "部位與加碼方案",
        "position_pyramid_plan",
        "agora.strategy.summary",
        chartSpec("table", {
          label: { field: "stage", type: "nominal" },
          value: { field: "weight", type: "quantitative" },
        }),
        "open_strategy",
        { x: 0, y: 0, width: 6, height: 3 },
      ),
    ],
  },
  {
    id: "evidence-monitoring",
    title: "證據與監控規則",
    purpose: "證據、回測與監控規則",
    order: 7,
    layoutTemplate: "evidence-grid",
    widgetCount: 1,
    dataAvailability: "complete",
    widgets: [
      widget(
        "w-research",
        "研究進度",
        "research_progress",
        "agora.research.run_summary",
        chartSpec("timeline", {
          time: { field: "run_id", type: "nominal" },
          label: { field: "purpose", type: "nominal" },
        }),
        "open_research_run",
        { x: 0, y: 0, width: 6, height: 3 },
      ),
    ],
  },
];

const MOCK_PROPOSAL: TradingRoomWorkspaceProposal = {
  strategyId: "strat-001",
  strategyVersion: "winner-branch-v4",
  proposalId: "proposal-001",
  generatedAt: "2026-06-29T00:00:00Z",
  status: "preview",
  views: PROPOSAL_VIEWS,
  rationale: "贏家分點 V4 操盤室提案，包含所有必要 views 與 widget specs。",
  dataAvailability: {
    status: "partial",
    sources: [
      { dataSource: "winner_branch.branch_profitability", status: "complete" },
      { dataSource: "winner_branch.related_branch_flow", status: "partial", reason: "等待最新分點映射" },
    ],
  },
  warnings: ["No RuntimeBinding or direct order execution is exposed."],
  personalizationApplied: {
    status: "applied",
    items: [{ key: "density", value: "compact" }],
  },
};

const MOCK_WORKSPACE: TradingRoomWorkspace = {
  id: "workspace-001",
  userId: "user-001",
  strategyId: "strat-001",
  strategyVersion: "winner-branch-v4",
  dashboardVersion: 1,
  activeViewId: "strategy-overview",
  views: PROPOSAL_VIEWS,
  status: "active",
  generatedBy: "trading_servant",
  createdAt: "2026-06-29T00:00:00Z",
  updatedAt: "2026-06-29T00:00:00Z",
};

const MOCK_WORKSPACE_V2: TradingRoomWorkspace = {
  ...MOCK_WORKSPACE,
  dashboardVersion: 2,
  generatedBy: "user_modified",
  updatedAt: "2026-06-29T01:00:00Z",
  views: [
    {
      ...MOCK_WORKSPACE.views[0],
      widgets: [
        {
          ...MOCK_WORKSPACE.views[0].widgets[0],
          placement: {
            ...MOCK_WORKSPACE.views[0].widgets[0].placement,
            height: 4,
            width: 5,
            x: 1,
            y: 2,
          },
        },
      ],
    },
    ...MOCK_WORKSPACE.views.slice(1),
  ],
};

const MOCK_REVISION_WORKSPACE: TradingRoomWorkspace = {
  ...MOCK_WORKSPACE,
  dashboardVersion: 2,
  generatedBy: "user_modified",
  updatedAt: "2026-06-29T01:30:00Z",
  views: [
    {
      ...MOCK_WORKSPACE.views[0],
      widgets: [
        {
          ...MOCK_WORKSPACE.views[0].widgets[0],
          title: "策略狀態摘要 Revised",
          purpose: "策略狀態摘要 revised by widget proposal",
        },
      ],
    },
    ...MOCK_WORKSPACE.views.slice(1),
  ],
};

const MOCK_WIDGET_REVISION_PROPOSAL: WidgetRevisionProposal = {
  id: "wrp-001",
  workspaceId: "workspace-001",
  viewId: "strategy-overview",
  widgetId: "w-status",
  instruction: "改成表格",
  beforeSpec: MOCK_WORKSPACE.views[0].widgets[0],
  proposedSpec: MOCK_REVISION_WORKSPACE.views[0].widgets[0],
  rationale: "保留原資料來源，改用更適合快速比較的呈現。",
  warnings: ["cluster-adjusted flow uses inferred evidence"],
  dataAvailability: "partial",
  status: "preview",
};

const MOCK_VERSION_1: TradingRoomDashboardVersion = {
  id: "version-001",
  userId: "user-001",
  strategyId: "strat-001",
  strategyVersion: "winner-branch-v4",
  dashboardVersion: 1,
  generatedBy: "trading_servant",
  previousVersionId: null,
  changeSummary: "v1 - trading servant initial workspace proposal",
  views: MOCK_WORKSPACE.views,
  createdAt: "2026-06-29T00:00:00Z",
  status: "active",
  changeLog: {
    affectedViews: ["strategy-overview"],
    affectedWidgets: ["w-status"],
    changedAt: "2026-06-29T00:00:00Z",
    changedBy: "trading_servant",
    effectEvaluation: "not evaluated",
    reason: "initial proposal",
    rollbackAvailable: true,
  },
};

const MOCK_VERSION_2: TradingRoomDashboardVersion = {
  ...MOCK_VERSION_1,
  id: "version-002",
  dashboardVersion: 2,
  generatedBy: "user_modified",
  previousVersionId: "version-001",
  changeSummary: "trader adjusted widget layout",
  views: MOCK_WORKSPACE_V2.views,
  createdAt: "2026-06-29T01:00:00Z",
  changeLog: {
    ...MOCK_VERSION_1.changeLog,
    changedAt: "2026-06-29T01:00:00Z",
    changedBy: "user-001",
    reason: "layout operations accepted by trader",
  },
};

afterEach(cleanup);

describe("TradingRoomPage", () => {
  beforeEach(() => {
    gridCallbacks.onLayoutChange = undefined;
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue(MOCK_AGGREGATE);
    vi.mocked(tradingRoomModule.listDecisionEvents).mockResolvedValue({
      items: [MOCK_DECISION_EVENT],
      etag: '"events-etag-v1"',
    });
    vi.mocked(tradingRoomModule.decideOnEvent).mockResolvedValue({});
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal).mockResolvedValue(MOCK_PROPOSAL);
    vi.mocked(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).mockResolvedValue({
      etag: '"workspace-etag-v1"',
      version: MOCK_VERSION_1,
      workspace: MOCK_WORKSPACE,
    });
    vi.mocked(tradingRoomModule.createWidgetRevisionProposal).mockResolvedValue({
      etag: '"revision-etag-v1"',
      proposal: MOCK_WIDGET_REVISION_PROPOSAL,
    });
    vi.mocked(tradingRoomModule.acceptWidgetRevisionProposal).mockResolvedValue({
      appliedAction: "apply",
      copiedWidgetId: null,
      etag: '"workspace-etag-v2"',
      proposal: { ...MOCK_WIDGET_REVISION_PROPOSAL, status: "accepted" },
      version: MOCK_VERSION_2,
      workspace: MOCK_REVISION_WORKSPACE,
    });
    vi.mocked(tradingRoomModule.patchTradingRoomWorkspaceLayout).mockResolvedValue({
      etag: '"workspace-etag-v2"',
      version: MOCK_VERSION_2,
      workspace: MOCK_WORKSPACE_V2,
    });
    vi.mocked(tradingRoomModule.listTradingRoomWorkspaceVersions).mockResolvedValue([
      MOCK_VERSION_1,
      MOCK_VERSION_2,
    ]);
    vi.mocked(tradingRoomModule.rollbackTradingRoomWorkspaceVersion).mockResolvedValue({
      etag: '"workspace-etag-v3"',
      version: { ...MOCK_VERSION_2, id: "version-003", dashboardVersion: 3 },
      workspace: { ...MOCK_WORKSPACE, dashboardVersion: 3, generatedBy: "user_modified" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state before data resolves", () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockReturnValue(new Promise(() => {}));
    vi.mocked(tradingRoomModule.listDecisionEvents).mockReturnValue(
      new Promise<{ items: typeof MOCK_DECISION_EVENT[], etag: null }>(() => {}),
    );
    render(<TradingRoomPage />);
    expect(screen.getByTestId("trading-room-loading")).toBeDefined();
  });

  it("renders the page with strategy lens switcher after load", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(screen.getByTestId("strategy-lens-switcher")).toBeDefined();
  });

  it("shows all-strategies button in the switcher", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(screen.getByTestId("strategy-lens-all")).toBeDefined();
  });

  it("renders each strategy as a selectable lens", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(screen.getByTestId("strategy-lens-strat-001")).toBeDefined();
    expect(screen.getByTestId("strategy-lens-strat-002")).toBeDefined();
  });

  it("enters the highest-value ready strategy workspace by default", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("strategy-workspace-strat-001");
    expect(screen.queryByTestId("trading-room-default-entry")).toBeNull();
    expect(screen.getByTestId("strategy-lens-strat-001").getAttribute("aria-selected")).toBe("true");
  });

  it("shows queue summary strip in the default entry when no strategy is ready", async () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue({
      ...MOCK_AGGREGATE,
      strategies: [
        { ...MOCK_AGGREGATE.strategies[0], readiness_state: "conditional", dashboard_recipe_id: undefined },
        MOCK_AGGREGATE.strategies[1],
      ],
    });
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-default-entry");
    await screen.findByTestId("queue-summary-strip");
    expect(screen.getByTestId("queue-entry-count").textContent).toContain("2");
    expect(screen.getByTestId("queue-reduce-count").textContent).toContain("1");
    expect(screen.getByTestId("queue-review-count").textContent).toContain("1");
  });

  it("renders readiness rows instead of an inert aggregate table when no strategy is ready", async () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue({
      ...MOCK_AGGREGATE,
      strategies: [
        { ...MOCK_AGGREGATE.strategies[0], readiness_state: "conditional", dashboard_recipe_id: undefined },
        MOCK_AGGREGATE.strategies[1],
      ],
    });
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-readiness-entry");
    expect(screen.getByTestId("trading-room-readiness-strat-001")).toBeDefined();
    expect(screen.getByTestId("trading-room-readiness-strat-002")).toBeDefined();
    expect(screen.queryByTestId("strategy-list-table")).toBeNull();
  });

  it("renders workshop intake as the default entry when the BFF returns no strategies", async () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue({
      ...MOCK_AGGREGATE,
      strategies: [],
      queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
    });
    render(<TradingRoomPage />);
    const entry = await screen.findByTestId("trading-room-default-entry");
    expect(entry.getAttribute("data-entry-state")).toBe("empty");
    expect(screen.getByTestId("trading-room-workshop-empty-entry")).toBeDefined();
  });

  it("routes the default entry workshop CTA through the parent callback", async () => {
    const onOpenWorkshop = vi.fn();
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue({
      ...MOCK_AGGREGATE,
      strategies: [
        { ...MOCK_AGGREGATE.strategies[0], readiness_state: "conditional", dashboard_recipe_id: undefined },
      ],
    });
    render(<TradingRoomPage onOpenWorkshop={onOpenWorkshop} />);
    await screen.findByTestId("trading-room-default-entry");
    fireEvent.click(screen.getByTestId("trading-room-open-workshop"));
    expect(onOpenWorkshop).toHaveBeenCalledTimes(1);
  });

  it("renders the decision event queue with loaded events", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-queue-table");
    expect(screen.getByTestId("event-row-evt-001")).toBeDefined();
  });

  it("shows loading state for event queue while events are pending", async () => {
    vi.mocked(tradingRoomModule.listDecisionEvents).mockReturnValue(
      new Promise<{ items: typeof MOCK_DECISION_EVENT[], etag: null }>(() => {}),
    );
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(screen.getByTestId("event-queue-loading")).toBeDefined();
  });

  it("renders a strategy workspace view when strategyId is provided", async () => {
    render(<TradingRoomPage strategyId="strat-001" />);
    await screen.findByTestId("strategy-workspace-strat-001");
  });

  it("marks the correct strategy as selected in the switcher", async () => {
    render(<TradingRoomPage strategyId="strat-001" />);
    await screen.findByTestId("trading-room-page");
    const btn = screen.getByTestId("strategy-lens-strat-001");
    expect(btn.getAttribute("aria-selected")).toBe("true");
  });

  it("filters events to the selected strategy in the workspace view", async () => {
    const otherEvent = {
      ...MOCK_DECISION_EVENT,
      decision_event_id: "evt-002",
      strategy_id: "strat-002",
    };
    vi.mocked(tradingRoomModule.listDecisionEvents).mockResolvedValue({
      items: [MOCK_DECISION_EVENT, otherEvent],
      etag: null,
    });
    render(<TradingRoomPage strategyId="strat-001" />);
    await screen.findByTestId("strategy-workspace-strat-001");
    expect(screen.getByTestId("event-row-evt-001")).toBeDefined();
    expect(screen.queryByTestId("event-row-evt-002")).toBeNull();
  });

  it("shows error state when getTradingRoom fails", async () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockRejectedValue(new Error("Network error"));
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-error");
  });

  it("calls getTradingRoom via the BFF module (not direct fetch)", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(tradingRoomModule.getTradingRoom).toHaveBeenCalled();
  });

  it("calls listDecisionEvents via the BFF module (not direct fetch)", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(tradingRoomModule.listDecisionEvents).toHaveBeenCalled();
  });

  it("shows position action queue panel", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(screen.getByTestId("position-action-queue")).toBeDefined();
  });

  it("does not show risk banner when risk state is normal", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("trading-room-page");
    expect(screen.queryByTestId("risk-banner")).toBeNull();
  });

  it("shows risk banner when risk state is not normal", async () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue({
      ...MOCK_AGGREGATE,
      risk_summary: { state: "warning", summary: "Volatility elevated" },
    });
    render(<TradingRoomPage />);
    await screen.findByTestId("risk-banner");
    const banner = screen.getByTestId("risk-banner");
    expect(banner.getAttribute("data-risk-state")).toBe("warning");
  });

  // ── V11 Workspace Proposal And Shell ───────────────────────────────────────

  it("creates a workspace proposal for the selected strategy version", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).toHaveBeenCalledWith(
      "strat-001",
      expect.objectContaining({
        strategyVersion: "winner-branch-v4",
        tradingRoomReady: true,
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("falls back to strategy_spec_registry_id when no route strategyVersion is provided", async () => {
    render(<TradingRoomPage strategyId="strat-001" />);
    await screen.findByTestId("workspace-proposal-preview");
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).toHaveBeenCalledWith(
      "strat-001",
      expect.objectContaining({ strategyVersion: "reg-001" }),
      expect.any(Object),
    );
  });

  it("loads an explicit strategy route even when the aggregate has no selected strategy", async () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue({
      ...MOCK_AGGREGATE,
      strategies: [],
      queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
    });

    render(
      <TradingRoomPage
        readinessAssessmentId="ready-route-001"
        readinessGate="trading_room"
        strategyId="strat-route-001"
        strategyVersion="reg-route-001"
      />,
    );

    await screen.findByTestId("workspace-proposal-preview");
    expect(screen.getByTestId("strategy-workspace-strat-route-001")).toBeDefined();
    expect(screen.queryByTestId("trading-room-default-entry")).toBeNull();
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).toHaveBeenCalledWith(
      "strat-route-001",
      expect.objectContaining({
        personalizationHints: expect.objectContaining({
          readinessAssessmentId: "ready-route-001",
          readinessGate: "trading_room",
        }),
        strategyVersion: "reg-route-001",
        tradingRoomReady: true,
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("does not mark an explicit route as ready when readiness context is blocked", async () => {
    vi.mocked(tradingRoomModule.getTradingRoom).mockResolvedValue({
      ...MOCK_AGGREGATE,
      strategies: [],
      queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
    });

    render(
      <TradingRoomPage
        readinessAssessmentId="ready-route-blocked"
        readinessGate="full_validation"
        strategyId="strat-route-001"
        strategyVersion="reg-route-001"
      />,
    );

    await screen.findByTestId("workspace-proposal-preview");
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).toHaveBeenCalledWith(
      "strat-route-001",
      expect.objectContaining({
        personalizationHints: expect.objectContaining({
          readinessAssessmentId: "ready-route-blocked",
          readinessGate: "full_validation",
        }),
        strategyVersion: "reg-route-001",
        tradingRoomReady: false,
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("shows V11 generation progress while proposal generation is pending", async () => {
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal).mockReturnValue(new Promise(() => {}));
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("trading-room-generation-progress");
    expect(screen.getByTestId("trading-room-generation-progress").textContent).toContain("交易僕人正在建立");
    expect(screen.getByTestId("trading-room-generation-progress").textContent).toContain("產生 Views 與 widgets");
  });

  it("renders all V11 proposal view thumbnails and widget counts", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");

    for (const view of PROPOSAL_VIEWS) {
      expect(screen.getByTestId(`workspace-proposal-view-${view.id}`)).toBeDefined();
      expect(screen.getByTestId(`workspace-proposal-thumbnail-${view.id}`)).toBeDefined();
      expect(screen.getByTestId(`workspace-proposal-view-${view.id}-widget-count`).textContent).toContain("1 個元件");
    }
  });

  it("renders the proposal preview as a native dark Trading Room surface", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    const preview = await screen.findByTestId("workspace-proposal-preview");
    const firstView = screen.getByTestId("workspace-proposal-view-strategy-overview");
    const availability = screen.getByTestId("workspace-proposal-data-availability");

    expect(preview).toHaveStyle({ background: "#11151d" });
    expect(firstView).toHaveStyle({ background: "#222535" });
    expect(availability).toHaveStyle({ background: "#171b22" });
  });

  it("shows proposal data availability, warnings, and personalization without raw backend wording", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    expect(screen.getByTestId("workspace-proposal-data-availability").textContent).toContain("winner_branch.related_branch_flow");
    expect(screen.getByTestId("workspace-proposal-personalization").textContent).toContain("density");
    expect(screen.getByTestId("workspace-proposal-warnings").textContent).toContain("後台執行狀態");
    expect(screen.getByTestId("workspace-proposal-warnings").textContent).not.toContain("RuntimeBinding");
  });

  it("accepts the proposal and renders the accepted workspace shell", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    expect(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).toHaveBeenCalledWith(
      "strat-001",
      "proposal-001",
      { expectedStatus: "preview" },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(screen.getByTestId("workspace-view-tabs")).toBeDefined();
    expect(screen.getByTestId("workspace-widget-w-status")).toBeDefined();
    expect(screen.getByTestId("mock-chart-spec-renderer").textContent).toBe("metric");
  });

  it("keeps the accepted workspace shell and widgets on the dark Trading Room surface", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    const shell = await screen.findByTestId("trading-room-workspace-shell");
    const widget = await screen.findByTestId("workspace-widget-w-status");

    expect(shell).toHaveStyle({ background: "#11151d" });
    expect(widget).toHaveStyle({ background: "#171b22" });
  });

  it("saves drag and resize operations with workspace ETag and idempotency key", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));
    act(() => {
      gridCallbacks.onLayoutChange?.([{ i: "w-status", x: 1, y: 2, w: 5, h: 4 }]);
    });
    expect(screen.getByTestId("workspace-unsaved-bar").textContent).toContain("2 unsaved layout operations");

    fireEvent.click(screen.getByTestId("workspace-save-layout"));

    await waitFor(() =>
      expect(tradingRoomModule.patchTradingRoomWorkspaceLayout).toHaveBeenCalledWith(
        "workspace-001",
        {
          operations: [
            { kind: "move_widget", widgetId: "w-status", payload: { x: 1, y: 2 } },
            { kind: "resize_widget", widgetId: "w-status", payload: { width: 5, height: 4 } },
          ],
        },
        expect.objectContaining({
          ifMatch: '"workspace-etag-v1"',
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("workspace-dashboard-version").textContent).toContain("v2"));
  });

  it("removes and restores widgets through layout operations without deleting the widget", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));
    fireEvent.click(screen.getByTestId("workspace-widget-menu-w-status"));
    fireEvent.click(screen.getByText("移除 Widget"));
    expect(screen.getByTestId("workspace-restore-library")).toBeDefined();
    expect(screen.queryByTestId("workspace-widget-w-status")).toBeNull();

    fireEvent.click(screen.getByTestId("workspace-restore-widget-w-status"));
    expect(screen.getByTestId("workspace-widget-w-status")).toBeDefined();
    fireEvent.click(screen.getByTestId("workspace-save-layout"));

    await waitFor(() =>
      expect(tradingRoomModule.patchTradingRoomWorkspaceLayout).toHaveBeenCalledWith(
        "workspace-001",
        {
          operations: [
            { kind: "remove_widget", widgetId: "w-status", payload: {} },
            { kind: "add_registered_widget", payload: { widgetId: "w-status" } },
          ],
        },
        expect.objectContaining({ ifMatch: '"workspace-etag-v1"' }),
      ),
    );
  });

  it("duplicates an existing widget and changes chart kind via the widget menu", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));
    fireEvent.click(screen.getByTestId("workspace-widget-menu-w-status"));
    fireEvent.click(screen.getByText("複製 Widget"));
    expect(screen.getAllByTestId(/workspace-widget-/).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByTestId("workspace-view-tab-candidate-entry"));
    fireEvent.click(screen.getByTestId("workspace-widget-menu-w-candidates"));
    fireEvent.click(screen.getByTestId("workspace-change-chart-w-candidates-sankey"));
    fireEvent.click(screen.getByTestId("workspace-save-layout"));

    await waitFor(() => {
      const call = vi.mocked(tradingRoomModule.patchTradingRoomWorkspaceLayout).mock.calls[0];
      expect(call[1].operations.some((op) => op.kind === "add_registered_widget" && "widgetSpec" in op.payload)).toBe(true);
      expect(call[1].operations).toContainEqual({
        kind: "replace_chart_spec",
        widgetId: "w-candidates",
        payload: { chartSpec: expect.objectContaining({ kind: "sankey" }) },
      });
    });
  });

  it("adds a registered widget from the controlled widget library", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));
    fireEvent.click(screen.getByTestId("workspace-add-widget-button"));
    fireEvent.click(screen.getByTestId("workspace-add-widget-strategy_status_summary"));
    fireEvent.click(screen.getByTestId("workspace-save-layout"));

    await waitFor(() => {
      const call = vi.mocked(tradingRoomModule.patchTradingRoomWorkspaceLayout).mock.calls[0];
      const addOp = call[1].operations.find((op) => op.kind === "add_registered_widget");
      expect(addOp?.payload).toMatchObject({
        viewId: "strategy-overview",
        widgetSpec: expect.objectContaining({
          dataSource: "agora.strategy.summary",
          widgetType: "strategy_status_summary",
        }),
      });
    });
  });

  it("rolls back a prior workspace version with the current workspace ETag", async () => {
    vi.mocked(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).mockResolvedValueOnce({
      etag: '"workspace-etag-v2"',
      version: MOCK_VERSION_2,
      workspace: MOCK_WORKSPACE_V2,
    });
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");
    await screen.findByTestId("workspace-version-version-001");

    fireEvent.click(screen.getByTestId("workspace-rollback-version-001"));

    await waitFor(() =>
      expect(tradingRoomModule.rollbackTradingRoomWorkspaceVersion).toHaveBeenCalledWith(
        "workspace-001",
        "version-001",
        { reason: "rollback to dashboard version 1" },
        expect.objectContaining({
          ifMatch: '"workspace-etag-v2"',
          idempotencyKey: expect.any(String),
        }),
      ),
    );
  });

  it("opens widget adjustment drawer from widget click and applies a backend revision proposal", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-widget-w-status"));
    await screen.findByTestId("workspace-widget-revision-drawer");
    const context = screen.getByTestId("workspace-widget-revision-context").textContent ?? "";
    expect(context).toContain("workspace-001 / dashboard v1");
    expect(context).toContain("strat-001 / winner-branch-v4");
    expect(context).toContain("strategy-overview");
    expect(context).toContain("w-status");
    expect(context).toContain("策略狀態摘要");
    expect(context).toContain("strategy_status_summary");
    expect(context).toContain("策略狀態摘要 purpose");
    expect(context).toContain("策略狀態摘要 is required for the V11 proposal.");
    expect(context).toContain("agora.strategy.summary");
    expect(context).toContain("\"strategy_id\":\"strat-001\"");
    expect(context).toContain("50");
    expect(context).toContain("open_strategy");
    expect(context).toContain("user_private");
    expect(context).toContain("x:0");
    expect(context).toContain("complete");

    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "改成表格" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));

    await waitFor(() =>
      expect(tradingRoomModule.createWidgetRevisionProposal).toHaveBeenCalledWith(
        "workspace-001",
        "w-status",
        expect.objectContaining({
          instruction: "改成表格",
          proposedSpec: expect.objectContaining({
            dataSource: "agora.strategy.summary",
            id: "w-status",
            interactions: expect.arrayContaining([
              expect.objectContaining({ kind: "request_widget_revision" }),
            ]),
            placement: expect.objectContaining({
              height: 3,
              width: 4,
              x: 0,
              y: 0,
            }),
            query: expect.objectContaining({
              filters: { strategy_id: "strat-001" },
              limit: 50,
            }),
            sensitivity: "user_private",
            widgetType: "strategy_status_summary",
          }),
          viewId: "strategy-overview",
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    );
    await screen.findByTestId("workspace-widget-revision-proposal");
    const diff = screen.getByTestId("workspace-widget-before-after-diff");
    expect(diff.getAttribute("data-durable-snapshot")).toBe("backend-proposal");
    expect(screen.getByTestId("workspace-widget-diff-title").textContent).toContain("策略狀態摘要");
    expect(screen.getByTestId("workspace-widget-diff-title").textContent).toContain("策略狀態摘要 Revised");
    expect(screen.getByTestId("workspace-widget-diff-widget-type").textContent).toContain("strategy_status_summary");
    expect(screen.getByTestId("workspace-widget-diff-data-source").textContent).toContain("agora.strategy.summary");
    expect(screen.getByTestId("workspace-widget-diff-query-filters").textContent).toContain("\"strategy_id\":\"strat-001\"");
    expect(screen.getByTestId("workspace-widget-diff-query-window")).toBeDefined();
    expect(screen.getByTestId("workspace-widget-diff-chart-spec").textContent).toContain("metric");
    expect(screen.getByTestId("workspace-widget-diff-interactions").textContent).toContain("open_strategy");
    expect(screen.getByTestId("workspace-widget-diff-sensitivity").textContent).toContain("user_private");
    expect(screen.getByTestId("workspace-widget-diff-placement").textContent).toContain("x:0");

    fireEvent.click(screen.getByTestId("workspace-widget-revision-apply"));

    await waitFor(() =>
      expect(tradingRoomModule.acceptWidgetRevisionProposal).toHaveBeenCalledWith(
        "wrp-001",
        expect.objectContaining({ acceptanceAction: "apply" }),
        expect.objectContaining({
          ifMatch: '"workspace-etag-v1"',
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("workspace-dashboard-version").textContent).toContain("v2"));
    expect(screen.getByTestId("workspace-widget-w-status").textContent).toContain("策略狀態摘要 Revised");
  });

  it("opens widget adjustment from the widget menu and keeps original plus modified copy", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));
    fireEvent.click(screen.getByTestId("workspace-widget-menu-w-status"));
    fireEvent.click(screen.getByText("交代僕人修改"));
    await screen.findByTestId("workspace-widget-revision-drawer");

    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "保留原圖，再新增長條圖版本" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));
    await screen.findByTestId("workspace-widget-revision-proposal");
    fireEvent.click(screen.getByTestId("workspace-widget-revision-keep-copy"));

    await waitFor(() =>
      expect(tradingRoomModule.acceptWidgetRevisionProposal).toHaveBeenCalledWith(
        "wrp-001",
        expect.objectContaining({
          acceptanceAction: "keep_original_add_modified_copy",
          copyWidgetId: expect.stringMatching(/^w-status_copy_/u),
        }),
        expect.objectContaining({
          ifMatch: '"workspace-etag-v1"',
          idempotencyKey: expect.any(String),
        }),
      ),
    );
  });

  it("cancels a widget revision proposal without applying or mutating the workspace", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-widget-w-status"));
    await screen.findByTestId("workspace-widget-revision-drawer");
    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "改成表格" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));
    await screen.findByTestId("workspace-widget-revision-proposal");
    fireEvent.click(screen.getByTestId("workspace-widget-revision-cancel"));

    await waitFor(() => expect(screen.queryByTestId("workspace-widget-revision-drawer")).toBeNull());
    expect(tradingRoomModule.acceptWidgetRevisionProposal).not.toHaveBeenCalled();
    expect(screen.getByTestId("workspace-dashboard-version").textContent).toContain("v1");
    expect(screen.getByTestId("workspace-widget-w-status").textContent).not.toContain("Revised");
  });

  it("adjusts again with a fresh proposal and never applies the stale proposal", async () => {
    const staleProposal: WidgetRevisionProposal = {
      ...MOCK_WIDGET_REVISION_PROPOSAL,
      id: "wrp-stale",
      proposedSpec: {
        ...MOCK_WIDGET_REVISION_PROPOSAL.proposedSpec,
        title: "策略狀態摘要 stale",
      },
    };
    const freshProposal: WidgetRevisionProposal = {
      ...MOCK_WIDGET_REVISION_PROPOSAL,
      id: "wrp-fresh",
      instruction: "改成熱圖",
      proposedSpec: {
        ...MOCK_WIDGET_REVISION_PROPOSAL.proposedSpec,
        title: "策略狀態摘要 Heatmap",
      },
    };
    vi.mocked(tradingRoomModule.createWidgetRevisionProposal)
      .mockResolvedValueOnce({ etag: '"revision-etag-stale"', proposal: staleProposal })
      .mockResolvedValueOnce({ etag: '"revision-etag-fresh"', proposal: freshProposal });
    vi.mocked(tradingRoomModule.acceptWidgetRevisionProposal).mockResolvedValueOnce({
      appliedAction: "apply",
      copiedWidgetId: null,
      etag: '"workspace-etag-v2"',
      proposal: { ...freshProposal, status: "accepted" },
      version: MOCK_VERSION_2,
      workspace: {
        ...MOCK_REVISION_WORKSPACE,
        views: [
          {
            ...MOCK_REVISION_WORKSPACE.views[0],
            widgets: [freshProposal.proposedSpec],
          },
          ...MOCK_REVISION_WORKSPACE.views.slice(1),
        ],
      },
    });

    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-widget-w-status"));
    await screen.findByTestId("workspace-widget-revision-drawer");
    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "改成表格" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));
    await waitFor(() => expect(tradingRoomModule.createWidgetRevisionProposal).toHaveBeenCalledTimes(1));
    expect(await screen.findAllByText("策略狀態摘要 stale")).not.toHaveLength(0);

    fireEvent.click(screen.getByTestId("workspace-widget-revision-adjust-again"));
    await waitFor(() => expect(screen.queryByTestId("workspace-widget-revision-apply")).toBeNull());
    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "改成熱圖" },
    });
    fireEvent.click(screen.getByTestId("workspace-widget-revision-submit"));
    await waitFor(() => expect(tradingRoomModule.createWidgetRevisionProposal).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByText("策略狀態摘要 Heatmap")).not.toHaveLength(0);
    fireEvent.click(screen.getByTestId("workspace-widget-revision-apply"));

    await waitFor(() =>
      expect(tradingRoomModule.acceptWidgetRevisionProposal).toHaveBeenCalledWith(
        "wrp-fresh",
        expect.objectContaining({ acceptanceAction: "apply" }),
        expect.objectContaining({
          ifMatch: '"workspace-etag-v1"',
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(tradingRoomModule.acceptWidgetRevisionProposal).not.toHaveBeenCalledWith(
      "wrp-stale",
      expect.anything(),
      expect.anything(),
    );
  });

  it("disables widget revision proposal submit while layout changes are unsaved", async () => {
    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    await screen.findByTestId("trading-room-workspace-shell");

    fireEvent.click(screen.getByTestId("workspace-edit-mode-toggle"));
    act(() => {
      gridCallbacks.onLayoutChange?.([{ i: "w-status", x: 1, y: 2, w: 5, h: 4 }]);
    });
    fireEvent.click(screen.getByTestId("workspace-widget-menu-w-status"));
    fireEvent.click(screen.getByText("交代僕人修改"));
    await screen.findByTestId("workspace-widget-revision-drawer");
    expect(screen.getByTestId("workspace-widget-revision-disabled").textContent).toContain("未儲存");

    fireEvent.change(screen.getByTestId("workspace-widget-revision-input"), {
      target: { value: "改成表格" },
    });
    const submit = screen.getByTestId("workspace-widget-revision-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);

    expect(tradingRoomModule.createWidgetRevisionProposal).not.toHaveBeenCalled();
  });

  it("clears stale proposal state on typed 403 during regeneration", async () => {
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal)
      .mockResolvedValueOnce(MOCK_PROPOSAL)
      .mockRejectedValueOnce(makeBffError(403, "TENANT_SCOPE_MISMATCH", "wrong tenant"));

    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-regenerate"));

    const error = await screen.findByTestId("trading-room-proposal-error");
    expect(error.getAttribute("data-error-status")).toBe("403");
    expect(error.getAttribute("data-error-code")).toBe("TENANT_SCOPE_MISMATCH");
    expect(screen.queryByTestId("workspace-proposal-preview")).toBeNull();
    expect(screen.queryByTestId("strategy-recipe-workspace")).toBeNull();
  });

  it("clears stale proposal state on typed 409 accept conflict", async () => {
    vi.mocked(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta)
      .mockRejectedValueOnce(makeBffError(409, "STATE_CONFLICT", "proposal already accepted"));

    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));

    const error = await screen.findByTestId("trading-room-proposal-error");
    expect(error.getAttribute("data-error-status")).toBe("409");
    expect(error.textContent).toContain("狀態已變更");
    expect(screen.queryByTestId("workspace-proposal-preview")).toBeNull();
    expect(screen.queryByTestId("trading-room-workspace-shell")).toBeNull();
  });

  it("keeps proposal preview visible on typed 422 accept validation failure", async () => {
    vi.mocked(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta)
      .mockRejectedValueOnce(makeBffError(422, "VALIDATION_FAILED", "proposal invalid"));

    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);
    await screen.findByTestId("workspace-proposal-preview");
    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));

    const error = await screen.findByTestId("workspace-proposal-error");
    expect(error.textContent).toContain("proposal invalid");
    expect(screen.getByTestId("workspace-proposal-preview")).toBeDefined();
    expect(screen.queryByTestId("trading-room-workspace-shell")).toBeNull();
  });

  it("surfaces typed 501 proposal generation failure without falling back", async () => {
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal)
      .mockRejectedValueOnce(makeBffError(501, "CAPABILITY_MISSING", "not implemented"));

    render(<TradingRoomPage strategyId="strat-001" strategyVersion="winner-branch-v4" />);

    const error = await screen.findByTestId("trading-room-proposal-error");
    expect(error.getAttribute("data-error-status")).toBe("501");
    expect(error.getAttribute("data-error-code")).toBe("CAPABILITY_MISSING");
    expect(error.textContent).toContain("尚未在目前 BFF 啟用");
    expect(screen.queryByTestId("workspace-proposal-preview")).toBeNull();
    expect(screen.queryByTestId("strategy-recipe-unavailable")).toBeNull();
    expect(screen.queryByTestId("strategy-recipe-workspace")).toBeNull();
  });

  it("does not jump to the old recipe placeholder for selected strategies", async () => {
    render(<TradingRoomPage strategyId="strat-002" />);
    await screen.findByTestId("workspace-proposal-preview");
    expect(screen.queryByTestId("strategy-recipe-unavailable")).toBeNull();
    expect(screen.queryByTestId("strategy-recipe-workspace")).toBeNull();
  });

  // ── Decision Event Detail ──────────────────────────────────────────────────

  it("expands event detail panel when row is clicked", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("event-detail-evt-001")).toBeDefined();
  });

  it("shows confidence and calibration in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-confidence").textContent).toContain("78%");
    expect(screen.getByTestId("detail-calibration").textContent).toContain("calibrated");
  });

  it("shows probability and CI interval in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-probability").textContent).toContain("72%");
    expect(screen.getByTestId("detail-probability-interval").textContent).toContain("65%");
  });

  it("shows expected value breakdown in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    const ev = screen.getByTestId("detail-expected-value");
    expect(ev.textContent).toContain("pct_return");
    expect(ev.textContent).toContain("5d");
  });

  it("shows rationale claims in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-rationale").textContent).toContain("Strong momentum");
  });

  it("shows risk notes in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-risk-notes").textContent).toContain("volatility");
  });

  it("shows evidence refs in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-evidence-refs").textContent).toContain("eb-001");
  });

  it("shows invalidation conditions in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-invalidation").textContent).toContain("Gap up");
  });

  it("shows no_order_route_proof in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-no-order-route").textContent).toContain(
      "agora_decision_support_only",
    );
  });

  it("shows trader decision buttons in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("decide-approve-evt-001")).toBeDefined();
    expect(screen.getByTestId("decide-reject-evt-001")).toBeDefined();
    expect(screen.getByTestId("decide-defer-evt-001")).toBeDefined();
    expect(screen.getByTestId("decide-modify-evt-001")).toBeDefined();
  });

  it("calls decideOnEvent with ifMatch, idempotencyKey, and requestId when trader clicks approve", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    fireEvent.click(screen.getByTestId("decide-approve-evt-001"));
    await waitFor(() =>
      expect(tradingRoomModule.decideOnEvent).toHaveBeenCalledWith(
        "evt-001",
        { decision: "approve" },
        expect.objectContaining({
          ifMatch: '"events-etag-v1"',
          idempotencyKey: expect.any(String),
          requestId: expect.any(String),
        }),
      ),
    );
  });

  it("shows confirmation after successful trader decision", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    fireEvent.click(screen.getByTestId("decide-approve-evt-001"));
    await screen.findByTestId("detail-decision-confirmed");
    expect(screen.getByTestId("detail-decision-confirmed").textContent).toContain("approve");
  });

  it("shows error message when decideOnEvent fails", async () => {
    vi.mocked(tradingRoomModule.decideOnEvent).mockRejectedValue(new Error("Server error"));
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    fireEvent.click(screen.getByTestId("decide-reject-evt-001"));
    await screen.findByTestId("detail-decision-error");
    expect(screen.getByTestId("detail-decision-error").textContent).toContain("Server error");
  });

  it("collapses event detail when row is clicked again", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("event-detail-evt-001")).toBeDefined();
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.queryByTestId("event-detail-evt-001")).toBeNull();
  });

  it("shows suggested action in expanded detail", async () => {
    render(<TradingRoomPage />);
    await screen.findByTestId("event-row-evt-001");
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("detail-suggested-action").textContent).toContain("enter");
  });
});
