import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { DataSourceManagementPage } from "./DataSourceManagement";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/data-sources?persona=persona-20260528-5937dea1&source=shioaji"]}>
        <Routes>
          <Route path="/management/data-sources" element={<DataSourceManagementPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function fleetRow(): ManagementPersonaFleetRow {
  return {
    personaId: "persona-20260528-5937dea1",
    personaName: "TW-Index-Arbitrage",
    owner: "pantheon-dev-browser",
    ooda: "Decide",
    autonomy: "supervised",
    perfDelta: 0.095,
    humanNeeded: true,
    lastMutation: "2026-06-03",
    dataSourceStatus: {
      state: "live_readback_ok",
      summary: "All declared data-source providers (5/5) report readback OK.",
      providerStatuses: {
        shioaji: "read_ok",
        twse: "read_ok",
        tpex: "read_ok",
        mops: "read_ok",
        finmind: "read_ok",
      },
      readbackRefs: ["support/evidence/readback/shioaji.json"],
      unavailableRefs: [],
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      liveIngestionEnabled: true,
    },
  };
}

describe("DataSourceManagementPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("renders Persona Fleet declared provider statuses for focused OODA Observe links", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: { items: [] },
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [fleetRow()],
        loading: false,
        refresh: vi.fn(),
      });

    renderPage();

    expect(screen.getByText("TW-Index-Arbitrage")).toBeInTheDocument();
    expect(screen.getByText("persona-20260528-5937dea1")).toBeInTheDocument();
    expect(screen.getByText("5/5 readable")).toBeInTheDocument();
    for (const provider of ["shioaji", "twse", "tpex", "mops", "finmind"]) {
      expect(screen.getAllByText(provider).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("read ok")).toHaveLength(5);
    expect(screen.getByText("support/evidence/readback/shioaji.json")).toBeInTheDocument();
  });
});
