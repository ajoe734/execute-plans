// Data source models, typeguards, badges, tone mappings and formatters (SD-SRCM-04).

import {
  extractDataSourceEnvelopeItems,
  normalizeDataSourceReasonCode,
  resolveDataSourceSurfaceState,
  type ConnectorDefinition,
  type DataSourceInstance,
  type DataSourceSurfaceResolution,
  type DataSourceSurfaceStatus,
  type ManagementDataSourceV2DTO,
  type SourceAllowedActions,
  type SourceCanaryResult,
  type SourceCommandReceipt,
  type SourceDesiredState,
  type SourceObservedState,
} from "@/lib/bff-v1/managementDataSources";
import {
  reasonCodeLabel,
  sanitizeRawText,
  statusLabel,
  type TranslateFn,
} from "@/lib/enumLabels";
import type { SystemDataSourceRecord } from "@/lib/v5/management/systemDataSources";

export {
  extractDataSourceEnvelopeItems,
  normalizeDataSourceReasonCode,
  resolveDataSourceSurfaceState,
};

export type {
  ConnectorDefinition,
  DataSourceInstance,
  DataSourceSurfaceResolution,
  DataSourceSurfaceStatus,
  ManagementDataSourceV2DTO,
  SourceAllowedActions,
  SourceCanaryResult,
  SourceCommandReceipt,
  SourceDesiredState,
  SourceObservedState,
};

export const MISSING_DATA_SOURCE_FIELD_LABEL = "未回報";

export type ControlCenterTab = "instances" | "catalog" | "runs" | "receipts";

export type HealthTone = "ok" | "warn" | "bad" | "muted";

export const toneClass: Record<HealthTone, string> = {
  ok: "bg-status-success/10 text-status-success border-status-success/30",
  warn: "bg-status-warning/15 text-status-warning border-status-warning/30",
  bad: "bg-status-failed/10 text-status-failed border-status-failed/30",
  muted: "bg-muted text-muted-foreground border-border",
};

const ADAPTER_MISSING_SENTINELS = new Set([
  "unknown",
  "unknown-source",
  "unknown_source",
]);
const ADAPTER_SYNTHETIC_LEGACY_KEY_RE = /^data-source-\d+$/i;

export function cleanSourceToken(value?: string | null): string | undefined {
  const cleaned = sanitizeRawText(value);
  if (!cleaned) return undefined;
  if (ADAPTER_MISSING_SENTINELS.has(cleaned.toLowerCase())) return undefined;
  return cleaned;
}

export interface LegacyProviderRecordLike {
  provider?: string | null;
  providerKey?: string | null;
  provider_key?: unknown;
  connector_id?: unknown;
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
}

export function resolveLegacyProviderKey(
  record: LegacyProviderRecordLike,
): string | undefined {
  const candidates = [
    record.providerKey,
    typeof record.provider_key === "string" ? record.provider_key : undefined,
    typeof record.connector_id === "string" ? record.connector_id : undefined,
    typeof record.id === "string" ? record.id : undefined,
    record.provider,
    typeof record.name === "string" ? record.name : undefined,
    typeof record.display_name === "string" ? record.display_name : undefined,
  ];
  for (const candidate of candidates) {
    const cleaned = cleanSourceToken(candidate);
    if (
      cleaned &&
      cleaned !== MISSING_DATA_SOURCE_FIELD_LABEL &&
      !ADAPTER_SYNTHETIC_LEGACY_KEY_RE.test(cleaned)
    ) {
      return cleaned;
    }
  }
  return undefined;
}

export function resolveLegacyProviderKeyLabel(
  record: LegacyProviderRecordLike,
  fallback = MISSING_DATA_SOURCE_FIELD_LABEL,
): string {
  return resolveLegacyProviderKey(record) ?? fallback;
}

export function resolveLegacyProviderLabel(
  record: LegacyProviderRecordLike,
  fallback = MISSING_DATA_SOURCE_FIELD_LABEL,
): string {
  const candidates = [
    record.provider,
    typeof record.name === "string" ? record.name : undefined,
    typeof record.display_name === "string" ? record.display_name : undefined,
  ];
  for (const candidate of candidates) {
    const cleaned = cleanSourceToken(candidate);
    if (
      cleaned &&
      cleaned !== MISSING_DATA_SOURCE_FIELD_LABEL &&
      !ADAPTER_SYNTHETIC_LEGACY_KEY_RE.test(cleaned)
    ) {
      return cleaned;
    }
  }
  return fallback;
}

export function fmtToken(
  value?: string | null,
  fallback = MISSING_DATA_SOURCE_FIELD_LABEL,
): string {
  const cleaned = cleanSourceToken(value);
  if (!cleaned) return fallback;
  return cleaned.replace(/_/g, " ");
}

const DATA_SOURCE_REASON_KEYS = new Set([
  "empty_v2_store_legacy_projection",
  "source_ingest_registry_unavailable",
  "source_ingest_registry_empty",
  "management_data_sources_unavailable",
]);

export function translateDataSourceSurfaceReason(
  rawReason?: string | null,
  t?: TranslateFn,
): string | undefined {
  const normalized = normalizeDataSourceReasonCode(rawReason);
  if (!normalized) return undefined;
  if (DATA_SOURCE_REASON_KEYS.has(normalized) && t) {
    return t(`mgmt.dataSources.reasons.${normalized}`, {
      defaultValue: reasonCodeLabel(normalized, t),
    });
  }
  return reasonCodeLabel(normalized, t);
}

export function translateDataSourceSurfaceStatus(
  status?: string | null,
  t?: TranslateFn,
): string {
  const cleaned = cleanSourceToken(status);
  if (!cleaned) return MISSING_DATA_SOURCE_FIELD_LABEL;
  const lower = cleaned.toLowerCase();
  if ((lower === "unavailable" || lower === "degraded") && t) {
    return t(`mgmt.dataSources.surfaceStatus.${lower}`, {
      defaultValue: statusLabel(cleaned, t),
    });
  }
  return statusLabel(cleaned, t);
}

export function joinOrDash(values?: string[]): string {
  const cleaned = (values ?? [])
    .map((v) => cleanSourceToken(v))
    .filter((v): v is string => Boolean(v));
  if (cleaned.length === 0) return "—";
  return cleaned.join(" / ");
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTime(isoString?: string | null): string {
  if (!isoString) return "—";
  try {
    return isoString.slice(0, 19).replace("T", " ");
  } catch {
    return isoString;
  }
}

export function formatAgeSeconds(seconds?: number): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h ago`;
  return `${(seconds / 86400).toFixed(1)}d ago`;
}

export function lifecycleTone(state?: string): HealthTone {
  const token = String(state ?? "").toLowerCase();
  if (token === "enabled") return "ok";
  if (token === "degraded" || token === "canary_passed_disabled" || token === "validated_disabled") return "warn";
  if (token === "disabled" || token === "configured_disabled") return "muted";
  if (token === "retired") return "bad";
  return "muted";
}

export function healthStateTone(state?: string): HealthTone {
  const token = String(state ?? "").toLowerCase();
  if (token === "fresh" || token === "healthy" || token === "ok") return "ok";
  if (token === "stale" || token === "degraded" || token === "partial" || token === "warning") return "warn";
  if (token === "error" || token === "failed" || token === "down" || token === "blocked") return "bad";
  return "muted";
}

export function credentialTone(state?: string): HealthTone {
  const token = String(state ?? "").toLowerCase();
  if (token === "configured" || token === "not_required" || token === "ready") return "ok";
  if (token === "missing" || token === "unavailable" || token === "invalid") return "bad";
  if (token === "expired" || token === "stale") return "warn";
  return "muted";
}

export function validationTone(state?: string): HealthTone {
  const token = String(state ?? "").toLowerCase();
  if (token === "passed") return "ok";
  if (token === "pending" || token === "stale") return "warn";
  if (token === "failed") return "bad";
  return "muted";
}

export function canaryTone(state?: string): HealthTone {
  const token = String(state ?? "").toLowerCase();
  if (token === "passed") return "ok";
  if (token === "partial") return "warn";
  if (token === "failed") return "bad";
  return "muted";
}

export function reconciliationTone(status?: string): HealthTone {
  const token = String(status ?? "").toLowerCase();
  if (token === "converged") return "ok";
  if (token === "reconciling") return "warn";
  if (token === "diverged" || token === "failed") return "bad";
  return "muted";
}

export function receiptStatusTone(status?: string): HealthTone {
  const token = String(status ?? "").toLowerCase();
  if (token === "succeeded") return "ok";
  if (token === "accepted" || token === "running") return "warn";
  if (token === "failed" || token === "rejected") return "bad";
  return "muted";
}

export function hasDivergence(dto: ManagementDataSourceV2DTO): boolean {
  const desiredLife = cleanSourceToken(dto.desired?.desired_lifecycle)?.toLowerCase();
  const effectiveLife = cleanSourceToken(dto.observed?.effective_lifecycle)?.toLowerCase();
  if (desiredLife && effectiveLife && desiredLife !== effectiveLife) {
    return true;
  }
  const recon = cleanSourceToken(dto.observed?.reconciliation_status)?.toLowerCase();
  if (recon === "diverged" || recon === "failed") {
    return true;
  }
  const desiredRev = dto.desired?.revision;
  const observedRev = dto.observed?.desired_revision;
  if (desiredRev !== undefined && desiredRev >= 1 && observedRev !== undefined && observedRev >= 1 && desiredRev !== observedRev) {
    return true;
  }
  return false;
}

export function isV2(item: unknown): item is ManagementDataSourceV2DTO {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as ManagementDataSourceV2DTO).schema_version === "management_data_source.v2"
  );
}

export function v2ToLegacyRecord(
  v2: ManagementDataSourceV2DTO,
  fallbackLabel = MISSING_DATA_SOURCE_FIELD_LABEL,
): SystemDataSourceRecord {
  const status =
    cleanSourceToken(v2.observed?.effective_lifecycle) ||
    cleanSourceToken(v2.instance?.lifecycle_state) ||
    cleanSourceToken(v2.desired?.desired_lifecycle) ||
    fallbackLabel;
  const health = cleanSourceToken(v2.observed?.health_state) || "unknown";
  const tone: HealthTone =
    health === "error" || health === "bad"
      ? "bad"
      : health === "stale" || health === "warn" || status === "degraded"
        ? "warn"
        : status === "enabled" && health === "healthy"
          ? "ok"
          : "muted";

  let credState: SystemDataSourceRecord["credentialState"] = "unknown";
  const rawCred = cleanSourceToken(v2.observed?.credential_state)?.toLowerCase();
  if (rawCred === "configured") credState = "configured";
  else if (rawCred === "missing" || rawCred === "unavailable") credState = "missing";
  else if (rawCred === "not_required") credState = "not_required";

  const providerKey =
    cleanSourceToken(v2.connector_id) ||
    cleanSourceToken(v2.source_instance_id) ||
    fallbackLabel;
  const provider =
    cleanSourceToken(v2.provider) ||
    cleanSourceToken(v2.instance?.provider) ||
    cleanSourceToken(v2.definition?.provider) ||
    fallbackLabel;
  const sourceClass = cleanSourceToken(v2.source_class);

  return {
    providerKey,
    provider,
    markets: (v2.instance?.markets ?? [])
      .map((m) => cleanSourceToken(m))
      .filter((m): m is string => Boolean(m)),
    sourceClasses: sourceClass ? [sourceClass] : [],
    status,
    tone,
    credentialState: credState,
    readOnly: true,
    orderCapableProvider: false,
    orderSideEffectsAllowed: false,
    capitalSideEffectsAllowed: false,
    liveIngestionEnabled: status === "enabled" && v2.desired?.schedule?.enabled === true,
    consumerPersonaIds: (v2.observed?.dependent_refs ?? [])
      .map((r) => cleanSourceToken(r))
      .filter((r): r is string => Boolean(r)),
    consumerPersonaNames: (v2.observed?.dependent_refs ?? [])
      .map((r) => cleanSourceToken(r))
      .filter((r): r is string => Boolean(r)),
    evidenceRefs: cleanSourceToken(v2.observed?.last_run?.evidence_bundle_id)
      ? [cleanSourceToken(v2.observed?.last_run?.evidence_bundle_id)!]
      : [],
    unavailableRefs: [],
    lastReadbackAt:
      cleanSourceToken(v2.observed?.freshness?.last_success_at) ||
      cleanSourceToken(v2.observed?.observed_at),
    reasons: (v2.observed?.reasons ?? [])
      .map((r) => cleanSourceToken(r))
      .filter((r): r is string => Boolean(r)),
  };
}
