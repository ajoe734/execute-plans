import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PersonaTradeJournalTab } from "./PersonaTradeJournalTab";
import { MemoryRouter } from "react-router-dom";

// Mock the BFF APIs
vi.mock("@/lib/bff-v1", () => ({
  lists: {
    personas: vi.fn().mockResolvedValue([]),
  },
  tradeJournal: {
    list: vi.fn().mockResolvedValue({ data: [], page_info: {}, meta: {} }),
    reflections: vi.fn().mockResolvedValue({ data: [] }),
    patterns: vi.fn().mockResolvedValue({ data: [] }),
    get: vi.fn(),
  },
  interaction: {
    resolveContext: vi.fn(),
    participants: vi.fn(),
    submit: vi.fn(),
  },
}));

vi.mock("@/lib/bff-v1/client", () => ({
  bffV1: {
    detectMode: () => "mock",
  },
}));

vi.mock("@/platform/hooks", () => ({
  useT: () => (key: string) => key,
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: () => Promise.resolve(),
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...original,
    useNavigate: () => mockNavigate,
  };
});

import { tradeJournal, interaction, lists } from "@/lib/bff-v1";

const mockListPersonas = lists.personas as ReturnType<typeof vi.fn>;
const mockListEpisodes = tradeJournal.list as ReturnType<typeof vi.fn>;
const mockGetEpisode = tradeJournal.get as ReturnType<typeof vi.fn>;
const mockResolveContext = interaction.resolveContext as ReturnType<typeof vi.fn>;
const mockParticipants = interaction.participants as ReturnType<typeof vi.fn>;
const mockSubmitInteraction = interaction.submit as ReturnType<typeof vi.fn>;

function journalContextFixture(input: {
  workshopId?: string;
  strategy?: { id: string; version: string };
  refs?: Array<{ kind: string; id: string; version?: string | null }>;
} = {}) {
  const workshopId = input.workshopId ?? "wksp-123";
  const refs = input.refs ?? [
    { kind: "journal_entry", id: "ep-1" },
    ...(input.strategy ? [{ kind: "strategy", id: input.strategy.id, version: input.strategy.version }] : []),
  ];
  return {
    data: {
      workshop_id: workshopId,
      context_refs: refs.map((ref) => ({ type: ref.kind, id: ref.id, version_id: ref.version ?? undefined })),
      context_digest: "server-digest",
      environment: "paper",
      verified: true,
      resolved_at: "2026-07-17T03:04:05Z",
      context_binding: {
        binding_id: `binding-${workshopId}`, workshop_id: workshopId, tenant_id: "tenant-1",
        source_route: "/management/personas/per_quant?tab=tradeJournal",
        focused_object: { kind: "journal_entry", id: "ep-1" }, context_refs: refs,
        strategy_ref: input.strategy ? { strategy_id: input.strategy.id, version_id: input.strategy.version } : null,
        decision_ref: null, journal_ref: "ep-1", position_risk_snapshot_refs: [],
        evidence_cutoff: "2026-07-17T03:04:05Z", selected_persona_ids: ["per_quant"],
        initial_mode: input.strategy ? "propose_action" : "challenge",
        return_route: "/management/personas/per_quant?tab=tradeJournal", advice_environment: "paper",
        context_digest: "server-digest", resolved_at: "2026-07-17T03:04:05Z",
      },
    },
  };
}

describe("PersonaTradeJournalTab Component Tests", () => {
  const mockEpisode = {
    trade_episode_id: "ep-1",
    persona_id: "per_quant",
    environment: "live",
    instrument_id: "AAPL",
    side: "long",
    status: "reflected",
    opened_at: "2026-07-12T12:00:00Z",
    filled_qty: 100,
    requested_qty: 100,
    vwap: 150.0,
    rejects: 0,
    realized_pnl: 500,
    mae: 0.1,
    mfe: 2.5,
    reflection_summary: "Strong execution under volatility.",
    coverage: {},
  };

  const mockPersonaList = [
    { persona_id: "per_quant", name: "Quant Architect" },
    { persona_id: "per_macro", name: "Macro Strategist" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockListPersonas.mockResolvedValue(mockPersonaList);
    mockListEpisodes.mockResolvedValue({
      data: [mockEpisode],
      page_info: { has_more: false },
      meta: { coverage_state: "complete" },
    });
    mockGetEpisode.mockResolvedValue({ data: mockEpisode });
  });

  it("loads and renders trade episodes", async () => {
    render(
      <MemoryRouter>
        <PersonaTradeJournalTab personaId="per_quant" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("AAPL")).toBeDefined();
      expect(screen.getByText("LONG")).toBeDefined();
    });
  });

  it("opens a typed Challenge from the selected journal episode without direct interaction submission", async () => {
    mockResolveContext.mockResolvedValue(journalContextFixture());
    mockParticipants.mockResolvedValue({
      data: {
        included: [
          {
            persona_id: "per_quant",
            display_name: "Quant Architect",
            eligible: true,
            reasons: [],
            recommended: true,
          },
        ],
        excluded: [],
      },
    });

    render(
      <MemoryRouter>
        <PersonaTradeJournalTab personaId="per_quant" />
      </MemoryRouter>
    );

    // Open detail sheet
    await waitFor(() => {
      const row = screen.getByText("AAPL");
      fireEvent.click(row);
    });

    const challengeButton = await screen.findByRole("button", { name: "Challenge Personas about trade ep-1" });
    expect(challengeButton).not.toBeDisabled();

    fireEvent.click(challengeButton);

    await waitFor(() => {
      expect(mockResolveContext).toHaveBeenCalledWith(expect.objectContaining({
        context_refs: [{ type: "journal_entry", id: "ep-1" }],
        environment: "paper",
        focused_object: { kind: "journal_entry", id: "ep-1" },
      }));
      expect(mockParticipants).toHaveBeenCalledWith({
        workshop_id: "wksp-123",
        mode: "challenge",
        environment: "paper",
      });
      expect(mockNavigate).toHaveBeenCalled();
    });
    expect(mockSubmitInteraction).not.toHaveBeenCalled();
    const destination = mockNavigate.mock.calls.at(-1)?.[0] as string;
    const parsed = new URL(destination, "https://example.test");
    expect(parsed.pathname).toBe("/agora/strategy-workshop/wksp-123");
    expect(parsed.searchParams.get("mode")).toBe("challenge");
    expect(parsed.searchParams.get("participants")).toBe("per_quant");
    expect(parsed.searchParams.get("source_kind")).toBe("journal_entry");
    expect(parsed.searchParams.get("source_id")).toBe("ep-1");
    expect(parsed.searchParams.get("advice_environment")).toBe("paper");
    expect(parsed.searchParams.get("evidence_cutoff")).toBe("2026-07-17T03:04:05Z");
  });

  it("carries a resolver-verified immutable strategy into Trade Journal Propose", async () => {
    const proposalEpisode = { ...mockEpisode, strategy_id: "strategy-a", artifact_version: "spec-v9" };
    mockListEpisodes.mockResolvedValue({
      data: [proposalEpisode], page_info: { has_more: false }, meta: { coverage_state: "complete" },
    });
    mockResolveContext.mockResolvedValue(journalContextFixture({ workshopId: "wksp-propose", strategy: { id: "strategy-a", version: "spec-v9" } }));
    mockParticipants.mockResolvedValue({
      data: {
        included: [{ persona_id: "per_quant", display_name: "Quant Architect", eligible: true, reasons: [], recommended: true }],
        excluded: [],
      },
    });

    render(<MemoryRouter><PersonaTradeJournalTab personaId="per_quant" /></MemoryRouter>);
    await waitFor(() => fireEvent.click(screen.getByText("AAPL")));
    fireEvent.click(await screen.findByRole("button", { name: "Propose Personas about trade ep-1" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockResolveContext).toHaveBeenCalledWith(expect.objectContaining({
      context_refs: [
        { type: "journal_entry", id: "ep-1" },
        { type: "strategy", id: "strategy-a", version_id: "spec-v9" },
      ],
      environment: "paper",
    }));
    const parsed = new URL(mockNavigate.mock.calls.at(-1)?.[0] as string, "https://example.test");
    expect(parsed.searchParams.get("mode")).toBe("propose_action");
    expect(parsed.searchParams.get("target_strategy_id")).toBe("strategy-a");
    expect(parsed.searchParams.get("target_strategy_version")).toBe("spec-v9");
    expect(parsed.searchParams.get("evidence_cutoff")).toBe("2026-07-17T03:04:05Z");
  });

  it("fails closed when the resolver changes or ambiguously expands the journal strategy", async () => {
    const proposalEpisode = { ...mockEpisode, strategy_id: "strategy-a", artifact_version: "spec-v9" };
    mockListEpisodes.mockResolvedValue({
      data: [proposalEpisode], page_info: { has_more: false }, meta: { coverage_state: "complete" },
    });
    mockResolveContext.mockResolvedValue(journalContextFixture({
      workshopId: "wksp-tampered",
      strategy: { id: "strategy-b", version: "spec-v9" },
      refs: [
        { kind: "journal_entry", id: "ep-1" },
        { kind: "strategy", id: "strategy-b", version: "spec-v9" },
        { kind: "strategy", id: "strategy-a", version: "spec-v10" },
      ],
    }));

    render(<MemoryRouter><PersonaTradeJournalTab personaId="per_quant" /></MemoryRouter>);
    await waitFor(() => fireEvent.click(screen.getByText("AAPL")));
    fireEvent.click(await screen.findByRole("button", { name: "Propose Personas about trade ep-1" }));

    await waitFor(() => expect(mockResolveContext).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockParticipants).not.toHaveBeenCalled();
  });

  it("exposes all five actions and fails closed if the selected Persona is ineligible", async () => {
    mockResolveContext.mockResolvedValue({
      data: { workshop_id: "wksp-456", context_refs: [] },
    });
    mockParticipants.mockResolvedValue({
      data: {
        included: [],
        excluded: [
          {
            persona_id: "per_red",
            display_name: "Excluded Challenge Candidate",
            eligible: false,
            reasons: ["environment_ceiling_exceeded"],
            recommended: false,
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <PersonaTradeJournalTab personaId="per_quant" />
      </MemoryRouter>
    );

    // Open detail sheet
    await waitFor(() => {
      const row = screen.getByText("AAPL");
      fireEvent.click(row);
    });

    expect(screen.getByRole("button", { name: "Ask Personas about trade ep-1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Challenge Personas about trade ep-1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Compare Personas about trade ep-1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Propose Personas about trade ep-1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reflect Personas about trade ep-1" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Challenge Personas about trade ep-1" }));
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled());
    expect(mockSubmitInteraction).not.toHaveBeenCalled();
  });
});
