// Q12 — v0-mock LoopStage timeout policy. UI-only; do NOT persist as domain truth.
// Replace once Pack D D05 settles state-machine timeout/failureState.

export const V5_TIMEOUT_POLICY_VERSION = "v0-mock" as const;

export interface TimeoutPolicy {
  /** Soft warning after this many ms in `running`. */
  runningWarnMs: number;
  /** Escalate after this many ms in `blocked`. */
  blockedEscalateMs: number;
  /** Emergency action review window. */
  emergencyReviewMs: number;
}

export const DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = {
  runningWarnMs: 15 * 60 * 1000,   // 15 min
  blockedEscalateMs: 60 * 60 * 1000, // 60 min
  emergencyReviewMs: 5 * 60 * 1000,  // 5 min
};
