import { describe, expect, it } from "vitest";
import type { Persona } from "@/lib/bff/types";
import { isCompletePaperBundle, repairStepFor } from "./PersonaOnboarding";

const persona = (overrides: Record<string, unknown> = {}) => ({
  id: "persona-1",
  name: "Paper Alpha",
  owner: "operator",
  updatedAt: "2026-07-11T00:00:00Z",
  state: "paper_running",
  risk: "low",
  archetype: "systematic",
  routedStrategies: 0,
  successRate: 0,
  ...overrides,
}) as unknown as Persona;

describe("PersonaOnboarding repair guard", () => {
  it("recognizes only a complete running paper bundle", () => {
    expect(isCompletePaperBundle(persona({ paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" }))).toBe(true);
    expect(isCompletePaperBundle(persona({ paperLedgerId: "ledger-1" }))).toBe(false);
    expect(isCompletePaperBundle(persona({ state: "approved", paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" }))).toBe(false);
  });

  it("opens a repair request at its failed setup step", () => {
    expect(repairStepFor("binding")).toBe(2);
    expect(repairStepFor("deployment_plan")).toBe(3);
    expect(repairStepFor("approval")).toBe(4);
    expect(repairStepFor("runtime_binding")).toBe(5);
    expect(repairStepFor(null)).toBe(1);
    expect(repairStepFor("unknown_step")).toBe(1);
  });
});
