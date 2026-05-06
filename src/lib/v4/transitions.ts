// v4 / Pack C §C006–C007 — Transition descriptor (failure / timeout / cancel) + admin force-transition.

export type TransitionFailureMode =
  | "rollback_to_source"
  | "stay_in_transient"
  | "move_to_failed"
  | "manual_recovery_required";

export type TransitionCancelMode =
  | "rollback_to_source"
  | "stay_in_transient"
  | "move_to_cancelled";

export interface TransitionDescriptor {
  id: string;
  entityType: string;
  from: string;
  to: string;
  transientState?: string;
  timeoutMs: number;
  onFailure: TransitionFailureMode;
  failureState?: string;
  onCancel: TransitionCancelMode;
  retryable: boolean;
}

/** Default timeouts per machine (Pack C §C006). */
export const MACHINE_DEFAULTS: Record<string, Pick<TransitionDescriptor, "timeoutMs" | "onFailure" | "failureState">> = {
  strategy_lifecycle: { timeoutMs: 300_000, onFailure: "rollback_to_source" },
  deployment: { timeoutMs: 600_000, onFailure: "manual_recovery_required", failureState: "failed" },
  quarterly_rebalance: { timeoutMs: 900_000, onFailure: "stay_in_transient", failureState: "under_review" },
  experiment: { timeoutMs: 1_800_000, onFailure: "move_to_failed", failureState: "failed" },
  evolution_run: { timeoutMs: 3_600_000, onFailure: "move_to_failed", failureState: "failed" },
  skill_sandbox: { timeoutMs: 600_000, onFailure: "move_to_failed", failureState: "sandbox_failed" },
  mcp_discovery: { timeoutMs: 300_000, onFailure: "move_to_failed", failureState: "degraded" },
  review: { timeoutMs: 300_000, onFailure: "stay_in_transient", failureState: "in_review" },
};

// ---------- C007: Admin Force Transition ----------

export type ForceTransitionReason =
  | "stuck_transient"
  | "incident_recovery"
  | "migration_fix"
  | "data_repair"
  | "emergency_override";

export interface ForceTransitionRequest {
  entityType: string;
  entityId: string;
  targetState: string;
  reasonCode: ForceTransitionReason;
  /** Min 40 chars. */
  memo: string;
  confirmTokenId: string;
  expectedVersion: number;
}

/** Entities that require risk_officer two-man approval on force-transition. */
export const FORCE_TRANSITION_TWO_MAN_ENTITIES = new Set([
  "deployment", "runtime", "capital_pool", "rebalance",
]);
