// Q8 + Q25 — Pure scorers, formulaVersion="v0-mock". Replaceable.
// Critical override: any critical open incident, emergency Sentinel finding, or
// hard risk breach forces critical regardless of numeric score.

import type { PersonaHealthInputs, StrategyHealthInputs } from "./types";
import type { HealthStatus } from "./enums";

export const HEALTH_FORMULA_VERSION = "v0-mock" as const;

export const PERSONA_WEIGHTS = {
  performance: 0.25,
  risk: 0.25,
  executionQuality: 0.20,
  decisionQuality: 0.15,
  policyCompliance: 0.10,
  sentinelPenalty: 0.05, // subtracted
} as const;

export const STRATEGY_WEIGHTS = {
  performance: 0.30,
  risk: 0.25,
  executionQuality: 0.20,
  lifecycleConsistency: 0.10,
  sentinelIncidentPenalty: 0.15, // subtracted
} as const;

export interface ScorerOptions {
  /** Force critical regardless of numeric score (Q8 override). */
  criticalOverride?: boolean;
}

function clamp01to100(n: number) {
  return Math.max(0, Math.min(100, n));
}

export function statusFromScore(score: number): HealthStatus {
  if (score >= 80) return "healthy";
  if (score >= 65) return "watch";
  if (score >= 45) return "degraded";
  return "critical";
}

export function computePersonaHealthScore(
  inputs: PersonaHealthInputs,
  opts: ScorerOptions = {},
): { score: number; status: HealthStatus; formulaVersion: typeof HEALTH_FORMULA_VERSION } {
  const w = PERSONA_WEIGHTS;
  const raw =
    inputs.performance * w.performance +
    inputs.risk * w.risk +
    inputs.executionQuality * w.executionQuality +
    inputs.decisionQuality * w.decisionQuality +
    inputs.policyCompliance * w.policyCompliance -
    inputs.sentinelPenalty * w.sentinelPenalty;
  const score = clamp01to100(raw);
  const status = opts.criticalOverride ? "critical" : statusFromScore(score);
  return { score, status, formulaVersion: HEALTH_FORMULA_VERSION };
}

export function computeStrategyHealthScore(
  inputs: StrategyHealthInputs,
  opts: ScorerOptions = {},
): { score: number; status: HealthStatus; formulaVersion: typeof HEALTH_FORMULA_VERSION } {
  const w = STRATEGY_WEIGHTS;
  const raw =
    inputs.performance * w.performance +
    inputs.risk * w.risk +
    inputs.executionQuality * w.executionQuality +
    inputs.lifecycleConsistency * w.lifecycleConsistency -
    inputs.sentinelIncidentPenalty * w.sentinelIncidentPenalty;
  const score = clamp01to100(raw);
  const status = opts.criticalOverride ? "critical" : statusFromScore(score);
  return { score, status, formulaVersion: HEALTH_FORMULA_VERSION };
}
