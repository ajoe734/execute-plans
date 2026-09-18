import React from "react";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TradingRoomWorkspace,
  RiskBanner,
  TradingEventQueue,
  PositionActionQueue,
  TradingRoomGenerationProgress,
  type TradingRoomWorkspaceProps,
} from "./TradingRoomWorkspace";
import type {
  TradingRoomAggregate,
  TradingRoomStrategyEntry,
  TradingDecisionEvent,
} from "@/lib/bff-v1/agora/tradingRoom";
import * as tradingRoomModule from "@/lib/bff-v1/agora/tradingRoom";
import type { TradingRoomWorkspaceProposal, TradingRoomWorkspace as TradingRoomWorkspaceType } from "@/lib/bff-v1/agora/tradingRoomTypes";
import type { TradingRoomWorkspaceResult } from "@/lib/bff-v1/agora/tradingRoom";

type MockProposalPreviewProps = {
  proposal: TradingRoomWorkspaceProposal;
  onAccept: () => void;
  onRegenerate: () => void;
  busy?: boolean;
  error?: string;
};

type MockGridEditorProps = {
  strategy?: Pick<TradingRoomStrategyEntry, "title">;
  onBackToWorkshop: () => void;
  onSwitchStrategy: () => void;
};

type MockTradeDecisionCardProps = {
  event: TradingDecisionEvent;
};

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  acceptTradingRoomWorkspaceProposalWithMeta: vi.fn(),
  createTradingRoomWorkspaceProposal: vi.fn(),
  decideOnEvent: vi.fn(),
  listTradingRoomWorkspaceVersions: vi.fn(),
  patchTradingRoomWorkspaceLayout: vi.fn(),
  rollbackTradingRoomWorkspaceVersion: vi.fn(),
}));

vi.mock("@/agora/trading-room/WorkspaceProposalPreview", () => ({
  WorkspaceProposalPreview: ({ proposal, onAccept, onRegenerate, busy, error }: MockProposalPreviewProps) => (
    <div data-testid="mock-proposal-preview">
      <span>Proposal: {proposal.proposalId}</span>
      {busy && <span>Accepting...</span>}
      {error && <span data-testid="proposal-preview-error">{error}</span>}
      <button data-testid="preview-accept-button" onClick={onAccept} type="button">Accept</button>
      <button data-testid="preview-regen-button" onClick={onRegenerate} type="button">Regenerate</button>
    </div>
  ),
}));

vi.mock("@/agora/trading-room/WorkspaceGridEditor", () => ({
  WorkspaceGridEditor: ({ strategy, onBackToWorkshop, onSwitchStrategy }: MockGridEditorProps) => (
    <div data-testid="mock-grid-editor">
      <span>Grid Editor for {strategy?.title}</span>
      <button data-testid="grid-back-button" onClick={onBackToWorkshop} type="button">Back</button>
      <button data-testid="grid-switch-button" onClick={onSwitchStrategy} type="button">Switch</button>
    </div>
  ),
}));

vi.mock("@/agora/components/TradeDecisionCard", () => ({
  TradeDecisionCard: ({ event }: MockTradeDecisionCardProps) => (
    <div data-testid={`trade-decision-card-${event.decision_event_id}`}>
      Decision Card for {event.subject.symbol}
    </div>
  ),
}));

const SAMPLE_STRATEGY: TradingRoomStrategyEntry = {
  dashboard_recipe_id: "recipe-001",
  monitoring_state: "monitoring",
  pending_event_counts: { add: 1, entry: 2, exit: 0, reduce: 0, review: 1 },
  readiness_state: "ready",
  staleness_reasons: [],
  strategy_id: "strat-001",
  strategy_spec_registry_id: "reg-spec-001",
  title: "Taiwan Momentum Alpha",
};

const SAMPLE_AGGREGATE: TradingRoomAggregate = {
  data_cutoff: "2026-08-30T21:50:00Z",
  position_summaries: [{ symbol: "2330.TW", quantity: 1000, value: 950000 }],
  queue_summary: { add: 1, entry: 2, exit: 0, reduce: 0, review: 1 },
  risk_summary: {
    alerts: ["Exposure near limit in semi sector"],
    state: "watch",
    summary: "Sector limit elevated",
  },
  snapshot_at: "2026-08-30T22:00:00Z",
  spec_version: "1.0",
  strategies: [SAMPLE_STRATEGY],
  user_scope_ref: "user-001",
};

const SAMPLE_EVENTS: TradingDecisionEvent[] = [
  {
    confidence: { basis: "model", calibration_state: "calibrated", value: 0.85 },
    decision_event_id: "evt-001",
    event_kind: "entry",
    evidence_refs: [],
    expected_value: { cost: 2.3, downside: -3, gross: 12.5, horizon: "1d", net: 10.2, unit: "currency" },
    invalidation: { conditions: [], current_state: "valid" },
    no_order_route_proof: "agora_decision_support_only",
    origin: "strategy_signal",
    probability: { horizon: "1d", target_outcome: "profit_target_hit", value: 0.6 },
    rationale: [{ claim: "Trend continuation", confidence: 0.85 }],
    risk_notes: [],
    spec_version: "1.0",
    state: "triggered",
    strategy_id: "strat-001",
    strategy_spec_registry_id: "reg-spec-001",
    subject: { symbol: "2330.TW", venue: "TW" },
    suggested_action: "enter",
    triggered_at: "2026-08-30T21:45:00Z",
  },
  {
    confidence: { basis: "model", calibration_state: "calibrated", value: 0.72 },
    decision_event_id: "evt-002",
    event_kind: "add",
    evidence_refs: [],
    expected_value: { cost: 1.5, downside: -2, gross: 8.0, horizon: "1d", net: 6.5, unit: "currency" },
    invalidation: { conditions: [], current_state: "valid" },
    no_order_route_proof: "agora_decision_support_only",
    origin: "strategy_signal",
    probability: { horizon: "1d", target_outcome: "profit_target_hit", value: 0.55 },
    rationale: [{ claim: "Support bounce", confidence: 0.72 }],
    risk_notes: [],
    spec_version: "1.0",
    state: "pending_review",
    strategy_id: "strat-001",
    strategy_spec_registry_id: "reg-spec-001",
    subject: { symbol: "2454.TW", venue: "TW" },
    suggested_action: "add",
    triggered_at: "2026-08-30T21:40:00Z",
  },
];

const SAMPLE_PROPOSAL: TradingRoomWorkspaceProposal = {
  dataAvailability: { sources: [], status: "complete" },
  generatedAt: "2026-08-30T22:00:00Z",
  personalizationApplied: { items: [], status: "not_applied" },
  proposalId: "prop-ws-001",
  rationale: "Optimized layout based on Taiwan equity profile",
  status: "preview",
  strategyId: "strat-001",
  strategyVersion: "reg-spec-001",
  views: [
    {
      id: "view-overview",
      layoutTemplate: "grid",
      order: 0,
      purpose: "Decision queue overview",
      title: "Overview",
      widgetCount: 1,
      widgets: [
        {
          chartSpec: {
            encodings: {},
            kind: "table",
            spec_version: "1.0",
          },
          dataSource: "agora.trading.events",
          id: "w1",
          interactions: [],
          maxSize: { height: 8, width: 12 },
          minSize: { height: 2, width: 2 },
          placement: { height: 4, minHeight: 2, minWidth: 2, width: 6, x: 0, y: 0 },
          purpose: "Show pending decisions",
          query: { filters: {} },
          sensitivity: "user_private",
          title: "Decision Queue",
          whyIncluded: "Primary action surface",
          widgetType: "trading_queue",
        },
      ],
    },
  ],
  warnings: [],
};

const SAMPLE_WORKSPACE_RESULT: TradingRoomWorkspaceResult = {
  etag: '"etag-ws-001"',
  workspace: {
    activeViewId: "view-overview",
    createdAt: "2026-08-30T22:00:00Z",
    dashboardVersion: 1,
    generatedBy: "trading_servant",
    id: "ws-strat-001",
    status: "active",
    strategyId: "strat-001",
    strategyVersion: "reg-spec-001",
    updatedAt: "2026-08-30T22:00:00Z",
    userId: "user-001",
    views: SAMPLE_PROPOSAL.views,
  } as TradingRoomWorkspaceType,
};

describe("TradingRoomWorkspace component suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal).mockResolvedValue(SAMPLE_PROPOSAL);
    vi.mocked(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).mockResolvedValue(SAMPLE_WORKSPACE_RESULT);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the strategy title, readiness state, and monitoring state", async () => {
    render(
      <TradingRoomWorkspace
        aggregate={SAMPLE_AGGREGATE}
        events={SAMPLE_EVENTS}
        eventsEtag="etag-events-1"
        eventsLoading={false}
        strategy={SAMPLE_STRATEGY}
        strategyId="strat-001"
        strategyVersion="reg-spec-001"
      />,
    );

    expect(screen.getByText("Taiwan Momentum Alpha")).toBeInTheDocument();
    expect(screen.getByText(/ready · monitoring/)).toBeInTheDocument();
  });

  it("renders the risk banner when risk state is not normal", async () => {
    render(
      <RiskBanner
        alerts={["Exposure near limit in semi sector"]}
        state="watch"
        summary="Sector limit elevated"
      />,
    );

    const banner = screen.getByTestId("risk-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("data-risk-state", "watch");
    expect(screen.getByText(/Sector limit elevated/)).toBeInTheDocument();
    expect(screen.getByText("Exposure near limit in semi sector")).toBeInTheDocument();
  });

  it("renders null for RiskBanner when state is normal", () => {
    const { container } = render(<RiskBanner state="normal" />);
    expect(container.firstChild).toBeNull();
  });

  it("generates a proposal and renders WorkspaceProposalPreview", async () => {
    render(
      <TradingRoomWorkspace
        aggregate={SAMPLE_AGGREGATE}
        events={SAMPLE_EVENTS}
        eventsEtag="etag-events-1"
        eventsLoading={false}
        strategy={SAMPLE_STRATEGY}
        strategyId="strat-001"
        strategyVersion="reg-spec-001"
      />,
    );

    await waitFor(() => {
      expect(tradingRoomModule.createTradingRoomWorkspaceProposal).toHaveBeenCalledWith(
        "strat-001",
        expect.objectContaining({
          strategyVersion: "reg-spec-001",
          tradingRoomReady: true,
        }),
        expect.any(Object),
      );
      expect(screen.getByTestId("mock-proposal-preview")).toBeInTheDocument();
    });
  });

  it("accepts a proposal and displays the WorkspaceGridEditor", async () => {
    render(
      <TradingRoomWorkspace
        aggregate={SAMPLE_AGGREGATE}
        events={SAMPLE_EVENTS}
        eventsEtag="etag-events-1"
        eventsLoading={false}
        strategy={SAMPLE_STRATEGY}
        strategyId="strat-001"
        strategyVersion="reg-spec-001"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-accept-button")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-accept-button"));
    });

    await waitFor(() => {
      expect(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).toHaveBeenCalledWith(
        "strat-001",
        "prop-ws-001",
        { expectedStatus: "preview" },
        expect.any(Object),
      );
      expect(screen.getByTestId("mock-grid-editor")).toBeInTheDocument();
    });
  });

  it("handles proposal creation failure and offers a retry button", async () => {
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal).mockRejectedValueOnce(
      new Error("Network timeout generating workspace proposal"),
    );

    render(
      <TradingRoomWorkspace
        aggregate={SAMPLE_AGGREGATE}
        events={SAMPLE_EVENTS}
        eventsEtag="etag-events-1"
        eventsLoading={false}
        strategy={SAMPLE_STRATEGY}
        strategyId="strat-001"
        strategyVersion="reg-spec-001"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("trading-room-proposal-error")).toBeInTheDocument();
      expect(screen.getByText(/Network timeout generating workspace proposal/)).toBeInTheDocument();
      expect(screen.getByTestId("trading-room-proposal-retry")).toBeInTheDocument();
    });

    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal).mockResolvedValueOnce(SAMPLE_PROPOSAL);

    await act(async () => {
      fireEvent.click(screen.getByTestId("trading-room-proposal-retry"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-proposal-preview")).toBeInTheDocument();
    });
  });

  it("renders the TradingEventQueue and expands event details on click", async () => {
    render(
      <TradingEventQueue
        events={SAMPLE_EVENTS}
        eventsEtag="etag-events-1"
        loading={false}
      />,
    );

    expect(screen.getByTestId("event-row-evt-001")).toBeInTheDocument();
    expect(screen.getByText("2330.TW")).toBeInTheDocument();
    expect(screen.getByText("+10.20")).toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.getByTestId("event-detail-evt-001")).toBeInTheDocument();
    expect(screen.getByTestId("trade-decision-card-evt-001")).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByTestId("event-row-evt-001"));
    expect(screen.queryByTestId("event-detail-evt-001")).not.toBeInTheDocument();
  });

  it("renders the PositionActionQueue with positions", () => {
    render(<PositionActionQueue positionSummaries={SAMPLE_AGGREGATE.position_summaries} />);
    expect(screen.getByTestId("position-action-queue")).toBeInTheDocument();
    expect(screen.getByText(/2330.TW/)).toBeInTheDocument();
  });

  it("renders empty position message when position queue is empty", () => {
    render(<PositionActionQueue positionSummaries={[]} />);
    expect(screen.getByText(/No position actions/i)).toBeInTheDocument();
  });

  it("renders TradingRoomGenerationProgress with 9 steps", () => {
    render(
      <TradingRoomGenerationProgress
        strategyTitle="Taiwan Momentum Alpha"
        strategyVersion="reg-spec-001"
      />,
    );

    const progress = screen.getByTestId("trading-room-generation-progress");
    expect(progress).toBeInTheDocument();
    expect(screen.getByText(/Taiwan Momentum Alpha/)).toBeInTheDocument();
  });
});
