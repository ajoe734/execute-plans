import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { v5List, type InterventionItem } from "@/lib/v5";
import { InterventionsPage } from "./Interventions";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderInterventions(initialEntry = "/management/interventions?finding=finding-123") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/interventions" element={<InterventionsPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function sentinelIntervention(): InterventionItem {
  return {
    id: "iv-live-001",
    source: "sentinel",
    severity: "warning",
    title: "Sentinel - Drawdown breach",
    summary: "Review the linked Sentinel finding before action.",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    requiredRoles: ["risk"],
    linkedFindingId: "finding-123",
    recommendedDecision: "approve",
    allowedDecisions: ["approve", "reject", "defer"],
    modifyAllowed: true,
  };
}

describe("InterventionsPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    mocks.useV5Live.mockReturnValue({
      data: v5List([sentinelIntervention()]),
      loading: false,
      refresh: vi.fn(),
    });
  });

  it("opens a Sentinel intervention from the finding deep link", async () => {
    renderInterventions();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Sentinel - Drawdown breach").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Open original source/i })).toHaveAttribute(
      "href",
      "/management/sentinel?finding=finding-123",
    );
  });
});
