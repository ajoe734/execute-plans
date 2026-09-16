import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import {
  buildRunActionCommand,
  resumeEvolutionProgram,
  pauseEvolutionProgram,
  stopEvolutionProgram,
  freezeGeneration,
  unfreezeGeneration,
  promoteCandidate,
  createEvolutionProgramConstraint,
  createEvolutionConstraint,
  writes,
} from "@/lib/bff-v1/writes";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { BffError } from "@/lib/bff-v1";

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

describe("evolution lifecycle write actions & command payload wiring", () => {
  afterEach(() => {
    delete process.env.VITE_BFF_FALLBACK;
    delete process.env.VITE_BFF_STRICT_WRITES;
    delete process.env.VITE_BFF_REAL_WRITES;
    liveStatus._reset();
  });

  describe("buildRunActionCommand evolution contract", () => {
    it("create_constraint nests domain fields in params.payload and aliases value <-> expression", () => {
      const envelope = buildRunActionCommand(
        {
          kind: "Evolution",
          id: "prog-001",
          action: "create_constraint",
          memo: "max_drawdown <= 0.2",
          params: { name: "max_drawdown <= 0.2", operator: "<=", expression: "0.2" },
          payload: { name: "max_drawdown <= 0.2", operator: "<=", expression: "0.2", scope: "global" },
        },
        {},
      );

      expect(envelope.command).toBe("EvolutionProgramAction");
      expect(envelope.target).toEqual({ type: "EvolutionProgram", id: "prog-001" });
      expect(envelope.action).toBe("create_constraint");

      const params = envelope.params as Record<string, any>;
      expect(params.action_id).toBe("create_constraint");
      expect(params.entity_type).toBe("evolution-program");
      expect(params.entity_id).toBe("prog-001");
      expect(params.name).toBe("max_drawdown <= 0.2");
      expect(params.operator).toBe("<=");
      expect(params.value).toBe("0.2");
      expect(params.expression).toBe("0.2");

      expect(params.payload).toBeDefined();
      expect(typeof params.payload).toBe("object");
      expect(params.payload.name).toBe("max_drawdown <= 0.2");
      expect(params.payload.operator).toBe("<=");
      expect(params.payload.value).toBe("0.2");
      expect(params.payload.expression).toBe("0.2");
      expect(params.payload.scope).toBe("global");

      expect(params.payload.command).toBeUndefined();
      expect(params.payload.target).toBeUndefined();
      expect(params.payload.action).toBeUndefined();
      expect(params.payload.payload).toBeUndefined();
    });

    it("create_constraint aliases value to expression if only value is provided", () => {
      const envelope = buildRunActionCommand(
        {
          kind: "Evolution",
          id: "prog-001",
          action: "create_constraint",
          params: { name: "sharpe >= 1.5", operator: ">=", value: "1.5" },
        },
        {},
      );
      const params = envelope.params as Record<string, any>;
      expect(params.value).toBe("1.5");
      expect(params.expression).toBe("1.5");
      expect(params.payload.value).toBe("1.5");
      expect(params.payload.expression).toBe("1.5");
    });

    it("resume_program targets EvolutionProgram with correct action", () => {
      const env = buildRunActionCommand(
        { kind: "Evolution", id: "prog-001", action: "resume_program", memo: "operator resume" },
        {},
      );
      expect(env.command).toBe("EvolutionProgramAction");
      expect(env.target).toEqual({ type: "EvolutionProgram", id: "prog-001" });
      expect(env.action).toBe("resume_program");
      expect(env.params.action_id).toBe("resume_program");
    });

    it("pause_program targets EvolutionProgram with correct action", () => {
      const env = buildRunActionCommand(
        { kind: "Evolution", id: "prog-001", action: "pause_program" },
        {},
      );
      expect(env.command).toBe("EvolutionProgramAction");
      expect(env.target).toEqual({ type: "EvolutionProgram", id: "prog-001" });
      expect(env.action).toBe("pause_program");
    });

    it("stop targets EvolutionProgram with correct action", () => {
      const env = buildRunActionCommand(
        { kind: "Evolution", id: "prog-001", action: "stop" },
        {},
      );
      expect(env.command).toBe("EvolutionProgramAction");
      expect(env.target).toEqual({ type: "EvolutionProgram", id: "prog-001" });
      expect(env.action).toBe("stop");
    });

    it("freeze_generation & unfreeze_generation target EvolutionProgram", () => {
      const freeze = buildRunActionCommand(
        { kind: "Evolution", id: "prog-001", action: "freeze_generation" },
        {},
      );
      expect(freeze.command).toBe("EvolutionProgramAction");
      expect(freeze.action).toBe("freeze_generation");

      const unfreeze = buildRunActionCommand(
        { kind: "Evolution", id: "prog-001", action: "unfreeze_generation" },
        {},
      );
      expect(unfreeze.command).toBe("EvolutionProgramAction");
      expect(unfreeze.action).toBe("unfreeze_generation");
    });

    it("promote_candidate wires candidate_id and stage at top-level and nested payload", () => {
      const paperEnv = buildRunActionCommand(
        {
          kind: "Evolution",
          id: "prog-001",
          action: "promote_candidate_paper",
          payload: { candidate_id: "cand-123", stage: "paper" },
        },
        {},
      );
      expect(paperEnv.action).toBe("promote_candidate_paper");
      expect(paperEnv.params.candidate_id).toBe("cand-123");
      expect(paperEnv.params.stage).toBe("paper");
      expect(paperEnv.params.payload).toEqual(expect.objectContaining({
        candidate_id: "cand-123",
        stage: "paper",
      }));

      const liveEnv = buildRunActionCommand(
        {
          kind: "Evolution",
          id: "prog-001",
          action: "promote_candidate_live",
          payload: { candidate_id: "cand-456", stage: "live" },
        },
        {},
      );
      expect(liveEnv.action).toBe("promote_candidate_live");
      expect(liveEnv.params.candidate_id).toBe("cand-456");
      expect(liveEnv.params.stage).toBe("live");
      expect(liveEnv.params.payload).toEqual(expect.objectContaining({
        candidate_id: "cand-456",
        stage: "live",
      }));
    });
  });

  describe("write action execution (live-write enabled)", () => {
    let lastCommandUrl = "";
    let lastCommandBody: Record<string, any> = {};

    beforeEach(() => {
      process.env.VITE_BFF_REAL_WRITES = "true";
      window.sessionStorage.clear();
      window.localStorage.clear();
      window.sessionStorage.setItem("pantheon.bff.bearerToken", "test_tok_123");
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

      lastCommandUrl = "";
      lastCommandBody = {};
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/bff/me")) {
          return new Response(
            JSON.stringify({
              data: {
                session: { authenticated: true, session_kind: "bearer" },
                environment: { name: "dev", strict_auth: false },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        lastCommandUrl = url;
        lastCommandBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            status: "accepted",
            data: { commandId: "cmd_evo_123", status: "accepted" },
            meta: { idempotency: { idempotencyKey: "idk_evo_server" } },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      });
    });

    afterEach(() => {
      delete process.env.VITE_BFF_REAL_WRITES;
      delete process.env.VITE_BFF_FALLBACK;
      delete process.env.VITE_BFF_STRICT_WRITES;
      window.sessionStorage.clear();
      window.localStorage.clear();
      liveStatus._reset();
      vi.restoreAllMocks();
    });

    it("resumeEvolutionProgram executes successfully and posts resume_program command", async () => {
      const res = await resumeEvolutionProgram("prog-001", "resume program");
      expect(res.ok).toBe(true);
      expect(res.data.actionId).toBe("cmd_evo_123");
      expect(lastCommandUrl.endsWith("/bff/v1/commands")).toBe(true);
      expect(lastCommandBody.action).toBe("resume_program");
      expect(lastCommandBody.target).toEqual({ type: "EvolutionProgram", id: "prog-001" });
    });

    it("pauseEvolutionProgram executes successfully and posts pause_program command", async () => {
      const res = await pauseEvolutionProgram("prog-001", "pause program");
      expect(res.ok).toBe(true);
      expect(res.data.actionId).toBe("cmd_evo_123");
      expect(lastCommandBody.action).toBe("pause_program");
      expect(lastCommandBody.target).toEqual({ type: "EvolutionProgram", id: "prog-001" });
    });

    it("stopEvolutionProgram executes successfully and posts stop command", async () => {
      const res = await stopEvolutionProgram("prog-001", "stop program");
      expect(res.ok).toBe(true);
      expect(res.data.actionId).toBe("cmd_evo_123");
      expect(lastCommandBody.action).toBe("stop");
      expect(lastCommandBody.target).toEqual({ type: "EvolutionProgram", id: "prog-001" });
    });

    it("freezeGeneration and unfreezeGeneration execute successfully and post commands", async () => {
      const fRes = await freezeGeneration("prog-001", "freeze gen 1");
      expect(fRes.ok).toBe(true);
      expect(lastCommandBody.action).toBe("freeze_generation");

      const uRes = await unfreezeGeneration("prog-001", "unfreeze gen 1");
      expect(uRes.ok).toBe(true);
      expect(lastCommandBody.action).toBe("unfreeze_generation");
    });

    it("promoteCandidate posts promote_candidate_paper / promote_candidate_live with candidate_id", async () => {
      const paperRes = await promoteCandidate("prog-001", "cand-001", "paper");
      expect(paperRes.ok).toBe(true);
      expect(lastCommandBody.action).toBe("promote_candidate_paper");
      expect(lastCommandBody.params.candidate_id).toBe("cand-001");
      expect(lastCommandBody.params.stage).toBe("paper");
      expect(lastCommandBody.params.payload).toEqual(expect.objectContaining({
        candidate_id: "cand-001",
        stage: "paper",
      }));

      const liveRes = await promoteCandidate("prog-001", "cand-002", "live");
      expect(liveRes.ok).toBe(true);
      expect(lastCommandBody.action).toBe("promote_candidate_live");
      expect(lastCommandBody.params.candidate_id).toBe("cand-002");
      expect(lastCommandBody.params.stage).toBe("live");
      expect(lastCommandBody.params.payload).toEqual(expect.objectContaining({
        candidate_id: "cand-002",
        stage: "live",
      }));
    });

    it("createEvolutionProgramConstraint posts create_constraint with nested payload and value", async () => {
      const res = await createEvolutionProgramConstraint("prog-001", {
        name: "max_drawdown <= 0.15",
        operator: "<=",
        value: "0.15",
      });
      expect(res.ok).toBe(true);
      expect(res.constraintId).toBe("cmd_evo_123");
      expect(lastCommandBody.action).toBe("create_constraint");
      expect(lastCommandBody.params.name).toBe("max_drawdown <= 0.15");
      expect(lastCommandBody.params.operator).toBe("<=");
      expect(lastCommandBody.params.value).toBe("0.15");
      expect(lastCommandBody.params.payload).toEqual(expect.objectContaining({
        name: "max_drawdown <= 0.15",
        operator: "<=",
        value: "0.15",
      }));
    });

    it("createEvolutionConstraint polymorphic helper routes program and incident constraints", async () => {
      const progRes = await createEvolutionConstraint("prog-001", {
        name: "volatility <= 0.2",
        operator: "<=",
        value: "0.2",
      });
      expect(progRes.ok).toBe(true);
      expect(progRes.constraintId).toBe("cmd_evo_123");
      expect(lastCommandBody.action).toBe("create_constraint");

      const incRes = await createEvolutionConstraint("inc-001", "mitigate incident constraint");
      expect(incRes.ok).toBe(true);
      expect(incRes.constraintId).toBe("cmd_evo_123");
      expect(lastCommandBody.action).toBe("create_evolution_constraint");
    });

    it("writes catalog exposes all evolution lifecycle functions", () => {
      expect(typeof writes.resumeEvolutionProgram).toBe("function");
      expect(typeof writes.pauseEvolutionProgram).toBe("function");
      expect(typeof writes.stopEvolutionProgram).toBe("function");
      expect(typeof writes.freezeGeneration).toBe("function");
      expect(typeof writes.unfreezeGeneration).toBe("function");
      expect(typeof writes.promoteCandidate).toBe("function");
      expect(typeof writes.createEvolutionProgramConstraint).toBe("function");
      expect(typeof writes.createEvolutionConstraint).toBe("function");
    });
  });

  describe("strict-live write gating refusal", () => {
    it("all evolution write actions reject with FEATURE_DISABLED when live writes are disabled", async () => {
      process.env.VITE_BFF_FALLBACK = "strict";
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

      await expect(resumeEvolutionProgram("prog-001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(pauseEvolutionProgram("prog-001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(stopEvolutionProgram("prog-001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(freezeGeneration("prog-001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(unfreezeGeneration("prog-001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(promoteCandidate("prog-001", "cand-001", "paper")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(promoteCandidate("prog-001", "cand-002", "live")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(
        createEvolutionProgramConstraint("prog-001", {
          name: "max_dd",
          operator: "<=",
          value: "0.2",
        }),
      ).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
    });
  });
});
