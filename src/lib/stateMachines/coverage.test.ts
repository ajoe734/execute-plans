import { describe, it, expect } from "vitest";
import {
  strategyMachine,
  personaMachine,
  capitalPoolMachine,
  rebalanceMachine,
  skillMachine,
  mcpToolMachine,
  incidentMachine,
} from "@/lib/stateMachines";
import {
  nextTransitions,
  nextStates,
  canTransition,
  findTransition,
} from "@/lib/stateMachines/types";

describe("state machine coverage (Part 7 §17)", () => {
  const machines = [
    strategyMachine, personaMachine, capitalPoolMachine, rebalanceMachine,
    skillMachine, mcpToolMachine, incidentMachine,
  ];

  it("every transition's `from` is a known state (or 'any')", () => {
    for (const m of machines) {
      const known = new Set<string>([...m.states, ...(m.branchStates ?? []), "any"]);
      for (const t of m.transitions) expect(known.has(t.from)).toBe(true);
    }
  });

  it("every transition's `to` is a known state", () => {
    for (const m of machines) {
      const known = new Set<string>([...m.states, ...(m.branchStates ?? [])]);
      for (const t of m.transitions) expect(known.has(t.to)).toBe(true);
    }
  });

  it("each canonical state has at least one inbound or outbound transition", () => {
    for (const m of machines) {
      for (const s of m.states) {
        const touched = m.transitions.some(
          (t) => t.from === s || t.to === s || t.from === "any",
        );
        expect(touched, `${m.name}:${s} has no transitions`).toBe(true);
      }
    }
  });

  it("rebalance follows the documented 4-stage canonical order", () => {
    // proposed → simulated → reviewed → applied
    expect(canTransition(rebalanceMachine, "proposed" as any, "simulated" as any)).toBe(true);
    expect(canTransition(rebalanceMachine, "simulated" as any, "reviewed" as any)).toBe(true);
    expect(canTransition(rebalanceMachine, "reviewed" as any, "applied" as any)).toBe(true);
  });

  it("incident: open → mitigated → resolved is a valid path", () => {
    expect(canTransition(incidentMachine, "open" as any, "mitigated" as any)).toBe(true);
    expect(canTransition(incidentMachine, "mitigated" as any, "resolved" as any)).toBe(true);
  });

  it("nextStates is a subset of nextTransitions targets", () => {
    for (const m of machines) {
      for (const s of m.states) {
        const ts = nextTransitions(m, s);
        const ns = nextStates(m, s);
        expect(new Set(ns)).toEqual(new Set(ts.map((t) => t.to)));
      }
    }
  });

  it("findTransition returns undefined for unknown action", () => {
    expect(findTransition(strategyMachine, "paper", "no_such_action")).toBeUndefined();
  });
});
