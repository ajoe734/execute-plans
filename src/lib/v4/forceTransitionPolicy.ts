// Planner Response §E2 (2026-05-07) — Admin override / break-glass force-transition.
// Source: §6.E2.

export interface ForceTransitionRequest {
  entityType: string;
  entityId: string;
  fromState: string;
  toState: string;
  /** Min 80 chars per planner. */
  justification: string;
  /** At least 2 approvers for production / live-impacting actions. */
  approverIds: string[];
  expiresAt?: string;
  incidentId?: string;
  expectedVersion: number;
}

export interface ForceTransitionPolicy {
  minJustificationChars: number;
  minApproversForLiveImpact: number;
  requiredApproverRoles: readonly string[];
  requiresAudit: true;
  requiresPostmortemIfLiveImpact: true;
  prodFeatureFlag: "breakGlass";
}

export const DEFAULT_FORCE_TRANSITION_POLICY: ForceTransitionPolicy = {
  minJustificationChars: 80,
  minApproversForLiveImpact: 2,
  requiredApproverRoles: ["platform_admin", "risk_officer"],
  requiresAudit: true,
  requiresPostmortemIfLiveImpact: true,
  prodFeatureFlag: "breakGlass",
};

export type ForceTransitionValidation =
  | { ok: true }
  | { ok: false; reason: "JUSTIFICATION_TOO_SHORT" | "INSUFFICIENT_APPROVERS" | "MISSING_REQUIRED_ROLE" };

export function validateForceTransition(
  req: ForceTransitionRequest,
  approverRoles: Readonly<Record<string, readonly string[]>>,
  liveImpacting: boolean,
  policy: ForceTransitionPolicy = DEFAULT_FORCE_TRANSITION_POLICY,
): ForceTransitionValidation {
  if (req.justification.length < policy.minJustificationChars) {
    return { ok: false, reason: "JUSTIFICATION_TOO_SHORT" };
  }
  if (liveImpacting && req.approverIds.length < policy.minApproversForLiveImpact) {
    return { ok: false, reason: "INSUFFICIENT_APPROVERS" };
  }
  const allRoles = new Set<string>();
  for (const id of req.approverIds) for (const r of approverRoles[id] ?? []) allRoles.add(r);
  for (const required of policy.requiredApproverRoles) {
    if (!allRoles.has(required)) return { ok: false, reason: "MISSING_REQUIRED_ROLE" };
  }
  return { ok: true };
}

export const FORCE_TRANSITION_SOURCE = "planner-response-2026-05-07" as const;
