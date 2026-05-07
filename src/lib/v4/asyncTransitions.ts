// Pack D D05 — AsyncTransitionDescriptor + 12 v0 default transitions (Batch IV).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_StateMachine_Contract.md
//
// PROVISIONAL: timeouts + failure states match Pack D canonical defaults;
// rollback / retry orchestration owned by BFF. UI may use this registry for
// optimistic spinners + countdown UX only.

export type FailureReasonCode =
  | "TIMEOUT"
  | "VALIDATION_FAILED"
  | "PERMISSION_DENIED"
  | "BACKEND_UNAVAILABLE"
  | "EXECUTION_FAILED"
  | "ROLLBACK_FAILED"
  | "SLA_BREACH"
  | "IDEMPOTENCY_CONFLICT"
  | "UNKNOWN";

export interface AsyncTransitionDescriptor {
  entityType: string;
  from: string;
  to: string;
  trigger: string;
  timeoutMs: number;
  failureState: string;
  failureReasonCode?: FailureReasonCode;
  retryable: boolean;
  maxRetries?: number;
}

/** D05 canonical 12 transitions (handoff.respond uses SLA tier — encoded as `Infinity` sentinel). */
export const ASYNC_TRANSITION_DEFAULTS: readonly AsyncTransitionDescriptor[] = [
  { entityType: "deployment", from: "pending", to: "live_running", trigger: "deployment.execute", timeoutMs: 600_000, failureState: "failed", retryable: true, maxRetries: 2 },
  { entityType: "deployment", from: "live_running", to: "stopped", trigger: "deployment.rollback", timeoutMs: 600_000, failureState: "rollback_required", retryable: true, maxRetries: 2 },
  { entityType: "job", from: "running", to: "success", trigger: "job.run", timeoutMs: 1_800_000, failureState: "failed", retryable: true, maxRetries: 3 },
  { entityType: "skill", from: "scanning", to: "approved", trigger: "skill.security_scan", timeoutMs: 180_000, failureState: "scan_failed", retryable: true },
  { entityType: "memory", from: "queued", to: "merged", trigger: "memory.review", timeoutMs: 86_400_000, failureState: "auto_rejected", retryable: false },
  { entityType: "artifact", from: "draft", to: "released", trigger: "artifact.promote", timeoutMs: 300_000, failureState: "promote_failed", retryable: true },
  { entityType: "route_policy", from: "draft", to: "active", trigger: "route_policy.activate", timeoutMs: 120_000, failureState: "activation_failed", retryable: true },
  { entityType: "alert", from: "open", to: "acknowledged", trigger: "alert.acknowledge", timeoutMs: 30_000, failureState: "open", retryable: true },
  { entityType: "incident", from: "mitigating", to: "resolved", trigger: "incident.mitigation", timeoutMs: 900_000, failureState: "mitigation_failed", retryable: true },
  { entityType: "handoff", from: "open", to: "resolved", trigger: "handoff.respond", timeoutMs: Number.POSITIVE_INFINITY, failureState: "escalated", retryable: false },
  { entityType: "evolution", from: "running", to: "completed", trigger: "evolution.run", timeoutMs: 3_600_000, failureState: "failed", retryable: true },
  { entityType: "rebalance", from: "approved", to: "applied", trigger: "rebalance.apply", timeoutMs: 900_000, failureState: "apply_failed", retryable: true, maxRetries: 1 },
];

export function findTransition(trigger: string): AsyncTransitionDescriptor | undefined {
  return ASYNC_TRANSITION_DEFAULTS.find((t) => t.trigger === trigger);
}

export function transitionTimeoutFor(trigger: string): number | undefined {
  return findTransition(trigger)?.timeoutMs;
}
