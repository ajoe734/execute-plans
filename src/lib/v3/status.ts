// v3 §4 Canonical Status / State Machines.
// Resolves G01 / G14 / G15 / G78.
// Source: .lovable/spec/v3/Pantheon_Frontend_Build_Spec_FULL_v3_en-US.md §4.

// ---------- Strategy (3 separate fields) ----------

export type StrategyLifecycleStatus =
  | "discovered"
  | "scaffolded"
  | "replicated"
  | "approved"
  | "paper"
  | "live"
  | "degraded"
  | "retired";

export const STRATEGY_LIFECYCLE: readonly StrategyLifecycleStatus[] = [
  "discovered", "scaffolded", "replicated", "approved",
  "paper", "live", "degraded", "retired",
] as const;

export type StrategyReviewStatus =
  | "none"
  | "draft"
  | "submitted"
  | "validator_running"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "cancelled";

export type StrategyDeploymentStatus =
  | "not_deployed"
  | "scheduled"
  | "deploying"
  | "running"
  | "paused"
  | "rolling_back"
  | "failed"
  | "stopped";

/** Strategy lifecycle transition table (v3 §4). */
export interface StrategyLifecycleTransition {
  from: StrategyLifecycleStatus;
  to: StrategyLifecycleStatus;
  action: string;
  allowedRoles: readonly string[];
  requiresApproval: boolean;
  requiresConfirmToken: boolean;
  requiredEvidence: readonly string[];
  auditEvent: string;
}

export const STRATEGY_LIFECYCLE_TRANSITIONS: readonly StrategyLifecycleTransition[] = [
  { from: "discovered", to: "scaffolded", action: "strategy.scaffold",
    allowedRoles: ["admin", "research_lead", "strategy_manager"],
    requiresApproval: false, requiresConfirmToken: false,
    requiredEvidence: ["thesis", "source", "ownerPersonaId"],
    auditEvent: "strategy.scaffolded" },
  { from: "scaffolded", to: "replicated", action: "strategy.mark_replicated",
    allowedRoles: ["admin", "research_lead", "strategy_manager"],
    requiresApproval: false, requiresConfirmToken: false,
    requiredEvidence: ["completedBacktest", "completedOOS", "reproducibilityHash"],
    auditEvent: "strategy.replicated" },
  { from: "replicated", to: "approved", action: "strategy.approve_review",
    allowedRoles: ["admin", "reviewer", "risk_officer"],
    requiresApproval: true, requiresConfirmToken: false,
    requiredEvidence: ["reviewDecisionId", "validatorResults"],
    auditEvent: "strategy.approved" },
  { from: "approved", to: "paper", action: "strategy.promote_paper",
    allowedRoles: ["admin", "research_lead", "risk_officer"],
    requiresApproval: true, requiresConfirmToken: true,
    requiredEvidence: ["artifactId", "capitalPoolId", "riskBudgetId", "paperRuntimeId"],
    auditEvent: "strategy.paper_promoted" },
  { from: "paper", to: "live", action: "strategy.deploy_live",
    allowedRoles: ["admin", "risk_officer", "system_operator"],
    requiresApproval: true, requiresConfirmToken: true,
    requiredEvidence: ["artifactId", "liveRuntimeId", "brokerBindingId", "rollbackArtifactId"],
    auditEvent: "strategy.live_deployed" },
  { from: "live", to: "degraded", action: "strategy.mark_degraded",
    allowedRoles: ["admin", "risk_officer", "system_operator"],
    requiresApproval: false, requiresConfirmToken: false,
    requiredEvidence: ["alertId|incidentId"],
    auditEvent: "strategy.degraded" },
  { from: "live", to: "retired", action: "strategy.retire_live",
    allowedRoles: ["admin", "risk_officer"],
    requiresApproval: true, requiresConfirmToken: true,
    requiredEvidence: ["postmortemRequired", "retirementReason"],
    auditEvent: "strategy.retired" },
  { from: "degraded", to: "live", action: "strategy.restore_live",
    allowedRoles: ["admin", "risk_officer", "system_operator"],
    requiresApproval: true, requiresConfirmToken: true,
    requiredEvidence: ["mitigationId", "riskOfficerMemo"],
    auditEvent: "strategy.restored_live" },
  { from: "degraded", to: "retired", action: "strategy.retire_degraded",
    allowedRoles: ["admin", "risk_officer"],
    requiresApproval: true, requiresConfirmToken: true,
    requiredEvidence: ["incidentId", "retirementReason"],
    auditEvent: "strategy.retired" },
  { from: "paper", to: "retired", action: "strategy.retire_paper",
    allowedRoles: ["admin", "research_lead", "risk_officer"],
    requiresApproval: true, requiresConfirmToken: true,
    requiredEvidence: ["retirementReason"],
    auditEvent: "strategy.retired" },
] as const;

// ---------- Persona ----------

export type PersonaStatus =
  | "draft" | "sandbox" | "active" | "probation"
  | "restricted" | "suspended" | "retired" | "archived";

export const PERSONA_STATUSES: readonly PersonaStatus[] = [
  "draft", "sandbox", "active", "probation",
  "restricted", "suspended", "retired", "archived",
] as const;

// ---------- Capital Pool ----------

export type CapitalPoolStatus =
  | "draft" | "active" | "frozen" | "rebalancing" | "restricted" | "retired";

export const CAPITAL_POOL_STATUSES: readonly CapitalPoolStatus[] = [
  "draft", "active", "frozen", "rebalancing", "restricted", "retired",
] as const;

// ---------- Other canonical status enums (v3 §4 table) ----------

export const RANKING_FORMULA_STATUSES = [
  "draft", "testing", "approved", "active", "deprecated", "retired",
] as const;
export type RankingFormulaStatus = typeof RANKING_FORMULA_STATUSES[number];

export const QUARTERLY_REBALANCE_STATUSES = [
  "draft", "metrics_freezing", "metrics_frozen", "ranking_calculated",
  "simulation_ready", "under_review", "approved", "scheduled",
  "applied", "rolled_back", "cancelled",
] as const;
export type QuarterlyRebalanceStatus = typeof QUARTERLY_REBALANCE_STATUSES[number];

export const EVOLUTION_PROGRAM_STATUSES = [
  "draft", "active", "paused", "under_review", "completed", "retired",
] as const;
export type EvolutionProgramStatus = typeof EVOLUTION_PROGRAM_STATUSES[number];

export const EXPERIMENT_STATUSES = [
  "draft", "queued", "running", "completed", "failed",
  "invalidated", "attached_to_review", "archived",
] as const;
export type ExperimentStatus = typeof EXPERIMENT_STATUSES[number];

export const REVIEW_REQUEST_STATUSES = [
  "draft", "submitted", "validator_running", "in_review",
  "changes_requested", "approved", "rejected", "cancelled",
] as const;
export type ReviewRequestStatus = typeof REVIEW_REQUEST_STATUSES[number];

export const DEPLOYMENT_STATUSES = [
  "draft", "submitted", "approved", "scheduled", "deploying",
  "deployed", "failed", "rolling_back", "rolled_back", "retired",
] as const;
export type DeploymentStatus = typeof DEPLOYMENT_STATUSES[number];

export const TOOL_STATUSES = [
  "draft", "testing", "active", "restricted", "deprecated", "blocked", "retired",
] as const;
export type ToolStatus = typeof TOOL_STATUSES[number];

export const MCP_SERVER_STATUSES = [
  "draft", "connected", "healthy", "degraded", "disabled", "retired",
] as const;
export type McpServerStatus = typeof MCP_SERVER_STATUSES[number];

/** Skill: alias `deprecating` REMOVED — use `deprecated`. */
export const SKILL_STATUSES = [
  "draft", "sandboxed", "validated", "approved", "active", "deprecated", "blocked", "retired",
] as const;
export type SkillStatus = typeof SKILL_STATUSES[number];

/** MemoryItem: alias `isolated` REMOVED — use `quarantined`. */
export const MEMORY_ITEM_STATUSES = [
  "proposed", "approved", "rejected", "edited", "merged",
  "quarantined", "sensitive", "deleted",
] as const;
export type MemoryItemStatus = typeof MEMORY_ITEM_STATUSES[number];

export const INSIGHT_STATUSES = [
  "raw", "triaged", "classified", "linked",
  "converted_to_strategy", "converted_to_research_task",
  "converted_to_training_example", "dismissed", "archived",
] as const;
export type InsightStatus = typeof INSIGHT_STATUSES[number];

export const JOB_STATUSES = [
  "queued", "running", "waiting_for_approval",
  "completed", "failed", "cancelled", "retrying",
] as const;
export type JobStatus = typeof JOB_STATUSES[number];

/** Legacy alias remap (for migration only). */
export const STATUS_ALIASES: Record<string, string> = {
  isolated: "quarantined",
  deprecating: "deprecated",
};
export function normalizeStatus(s: string): string {
  return STATUS_ALIASES[s] ?? s;
}
