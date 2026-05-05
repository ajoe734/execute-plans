// v3 §8 availableActions Contract.
// Resolves G05 / G67. `availableActions` is ALWAYS ActionDescriptor[].

import type { PlatformEnvironment, TradingEnvironment } from "./environment";

export type EntityType =
  | "strategy" | "persona" | "capitalPool" | "rankingFormula"
  | "rebalance" | "evolution" | "experiment" | "deployment"
  | "tool" | "mcpServer" | "mcpTool" | "skill"
  | "memory" | "insight" | "review" | "incident" | "alert"
  | "runtime" | "channel" | "artifact" | "job";

export type ManagementRole =
  | "admin" | "research_lead" | "risk_officer" | "capital_manager"
  | "strategy_manager" | "system_operator" | "reviewer"
  | "capability_admin" | "ai_trainer" | "analyst" | "trader";

export interface ActionBlocker {
  reasonKey: string;
  reasonParams?: Record<string, string | number | boolean>;
  /** "permission" | "state" | "environment" | "approval" | "evidence" | "job" */
  category: "permission" | "state" | "environment" | "approval" | "evidence" | "job";
}

export interface ActionDescriptor {
  id: string;
  labelKey: string;
  entityType: EntityType;
  actionType: "query" | "command" | "job_command" | "approval_command" | "navigation";
  riskLevel: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  disabledReasonKey?: string;
  disabledReasonParams?: Record<string, string | number | boolean>;
  requiresApproval: boolean;
  requiresConfirmation: boolean;
  requiresMemo: boolean;
  allowedRoles: ManagementRole[];
  requiredEntityStatuses: string[];
  requiredPlatformEnvironments: PlatformEnvironment[];
  requiredTradingEnvironments: TradingEnvironment[];
  blockers: ActionBlocker[];
  commandEndpoint?: string;
  confirmEndpoint?: string;
}

/** Type guard — accepts new ActionDescriptor[] only. Used to migrate string[] callers. */
export function isActionDescriptorArray(v: unknown): v is ActionDescriptor[] {
  return Array.isArray(v) && v.every((x) => typeof x === "object" && x !== null && "id" in x && "actionType" in x);
}

/** Migration helper: lift legacy string[] into minimal ActionDescriptor[] for back-compat callers.
 *  NEW code MUST receive ActionDescriptor[] from BFF and never call this. */
export function liftLegacyActions(
  legacy: readonly string[] | undefined,
  entityType: EntityType,
): ActionDescriptor[] {
  return (legacy ?? []).map((id) => ({
    id, labelKey: `actions.${id}`, entityType,
    actionType: "command",
    riskLevel: "low",
    enabled: true,
    requiresApproval: false,
    requiresConfirmation: false,
    requiresMemo: false,
    allowedRoles: [],
    requiredEntityStatuses: [],
    requiredPlatformEnvironments: [],
    requiredTradingEnvironments: [],
    blockers: [],
  }));
}
