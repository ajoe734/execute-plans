// Pack E — v5 view-model enums (Q2: view-model only, NOT domain DTO replacements).
// Domain state must still map to v4 normative types (StrategyReviewStatus, etc.).

export type LoopKind = "research" | "execution" | "optimization";

/** G07 — symmetric per-loop focus enum (was missing per-kind narrowing). */
export type ResearchLoopFocus = "ideation" | "backtest" | "review" | "publish";
export type ExecutionLoopFocus = "schedule" | "place" | "monitor" | "settle";
export type OptimizationLoopFocus = "score" | "rebalance" | "deploy" | "audit";

export type LoopFocus<K extends LoopKind = LoopKind> =
  K extends "research" ? ResearchLoopFocus :
  K extends "execution" ? ExecutionLoopFocus :
  K extends "optimization" ? OptimizationLoopFocus :
  never;

export const LOOP_FOCUS_BY_KIND: {
  research: readonly ResearchLoopFocus[];
  execution: readonly ExecutionLoopFocus[];
  optimization: readonly OptimizationLoopFocus[];
} = {
  research: ["ideation", "backtest", "review", "publish"],
  execution: ["schedule", "place", "monitor", "settle"],
  optimization: ["score", "rebalance", "deploy", "audit"],
} as const;

export type LoopStatus =
  | "idle"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled";

export type LoopStageStatus =
  | "pending"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "skipped";

export type HealthStatus = "healthy" | "watch" | "degraded" | "critical";

/** Q4: PersonaExecutionHealth.mode canonical (paused removed). */
export type AutonomyMode = "live" | "paper" | "shadow" | "suspended";

/** Q6: Canonical RemediationAction.mode (automationLevel deprecated). */
export type RemediationMode = "advisory" | "guarded_automation" | "emergency_override";

export type InterventionSeverity = "info" | "watch" | "warning" | "critical";

/** Q5: SD-canonical SentinelFinding.status (SA accepted→acknowledged, executing→mitigating). */
export type SentinelFindingStatus =
  | "open"
  | "acknowledged"
  | "action_pending"
  | "mitigating"
  | "resolved"
  | "dismissed";

export type SentinelSeverity = "info" | "watch" | "warning" | "critical";

export type InterventionSource =
  | "approval"
  | "sentinel"
  | "incident"
  | "policy_exception"
  | "emergency_review";

export type InterventionDecision =
  | "approve"
  | "reject"
  | "request_changes"
  | "escalate"
  | "defer";
