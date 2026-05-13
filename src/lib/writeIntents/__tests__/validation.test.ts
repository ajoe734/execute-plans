import { describe, it, expect } from "vitest";
import { validateCreate } from "@/lib/writeIntents/validation";
import { buildEntity } from "@/lib/writeIntents/createDefaults";

describe("writeIntents validation", () => {
  it("strategy requires alpha + capitalPoolId + personaIds", () => {
    const r = validateCreate("strategy", { name: "abc", alpha: "", capitalPoolId: "", personaIds: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.alpha).toBeDefined();
    expect(r.errors.capitalPoolId).toBeDefined();
    expect(r.errors.personaIds).toBeDefined();
  });
  it("strategy passes with valid input", () => {
    const r = validateCreate("strategy", {
      name: "Momentum X", alpha: "alpha-mom", capitalPoolId: "cp_1", personaIds: ["p1"],
    });
    expect(r.ok).toBe(true);
  });
  it("capitalPool riskBudget must be in (0,1]", () => {
    const r = validateCreate("capitalPool", {
      name: "Pool A", currency: "USD", allocated: 1000, riskBudget: 1.5,
    });
    expect(r.errors.riskBudget).toBeDefined();
  });
  it("rebalance quarter format YYYY-Qn", () => {
    const bad = validateCreate("rebalance", { name: "Q1 plan", quarter: "2026Q1", targetPoolId: "cp_1" });
    expect(bad.errors.quarter).toBeDefined();
    const good = validateCreate("rebalance", { name: "Q1 plan", quarter: "2026-Q1", targetPoolId: "cp_1" });
    expect(good.ok).toBe(true);
  });
  it("name length 3-120", () => {
    const r = validateCreate("persona", { name: "ab", archetype: "trader" });
    expect(r.errors.name).toBeDefined();
  });
  it("persona rejects unknown role type and initial mode", () => {
    const r = validateCreate("persona", {
      name: "Persona X",
      archetype: "desk" as never,
      initialMode: "live" as never,
    });
    expect(r.errors.archetype).toBe("invalid option");
    expect(r.errors.initialMode).toBe("invalid option");
  });
  it("persona keeps shadow as execution mode instead of lifecycle status", () => {
    const shadow = buildEntity("persona", {
      name: "Persona X",
      archetype: "trader",
      initialMode: "shadow",
    });
    expect(shadow.state).toBe("draft");
    expect(shadow.lifecycleStatus).toBe("draft");
    expect(shadow.executionMode).toBe("shadow");

    const suspended = buildEntity("persona", {
      name: "Persona Y",
      archetype: "risk",
      initialMode: "suspended",
    });
    expect(suspended.state).toBe("paused");
    expect(suspended.lifecycleStatus).toBe("suspended");
    expect(suspended.executionMode).toBe("suspended");
  });
});
