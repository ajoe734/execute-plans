import { describe, it, expect } from "vitest";
import {
  strategyMachine,
  personaMachine,
  type StrategyState,
} from "@/lib/stateMachines";
import {
  nextTransitions,
  nextStates,
  findTransition,
  canTransition,
} from "@/lib/stateMachines/types";

describe("state machines", () => {
  it("strategy: scaffolded → replicated via run_replication", () => {
    const tr = findTransition(strategyMachine, "scaffolded", "run_replication");
    expect(tr?.to).toBe("replicated");
  });

  it("strategy: paper → live is high-risk and requires approval", () => {
    const tr = findTransition(strategyMachine, "paper", "promote_live");
    expect(tr?.requiresApproval).toBe(true);
    expect(tr?.risk).toBe("critical");
    expect(tr?.uiPattern).toBe("high_risk_modal");
  });

  it("strategy: live can rollback_to_paper, retire, mark_degraded", () => {
    const states = nextStates(strategyMachine, "live");
    expect(states).toEqual(expect.arrayContaining(["paper", "retired", "degraded", "replaced"]));
  });

  it("strategy: archive uses 'any' guard from any state", () => {
    const tr = findTransition(strategyMachine, "discovered" as StrategyState, "archive");
    expect(tr?.to).toBe("archived");
    expect(canTransition(strategyMachine, "live", "archived")).toBe(true);
  });

  it("strategy: discovered cannot jump straight to live", () => {
    expect(canTransition(strategyMachine, "discovered", "live" as StrategyState)).toBe(false);
  });

  it("persona: active → suspended is high-risk", () => {
    const tr = findTransition(personaMachine, "active", "suspend_persona");
    expect(tr?.risk).toBe("high");
    expect(tr?.requiresApproval).toBe(true);
  });

  it("nextTransitions returns only those originating from given state", () => {
    const ts = nextTransitions(strategyMachine, "paper");
    expect(ts.every((t) => t.from === "paper" || t.from === ("any" as StrategyState))).toBe(true);
  });
});
