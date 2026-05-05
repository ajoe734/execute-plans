// v3 §5 Permission Truth Tables.
// Resolves G02. Single source of truth: role × entity × action.

import type { ManagementRole } from "./availableActions";

export interface ActionPermission {
  actionId: string;
  allowedRoles: readonly ManagementRole[];
  requiresApproval: boolean;
  highRisk: boolean;
  notes?: string;
}

// ---------- 5.2 Strategy actions ----------
export const STRATEGY_ACTION_PERMISSIONS: readonly ActionPermission[] = [
  { actionId: "strategy.create", allowedRoles: ["admin", "research_lead", "strategy_manager"], requiresApproval: false, highRisk: false },
  { actionId: "strategy.edit_spec", allowedRoles: ["admin", "research_lead", "strategy_manager"], requiresApproval: false, highRisk: false },
  { actionId: "strategy.lock_spec", allowedRoles: ["admin", "research_lead", "strategy_manager"], requiresApproval: false, highRisk: false },
  { actionId: "strategy.assign_persona", allowedRoles: ["admin", "research_lead", "strategy_manager"], requiresApproval: false, highRisk: false },
  { actionId: "strategy.run_experiment", allowedRoles: ["admin", "research_lead", "strategy_manager"], requiresApproval: false, highRisk: false },
  { actionId: "strategy.submit_review", allowedRoles: ["admin", "research_lead", "strategy_manager"], requiresApproval: false, highRisk: false },
  { actionId: "strategy.approve_review", allowedRoles: ["admin", "reviewer", "risk_officer"], requiresApproval: true, highRisk: false },
  { actionId: "strategy.promote_paper", allowedRoles: ["admin", "research_lead", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "strategy.request_live_promotion", allowedRoles: ["admin", "research_lead", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "strategy.deploy_live", allowedRoles: ["admin", "risk_officer", "system_operator"], requiresApproval: true, highRisk: true },
  { actionId: "strategy.pause_live", allowedRoles: ["admin", "risk_officer", "system_operator"], requiresApproval: true, highRisk: true },
  { actionId: "strategy.resume_live", allowedRoles: ["admin", "risk_officer", "system_operator"], requiresApproval: true, highRisk: true },
  { actionId: "strategy.rollback_live", allowedRoles: ["admin", "risk_officer", "system_operator"], requiresApproval: true, highRisk: true },
  { actionId: "strategy.emergency_kill", allowedRoles: ["admin", "risk_officer", "system_operator"], requiresApproval: false, highRisk: true, notes: "no_pre_approval" },
  { actionId: "strategy.retire", allowedRoles: ["admin", "research_lead", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "strategy.archive", allowedRoles: ["admin", "strategy_manager"], requiresApproval: false, highRisk: false },
] as const;

// ---------- 5.3 Persona actions ----------
export const PERSONA_ACTION_PERMISSIONS: readonly ActionPermission[] = [
  { actionId: "persona.create", allowedRoles: ["admin", "research_lead", "ai_trainer"], requiresApproval: false, highRisk: false },
  { actionId: "persona.clone", allowedRoles: ["admin", "research_lead", "ai_trainer"], requiresApproval: false, highRisk: false },
  { actionId: "persona.edit_identity", allowedRoles: ["admin", "research_lead", "ai_trainer"], requiresApproval: false, highRisk: false },
  { actionId: "persona.update_route_policy", allowedRoles: ["admin", "research_lead", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "persona.grant_tool", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "persona.revoke_tool", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "persona.grant_mcp_tool", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "persona.revoke_mcp_tool", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "persona.grant_skill", allowedRoles: ["admin", "capability_admin", "research_lead"], requiresApproval: true, highRisk: true },
  { actionId: "persona.revoke_skill", allowedRoles: ["admin", "capability_admin", "research_lead"], requiresApproval: true, highRisk: true },
  { actionId: "persona.activate", allowedRoles: ["admin", "research_lead"], requiresApproval: true, highRisk: true },
  { actionId: "persona.restrict", allowedRoles: ["admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "persona.suspend", allowedRoles: ["admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "persona.retire", allowedRoles: ["admin", "research_lead"], requiresApproval: true, highRisk: true },
] as const;

// ---------- 5.4 Capital / ranking / rebalance ----------
export const CAPITAL_ACTION_PERMISSIONS: readonly ActionPermission[] = [
  { actionId: "capital_pool.create", allowedRoles: ["admin", "capital_manager"], requiresApproval: false, highRisk: false },
  { actionId: "capital_pool.edit_mandate", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "capital_pool.set_risk_budget", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "capital_pool.bind_persona", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "capital_pool.bind_strategy", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "capital_pool.freeze", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "ranking_formula.create", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: false, highRisk: false },
  { actionId: "ranking_formula.edit", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: false, highRisk: false },
  { actionId: "ranking_formula.test", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: false, highRisk: false },
  { actionId: "ranking_formula.approve", allowedRoles: ["admin", "risk_officer", "reviewer"], requiresApproval: true, highRisk: true },
  { actionId: "ranking_formula.activate", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "ranking_formula.rollback", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "rebalance.freeze_metrics", allowedRoles: ["admin", "capital_manager"], requiresApproval: false, highRisk: false },
  { actionId: "rebalance.calculate_ranking", allowedRoles: ["admin", "capital_manager"], requiresApproval: false, highRisk: false },
  { actionId: "rebalance.apply_override", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "rebalance.approve", allowedRoles: ["admin", "risk_officer", "capital_manager"], requiresApproval: true, highRisk: true },
  { actionId: "rebalance.apply", allowedRoles: ["admin", "capital_manager", "system_operator"], requiresApproval: true, highRisk: true },
  { actionId: "rebalance.rollback", allowedRoles: ["admin", "capital_manager", "risk_officer"], requiresApproval: true, highRisk: true },
] as const;

// ---------- 5.5 Capability actions ----------
export const CAPABILITY_ACTION_PERMISSIONS: readonly ActionPermission[] = [
  { actionId: "tool.register", allowedRoles: ["admin", "capability_admin"], requiresApproval: false, highRisk: false },
  { actionId: "tool.edit_schema", allowedRoles: ["admin", "capability_admin"], requiresApproval: false, highRisk: false },
  { actionId: "tool.classify_risk", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "tool.disable", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "mcp_server.add", allowedRoles: ["admin", "capability_admin"], requiresApproval: true, highRisk: true },
  { actionId: "mcp_server.rotate_secret", allowedRoles: ["admin", "capability_admin"], requiresApproval: true, highRisk: true },
  { actionId: "mcp_server.disable", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "mcp_tool.grant_persona", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "skill.create_draft", allowedRoles: ["admin", "capability_admin", "ai_trainer"], requiresApproval: false, highRisk: false },
  { actionId: "skill.run_sandbox", allowedRoles: ["admin", "capability_admin", "ai_trainer"], requiresApproval: false, highRisk: false },
  { actionId: "skill.approve", allowedRoles: ["admin", "capability_admin", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "skill.deprecate", allowedRoles: ["admin", "capability_admin"], requiresApproval: true, highRisk: true },
] as const;

// ---------- Runtime / Memory (from §6 high-risk catalog) ----------
export const RUNTIME_ACTION_PERMISSIONS: readonly ActionPermission[] = [
  { actionId: "runtime.restart", allowedRoles: ["admin", "system_operator"], requiresApproval: true, highRisk: true },
  { actionId: "runtime.stop", allowedRoles: ["admin", "system_operator", "risk_officer"], requiresApproval: true, highRisk: true },
  { actionId: "runtime.drain", allowedRoles: ["admin", "system_operator"], requiresApproval: true, highRisk: true },
] as const;

export const MEMORY_ACTION_PERMISSIONS: readonly ActionPermission[] = [
  { actionId: "memory.delete", allowedRoles: ["admin", "ai_trainer", "risk_officer"], requiresApproval: true, highRisk: true },
] as const;

// ---------- Index ----------
export const ALL_ACTION_PERMISSIONS: readonly ActionPermission[] = [
  ...STRATEGY_ACTION_PERMISSIONS,
  ...PERSONA_ACTION_PERMISSIONS,
  ...CAPITAL_ACTION_PERMISSIONS,
  ...CAPABILITY_ACTION_PERMISSIONS,
  ...RUNTIME_ACTION_PERMISSIONS,
  ...MEMORY_ACTION_PERMISSIONS,
];

const PERMISSION_INDEX: ReadonlyMap<string, ActionPermission> = new Map(
  ALL_ACTION_PERMISSIONS.map((p) => [p.actionId, p]),
);

export function getActionPermission(actionId: string): ActionPermission | undefined {
  return PERMISSION_INDEX.get(actionId);
}

export function canRoleInvoke(role: ManagementRole, actionId: string): boolean {
  const p = PERMISSION_INDEX.get(actionId);
  if (!p) return false;
  return p.allowedRoles.includes(role);
}

export function isHighRiskAction(actionId: string): boolean {
  return PERMISSION_INDEX.get(actionId)?.highRisk === true;
}
