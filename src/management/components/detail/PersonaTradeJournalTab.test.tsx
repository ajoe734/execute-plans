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

describe("PersonaTradeJournalTab Component Tests", () => {
  const mockEpisode = {
    trade_episode_id: "ep-1",
    persona_id: "per_quant",
    environment: "paper",
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

  it("uses the first canonical eligible challenge Persona without inferring a role from id or name", async () => {
    mockResolveContext.mockResolvedValue({
      data: { workshop_id: "wksp-123", context_refs: [] },
    });
    mockParticipants.mockResolvedValue({
      data: {
        included: [
          {
            persona_id: "persona-neutral-first",
            display_name: "Neutral First Candidate",
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

    // Check that eligibility endpoints are called
    await waitFor(() => {
      expect(mockResolveContext).toHaveBeenCalledWith({
        context_refs: [{ type: "journal_entry", id: "ep-1" }],
        environment: "paper",
      });
      expect(mockParticipants).toHaveBeenCalledWith({
        workshop_id: "wksp-123",
        mode: "challenge",
        environment: "paper",
      });
    });

    const challengeButton = await screen.findByRole("button", { name: "Challenge Persona Review" });
    expect(challengeButton).not.toBeDisabled();

    fireEvent.click(challengeButton);

    // Verify submission and navigation
    await waitFor(() => {
      expect(mockSubmitInteraction).toHaveBeenCalledWith({
        workshop_id: "wksp-123",
        mode: "challenge",
        environment: "paper",
        topic: "Reflection and review for episode ep-1 by Persona persona-neutral-first",
        participant_persona_ids: ["persona-neutral-first"],
        context_refs: [
          { type: "journal_entry", id: "ep-1" },
          { type: "persona", id: "persona-neutral-first" },
        ],
      });
      expect(mockNavigate).toHaveBeenCalledWith("/agora/strategy-workshop/wksp-123");
    });
  });

  it("surfaces unavailable state when no challenge Persona is eligible", async () => {
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

    // Wait for button to be updated to unavailable
    const unavailableBtn = await screen.findByRole("button", { name: "Challenge Persona (Unavailable)" });
    expect(unavailableBtn).toBeDisabled();

    // Verify reason surfaced
    expect(screen.getByTestId("challenge-persona-unavailable").textContent).toContain(
      "Unavailable: environment_ceiling_exceeded"
    );
  });
});
