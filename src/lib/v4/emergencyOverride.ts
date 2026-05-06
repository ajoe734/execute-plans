// v4 / Pack C §C016 — Emergency override grant.

import type { Role } from "./permissionsMatrix";

export interface EmergencyOverrideGrant {
  overrideId: string;
  incidentId: string;
  grantedBy: "admin";
  approvers: Array<{ role: Extract<Role, "risk_officer" | "system_operator">; userId: string }>;
  scope: { entityType: string; entityId: string; actions: string[] };
  /** Min 80 chars. */
  justification: string;
  /** ISO; max now + 4h. */
  expiresAt: string;
  auditEventId: string;
}

export const EMERGENCY_OVERRIDE_MAX_TTL_MS = 4 * 60 * 60 * 1000;

export function canTriggerEmergencyOverride(ctx: {
  incidentSeverity?: "low" | "medium" | "high" | "critical";
  runtimeStatus?: "healthy" | "degraded" | "unhealthy";
}): boolean {
  if (ctx.incidentSeverity === "high" || ctx.incidentSeverity === "critical") return true;
  if (ctx.runtimeStatus === "degraded") return true;
  return false;
}

export function validateOverride(grant: EmergencyOverrideGrant, now: Date = new Date()): string | null {
  if (grant.justification.length < 80) return "justification too short (min 80 chars)";
  const expires = new Date(grant.expiresAt).getTime();
  if (expires - now.getTime() > EMERGENCY_OVERRIDE_MAX_TTL_MS) return "expiresAt exceeds 4h max";
  if (grant.approvers.length < 1) return "missing approver";
  return null;
}
