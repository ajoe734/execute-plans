// Planner Response §E11 (2026-05-07) — Reviewer / Approver quorum defaults.
// Source: §6.E11.

import type { Role } from "./roleCapabilities";
import type { RoleFamily } from "./twoManPolicy";

export type QuorumRiskClass =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "live_capital_impact"
  | "live_deployment";

export interface QuorumPolicy {
  minReviewers: number;
  distinctUser: boolean;
  distinctRoleFamily: boolean;
  /** Optional list of role families that must each contribute >= 1 signer. */
  requiredFamilies?: readonly RoleFamily[];
  maxExtensions: number;
  extensionHours: number;
}

export const QUORUM_POLICIES: Readonly<Record<QuorumRiskClass, QuorumPolicy>> = {
  low:                  { minReviewers: 1, distinctUser: false, distinctRoleFamily: false, maxExtensions: 1, extensionHours: 24 },
  medium:               { minReviewers: 1, distinctUser: false, distinctRoleFamily: false, maxExtensions: 1, extensionHours: 24 },
  high:                 { minReviewers: 2, distinctUser: true,  distinctRoleFamily: false, maxExtensions: 1, extensionHours: 24 },
  critical:             { minReviewers: 2, distinctUser: true,  distinctRoleFamily: true,  maxExtensions: 1, extensionHours: 24 },
  live_capital_impact:  { minReviewers: 2, distinctUser: true,  distinctRoleFamily: true,  requiredFamilies: ["risk", "capital"], maxExtensions: 1, extensionHours: 24 },
  live_deployment:      { minReviewers: 2, distinctUser: true,  distinctRoleFamily: true,  requiredFamilies: ["risk", "ops"],     maxExtensions: 1, extensionHours: 24 },
};

export interface QuorumSigner { userId: string; roles: readonly Role[]; }

export type QuorumOutcome =
  | { ok: true }
  | { ok: false; reason: "INSUFFICIENT" | "DUPLICATE_USER" | "MISSING_FAMILY" };

import { ROLE_FAMILY_OF } from "./twoManPolicy";

export function evaluateQuorum(signers: readonly QuorumSigner[], policy: QuorumPolicy): QuorumOutcome {
  if (signers.length < policy.minReviewers) return { ok: false, reason: "INSUFFICIENT" };
  if (policy.distinctUser) {
    const ids = signers.map((s) => s.userId);
    if (new Set(ids).size !== ids.length) return { ok: false, reason: "DUPLICATE_USER" };
  }
  if (policy.requiredFamilies && policy.requiredFamilies.length > 0) {
    const families = new Set<RoleFamily>();
    for (const s of signers) for (const r of s.roles) families.add(ROLE_FAMILY_OF[r]);
    for (const f of policy.requiredFamilies) if (!families.has(f)) return { ok: false, reason: "MISSING_FAMILY" };
  }
  return { ok: true };
}

export const REVIEWER_QUORUM_SOURCE = "planner-response-2026-05-07" as const;
