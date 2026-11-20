import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { adaptDataSource, adaptDataSourceV2OrLegacy } from "@/lib/bff-v1/managementConsoleReads";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import type { ManagementDataSourceV2DTO } from "@/lib/bff-v1/managementDataSources";
import type { SystemDataSourceRecord } from "@/lib/v5/management/systemDataSources";
import {
  DataSourceControlCenter,
  fallbackPersonaSourceRecord,
  personaDataSourceRecords,
  personaSourceRecord,
} from "./DataSourceControlCenter";
import { DataSourceInstancesTable } from "./DataSourceInstancesTable";
import {
  MISSING_DATA_SOURCE_FIELD_LABEL,
  fmtToken,
  v2ToLegacyRecord,
} from "./dataSourceModels";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

function renderControlCenter(initialEntry = "/management/data-sources") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/data-sources" element={<DataSourceControlCenter />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function legacyConnectorRecord(
  overrides: Partial<SystemDataSourceRecord> = {},
): SystemDataSourceRecord {
  return {
    providerKey: "tw-twse-tpex-official-market",
    provider: "TWSE / TPEX Official Market",
    markets: ["TW"],
    sourceClasses: ["official_reference"],
    status: "enabled",
    tone: "muted",
    credentialState: "unknown",
    readOnly: true,
    orderCapableProvider: false,
    orderSideEffectsAllowed: false,
    capitalSideEffectsAllowed: false,
    liveIngestionEnabled: false,
    consumerPersonaIds: [],
    consumerPersonaNames: [],
    evidenceRefs: [],
    unavailableRefs: [],
    reasons: [],
    ...overrides,
  };
}

describe("DataSourceControlCenter — unavailable, degraded legacy, and nan-free truth (FE-DATA-SOURCES-UNAVAILABLE-NOT-ZERO-20261120)", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mocks.useV5Live.mockReset();
    await i18n.changeLanguage("zh-TW");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("shows unavailable state and translated read_timeout reason in header and table instead of 0 / 0/0 counts (2026-11-20 02:50Z hosted reproduction)", async () => {
    // Exact hosted shape observed 2026-11-20 02:50Z:
    // GET /bff/management/data-sources returned data.status=unavailable with
    // meta.surfaces.data_sources.reason=read_timeout in 4/4 reads.
    const hostedTimeoutResponse = {
      data: {
        id: "management-data-sources",
        items: [],
        summary: {
          total_items: 0,
          returned_items: 0,
          status: "unavailable",
          source: "unavailable",
        },
        status: "unavailable",
        source: "unavailable",
      },
      items: [],
      meta: {
        status: "unavailable",
        source: "unavailable",
        surfaces: {
          data_sources: {
            status: "unavailable",
            source: "unavailable",
            reason: "read_timeout",
            message: "Source-ingest registry is unavailable or unconfigured.",
          },
        },
        degradation: {
          reason: "read_timeout",
        },
      },
    };

    mocks.useV5Live.mockImplementation(
      (_loader: unknown, _deps: unknown, opts?: { cacheKey?: string }) => {
        if (opts?.cacheKey === "oversight.dataSources") {
          return {
            data: hostedTimeoutResponse,
            loading: false,
            refresh: vi.fn(),
          };
        }
        return {
          data: [],
          loading: false,
          refresh: vi.fn(),
        };
      },
    );

    renderControlCenter();

    // Header shows unavailable status and translated read_timeout reason in zh-TW
    expect(screen.getByTestId("data-sources-header-state")).toHaveTextContent("不可用");
    expect(screen.getByTestId("data-sources-header-reason")).toHaveTextContent("原因：上游讀取逾時");

    // Unavailable banner and table both show unavailable status and translated reason
    const unavailableCard = screen.getByTestId("data-sources-unavailable");
    expect(unavailableCard).toHaveTextContent("不可用");
    expect(unavailableCard).toHaveTextContent("原因：上游讀取逾時");

    const tableSurfaceBar = screen.getByTestId("instances-table-surface-status");
    expect(tableSurfaceBar).toHaveTextContent("不可用");
    expect(tableSurfaceBar).toHaveTextContent("原因：上游讀取逾時");

    const tableEmptyRow = screen.getByTestId("instances-table-empty-row");
    expect(tableEmptyRow).toHaveTextContent("不可用");
    expect(tableEmptyRow).toHaveTextContent("原因：上游讀取逾時");

    // No count is shown as 0 or 0/0 when the surface is unavailable
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("data-sources-authoritative-empty")).not.toBeInTheDocument();

    // Switch to en-US and verify translated state and reason
    await i18n.changeLanguage("en-US");
    expect(screen.getByTestId("data-sources-header-state")).toHaveTextContent("Unavailable");
    expect(screen.getByTestId("data-sources-header-reason")).toHaveTextContent(
      "Reason: Upstream read timed out",
    );
    expect(screen.getByTestId("instances-table-surface-status")).toHaveTextContent(
      "Reason: Upstream read timed out",
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
  });

  it("labels a degraded legacy projection with source legacy_projection and translated reason in header and table without rendering 0 for unverified counts", async () => {
    const degradedLegacyResponse = {
      items: [legacyConnectorRecord()],
      meta: {
        status: "degraded",
        source: "legacy_projection",
        reason:
          "v2 source management store is empty (zero instances); serving source-ingest connector registry as degraded legacy_projection.",
        surfaces: {
          data_sources: {
            status: "degraded",
            source: "legacy_projection",
            reason:
              "v2 source management store is empty (zero instances); serving source-ingest connector registry as degraded legacy_projection.",
          },
        },
      },
    };

    mocks.useV5Live
      .mockReturnValueOnce({
        data: degradedLegacyResponse,
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [],
        loading: false,
        refresh: vi.fn(),
      });

    renderControlCenter();

    // Header labels degraded state, legacy_projection source, and translated reason
    expect(screen.getByTestId("data-sources-header-state")).toHaveTextContent("降級");
    expect(screen.getByTestId("data-sources-header-source")).toHaveTextContent(
      "舊版相容投影 (legacy_projection)",
    );
    expect(screen.getByTestId("data-sources-header-reason")).toHaveTextContent(
      "V2 資料源管理儲存區為空（0 個實例），目前改由舊版相容投影（legacy_projection）提供連接器註冊表資料。",
    );

    // Degraded banner and table status bar also show degraded state, legacy_projection, and translated reason
    const banner = screen.getByTestId("degraded-legacy-banner");
    expect(banner).toHaveTextContent("舊版相容投影模式");
    expect(banner).toHaveTextContent("降級");
    expect(banner).toHaveTextContent("legacy_projection");
    expect(banner).toHaveTextContent(
      "V2 資料源管理儲存區為空（0 個實例），目前改由舊版相容投影（legacy_projection）提供連接器註冊表資料。",
    );

    const tableBar = screen.getByTestId("instances-table-surface-status");
    expect(tableBar).toHaveTextContent("降級");
    expect(tableBar).toHaveTextContent("legacy_projection");

    const table = screen.getByRole("table", { name: "資料源管理" });
    expect(within(table).getByText("TWSE / TPEX Official Market")).toBeInTheDocument();
    expect(within(table).getAllByText("legacy_projection").length).toBeGreaterThan(0);

    // Unverified zero counts in degraded mode show 未回報 / 已降級 rather than 0 or 0/1
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0/1")).not.toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.getAllByText("未回報").length).toBeGreaterThan(0);
  });

  it("shows generic degraded copy for a non-legacy degraded service_client response without claiming legacy projection mode or showing 0 counts", async () => {
    const nonLegacyDegradedResponse = {
      items: [],
      meta: {
        status: "degraded",
        source: "service_client",
        surfaces: {
          data_sources: {
            status: "degraded",
            source: "service_client",
            reason: "read_timeout",
          },
        },
      },
    };

    mocks.useV5Live.mockImplementation(
      (_loader: unknown, _deps: unknown, opts?: { cacheKey?: string }) => {
        if (opts?.cacheKey === "oversight.dataSources") {
          return {
            data: nonLegacyDegradedResponse,
            loading: false,
            refresh: vi.fn(),
          };
        }
        return {
          data: [],
          loading: false,
          refresh: vi.fn(),
        };
      },
    );

    renderControlCenter();

    expect(screen.getByTestId("data-sources-header-state")).toHaveTextContent("降級");
    expect(screen.getByTestId("data-sources-header-reason")).toHaveTextContent("原因：上游讀取逾時");
    expect(screen.queryByTestId("data-sources-header-source")).not.toBeInTheDocument();

    const banner = screen.getByTestId("degraded-legacy-banner");
    expect(banner).toHaveTextContent("資料源表面降級");
    expect(banner).toHaveTextContent("原因：上游讀取逾時");
    expect(banner).not.toHaveTextContent("舊版相容投影模式");
    expect(banner).not.toHaveTextContent("legacy_projection");

    const tableBar = screen.getByTestId("instances-table-surface-status");
    expect(tableBar).toHaveTextContent("降級");
    expect(tableBar).toHaveTextContent("原因：上游讀取逾時");
    expect(tableBar).not.toHaveTextContent("legacy_projection");

    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.queryByText(/舊版相容投影/)).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy_projection/i)).not.toBeInTheDocument();

    await i18n.changeLanguage("en-US");
    expect(screen.getByTestId("degraded-legacy-banner")).toHaveTextContent(
      "Data Source Surface Degraded",
    );
    expect(screen.getByTestId("degraded-legacy-banner")).not.toHaveTextContent(
      "Legacy Compatibility Projection Mode",
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
  });

  it("renders 未回報 instead of unknown when real adaptDataSourceV2OrLegacy or adaptDataSource omits provider and lifecycle/status fields", () => {
    const adaptedV2 = adaptDataSourceV2OrLegacy(
      {
        source_instance_id: "source-known",
        connector_id: "connector-known",
        definition: {},
        instance: {},
        desired: {},
        observed: {},
      },
      0,
    ) as ManagementDataSourceV2DTO;

    const legacyFromAdapted = v2ToLegacyRecord(adaptedV2);
    expect(legacyFromAdapted.providerKey).toBe("connector-known");
    expect(legacyFromAdapted.provider).toBe("未回報");
    expect(legacyFromAdapted.status).toBe("未回報");

    const adaptedLegacy = adaptDataSource({}, 0);

    mocks.useV5Live
      .mockReturnValueOnce({
        data: {
          items: [adaptedV2, adaptedLegacy],
          meta: {
            status: "ok",
            source: "service_client",
          },
        },
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [],
        loading: false,
        refresh: vi.fn(),
      });

    renderControlCenter();

    const table = screen.getByRole("table", { name: "資料源管理" });
    expect(within(table).getByText("source-known")).toBeInTheDocument();
    // 6 未回報 labels on the V2 row (provider, definition_state, desired_lifecycle, health_state, reconciliation_status, credential_state)
    // plus 5 未回報 labels on the legacy row (provider, providerKey, desired status, observed status, credentialState)
    expect(within(table).getAllByText("未回報").length).toBeGreaterThanOrEqual(6);
    expect(within(table).queryByText(/^unknown$/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/^nan$/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/^data-source-1$/i)).not.toBeInTheDocument();
  });

  it("renders 未回報 for a legacy record with a real connector ID when provider is omitted, and preserves authoritative source-1 / connector-1 view routing IDs", () => {
    const legacyWithConnectorOnly = adaptDataSource(
      { connector_id: "tw-registry", status: "enabled" },
      0,
    );
    const v2WithNumericId = adaptDataSourceV2OrLegacy(
      {
        source_instance_id: "source-1",
        connector_id: "connector-1",
        provider: "TWSE",
        definition: {},
        instance: {},
      },
      0,
    );
    const select = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <DataSourceInstancesTable
            records={[legacyWithConnectorOnly, v2WithNumericId]}
            onSelectSource={select}
            onExecuteAction={vi.fn()}
          />
        </MemoryRouter>
      </I18nextProvider>,
    );

    const rows = screen.getAllByRole("row");
    const legacyProviderCell = within(rows[1]).getAllByRole("cell")[0];
    expect(legacyProviderCell.querySelector(".font-semibold")).toHaveTextContent(
      "未回報",
    );
    expect(legacyProviderCell.querySelector(".font-mono")).toHaveTextContent(
      "tw-registry",
    );

    fireEvent.click(within(rows[2]).getByRole("button", { name: "檢視" }));
    expect(select).toHaveBeenCalledWith("source-1", v2WithNumericId);
  });

  it("shows 0 and 0/0 counts only when the BFF returns a successful empty list", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: {
          items: [],
          meta: {
            status: "ok",
            source: "service_client",
            surfaces: {
              data_sources: {
                status: "ok",
                source: "service_client",
              },
            },
          },
        },
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [],
        loading: false,
        refresh: vi.fn(),
      });

    renderControlCenter();

    expect(screen.getByTestId("data-sources-authoritative-empty")).toBeInTheDocument();
    expect(screen.getByText("尚未設定資料源")).toBeInTheDocument();
    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByTestId("data-sources-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("degraded-legacy-banner")).not.toBeInTheDocument();
  });

  it("never falls back to nan in DataSourceControlCenter or its models; missing provider or status reads 未回報", () => {
    expect(MISSING_DATA_SOURCE_FIELD_LABEL).toBe("未回報");
    expect(fmtToken("nan", MISSING_DATA_SOURCE_FIELD_LABEL)).toBe("未回報");
    expect(fmtToken("NaN", MISSING_DATA_SOURCE_FIELD_LABEL)).toBe("未回報");
    expect(fmtToken("", MISSING_DATA_SOURCE_FIELD_LABEL)).toBe("未回報");
    expect(fmtToken(undefined, MISSING_DATA_SOURCE_FIELD_LABEL)).toBe("未回報");

    const personaRow: ManagementPersonaFleetRow = {
      personaId: "persona-missing-source-fields",
      personaName: "Missing Source Persona",
      owner: "pantheon-dev",
      ooda: "Observe",
      autonomy: "supervised",
      perfDelta: 0,
      humanNeeded: false,
      lastMutation: "2026-11-20",
      dataSourceStatus: {
        state: "nan",
        summary: "Summary without declared providers",
        providerStatuses: {},
        providerStatusCounts: {},
        providerCount: 1,
        readbackRefs: [],
        unavailableRefs: [],
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
        liveIngestionEnabled: false,
      },
      dataSources: [],
    };

    const fallbackRecord = fallbackPersonaSourceRecord(personaRow);
    expect(fallbackRecord).not.toBeNull();
    expect(fallbackRecord?.provider).toBe("未回報");
    expect(fallbackRecord?.providerKey).toBe("未回報");
    expect(fallbackRecord?.status).toBe("未回報");

    const explicitNanSourceRecord = personaSourceRecord(personaRow, {
      providerKey: "nan",
      provider: "nan",
      status: "nan",
      readOnly: true,
      orderCapableProvider: false,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    });
    expect(explicitNanSourceRecord.provider).toBe("未回報");
    expect(explicitNanSourceRecord.providerKey).toBe("未回報");
    expect(explicitNanSourceRecord.status).toBe("未回報");

    const projectedV2 = v2ToLegacyRecord({
      schema_version: "management_data_source.v2",
      source_instance_id: "nan",
      connector_id: "nan",
      provider: "nan",
      source_class: "nan",
      definition: {
        definition_id: "nan",
        adapter_token: "nan",
        provider: "nan",
        definition_state: "nan",
      },
      instance: {
        data_source_id: "nan",
        source_kind: "data_source",
        definition_id: "nan",
        connector_id: "nan",
        provider: "nan",
        source_class: "nan",
        lifecycle_state: "nan",
      },
      desired: {
        source_instance_id: "nan",
        desired_lifecycle: "nan",
      },
      observed: {
        source_instance_id: "nan",
        effective_lifecycle: "nan",
        health_state: "nan",
      },
      allowed_actions: {
        canValidate: false,
        canCanary: false,
        canEnable: false,
        canDisable: false,
        canDegrade: false,
        canResume: false,
        canChangeSchedule: false,
        canReplace: false,
        canRetire: false,
        blockedReasons: [],
      },
      allowedActions: {
        canValidate: false,
        canCanary: false,
        canEnable: false,
        canDisable: false,
        canDegrade: false,
        canResume: false,
        canChangeSchedule: false,
        canReplace: false,
        canRetire: false,
        blockedReasons: [],
      },
    } as ManagementDataSourceV2DTO);
    expect(projectedV2.provider).toBe("未回報");
    expect(projectedV2.providerKey).toBe("未回報");
    expect(projectedV2.status).toBe("未回報");

    const derivedRecords = personaDataSourceRecords(personaRow);
    expect(derivedRecords).toHaveLength(1);
    expect(derivedRecords[0].provider).toBe("未回報");
    expect(derivedRecords[0].status).toBe("未回報");

    mocks.useV5Live
      .mockReturnValueOnce({
        data: { items: [] },
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [personaRow],
        loading: false,
        refresh: vi.fn(),
      });

    renderControlCenter(
      "/management/data-sources?persona=persona-missing-source-fields",
    );

    expect(screen.getAllByText("未回報").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/^nan$/i)).not.toBeInTheDocument();
  });
});
