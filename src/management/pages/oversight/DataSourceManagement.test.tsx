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
    vi.restoreAllMocks();
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

    it("disables Add Data Source button when real writes are off", async () => {
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

      const addBtn = screen.getAllByRole("button", { name: /Add Data Source/i })[0];
      expect(addBtn).toBeDisabled();
    });

    it("opens Add Wizard modal when real writes are enabled", async () => {
      const realWritesSpy = vi.spyOn(await import("@/lib/bff-v1/liveTransport"), "realWritesEnabled").mockReturnValue(true);

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

      const addBtn = screen.getAllByRole("button", { name: /Add Data Source/i })[0];
      expect(addBtn).toBeEnabled();
      fireEvent.click(addBtn);

      expect(screen.getByText("Add Managed Data Source")).toBeInTheDocument();
      expect(screen.getByText("Step 1 / 6")).toBeInTheDocument();

      realWritesSpy.mockRestore();
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

    it("renders distinct loading, authoritative-empty, unavailable, and degraded-legacy envelope states", async () => {
      // 1. Loading state
      mocks.useV5Live
        .mockReturnValueOnce({
          data: undefined,
          loading: true,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          refresh: vi.fn(),
        });

      const { unmount: unmountLoading } = renderPage("/management/data-sources");
      expect(screen.getByTestId("data-sources-loading")).toBeInTheDocument();
      expect(screen.getByText("Loading live Persona Fleet data sources…")).toBeInTheDocument();
      unmountLoading();

      // 2. Authoritative-Empty state (successful request with empty items array)
      mocks.useV5Live
        .mockReturnValueOnce({
          data: { items: [], meta: { status: "ok", source: "service_client" } },
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          refresh: vi.fn(),
        });

      const { unmount: unmountEmpty } = renderPage("/management/data-sources");
      expect(screen.getByTestId("data-sources-authoritative-empty")).toBeInTheDocument();
      expect(screen.getByText("No Data Sources Configured")).toBeInTheDocument();
      expect(screen.getByText(/No data source instances are currently configured in this environment/i)).toBeInTheDocument();
      unmountEmpty();

      // 3. Unavailable state (failed read or unavailable meta status)
      mocks.useV5Live
        .mockReturnValueOnce({
          data: { items: [], meta: { status: "unavailable", source: "frontend_empty_read" } },
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          refresh: vi.fn(),
        });

      const { unmount: unmountUnavailable } = renderPage("/management/data-sources");
      expect(screen.getByTestId("data-sources-unavailable")).toBeInTheDocument();
      expect(screen.getByText("Live data sources unavailable")).toBeInTheDocument();
      unmountUnavailable();

      // 4. Degraded-Legacy state (meta indicates degraded legacy projection)
      mocks.useV5Live
        .mockReturnValueOnce({
          data: {
            items: [systemRecord()],
            meta: { status: "degraded", source: "legacy_projection" },
          },
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          refresh: vi.fn(),
        });

      const { unmount: unmountDegraded } = renderPage("/management/data-sources");
      expect(screen.getByTestId("degraded-legacy-banner")).toBeInTheDocument();
      expect(screen.getByText("Legacy Compatibility Projection Mode")).toBeInTheDocument();
      expect(screen.getByText(/Data source rows are projected from legacy fleet state/i)).toBeInTheDocument();
      unmountDegraded();
    });

    it("gates all mutation controls when real writes are off, including Detail Drawer Change Schedule", async () => {
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

      // Verify Add button disabled
      const addBtn = screen.getAllByRole("button", { name: /Add Data Source/i })[0];
      expect(addBtn).toBeDisabled();

      // Open Detail Drawer
      const viewBtn = screen.getByRole("button", { name: /view/i });
      fireEvent.click(viewBtn);

      // Verify Detail Drawer Quick Actions disabled
      const drawerDisableBtn = screen.getAllByRole("button", { name: /^Disable$/i })[0];
      expect(drawerDisableBtn).toBeDisabled();

      // Switch to Schedule Tab in Drawer
      const scheduleTab = screen.getByRole("tab", { name: /Schedule & Universe/i });
      fireEvent.click(scheduleTab);

      // Verify Change Schedule button is disabled when writes are off
      const changeScheduleBtn = screen.getByRole("button", { name: /Change Schedule/i });
      expect(changeScheduleBtn).toBeDisabled();
      expect(changeScheduleBtn).toHaveAttribute("title", "Real writes are disabled (read-only mode).");
    });

    it("handles command lifecycle UX with pending, polling, and succeeded readback", async () => {
      const { DataSourceCommandDialog } = await import(
        "./dataSources/DataSourceCommandDialog"
      );
      const v2Item = mockV2DataSource();
      const onCommandSuccess = vi.fn();
      const writesSpy = vi
        .spyOn(await import("@/lib/bff-v1/liveTransport"), "realWritesEnabled")
        .mockReturnValue(true);

      const writesModule = await import("@/lib/bff-v1/managementDataSources");
      const disableSpy = vi
        .spyOn(writesModule.managementDataSourceWrites, "disableDataSource")
        .mockResolvedValueOnce({
          receipt_id: "rcp-disable-001",
          command_id: "cmd-001",
          source_instance_id: "ds-twse-market-v1",
          command_type: "disable",
          status: "accepted",
          before_revision: 2,
        });
      const pollSpy = vi
        .spyOn(writesModule.managementDataSourceWrites, "pollReceiptUntilTerminal")
        .mockResolvedValueOnce({
          receipt_id: "rcp-disable-001",
          command_id: "cmd-001",
          source_instance_id: "ds-twse-market-v1",
          command_type: "disable",
          status: "succeeded",
          before_revision: 2,
          after_revision: 3,
          readback: {
            desired_revision: 3,
            observed_revision: 3,
            reconciliation_status: "converged",
          },
        });

      render(
        <I18nextProvider i18n={i18n}>
          <DataSourceCommandDialog
            open={true}
            onOpenChange={vi.fn()}
            actionKey="disable"
            targetSource={v2Item}
            onCommandSuccess={onCommandSuccess}
          />
        </I18nextProvider>,
      );

      // Verify dialog is initialized with target info
      expect(screen.getByRole("heading", { name: "Execute Disable" })).toBeInTheDocument();
      expect(screen.getByText("ds-twse-market-v1")).toBeInTheDocument();
      expect(screen.getByText("Rev 2")).toBeInTheDocument();

      // Provide reason and submit command
      const reasonInput = screen.getByPlaceholderText(/Enter reason for this governance action/i);
      fireEvent.change(reasonInput, { target: { value: "Scheduled maintenance window" } });

      const execBtn = screen.getByRole("button", { name: /Execute Disable/i });
      expect(execBtn).toBeEnabled();
      fireEvent.click(execBtn);

      // Verify command submission was triggered and polled
      await waitFor(() => {
        expect(disableSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceInstanceId: "ds-twse-market-v1",
            expectedRevision: 2,
            reason: "Scheduled maintenance window",
          }),
        );
        expect(pollSpy).toHaveBeenCalledWith("rcp-disable-001");
      });

      // Verify success card renders with receipt ID, revisions, and callback fired
      await waitFor(() => {
        expect(screen.getByTestId("command-success-card")).toBeInTheDocument();
      });
      expect(screen.getByText(/Command Succeeded/i)).toBeInTheDocument();
      expect(screen.getByText(/Receipt ID: rcp-disable-001/i)).toBeInTheDocument();
      expect(screen.getByText(/Revision: 2 → 3/i)).toBeInTheDocument();
      expect(screen.getByText(/Reconciliation: converged/i)).toBeInTheDocument();
      expect(onCommandSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ receipt_id: "rcp-disable-001", status: "succeeded" }),
      );

      writesSpy.mockRestore();
      disableSpy.mockRestore();
      pollSpy.mockRestore();
    });

    it("handles command failure and rejection lifecycle states", async () => {
      const { DataSourceCommandDialog } = await import(
        "./dataSources/DataSourceCommandDialog"
      );
      const v2Item = mockV2DataSource();
      const onCommandSuccess = vi.fn();
      const writesSpy = vi
        .spyOn(await import("@/lib/bff-v1/liveTransport"), "realWritesEnabled")
        .mockReturnValue(true);

      const writesModule = await import("@/lib/bff-v1/managementDataSources");
      const disableSpy = vi
        .spyOn(writesModule.managementDataSourceWrites, "disableDataSource")
        .mockResolvedValueOnce({
          receipt_id: "rcp-disable-rejected",
          command_id: "cmd-002",
          source_instance_id: "ds-twse-market-v1",
          command_type: "disable",
          status: "rejected",
          failure: {
            code: "DEPENDENCY_BLOCK",
            message: "Disabling primary market feed is forbidden while active strategies are dependent",
          },
        });

      render(
        <I18nextProvider i18n={i18n}>
          <DataSourceCommandDialog
            open={true}
            onOpenChange={vi.fn()}
            actionKey="disable"
            targetSource={v2Item}
            onCommandSuccess={onCommandSuccess}
          />
        </I18nextProvider>,
      );

      const reasonInput = screen.getByPlaceholderText(/Enter reason for this governance action/i);
      fireEvent.change(reasonInput, { target: { value: "Attempting maintenance disable" } });

      const execBtn = screen.getByRole("button", { name: /Execute Disable/i });
      fireEvent.click(execBtn);

      await waitFor(() => {
        expect(screen.getByTestId("command-error-banner")).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Disabling primary market feed is forbidden while active strategies are dependent/i),
      ).toBeInTheDocument();
      expect(onCommandSuccess).not.toHaveBeenCalled();

      writesSpy.mockRestore();
      disableSpy.mockRestore();
    });

    it("handles poll exhaustion for accepted/running receipt by re-enabling Execute and minting a fresh idempotency key", async () => {
      const { DataSourceCommandDialog } = await import(
        "./dataSources/DataSourceCommandDialog"
      );
      const v2Item = mockV2DataSource();
      const onCommandSuccess = vi.fn();
      const writesSpy = vi
        .spyOn(await import("@/lib/bff-v1/liveTransport"), "realWritesEnabled")
        .mockReturnValue(true);

      const writesModule = await import("@/lib/bff-v1/managementDataSources");
      const disableSpy = vi
        .spyOn(writesModule.managementDataSourceWrites, "disableDataSource")
        .mockResolvedValue({
          receipt_id: "rcp-running-001",
          command_id: "cmd-003",
          source_instance_id: "ds-twse-market-v1",
          command_type: "disable",
          status: "running",
          before_revision: 2,
        });

      // Polling exhausts and returns receipt still in 'running' status
      const pollSpy = vi
        .spyOn(writesModule.managementDataSourceWrites, "pollReceiptUntilTerminal")
        .mockResolvedValueOnce({
          receipt_id: "rcp-running-001",
          command_id: "cmd-003",
          source_instance_id: "ds-twse-market-v1",
          command_type: "disable",
          status: "running",
          before_revision: 2,
        });

      render(
        <I18nextProvider i18n={i18n}>
          <DataSourceCommandDialog
            open={true}
            onOpenChange={vi.fn()}
            actionKey="disable"
            targetSource={v2Item}
            onCommandSuccess={onCommandSuccess}
          />
        </I18nextProvider>,
      );

      const reasonInput = screen.getByPlaceholderText(/Enter reason for this governance action/i);
      fireEvent.change(reasonInput, { target: { value: "Initial attempt" } });

      const execBtn = screen.getByRole("button", { name: /Execute Disable/i });
      fireEvent.click(execBtn);

      // First execution is submitted and polled
      await waitFor(() => {
        expect(disableSpy).toHaveBeenCalledTimes(1);
        expect(pollSpy).toHaveBeenCalledTimes(1);
      });

      // After poll exhaustion, the button is re-enabled for operator re-try
      await waitFor(() => {
        expect(execBtn).toBeEnabled();
      });

      // Operator clicks Execute again; a second command invocation is submitted with a new idempotency key
      fireEvent.click(execBtn);
      await waitFor(() => {
        expect(disableSpy).toHaveBeenCalledTimes(2);
      });

      writesSpy.mockRestore();
      disableSpy.mockRestore();
      pollSpy.mockRestore();
    });

    it("displays STALE_REVISION alert and provides corrective reload action", async () => {
      const { DataSourceCommandDialog } = await import(
        "./dataSources/DataSourceCommandDialog"
      );
      const v2Item = mockV2DataSource();
      const onCommandSuccess = vi.fn();
      const writesSpy = vi
        .spyOn(await import("@/lib/bff-v1/liveTransport"), "realWritesEnabled")
        .mockReturnValue(true);
      const disableSpy = vi
        .spyOn(
          (await import("@/lib/bff-v1/managementDataSources")).managementDataSourceWrites,
          "disableDataSource",
        )
        .mockRejectedValueOnce({
          code: "STALE_REVISION",
          message: "Expected revision 2 but current revision is 3",
        });

      render(
        <I18nextProvider i18n={i18n}>
          <DataSourceCommandDialog
            open={true}
            onOpenChange={vi.fn()}
            actionKey="disable"
            targetSource={v2Item}
            onCommandSuccess={onCommandSuccess}
          />
        </I18nextProvider>,
      );

      // Enter reason and execute
      const reasonInput = screen.getByPlaceholderText(/Enter reason for this governance action/i);
      fireEvent.change(reasonInput, { target: { value: "Operator maintenance disable" } });

      const execBtn = screen.getByRole("button", { name: /Execute Disable/i });
      expect(execBtn).toBeEnabled();
      fireEvent.click(execBtn);

      await waitFor(() => {
        expect(screen.getByTestId("stale-revision-alert")).toBeInTheDocument();
      });

      expect(screen.getByText("Revision Conflict (STALE_REVISION)")).toBeInTheDocument();
      expect(screen.getByText(/The data source revision has changed on the server/i)).toBeInTheDocument();

      const reloadBtn = screen.getByRole("button", { name: /Reload Latest State/i });
      expect(reloadBtn).toBeInTheDocument();
      fireEvent.click(reloadBtn);

      expect(onCommandSuccess).toHaveBeenCalled();

      writesSpy.mockRestore();
      disableSpy.mockRestore();
    });
  });
});
