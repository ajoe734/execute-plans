// v4 / Pack C §C020–C023 — Complete high-risk action catalog + memo schema + cooldown.

export type MemoReferenceType = "incident" | "change" | "review" | "rebalance" | "migration" | "none";

export interface HighRiskMemo {
  text: string;
  format: "text" | "markdown";
  referenceType: MemoReferenceType;
  referenceId?: string;
}

export interface HighRiskAction {
  entity: string;
  action: string;
  requiresApproval: true;
  twoMan: boolean;
  confirmTtlSec: 60 | 120;
  cooldownSec: number;
  memoMinLen: number;
  memoRequireRef: "review_or_change" | "change" | "incident_or_change" | "incident" | "rebalance" | "rebalance_or_change" | "incident_or_migration";
}

export const HIGH_RISK_CATALOG: readonly HighRiskAction[] = [
  { entity: "strategy", action: "promote_live", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 80, memoRequireRef: "review_or_change" },
  { entity: "strategy", action: "retire_strategy", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 60, memoRequireRef: "change" },
  { entity: "deployment", action: "rollback_deployment", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 80, memoRequireRef: "incident_or_change" },
  { entity: "deployment", action: "emergency_kill", requiresApproval: true, twoMan: true, confirmTtlSec: 60, cooldownSec: 600, memoMinLen: 100, memoRequireRef: "incident" },
  { entity: "deployment", action: "pause_deployment", requiresApproval: true, twoMan: false, confirmTtlSec: 120, cooldownSec: 120, memoMinLen: 50, memoRequireRef: "incident_or_change" },
  { entity: "deployment", action: "resume_deployment", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 120, memoMinLen: 50, memoRequireRef: "incident_or_change" },
  { entity: "capital", action: "apply_rebalance", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 900, memoMinLen: 100, memoRequireRef: "rebalance" },
  { entity: "capital", action: "allocation_override", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 900, memoMinLen: 100, memoRequireRef: "rebalance_or_change" },
  { entity: "ranking", action: "activate_formula", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 600, memoMinLen: 80, memoRequireRef: "change" },
  { entity: "persona", action: "activate_route_policy", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 80, memoRequireRef: "change" },
  { entity: "persona", action: "rollback_route_policy", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 80, memoRequireRef: "incident_or_change" },
  { entity: "mcp", action: "grant_mcp_tool", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 80, memoRequireRef: "change" },
  { entity: "mcp", action: "production_grant", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 600, memoMinLen: 100, memoRequireRef: "change" },
  { entity: "skill", action: "approve_skill", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 80, memoRequireRef: "change" },
  { entity: "skill", action: "assign_skill_to_persona", requiresApproval: true, twoMan: false, confirmTtlSec: 120, cooldownSec: 120, memoMinLen: 60, memoRequireRef: "change" },
  { entity: "tool", action: "disable_tool", requiresApproval: true, twoMan: false, confirmTtlSec: 120, cooldownSec: 120, memoMinLen: 50, memoRequireRef: "incident_or_change" },
  { entity: "runtime", action: "restart_runtime", requiresApproval: true, twoMan: false, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 60, memoRequireRef: "incident_or_change" },
  { entity: "runtime", action: "drain_runtime", requiresApproval: true, twoMan: true, confirmTtlSec: 120, cooldownSec: 300, memoMinLen: 80, memoRequireRef: "incident_or_change" },
  { entity: "state_machine", action: "force_transition", requiresApproval: true, twoMan: true, confirmTtlSec: 60, cooldownSec: 600, memoMinLen: 120, memoRequireRef: "incident_or_migration" },
] as const;

export function lookupHighRisk(entity: string, action: string): HighRiskAction | undefined {
  return HIGH_RISK_CATALOG.find((a) => a.entity === entity && a.action === action);
}

const REF_REQUIRED: Record<HighRiskAction["memoRequireRef"], MemoReferenceType[]> = {
  review_or_change: ["review", "change"],
  change: ["change"],
  incident_or_change: ["incident", "change"],
  incident: ["incident"],
  rebalance: ["rebalance"],
  rebalance_or_change: ["rebalance", "change"],
  incident_or_migration: ["incident", "migration"],
};

export function validateHighRiskMemo(rule: HighRiskAction, memo: HighRiskMemo): string | null {
  if (memo.text.length < rule.memoMinLen) return `memo too short (min ${rule.memoMinLen} chars)`;
  if (memo.text.length > 2000) return "memo too long (max 2000 chars)";
  const allowed = REF_REQUIRED[rule.memoRequireRef];
  if (!allowed.includes(memo.referenceType)) return `referenceType must be one of: ${allowed.join("|")}`;
  if (memo.referenceType !== "none" && !memo.referenceId) return "referenceId required";
  return null;
}
