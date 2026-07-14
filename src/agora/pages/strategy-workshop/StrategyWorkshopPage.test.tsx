import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategyWorkshop, WorkshopCard } from "@/lib/bff-v1/agora/types";
import type {
  WorkshopCard as WorkshopCardSchema,
  WorkshopCompletenessSnapshot,
  WorkshopReadinessAssessment,
  WorkshopStreamEvent,
} from "@/lib/bff-v1/agora/workshops";

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

vi.mock("@/lib/bff-v1/agora/interaction", () => ({
  interaction: {
    resolveContext: vi.fn().mockResolvedValue({ data: { workshop_id: "ws-abc", context_refs: [{ type: "persona", id: "per_quant" }], verified: true } }),
    participants: vi.fn().mockResolvedValue({
      data: {
        included: [
          { persona_id: "per_quant", display_name: "Quant Architect", eligible: true, reasons: [], recommended: true },
          { persona_id: "per_macro", display_name: "Macro Strategist", eligible: true, reasons: [], recommended: true },
          { persona_id: "per_risk", display_name: "Risk Officer", eligible: true, reasons: [], recommended: true },
          { persona_id: "per_red", display_name: "Red Team", eligible: true, reasons: [], recommended: false },
        ],
        excluded: [],
      },
    }),
    submit: vi.fn().mockResolvedValue({ data: { execution_authority: "none" } }),
  },
}));

vi.mock("@/agora/useAgoraWriteAccess", () => ({
  useAgoraWriteAccess: () => ({
    actorId: "operator-001",
    agoraCapabilities: ["agora.workshop.v1"],
    capabilities: ["agora.workshop.v1"],
    roles: ["operator"],
    loading: false,
    interactionAllowed: true,
    interactionDisabledReason: null,
    writeAllowed: true,
    writeDisabledReason: null,
  }),
}));

vi.mock("@/agora/components/ConnectedGovernedProposalCard", () => ({
  ConnectedGovernedProposalCard: ({ proposalId }: { proposalId: string }) => (
    <div data-testid="connected-governed-proposal">{proposalId}</div>
  ),
}));

import { StrategyWorkshopPage } from "./StrategyWorkshopPage";
import { pickerParticipants } from "@/agora/participantPicker";
import * as workshopsModule from "@/lib/bff-v1/agora/workshops";
import { interaction } from "@/lib/bff-v1/agora/interaction";

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
} as WorkshopReadinessAssessment & { highest_ready_gate: "trading_room" };

const BLOCKED_READINESS = {
  ...TRADING_ROOM_READY,
  assessment_id: "ready-blocked-001",
  blockers: ["Full validation is incomplete"],
  gate: "full_validation",
  highest_ready_gate: "full_validation",
  passed: true,
} as WorkshopReadinessAssessment & { highest_ready_gate: "full_validation" };

const MISSING_STRATEGY_ID_READINESS = {
  ...TRADING_ROOM_READY,
  assessment_id: "ready-missing-strategy",
  strategy_id: undefined,
} as WorkshopReadinessAssessment & { highest_ready_gate: "trading_room" };

const LIVE_COMPLETENESS_SNAPSHOT: WorkshopCompletenessSnapshot = {
  snapshot_id: "8f7dc9e4-108f-4067-8d05-9cad30c7e17a",
  workshop_id: "b888fb96-12b4-46e1-8def-ffe4f29b5ad7",
  strategy_version_id: "full003-postdeploy-1783268578-f4b6f0-v1",
  state_map_json: {
    data_pit: "confirmed",
    liquidity: "confirmed",
    entry_signal: "confirmed",
    universe_rule: "confirmed",
    position_sizing: "confirmed",
    risk_constraints: "confirmed",
    exit_invalidation: "confirmed",
  },
  blocking_items_json: [],
  next_question_json: {},
  created_at: "2026-07-05 16:22:58+00",
};

const LIVE_COMPLETENESS_CARD: WorkshopCard = {
  card_id: "card_completeness_8f7dc9e4-108f-4067-8d05-9cad30c7e17a",
  card_type: "completeness_update",
  workshop_id: LIVE_COMPLETENESS_SNAPSHOT.workshop_id,
  sequence_no: 2,
  status: "completed",
  title: "Strategy completeness updated",
  payload: {
    overall_grade: "complete",
    dimension_updates: Object.entries(LIVE_COMPLETENESS_SNAPSHOT.state_map_json).map(
      ([dimension, current_grade]) => ({ dimension, current_grade }),
    ),
    blockers: [],
    research_ready: true,
  },
  created_at: LIVE_COMPLETENESS_SNAPSHOT.created_at,
};

afterEach(cleanup);

describe("StrategyWorkshopPage", () => {
  it("uses truthful eligibility-order pickers without inferring style or role from names", () => {
    const included = [
      { persona_id: "persona-z", display_name: "Red Team-ish Name", eligible: true, reasons: [], recommended: false },
      { persona_id: "persona-a", display_name: "Same Style-ish Name", eligible: true, reasons: [], recommended: false },
      { persona_id: "persona-b", display_name: "Risk Committee-ish Name", eligible: true, reasons: [], recommended: false },
    ];
    expect(pickerParticipants("eligible-one", included)).toEqual(["persona-z"]);
    expect(pickerParticipants("eligible-two", included)).toEqual(["persona-z", "persona-a"]);
    expect(pickerParticipants("eligible-three", included)).toEqual(["persona-z", "persona-a", "persona-b"]);
    expect(pickerParticipants("named", included, ["persona-b"])).toEqual(["persona-b"]);
    expect(pickerParticipants("named", included, ["missing-persona"])).toEqual([]);
    expect(pickerParticipants("eligible-two", included, ["persona-b"])).toEqual(["persona-z", "persona-a"]);
  });

  beforeEach(() => {
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshop).mockRejectedValue(new Error("No workshop fixture"));
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
    await waitFor(() => {
      expect(screen.getByTestId("strategy-workshop-runtime-header").getAttribute("aria-label")).toBe(
        "Live Strategy Workshop status",
      );
    });

    expect(workshopsModule.getWorkshop).toHaveBeenCalledWith(rawWorkshopId);
    expect(workshopsModule.listWorkshopCards).toHaveBeenCalledWith(rawWorkshopId);
    expect(workshopsModule.listWorkshopEvents).toHaveBeenCalledWith(rawWorkshopId);
    expect(screen.getByTestId("workshop-card-summary").textContent).toContain("Cards: 1");
    expect(screen.getByTestId("workshop-event-summary").textContent).toContain("Events: 1");
    expect(screen.getByTestId("strategy-workshop-runtime-header").textContent).not.toContain(
      "Live Strategy Workshop",
    );
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
      expect(screen.getByTestId("strategy-workshop-runtime-header").getAttribute("aria-label")).toBe(
        "Older draft status",
      );
    });
    expect(screen.queryByText("Older draft")).toBeNull();
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

  it("keeps the hosted raw snapshot rail aligned with its latest completeness card", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      ...MOCK_WORKSHOP,
      workshop_id: LIVE_COMPLETENESS_SNAPSHOT.workshop_id,
    });
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(LIVE_COMPLETENESS_SNAPSHOT);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([LIVE_COMPLETENESS_CARD]);

    render(<StrategyWorkshopPage workshopId={LIVE_COMPLETENESS_SNAPSHOT.workshop_id} />);

    expect((await screen.findByTestId("completeness-overall-grade")).textContent).toBe("Complete");
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.queryByText("NaN%")).toBeNull();
    expect(screen.getByTestId("completeness-grade").textContent).toBe("complete");
    expect(screen.getByText("Strategy completeness updated")).toBeDefined();
    expect(screen.getByText("Overall grade").nextElementSibling?.textContent).toBe("complete");
    expect(
      screen.getAllByText("Research ready")
        .some((label) => label.nextElementSibling?.textContent === "Yes"),
    ).toBe(true);
  });

  it("refreshes the raw snapshot and derived card together after completeness events", async () => {
    let handleEvent: ((event: WorkshopStreamEvent) => void) | undefined;
    vi.mocked(workshopsModule.openWorkshopStream).mockImplementation((_workshopId, onEvent) => {
      handleEvent = onEvent;
      return () => undefined;
    });
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(LIVE_COMPLETENESS_SNAPSHOT);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([LIVE_COMPLETENESS_CARD]);

    render(<StrategyWorkshopPage workshopId={LIVE_COMPLETENESS_SNAPSHOT.workshop_id} />);

    await waitFor(() => expect(handleEvent).toBeDefined());
    expect(workshopsModule.getWorkshopCompleteness).toHaveBeenCalledTimes(1);
    expect(workshopsModule.listWorkshopCards).toHaveBeenCalledTimes(1);

    act(() => {
      handleEvent?.({
        event_id: "event-completeness-updated-001",
        event_type: "workshop.completeness.updated",
        occurred_at: "2026-07-13T12:38:05Z",
        payload: {},
        workshop_id: LIVE_COMPLETENESS_SNAPSHOT.workshop_id,
      });
    });

    await waitFor(() => {
      expect(workshopsModule.getWorkshopCompleteness).toHaveBeenCalledTimes(2);
      expect(workshopsModule.listWorkshopCards).toHaveBeenCalledTimes(2);
    });
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

  it("resolves canonical context, rechecks eligibility, and submits a no-authority Persona interaction", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    fireEvent.change(await screen.findByTestId("servant-composer-input"), {
      target: { value: "What evidence is missing?" },
    });
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    await waitFor(() => {
      expect(interaction.resolveContext).toHaveBeenCalledWith(expect.objectContaining({
        workshop_id: "ws-abc",
        context_refs: expect.arrayContaining([{ type: "persona", id: "per_quant" }]),
      }));
      expect(interaction.participants).toHaveBeenCalledWith(expect.objectContaining({ workshop_id: "ws-abc", mode: "ask" }));
      expect(interaction.submit).toHaveBeenCalledWith(expect.objectContaining({
        workshop_id: "ws-abc",
        mode: "ask",
        topic: "What evidence is missing?",
        participant_persona_ids: ["per_quant", "per_macro", "per_risk"],
      }));
    });
    expect(workshopsModule.listWorkshopCards).toHaveBeenCalledTimes(2);
    expect(workshopsModule.listWorkshopEvents).toHaveBeenCalledTimes(2);
  });

  it("uses the live session's immutable strategy pointers for propose-action context", async () => {
    const liveSession = {
      ...MOCK_WORKSHOP,
      active_strategy_spec_registry_id: "strategy-registry-9",
      selected_version_id: "immutable-version-4",
    } as StrategyWorkshop;
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(liveSession);
    vi.mocked(interaction.resolveContext).mockImplementationOnce(async (body) => ({
      data: {
        workshop_id: "ws-abc",
        context_refs: body.context_refs,
        verified: true,
      },
    } as Awaited<ReturnType<typeof interaction.resolveContext>>));

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    fireEvent.change(await screen.findByTestId("servant-composer-input"), {
      target: { value: "Propose a bounded candidate measure" },
    });
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    await waitFor(() => expect(interaction.resolveContext).toHaveBeenCalledWith(expect.objectContaining({
      workshop_id: "ws-abc",
      context_refs: expect.arrayContaining([{
        type: "strategy",
        id: "strategy-registry-9",
        version_id: "immutable-version-4",
      }]),
    })));
  });

  it("fails closed when a deep-linked Persona is no longer eligible", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);
    vi.mocked(interaction.participants).mockResolvedValueOnce({
      data: { included: [], excluded: [{ persona_id: "per_quant", display_name: "Quant", eligible: false, reasons: ["capability_missing"], recommended: false }] },
    });

    render(<StrategyWorkshopPage entry={{ mode: "ask", participantIds: ["per_quant"], picker: "named" }} workshopId="ws-abc" />);
    await waitFor(() => expect(screen.getByTestId("eligibility-explanation").textContent).toContain("0 canonical eligible"));
    expect(screen.getByTestId("servant-composer-submit")).toBeDisabled();
  });

  it("rejects an interaction response that claims execution authority", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);
    vi.mocked(interaction.submit).mockResolvedValueOnce({
      data: { interaction_id: "interaction-unsafe", execution_authority: "orders" },
    } as never);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    fireEvent.change(await screen.findByTestId("servant-composer-input"), {
      target: { value: "Place this trade directly" },
    });
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    expect(await screen.findByTestId("servant-composer-error")).toHaveTextContent(
      "The interaction response violated the no-execution authority boundary.",
    );
    expect(workshopsModule.listWorkshopCards).toHaveBeenCalledTimes(1);
    expect(workshopsModule.listWorkshopEvents).toHaveBeenCalledTimes(1);
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

  it("renders the Context Bar, Mode Selector, and Participant Picker in session view", () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: "ws-abc",
      operator_id: "operator-001",
      status: "open",
      subject: { kind: "strategy_spec", ref: "stg_001", title: "Quant Alpha" },
      created_at: "2026-06-01T00:00:00Z",
    } as unknown as StrategyWorkshop);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("context-bar")).toBeDefined();
    expect(screen.getByTestId("mode-selector")).toBeDefined();
    expect(screen.getByTestId("participant-picker")).toBeDefined();
    expect(screen.getByTestId("eligibility-explanation")).toBeDefined();
  });

  it("keeps the live session renderable when a legacy workshop omits its subject", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: "ws-legacy",
      operator_id: "operator-001",
      status: "open",
      created_at: "2026-06-01T00:00:00Z",
    } as unknown as StrategyWorkshop);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-legacy" />);

    const contextBar = await screen.findByTestId("context-bar");
    expect(contextBar.textContent).toContain("Subject: none (none)");
    expect(screen.getByTestId("strategy-workshop-page-session")).toBeDefined();
  });

  it("renders only the governed proposal explicitly linked by the route", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);

    render(<StrategyWorkshopPage governedProposalId="prop-pint-010" workshopId="ws-abc" />);

    expect(await screen.findByTestId("connected-governed-proposal")).toHaveTextContent("prop-pint-010");
  });

  it("renders warning banners when stale/degraded/denied triggers are toggled", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: "ws-abc",
      operator_id: "operator-001",
      status: "open",
      subject: { kind: "strategy_spec", ref: "stg_001", title: "Quant Alpha" },
      created_at: "2026-06-01T00:00:00Z",
    } as unknown as StrategyWorkshop);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    
    // Simulate user clicking on state toggle buttons using fireEvent and findBy
    const staleBtn = screen.getByTestId("toggle-stale-btn");
    fireEvent.click(staleBtn);
    expect(await screen.findByTestId("warning-stale")).toBeDefined();

    const degradedBtn = screen.getByTestId("toggle-degraded-btn");
    fireEvent.click(degradedBtn);
    expect(await screen.findByTestId("warning-degraded")).toBeDefined();

    const deniedBtn = screen.getByTestId("toggle-denied-btn");
    fireEvent.click(deniedBtn);
    expect(await screen.findByTestId("warning-denied")).toBeDefined();
  });

  it("renders independent persona opinions and debates in cards list", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: "ws-abc",
      operator_id: "operator-001",
      status: "open",
      subject: { kind: "strategy_spec", ref: "stg_001", title: "Quant Alpha" },
      created_at: "2026-06-01T00:00:00Z",
    } as unknown as StrategyWorkshop);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([
        {
          card_id: "card-opinion-1",
          card_type: "persona_opinion",
          workshop_id: "ws-abc",
          sequence_no: 1,
          status: "completed",
          title: "Opinion by Quant Architect",
          payload: {
            stance: "approve",
            confidence: 0.9,
            rationale: "The backtest Sharpe is high and meets criteria.",
            persona_id: "per_quant",
            persona_version: "1.2",
            uncertainty: "Data coverage lacks 2020 crash."
          },
          created_at: "2026-06-01T00:00:00Z",
        },
        {
          card_id: "card-debate-1",
          card_type: "debate",
          workshop_id: "ws-abc",
          sequence_no: 2,
          status: "informational",
          title: "Debate on Regime Shift",
          payload: {
            topic: "Regime Shift sensitivity",
            summary: "Quant vs Macro on Sharpe persistence",
            exchanges: [
              {
                speaker: "Quant Architect",
                stance: "approve",
                message: "Parameters are robust.",
              },
              {
                speaker: "Macro Strategist",
                stance: "challenge",
                message: "Interest rate cut could break regime assumptions.",
              }
            ]
          },
          created_at: "2026-06-01T00:00:00Z",
        }
      // `listWorkshopCards`'s mocked-module type resolves `WorkshopCard` from
      // `agora/workshops`, distinct from the `agora/types` `WorkshopCard`
      // imported above — cast through the schema's own type for this fixture.
      ] as unknown as WorkshopCardSchema[]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    
    // Verify custom cards exist
    await screen.findByTestId("workshop-card-card-opinion-1");
    expect(screen.getByText("Opinion Stance:")).toBeDefined();
    expect(screen.getByText("Approve (贊成)")).toBeDefined();
    expect(screen.getByText("The backtest Sharpe is high and meets criteria.")).toBeDefined();

    expect(screen.getByTestId("workshop-card-card-debate-1")).toBeDefined();
    expect(screen.getByText("Quant Architect")).toBeDefined();
    expect(screen.getByText("Macro Strategist")).toBeDefined();
    expect(screen.getByText("Parameters are robust.")).toBeDefined();
  });

  it("proves no stale rail/gates/CTA/handoff when switching from A-ready to B-null/error", async () => {
    const onAddToTradingRoom = vi.fn();
    vi.mocked(workshopsModule.getWorkshop).mockImplementation(async (id) => ({
      ...MOCK_WORKSHOP,
      workshop_id: id,
    }));
    
    const cardA = {
      ...LIVE_COMPLETENESS_CARD,
      workshop_id: "ws-A",
    };
    vi.mocked(workshopsModule.listWorkshopCards).mockImplementation(async (id) => {
      if (id === "ws-A") return [cardA];
      return [];
    });
    
    // For A, return ready and complete
    const snapshotA = {
      ...LIVE_COMPLETENESS_SNAPSHOT,
      workshop_id: "ws-A",
    };
    const readinessA = {
      ...TRADING_ROOM_READY,
      workshop_id: "ws-A",
    };
    vi.mocked(workshopsModule.getWorkshopReadiness).mockImplementation(async (id) => {
      if (id === "ws-A") return readinessA;
      return null;
    });
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockImplementation(async (id) => {
      if (id === "ws-A") return snapshotA;
      return null;
    });

    const { rerender } = render(<StrategyWorkshopPage onAddToTradingRoom={onAddToTradingRoom} workshopId="ws-A" />);

    // Prove A's CTA is enabled and completeness exists
    const button = await screen.findByTestId("add-to-trading-room-btn");
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText("策略完整度尚未評估")).toBeNull();

    // Now switch to B
    rerender(<StrategyWorkshopPage onAddToTradingRoom={onAddToTradingRoom} workshopId="ws-B" />);

    // Prove B's CTA is disabled and completeness is cleared (shows empty state text)
    await waitFor(async () => {
      const bBtn = screen.getByTestId("add-to-trading-room-btn");
      expect((bBtn as HTMLButtonElement).disabled).toBe(true);
    });
    expect(await screen.findByText("策略完整度尚未評估")).toBeDefined();
  });
});
