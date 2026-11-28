import React from "react";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TradingRoomWorkspace,
  PaperBookPanel,
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
import "@/i18n";
import { BffError } from "@/lib/bff-v1/errors";
import * as tradingRoomModule from "@/lib/bff-v1/agora/tradingRoom";
import { ensurePaperBook } from "@/lib/bff-v1/agora/paperBook";
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
  getTradingRoomPaperBook: vi.fn(),
  getTradingRoomWorkspaceByStrategyWithMeta: vi.fn(),
  listTradingRoomWorkspaceVersions: vi.fn(),
  patchTradingRoomWorkspaceLayout: vi.fn(),
  rollbackTradingRoomWorkspaceVersion: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/paperBook", () => ({ ensurePaperBook: vi.fn() }));

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

function bffErr(status: number, code = "RESOURCE_NOT_FOUND"): BffError {
  return new BffError(status, { error: { code, message: `err ${status}` } } as never);
}

const SAVED_RESULT: TradingRoomWorkspaceResult = {
  etag: '"saved-etag-v2"',
  workspace: { ...SAMPLE_WORKSPACE_RESULT.workspace, id: "trw_saved", dashboardVersion: 2 } as TradingRoomWorkspaceType,
};

function renderWs(strategyId = "strat-001", strategyVersion = "reg-spec-001") {
  return (
    <TradingRoomWorkspace
      aggregate={SAMPLE_AGGREGATE}
      events={SAMPLE_EVENTS}
      eventsEtag="etag-events-1"
      eventsLoading={false}
      strategy={SAMPLE_STRATEGY}
      strategyId={strategyId}
      strategyVersion={strategyVersion}
    />
  );
}

describe("TradingRoomWorkspace saved workspace restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal).mockResolvedValue(SAMPLE_PROPOSAL);
    vi.mocked(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).mockRejectedValue(bffErr(404));
  });
  afterEach(() => cleanup());

  it("restores the saved workspace on remount via GET with no proposal POST", async () => {
    vi.mocked(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).mockResolvedValue(SAVED_RESULT);
    const first = render(renderWs());
    await waitFor(() => expect(screen.getByTestId("mock-grid-editor")).toBeInTheDocument());
    first.unmount();
    render(renderWs());
    await waitFor(() => expect(screen.getByTestId("mock-grid-editor")).toBeInTheDocument());
    expect(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).toHaveBeenCalledWith("strat-001", "reg-spec-001");
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).not.toHaveBeenCalled();
    expect(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).not.toHaveBeenCalled();
  });

  it("creates the preview only after a genuine 404", async () => {
    render(renderWs());
    await waitFor(() => expect(screen.getByTestId("mock-proposal-preview")).toBeInTheDocument());
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "AUTH_REQUIRED"],
    [403, "PERMISSION_DENIED"],
    [409, "TENANT_SCOPE_MISMATCH"],
    [500, "INTERNAL_ERROR"],
    [503, "SERVICE_UNAVAILABLE"],
  ])("does not create a proposal on lookup status %s", async (status, code) => {
    vi.mocked(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).mockRejectedValue(bffErr(status, code));
    render(renderWs());
    await waitFor(() => expect(screen.getByTestId("trading-room-proposal-error")).toBeInTheDocument());
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).not.toHaveBeenCalled();
    expect(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).not.toHaveBeenCalled();
  });

  it("does not create a proposal on a network failure", async () => {
    vi.mocked(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).mockRejectedValue(new TypeError("Failed to fetch"));
    render(renderWs());
    await waitFor(() => expect(screen.getByTestId("trading-room-proposal-error")).toBeInTheDocument());
    expect(tradingRoomModule.createTradingRoomWorkspaceProposal).not.toHaveBeenCalled();
  });

  it("ignores a late response from the previous strategy", async () => {
    let resolveOld: (v: TradingRoomWorkspaceResult) => void = () => undefined;
    vi.mocked(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).mockImplementation((id: string) =>
      id === "strat-old"
        ? new Promise<TradingRoomWorkspaceResult>((r) => {
            resolveOld = r;
          })
        : Promise.reject(bffErr(404)),
    );
    const view = render(renderWs("strat-old"));
    view.rerender(renderWs("strat-new"));
    await waitFor(() => expect(screen.getByTestId("mock-proposal-preview")).toBeInTheDocument());
    await act(async () => {
      resolveOld(SAVED_RESULT);
    });
    expect(screen.queryByTestId("mock-grid-editor")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-proposal-preview")).toBeInTheDocument();
  });

  it("explicit regeneration creates a new proposal without restoring", async () => {
    render(renderWs());
    await waitFor(() => expect(screen.getByTestId("mock-proposal-preview")).toBeInTheDocument());
    vi.mocked(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).mockResolvedValue(SAVED_RESULT);
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-regen-button"));
    });
    await waitFor(() => expect(tradingRoomModule.createTradingRoomWorkspaceProposal).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("mock-grid-editor")).not.toBeInTheDocument();
  });
});

describe("TradingRoomWorkspace component suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tradingRoomModule.createTradingRoomWorkspaceProposal).mockResolvedValue(SAMPLE_PROPOSAL);
    vi.mocked(tradingRoomModule.acceptTradingRoomWorkspaceProposalWithMeta).mockResolvedValue(SAMPLE_WORKSPACE_RESULT);
    vi.mocked(tradingRoomModule.getTradingRoomWorkspaceByStrategyWithMeta).mockRejectedValue(bffErr(404));
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
    expect(screen.getByText("沒有未平倉部位。")).toBeInTheDocument();
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
    expect(screen.getByText("交易僕人正在建立「Taiwan Momentum Alpha」交易操盤室")).toBeInTheDocument();
  });

  it("renders read-only paper book fills and positions with pantheon_paper_proxy and no order action (AC4)", () => {
    render(
      <PositionActionQueue
        paperBook={{
          agora_user_id: "admintest",
          as_of: "2026-11-27T08:00:00Z",
          settlement_source: "pantheon_paper_proxy",
          execution_authority: "none",
          no_order_route_proof: "agora_paper_book_readback_only",
          summary: {
            open_position_count: 1,
            fill_count: 1,
            realized_pnl: 0,
            unrealized_pnl: 15000,
          },
          positions: [
            {
              position_id: "pos-2330",
              symbol: "2330.TW",
              side: "long",
              quantity: 1000,
              avg_entry_price: 940,
              mark_price: 955,
              unrealized_pnl: 15000,
              settlement_source: "pantheon_paper_proxy",
            },
          ],
          fills: [
            {
              fill_id: "fill-2330-01",
              symbol: "2330.TW",
              side: "buy",
              quantity: 1000,
              price: 940,
              filled_at: "2026-11-27T01:30:00Z",
              settlement_source: "pantheon_paper_proxy",
            },
          ],
        }}
        positionSummaries={[]}
      />,
    );

    expect(screen.getByTestId("paper-book-proxy-badge").textContent).toContain("pantheon_paper_proxy");
    expect(screen.getByTestId("paper-book-no-order-action").textContent).toContain(
      "僅供唯讀檢視 · 無任何下單按鈕",
    );
    expect(screen.getByTestId("paper-book-positions-list").textContent).toContain("2330.TW");
    expect(screen.getByTestId("paper-book-fills-list").textContent).toContain("fill-2330-01");
    expect(
      screen.getByTestId("position-action-queue").querySelectorAll("button").length,
    ).toBe(0);
  });
});

describe("Paper book first use", () => {
  const read = vi.mocked(tradingRoomModule.getTradingRoomPaperBook);
  const ensure = vi.mocked(ensurePaperBook);
  beforeEach(() => {
    vi.resetAllMocks();
    read.mockResolvedValue(null);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("offers explicit setup for a missing book and never ensures on mount", async () => {
    render(<PaperBookPanel />);
    expect(await screen.findByRole("button", { name: "開通我的 paper 帳本" })).toBeEnabled();
    expect(screen.getByText(/營運者設定的起始資金/)).toHaveTextContent("名目模擬資金，不是真實金錢");
    expect(ensure).not.toHaveBeenCalled();
  });

  it("sends one attempt during a two-minute wait, then re-reads and hides setup", async () => {
    let finish!: () => void;
    ensure.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<PaperBookPanel strategyId="strat-001" />);
    const button = await screen.findByTestId("paper-book-ensure");
    vi.useFakeTimers();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(ensure).toHaveBeenCalledTimes(1);
    const key = ensure.mock.calls[0][0];
    expect(key).toMatch(/^[\da-f-]{36}$/);
    expect(button).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(screen.getByRole("status")).toHaveTextContent("可能需要約兩分鐘");
    expect(ensure.mock.calls[0][0]).toBe(key);
    read.mockResolvedValue({ fills: [], positions: [] } as unknown as Awaited<ReturnType<typeof read>>);
    await act(async () => { finish(); });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith({ strategyId: "strat-001" });
    expect(screen.queryByTestId("paper-book-ensure")).not.toBeInTheDocument();
  });

  it.each(["conflict", "timeout"])("shows %s reason and retries with a new attempt key", async (kind) => {
    const error = kind === "timeout"
      ? new DOMException("deadline", "TimeoutError")
      : new BffError(409, { error: { code: "STATE_CONFLICT", message: "Provisioning failed", details: { error: "paper_only" }, i18nKey: "errors.STATE_CONFLICT", retryable: true, userActionable: true, correlationId: "test" } });
    ensure.mockRejectedValueOnce(error).mockImplementation(() => new Promise(() => {}));
    render(<PaperBookPanel />);
    fireEvent.click(await screen.findByTestId("paper-book-ensure"));
    expect(await screen.findByRole("alert")).toHaveTextContent(kind === "timeout" ? "paper_book_ensure_timeout" : "409 · STATE_CONFLICT · paper_only");
    fireEvent.click(screen.getByRole("button", { name: "重試開通我的 paper 帳本" }));
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(ensure.mock.calls[1][0]).not.toBe(ensure.mock.calls[0][0]);
  });

  it("keeps the existing book readback without a setup action", async () => {
    read.mockResolvedValue({ fills: [], positions: [] } as unknown as Awaited<ReturnType<typeof read>>);
    render(<PaperBookPanel />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByTestId("paper-book-ensure")).not.toBeInTheDocument();
    expect(screen.getByTestId("paper-book-fills-empty")).toBeInTheDocument();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("read failures offer a read retry without provisioning", async () => {
    read.mockRejectedValueOnce(new Error("network_down"));
    render(<PaperBookPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("network_down");
    expect(screen.queryByTestId("paper-book-ensure")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新讀取帳本" }));
    expect(await screen.findByTestId("paper-book-ensure")).toBeEnabled();
    expect(ensure).not.toHaveBeenCalled();
  });
});
