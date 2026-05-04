import { describe, it, expect } from "vitest";
import {
  strategyMachine,
  personaMachine,
  capitalPoolMachine,
  rebalanceMachine,
  skillMachine,
  mcpServerMachine,
  toolMachine,
  incidentMachine,
  jobMachine,
  approvalMachine,
  deploymentMachine,
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
    skillMachine, mcpServerMachine, toolMachine, incidentMachine,
    jobMachine, approvalMachine, deploymentMachine,
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

  it("rebalance covers the canonical 9-stage workflow", () => {
    const order = ["draft", "metrics_freezing", "metrics_frozen",
      "ranking_calculated", "simulation_ready", "under_review",
      "approved", "scheduled", "applied"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(canTransition(rebalanceMachine, order[i] as any, order[i + 1] as any)).toBe(true);
    }
  });

  it("incident: assigned → investigating → mitigation → mitigated path", () => {
    expect(canTransition(incidentMachine, "assigned" as any, "investigating" as any)).toBe(true);
    expect(canTransition(incidentMachine, "investigating" as any, "mitigation_in_progress" as any)).toBe(true);
    expect(canTransition(incidentMachine, "mitigation_in_progress" as any, "mitigated" as any)).toBe(true);
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
