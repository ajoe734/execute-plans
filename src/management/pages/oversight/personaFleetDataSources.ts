import type { ManagementDataSource, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

type RawDataSourceStatus = NonNullable<ManagementPersonaFleetRow["dataSourceStatus"]> & {
  provider_statuses?: Record<string, string>;
  provider_status_counts?: Record<string, number>;
  providerStatusCounts?: Record<string, number>;
  provider_count?: number;
  providerCount?: number;
  configured_source_count?: number;
  configuredSourceCount?: number;
  live_source_connector_ids?: string[];
  liveSourceConnectorIds?: string[];
  connector_health?: Array<Record<string, unknown>>;
  connectorHealth?: Array<Record<string, unknown>>;
  live_ingestion_enabled?: boolean;
  order_side_effects_allowed?: boolean;
};

type RawPersonaFleetRow = ManagementPersonaFleetRow & {
  data_source_status?: RawDataSourceStatus;
  data_sources?: ManagementDataSource[];
};

type RawDataSource = ManagementDataSource & {
  provider_key?: string;
  connector_id?: string;
  connectorId?: string;
  source_id?: string;
  sourceId?: string;
  health_status?: string;
  healthStatus?: string;
  connector_status?: string;
  connectorStatus?: string;
};

function providerStatusPriority(source: ManagementDataSource): number {
  const status = String(source.status ?? "").toLowerCase();
  if (/read_ok|readback_ok|smoke_ok/.test(status)) return 0;
  if (/partial/.test(status)) return 1;
  if (/unavailable|credential/.test(status)) return 3;
  return 2;
}

export function dataSourceStatus(row: ManagementPersonaFleetRow): RawDataSourceStatus | undefined {
  return row.dataSourceStatus ?? (row as RawPersonaFleetRow).data_source_status;
}

export function dataSourceProviderStatuses(row: ManagementPersonaFleetRow): Record<string, string> {
  const status = dataSourceStatus(row);
  return status?.providerStatuses ?? status?.provider_statuses ?? {};
}

export function dataSourceProviderStatusCounts(row: ManagementPersonaFleetRow): Record<string, number> {
  const status = dataSourceStatus(row);
  return status?.providerStatusCounts ?? status?.provider_status_counts ?? {};
}

export function dataSourceProviderCount(row: ManagementPersonaFleetRow): number {
  const status = dataSourceStatus(row);
  const counts = dataSourceProviderStatusCounts(row);
  const counted = Object.values(counts).reduce((total, count) => total + count, 0);
  return status?.providerCount
    ?? status?.provider_count
    ?? status?.configuredSourceCount
    ?? status?.configured_source_count
    ?? (counted || Object.keys(dataSourceProviderStatuses(row)).length);
}

export function dataSourceState(row: ManagementPersonaFleetRow): string | undefined {
  return dataSourceStatus(row)?.state;
}

export function dataSourceLiveEnabled(row: ManagementPersonaFleetRow): boolean | undefined {
  const status = dataSourceStatus(row);
  return status?.liveIngestionEnabled ?? status?.live_ingestion_enabled;
}

export function dataSourceOrderSideEffectsAllowed(row: ManagementPersonaFleetRow): boolean | undefined {
  const status = dataSourceStatus(row);
  return status?.orderSideEffectsAllowed ?? status?.order_side_effects_allowed;
}

function liveConnectorIds(row: ManagementPersonaFleetRow): string[] {
  const status = dataSourceStatus(row);
  return status?.liveSourceConnectorIds ?? status?.live_source_connector_ids ?? [];
}

function connectorHealthSources(row: ManagementPersonaFleetRow): ManagementDataSource[] {
  const status = dataSourceStatus(row);
  const health = status?.connectorHealth ?? status?.connector_health ?? [];
  return health.map((raw) => {
    const source = raw as RawDataSource;
    const providerKey = String(
      source.providerKey
      ?? source.provider_key
      ?? source.connectorId
      ?? source.connector_id
      ?? source.sourceId
      ?? source.source_id
      ?? "nan",
    );
    return {
      providerKey,
      provider: providerKey,
      status: String(
        source.status
        ?? source.healthStatus
        ?? source.health_status
        ?? source.connectorStatus
        ?? source.connector_status
        ?? "nan",
      ),
      orderCapableProvider: false,
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
    };
  });
}

function declaredConnectorSources(row: ManagementPersonaFleetRow): ManagementDataSource[] {
  const statuses = dataSourceProviderStatuses(row);
  return liveConnectorIds(row).map((providerKey) => ({
    providerKey,
    provider: providerKey,
    status: statuses[providerKey] ?? "declared",
    orderCapableProvider: false,
    readOnly: true,
    orderSideEffectsAllowed: false,
    capitalSideEffectsAllowed: false,
  }));
}

function providerStatusSources(row: ManagementPersonaFleetRow): ManagementDataSource[] {
  return Object.entries(dataSourceProviderStatuses(row)).map(([providerKey, status]) => ({
    providerKey,
    provider: providerKey,
    status,
    orderCapableProvider: false,
    readOnly: true,
    orderSideEffectsAllowed: false,
    capitalSideEffectsAllowed: false,
  }));
}

function normalizeSource(source: ManagementDataSource): ManagementDataSource {
  const raw = source as RawDataSource;
  const providerKey = raw.providerKey ?? raw.provider_key ?? raw.connectorId ?? raw.connector_id ?? "nan";
  return {
    ...source,
    providerKey,
    provider: source.provider || providerKey,
    status: source.status || "nan",
  };
}

function explicitSources(row: ManagementPersonaFleetRow): ManagementDataSource[] {
  return (row.dataSources ?? (row as RawPersonaFleetRow).data_sources ?? []).map(normalizeSource);
}

function uniqueSources(sources: ManagementDataSource[]): ManagementDataSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.providerKey;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function personaFleetDataSources(r: ManagementPersonaFleetRow): ManagementDataSource[] {
  return uniqueSources([
    ...explicitSources(r),
    ...providerStatusSources(r),
    ...connectorHealthSources(r),
    ...declaredConnectorSources(r),
  ])
    .map((source, index) => ({ source, index }))
    .sort((a, b) => (
      providerStatusPriority(a.source) - providerStatusPriority(b.source)
      || a.index - b.index
    ))
    .map(({ source }) => source);
}

export function visibleDataSources(r: ManagementPersonaFleetRow): ManagementDataSource[] {
  return personaFleetDataSources(r);
}
