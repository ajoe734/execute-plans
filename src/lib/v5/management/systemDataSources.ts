import type {
  ManagementDataSource,
  ManagementPersonaFleetRow,
} from "@/lib/bff-v1/management";

export type DataSourceHealthTone = "ok" | "warn" | "bad" | "muted";

export interface SystemDataSourceRecord {
  providerKey: string;
  provider: string;
  markets: string[];
  sourceClasses: string[];
  status: string;
  tone: DataSourceHealthTone;
  credentialState: "configured" | "missing" | "not_required" | "unknown";
  readOnly: boolean;
  orderCapableProvider: boolean;
  orderSideEffectsAllowed: boolean;
  capitalSideEffectsAllowed: boolean;
  liveIngestionEnabled: boolean;
  consumerPersonaIds: string[];
  consumerPersonaNames: string[];
  evidenceRefs: string[];
  unavailableRefs: string[];
  lastReadbackAt?: string;
  reasons: string[];
}

export interface SystemDataSourceSummary {
  total: number;
  readable: number;
  degraded: number;
  credentialMissing: number;
  liveIngestionOn: number;
  orderSideEffectsOn: number;
  markets: string[];
  consumerPersonas: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  coingecko: "CoinGecko",
  ibkr: "IBKR market data",
  kraken: "Kraken market data",
  mops: "MOPS",
  shioaji: "Shioaji quote",
  tej: "TEJ API",
  tpex: "TPEx E-Data",
  twse: "TWSE OpenAPI",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: Iterable<string | undefined>): string[] {
  return Array.from(new Set(Array.from(values).filter((value): value is string => Boolean(value))));
}

function providerFromStatusKey(providerKey: string): string {
  return PROVIDER_LABELS[providerKey] ?? providerKey.toUpperCase();
}

export function dataSourceTone(status: string | undefined): DataSourceHealthTone {
  const token = String(status ?? "").toLowerCase();
  if (/read_ok|readback_ok|quote_readback_ok|datasource_smoke_ok|smoke_ok/.test(token)) return "ok";
  if (/credential|blocked|failed|reject/.test(token)) return "bad";
  if (/partial|unavailable|stale|degraded|unknown/.test(token)) return "warn";
  return "muted";
}

function statusSeverity(status: string | undefined): number {
  const tone = dataSourceTone(status);
  if (tone === "bad") return 3;
  if (tone === "warn") return 2;
  if (tone === "ok") return 1;
  return 0;
}

function mergeStatus(current: string, next: string): string {
  return statusSeverity(next) > statusSeverity(current) ? next : current;
}

function credentialStateFor(source: ManagementDataSource | undefined, status: string) {
  const token = status.toLowerCase();
  if (token.includes("credential")) return "missing" as const;
  if (dataSourceTone(status) === "ok") return "configured" as const;
  if (source?.sourceClass === "official_reference") return "not_required" as const;
  return "unknown" as const;
}

function refsForProvider(refs: string[] | undefined, providerKey: string): string[] {
  return (refs ?? []).filter((ref) => ref.toLowerCase().includes(providerKey));
}

export function buildSystemDataSourceRegistry(rows: ManagementPersonaFleetRow[]): SystemDataSourceRecord[] {
  const byKey = new Map<string, SystemDataSourceRecord>();

  for (const row of rows) {
    const providerStatuses = row.dataSourceStatus?.providerStatuses ?? {};
    const normalizedStatuses = Object.fromEntries(
      Object.entries(providerStatuses).map(([key, value]) => [normalizeKey(key), value]),
    );
    const sources = row.dataSources ?? [];
    const sourceByKey = new Map<string, ManagementDataSource>();
    for (const source of sources) {
      sourceByKey.set(normalizeKey(source.providerKey || source.provider), source);
    }

    const providerKeys = unique([
      ...Object.keys(providerStatuses).map(normalizeKey),
      ...sources.map((source) => normalizeKey(source.providerKey || source.provider)),
    ]);

    for (const providerKey of providerKeys) {
      const source = sourceByKey.get(providerKey);
      const status = source?.status || normalizedStatuses[providerKey] || normalizedStatuses[normalizeKey(source?.providerKey ?? "")] || "unknown";
      const existing = byKey.get(providerKey);
      const marketValues = source?.market ? [source.market] : row.marketScope ?? [];
      const evidenceRefs = unique([
        source?.evidenceRef,
        ...refsForProvider(row.dataSourceStatus?.readbackRefs, providerKey),
      ]);
      const unavailableRefs = refsForProvider(row.dataSourceStatus?.unavailableRefs, providerKey);

      if (!existing) {
        byKey.set(providerKey, {
          providerKey,
          provider: source?.provider || providerFromStatusKey(providerKey),
          markets: unique(marketValues),
          sourceClasses: unique([source?.sourceClass]),
          status,
          tone: dataSourceTone(status),
          credentialState: credentialStateFor(source, status),
          readOnly: source?.readOnly ?? row.dataSourceStatus?.readOnly ?? true,
          orderCapableProvider: source?.orderCapableProvider ?? false,
          orderSideEffectsAllowed: source?.orderSideEffectsAllowed ?? row.dataSourceStatus?.orderSideEffectsAllowed ?? false,
          capitalSideEffectsAllowed: source?.capitalSideEffectsAllowed ?? row.dataSourceStatus?.capitalSideEffectsAllowed ?? false,
          liveIngestionEnabled: row.dataSourceStatus?.liveIngestionEnabled ?? false,
          consumerPersonaIds: [row.personaId],
          consumerPersonaNames: [row.personaName || row.personaId],
          evidenceRefs,
          unavailableRefs,
          lastReadbackAt: row.dataSourceStatus?.readbackCapturedAt,
          reasons: unique([source?.reason, row.dataSourceStatus?.summary]),
        });
        continue;
      }

      existing.provider = existing.provider || source?.provider || providerFromStatusKey(providerKey);
      existing.markets = unique([...existing.markets, ...marketValues]);
      existing.sourceClasses = unique([...existing.sourceClasses, source?.sourceClass]);
      existing.status = mergeStatus(existing.status, status);
      existing.tone = dataSourceTone(existing.status);
      existing.credentialState = existing.credentialState === "missing"
        ? "missing"
        : credentialStateFor(source, existing.status);
      existing.readOnly = existing.readOnly && (source?.readOnly ?? row.dataSourceStatus?.readOnly ?? true);
      existing.orderCapableProvider = existing.orderCapableProvider || Boolean(source?.orderCapableProvider);
      existing.orderSideEffectsAllowed = existing.orderSideEffectsAllowed || Boolean(source?.orderSideEffectsAllowed ?? row.dataSourceStatus?.orderSideEffectsAllowed);
      existing.capitalSideEffectsAllowed = existing.capitalSideEffectsAllowed || Boolean(source?.capitalSideEffectsAllowed ?? row.dataSourceStatus?.capitalSideEffectsAllowed);
      existing.liveIngestionEnabled = existing.liveIngestionEnabled || Boolean(row.dataSourceStatus?.liveIngestionEnabled);
      existing.consumerPersonaIds = unique([...existing.consumerPersonaIds, row.personaId]);
      existing.consumerPersonaNames = unique([...existing.consumerPersonaNames, row.personaName || row.personaId]);
      existing.evidenceRefs = unique([...existing.evidenceRefs, ...evidenceRefs]);
      existing.unavailableRefs = unique([...existing.unavailableRefs, ...unavailableRefs]);
      existing.lastReadbackAt = existing.lastReadbackAt || row.dataSourceStatus?.readbackCapturedAt;
      existing.reasons = unique([...existing.reasons, source?.reason, row.dataSourceStatus?.summary]);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => (
    statusSeverity(b.status) - statusSeverity(a.status)
    || a.provider.localeCompare(b.provider)
  ));
}

export function summarizeSystemDataSources(records: SystemDataSourceRecord[]): SystemDataSourceSummary {
  const consumers = new Set<string>();
  const markets = new Set<string>();
  for (const record of records) {
    record.consumerPersonaIds.forEach((id) => consumers.add(id));
    record.markets.forEach((market) => markets.add(market));
  }

  return {
    total: records.length,
    readable: records.filter((record) => record.tone === "ok").length,
    degraded: records.filter((record) => record.tone === "warn" || record.tone === "bad").length,
    credentialMissing: records.filter((record) => record.credentialState === "missing").length,
    liveIngestionOn: records.filter((record) => record.liveIngestionEnabled).length,
    orderSideEffectsOn: records.filter((record) => record.orderSideEffectsAllowed || record.capitalSideEffectsAllowed).length,
    markets: Array.from(markets).sort(),
    consumerPersonas: consumers.size,
  };
}
