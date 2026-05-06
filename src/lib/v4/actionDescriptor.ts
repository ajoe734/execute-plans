// v4 / Pack C §C014–C015 — ActionDescriptor (group/order/disabledReasonCode/ttl/cooldown/idempotency/two-man).
// SUPERSEDES src/lib/v3/availableActions.ts ActionDescriptor.

export type ActionGroup = "primary" | "secondary" | "destructive";

export type DisabledReasonCode =
  | "missing_role" | "invalid_state" | "wrong_environment" | "approval_required"
  | "confirm_token_required" | "two_man_required" | "cooldown_active"
  | "blocked_by_incident" | "blocked_by_policy" | "stale_version";

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type Environment = "research" | "paper" | "live";

export interface ActionDescriptor {
  id: string;
  entityType: string;
  labelKey: string;
  group: ActionGroup;
  order: number;
  enabled: boolean;
  disabledReasonCode?: DisabledReasonCode;
  /** `actions.<entity>.<action>.disabled.<reasonCode>`. */
  disabledReasonI18nKey?: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  requiresConfirmToken: boolean;
  requiresTwoMan: boolean;
  requiresEnv?: Environment;
  ttlSec?: number;
  cooldownSec?: number;
  idempotencyKeyRequired: boolean;
}

const GROUP_RANK: Record<ActionGroup, number> = { primary: 0, secondary: 1, destructive: 2 };

/** Pack C §C014 ordering: group then `order` ascending; destructive last. */
export function sortActions(actions: ActionDescriptor[]): ActionDescriptor[] {
  return [...actions].sort((a, b) =>
    GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.order - b.order || a.id.localeCompare(b.id),
  );
}

export function disabledI18nKey(entity: string, action: string, code: DisabledReasonCode): string {
  return `actions.${entity}.${action}.disabled.${code}`;
}
