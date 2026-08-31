// @deprecated Q12 v0-mock LoopStage timeout policy.
// SUPERSEDED by @/lib/v4/asyncTransitionPolicy (Pack D D05). Kept as shim only;
// ESLint `no-restricted-imports` warns on new imports.

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

export type StageTimeoutState = "idle" | "ok" | "warn" | "escalate";

export function stageTimeoutState(
  stage: { status: string; startedAt?: string },
  policy: { runningWarnMs: number; blockedEscalateMs: number },
  now = Date.now(),
): StageTimeoutState {
  if (stage.status === "running" && stage.startedAt) {
    const age = now - new Date(stage.startedAt).getTime();
    return age >= policy.runningWarnMs ? "warn" : "ok";
  }
  if (stage.status === "blocked" && stage.startedAt) {
    const age = now - new Date(stage.startedAt).getTime();
    return age >= policy.blockedEscalateMs ? "escalate" : "warn";
  }
  return "idle";
}
