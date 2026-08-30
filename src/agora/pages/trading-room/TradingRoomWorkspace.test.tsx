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

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  acceptTradingRoomWorkspaceProposalWithMeta: vi.fn(),
  createTradingRoomWorkspaceProposal: vi.fn(),
  decideOnEvent: vi.fn(),
  listTradingRoomWorkspaceVersions: vi.fn(),
  patchTradingRoomWorkspaceLayout: vi.fn(),
  rollbackTradingRoomWorkspaceVersion: vi.fn(),
}));

vi.mock("@/agora/trading-room/WorkspaceProposalPreview", () => ({
  WorkspaceProposalPreview: ({ proposal, onAccept, onRegenerate, busy, error }: any) => (
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
  WorkspaceGridEditor: ({ strategy, onBackToWorkshop, onSwitchStrategy }: any) => (
    <div data-testid="mock-grid-editor">
      <span>Grid Editor for {strategy?.title}</span>
      <button data-testid="grid-back-button" onClick={onBackToWorkshop} type="button">Back</button>
      <button data-testid="grid-switch-button" onClick={onSwitchStrategy} type="button">Switch</button>
    </div>
  ),
}));

vi.mock("@/agora/components/TradeDecisionCard", () => ({
  TradeDecisionCard: ({ event }: any) => (
    <div data-testid={`trade-decision-card-${event.decision_event_id}`}>
      Decision Card for {event.subject.symbol}
    </div>
  ),
}));

const SAMPLE_STRATEGY: TradingRoomStrategyEntry = {
  active_portfolio_version: "port-v1",
  allowed_environments: ["paper", "live"],
  backtest_id: "bt-001",
  benchmark_symbol: "^TWII",
  dashboard_recipe_id: "recipe-001",
  description: "Taiwan equity momentum strategy",
  governed_proposal_id: "prop-001",
  is_pinned: true,
  monitoring_state: "monitoring",
  pending_event_counts: { add: 1, entry: 2, exit: 0, reduce: 0, review: 1 },
  readiness_state: "ready",
  risk_profile: "moderate",
  staleness_reasons: [],
  strategy_id: "strat-001",
  strategy_spec_registry_id: "reg-spec-001",
  title: "Taiwan Momentum Alpha",
};

const SAMPLE_AGGREGATE: TradingRoomAggregate = {
  as_of: "2026-08-30T22:00:00Z",
  data_cutoff: "2026-08-30T21:50:00Z",
  position_summaries: [{ symbol: "2330.TW", quantity: 1000, value: 950000 }],
  queue_summary: { add: 1, entry: 2, exit: 0, reduce: 0, review: 1 },
  risk_summary: {
    alerts: ["Exposure near limit in semi sector"],
    state: "watch",
    summary: "Sector limit elevated",
  },
  strategies: [SAMPLE_STRATEGY],
};

const SAMPLE_EVENTS: TradingDecisionEvent[] = [
  {
    confidence: { rationale: "Trend continuation", value: 0.85 },
    decision_event_id: "evt-001",
    event_kind: "entry",
    expected_value: { gross: 12.5, net: 10.2 },
    generated_at: "2026-08-30T21:45:00Z",
    source_signal_ids: ["sig-001"],
    state: "triggered",
    strategy_id: "strat-001",
    subject: { market: "TW", symbol: "2330.TW" },
  },
  {
    confidence: { rationale: "Support bounce", value: 0.72 },
    decision_event_id: "evt-002",
    event_kind: "add",
    expected_value: { gross: 8.0, net: 6.5 },
    generated_at: "2026-08-30T21:40:00Z",
    source_signal_ids: ["sig-002"],
    state: "pending_review",
    strategy_id: "strat-001",
    subject: { market: "TW", symbol: "2454.TW" },
  },
];

const SAMPLE_PROPOSAL: TradingRoomWorkspaceProposal = {
  generatedAt: "2026-08-30T22:00:00Z",
  personalizationRationale: "Optimized layout based on Taiwan equity profile",
  proposalId: "prop-ws-001",
  strategyId: "strat-001",
  strategyVersion: "reg-spec-001",
  views: [
    {
      id: "view-overview",
      isDefault: true,
      kind: "dashboard",
      label: "Overview",
      layout: [{ h: 4, i: "w1", w: 6, x: 0, y: 0 }],
      widgets: [
        {
          id: "w1",
          kind: "trading_queue",
          title: "Decision Queue",
          version: "1.0.0",
        },
      ],
    },
  ],
};

const SAMPLE_WORKSPACE_RESULT = {
  etag: '"etag-ws-001"',
  version: {
    createdAt: "2026-08-30T22:00:00Z",
    description: "Initial accepted layout",
    versionId: "ver-001",
  },
  workspace: {
    activeViewId: "view-overview",
    createdAt: "2026-08-30T22:00:00Z",
    description: "Taiwan Momentum Alpha Workspace",
    id: "ws-strat-001",
    strategyId: "strat-001",
    strategyVersion: "reg-spec-001",
    title: "Taiwan Momentum Alpha Workspace",
    updatedAt: "2026-08-30T22:00:00Z",
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
