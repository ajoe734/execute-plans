// BFF Contract v1 — DTO definitions
// Source of truth: .lovable/feedback/2026-05-07-final/Pantheon_BFF_DTO_Catalog.md
// FROZEN 2026-05-07. Do NOT edit shapes without spec change.

import type { ErrorCode as V4ErrorCode } from "../v4/errorCodes";

// ---------- Section 2: Envelopes ----------

export interface ListEnvelope<T> {
  items: T[];
  cursor: { next?: string; prev?: string };
  pageSize: number;
  estimatedTotal?: number;
  totalCountExact: boolean;
  meta?: unknown;
}

/** C.2 / Section 2.2 — `data` is REQUIRED. Use CommandResponse<null> when no payload. */
export interface CommandResponse<T> {
  ok: true;
  data: T;
  auditEventId?: string;
  correlationId: string;
  idempotencyKey?: string;
  replayed?: boolean;
  lockVersion?: number;
  message?: string;
}

export interface BulkActionResponse<T> {
  ok: boolean;
  partial: boolean;
  summary: { requested: number; succeeded: number; failed: number };
  results: Array<{ id: string; ok: boolean; data?: T; error?: BffErrorPayload }>;
}

// ---------- Section 3: Errors (re-exported from errors.ts for convenience) ----------

/** v1 ErrorCode union — now identical to v4 ERROR_CODES superset (H2 closed). */
export type ErrorCode = V4ErrorCode;

export interface ErrorDetails {
  field?: string;
  reason?: string;
  requires_confirm_token?: boolean;
  requires_approval?: boolean;
  requires_two_man?: boolean;
  approvalId?: string;
  jobId?: string;
  retryAfterMs?: number;
  [k: string]: unknown;
}

export interface BffErrorPayload {
  code: ErrorCode;
  i18nKey: string;
  message: string;
  retryable: boolean;
  userActionable: boolean;
  correlationId: string;
  cause?: string;
  details?: ErrorDetails;
}

export interface BffErrorEnvelope {
  error: BffErrorPayload;
}

// ---------- Section: Action command (A1 — named ActionCommandStatus) ----------

/** Planner Response §A1 (2026-05-07) — canonical named enum.
 * OpenAPI: components.schemas.ActionCommandStatus. */
export const ACTION_COMMAND_STATUSES = ["accepted", "queued", "completed"] as const;
export type ActionCommandStatus = (typeof ACTION_COMMAND_STATUSES)[number];

export function isActionCommandStatus(v: unknown): v is ActionCommandStatus {
  return typeof v === "string" && (ACTION_COMMAND_STATUSES as readonly string[]).includes(v);
}

export interface ActionCommandResponseData {
  actionId: string;
  status: ActionCommandStatus;
  /** Present iff status='accepted' AND requires human approval gate. */
  approvalId?: string;
  /** Present iff status='queued'. */
  jobId?: string;
}

// ---------- Section 9: Capability / Redaction ----------
// Planner Stage 2 Audit (2026-05-08) §1 — three-layer EvidenceKind:
//   - CanonicalEvidenceKind (19): backend BFF v1 SHOULD emit only these.
//   - LegacyEvidenceKindAlias (3): snapshot / rebalance / experiment — FE accepts
//     for legacy seed / v0-mock / old audit entries; backend should NOT emit.
//   - EvidenceKind = union of the two (22 accepted at FE).

export type CanonicalEvidenceKind =
  // Pack D-B planner canonical 15
  | "alert"
  | "incident"
  | "job"
  | "audit"
  | "metric"
  | "strategy"
  | "persona"
  | "deployment"
  | "runtime"
  | "policy"
  | "approval"
  | "artifact"
  | "signal"
  | "journal"
  | "postmortem"
  // v5 closed-loop additions (4) — accepted into canonical per planner §1.2
  | "loop_run"
  | "sentinel_finding"
  | "intervention"
  | "ask_session";

export type LegacyEvidenceKindAlias = "snapshot" | "rebalance" | "experiment";

export type EvidenceKind = CanonicalEvidenceKind | LegacyEvidenceKindAlias;

export const CANONICAL_EVIDENCE_KINDS: readonly CanonicalEvidenceKind[] = [
  "alert", "incident", "job", "audit", "metric", "strategy", "persona",
  "deployment", "runtime", "policy", "approval", "artifact", "signal",
  "journal", "postmortem",
  "loop_run", "sentinel_finding", "intervention", "ask_session",
] as const;

export const LEGACY_EVIDENCE_KIND_ALIASES: readonly LegacyEvidenceKindAlias[] = [
  "snapshot", "rebalance", "experiment",
] as const;

export function isLegacyEvidenceKind(kind: EvidenceKind): kind is LegacyEvidenceKindAlias {
  return (LEGACY_EVIDENCE_KIND_ALIASES as readonly string[]).includes(kind);
}

export function isCanonicalEvidenceKind(kind: EvidenceKind): kind is CanonicalEvidenceKind {
  return (CANONICAL_EVIDENCE_KINDS as readonly string[]).includes(kind);
}

/** Planner §1.5 — capability gate per evidence kind (canonical 19 + 3 legacy aliases). */
export const EVIDENCE_CAPABILITY_MAP: Readonly<Record<EvidenceKind, string>> = {
  // canonical 19
  alert: "risk.alert.read",
  incident: "risk.incident.read",
  job: "job.read",
  audit: "audit.read",
  metric: "metric.read",
  strategy: "strategy.view",
  persona: "persona.view",
  deployment: "deployment.read",
  runtime: "runtime.read",
  policy: "policy.read",
  approval: "approval.read",
  artifact: "artifact.read",
  signal: "agora.signal.read",
  journal: "agora.journal.read",
  postmortem: "postmortem.read",
  loop_run: "loop.read",
  sentinel_finding: "sentinel.read",
  intervention: "intervention.read",
  ask_session: "agora.ask",
  // legacy aliases (FE-only acceptance)
  snapshot: "artifact.read",       // legacy alias — backend should emit `artifact`
  rebalance: "rebalance.read",     // legacy alias
  experiment: "research.read",     // legacy alias
};

/** Planner Stage 2 Audit §2.3 — backend canonical reason codes. */
export type RedactionReasonCode =
  | "INSUFFICIENT_CAPABILITY"
  | "TENANT_SCOPE_MISMATCH"
  | "POLICY_REDACTED";

/** Planner Stage 2 Audit §2.3 — backend-facing canonical RedactedEvidenceRef. */
export interface CanonicalRedactedEvidenceRef {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: RedactionReasonCode;
  requiredCapability?: string;
}

/** FE-facing RedactedEvidenceRef.
 *  `redactionReasonCode` + `requiredCapability` are backend canonical (planner §2.3).
 *  `reason` + `capabilityRequired` are FE legacy aliases for richer UI text and
 *  backward compatibility; normalize via `normalizeRedactedEvidenceRef()`.
 */
export interface RedactedEvidenceRef {
  kind: EvidenceKind;
  id: string;
  redacted: true;
  /** FE legacy alias — see normalizer mapping in §2.4. */
  reason?: "PERMISSION_DENIED" | "CAPABILITY_MISSING" | "TENANT_SCOPE_MISMATCH";
  /** Backend canonical reason code. */
  redactionReasonCode?: RedactionReasonCode;
  /** FE legacy alias for `requiredCapability`. */
  capabilityRequired?: string;
  /** Backend canonical capability requirement. */
  requiredCapability?: string;
}

/** Planner Stage 2 Audit §2.5 — normalize FE alias fields to backend canonical. */
export function normalizeRedactedEvidenceRef(input: RedactedEvidenceRef): CanonicalRedactedEvidenceRef {
  const code: RedactionReasonCode =
    input.redactionReasonCode ??
    (input.reason === "TENANT_SCOPE_MISMATCH"
      ? "TENANT_SCOPE_MISMATCH"
      : "INSUFFICIENT_CAPABILITY");
  return {
    id: input.id,
    kind: input.kind,
    redacted: true,
    redactionReasonCode: code,
    requiredCapability: input.requiredCapability ?? input.capabilityRequired,
  };
}

// ---------- Section 5: Status enums (canonical) ----------

export type StrategyStatus =
  | "draft" | "sandbox" | "active" | "probation" | "restricted" | "suspended" | "retired" | "archived";

export type CapitalPoolStatus =
  | "draft" | "active" | "frozen" | "rebalancing" | "restricted" | "retired";

export type PersonaStatus =
  | "draft" | "testing" | "approved" | "active" | "deprecated" | "retired";

export type RebalanceStatus =
  | "draft" | "metrics_freezing" | "metrics_frozen" | "ranking_calculated"
  | "simulation_ready" | "under_review" | "approved" | "scheduled"
  | "applied" | "rolled_back" | "cancelled";

export type DeploymentStatus =
  | "draft" | "submitted" | "under_review" | "approved" | "scheduled"
  | "deploying" | "deployed" | "failed" | "rolled_back" | "cancelled";

export type EvolutionProgramStatus =
  | "draft" | "active" | "paused" | "under_review" | "completed" | "retired";

export type JobStatus = "queued" | "running" | "review" | "concluded" | "failed";

export type IncidentStatus = "open" | "mitigating" | "resolved";

export type ApprovalStatus =
  | "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying";

// ---------- Section 7: v5 Closed-Loop ----------

export type LoopStageStatus =
  | "pending" | "running" | "succeeded" | "failed" | "skipped" | "blocked";

export type LoopStatus =
  | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "awaiting_intervention";

export type SentinelHealth = "healthy" | "watch" | "degraded" | "critical";

export type InterventionStatus =
  | "open" | "acknowledged" | "action_pending" | "mitigating" | "resolved" | "dismissed";

export type InterventionSource =
  | "approval" | "sentinel" | "incident" | "policy_exception" | "emergency_review";
