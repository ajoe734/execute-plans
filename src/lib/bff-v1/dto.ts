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

/** v1 ErrorCode union — superset of v4 (adds APPROVAL_REQUIRED, RESOURCE_NOT_FOUND,
 *  CONFIRM_TOKEN_REVOKED). H-backlog: align v4 errorCodes.ts with this list. */
export type ErrorCode =
  | V4ErrorCode
  | "APPROVAL_REQUIRED"
  | "CONFIRM_TOKEN_REVOKED"
  | "RESOURCE_NOT_FOUND";

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

// ---------- Section: Action command ----------

/** H-backlog: name this `ActionCommandStatus` in OpenAPI. */
export type ActionCommandStatus = "accepted" | "queued" | "completed";

export interface ActionCommandResponseData {
  actionId: string;
  status: ActionCommandStatus;
  /** Present iff status='accepted' AND requires human approval gate. */
  approvalId?: string;
  /** Present iff status='queued'. */
  jobId?: string;
}

// ---------- Section 9: Capability / Redaction ----------

export type EvidenceKind =
  | "audit"
  | "snapshot"
  | "incident"
  | "rebalance"
  | "deployment"
  | "experiment"
  | "postmortem"
  | "loop_run"
  | "sentinel_finding"
  | "intervention"
  | "ask_session";

/** Section 9 — capability gate per evidence kind. */
export const EVIDENCE_CAPABILITY_MAP: Readonly<Record<EvidenceKind, string>> = {
  audit: "audit.read",
  snapshot: "artifact.read",
  incident: "risk.incident.read",
  rebalance: "rebalance.read",
  deployment: "deployment.read",
  experiment: "research.read",
  postmortem: "postmortem.read",
  loop_run: "loop.read",
  sentinel_finding: "sentinel.read",
  intervention: "intervention.read",
  ask_session: "agora.ask",
};

export interface RedactedEvidenceRef {
  kind: EvidenceKind;
  id: string;
  redacted: true;
  reason: "PERMISSION_DENIED" | "CAPABILITY_MISSING" | "TENANT_SCOPE_MISMATCH";
  capabilityRequired: string;
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
