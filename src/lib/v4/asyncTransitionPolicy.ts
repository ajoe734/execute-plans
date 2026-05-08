// Planner Response §B1 / D05 (2026-05-07) — canonical AsyncTransitionDescriptor + 15-action policy table.
// SUPERSEDES the v0-mock policy in src/lib/v5/timeoutPolicy.ts and the 12-row table in
// src/lib/v4/asyncTransitions.ts (which remains for back-compat re-export).
//
// Source of truth: .lovable/feedback/2026-05-07-planner-response/Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md §B1
//
// Backend endpoints (pending): /bff/transition-policies, /bff/transitions/{id}, ...

export type FailureReasonCode =
  | "TIMEOUT"
  | "VALIDATION_FAILED"
  | "PERMISSION_DENIED"
  | "BACKEND_UNAVAILABLE"
  | "EXECUTION_FAILED"
  | "ROLLBACK_FAILED"
  | "SLA_BREACH"
  | "IDEMPOTENCY_CONFLICT"
  | "SCAN_FAILED"
  | "APPROVAL_EXPIRED"
  | "UNKNOWN";

export type TransitionEntityType =
  | "job"
  | "deployment"
  | "handoff"
  | "evolutionRun"
  | "skillScan"
  | "rebalance"
  | "artifact"
  | "memoryReview"
  | "routePolicy"
  | "incident"
  | "approval"
  | "rollbackSaga";

export type TransitionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export interface AsyncTransitionPolicy {
  actionId: string;
  entityType: TransitionEntityType;
  timeoutMs: number;
  warnAfterMs: number;
  failureState: string;
  retryable: boolean;
  maxRetries: number;
}

export interface AsyncTransitionDescriptor {
  id: string;
  entityType: TransitionEntityType;
  entityId: string;
  actionId: string;
  from: string;
  to: string;
  trigger: string;
  startedAt: string;
  timeoutMs: number;
  warnAfterMs?: number;
  failureState: string;
  failureReasonCode?: FailureReasonCode;
  retryable: boolean;
  maxRetries?: number;
  retryOf?: string;
  correlationId: string;
  status: TransitionStatus;
}

/** Planner Response §B1 — 15 canonical actions. */
export const ASYNC_TRANSITION_POLICIES: readonly AsyncTransitionPolicy[] = [
  { actionId: "deployment.execute",     entityType: "deployment",   timeoutMs:   600_000, warnAfterMs:   300_000, failureState: "failed",              retryable: true,  maxRetries: 2 },
  { actionId: "deployment.rollback",    entityType: "deployment",   timeoutMs:   600_000, warnAfterMs:   300_000, failureState: "rollback_required",   retryable: true,  maxRetries: 2 },
  { actionId: "rollback.saga",          entityType: "rollbackSaga", timeoutMs:   900_000, warnAfterMs:   300_000, failureState: "failed",              retryable: true,  maxRetries: 1 },
  { actionId: "job.run",                entityType: "job",          timeoutMs: 1_800_000, warnAfterMs:   300_000, failureState: "failed",              retryable: true,  maxRetries: 3 },
  { actionId: "job.retry",              entityType: "job",          timeoutMs: 1_800_000, warnAfterMs:   300_000, failureState: "failed",              retryable: true,  maxRetries: 3 },
  { actionId: "handoff.respond",        entityType: "handoff",      timeoutMs: 86_400_000, warnAfterMs: 3_600_000, failureState: "escalated",          retryable: false, maxRetries: 0 },
  { actionId: "handoff.reopen",         entityType: "handoff",      timeoutMs:    30_000, warnAfterMs:    15_000, failureState: "closed",              retryable: true,  maxRetries: 1 },
  { actionId: "evolution.run",          entityType: "evolutionRun", timeoutMs: 3_600_000, warnAfterMs:   900_000, failureState: "failed",              retryable: true,  maxRetries: 1 },
  { actionId: "skill.security_scan",    entityType: "skillScan",    timeoutMs:   180_000, warnAfterMs:    60_000, failureState: "scan_failed",         retryable: true,  maxRetries: 1 },
  { actionId: "rebalance.apply",        entityType: "rebalance",    timeoutMs:   900_000, warnAfterMs:   300_000, failureState: "apply_failed",        retryable: true,  maxRetries: 1 },
  { actionId: "artifact.promote",       entityType: "artifact",     timeoutMs:   300_000, warnAfterMs:   120_000, failureState: "promote_failed",      retryable: true,  maxRetries: 1 },
  { actionId: "route_policy.activate",  entityType: "routePolicy",  timeoutMs:   120_000, warnAfterMs:    60_000, failureState: "activation_failed",   retryable: true,  maxRetries: 1 },
  { actionId: "incident.mitigation",    entityType: "incident",     timeoutMs:   900_000, warnAfterMs:   300_000, failureState: "mitigation_failed",   retryable: true,  maxRetries: 1 },
  { actionId: "memory.review",          entityType: "memoryReview", timeoutMs: 86_400_000, warnAfterMs: 3_600_000, failureState: "auto_rejected",      retryable: false, maxRetries: 0 },
  { actionId: "approval.stage",         entityType: "approval",     timeoutMs: 86_400_000, warnAfterMs: 3_600_000, failureState: "escalated",          retryable: false, maxRetries: 0 },
];

export function findAsyncTransitionPolicy(actionId: string): AsyncTransitionPolicy | undefined {
  return ASYNC_TRANSITION_POLICIES.find((p) => p.actionId === actionId);
}

export const ASYNC_TRANSITION_POLICY_SOURCE = "planner-response-2026-05-07" as const;
