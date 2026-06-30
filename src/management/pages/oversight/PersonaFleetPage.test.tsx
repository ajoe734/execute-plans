import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { PersonaFleetPage } from "./_core";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function fleetRow(personaId: string, personaName: string): ManagementPersonaFleetRow {
  return {
    personaId,
    personaName,
    owner: "pathreon-management",
    ooda: "Orient",
    autonomy: "supervised",
    perfDelta: 0.095,
    humanNeeded: true,
    lastMutation: "2026-06-07",
    state: "needs_human_approval",
    currentWork: `${personaName} research review`,
    dataSourceStatus: {
      state: "readback_ok",
      providerStatuses: { shioaji: "read_ok" },
      liveIngestionEnabled: true,
      orderSideEffectsAllowed: false,
    },
    dataSources: [{
      providerKey: "shioaji",
      provider: "Shioaji quote",
      status: "read_ok",
      orderCapableProvider: false,
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    }],
    researchStatus: {
      stage: "management_review_linked",
      frameworks: ["qlib"],
      pendingTaskIds: [],
      canDeploy: false,
      summary: `${personaName} summary`,
    },
    currentResearchProjects: [{
      projectId: "MGMT-QLIB-006",
      title: `${personaName} linked review`,
      stage: "management_review_linked",
      frameworks: ["qlib"],
      experimentId: "exp-mgmt-qlib-006",
      blockedByTaskIds: [],
      canDeploy: false,
    }],
  };
}

function renderFleet(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/persona-fleet" element={<PersonaFleetPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("PersonaFleetPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("honors the persona query by showing only the actionable persona row", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-crypto", "Crypto Macro Persona"),
        fleetRow("persona-us-equity", "US Equity Persona"),
        fleetRow("persona-tw-equity", "Taiwan Equity Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?persona=persona-tw-equity");

    expect(screen.getByText("Focused persona: persona-tw-equity")).toBeInTheDocument();
    expect(screen.getByText("Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Macro Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("US Equity Persona")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all personas" })).toHaveAttribute(
      "href",
      "/management/persona-fleet",
    );
    expect(screen.getByRole("link", { name: "persona-tw-equity human gate" })).toHaveAttribute(
      "href",
      "/management/human-inbox?persona=persona-tw-equity",
    );
  });

  it("does not report a focused persona as missing before live fleet data loads", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: true,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?persona=persona-tw-equity");

    expect(screen.getByText("Loading persona row for persona-tw-equity…")).toBeInTheDocument();
    expect(screen.queryByText("No persona fleet row found for persona-tw-equity.")).not.toBeInTheDocument();
    expect(screen.queryByText("Taiwan Equity Persona")).not.toBeInTheDocument();
  });
});
