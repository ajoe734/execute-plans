import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { EvolutionJournalPage } from "./_core";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderJournal(initialEntry = "/management/evolution-journal") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/evolution-journal" element={<EvolutionJournalPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("EvolutionJournalPage Rendering", () => {
  let mockEvolutionEntries: Record<string, unknown>[] = [];
  let mockFleetRows: ManagementPersonaFleetRow[] = [];

  beforeEach(() => {
    mockEvolutionEntries = [];
    mockFleetRows = [];
    mocks.useV5Live.mockReset();
    mocks.useV5Live.mockImplementation((loader) => {
      const code = loader.toString();
      if (code.includes("evolutionJournal")) {
        return { data: mockEvolutionEntries, loading: false };
      }
      if (code.includes("personaFleet")) {
        return { data: mockFleetRows, loading: false };
      }
      return { data: undefined, loading: false };
    });
  });

  it("renders canonical formal seed rows with target version, fixture badge, and approval status", () => {
    mockEvolutionEntries = [
      {
        id: "evo-dec-formal-1",
        title: "Taiwan Equity Evolution Decision",
        summary: "Optimize learning rates.",
        status: "approved",
        entry_type: "evolution_decision",
        action_type: "hyperparameter_tuning",
        risk_level: "low",
        target: { type: "Persona", id: "persona-tw-equity", version: "v1.2.3" },
        occurred_at: "2026-07-13T12:00:00Z",
        origin: "seed",
      },
    ];

    renderJournal();

    // Check title and summary
    expect(screen.getByText("Taiwan Equity Evolution Decision")).toBeInTheDocument();
    expect(screen.getByText("Optimize learning rates.")).toBeInTheDocument();

    // Check fixture badge
    expect(screen.getByText("Fixture")).toBeInTheDocument();

    // Check action, risk, target (with version)
    expect(screen.getByText("hyperparameter_tuning")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("Persona:persona-tw-equity (v1.2.3)")).toBeInTheDocument();

    // Check approval status
    expect(screen.getByText("Approval status")).toBeInTheDocument();
    expect(screen.getAllByText("approved").length).toBeGreaterThan(0);
  });

  it("normalizes entry_type vs entryType aliases correctly for approval status", () => {
    mockEvolutionEntries = [
      {
        id: "evo-dec-legacy",
        title: "Legacy CamelCase Entry",
        status: "proposed",
        entryType: "mutation_review",
        action_type: "policy_update",
        risk_level: "medium",
        target: { type: "Persona", id: "persona-crypto" },
        occurred_at: "2026-07-13T12:00:00Z",
      },
    ];

    renderJournal();

    expect(screen.getByText("Legacy CamelCase Entry")).toBeInTheDocument();
    expect(screen.getByText("Approval status")).toBeInTheDocument();
    expect(screen.getAllByText("proposed").length).toBeGreaterThan(0);
  });

  it("renders persona-fleet-summary fallback card when no formal entries match and suppresses fixture/approval fields", () => {
    mockEvolutionEntries = [];
    mockFleetRows = [
      {
        personaId: "persona-tw-equity",
        personaName: "Taiwan Equity Persona",
        state: "active",
        currentWork: "Executing trade block A",
        lastMutation: "2026-07-10",
        lastMutationAt: "2026-07-10T08:00:00Z",
      } as unknown as ManagementPersonaFleetRow,
    ];

    renderJournal("/management/evolution-journal?persona=persona-tw-equity");

    // Falls back to fallback card
    expect(screen.getByText("Persona Fleet status summary · Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.getByText("Executing trade block A · state: active")).toBeInTheDocument();

    // Target is rendered without version
    expect(screen.getByText("Persona:persona-tw-equity")).toBeInTheDocument();

    // Fixture badge should NOT be rendered
    expect(screen.queryByText("Fixture")).not.toBeInTheDocument();

    // Approval status should NOT be rendered
    expect(screen.queryByText("Approval status")).not.toBeInTheDocument();
  });

  it("applies negative checks to hide NaN, null, and undefined values defensively", () => {
    mockEvolutionEntries = [
      {
        id: "evo-dec-nan-fields",
        title: "NaN Fields Entry",
        status: "NaN",
        entry_type: "evolution_decision",
        action_type: "undefined",
        risk_level: "null",
        target: { type: "Persona", id: "NaN", version: "undefined" },
        occurred_at: "NaN",
        origin: "live",
      },
    ];

    renderJournal();

    // Headline is valid, status is NaN so it is hidden
    expect(screen.getByText("NaN Fields Entry")).toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();

    // Action and Risk should be hidden since they are undefined/null
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk")).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();

    // Target has NaN type/id so it is hidden completely
    expect(screen.queryByText("Target")).not.toBeInTheDocument();

    // Landed (date) is NaN so it is hidden
    expect(screen.queryByText("Landed")).not.toBeInTheDocument();

    // Fixture badge should NOT be rendered since origin is live
    expect(screen.queryByText("Fixture")).not.toBeInTheDocument();

    // Approval status should NOT be rendered since status is NaN (and thus hidden)
    expect(screen.queryByText("Approval status")).not.toBeInTheDocument();
  });
});
