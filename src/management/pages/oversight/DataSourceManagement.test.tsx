import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import type { SystemDataSourceRecord } from "@/lib/v5/management/systemDataSources";
import { DataSourceManagementPage } from "./DataSourceManagement";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

const PERSONA_ID = "persona-20260528-5937dea1";

function renderPage(initialEntry = `/management/data-sources?persona=${PERSONA_ID}`) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/data-sources" element={<DataSourceManagementPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function fleetRow(): ManagementPersonaFleetRow {
  return {
    personaId: PERSONA_ID,
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

function systemRecord(): SystemDataSourceRecord {
  return {
    providerKey: "conn-bounded-feed",
    provider: "Pantheon bounded external feed",
    markets: [],
    sourceClasses: ["bounded"],
    status: "enabled",
    tone: "muted",
    credentialState: "unknown",
    readOnly: true,
    orderCapableProvider: false,
    orderSideEffectsAllowed: false,
    capitalSideEffectsAllowed: false,
    liveIngestionEnabled: false,
    consumerPersonaIds: ["persona-global-only"],
    consumerPersonaNames: ["Global Only"],
    evidenceRefs: [],
    unavailableRefs: [],
    reasons: [],
  };
}

describe("DataSourceManagementPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("renders only the focused Persona Fleet provider statuses for OODA Observe links", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: { items: [systemRecord()] },
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [fleetRow()],
        loading: false,
        refresh: vi.fn(),
      });

    renderPage();

    expect(screen.getByText("Focused persona: persona-20260528-5937dea1 · source: all · 5 matching data source row(s)")).toBeInTheDocument();
    expect(screen.getAllByText("TW-Index-Arbitrage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("persona-20260528-5937dea1").length).toBeGreaterThan(0);
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("5 data sources")).toBeInTheDocument();
    expect(screen.getByText("Connection")).toBeInTheDocument();
    expect(screen.getAllByText("Consumer personas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Controls").length).toBeGreaterThan(0);
    for (const provider of ["shioaji", "twse", "tpex", "mops", "finmind"]) {
      expect(screen.getAllByText(provider).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("read ok")).toHaveLength(5);
    expect(screen.getAllByText("support/evidence/readback/shioaji.json").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pantheon bounded external feed")).not.toBeInTheDocument();
  });

  it("narrows a focused persona page to the requested source without falling back to global rows", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: { items: [systemRecord()] },
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [fleetRow()],
        loading: false,
        refresh: vi.fn(),
      });

    renderPage(`/management/data-sources?persona=${PERSONA_ID}&source=shioaji`);

    expect(screen.getByText("Focused persona: persona-20260528-5937dea1 · source: shioaji · 1 matching data source row(s)")).toBeInTheDocument();
    expect(screen.getAllByText("shioaji").length).toBeGreaterThan(0);
    expect(screen.getAllByText("read ok")).toHaveLength(1);
    expect(screen.queryByText("twse")).not.toBeInTheDocument();
    expect(screen.queryByText("Pantheon bounded external feed")).not.toBeInTheDocument();
  });

  it("keeps summary-only focused personas scoped and renders nan instead of global data sources", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: { items: [systemRecord()] },
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [{
          ...fleetRow(),
          dataSourceStatus: {
            state: "datasource_smoke_ok",
            summary: "Provider identities are not declared yet.",
            providerStatuses: {},
            providerStatusCounts: {
              datasource_smoke_ok: 1,
              read_unavailable: 1,
            },
            providerCount: 2,
            readbackRefs: [],
            unavailableRefs: [],
            readOnly: true,
            orderSideEffectsAllowed: false,
            capitalSideEffectsAllowed: false,
            liveIngestionEnabled: false,
          },
          dataSources: [],
        }],
        loading: false,
        refresh: vi.fn(),
      });

    renderPage();

    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getAllByText("nan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("datasource smoke ok").length).toBeGreaterThan(0);
    expect(screen.getByText("Provider identities are not declared yet.")).toBeInTheDocument();
    expect(screen.queryByText("Pantheon bounded external feed")).not.toBeInTheDocument();
  });
});
