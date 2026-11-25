import { describe, expect, it } from "vitest";

import type { ManagementDataSource, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

import {
  UNAVAILABLE_DATA_SOURCE_PLACEHOLDER,
  dataSourceLiveEnabled,
  dataSourceOrderSideEffectsAllowed,
  dataSourceProviderCount,
  dataSourceProviderStatusCounts,
  dataSourceProviderStatuses,
  dataSourceState,
  dataSourceStatus,
  normalizeDataSourceNumber,
  normalizeDataSourceString,
  normalizeSource,
  personaFleetDataSources,
  visibleDataSources,
} from "./personaFleetDataSources";

function baseFleetRow(
  overrides: Partial<ManagementPersonaFleetRow> & Record<string, unknown> = {},
): ManagementPersonaFleetRow {
  return {
    personaId: "persona-tw-arb-001",
    personaName: "TW Index Arbitrage",
    owner: "pantheon-dev-operator",
    ooda: "Observe",
    autonomy: "supervised",
    perfDelta: 0.042,
    humanNeeded: false,
    lastMutation: "2026-11-25",
    ...overrides,
  };
}

describe("personaFleetDataSources", () => {
  it("normalizes missing, null, empty, and nan-like string or numeric fields to null", () => {
    expect(normalizeDataSourceString(null)).toBeNull();
    expect(normalizeDataSourceString(undefined)).toBeNull();
    expect(normalizeDataSourceString("")).toBeNull();
    expect(normalizeDataSourceString("   ")).toBeNull();
    expect(normalizeDataSourceString("nan")).toBeNull();
    expect(normalizeDataSourceString("NaN")).toBeNull();
    expect(normalizeDataSourceString("null")).toBeNull();
    expect(normalizeDataSourceString("undefined")).toBeNull();
    expect(normalizeDataSourceString("—")).toBeNull();
    expect(normalizeDataSourceString("  twse  ")).toBe("twse");

    expect(normalizeDataSourceNumber(null)).toBeNull();
    expect(normalizeDataSourceNumber(undefined)).toBeNull();
    expect(normalizeDataSourceNumber(Number.NaN)).toBeNull();
    expect(normalizeDataSourceNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeDataSourceNumber(-1)).toBeNull();
    expect(normalizeDataSourceNumber("nan")).toBeNull();
    expect(normalizeDataSourceNumber("NaN")).toBeNull();
    expect(normalizeDataSourceNumber("")).toBeNull();
    expect(normalizeDataSourceNumber(0)).toBe(0);
    expect(normalizeDataSourceNumber(5)).toBe(5);
    expect(normalizeDataSourceNumber("3")).toBe(3);
  });

  it("maps missing, null, or nan source fields in normalizeSource to explicit unavailable placeholders", () => {
    const normalizedMissing = normalizeSource({
      providerKey: "",
      provider: "",
      status: "",
      market: "nan",
      sourceClass: "NaN",
      evidenceRef: "null",
      orderPath: "undefined",
      reason: "—",
      orderCapableProvider: false,
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    });

    expect(normalizedMissing.providerKey).toBe(UNAVAILABLE_DATA_SOURCE_PLACEHOLDER);
    expect(normalizedMissing.provider).toBe(UNAVAILABLE_DATA_SOURCE_PLACEHOLDER);
    expect(normalizedMissing.status).toBe(UNAVAILABLE_DATA_SOURCE_PLACEHOLDER);
    expect(normalizedMissing.market).toBeUndefined();
    expect(normalizedMissing.sourceClass).toBeUndefined();
    expect(normalizedMissing.evidenceRef).toBeUndefined();
    expect(normalizedMissing.orderPath).toBeUndefined();
    expect(normalizedMissing.reason).toBeUndefined();

    const normalizedFromConnectorId = normalizeSource({
      providerKey: "nan",
      provider: "NaN",
      connector_id: "twse-daily",
      health_status: "read_ok",
      status: "nan",
      orderCapableProvider: false,
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    } as unknown as ManagementDataSource);

    expect(normalizedFromConnectorId.providerKey).toBe("twse-daily");
    expect(normalizedFromConnectorId.provider).toBe("twse-daily");
    expect(normalizedFromConnectorId.status).toBe("read_ok");
  });

  it("never leaks 'nan' from connector_health, explicit dataSources, providerStatuses, or live_source_connector_ids", () => {
    const row = baseFleetRow({
      dataSources: [
        {
          providerKey: "nan",
          provider: "nan",
          status: "nan",
          reason: "nan",
          orderCapableProvider: false,
          readOnly: true,
          orderSideEffectsAllowed: false,
          capitalSideEffectsAllowed: false,
        },
      ],
      dataSourceStatus: {
        state: "nan",
        providerStatuses: {
          shioaji: "read_ok",
          twse: "nan",
          nan: "read_ok",
        },
        providerStatusCounts: {
          read_ok: 1,
          nan: 3,
          read_unavailable: Number.NaN,
        },
        providerCount: Number.NaN,
        readbackRefs: [],
        unavailableRefs: [],
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
        liveIngestionEnabled: true,
        connector_health: [
          {
            connector_id: "finmind",
            health_status: "nan",
          },
          {
            connector_id: null,
            provider_key: undefined,
            status: null,
          },
        ],
        live_source_connector_ids: ["tpex", "nan", ""],
      } as unknown as ManagementPersonaFleetRow["dataSourceStatus"],
    });

    expect(dataSourceState(row)).toBeUndefined();
    expect(dataSourceLiveEnabled(row)).toBe(true);
    expect(dataSourceOrderSideEffectsAllowed(row)).toBe(false);

    const providerStatuses = dataSourceProviderStatuses(row);
    expect(providerStatuses).toEqual({
      shioaji: "read_ok",
      twse: UNAVAILABLE_DATA_SOURCE_PLACEHOLDER,
    });
    expect(Object.keys(providerStatuses)).not.toContain("nan");

    const statusCounts = dataSourceProviderStatusCounts(row);
    expect(statusCounts).toEqual({ read_ok: 1 });
    expect(dataSourceProviderCount(row)).toBe(1);

    const sources = personaFleetDataSources(row);
    expect(visibleDataSources(row)).toEqual(sources);
    expect(sources.map((s) => ({ key: s.providerKey, provider: s.provider, status: s.status }))).toEqual([
      { key: "shioaji", provider: "shioaji", status: "read_ok" },
      { key: "tpex", provider: "tpex", status: "declared" },
      {
        key: UNAVAILABLE_DATA_SOURCE_PLACEHOLDER,
        provider: UNAVAILABLE_DATA_SOURCE_PLACEHOLDER,
        status: UNAVAILABLE_DATA_SOURCE_PLACEHOLDER,
      },
      { key: "twse", provider: "twse", status: UNAVAILABLE_DATA_SOURCE_PLACEHOLDER },
      { key: "finmind", provider: "finmind", status: UNAVAILABLE_DATA_SOURCE_PLACEHOLDER },
    ]);

    for (const source of sources) {
      expect(source.providerKey.toLowerCase()).not.toBe("nan");
      expect(source.provider.toLowerCase()).not.toBe("nan");
      expect(source.status.toLowerCase()).not.toBe("nan");
      expect(source.reason?.toLowerCase()).not.toBe("nan");
    }
  });

  it("handles snake_case data_source_summary and null/missing status objects gracefully", () => {
    const emptyRow = baseFleetRow();
    expect(dataSourceStatus(emptyRow)).toBeUndefined();
    expect(dataSourceState(emptyRow)).toBeUndefined();
    expect(dataSourceProviderStatuses(emptyRow)).toEqual({});
    expect(dataSourceProviderStatusCounts(emptyRow)).toEqual({});
    expect(dataSourceProviderCount(emptyRow)).toBe(0);
    expect(personaFleetDataSources(emptyRow)).toEqual([]);

    const summaryRow = baseFleetRow({
      data_source_summary: {
        state: "live_readback_ok",
        configured_source_count: 2,
        provider_statuses: {
          twse: "readback_ok",
          mops: null as unknown as string,
        },
        live_ingestion_enabled: false,
        order_side_effects_allowed: false,
      },
    });

    expect(dataSourceState(summaryRow)).toBe("live_readback_ok");
    expect(dataSourceProviderCount(summaryRow)).toBe(2);
    expect(personaFleetDataSources(summaryRow)).toEqual([
      {
        providerKey: "twse",
        provider: "twse",
        status: "readback_ok",
        orderCapableProvider: false,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
      {
        providerKey: "mops",
        provider: "mops",
        status: UNAVAILABLE_DATA_SOURCE_PLACEHOLDER,
        orderCapableProvider: false,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
    ]);
  });
});
