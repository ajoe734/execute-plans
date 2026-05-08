// Planner Response §C2 / D35 (2026-05-07) — Two-man distinct approval policy.
// Source: §4.C2/D35.

import type { Role } from "./roleCapabilities";

export type RoleFamily =
  | "risk"
  | "ops"
  | "capital"
  | "research"
  | "strategy"
  | "admin"
  | "reviewer"
  | "capability";

export const ROLE_FAMILY_OF: Readonly<Record<Role, RoleFamily>> = {
  platform_admin: "admin",
  admin: "admin",
  portfolio_manager: "capital",
  capital_manager: "capital",
  research_lead: "research",
  strategy_manager: "strategy",
  ops: "ops",
  system_operator: "ops",
  risk_officer: "risk",
  reviewer: "reviewer",
  capability_admin: "capability",
  viewer: "admin",
};

export interface TwoManSignature {
  approverId: string;
  approverRoles: readonly Role[];
  signedAt: string;
}

export interface TwoManPolicy {
  /** Requires distinct user IDs (always true). */
  distinctUser: true;
  /** When true, requires distinct role family (high-risk production actions). */
  distinctRoleFamily: boolean;
  /** Requester (originator) cannot sign. */
  requesterMayNotSign: true;
}

export const DEFAULT_TWO_MAN_POLICY: TwoManPolicy = {
  distinctUser: true,
  distinctRoleFamily: false,
  requesterMayNotSign: true,
};

export const HIGH_RISK_TWO_MAN_POLICY: TwoManPolicy = {
  distinctUser: true,
  distinctRoleFamily: true,
  requesterMayNotSign: true,
};

export type TwoManCheckOutcome =
  | { ok: true }
  | { ok: false; reason: "REQUESTER_SIGNED" | "DUPLICATE_USER" | "SAME_ROLE_FAMILY" | "INSUFFICIENT_SIGNERS" };

export function evaluateTwoMan(args: {
  requesterId: string;
  signatures: readonly TwoManSignature[];
  policy?: TwoManPolicy;
}): TwoManCheckOutcome {
  const policy = args.policy ?? DEFAULT_TWO_MAN_POLICY;
  if (args.signatures.length < 2) return { ok: false, reason: "INSUFFICIENT_SIGNERS" };
  const ids = args.signatures.map((s) => s.approverId);
  if (ids.includes(args.requesterId)) return { ok: false, reason: "REQUESTER_SIGNED" };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "DUPLICATE_USER" };
  if (policy.distinctRoleFamily) {
    const families = args.signatures.map((s) => primaryFamily(s.approverRoles));
    if (new Set(families).size < 2) return { ok: false, reason: "SAME_ROLE_FAMILY" };
  }
  return { ok: true };
}

function primaryFamily(roles: readonly Role[]): RoleFamily | "admin" {
  // Prefer non-admin family if any.
  for (const r of roles) {
    const f = ROLE_FAMILY_OF[r];
    if (f && f !== "admin") return f;
  }
  return "admin";
}

export const TWO_MAN_POLICY_SOURCE = "planner-response-2026-05-07" as const;
