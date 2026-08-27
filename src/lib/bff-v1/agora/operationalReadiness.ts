/**
 * Read-only client for the SD-AGC-06 Agora operational-readiness projection.
 *
 * This route deliberately has no mutation helpers.  Its proof is verified at
 * the transport boundary so a response from a route with execution authority
 * cannot be rendered as readiness truth.
 */

import { detectBaseUrl } from "../client";
import { BffError, normalizeBffErrorEnvelope, type ErrorCode } from "../errors";
import { buildHeaders } from "../headers";

export type AgoraFreshness =
  | "fresh"
  | "stale"
  | "empty_fresh"
  | "unavailable"
  | "degraded"
  | "not_configured";

export type AgoraReadinessStatus =
  | "ok"
  | "degraded"
  | "unavailable"
  | "empty_fresh"
  | "stale"
  | "not_configured";

export interface AgoraOperationalReadinessSource {
  snapshot_id: string | null;
  source_instance_id: string | null;
  source_timestamp: string | null;
  age_seconds: number | null;
  sla_seconds: number;
  freshness: AgoraFreshness;
  desired_state: string | null;
  observed_state: string | null;
  last_failure: unknown | null;
}

export interface AgoraOperationalReadinessProducer {
  status: AgoraReadinessStatus;
  producer_id: string;
  active_binding: string | null;
  consumed_snapshot_id: string | null;
  last_success_at: string | null;
  enqueued: number;
  reason: string | null;
}

export interface AgoraOperationalReadinessSurface {
  status: AgoraReadinessStatus;
  count: number;
  reason: string | null;
  freshness: string | null;
  cursor: string | null;
}

export interface AgoraOperationalReadinessDeployment {
  service: string;
  environment: string | null;
  source_commit_sha: string | null;
  bundle_version: string | null;
}

export interface AgoraOperationalReadiness {
  status: AgoraReadinessStatus;
  source: AgoraOperationalReadinessSource;
  signal_producer: AgoraOperationalReadinessProducer;
  surfaces: Record<string, AgoraOperationalReadinessSurface>;
  deployment: AgoraOperationalReadinessDeployment | null;
  snapshot_at: string;
  capability: "agora.operational_readiness.v1";
}

const FRESHNESS_VALUES = new Set<AgoraFreshness>([
  "fresh",
  "stale",
  "empty_fresh",
  "unavailable",
  "degraded",
  "not_configured",
]);

const READINESS_VALUES = new Set<AgoraReadinessStatus>([
  "ok",
  "degraded",
  "unavailable",
  "empty_fresh",
  "stale",
  "not_configured",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function finiteNumber(value: unknown, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function errorCodeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "VALIDATION_FAILED";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "RESOURCE_NOT_FOUND";
  if (status === 409 || status === 412) return "STATE_CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "BACKEND_UNAVAILABLE";
  return "UNKNOWN_ERROR";
}

function typedError(status: number, message: string): BffError {
  const envelope = normalizeBffErrorEnvelope({
    error: { code: errorCodeForStatus(status), message },
  }, status);
  if (!envelope) throw new Error(message);
  return new BffError(status, envelope);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw typedError(502, `Operational readiness omitted ${label}.`);
  return record;
}

function requiredStatus(value: unknown, label: string): AgoraReadinessStatus {
  if (typeof value === "string" && READINESS_VALUES.has(value as AgoraReadinessStatus)) {
    return value as AgoraReadinessStatus;
  }
  throw typedError(502, `Operational readiness returned an invalid ${label} status.`);
}

function requiredFreshness(value: unknown): AgoraFreshness {
  if (typeof value === "string" && FRESHNESS_VALUES.has(value as AgoraFreshness)) {
    return value as AgoraFreshness;
  }
  throw typedError(502, "Operational readiness returned an invalid source freshness value.");
}

function requiredString(value: unknown, label: string): string {
  const normalized = nullableString(value);
  if (normalized) return normalized;
  throw typedError(502, `Operational readiness omitted ${label}.`);
}

function normalizeSurface(value: unknown, name: string): AgoraOperationalReadinessSurface {
  const source = requiredRecord(value, `surface ${name}`);
  return {
    status: requiredStatus(source.status, `surface ${name}`),
    count: finiteNumber(source.count, 0) ?? 0,
    reason: nullableString(source.reason),
    freshness: nullableString(source.freshness),
    cursor: nullableString(source.cursor),
  };
}

function normalizeReadiness(payload: unknown): AgoraOperationalReadiness {
  const root = requiredRecord(payload, "response envelope");
  const data = requiredRecord(root.data, "data");
  const meta = requiredRecord(root.meta, "meta");
  if (meta.requiredForAuthentication !== false) {
    throw typedError(502, "Operational readiness must remain outside the authentication-critical path.");
  }
  if (meta.no_order_route_proof !== "agora_operational_readiness_read_only") {
    throw typedError(502, "Operational readiness did not prove its read-only boundary.");
  }
  if (meta.capability !== "agora.operational_readiness.v1") {
    throw typedError(502, "Operational readiness returned an unexpected capability.");
  }

  const source = requiredRecord(data.source, "source");
  const producer = requiredRecord(data.signal_producer, "signal producer");
  const rawSurfaces = requiredRecord(data.surfaces, "downstream surfaces");
  const surfaces = Object.fromEntries(
    Object.entries(rawSurfaces).map(([name, surface]) => [name, normalizeSurface(surface, name)]),
  );
  const deployment = asRecord(data.deployment);

  return {
    status: requiredStatus(data.status, "overall"),
    source: {
      snapshot_id: nullableString(source.snapshot_id),
      source_instance_id: nullableString(source.source_instance_id),
      source_timestamp: nullableString(source.source_timestamp),
      age_seconds: finiteNumber(source.age_seconds),
      sla_seconds: finiteNumber(source.sla_seconds, 86400) ?? 86400,
      freshness: requiredFreshness(source.freshness),
      desired_state: nullableString(source.desired_state),
      observed_state: nullableString(source.observed_state),
      last_failure: source.last_failure ?? null,
    },
    signal_producer: {
      status: requiredStatus(producer.status, "signal producer"),
      producer_id: requiredString(producer.producer_id, "signal producer identity"),
      active_binding: nullableString(producer.active_binding),
      consumed_snapshot_id: nullableString(producer.consumed_snapshot_id),
      last_success_at: nullableString(producer.last_success_at),
      enqueued: finiteNumber(producer.enqueued, 0) ?? 0,
      reason: nullableString(producer.reason),
    },
    surfaces,
    deployment: deployment
      ? {
          service: requiredString(deployment.service, "deployment service"),
          environment: nullableString(deployment.environment),
          source_commit_sha: nullableString(deployment.source_commit_sha),
          bundle_version: nullableString(deployment.bundle_version),
        }
      : null,
    snapshot_at: requiredString(meta.snapshot_at, "snapshot time"),
    capability: "agora.operational_readiness.v1",
  };
}

/**
 * Fetch live operational readiness.  This is intentionally a strict GET: it
 * never falls back to seeded readiness and does not expose a mutation method.
 */
export async function getAgoraOperationalReadiness(
  baseUrl = detectBaseUrl(),
): Promise<AgoraOperationalReadiness> {
  const base = baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/bff/agora/operational-readiness`, {
    method: "GET",
    credentials: "include",
    headers: buildHeaders({ method: "GET" }),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const normalized = normalizeBffErrorEnvelope(payload, response.status);
    if (normalized) throw new BffError(response.status, normalized);
    throw typedError(response.status, `Operational readiness request failed (${response.status}).`);
  }
  return normalizeReadiness(payload);
}
