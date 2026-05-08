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
// A3 (Planner Response §A3, 2026-05-07) — EvidenceKind union of:
//   - Pack D-B Permission Contract (planner 15 kinds)
//   - v5 Closed-Loop OS evidence (4 kinds)
// FE feedback I1: planner Permission Contract should adopt this union next revision.

export type EvidenceKind =
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
  // v5 closed-loop additions
  | "loop_run"
  | "sentinel_finding"
  | "intervention"
  | "ask_session"
  // legacy kept for back-compat (used elsewhere in codebase)
  | "snapshot"
  | "rebalance"
  | "experiment";

/** A3 — capability gate per evidence kind (planner §A3 + v5 + legacy). */
export const EVIDENCE_CAPABILITY_MAP: Readonly<Record<EvidenceKind, string>> = {
  // Pack D-B planner 15
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
  // v5 closed-loop
  loop_run: "loop.read",
  sentinel_finding: "sentinel.read",
  intervention: "intervention.read",
  ask_session: "agora.ask",
  // legacy
  snapshot: "artifact.read",
  rebalance: "rebalance.read",
  experiment: "research.read",
};

export interface RedactedEvidenceRef {
  kind: EvidenceKind;
  id: string;
  redacted: true;
  /** Detailed FE-facing reason (kept as union for richer UI). */
  reason: "PERMISSION_DENIED" | "CAPABILITY_MISSING" | "TENANT_SCOPE_MISMATCH";
  /** Planner §A3 alias — single canonical reason name for backend handoff. */
  redactionReasonCode?: "INSUFFICIENT_CAPABILITY";
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
