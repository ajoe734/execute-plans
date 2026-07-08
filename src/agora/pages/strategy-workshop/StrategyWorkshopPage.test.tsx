import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";
import type { StrategyReadinessAssessment } from "@/lib/bff-v1/agora/workshops";

vi.mock("@/lib/bff-v1/agora/workshops", () => ({
  listWorkshops: vi.fn().mockResolvedValue([]),
  getWorkshop: vi.fn().mockResolvedValue(null),
  getWorkshopCompleteness: vi.fn().mockResolvedValue(null),
  getWorkshopReadiness: vi.fn().mockResolvedValue(null),
  listWorkshopCards: vi.fn().mockResolvedValue([]),
  listWorkshopEvents: vi.fn().mockResolvedValue({ items: [] }),
  postWorkshopMessage: vi.fn().mockResolvedValue({
    message_id: "msg-001",
    workshop_id: "ws-abc",
    created_at: "2026-07-08T00:00:00Z",
  }),
  openWorkshopStream: vi.fn().mockReturnValue(() => undefined),
}));

import { StrategyWorkshopPage } from "./StrategyWorkshopPage";
import * as workshopsModule from "@/lib/bff-v1/agora/workshops";

const MOCK_WORKSHOP = {
  spec_version: "1.0",
  workshop_id: "ws-001",
  operator_id: "operator-001",
  status: "open",
  subject: {
    kind: "free_form",
    ref: "strategy-draft-001",
    title: "Momentum draft",
  },
  created_at: "2026-06-01T00:00:00Z",
} satisfies StrategyWorkshop;

const TRADING_ROOM_READY = {
  assessment_id: "ready-001",
  assessed_at: "2026-07-04T00:00:00Z",
  blockers: [],
  gate: "trading_room",
  highest_ready_gate: "trading_room",
  passed: true,
  strategy_id: "strat-001",
  strategy_spec_registry_id: "reg-001",
  workshop_version_id: "wsv-001",
  workshop_id: "ws-abc",
} as StrategyReadinessAssessment & { highest_ready_gate: "trading_room" };

const BLOCKED_READINESS = {
  ...TRADING_ROOM_READY,
  assessment_id: "ready-blocked-001",
  blockers: ["Full validation is incomplete"],
  gate: "full_validation",
  highest_ready_gate: "full_validation",
  passed: true,
} as StrategyReadinessAssessment & { highest_ready_gate: "full_validation" };

const MISSING_STRATEGY_ID_READINESS = {
  ...TRADING_ROOM_READY,
  assessment_id: "ready-missing-strategy",
  strategy_id: undefined,
} as StrategyReadinessAssessment & { highest_ready_gate: "trading_room" };

afterEach(cleanup);

describe("StrategyWorkshopPage", () => {
  beforeEach(() => {
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(null as any);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.listWorkshopEvents).mockResolvedValue({ items: [] });
    vi.mocked(workshopsModule.postWorkshopMessage).mockResolvedValue({
      message_id: "msg-001",
      workshop_id: "ws-abc",
      created_at: "2026-07-08T00:00:00Z",
    });
    vi.mocked(workshopsModule.openWorkshopStream).mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the list view when no workshopId is provided", () => {
    vi.mocked(workshopsModule.listWorkshops).mockReturnValue(new Promise(() => {}));
    render(<StrategyWorkshopPage />);
    expect(screen.getByTestId("strategy-workshop-page-list")).toBeDefined();
  });

  it("shows loading state while fetching workshops", () => {
    vi.mocked(workshopsModule.listWorkshops).mockReturnValue(new Promise(() => {}));
    render(<StrategyWorkshopPage />);
    expect(screen.getByTestId("workshop-list-loading")).toBeDefined();
  });

  it("shows empty state after workshops resolve to empty", async () => {
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([]);
    render(<StrategyWorkshopPage />);
    await screen.findByTestId("workshop-list-empty");
  });

  it("shows workshop list items when workshops are returned", async () => {
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([MOCK_WORKSHOP]);
    render(<StrategyWorkshopPage />);
    await screen.findByTestId("workshop-list");
    expect(screen.getByTestId("workshop-list")).toBeDefined();
    expect(screen.getByText("Momentum draft")).toBeDefined();
  });

  it("auto-selects the newest live workshop and renders the session runtime instead of a raw uuid list", async () => {
    const rawWorkshopId = "3f6d1a7e-91c9-4c25-90be-c7a3ef9776e6";
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([
      {
        spec_version: "1.0",
        workshop_id: rawWorkshopId,
        operator_id: "operator-001",
        status: "open",
        subject: {
          kind: "free_form",
          ref: rawWorkshopId,
        },
        created_at: "2026-07-08T00:00:00Z",
        metadata: { updated_at: "2026-07-08T00:00:00Z" },
      } as StrategyWorkshop,
    ]);
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: rawWorkshopId,
      operator_id: "operator-001",
      status: "open",
      subject: {
        kind: "free_form",
        ref: rawWorkshopId,
        title: "Live Strategy Workshop",
      },
      created_at: "2026-07-08T00:00:00Z",
    } as StrategyWorkshop);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([
      {
        card_id: "card-001",
        card_type: "next_question",
        workshop_id: rawWorkshopId,
        sequence_no: 1,
        status: "action_required",
        title: "Define entry rule",
        payload: {},
        created_at: "2026-07-08T00:00:00Z",
      },
    ]);
    vi.mocked(workshopsModule.listWorkshopEvents).mockResolvedValue({
      items: [
        {
          event_id: "event-001",
          workshop_id: rawWorkshopId,
          event_type: "workshop.message.accepted",
          payload: {},
          occurred_at: "2026-07-08T00:00:00Z",
        },
      ],
    });

    render(<StrategyWorkshopPage />);

    await screen.findByTestId("selected-workshop-runtime");
    await screen.findByText("Live Strategy Workshop");

    expect(workshopsModule.getWorkshop).toHaveBeenCalledWith(rawWorkshopId);
    expect(workshopsModule.listWorkshopCards).toHaveBeenCalledWith(rawWorkshopId);
    expect(workshopsModule.listWorkshopEvents).toHaveBeenCalledWith(rawWorkshopId);
    expect(screen.getByTestId("workshop-card-summary").textContent).toContain("Cards: 1");
    expect(screen.getByTestId("workshop-event-summary").textContent).toContain("Events: 1");
    expect(screen.queryByText(rawWorkshopId)).toBeNull();
  });

  it("selects another workshop from the live list and loads that runtime", async () => {
    const older = { ...MOCK_WORKSHOP, workshop_id: "ws-old", created_at: "2026-06-01T00:00:00Z" };
    const newer = {
      ...MOCK_WORKSHOP,
      workshop_id: "ws-new",
      subject: { ...MOCK_WORKSHOP.subject, title: "Newest draft" },
      created_at: "2026-07-08T00:00:00Z",
    };
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([older, newer]);
    vi.mocked(workshopsModule.getWorkshop).mockImplementation(async (workshopId) => ({
      ...MOCK_WORKSHOP,
      workshop_id: workshopId,
      subject: {
        ...MOCK_WORKSHOP.subject,
        title: workshopId === "ws-old" ? "Older draft" : "Newest draft",
      },
    }));

    render(<StrategyWorkshopPage />);

    await screen.findByText("Newest draft");
    fireEvent.click(screen.getByTestId("workshop-item-ws-old"));

    await waitFor(() => {
      expect(workshopsModule.getWorkshop).toHaveBeenCalledWith("ws-old");
    });
    await screen.findByText("Older draft");
  });

  it("renders the session view when workshopId is provided", () => {
    vi.mocked(workshopsModule.getWorkshop).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopCards).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopEvents).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("strategy-workshop-page-session")).toBeDefined();
  });

  it("renders the conversation and completeness rail in session view", () => {
    vi.mocked(workshopsModule.getWorkshop).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopCards).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopEvents).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("workshop-conversation")).toBeDefined();
    expect(screen.getByTestId("completeness-rail")).toBeDefined();
  });

  it("renders the servant composer in session view", () => {
    vi.mocked(workshopsModule.getWorkshop).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopCards).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopEvents).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("servant-composer")).toBeDefined();
  });

  it("posts servant composer messages through the BFF module and refreshes the runtime projection", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    fireEvent.change(screen.getByPlaceholderText("Message the workshop servant…"), {
      target: { value: "What evidence is missing?" },
    });
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    await waitFor(() => {
      expect(workshopsModule.postWorkshopMessage).toHaveBeenCalledWith("ws-abc", {
        content: "What evidence is missing?",
      });
    });
    expect(workshopsModule.listWorkshopCards).toHaveBeenCalledTimes(2);
    expect(workshopsModule.listWorkshopEvents).toHaveBeenCalledTimes(2);
  });

  it("enables Add to Trading Room only when the trading-room readiness gate passes and a route handler exists", async () => {
    const onAddToTradingRoom = vi.fn();
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(TRADING_ROOM_READY);

    render(<StrategyWorkshopPage onAddToTradingRoom={onAddToTradingRoom} workshopId="ws-abc" />);

    const button = await screen.findByTestId("add-to-trading-room-btn");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);

    expect(onAddToTradingRoom).toHaveBeenCalledTimes(1);
    expect(onAddToTradingRoom).toHaveBeenCalledWith({
      assessedAt: "2026-07-04T00:00:00Z",
      readinessAssessmentId: "ready-001",
      readinessGate: "trading_room",
      strategyId: "strat-001",
      strategyVersion: "reg-001",
      workshopId: "ws-abc",
      workshopVersionId: "wsv-001",
    });
  });

  it("keeps Add to Trading Room disabled when live readiness is blocked before trading_room", async () => {
    const onAddToTradingRoom = vi.fn();
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(BLOCKED_READINESS);

    render(<StrategyWorkshopPage onAddToTradingRoom={onAddToTradingRoom} workshopId="ws-abc" />);

    const button = await screen.findByTestId("add-to-trading-room-btn");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("add-to-trading-room-reason").textContent).toContain("full_validation");
    fireEvent.click(button);
    expect(onAddToTradingRoom).not.toHaveBeenCalled();
  });

  it("keeps Add to Trading Room disabled when readiness lacks a strategy id", async () => {
    const onAddToTradingRoom = vi.fn();
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(MISSING_STRATEGY_ID_READINESS);

    render(<StrategyWorkshopPage onAddToTradingRoom={onAddToTradingRoom} workshopId="ws-abc" />);

    const button = await screen.findByTestId("add-to-trading-room-btn");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("add-to-trading-room-reason").textContent).toContain("missing strategy id");
    fireEvent.click(button);
    expect(onAddToTradingRoom).not.toHaveBeenCalled();
  });

  it("keeps Add to Trading Room disabled when the route handler is missing", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(TRADING_ROOM_READY);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    const button = await screen.findByTestId("add-to-trading-room-btn");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  });

  it("calls listWorkshops through the BFF module (not direct fetch)", () => {
    vi.mocked(workshopsModule.listWorkshops).mockReturnValue(new Promise(() => {}));
    render(<StrategyWorkshopPage />);
    expect(workshopsModule.listWorkshops).toHaveBeenCalled();
  });
});
