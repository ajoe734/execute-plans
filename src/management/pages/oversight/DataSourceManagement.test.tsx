import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import type { ManagementDataSourceV2DTO } from "@/lib/bff-v1/managementDataSources";
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

function mockV2DataSource(overrides: Partial<ManagementDataSourceV2DTO> = {}): ManagementDataSourceV2DTO {
  return {
    schema_version: "management_data_source.v2",
    source_instance_id: "ds-twse-market-v1",
    connector_id: "ds-twse-market-v1",
    provider: "TWSE",
    source_class: "market_daily",
    definition: {
      definition_id: "twse-openapi-daily",
      adapter_token: "TwseAdapter.records_from_payload",
      adapter_version: "1.0.0",
      provider: "TWSE",
      definition_state: "supported",
      datasets: ["tw_price_daily", "tw_dividends"],
      markets: ["TW"],
      deployment_sha: "abc1234567890",
    },
    instance: {
      data_source_id: "ds-twse-market-v1",
      source_kind: "data_source",
      definition_id: "twse-openapi-daily",
      connector_id: "ds-twse-market-v1",
      provider: "TWSE",
      source_class: "market_daily",
      lifecycle_state: "enabled",
      revision: 2,
      markets: ["TW"],
      datasets: ["tw_price_daily"],
      license_scope: "official_reference",
      allowed_use: ["research_data", "backtest_data", "monitoring"],
    },
    desired: {
      source_instance_id: "ds-twse-market-v1",
      revision: 2,
      desired_lifecycle: "enabled",
      definition_id: "twse-openapi-daily",
      connector_config: {
        public: { endpoint_url: "https://openapi.twse.com.tw" },
        secret_ref_id: "vault://secret/twse-api-key",
      },
      schedule: {
        enabled: true,
        cadence: "0 19 * * 1-5",
        timezone: "Asia/Taipei",
      },
    },
    observed: {
      source_instance_id: "ds-twse-market-v1",
      desired_revision: 2,
      observed_revision: 2,
      reconciliation_status: "converged",
      effective_lifecycle: "enabled",
      health_state: "healthy",
      credential_state: "configured",
      validation_state: "passed",
      canary_state: "passed",
      freshness: {
        watermark: "2026-08-24T13:30:00Z",
        age_seconds: 120,
        last_success_at: "2026-08-24T13:32:00Z",
      },
      last_run: {
        ingest_run_id: "run-twse-001",
        row_count: 1500,
        rejected_count: 0,
        evidence_bundle_id: "ev-twse-20260824",
      },
      dependent_refs: ["persona-tw-arb"],
    },
    allowed_actions: {
      canValidate: true,
      canCanary: true,
      canEnable: false,
      canDisable: true,
      canDegrade: true,
      canResume: false,
      canChangeSchedule: true,
      canReplace: true,
      canRetire: false,
      blockedReasons: ["already_enabled", "retire_requires_disabled"],
    },
    allowedActions: {
      canValidate: true,
      canCanary: true,
      canEnable: false,
      canDisable: true,
      canDegrade: true,
      canResume: false,
      canChangeSchedule: true,
      canReplace: true,
      canRetire: false,
      blockedReasons: ["already_enabled", "retire_requires_disabled"],
    },
    ...overrides,
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

  describe("SD-SRCM-04 Control Center V2 Features", () => {
    it("renders all 9 canonical columns and server-governed allowedActions", async () => {
      const v2Item = mockV2DataSource();
      mocks.useV5Live
        .mockReturnValueOnce({
          data: { items: [v2Item] },
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          refresh: vi.fn(),
        });

      renderPage("/management/data-sources");

      // Verify Page Title & Header
      expect(screen.getByText("Data Source Management")).toBeInTheDocument();
      expect(screen.getByText("Add Data Source")).toBeInTheDocument();

      // Verify 9 Column Headers
      expect(screen.getByText("Source / Provider")).toBeInTheDocument();
      expect(screen.getByText("Support / Deployment")).toBeInTheDocument();
      expect(screen.getByText("Desired Lifecycle")).toBeInTheDocument();
      expect(screen.getByText("Observed Health")).toBeInTheDocument();
      expect(screen.getByText("Credential / License")).toBeInTheDocument();
      expect(screen.getByText("Schedule / Watermark")).toBeInTheDocument();
      expect(screen.getByText("Latest Run / Search")).toBeInTheDocument();
      expect(screen.getByText("Consumers / Cost")).toBeInTheDocument();
      expect(screen.getByText("Actions")).toBeInTheDocument();

      // Verify V2 Instance Row Data
      expect(screen.getByText("ds-twse-market-v1")).toBeInTheDocument();
      expect(screen.getByText("TWSE")).toBeInTheDocument();
      expect(screen.getByText("supported")).toBeInTheDocument();
      expect(screen.getByText("enabled")).toBeInTheDocument();
      expect(screen.getByText("healthy")).toBeInTheDocument();
      expect(screen.getByText("vault://secret/twse-api-key")).toBeInTheDocument();
      expect(screen.getByText("0 19 * * 1-5 (Asia/Taipei)")).toBeInTheDocument();
      expect(screen.getByText("1500")).toBeInTheDocument();
      expect(screen.getByText("ev-twse-20260824")).toBeInTheDocument();
      expect(screen.getByText("persona-tw-arb")).toBeInTheDocument();
    });

    it("highlights desired vs observed divergence clearly", async () => {
      const divergedItem = mockV2DataSource({
        desired: {
          source_instance_id: "ds-twse-diverged",
          revision: 3,
          desired_lifecycle: "enabled",
        },
        observed: {
          source_instance_id: "ds-twse-diverged",
          desired_revision: 2,
          observed_revision: 2,
          reconciliation_status: "diverged",
          effective_lifecycle: "degraded",
          health_state: "degraded",
        },
      });

      mocks.useV5Live
        .mockReturnValueOnce({
          data: { items: [divergedItem] },
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          refresh: vi.fn(),
        });

      renderPage("/management/data-sources");

      expect(screen.getByText("diverged")).toBeInTheDocument();
      expect(screen.getByText("degraded")).toBeInTheDocument();
    });

    it("opens Add Wizard modal and rejects raw inline secrets", async () => {
      mocks.useV5Live
        .mockReturnValueOnce({
          data: { items: [] },
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          refresh: vi.fn(),
        });

      renderPage("/management/data-sources");

      const addBtn = screen.getByText("Add Data Source");
      fireEvent.click(addBtn);

      expect(screen.getByText("Add Managed Data Source")).toBeInTheDocument();
      expect(screen.getByText("Step 1 / 6")).toBeInTheDocument();
    });

    it("renders catalog, runs, and receipts tabs via URL query params", async () => {
      const v2Item = mockV2DataSource();
      mocks.useV5Live
        .mockReturnValue({
          data: { items: [v2Item] },
          loading: false,
          refresh: vi.fn(),
        });

      // Render with Catalog tab active
      const { unmount } = renderPage("/management/data-sources?tab=catalog");
      expect(screen.getByText("Phase 1 Offline Development Intake")).toBeInTheDocument();
      unmount();

      // Render with Runs tab active
      const { unmount: unmountRuns } = renderPage("/management/data-sources?tab=runs");
      expect(screen.getByText("Bounded Read-Only Canary Pulls")).toBeInTheDocument();
      unmountRuns();

      // Render with Receipts tab active
      const { unmount: unmountReceipts } = renderPage("/management/data-sources?tab=receipts");
      expect(screen.getByText("Command Receipts Ledger")).toBeInTheDocument();
      unmountReceipts();
    });
  });

});
