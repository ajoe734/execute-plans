// Planner Response §B2 / D12 (2026-05-07) — canonical Role × Capability bundle.
// Capabilities are the source of truth; roles are UI grouping + default bundle hints.
// Source: .lovable/feedback/2026-05-07-planner-response/Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md §B2

export type Capability = `${string}.${string}` | `${string}.*` | "*";

export type Role =
  | "platform_admin"
  | "portfolio_manager"
  | "research_lead"
  | "ops"
  | "viewer"
  | "admin"
  | "risk_officer"
  | "capital_manager"
  | "strategy_manager"
  | "system_operator"
  | "reviewer"
  | "capability_admin";

export const ROLES: readonly Role[] = [
  "platform_admin", "portfolio_manager", "research_lead", "ops", "viewer",
  "admin", "risk_officer", "capital_manager", "strategy_manager",
  "system_operator", "reviewer", "capability_admin",
] as const;

export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  platform_admin: ["*"],
  admin: ["*"],

  portfolio_manager: [
    "capital.*", "rebalance.*", "ranking.read", "ranking.publish",
    "approval.read", "metric.read",
  ],

  research_lead: [
    "strategy.view", "strategy.create", "strategy.edit_spec", "strategy.run_replication",
    "experiment.*", "artifact.*", "agora.signal.read", "agora.journal.read",
    "evolution.*", "ranking.read",
  ],

  ops: [
    "runtime.*", "job.*",
    "deployment.read", "deployment.execute", "deployment.rollback",
    "incident.mitigate", "audit.read",
  ],

  viewer: [
    "strategy.view", "persona.view", "deployment.read",
    "risk.alert.read", "metric.read",
  ],

  risk_officer: [
    "risk.*", "risk.alert.read", "risk.incident.read", "incident.*",
    "approval.read", "approval.two_man.sign",
    "deployment.rollback", "policy.read", "policy.review", "audit.read",
  ],

  capital_manager: [
    "capital.*", "rebalance.*", "allocation.*",
    "approval.read", "approval.two_man.sign", "metric.read",
  ],

  strategy_manager: [
    "strategy.*", "deployment.read", "deployment.request",
    "ranking.read", "rebalance.read", "artifact.read",
  ],

  system_operator: [
    "runtime.*", "job.*",
    "deployment.execute", "deployment.pause", "deployment.resume", "deployment.rollback",
    "mcp.*", "tool.*",
  ],

  reviewer: [
    "approval.read", "approval.review", "approval.two_man.sign",
    "strategy.approve_review", "artifact.promote", "memory.review",
  ],

  capability_admin: [
    "tool.*", "mcp.*", "skill.*", "channel.*",
    "policy.route", "capability.*",
  ],
};

/** Canonical wildcard-aware capability check. */
export function capabilityMatches(granted: Capability, required: string): boolean {
  if (granted === "*") return true;
  if (granted === required) return true;
  if (granted.endsWith(".*")) {
    const prefix = granted.slice(0, -1); // keeps trailing dot
    return required.startsWith(prefix);
  }
  return false;
}

export function hasCapability(granted: readonly Capability[], required: string): boolean {
  for (const g of granted) if (capabilityMatches(g, required)) return true;
  return false;
}

/** Resolve role bundle into a flat capability list (deduped). */
export function capabilitiesForRoles(roles: readonly Role[]): readonly Capability[] {
  const set = new Set<Capability>();
  for (const r of roles) for (const c of ROLE_CAPABILITIES[r] ?? []) set.add(c);
  return [...set];
}

/** Conflict rule: if capabilities present, they win; role is fallback only. */
export function effectiveCapabilities(
  capabilities: readonly Capability[] | undefined,
  roles: readonly Role[] | undefined,
): readonly Capability[] {
  if (capabilities && capabilities.length > 0) return capabilities;
  if (roles && roles.length > 0) return capabilitiesForRoles(roles);
  return [];
}

export const ROLE_CAPABILITIES_SOURCE = "planner-response-2026-05-07" as const;
