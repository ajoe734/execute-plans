// Pack F 短板 4 — parametric validation matrix across all 9 entities.
import { describe, it, expect } from "vitest";
import { validateCreate } from "@/lib/writeIntents/validation";
import type { CreatableEntity, CreateInputMap } from "@/lib/writeIntents/types";

type Case<K extends CreatableEntity> = {
  entity: K;
  valid: CreateInputMap[K];
  invalid: CreateInputMap[K];
  expectErrorKey: keyof CreateInputMap[K] | "name";
};

const cases: Case<CreatableEntity>[] = [
  {
    entity: "strategy",
    valid: { name: "OK Strategy", alpha: "a-mom", capitalPoolId: "cp_1", personaIds: ["p1"] },
    invalid: { name: "OK Strategy", alpha: "", capitalPoolId: "cp_1", personaIds: ["p1"] },
    expectErrorKey: "alpha",
  },
  {
    entity: "persona",
    valid: { name: "OK Persona", archetype: "trader" },
    invalid: { name: "OK Persona", archetype: "" },
    expectErrorKey: "archetype",
  },
  {
    entity: "capitalPool",
    valid: { name: "OK Pool", currency: "USD", allocated: 1000, riskBudget: 0.2 },
    invalid: { name: "OK Pool", currency: "USD", allocated: 0, riskBudget: 0.2 },
    expectErrorKey: "allocated",
  },
  {
    entity: "rankingFormula",
    valid: { name: "OK Formula", expression: "0.5*sharpe" },
    invalid: { name: "OK Formula", expression: "" },
    expectErrorKey: "expression",
  },
  {
    entity: "rebalance",
    valid: { name: "OK Rebalance", quarter: "2026-Q2", targetPoolId: "cp_1" },
    invalid: { name: "OK Rebalance", quarter: "bad", targetPoolId: "cp_1" },
    expectErrorKey: "quarter",
  },
  {
    entity: "deployment",
    valid: { name: "OK Deploy", strategyId: "s1", artifactId: "a1", target: "research", version: "v1" },
    invalid: { name: "OK Deploy", strategyId: "", artifactId: "a1", target: "research", version: "v1" },
    expectErrorKey: "strategyId",
  },
  {
    entity: "evolutionProgram",
    valid: { name: "OK Evo", parentAlpha: "alpha-x", population: 10 },
    invalid: { name: "OK Evo", parentAlpha: "alpha-x", population: 0 },
    expectErrorKey: "population",
  },
  {
    entity: "researchExperiment",
    valid: { name: "OK Research", hypothesis: "h", metric: "sharpe" },
    invalid: { name: "OK Research", hypothesis: "", metric: "sharpe" },
    expectErrorKey: "hypothesis",
  },
  {
    entity: "artifact",
    valid: { name: "OK Artifact", kind: "model", version: "v1" },
    invalid: { name: "OK Artifact", kind: "model", version: "" },
    expectErrorKey: "version",
  },
];

describe("writeIntents validation — parametric matrix (9 entities)", () => {
  for (const c of cases) {
    it(`${c.entity} accepts a valid input`, () => {
      const r = validateCreate(c.entity, c.valid as never);
      expect(r.ok).toBe(true);
      expect(Object.keys(r.errors)).toHaveLength(0);
    });
    it(`${c.entity} rejects invalid input on key=${String(c.expectErrorKey)}`, () => {
      const r = validateCreate(c.entity, c.invalid as never);
      expect(r.ok).toBe(false);
      expect(r.errors[String(c.expectErrorKey)]).toBeDefined();
    });
    it(`${c.entity} flags missing/short name`, () => {
      const bad = { ...(c.valid as Record<string, unknown>), name: "ab" };
      const r = validateCreate(c.entity, bad as never);
      expect(r.errors.name).toBeDefined();
    });
  }
});
