import { describe, it, expect } from "vitest";
import {
  strategyMachine,
  personaMachine,
  evolutionMachine,
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

  describe("evolutionMachine (U8B / D1 / D2 / D3)", () => {
    it("draft → under_review → active requires approval", () => {
      const rev = findTransition(evolutionMachine, "draft", "submit_evolution_review");
      expect(rev?.to).toBe("under_review");
      expect(rev?.requiresApproval).toBe(true);

      const app = findTransition(evolutionMachine, "under_review", "approve_program");
      expect(app?.to).toBe("active");
      expect(app?.requiresApproval).toBe(true);
    });

    it("active ↔ paused via pause_program / resume_program", () => {
      const pause = findTransition(evolutionMachine, "active", "pause_program");
      expect(pause?.to).toBe("paused");
      expect(pause?.risk).toBe("low");

      const resume = findTransition(evolutionMachine, "paused", "resume_program");
      expect(resume?.to).toBe("active");
      expect(resume?.risk).toBe("low");
    });

    it("active and paused can stop; stop is high-risk with high_risk_modal", () => {
      const stopFromActive = findTransition(evolutionMachine, "active", "stop");
      expect(stopFromActive?.to).toBe("stopped");
      expect(stopFromActive?.risk).toBe("high");
      expect(stopFromActive?.uiPattern).toBe("high_risk_modal");

      const stopFromPaused = findTransition(evolutionMachine, "paused", "stop");
      expect(stopFromPaused?.to).toBe("stopped");
      expect(stopFromPaused?.risk).toBe("high");
      expect(stopFromPaused?.uiPattern).toBe("high_risk_modal");
    });

    it("stopped strictly refuses resume_program (D1 stop irreversibility)", () => {
      expect(canTransition(evolutionMachine, "stopped", "active")).toBe(false);
      expect(findTransition(evolutionMachine, "stopped", "resume_program")).toBeUndefined();
    });

    it("retire_program is valid from both completed and stopped states", () => {
      const retFromCompleted = findTransition(evolutionMachine, "completed", "retire_program");
      expect(retFromCompleted?.to).toBe("retired");

      const retFromStopped = findTransition(evolutionMachine, "stopped", "retire_program");
      expect(retFromStopped?.to).toBe("retired");
    });
  });
});
