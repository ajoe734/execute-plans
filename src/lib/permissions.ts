// RBAC permission matrix — Part 1 §Roles, Part 6 §availableActions filtering.
// The BFF emits availableActions per object/state; the UI further filters by role.
//
// v3 §5 delegation (Pack A G02): when the action id is a v3-style dotted id
// (e.g. "strategy.deploy_live"), defer to the v3 truth table. Legacy short ids
// (e.g. "promote_live") continue to use ACTION_ROLES below for back-compat.
import type { UserRole } from "@/platform/store";
import { canRoleInvoke as v3Can, getActionPermission } from "@/lib/v3/permissions";
import type { ManagementRole } from "@/lib/v3/availableActions";

/** Action ids → roles allowed to invoke them. "*" means any authenticated role. */
const ACTION_ROLES: Record<string, UserRole[] | "*"> = {
  // Lifecycle
  edit: ["admin", "research_lead", "strategy_manager", "capability_admin", "ai_trainer"],
  delete: ["admin"],
  submit_review: ["admin", "research_lead", "strategy_manager", "capability_admin", "ai_trainer", "analyst"],
  approve: ["admin", "reviewer", "risk_officer", "research_lead"],
  reject: ["admin", "reviewer", "risk_officer", "research_lead"],

  // Deploy / promote
  deploy: ["admin", "system_operator", "strategy_manager"],
  deploy_paper: ["admin", "system_operator", "strategy_manager", "research_lead"],
  promote_live: ["admin", "system_operator"],
  promote_artifact: ["admin", "research_lead", "system_operator"],
  promote_best: ["admin", "research_lead", "ai_trainer"],
  rollback: ["admin", "system_operator", "risk_officer"],
  pause: ["admin", "system_operator", "risk_officer"],
  resume: ["admin", "system_operator"],
  retire: ["admin", "strategy_manager"],

  // Capital
  adjust_budget: ["admin", "capital_manager", "risk_officer"],
  rebalance: ["admin", "capital_manager"],
  freeze: ["admin", "capital_manager", "risk_officer"],
  unfreeze: ["admin", "capital_manager", "risk_officer"],
  apply: ["admin", "capital_manager", "system_operator"],
  simulate: "*",

  // Capability
  publish: ["admin", "capability_admin", "ai_trainer"],
  unpublish: ["admin", "capability_admin"],
  evaluate: ["admin", "ai_trainer", "research_lead"],
  fork: ["admin", "research_lead", "ai_trainer"],
  grant_env: ["admin", "capability_admin", "risk_officer"],
  revoke: ["admin", "capability_admin", "risk_officer"],
  deprecate: ["admin", "capability_admin"],
  restart: ["admin", "system_operator"],
  drain: ["admin", "system_operator"],

  // Channels / misc
  enable: ["admin", "system_operator", "capability_admin"],
  disable: ["admin", "system_operator", "capability_admin"],
  test_send: ["admin", "system_operator", "capability_admin"],
  archive: ["admin", "research_lead"],
  view_logs: "*",
  view_lineage: "*",
  run: ["admin", "research_lead", "ai_trainer", "analyst"],
};

export function canInvoke(role: UserRole, action: string): boolean {
  // v3 dotted action id → use v3 truth table when registered.
  if (action.includes(".") && getActionPermission(action)) {
    return v3Can(role as ManagementRole, action);
  }
  const allowed = ACTION_ROLES[action];
  if (!allowed) return true; // unknown action → don't block by default
  if (allowed === "*") return true;
  return allowed.includes(role);
}

/** Filter BFF-declared availableActions down to what the role may actually do. */
export function filterActions(role: UserRole, available: string[] | undefined): string[] {
  return (available ?? []).filter((a) => canInvoke(role, a));
}
