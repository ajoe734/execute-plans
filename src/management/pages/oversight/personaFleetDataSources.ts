import { isNanLike } from "@/lib/enumLabels";
import type { ManagementDataSource, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

export const UNAVAILABLE_DATA_SOURCE_PLACEHOLDER = "unavailable";

type RawDataSourceStatus = NonNullable<ManagementPersonaFleetRow["dataSourceStatus"]> & {
  provider_statuses?: Record<string, string>;
  provider_status_counts?: Record<string, number>;
  providerStatusCounts?: Record<string, number>;
  provider_count?: number;
  providerCount?: number;
  configured_source_count?: number;
  configuredSourceCount?: number;
  entries?: ManagementDataSource[];
  items?: ManagementDataSource[];
  sources?: ManagementDataSource[];
  data_sources?: ManagementDataSource[];
  dataSources?: ManagementDataSource[];
  live_source_connector_ids?: string[];
  liveSourceConnectorIds?: string[];
  connector_health?: Array<Record<string, unknown>>;
  connectorHealth?: Array<Record<string, unknown>>;
  live_ingestion_enabled?: boolean;
  order_side_effects_allowed?: boolean;
};

type RawPersonaFleetRow = ManagementPersonaFleetRow & {
  data_source_status?: RawDataSourceStatus;
  dataSourceSummary?: RawDataSourceStatus;
  data_source_summary?: RawDataSourceStatus;
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

export function normalizeDataSourceString(value: unknown): string | null {
  if (typeof value !== "string" || isNanLike(value)) return null;
  const trimmed = value.trim();
  if (trimmed === "—" || trimmed === "-") return null;
  return trimmed;
}

export function normalizeDataSourceNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && !isNanLike(value)) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function providerStatusPriority(source: ManagementDataSource): number {
  const status = String(source.status ?? "").toLowerCase();
  if (/read_ok|readback_ok|smoke_ok/.test(status)) return 0;
  if (/partial/.test(status)) return 1;
  if (/unavailable|credential/.test(status)) return 3;
  return 2;
}

export function dataSourceStatus(row: ManagementPersonaFleetRow): RawDataSourceStatus | undefined {
  if (!row) return undefined;
  return row.dataSourceStatus
    ?? (row as RawPersonaFleetRow).data_source_status
    ?? (row as RawPersonaFleetRow).dataSourceSummary
    ?? (row as RawPersonaFleetRow).data_source_summary;
}

export function dataSourceProviderStatuses(row: ManagementPersonaFleetRow): Record<string, string> {
  const status = dataSourceStatus(row);
  const raw = status?.providerStatuses ?? status?.provider_statuses ?? {};
  if (!raw || typeof raw !== "object") return {};
  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = normalizeDataSourceString(rawKey);
    if (!key) continue;
    normalized[key] = normalizeDataSourceString(rawValue) ?? UNAVAILABLE_DATA_SOURCE_PLACEHOLDER;
  }
  return normalized;
}

export function dataSourceProviderStatusCounts(row: ManagementPersonaFleetRow): Record<string, number> {
  const status = dataSourceStatus(row);
  const raw = status?.providerStatusCounts ?? status?.provider_status_counts ?? {};
  if (!raw || typeof raw !== "object") return {};
  const normalized: Record<string, number> = {};
  for (const [rawKey, rawCount] of Object.entries(raw)) {
    const key = normalizeDataSourceString(rawKey);
    const count = normalizeDataSourceNumber(rawCount);
    if (!key || count === null) continue;
    normalized[key] = count;
  }
  return normalized;
}

export function dataSourceProviderCount(row: ManagementPersonaFleetRow): number {
  const status = dataSourceStatus(row);
  const counts = dataSourceProviderStatusCounts(row);
  const counted = Object.values(counts).reduce((total, count) => total + count, 0);
  const explicitCount =
    normalizeDataSourceNumber(status?.providerCount)
    ?? normalizeDataSourceNumber(status?.provider_count)
    ?? normalizeDataSourceNumber(status?.configuredSourceCount)
    ?? normalizeDataSourceNumber(status?.configured_source_count);
  return explicitCount ?? (counted || Object.keys(dataSourceProviderStatuses(row)).length);
}

export function dataSourceState(row: ManagementPersonaFleetRow): string | undefined {
  return normalizeDataSourceString(dataSourceStatus(row)?.state) ?? undefined;
}

export function dataSourceLiveEnabled(row: ManagementPersonaFleetRow): boolean | undefined {
  const status = dataSourceStatus(row);
  const val = status?.liveIngestionEnabled ?? status?.live_ingestion_enabled;
  return typeof val === "boolean" ? val : undefined;
}

export function dataSourceOrderSideEffectsAllowed(row: ManagementPersonaFleetRow): boolean | undefined {
  const status = dataSourceStatus(row);
  const val = status?.orderSideEffectsAllowed ?? status?.order_side_effects_allowed;
  return typeof val === "boolean" ? val : undefined;
}

function liveConnectorIds(row: ManagementPersonaFleetRow): string[] {
  const status = dataSourceStatus(row);
  const rawIds = status?.liveSourceConnectorIds ?? status?.live_source_connector_ids ?? [];
  if (!Array.isArray(rawIds)) return [];
  return rawIds
    .map((id) => normalizeDataSourceString(id))
    .filter((id): id is string => id !== null);
}

function connectorHealthSources(row: ManagementPersonaFleetRow): ManagementDataSource[] {
  const status = dataSourceStatus(row);
  const health = status?.connectorHealth ?? status?.connector_health ?? [];
  if (!Array.isArray(health)) return [];
  return health
    .filter((raw): raw is Record<string, unknown> => Boolean(raw) && typeof raw === "object")
    .map((raw) => {
      const source = raw as unknown as RawDataSource;
      const resolvedKey =
        normalizeDataSourceString(source.providerKey)
        ?? normalizeDataSourceString(source.provider_key)
        ?? normalizeDataSourceString(source.connectorId)
        ?? normalizeDataSourceString(source.connector_id)
        ?? normalizeDataSourceString(source.sourceId)
        ?? normalizeDataSourceString(source.source_id)
        ?? normalizeDataSourceString(source.provider);
      const providerKey = resolvedKey ?? UNAVAILABLE_DATA_SOURCE_PLACEHOLDER;
      const provider = normalizeDataSourceString(source.provider) ?? providerKey;
      const resolvedStatus =
        normalizeDataSourceString(source.status)
        ?? normalizeDataSourceString(source.healthStatus)
        ?? normalizeDataSourceString(source.health_status)
        ?? normalizeDataSourceString(source.connectorStatus)
        ?? normalizeDataSourceString(source.connector_status)
        ?? UNAVAILABLE_DATA_SOURCE_PLACEHOLDER;
      return {
        providerKey,
        provider,
        status: resolvedStatus,
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

export function normalizeSource(source: ManagementDataSource): ManagementDataSource {
  const raw = (source ?? {}) as RawDataSource;
  const resolvedKey =
    normalizeDataSourceString(raw.providerKey)
    ?? normalizeDataSourceString(raw.provider_key)
    ?? normalizeDataSourceString(raw.connectorId)
    ?? normalizeDataSourceString(raw.connector_id)
    ?? normalizeDataSourceString(raw.sourceId)
    ?? normalizeDataSourceString(raw.source_id)
    ?? normalizeDataSourceString(raw.provider);
  const providerKey = resolvedKey ?? UNAVAILABLE_DATA_SOURCE_PLACEHOLDER;
  const provider = normalizeDataSourceString(raw.provider) ?? providerKey;
  const status =
    normalizeDataSourceString(raw.status)
    ?? normalizeDataSourceString(raw.healthStatus)
    ?? normalizeDataSourceString(raw.health_status)
    ?? normalizeDataSourceString(raw.connectorStatus)
    ?? normalizeDataSourceString(raw.connector_status)
    ?? UNAVAILABLE_DATA_SOURCE_PLACEHOLDER;
  const market = normalizeDataSourceString(raw.market) ?? undefined;
  const sourceClass = normalizeDataSourceString(raw.sourceClass) ?? undefined;
  const evidenceRef = normalizeDataSourceString(raw.evidenceRef) ?? undefined;
  const orderPath = normalizeDataSourceString(raw.orderPath) ?? undefined;
  const reason = normalizeDataSourceString(raw.reason) ?? undefined;

  return {
    ...source,
    providerKey,
    provider,
    status,
    market,
    sourceClass,
    evidenceRef,
    orderPath,
    reason,
  };
}

function explicitSources(row: ManagementPersonaFleetRow): ManagementDataSource[] {
  const status = dataSourceStatus(row);
  const rowSources = Array.isArray(row?.dataSources)
    ? row.dataSources
    : Array.isArray((row as RawPersonaFleetRow)?.data_sources)
    ? (row as RawPersonaFleetRow).data_sources!
    : [];
  const statusEntries =
    status?.entries
    ?? status?.items
    ?? status?.sources
    ?? status?.dataSources
    ?? status?.data_sources
    ?? [];
  return [
    ...rowSources,
    ...(Array.isArray(statusEntries) ? statusEntries : []),
  ]
    .filter((item): item is ManagementDataSource => Boolean(item) && typeof item === "object")
    .map(normalizeSource);
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
