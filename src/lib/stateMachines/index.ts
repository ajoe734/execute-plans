// 18 entity state machines — Part 7 §17.1–17.18.
// Sourced verbatim from .lovable/spec/FULL_zh-TW.md lines 12370–12974.

import type { StateMachine, Transition } from "./types";

// ---- 17.1 Strategy ----
export type StrategyState =
  | "discovered" | "scaffolded" | "replicated" | "approved"
  | "paper" | "live" | "degraded" | "replaced" | "retired" | "archived";

export const strategyMachine: StateMachine<StrategyState> = {
  name: "strategy",
  states: ["discovered", "scaffolded", "replicated", "approved", "paper", "live", "retired", "archived"],
  branchStates: ["degraded", "replaced"],
  transitions: [
    { from: "discovered", to: "scaffolded", action: "scaffold_spec", uiPattern: "standard_action" },
    { from: "scaffolded", to: "replicated", action: "run_replication", uiPattern: "create_job" },
    { from: "replicated", to: "approved", action: "submit_review", requiresApproval: true, uiPattern: "review_workflow" },
    { from: "approved", to: "paper", action: "promote_paper", requiresApproval: true, risk: "medium", uiPattern: "confirmation_with_job" },
    { from: "paper", to: "live", action: "promote_live", requiresApproval: true, risk: "critical", uiPattern: "high_risk_modal" },
    { from: "live", to: "degraded", action: "mark_degraded", requiresApproval: true, risk: "high", uiPattern: "risk_workflow" },
    { from: "live", to: "replaced", action: "replace_strategy", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "live", to: "retired", action: "retire_live", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "live", to: "paper", action: "rollback_to_paper", requiresApproval: true, risk: "high", uiPattern: "rollback_modal" },
    { from: "any" as StrategyState, to: "archived", action: "archive", requiresApproval: true, risk: "critical", uiPattern: "destructive_modal" },
  ],
};

// ---- 17.2 Persona ----
export type PersonaState =
  | "draft" | "sandbox" | "active" | "probation" | "restricted" | "suspended" | "retired" | "archived";

export const personaMachine: StateMachine<PersonaState> = {
  name: "persona",
  states: ["draft", "sandbox", "active", "retired", "archived"],
  branchStates: ["probation", "restricted", "suspended"],
  transitions: [
    { from: "draft", to: "sandbox", action: "create_sandbox" },
    { from: "sandbox", to: "active", action: "activate_persona", requiresApproval: true, risk: "medium" },
    { from: "active", to: "probation", action: "put_on_probation", requiresApproval: true, risk: "medium" },
    { from: "active", to: "restricted", action: "restrict_persona", requiresApproval: true, risk: "high" },
    { from: "active", to: "suspended", action: "suspend_persona", requiresApproval: true, risk: "high" },
    { from: "probation", to: "active", action: "restore_active", requiresApproval: true },
    { from: "restricted", to: "active", action: "remove_restriction", requiresApproval: true },
    { from: "active", to: "retired", action: "retire_persona", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "retired", to: "archived", action: "archive_persona", requiresApproval: true, uiPattern: "destructive_modal" },
  ],
};

// ---- 17.3 Capital Pool ----
export type CapitalPoolState = "draft" | "active" | "frozen" | "rebalancing" | "restricted" | "retired";
export const capitalPoolMachine: StateMachine<CapitalPoolState> = {
  name: "capitalPool",
  states: ["draft", "active", "rebalancing", "retired"],
  branchStates: ["frozen", "restricted"],
  transitions: [
    { from: "draft", to: "active", action: "activate_pool", requiresApproval: true, risk: "medium" },
    { from: "active", to: "frozen", action: "freeze_pool", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "frozen", to: "active", action: "unfreeze_pool", requiresApproval: true, risk: "high" },
    { from: "active", to: "rebalancing", action: "start_rebalance", requiresApproval: true, risk: "medium" },
    { from: "rebalancing", to: "active", action: "apply_rebalance", requiresApproval: true, risk: "high" },
    { from: "active", to: "restricted", action: "restrict_pool", requiresApproval: true, risk: "high" },
    { from: "active", to: "retired", action: "retire_pool", requiresApproval: true, risk: "critical", uiPattern: "destructive_modal" },
  ],
};

// ---- 17.4 Ranking Formula ----
export type RankingFormulaState = "draft" | "testing" | "approved" | "active" | "deprecated" | "retired";
export const rankingFormulaMachine: StateMachine<RankingFormulaState> = {
  name: "rankingFormula",
  states: ["draft", "testing", "approved", "active", "deprecated", "retired"],
  transitions: [
    { from: "draft", to: "testing", action: "test_formula", uiPattern: "create_job" },
    { from: "testing", to: "approved", action: "submit_formula_review", requiresApproval: true, uiPattern: "review_workflow" },
    { from: "approved", to: "active", action: "activate_formula", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "active", to: "deprecated", action: "deprecate_formula", requiresApproval: true, risk: "medium" },
    { from: "deprecated", to: "retired", action: "retire_formula", requiresApproval: true },
  ],
};

// ---- 17.5 Quarterly Rebalance ----
export type RebalanceState =
  | "draft" | "metrics_freezing" | "metrics_frozen" | "ranking_calculated"
  | "simulation_ready" | "under_review" | "approved" | "scheduled"
  | "applied" | "rolled_back" | "cancelled";
export const rebalanceMachine: StateMachine<RebalanceState> = {
  name: "rebalance",
  states: ["draft", "metrics_freezing", "metrics_frozen", "ranking_calculated", "simulation_ready", "under_review", "approved", "scheduled", "applied"],
  branchStates: ["rolled_back", "cancelled"],
  transitions: [
    { from: "draft", to: "metrics_freezing", action: "start_metrics_freeze", uiPattern: "create_job" },
    { from: "metrics_freezing", to: "metrics_frozen", action: "metrics_frozen" },
    { from: "metrics_frozen", to: "metrics_freezing", action: "unfreeze_metrics", requiresApproval: true },
    { from: "metrics_frozen", to: "ranking_calculated", action: "calculate_ranking", uiPattern: "create_job" },
    { from: "ranking_calculated", to: "simulation_ready", action: "run_simulation", uiPattern: "create_job" },
    { from: "simulation_ready", to: "under_review", action: "submit_for_review", requiresApproval: true, uiPattern: "review_workflow" },
    { from: "under_review", to: "approved", action: "approve_rebalance", requiresApproval: true, risk: "high" },
    { from: "approved", to: "scheduled", action: "schedule_apply" },
    { from: "scheduled", to: "applied", action: "apply_rebalance", requiresApproval: true, risk: "critical", uiPattern: "high_risk_modal" },
    { from: "applied", to: "rolled_back", action: "rollback_rebalance", requiresApproval: true, risk: "critical", uiPattern: "rollback_modal" },
    { from: "draft", to: "cancelled", action: "cancel" },
    { from: "metrics_frozen", to: "cancelled", action: "cancel" },
    { from: "ranking_calculated", to: "cancelled", action: "cancel" },
    { from: "simulation_ready", to: "cancelled", action: "cancel" },
    { from: "under_review", to: "cancelled", action: "cancel" },
    { from: "approved", to: "cancelled", action: "cancel" },
    { from: "scheduled", to: "cancelled", action: "cancel" },
  ],
};

// ---- 17.6 Evolution Program ----
export type EvolutionState = "draft" | "active" | "paused" | "under_review" | "completed" | "retired";
export const evolutionMachine: StateMachine<EvolutionState> = {
  name: "evolution",
  states: ["draft", "under_review", "active", "completed", "retired"],
  branchStates: ["paused"],
  transitions: [
    { from: "draft", to: "under_review", action: "submit_evolution_review", requiresApproval: true, uiPattern: "review_workflow" },
    { from: "under_review", to: "active", action: "approve_program", requiresApproval: true, risk: "medium" },
    { from: "active", to: "paused", action: "pause_program", risk: "low" },
    { from: "paused", to: "active", action: "resume_program", risk: "low" },
    { from: "active", to: "completed", action: "complete_program" },
    { from: "completed", to: "retired", action: "retire_program" },
  ],
};

export type EvolutionRunState = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export const evolutionRunMachine: StateMachine<EvolutionRunState> = {
  name: "evolutionRun",
  states: ["queued", "running", "completed"],
  branchStates: ["paused", "failed", "cancelled"],
  transitions: [
    { from: "queued", to: "running", action: "start" },
    { from: "running", to: "paused", action: "pause" },
    { from: "paused", to: "running", action: "resume" },
    { from: "running", to: "completed", action: "complete" },
    { from: "running", to: "failed", action: "fail" },
    { from: "queued", to: "cancelled", action: "cancel" },
    { from: "running", to: "cancelled", action: "cancel" },
  ],
};

// ---- 17.7 Experiment ----
export type ExperimentState =
  | "draft" | "queued" | "running" | "completed" | "failed"
  | "invalidated" | "attached_to_review" | "archived";
export const experimentMachine: StateMachine<ExperimentState> = {
  name: "experiment",
  states: ["draft", "queued", "running", "completed", "attached_to_review", "archived"],
  branchStates: ["failed", "invalidated"],
  transitions: [
    { from: "draft", to: "queued", action: "run_experiment", uiPattern: "create_job" },
    { from: "queued", to: "running", action: "job_started" },
    { from: "running", to: "completed", action: "job_completed" },
    { from: "running", to: "failed", action: "job_failed" },
    { from: "completed", to: "attached_to_review", action: "attach_to_review", requiresApproval: true },
    { from: "completed", to: "invalidated", action: "invalidate_result", requiresApproval: true, risk: "medium" },
    { from: "failed", to: "queued", action: "retry" },
    { from: "completed", to: "archived", action: "archive" },
  ],
};

// ---- 17.8 Approval ----
export type ApprovalState =
  | "draft" | "submitted" | "validator_running" | "in_review"
  | "changes_requested" | "approved" | "rejected" | "cancelled";
export const approvalMachine: StateMachine<ApprovalState> = {
  name: "approval",
  states: ["draft", "submitted", "validator_running", "in_review", "approved"],
  branchStates: ["changes_requested", "rejected", "cancelled"],
  transitions: [
    { from: "draft", to: "submitted", action: "submit" },
    { from: "submitted", to: "validator_running", action: "run_validators", uiPattern: "create_job" },
    { from: "validator_running", to: "in_review", action: "validators_done" },
    { from: "in_review", to: "approved", action: "approve", requiresApproval: true, risk: "medium" },
    { from: "in_review", to: "rejected", action: "reject", requiresApproval: true },
    { from: "in_review", to: "changes_requested", action: "request_changes" },
    { from: "changes_requested", to: "submitted", action: "resubmit" },
    { from: "submitted", to: "cancelled", action: "cancel" },
    { from: "in_review", to: "cancelled", action: "cancel" },
  ],
};

// ---- 17.9 Deployment ----
export type DeploymentState =
  | "draft" | "submitted" | "under_review" | "approved" | "scheduled"
  | "deploying" | "deployed" | "failed" | "rolled_back" | "cancelled";
export const deploymentMachine: StateMachine<DeploymentState> = {
  name: "deployment",
  states: ["draft", "submitted", "under_review", "approved", "scheduled", "deploying", "deployed"],
  branchStates: ["failed", "rolled_back", "cancelled"],
  transitions: [
    { from: "draft", to: "submitted", action: "submit" },
    { from: "submitted", to: "under_review", action: "open_review", uiPattern: "review_workflow" },
    { from: "under_review", to: "approved", action: "approve", requiresApproval: true, risk: "high" },
    { from: "approved", to: "scheduled", action: "schedule" },
    { from: "scheduled", to: "deploying", action: "start_deploy", risk: "high", uiPattern: "high_risk_modal" },
    { from: "deploying", to: "deployed", action: "deploy_complete" },
    { from: "deploying", to: "failed", action: "deploy_failed" },
    { from: "failed", to: "rolled_back", action: "rollback", risk: "critical", uiPattern: "rollback_modal" },
    { from: "deployed", to: "rolled_back", action: "rollback", requiresApproval: true, risk: "critical", uiPattern: "rollback_modal" },
    { from: "draft", to: "cancelled", action: "cancel" },
    { from: "submitted", to: "cancelled", action: "cancel" },
    { from: "under_review", to: "cancelled", action: "cancel" },
    { from: "approved", to: "cancelled", action: "cancel" },
    { from: "scheduled", to: "cancelled", action: "cancel" },
  ],
};

// ---- 17.10 Risk Alert ----
export type AlertState = "new" | "acknowledged" | "assigned" | "investigating" | "mitigated" | "resolved" | "closed";
export const alertMachine: StateMachine<AlertState> = {
  name: "alert",
  states: ["new", "acknowledged", "assigned", "investigating", "mitigated", "resolved", "closed"],
  transitions: [
    { from: "new", to: "acknowledged", action: "acknowledge" },
    { from: "acknowledged", to: "assigned", action: "assign" },
    { from: "assigned", to: "investigating", action: "investigate" },
    { from: "investigating", to: "mitigated", action: "mitigate", risk: "medium" },
    { from: "mitigated", to: "resolved", action: "resolve" },
    { from: "resolved", to: "closed", action: "close" },
    { from: "new", to: "investigating", action: "create_incident", risk: "high" },
    { from: "acknowledged", to: "investigating", action: "create_incident", risk: "high" },
    { from: "assigned", to: "investigating", action: "create_incident", risk: "high" },
  ],
};

// ---- 17.11 Incident ----
export type IncidentState =
  | "open" | "assigned" | "investigating" | "mitigation_in_progress"
  | "mitigated" | "postmortem_required" | "closed";
export const incidentMachine: StateMachine<IncidentState> = {
  name: "incident",
  states: ["open", "assigned", "investigating", "mitigation_in_progress", "mitigated", "postmortem_required", "closed"],
  transitions: [
    { from: "open", to: "assigned", action: "assign_commander" },
    { from: "assigned", to: "investigating", action: "investigate" },
    { from: "investigating", to: "mitigation_in_progress", action: "start_mitigation", risk: "high" },
    { from: "mitigation_in_progress", to: "mitigated", action: "mitigation_complete" },
    { from: "mitigated", to: "postmortem_required", action: "open_postmortem" },
    { from: "postmortem_required", to: "closed", action: "close_incident", requiresApproval: true },
  ],
};

// ---- 17.12 Tool ----
export type ToolState = "draft" | "testing" | "active" | "restricted" | "deprecated" | "blocked" | "retired";
export const toolMachine: StateMachine<ToolState> = {
  name: "tool",
  states: ["draft", "testing", "active", "deprecated", "retired"],
  branchStates: ["restricted", "blocked"],
  transitions: [
    { from: "draft", to: "testing", action: "test_tool", uiPattern: "create_job" },
    { from: "testing", to: "active", action: "activate_tool", requiresApproval: true },
    { from: "active", to: "restricted", action: "restrict_tool", requiresApproval: true, risk: "high" },
    { from: "restricted", to: "active", action: "unrestrict_tool", requiresApproval: true },
    { from: "active", to: "deprecated", action: "deprecate_tool", requiresApproval: true, risk: "medium" },
    { from: "deprecated", to: "retired", action: "retire_tool", requiresApproval: true },
    { from: "active", to: "blocked", action: "block_tool", requiresApproval: true, risk: "critical", uiPattern: "high_risk_modal" },
  ],
};

// ---- 17.13 MCP Server ----
export type McpServerState = "draft" | "connected" | "healthy" | "degraded" | "disabled" | "retired";
export const mcpServerMachine: StateMachine<McpServerState> = {
  name: "mcpServer",
  states: ["draft", "connected", "healthy", "retired"],
  branchStates: ["degraded", "disabled"],
  transitions: [
    { from: "draft", to: "connected", action: "connect" },
    { from: "connected", to: "healthy", action: "health_ok" },
    { from: "healthy", to: "degraded", action: "health_degraded", risk: "high" },
    { from: "healthy", to: "disabled", action: "disable", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "degraded", to: "disabled", action: "disable", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "disabled", to: "healthy", action: "reenable", requiresApproval: true },
    { from: "any" as McpServerState, to: "retired", action: "retire", requiresApproval: true, risk: "critical", uiPattern: "destructive_modal" },
  ],
};

// ---- 17.14 Skill ----
export type SkillState = "draft" | "sandboxed" | "validated" | "approved" | "active" | "deprecated" | "blocked" | "retired";
export const skillMachine: StateMachine<SkillState> = {
  name: "skill",
  states: ["draft", "sandboxed", "validated", "approved", "active", "deprecated", "retired"],
  branchStates: ["blocked"],
  transitions: [
    { from: "draft", to: "sandboxed", action: "deploy_sandbox" },
    { from: "sandboxed", to: "validated", action: "validate_skill", uiPattern: "create_job" },
    { from: "validated", to: "approved", action: "submit_for_approval", requiresApproval: true, uiPattern: "review_workflow" },
    { from: "approved", to: "active", action: "activate_skill", requiresApproval: true, risk: "high", uiPattern: "high_risk_modal" },
    { from: "active", to: "deprecated", action: "deprecate_skill", requiresApproval: true, risk: "medium" },
    { from: "deprecated", to: "retired", action: "retire_skill", requiresApproval: true },
    { from: "active", to: "blocked", action: "block_skill", requiresApproval: true, risk: "critical", uiPattern: "high_risk_modal" },
    { from: "blocked", to: "sandboxed", action: "reopen_skill", requiresApproval: true },
  ],
};

// ---- 17.15 Memory Review ----
export type MemoryState = "proposed" | "approved" | "rejected" | "edited" | "merged" | "deprecated" | "deleted" | "sensitive";
export const memoryMachine: StateMachine<MemoryState> = {
  name: "memory",
  states: ["proposed", "approved", "edited", "merged", "deprecated"],
  branchStates: ["rejected", "sensitive", "deleted"],
  transitions: [
    { from: "proposed", to: "approved", action: "approve_memory", requiresApproval: true },
    { from: "proposed", to: "rejected", action: "reject_memory", requiresApproval: true },
    { from: "approved", to: "edited", action: "edit_memory" },
    { from: "approved", to: "merged", action: "merge_memory", requiresApproval: true },
    { from: "approved", to: "sensitive", action: "mark_sensitive", requiresApproval: true, risk: "high" },
    { from: "approved", to: "deprecated", action: "deprecate_memory", requiresApproval: true },
    { from: "any" as MemoryState, to: "deleted", action: "delete_memory", requiresApproval: true, risk: "critical", uiPattern: "destructive_modal" },
  ],
};

// ---- 17.16 Insight ----
export type InsightState =
  | "raw" | "triaged" | "classified" | "linked"
  | "converted_to_strategy" | "converted_to_research_task" | "converted_to_training_example"
  | "dismissed" | "archived";
export const insightMachine: StateMachine<InsightState> = {
  name: "insight",
  states: ["raw", "triaged", "classified", "linked", "converted_to_strategy"],
  branchStates: ["converted_to_research_task", "converted_to_training_example", "dismissed", "archived"],
  transitions: [
    { from: "raw", to: "triaged", action: "triage" },
    { from: "triaged", to: "classified", action: "classify" },
    { from: "classified", to: "linked", action: "link_object" },
    { from: "classified", to: "converted_to_strategy", action: "convert_to_strategy", requiresApproval: true, risk: "medium" },
    { from: "classified", to: "converted_to_research_task", action: "convert_to_research", requiresApproval: true },
    { from: "classified", to: "converted_to_training_example", action: "convert_to_training" },
    { from: "any" as InsightState, to: "dismissed", action: "dismiss" },
    { from: "any" as InsightState, to: "archived", action: "archive" },
  ],
};

// ---- 17.17 Agora Session ----
export type AgoraSessionState =
  | "open" | "active" | "waiting_for_user" | "summary_generated"
  | "submitted_to_management" | "closed" | "archived";
export const agoraSessionMachine: StateMachine<AgoraSessionState> = {
  name: "agoraSession",
  states: ["open", "active", "summary_generated", "submitted_to_management", "closed", "archived"],
  branchStates: ["waiting_for_user"],
  transitions: [
    { from: "open", to: "active", action: "start_session" },
    { from: "active", to: "waiting_for_user", action: "wait_user" },
    { from: "waiting_for_user", to: "active", action: "user_responded" },
    { from: "active", to: "summary_generated", action: "generate_summary", uiPattern: "create_job" },
    { from: "summary_generated", to: "submitted_to_management", action: "submit_to_management", requiresApproval: true, risk: "medium" },
    { from: "active", to: "closed", action: "close" },
    { from: "summary_generated", to: "closed", action: "close" },
    { from: "closed", to: "archived", action: "archive" },
  ],
};

// ---- 17.18 Job ----
export type JobState = "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying";
export const jobMachine: StateMachine<JobState> = {
  name: "job",
  states: ["queued", "running", "completed"],
  branchStates: ["waiting_for_approval", "failed", "cancelled", "retrying"],
  transitions: [
    { from: "queued", to: "running", action: "start" },
    { from: "running", to: "completed", action: "complete" },
    { from: "running", to: "failed", action: "fail" },
    { from: "running", to: "waiting_for_approval", action: "wait_approval", requiresApproval: true },
    { from: "waiting_for_approval", to: "running", action: "approval_granted" },
    { from: "failed", to: "retrying", action: "retry" },
    { from: "retrying", to: "running", action: "retry_started" },
    { from: "queued", to: "cancelled", action: "cancel" },
    { from: "running", to: "cancelled", action: "cancel" },
  ],
};

// ---- Registry ----
export const machines = {
  strategy: strategyMachine,
  persona: personaMachine,
  capitalPool: capitalPoolMachine,
  rankingFormula: rankingFormulaMachine,
  rebalance: rebalanceMachine,
  evolution: evolutionMachine,
  evolutionRun: evolutionRunMachine,
  experiment: experimentMachine,
  approval: approvalMachine,
  deployment: deploymentMachine,
  alert: alertMachine,
  incident: incidentMachine,
  tool: toolMachine,
  mcpServer: mcpServerMachine,
  skill: skillMachine,
  memory: memoryMachine,
  insight: insightMachine,
  agoraSession: agoraSessionMachine,
  job: jobMachine,
} as const;

export type MachineKey = keyof typeof machines;

export type { StateMachine, Transition };
