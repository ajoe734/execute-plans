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

function fleetRow(
  personaId: string,
  personaName: string,
  overrides: Partial<ManagementPersonaFleetRow> = {},
): ManagementPersonaFleetRow {
  const row: ManagementPersonaFleetRow = {
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
  return { ...row, ...overrides };
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
        fleetRow("persona-live-crypto", "Live Crypto Persona"),
        fleetRow("persona-live-us-equity", "Live US Equity Persona"),
        fleetRow("persona-live-tw-equity", "Live Taiwan Equity Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet?persona=persona-live-tw-equity");

    expect(screen.getByText("Focused persona: persona-live-tw-equity")).toBeInTheDocument();
    expect(screen.getByText("Live Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Live Crypto Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("Live US Equity Persona")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all personas" })).toHaveAttribute(
      "href",
      "/management/persona-fleet",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity human gate" })).toHaveAttribute(
      "href",
      "/management/human-inbox?persona=persona-live-tw-equity",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity research detail" })).toHaveAttribute(
      "href",
      "/management/experiments/exp-mgmt-qlib-006",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity performance attribution" })).toHaveAttribute(
      "href",
      "/management/performance-attribution?dimension=persona&persona=persona-live-tw-equity",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity mutation history" })).toHaveAttribute(
      "href",
      "/management/evolution-journal?persona=persona-live-tw-equity",
    );
    expect(screen.getByRole("link", { name: "persona-live-tw-equity status detail" })).toHaveAttribute(
      "href",
      "/management/human-inbox?persona=persona-live-tw-equity",
    );
  });

  it("hides non-production live rows by default", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-crypto", "Crypto Persona"),
        fleetRow("dry-run-write-probe-persona", "Dry Run Probe Persona"),
        fleetRow("persona-live-gold", "Gold Futures Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByText("Gold Futures Persona")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("Dry Run Probe Persona")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show non-production (2)" })).toBeInTheDocument();
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

  it("shows a live-only empty state instead of demo fleet rows", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByText("Live Persona Fleet data unavailable")).toBeInTheDocument();
    expect(screen.getByText("This page does not render demo, seed, or non-production Persona Fleet rows.")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Macro Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("US Equity Persona")).not.toBeInTheDocument();
    expect(screen.queryByText("Taiwan Equity Persona")).not.toBeInTheDocument();
  });

  it("routes paper-running personas to runtime management instead of onboarding", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-paper", "Paper Persona", {
          humanNeeded: true,
          state: "paper_running",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "View runtime for persona-paper" })).toHaveAttribute(
      "href",
      "/management/runtimes?persona=persona-paper",
    );
    expect(screen.queryByRole("link", { name: "Continue onboarding for persona-paper" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start onboarding for persona-paper" })).not.toBeInTheDocument();
  });

  it("routes deployed personas to runtime management instead of persona onboarding", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-deployed", "Deployed Persona", {
          humanNeeded: false,
          state: "deployed",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "View runtime for persona-deployed" })).toHaveAttribute(
      "href",
      "/management/runtimes?persona=persona-deployed",
    );
    expect(screen.queryByRole("link", { name: "Start onboarding for persona-deployed" })).not.toBeInTheDocument();
  });

  it("routes personas waiting on humans to the human gate", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-approval", "Approval Persona", {
          humanNeeded: true,
          state: "needs_human_approval",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "Review human gate for persona-approval" })).toHaveAttribute(
      "href",
      "/management/human-inbox?persona=persona-approval",
    );
    expect(screen.queryByRole("link", { name: "Continue onboarding for persona-approval" })).not.toBeInTheDocument();
  });

  it("keeps onboarding as the primary action only for draft personas", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        fleetRow("persona-draft", "Draft Persona", {
          humanNeeded: false,
          state: "draft",
        }),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderFleet("/management/persona-fleet");

    expect(screen.getByRole("link", { name: "Start onboarding for persona-draft" })).toHaveAttribute(
      "href",
      "/management/personas/persona-draft/onboarding",
    );
  });
});
