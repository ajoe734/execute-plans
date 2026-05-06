// v4 / Pack C §C013 — Complete role × entity × action permission matrix.

export type Role =
  | "admin" | "research_lead" | "strategy_manager" | "risk_officer"
  | "capital_manager" | "capability_admin" | "system_operator" | "reviewer";

export interface PermissionRow {
  entity: string;
  action: string;
  allowedRoles: readonly Role[];
  /** Y = action requires approval or high-risk confirmation. */
  approval: boolean;
  capability: string;
}

const ALL_VIEWERS: readonly Role[] = [
  "admin", "research_lead", "risk_officer", "capital_manager",
  "strategy_manager", "system_operator", "reviewer", "capability_admin",
];

export const PERMISSION_MATRIX: readonly PermissionRow[] = [
  // ---- tool ----
  { entity: "tool", action: "register_tool", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "tool.write" },
  { entity: "tool", action: "edit_tool_schema", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "tool.write" },
  { entity: "tool", action: "classify_tool_risk", allowedRoles: ["admin", "risk_officer", "capability_admin"], approval: true, capability: "tool.risk" },
  { entity: "tool", action: "test_tool", allowedRoles: ["admin", "capability_admin", "system_operator"], approval: false, capability: "tool.test" },
  { entity: "tool", action: "grant_tool_to_persona", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "tool.permission" },
  { entity: "tool", action: "revoke_tool_from_persona", allowedRoles: ["admin", "capability_admin", "risk_officer"], approval: true, capability: "tool.permission" },
  { entity: "tool", action: "disable_tool", allowedRoles: ["admin", "risk_officer", "capability_admin"], approval: true, capability: "tool.lifecycle" },
  { entity: "tool", action: "retire_tool", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "tool.lifecycle" },
  { entity: "tool", action: "view_tool_calls", allowedRoles: ALL_VIEWERS, approval: false, capability: "tool.read" },
  // ---- mcp ----
  { entity: "mcp", action: "add_mcp_server", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "mcp.write" },
  { entity: "mcp", action: "edit_mcp_connection", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "mcp.write" },
  { entity: "mcp", action: "rotate_mcp_secret", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "mcp.secret" },
  { entity: "mcp", action: "discover_mcp_tools", allowedRoles: ["admin", "capability_admin", "system_operator"], approval: false, capability: "mcp.discover" },
  { entity: "mcp", action: "import_mcp_schema", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "mcp.schema" },
  { entity: "mcp", action: "grant_mcp_tool", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "mcp.permission" },
  { entity: "mcp", action: "revoke_mcp_tool", allowedRoles: ["admin", "capability_admin", "risk_officer"], approval: true, capability: "mcp.permission" },
  { entity: "mcp", action: "disable_mcp_server", allowedRoles: ["admin", "risk_officer", "capability_admin"], approval: true, capability: "mcp.lifecycle" },
  { entity: "mcp", action: "view_mcp_calls", allowedRoles: ALL_VIEWERS, approval: false, capability: "mcp.read" },
  // ---- skill ----
  { entity: "skill", action: "create_skill", allowedRoles: ["admin", "capability_admin"], approval: false, capability: "skill.write" },
  { entity: "skill", action: "import_skill", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "skill.write" },
  { entity: "skill", action: "run_skill_sandbox", allowedRoles: ["admin", "capability_admin", "research_lead"], approval: false, capability: "skill.test" },
  { entity: "skill", action: "security_scan_skill", allowedRoles: ["admin", "capability_admin"], approval: false, capability: "skill.scan" },
  { entity: "skill", action: "approve_skill", allowedRoles: ["admin", "capability_admin", "risk_officer"], approval: true, capability: "skill.approve" },
  { entity: "skill", action: "assign_skill_to_persona", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "skill.permission" },
  { entity: "skill", action: "revoke_skill_from_persona", allowedRoles: ["admin", "capability_admin", "risk_officer"], approval: true, capability: "skill.permission" },
  { entity: "skill", action: "rollback_skill_version", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "skill.lifecycle" },
  { entity: "skill", action: "deprecate_skill", allowedRoles: ["admin", "capability_admin"], approval: true, capability: "skill.lifecycle" },
  // ---- memory ----
  { entity: "memory", action: "approve_memory", allowedRoles: ["admin", "research_lead", "reviewer"], approval: false, capability: "memory.review" },
  { entity: "memory", action: "reject_memory", allowedRoles: ["admin", "research_lead", "reviewer"], approval: false, capability: "memory.review" },
  { entity: "memory", action: "edit_memory", allowedRoles: ["admin", "research_lead"], approval: true, capability: "memory.write" },
  { entity: "memory", action: "merge_memory", allowedRoles: ["admin", "research_lead"], approval: true, capability: "memory.write" },
  { entity: "memory", action: "move_memory_scope", allowedRoles: ["admin", "research_lead"], approval: true, capability: "memory.scope" },
  { entity: "memory", action: "quarantine_memory", allowedRoles: ["admin", "research_lead", "risk_officer"], approval: true, capability: "memory.lifecycle" },
  { entity: "memory", action: "restore_memory", allowedRoles: ["admin", "research_lead", "reviewer"], approval: true, capability: "memory.lifecycle" },
  { entity: "memory", action: "mark_memory_sensitive", allowedRoles: ["admin", "risk_officer", "research_lead"], approval: true, capability: "memory.sensitive" },
  { entity: "memory", action: "delete_memory", allowedRoles: ["admin", "risk_officer"], approval: true, capability: "memory.delete" },
  // ---- insight ----
  { entity: "insight", action: "triage_insight", allowedRoles: ["admin", "research_lead", "reviewer", "strategy_manager"], approval: false, capability: "insight.write" },
  { entity: "insight", action: "convert_insight_to_strategy", allowedRoles: ["admin", "research_lead", "strategy_manager"], approval: false, capability: "strategy.create" },
  { entity: "insight", action: "attach_insight_to_strategy", allowedRoles: ["admin", "research_lead", "strategy_manager", "reviewer"], approval: false, capability: "insight.link" },
  { entity: "insight", action: "create_research_task_from_insight", allowedRoles: ["admin", "research_lead", "strategy_manager"], approval: false, capability: "experiment.create" },
  { entity: "insight", action: "archive_insight", allowedRoles: ["admin", "research_lead", "reviewer"], approval: false, capability: "insight.lifecycle" },
  { entity: "insight", action: "reject_insight", allowedRoles: ["admin", "research_lead", "reviewer"], approval: false, capability: "insight.lifecycle" },
  // ---- artifact ----
  { entity: "artifact", action: "register_artifact", allowedRoles: ["admin", "research_lead", "strategy_manager"], approval: false, capability: "artifact.write" },
  { entity: "artifact", action: "promote_artifact", allowedRoles: ["admin", "research_lead", "reviewer"], approval: true, capability: "artifact.promote" },
  { entity: "artifact", action: "deprecate_artifact", allowedRoles: ["admin", "research_lead", "risk_officer"], approval: true, capability: "artifact.lifecycle" },
  { entity: "artifact", action: "set_rollback_target", allowedRoles: ["admin", "risk_officer", "strategy_manager"], approval: true, capability: "deployment.rollback" },
  { entity: "artifact", action: "attach_artifact_to_review", allowedRoles: ["admin", "research_lead", "reviewer"], approval: false, capability: "review.write" },
  { entity: "artifact", action: "download_artifact", allowedRoles: ALL_VIEWERS, approval: false, capability: "artifact.read" },
  // ---- job ----
  { entity: "job", action: "view_job", allowedRoles: ALL_VIEWERS, approval: false, capability: "job.read" },
  { entity: "job", action: "cancel_job", allowedRoles: ["admin", "system_operator", "research_lead"], approval: true, capability: "job.control" },
  { entity: "job", action: "retry_job", allowedRoles: ["admin", "system_operator", "research_lead"], approval: false, capability: "job.control" },
  { entity: "job", action: "clone_job", allowedRoles: ["admin", "system_operator", "research_lead", "strategy_manager"], approval: false, capability: "job.create" },
  { entity: "job", action: "attach_job_result", allowedRoles: ["admin", "research_lead", "reviewer"], approval: false, capability: "job.link" },
  { entity: "job", action: "create_incident_from_job", allowedRoles: ["admin", "system_operator", "risk_officer"], approval: false, capability: "incident.create" },
  // ---- incident ----
  { entity: "incident", action: "create_incident", allowedRoles: ["admin", "risk_officer", "system_operator", "research_lead"], approval: false, capability: "incident.create" },
  { entity: "incident", action: "assign_incident", allowedRoles: ["admin", "risk_officer", "system_operator"], approval: false, capability: "incident.assign" },
  { entity: "incident", action: "add_timeline_event", allowedRoles: ["admin", "risk_officer", "system_operator", "research_lead", "reviewer"], approval: false, capability: "incident.write" },
  { entity: "incident", action: "mitigate_incident", allowedRoles: ["admin", "risk_officer", "system_operator"], approval: true, capability: "incident.mitigate" },
  { entity: "incident", action: "escalate_incident", allowedRoles: ["admin", "risk_officer", "system_operator"], approval: false, capability: "incident.escalate" },
  { entity: "incident", action: "close_incident", allowedRoles: ["admin", "risk_officer"], approval: true, capability: "incident.close" },
  { entity: "incident", action: "trigger_incident_rollback", allowedRoles: ["admin", "risk_officer", "system_operator"], approval: true, capability: "deployment.rollback" },
  // ---- deployment ----
  { entity: "deployment", action: "plan_deployment", allowedRoles: ["admin", "strategy_manager", "system_operator"], approval: true, capability: "deployment.plan" },
  { entity: "deployment", action: "approve_deployment", allowedRoles: ["admin", "risk_officer", "reviewer"], approval: true, capability: "deployment.approve" },
  { entity: "deployment", action: "execute_deployment", allowedRoles: ["admin", "system_operator"], approval: true, capability: "deployment.execute" },
  { entity: "deployment", action: "pause_deployment", allowedRoles: ["admin", "system_operator", "risk_officer"], approval: true, capability: "deployment.pause" },
  { entity: "deployment", action: "resume_deployment", allowedRoles: ["admin", "system_operator", "risk_officer"], approval: true, capability: "deployment.resume" },
  { entity: "deployment", action: "rollback_deployment", allowedRoles: ["admin", "risk_officer", "system_operator"], approval: true, capability: "deployment.rollback" },
  { entity: "deployment", action: "retire_deployment", allowedRoles: ["admin", "risk_officer", "strategy_manager"], approval: true, capability: "deployment.retire" },
  { entity: "deployment", action: "emergency_kill", allowedRoles: ["admin", "risk_officer", "system_operator"], approval: true, capability: "deployment.kill" },
  // ---- runtime ----
  { entity: "runtime", action: "view_runtime", allowedRoles: ALL_VIEWERS, approval: false, capability: "runtime.read" },
  { entity: "runtime", action: "restart_runtime", allowedRoles: ["admin", "system_operator"], approval: true, capability: "runtime.restart" },
  { entity: "runtime", action: "drain_runtime", allowedRoles: ["admin", "system_operator", "risk_officer"], approval: true, capability: "runtime.drain" },
  { entity: "runtime", action: "move_strategy_runtime", allowedRoles: ["admin", "system_operator", "risk_officer"], approval: true, capability: "runtime.move" },
  { entity: "runtime", action: "disable_new_deployments", allowedRoles: ["admin", "system_operator", "risk_officer"], approval: true, capability: "runtime.disable" },
  { entity: "runtime", action: "open_runtime_logs", allowedRoles: ["admin", "system_operator", "risk_officer"], approval: false, capability: "runtime.logs" },
  // ---- route_policy ----
  { entity: "route_policy", action: "create_route_policy", allowedRoles: ["admin", "capability_admin", "research_lead"], approval: true, capability: "policy.write" },
  { entity: "route_policy", action: "edit_route_policy", allowedRoles: ["admin", "capability_admin", "research_lead"], approval: true, capability: "policy.write" },
  { entity: "route_policy", action: "submit_route_policy_review", allowedRoles: ["admin", "capability_admin", "research_lead"], approval: false, capability: "policy.review" },
  { entity: "route_policy", action: "activate_route_policy", allowedRoles: ["admin", "capability_admin", "risk_officer"], approval: true, capability: "policy.activate" },
  { entity: "route_policy", action: "rollback_route_policy", allowedRoles: ["admin", "capability_admin", "risk_officer"], approval: true, capability: "policy.rollback" },
  // ---- evolution_program ----
  { entity: "evolution_program", action: "create_evolution_program", allowedRoles: ["admin", "research_lead", "strategy_manager"], approval: false, capability: "evolution.write" },
  { entity: "evolution_program", action: "edit_evolution_direction", allowedRoles: ["admin", "research_lead", "strategy_manager"], approval: true, capability: "evolution.write" },
  { entity: "evolution_program", action: "set_fitness_formula", allowedRoles: ["admin", "research_lead", "strategy_manager"], approval: true, capability: "evolution.formula" },
  { entity: "evolution_program", action: "start_evolution_run", allowedRoles: ["admin", "research_lead", "system_operator"], approval: false, capability: "evolution.run" },
  { entity: "evolution_program", action: "pause_evolution_run", allowedRoles: ["admin", "research_lead", "system_operator"], approval: false, capability: "evolution.run" },
  { entity: "evolution_program", action: "stop_evolution_run", allowedRoles: ["admin", "research_lead", "system_operator", "risk_officer"], approval: true, capability: "evolution.run" },
  { entity: "evolution_program", action: "promote_evolution_candidate", allowedRoles: ["admin", "research_lead", "strategy_manager", "reviewer"], approval: true, capability: "evolution.promote" },
  { entity: "evolution_program", action: "retire_evolution_program", allowedRoles: ["admin", "research_lead"], approval: true, capability: "evolution.lifecycle" },
] as const;

export function canRoleInvoke(role: Role, entity: string, action: string): boolean {
  const row = PERMISSION_MATRIX.find((r) => r.entity === entity && r.action === action);
  return row ? row.allowedRoles.includes(role) : false;
}

export function lookupPermission(entity: string, action: string): PermissionRow | undefined {
  return PERMISSION_MATRIX.find((r) => r.entity === entity && r.action === action);
}
