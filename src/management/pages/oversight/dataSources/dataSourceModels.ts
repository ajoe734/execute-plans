// Data source models, typeguards, badges, tone mappings and formatters (SD-SRCM-04).

import type {
  ConnectorDefinition,
  DataSourceInstance,
  ManagementDataSourceV2DTO,
  SourceAllowedActions,
  SourceCanaryResult,
  SourceCommandReceipt,
  SourceDesiredState,
  SourceObservedState,
} from "@/lib/bff-v1/managementDataSources";
import type { SystemDataSourceRecord } from "@/lib/v5/management/systemDataSources";

export type {
  ConnectorDefinition,
  DataSourceInstance,
  ManagementDataSourceV2DTO,
  SourceAllowedActions,
  SourceCanaryResult,
  SourceCommandReceipt,
  SourceDesiredState,
  SourceObservedState,
};

export type ControlCenterTab = "instances" | "catalog" | "runs" | "receipts";

export type HealthTone = "ok" | "warn" | "bad" | "muted";

export const toneClass: Record<HealthTone, string> = {
  ok: "bg-status-success/10 text-status-success border-status-success/30",
  warn: "bg-status-warning/15 text-status-warning border-status-warning/30",
  bad: "bg-status-failed/10 text-status-failed border-status-failed/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function fmtToken(value?: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

export function joinOrDash(values?: string[]): string {
  if (!values || values.length === 0) return "—";
  return values.join(" / ");
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
  const desiredLife = dto.desired?.desired_lifecycle?.toLowerCase();
  const effectiveLife = dto.observed?.effective_lifecycle?.toLowerCase();
  if (desiredLife && effectiveLife && desiredLife !== effectiveLife) {
    return true;
  }
  const recon = dto.observed?.reconciliation_status?.toLowerCase();
  if (recon === "diverged" || recon === "failed") {
    return true;
  }
  const desiredRev = dto.desired?.revision;
  const observedRev = dto.observed?.desired_revision;
  if (desiredRev !== undefined && observedRev !== undefined && desiredRev !== observedRev) {
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

export function v2ToLegacyRecord(v2: ManagementDataSourceV2DTO): SystemDataSourceRecord {
  const status = v2.observed?.effective_lifecycle || v2.instance?.lifecycle_state || "configured_disabled";
  const health = v2.observed?.health_state || "healthy";
  const tone: HealthTone = health === "error" ? "bad" : health === "stale" || status === "degraded" ? "warn" : status === "enabled" ? "ok" : "muted";

  let credState: SystemDataSourceRecord["credentialState"] = "unknown";
  const rawCred = v2.observed?.credential_state?.toLowerCase();
  if (rawCred === "configured") credState = "configured";
  else if (rawCred === "missing" || rawCred === "unavailable") credState = "missing";
  else if (rawCred === "not_required") credState = "not_required";

  return {
    providerKey: v2.connector_id || v2.source_instance_id,
    provider: v2.provider || v2.definition?.provider || v2.source_instance_id,
    markets: v2.instance?.markets ?? [],
    sourceClasses: v2.source_class ? [v2.source_class] : [],
    status,
    tone,
    credentialState: credState,
    readOnly: true,
    orderCapableProvider: false,
    orderSideEffectsAllowed: false,
    capitalSideEffectsAllowed: false,
    liveIngestionEnabled: status === "enabled" && v2.desired?.schedule?.enabled === true,
    consumerPersonaIds: v2.observed?.dependent_refs ?? [],
    consumerPersonaNames: v2.observed?.dependent_refs ?? [],
    evidenceRefs: v2.observed?.last_run?.evidence_bundle_id ? [v2.observed.last_run.evidence_bundle_id] : [],
    unavailableRefs: [],
    lastReadbackAt: v2.observed?.freshness?.last_success_at || v2.observed?.observed_at,
    reasons: v2.observed?.reasons ?? [],
  };
}
