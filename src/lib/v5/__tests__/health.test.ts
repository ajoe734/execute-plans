import { describe, it, expect } from "vitest";
import {
  computePersonaHealthScore, computeStrategyHealthScore, statusFromScore,
  HEALTH_FORMULA_VERSION, PERSONA_WEIGHTS, STRATEGY_WEIGHTS,
} from "@/lib/v5/health";

describe("v5 health scorer (Q8/Q25)", () => {
  it("formulaVersion is v0-mock", () => {
    expect(HEALTH_FORMULA_VERSION).toBe("v0-mock");
  });

  it("persona weights sum to 1 (additive 95 + penalty 5)", () => {
    const additive = PERSONA_WEIGHTS.performance + PERSONA_WEIGHTS.risk + PERSONA_WEIGHTS.executionQuality + PERSONA_WEIGHTS.decisionQuality + PERSONA_WEIGHTS.policyCompliance;
    expect(additive + PERSONA_WEIGHTS.sentinelPenalty).toBeCloseTo(1, 5);
  });

  it("strategy weights sum to 1", () => {
    const additive = STRATEGY_WEIGHTS.performance + STRATEGY_WEIGHTS.risk + STRATEGY_WEIGHTS.executionQuality + STRATEGY_WEIGHTS.lifecycleConsistency;
    expect(additive + STRATEGY_WEIGHTS.sentinelIncidentPenalty).toBeCloseTo(1, 5);
  });

  it("thresholds match disposition", () => {
    expect(statusFromScore(80)).toBe("healthy");
    expect(statusFromScore(79)).toBe("watch");
    expect(statusFromScore(65)).toBe("watch");
    expect(statusFromScore(64)).toBe("degraded");
    expect(statusFromScore(45)).toBe("degraded");
    expect(statusFromScore(44)).toBe("critical");
  });

  it("persona deterministic", () => {
    const r = computePersonaHealthScore({
      performance: 90, risk: 90, executionQuality: 90,
      decisionQuality: 90, policyCompliance: 90, sentinelPenalty: 0,
    });
    expect(r.score).toBeCloseTo(85.5, 1);
    expect(r.status).toBe("healthy");
  });

  it("critical override forces critical regardless of score", () => {
    const r = computePersonaHealthScore({
      performance: 100, risk: 100, executionQuality: 100,
      decisionQuality: 100, policyCompliance: 100, sentinelPenalty: 0,
    }, { criticalOverride: true });
    expect(r.score).toBeGreaterThan(80);
    expect(r.status).toBe("critical");
  });

  it("strategy scorer subtracts incident penalty", () => {
    const a = computeStrategyHealthScore({ performance: 80, risk: 80, executionQuality: 80, lifecycleConsistency: 80, sentinelIncidentPenalty: 0 });
    const b = computeStrategyHealthScore({ performance: 80, risk: 80, executionQuality: 80, lifecycleConsistency: 80, sentinelIncidentPenalty: 100 });
    expect(a.score).toBeGreaterThan(b.score);
  });
});
