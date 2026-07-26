// MGMT-PERF-IA-005 — shared governance decision state vocabulary.
//
// The BFF's `HumanInboxItem.status` is a free-form string (see
// src/lib/v5/management/humanInbox.ts) and `Rebalance`/`CapitalPool`
// only carry the 6-value LifecycleState (draft/review/approved/deployed/
// paused/retired — src/lib/bff/types.ts). Neither models the full
// recommendation/review/approval/rejection/expiry/blocked/applied/
// superseded vocabulary directly, so this maps the real fields we do have
// onto that vocabulary instead of inventing new backend states.
export type GovernanceDecisionState =
  | "recommendation"
  | "review"
  | "approval"
  | "rejection"
  | "expiry"
  | "blocked"
  | "applied"
  | "superseded";

export const GOVERNANCE_DECISION_STATES: readonly GovernanceDecisionState[] = [
  "recommendation", "review", "approval", "rejection", "expiry", "blocked", "applied", "superseded",
] as const;

const STATUS_ALIASES: Record<string, GovernanceDecisionState> = {
  draft: "recommendation",
  recommendation: "recommendation",
  recommended: "recommendation",
  pending: "review",
  queued: "review",
  review: "review",
  in_review: "review",
  under_review: "review",
  approve: "approval",
  approved: "approval",
  reject: "rejection",
  rejected: "rejection",
  denied: "rejection",
  expire: "expiry",
  expired: "expiry",
  ttl_expired: "expiry",
  timed_out: "expiry",
  blocked: "blocked",
  applied: "applied",
  deployed: "applied",
  executed: "applied",
  superseded: "superseded",
  replaced: "superseded",
  supersededby: "superseded",
};

interface GovernanceDecisionStateInput {
  status?: string;
  canProceed?: boolean;
  canDecide?: boolean;
  blockingReasons?: string[];
}

/** Never fabricates a state the underlying item does not report: blocked is
 *  only derived from the real `canProceed`/`blockingReasons` fields, and
 *  every other state comes from the BFF's own `status` string via a known
 *  alias — an unrecognized status falls back to "review" (still decidable)
 *  rather than silently becoming a state that was never actually set. */
export function deriveGovernanceDecisionState(item: GovernanceDecisionStateInput): GovernanceDecisionState {
  if (item.canProceed === false && (item.blockingReasons?.length ?? 0) > 0) return "blocked";
  const raw = (item.status ?? "").trim().toLowerCase();
  if (raw && STATUS_ALIASES[raw]) return STATUS_ALIASES[raw];
  return item.canDecide === false ? "recommendation" : "review";
}

export function governanceDecisionStateLabel(
  state: GovernanceDecisionState,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return t(`governanceDecisions.states.${state}`, { defaultValue: state });
}
