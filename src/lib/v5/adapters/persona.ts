// Q4 — seed.persona → v5 PersonaExecutionHealth. Read-only over seed; honours overlay.

import type { Persona, Alert } from "@/lib/bff/types";
import { computePersonaHealthScore } from "../health";
import { v5ActionOverlay } from "../overlay";
import type { PersonaExecutionHealth } from "../types";
import type { AutonomyMode } from "../enums";

/** Q4 mapping table: seed lifecycle/state → canonical v5 mode. */
function mapStateToMode(state: string): AutonomyMode {
  switch (state) {
    case "deployed":
    case "live":
    case "active":
    case "approved":
      return "live";
    case "paper":
      return "paper";
    case "draft":
    case "review":
    case "shadow":
      return "shadow";
    default:
      return "suspended";
  }
}

function riskScore(persona: Persona): number {
  switch (persona.risk) {
    case "low": return 90;
    case "medium": return 70;
    case "high": return 45;
    case "critical": return 25;
  }
}

export function adaptPersonaHealth(
  persona: Persona,
  ctx: { alerts?: Alert[] } = {},
): PersonaExecutionHealth {
  const overlay = v5ActionOverlay.getPersona(persona.id);
  const baseMode = mapStateToMode(persona.state);
  const mode: AutonomyMode = overlay?.forcedMode ?? baseMode;

  const sentinelPenalty = (ctx.alerts ?? []).filter(
    (a) => a.relatedTarget === persona.id && (a.severity === "high" || a.severity === "critical"),
  ).length * 25;

  const inputs = {
    performance: Math.round(persona.successRate * 100),
    risk: riskScore(persona),
    executionQuality: 80,
    decisionQuality: Math.round(persona.successRate * 100),
    policyCompliance: 90,
    sentinelPenalty: Math.min(100, sentinelPenalty),
  };

  const criticalOverride =
    persona.risk === "critical" ||
    (ctx.alerts ?? []).some((a) => a.relatedTarget === persona.id && a.severity === "critical");

  const { score, status, formulaVersion } = computePersonaHealthScore(inputs, { criticalOverride });

  return {
    personaId: persona.id,
    personaName: persona.name,
    mode,
    status,
    score,
    formulaVersion,
    inputs,
    suspendedReason: mode === "suspended" ? overlay?.reason ?? "seed-lifecycle" : undefined,
    routedStrategies: persona.routedStrategies,
    openFindings: (ctx.alerts ?? []).filter((a) => a.relatedTarget === persona.id && !a.acknowledged).length,
    updatedAt: persona.updatedAt,
  };
}
