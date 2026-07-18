import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategyWorkshop, WorkshopCard } from "@/lib/bff-v1/agora/types";
import type { ResolveContextRequest } from "@/lib/bff-v1/agora/interaction";
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
    resolveContext: vi.fn(),
    participants: vi.fn().mockResolvedValue({
      data: {
        included: [
          { persona_id: "per_quant", display_name: "Quant Architect", eligible: true, reasons: [], recommended: true, participant_snapshot: { persona_id: "per_quant", persona_version: "1", session_persona_id: "session-quant", display_name: "Quant Architect", provider_agent_id: "agent-quant", workspace_id: "workspace-quant", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
          { persona_id: "per_macro", display_name: "Macro Strategist", eligible: true, reasons: [], recommended: true, participant_snapshot: { persona_id: "per_macro", persona_version: "1", session_persona_id: "session-macro", display_name: "Macro Strategist", provider_agent_id: "agent-macro", workspace_id: "workspace-macro", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
          { persona_id: "per_risk", display_name: "Risk Officer", eligible: true, reasons: [], recommended: true, participant_snapshot: { persona_id: "per_risk", persona_version: "1", session_persona_id: "session-risk", display_name: "Risk Officer", provider_agent_id: "agent-risk", workspace_id: "workspace-risk", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
          { persona_id: "per_red", display_name: "Red Team", eligible: true, reasons: [], recommended: false, participant_snapshot: { persona_id: "per_red", persona_version: "1", session_persona_id: "session-red", display_name: "Red Team", provider_agent_id: "agent-red", workspace_id: "workspace-red", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
        ],
        excluded: [],
      },
    }),
    submit: vi.fn().mockResolvedValue({ data: { execution_authority: "none" } }),
  },
}));

vi.mock("@/lib/bff-v1/agora/dailyInteractions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bff-v1/agora/dailyInteractions")>();
  return {
    ...original,
    listDailyInteractions: vi.fn().mockResolvedValue([]),
    submitDailyInteraction: vi.fn().mockResolvedValue({ interaction_id: "int-1", workshop_id: "ws-abc", status: "queued" }),
  };
});

vi.mock("@/lib/bff-v1/headers", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bff-v1/headers")>();
  return { ...original, getAuthProvider: () => ({ getToken: () => null, getTenantId: () => "tenant-1" }) };
});

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
import { listDailyInteractions, submitDailyInteraction } from "@/lib/bff-v1/agora/dailyInteractions";

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
  metadata: { evidence_cutoff: "2026-07-17T00:00:00Z" },
} satisfies StrategyWorkshop;

function resolvedContextFixture(body: ResolveContextRequest) {
  const workshopId = body.workshop_id ?? "ws-abc";
  const contextRefs = body.context_refs ?? [];
  const bindingRefs = contextRefs.map((ref: Record<string, unknown>) => ({
    kind: ref.type, id: ref.id, version: ref.version_id ?? null,
  }));
  const strategy = bindingRefs.find((ref: Record<string, unknown>) => ref.kind === "strategy" && ref.version);
  const resolvedAt = "2026-07-17T00:00:00Z";
  return Promise.resolve({
    data: {
      workshop_id: workshopId,
      context_refs: contextRefs,
      context_digest: "server-context-digest",
      environment: body.environment ?? "paper",
      verified: true,
      resolved_at: resolvedAt,
      context_binding: {
        binding_id: `binding-${workshopId}`,
        workshop_id: workshopId,
        tenant_id: "tenant-1",
        source_route: body.source_route ?? `/agora/strategy-workshop/${workshopId}`,
        focused_object: body.focused_object ?? { kind: "workshop", id: workshopId },
        context_refs: bindingRefs,
        strategy_ref: strategy ? { strategy_id: strategy.id, version_id: strategy.version } : null,
        decision_ref: bindingRefs.find((ref: Record<string, unknown>) => ref.kind === "decision_event")?.id ?? null,
        journal_ref: bindingRefs.find((ref: Record<string, unknown>) => ref.kind === "journal_entry")?.id ?? null,
        position_risk_snapshot_refs: [],
        evidence_cutoff: body.evidence_cutoff ?? resolvedAt,
        selected_persona_ids: body.selected_persona_ids ?? [],
        initial_mode: body.initial_mode ?? "ask",
        return_route: body.return_route ?? `/agora/strategy-workshop/${workshopId}`,
        advice_environment: body.environment ?? "paper",
        context_digest: "server-context-digest",
        resolved_at: resolvedAt,
      },
    },
  });
}

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
    vi.mocked(interaction.resolveContext).mockImplementation(resolvedContextFixture);
    vi.mocked(interaction.participants).mockResolvedValue({
      data: {
        included: [
          { persona_id: "per_quant", display_name: "Quant Architect", eligible: true, reasons: [], recommended: true, participant_snapshot: { persona_id: "per_quant", persona_version: "1", session_persona_id: "session-quant", display_name: "Quant Architect", provider_agent_id: "agent-quant", workspace_id: "workspace-quant", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
          { persona_id: "per_macro", display_name: "Macro Strategist", eligible: true, reasons: [], recommended: true, participant_snapshot: { persona_id: "per_macro", persona_version: "1", session_persona_id: "session-macro", display_name: "Macro Strategist", provider_agent_id: "agent-macro", workspace_id: "workspace-macro", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
          { persona_id: "per_risk", display_name: "Risk Officer", eligible: true, reasons: [], recommended: true, participant_snapshot: { persona_id: "per_risk", persona_version: "1", session_persona_id: "session-risk", display_name: "Risk Officer", provider_agent_id: "agent-risk", workspace_id: "workspace-risk", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
          { persona_id: "per_red", display_name: "Red Team", eligible: true, reasons: [], recommended: false, participant_snapshot: { persona_id: "per_red", persona_version: "1", session_persona_id: "session-red", display_name: "Red Team", provider_agent_id: "agent-red", workspace_id: "workspace-red", environment_ceiling: "paper", capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z" } },
        ],
        excluded: [],
      },
    });
    vi.mocked(submitDailyInteraction).mockResolvedValue({ interaction_id: "int-1", workshop_id: "ws-abc", status: "queued" } as never);
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
    vi.mocked(listDailyInteractions).mockResolvedValue([]);
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

  it("uses an explicit conversation/readiness selector and collapsible composer context", () => {
    vi.mocked(workshopsModule.getWorkshop).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopCards).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopEvents).mockReturnValue(new Promise(() => {}));

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    const page = screen.getByTestId("strategy-workshop-page-session");
    const conversation = screen.getByTestId("workshop-conversation-pane");
    const readiness = screen.getByTestId("completeness-rail");
    const options = screen.getByTestId("workshop-composer-options");
    const optionsToggle = screen.getByTestId("workshop-composer-options-toggle");

    expect(page.getAttribute("data-mobile-workshop-pane")).toBe("conversation");
    expect(conversation.getAttribute("data-mobile-pane-hidden")).toBe("false");
    expect(readiness.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(options.getAttribute("data-mobile-collapsed")).toBe("true");
    expect(optionsToggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(optionsToggle);
    expect(options.getAttribute("data-mobile-collapsed")).toBe("false");
    expect(optionsToggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Next question & readiness" }));
    expect(page.getAttribute("data-mobile-workshop-pane")).toBe("readiness");
    expect(conversation.getAttribute("data-mobile-pane-hidden")).toBe("true");
    expect(readiness.getAttribute("data-mobile-pane-hidden")).toBe("false");
  });

  it("keeps the hosted raw snapshot rail aligned without rendering legacy cards as Persona truth", async () => {
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
    expect(screen.queryByText("Strategy completeness updated")).toBeNull();
    expect(screen.getByTestId("daily-interactions-empty")).toBeDefined();
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
      expect(interaction.resolveContext).toHaveBeenCalledWith(
        expect.objectContaining({
          workshop_id: "ws-abc",
          context_refs: expect.arrayContaining([
            { type: "workshop", id: "ws-abc" },
            { type: "persona", id: "per_quant" },
          ]),
        }),
        expect.objectContaining({ resolutionSessionId: expect.stringMatching(/^[A-Za-z0-9._:-]+$/) }),
      );
      expect(interaction.participants).toHaveBeenCalledWith(expect.objectContaining({ workshop_id: "ws-abc", mode: "ask" }));
      expect(submitDailyInteraction).toHaveBeenCalledWith(expect.objectContaining({
        workshop_id: "ws-abc",
        human_request: expect.objectContaining({ mode: "ask", request_text: "What evidence is missing?" }),
        context_snapshot: expect.objectContaining({ selected_persona_ids: ["per_quant", "per_macro", "per_risk"] }),
      }));
    });
    const resolutionSessions = vi.mocked(interaction.resolveContext).mock.calls
      .filter(([request]) => request.workshop_id === "ws-abc")
      .map(([, options]) => options?.resolutionSessionId);
    expect(resolutionSessions.length).toBeGreaterThanOrEqual(2);
    expect(new Set(resolutionSessions).size).toBe(1);
    expect(workshopsModule.listWorkshopEvents).toHaveBeenCalledTimes(2);
  });

  it("keeps the composer available when a non-authoritative session rail read remains pending", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockReturnValue(new Promise(() => {}));

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    const input = await screen.findByTestId("servant-composer-input");
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "Composer remains usable" } });
    expect(input).toHaveValue("Composer remains usable");
  });

  it("keeps a context-error draft editable and blocks click and Ctrl+Enter until an explicit retry resolves", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(interaction.resolveContext).mockRejectedValue(new Error("resolver temporarily unavailable"));

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    const input = await screen.findByTestId("servant-composer-input");
    fireEvent.change(input, { target: { value: "Preserve this draft across context retry" } });
    const reason = await screen.findByTestId("servant-composer-submit-disabled-reason");
    await waitFor(() => expect(reason).toHaveAttribute("data-reason-code", "context_error"));
    expect(input).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("servant-composer-submit"));
    fireEvent.keyDown(input, { ctrlKey: true, key: "Enter" });
    expect(submitDailyInteraction).not.toHaveBeenCalled();

    vi.mocked(interaction.resolveContext).mockImplementation(resolvedContextFixture);
    fireEvent.click(screen.getByTestId("servant-composer-context-retry"));

    await waitFor(() => expect(screen.getByTestId("servant-composer-submit")).toBeEnabled());
    expect(input).toHaveValue("Preserve this draft across context retry");
    expect(interaction.resolveContext).toHaveBeenCalledTimes(2);
  });

  it("normalizes a PostgreSQL Workshop cutoff and recovers the exact hosted 422 on retry", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      ...MOCK_WORKSHOP,
      strategy_id: "strategy-a",
      active_strategy_spec_registry_id: "spec-v3",
      created_at: "2026-07-18 08:36:47+00",
      metadata: {},
    });
    let rejectedPropose = false;
    vi.mocked(interaction.resolveContext).mockImplementation((body) => {
      if (body.initial_mode === "propose_action" && !rejectedPropose) {
        rejectedPropose = true;
        return Promise.reject(new Error(
          "VALIDATION_FAILED: REQUEST_VALIDATION_ERROR at body.evidence_cutoff",
        ));
      }
      return resolvedContextFixture(body);
    });

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    const input = await screen.findByTestId("servant-composer-input");
    fireEvent.change(input, { target: { value: "Preserve the bounded measure draft" } });
    await waitFor(() => expect(interaction.resolveContext).toHaveBeenCalledWith(
      expect.objectContaining({ initial_mode: "ask" }),
      expect.objectContaining({ resolutionSessionId: expect.any(String) }),
    ));

    fireEvent.keyDown(screen.getByTestId("mode-selector"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /Propose \(Candidate Measure\)/i }));

    const reason = await screen.findByTestId("servant-composer-submit-disabled-reason");
    await waitFor(() => expect(reason).toHaveAttribute("data-reason-code", "context_error"));
    const failedRequest = vi.mocked(interaction.resolveContext).mock.calls
      .map(([request]) => request)
      .find((request) => request.initial_mode === "propose_action");
    expect(failedRequest).toEqual(expect.objectContaining({
      evidence_cutoff: "2026-07-18T08:36:47.000Z",
      initial_mode: "propose_action",
    }));
    expect(input).toHaveValue("Preserve the bounded measure draft");

    fireEvent.click(screen.getByTestId("servant-composer-context-retry"));

    await waitFor(() => expect(screen.getByTestId("servant-composer-submit")).toBeEnabled());
    expect(vi.mocked(interaction.resolveContext).mock.calls.filter(
      ([request]) => request.initial_mode === "propose_action",
    )).toHaveLength(2);
  });

  it("waits for current Propose eligibility before resolving the same ordered participant IDs", async () => {
    const sameParticipants = {
      data: {
        included: [{
          persona_id: "per_quant",
          display_name: "Quant Architect",
          eligible: true,
          reasons: [],
          recommended: true,
          participant_snapshot: {
            persona_id: "per_quant",
            persona_version: "1",
            session_persona_id: "session-quant",
            display_name: "Quant Architect",
            provider_agent_id: "agent-quant",
            workspace_id: "workspace-quant",
            environment_ceiling: "paper" as const,
            capability_snapshot: ["persona_opinion"],
            captured_at: "2026-07-17T00:00:00Z",
          },
        }],
        excluded: [],
      },
    };
    let resolveProposeEligibility!: (value: typeof sameParticipants) => void;
    const proposeEligibility = new Promise<typeof sameParticipants>((resolve) => {
      resolveProposeEligibility = resolve;
    });
    let eligibilityCall = 0;
    vi.mocked(interaction.participants).mockImplementation(() => {
      eligibilityCall += 1;
      return eligibilityCall === 1 ? Promise.resolve(sameParticipants) : proposeEligibility;
    });
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      ...MOCK_WORKSHOP,
      strategy_id: "strategy-a",
      active_strategy_spec_registry_id: "spec-v3",
    });

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    const input = await screen.findByTestId("servant-composer-input");
    fireEvent.change(input, { target: { value: "Propose only after current eligibility" } });
    await waitFor(() => expect(interaction.resolveContext).toHaveBeenCalledWith(
      expect.objectContaining({ initial_mode: "ask", selected_persona_ids: ["per_quant"] }),
      expect.any(Object),
    ));

    fireEvent.keyDown(screen.getByTestId("mode-selector"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /Propose \(Candidate Measure\)/i }));
    await waitFor(() => expect(interaction.participants).toHaveBeenCalledTimes(2));

    expect(vi.mocked(interaction.resolveContext).mock.calls.some(
      ([request]) => request.initial_mode === "propose_action",
    )).toBe(false);
    await waitFor(() => expect(screen.getByTestId("servant-composer-submit-disabled-reason"))
      .toHaveAttribute("data-reason-code", "eligibility_loading"));

    await act(async () => resolveProposeEligibility(sameParticipants));

    await waitFor(() => expect(screen.getByTestId("servant-composer-submit")).toBeEnabled());
    expect(vi.mocked(interaction.resolveContext).mock.calls.filter(
      ([request]) => request.initial_mode === "propose_action",
    )).toHaveLength(1);
    expect(input).toHaveValue("Propose only after current eligibility");
  });

  it("ignores stale ask eligibility after Propose wins and submits the exact strategy version without losing the draft", async () => {
    let resolveAsk!: (value: Awaited<ReturnType<typeof interaction.participants>>) => void;
    let resolvePropose!: (value: Awaited<ReturnType<typeof interaction.participants>>) => void;
    const askPending = new Promise<Awaited<ReturnType<typeof interaction.participants>>>((resolve) => { resolveAsk = resolve; });
    const proposePending = new Promise<Awaited<ReturnType<typeof interaction.participants>>>((resolve) => { resolvePropose = resolve; });
    const eligibilityFor = (personaId: string) => ({
      data: {
        included: [{
          persona_id: personaId,
          display_name: personaId,
          eligible: true,
          reasons: [],
          recommended: false,
          participant_snapshot: {
            persona_id: personaId,
            persona_version: "1",
            session_persona_id: `session-${personaId}`,
            display_name: personaId,
            provider_agent_id: `agent-${personaId}`,
            workspace_id: `workspace-${personaId}`,
            environment_ceiling: "paper" as const,
            capability_snapshot: ["persona_opinion"],
            captured_at: "2026-07-17T00:00:00Z",
          },
        }],
        excluded: [],
      },
    });
    let eligibilityCall = 0;
    vi.mocked(interaction.participants).mockImplementation(() => {
      eligibilityCall += 1;
      if (eligibilityCall === 1) return askPending;
      if (eligibilityCall === 2) return proposePending;
      return Promise.resolve(eligibilityFor("per_propose"));
    });
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      ...MOCK_WORKSHOP,
      strategy_id: "strategy-a",
      active_strategy_spec_registry_id: "spec-v3",
    });

    render(<StrategyWorkshopPage workshopId="ws-abc" />);

    const input = await screen.findByTestId("servant-composer-input");
    fireEvent.change(input, { target: { value: "Propose the bounded measure" } });
    await waitFor(() => expect(interaction.participants).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getByTestId("mode-selector"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /Propose \(Candidate Measure\)/i }));
    await waitFor(() => expect(interaction.participants).toHaveBeenCalledTimes(2));

    await act(async () => resolvePropose(eligibilityFor("per_propose")));
    await waitFor(() => expect(screen.getByTestId("servant-composer-submit")).toBeEnabled());
    await act(async () => resolveAsk(eligibilityFor("per_stale_ask")));

    expect(input).toHaveValue("Propose the bounded measure");
    expect(screen.queryByText("per_stale_ask")).not.toBeInTheDocument();
    expect(screen.getByText("per_propose")).toBeInTheDocument();
    expect(screen.getByTestId("servant-composer-submit")).toBeEnabled();
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    await waitFor(() => expect(submitDailyInteraction).toHaveBeenCalledWith(expect.objectContaining({
      human_request: expect.objectContaining({ mode: "propose_action", request_text: "Propose the bounded measure" }),
      context_snapshot: expect.objectContaining({
        strategy_ref: { strategy_id: "strategy-a", version_id: "spec-v3" },
        selected_persona_ids: ["per_propose"],
      }),
      participants: [expect.objectContaining({ persona_id: "per_propose" })],
    })));
  });

  it.each([
    ["ask", "ask"],
    ["challenge", "challenge"],
    ["compare", "consult"],
    ["propose_action", "propose_action"],
    ["reflect", "reflect"],
  ] as const)("submits a durable %s deep-link entry with authoritative context", async (mode, eligibilityMode) => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);
    render(<StrategyWorkshopPage
      entry={{
        mode,
        participantIds: ["per_quant"],
        picker: mode === "compare" ? "recommended" : "named",
        returnTo: "/management/personas/per_quant",
        source: { kind: "persona", id: "per_quant" },
        targetStrategy: mode === "propose_action" ? { id: "strategy-a", version: "spec-v3" } : undefined,
        environment: "research",
        evidenceCutoff: "2026-07-17T01:02:03Z",
      }}
      workshopId="ws-abc"
    />);

    const input = await screen.findByTestId("servant-composer-input");
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: `Run ${mode} from Persona Detail` } });
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    await waitFor(() => expect(submitDailyInteraction).toHaveBeenCalledWith(expect.objectContaining({
      human_request: expect.objectContaining({ mode }),
      context_snapshot: expect.objectContaining({
        evidence_cutoff: "2026-07-17T01:02:03.000Z",
        return_route: "/management/personas/per_quant",
        selected_persona_ids: mode === "compare" ? ["per_quant", "per_macro"] : ["per_quant"],
      }),
    })));
    expect(interaction.participants).toHaveBeenCalledWith(expect.objectContaining({
      environment: "research",
      mode: eligibilityMode,
    }));
    if (mode === "propose_action") {
      expect(interaction.resolveContext).toHaveBeenCalledWith(
        expect.objectContaining({
          context_refs: expect.arrayContaining([{ type: "strategy", id: "strategy-a", version_id: "spec-v3" }]),
          environment: "research",
        }),
        expect.objectContaining({ resolutionSessionId: expect.any(String) }),
      );
    }
  });

  it("preserves a draft while gating pointer and keyboard submission until the canonical Workshop is loaded", async () => {
    let resolveWorkshop!: (workshop: StrategyWorkshop) => void;
    const workshopPending = new Promise<StrategyWorkshop>((resolve) => {
      resolveWorkshop = resolve;
    });
    vi.mocked(workshopsModule.getWorkshop).mockReturnValueOnce(workshopPending);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage entry={{ mode: "ask", participantIds: ["per_quant"], picker: "named" }} workshopId="ws-abc" />);

    const input = await screen.findByTestId("servant-composer-input");
    const submit = screen.getByTestId("servant-composer-submit");
    expect(input).not.toBeDisabled();
    expect(submit).toBeDisabled();
    expect(screen.getByTestId("servant-composer-submit-disabled-reason")).toHaveAttribute(
      "data-reason-code",
      "workshop_loading",
    );

    fireEvent.change(input, { target: { value: "Submit only after the Workshop is ready" } });

    fireEvent.click(submit);
    fireEvent.keyDown(input, { ctrlKey: true, key: "Enter" });
    expect(interaction.resolveContext).not.toHaveBeenCalled();
    expect(submitDailyInteraction).not.toHaveBeenCalled();

    await act(async () => {
      resolveWorkshop(MOCK_WORKSHOP);
      await workshopPending;
    });
    await waitFor(() => expect(interaction.participants).toHaveBeenCalled());
    expect(input).toHaveValue("Submit only after the Workshop is ready");

    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.keyDown(input, { ctrlKey: true, key: "Enter" });

    await waitFor(() => expect(submitDailyInteraction).toHaveBeenCalledWith(expect.objectContaining({
      workshop_id: "ws-abc",
      human_request: expect.objectContaining({ request_text: "Submit only after the Workshop is ready" }),
      context_snapshot: expect.objectContaining({ selected_persona_ids: ["per_quant"] }),
    })));
  });

  it("uses the live session's immutable strategy pointers for propose-action context", async () => {
    const liveSession = {
      ...MOCK_WORKSHOP,
      strategy_id: "strategy-stable-9",
      active_strategy_spec_registry_id: "strategy-registry-9",
      selected_version_id: "workshop-version-link-4",
    } as StrategyWorkshop;
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(liveSession);
    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    fireEvent.change(await screen.findByTestId("servant-composer-input"), {
      target: { value: "Propose a bounded candidate measure" },
    });
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    await waitFor(() => expect(interaction.resolveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workshop_id: "ws-abc",
        context_refs: expect.arrayContaining([{
          type: "strategy",
          id: "strategy-stable-9",
          version_id: "strategy-registry-9",
        }]),
      }),
      expect.objectContaining({ resolutionSessionId: expect.any(String) }),
    ));
  });

  it("fails closed instead of treating a Registry version as a stable strategy id", async () => {
    const sessionWithoutStableStrategyId = {
      ...MOCK_WORKSHOP,
      active_strategy_spec_registry_id: "strategy-registry-only",
      selected_version_id: "workshop-version-link-only",
    } as StrategyWorkshop;
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(sessionWithoutStableStrategyId);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    fireEvent.change(await screen.findByTestId("servant-composer-input"), {
      target: { value: "Ask without inventing a strategy identity" },
    });
    fireEvent.click(screen.getByTestId("servant-composer-submit"));

    await waitFor(() => expect(interaction.resolveContext).toHaveBeenCalled());
    const request = vi.mocked(interaction.resolveContext).mock.calls.at(-1)?.[0];
    expect(request?.context_refs).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "strategy" }),
    ]));
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
    vi.mocked(submitDailyInteraction).mockRejectedValueOnce(new Error("The interaction response violated the no-execution authority boundary."));

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
    expect(screen.getByLabelText("Interaction Mode")).toBe(screen.getByTestId("mode-selector"));
    expect(screen.getByLabelText("Participants")).toBe(screen.getByTestId("participant-picker"));
    expect(screen.getByLabelText("Persona interaction request")).toBe(screen.getByTestId("servant-composer-input"));
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
    expect(contextBar.textContent).toContain("Focused object: workshop:ws-legacy");
    expect(screen.getByTestId("strategy-workshop-page-session")).toBeDefined();
  });

  it("renders only the governed proposal explicitly linked by the route", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(MOCK_WORKSHOP);

    render(<StrategyWorkshopPage governedProposalId="prop-pint-010" workshopId="ws-abc" />);

    expect(await screen.findByTestId("connected-governed-proposal")).toHaveTextContent("prop-pint-010");
  });

  it("renders provider degradation only from authoritative daily readback, with no simulator toggles", async () => {
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

    vi.mocked(listDailyInteractions).mockResolvedValueOnce([{
      interaction_id: "degraded-1", workshop_id: "ws-abc", status: "degraded",
      human_request: { mode: "ask", request_text: "Question", submitted_at: "2026-07-17T00:00:00Z" },
      participants: [], provider_invocations: [], opinions: [], synthesis: null,
      missing_participant_ids: [], degraded_participant_ids: [], candidate_proposal_links: [], audit_refs: [],
    } as never]);
    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(await screen.findByTestId("warning-degraded")).toBeDefined();
    expect(screen.queryByTestId("toggle-stale-btn")).toBeNull();
    expect(screen.queryByTestId("toggle-degraded-btn")).toBeNull();
    expect(screen.queryByTestId("toggle-denied-btn")).toBeNull();
  });

  it("does not present legacy workshop Persona cards as v1.9 provider truth", async () => {
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
    
    expect(await screen.findByTestId("daily-interactions-empty")).toBeDefined();
    expect(screen.queryByTestId("workshop-card-card-opinion-1")).toBeNull();
    expect(screen.queryByTestId("workshop-card-card-debate-1")).toBeNull();
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

  it("does not crash when workshop subject is missing or omitted in BFF payload", async () => {
    const workshopWithNoSubject = {
      spec_version: "1.0" as const,
      workshop_id: "ws-no-subject",
      operator_id: "operator-001",
      status: "open" as const,
      created_at: "2026-06-01T00:00:00Z",
    } as unknown as StrategyWorkshop;

    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue(workshopWithNoSubject);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.listWorkshopEvents).mockResolvedValue({ items: [] });

    render(<StrategyWorkshopPage workshopId="ws-no-subject" />);

    const header = await screen.findByTestId("strategy-workshop-runtime-header");
    expect(header).toBeDefined();
    const contextBar = screen.getByTestId("context-bar");
    expect(contextBar.textContent).toContain("Focused object: workshop:ws-no-subject");
  });
});
