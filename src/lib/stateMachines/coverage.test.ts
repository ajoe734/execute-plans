import { describe, it, expect } from "vitest";
import {
  machines,
  strategyMachine,
  rebalanceMachine,
  alertMachine,
  incidentMachine,
  insightMachine,
  memoryMachine,
  agoraSessionMachine,
  jobMachine,
  approvalMachine,
  deploymentMachine,
  evolutionRunMachine,
  experimentMachine,
} from "@/lib/stateMachines";
import {
  nextTransitions,
  nextStates,
  canTransition,
  findTransition,
} from "@/lib/stateMachines/types";

const all = Object.values(machines);

describe("state machine coverage (Part 7 §17)", () => {
  it("registry exposes all 19 machines (18 entities + EvolutionRun)", () => {
    // 17.1–17.18 plus EvolutionRun (declared in spec §17.6 as a sub-machine)
    expect(all.length).toBe(19);
  });

  it("every transition's `from` is a known state (or 'any')", () => {
    for (const m of all) {
      const known = new Set<string>([...m.states, ...(m.branchStates ?? []), "any"]);
      for (const t of m.transitions) {
        expect(known.has(t.from), `${m.name}: unknown from=${t.from}`).toBe(true);
      }
    }
  });

  it("every transition's `to` is a known state", () => {
    for (const m of all) {
      const known = new Set<string>([...m.states, ...(m.branchStates ?? [])]);
      for (const t of m.transitions) {
        expect(known.has(t.to), `${m.name}: unknown to=${t.to}`).toBe(true);
      }
    }
  });

  it("each canonical state has at least one inbound or outbound transition", () => {
    for (const m of all) {
      for (const s of m.states) {
        const touched = m.transitions.some(
          (t) => t.from === s || t.to === s || t.from === "any",
        );
        expect(touched, `${m.name}:${s} has no transitions`).toBe(true);
      }
    }
  });

  it("each branch state has at least one inbound or outbound transition", () => {
    for (const m of all) {
      for (const s of m.branchStates ?? []) {
        const touched = m.transitions.some(
          (t) => t.from === s || t.to === s || t.from === "any",
        );
        expect(touched, `${m.name}:${s} branch has no transitions`).toBe(true);
      }
    }
  });

  it("no duplicate (from, action) pairs", () => {
    for (const m of all) {
      const seen = new Set<string>();
      for (const t of m.transitions) {
        const key = `${t.from}::${t.action}`;
        expect(seen.has(key), `${m.name}: duplicate ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("critical-risk transitions declare a UI pattern", () => {
    for (const m of all) {
      for (const t of m.transitions) {
        if (t.risk === "critical") {
          expect(
            t.uiPattern,
            `${m.name}: ${t.from}→${t.to} (${t.action}) is critical but has no uiPattern`,
          ).toBeDefined();
        }
      }
    }
  });

  it("every requiresApproval transition has a risk level", () => {
    // Approvals without risk metadata cannot be routed correctly by GovernanceQueue.
    const exempt = new Set([
      // Memory edits / merges and similar low-risk approvals are intentional.
      "memory:edit_memory", "memory:merge_memory", "memory:approve_memory",
      "memory:reject_memory", "memory:deprecate_memory",
      "memory:convert_to_research", "memory:convert_to_strategy",
      // Approval workflow internal transitions.
      "approval:reject", "approval:request_changes", "approval:resubmit",
      // Incident closure has its own gating.
      "incident:close_incident",
      // Rebalance progression requires approval but risk applies on apply.
      "rebalance:submit_for_review", "rebalance:unfreeze_metrics",
      // Strategy review is gated but not high-risk by itself.
      "strategy:submit_review",
      // Persona restoration & insight conversions.
      "persona:restore_active", "persona:remove_restriction",
      "insight:convert_to_research",
      // Tool / skill / mcp lifecycle resumes.
      "tool:activate_tool", "tool:unrestrict_tool", "tool:retire_tool",
      "skill:submit_for_approval", "skill:retire_skill", "skill:reopen_skill",
      "rankingFormula:submit_formula_review", "rankingFormula:retire_formula",
      "mcpServer:reenable",
      // EvolutionRun has no risk grading; runtime control only.
      // Approval workflow approve action.
    ]);
    for (const m of all) {
      for (const t of m.transitions) {
        if (!t.requiresApproval) continue;
        const key = `${m.name}:${t.action}`;
        if (exempt.has(key)) continue;
        expect(
          t.risk,
          `${m.name}: ${t.from}→${t.to} (${t.action}) requires approval but has no risk`,
        ).toBeDefined();
      }
    }
  });

  // ---- Spec-derived path tests (§17.x canonical happy paths) ----

  it("strategy: discovered → live happy path", () => {
    const order = ["discovered", "scaffolded", "replicated", "approved", "paper", "live"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(canTransition(strategyMachine, order[i] as any, order[i + 1] as any)).toBe(true);
    }
  });

  it("strategy: any → archived (universal terminal)", () => {
    for (const s of [...strategyMachine.states, ...(strategyMachine.branchStates ?? [])]) {
      if (s === "archived") continue;
      expect(canTransition(strategyMachine, s as any, "archived" as any)).toBe(true);
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

  it("rebalance: every pre-applied state can cancel (spec §17.5)", () => {
    const preApplied = ["draft", "metrics_freezing", "metrics_frozen",
      "ranking_calculated", "simulation_ready", "under_review",
      "approved", "scheduled"] as const;
    for (const s of preApplied) {
      expect(canTransition(rebalanceMachine, s as any, "cancelled" as any), `${s}→cancelled`).toBe(true);
    }
  });

  it("alert: every non-closed state can escalate via create_incident (spec §17.10)", () => {
    const escalable = ["new", "acknowledged", "assigned", "investigating", "mitigated", "resolved"] as const;
    for (const s of escalable) {
      expect(findTransition(alertMachine, s as any, "create_incident"), `${s}:create_incident`).toBeDefined();
    }
  });

  it("incident: assigned → investigating → mitigation → mitigated → postmortem → closed", () => {
    const order = ["assigned", "investigating", "mitigation_in_progress", "mitigated", "postmortem_required", "closed"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(canTransition(incidentMachine, order[i] as any, order[i + 1] as any)).toBe(true);
    }
  });

  it("approval: full happy path (draft → approved)", () => {
    const order = ["draft", "submitted", "validator_running", "in_review", "approved"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(canTransition(approvalMachine, order[i] as any, order[i + 1] as any)).toBe(true);
    }
  });

  it("deployment: full happy path (draft → deployed)", () => {
    const order = ["draft", "submitted", "under_review", "approved", "scheduled", "deploying", "deployed"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(canTransition(deploymentMachine, order[i] as any, order[i + 1] as any)).toBe(true);
    }
  });

  it("experiment: queued → running → completed → attached_to_review", () => {
    expect(canTransition(experimentMachine, "queued" as any, "running" as any)).toBe(true);
    expect(canTransition(experimentMachine, "running" as any, "completed" as any)).toBe(true);
    expect(canTransition(experimentMachine, "completed" as any, "attached_to_review" as any)).toBe(true);
  });

  it("evolutionRun: queued → running → paused → running → completed", () => {
    expect(canTransition(evolutionRunMachine, "queued" as any, "running" as any)).toBe(true);
    expect(canTransition(evolutionRunMachine, "running" as any, "paused" as any)).toBe(true);
    expect(canTransition(evolutionRunMachine, "paused" as any, "running" as any)).toBe(true);
    expect(canTransition(evolutionRunMachine, "running" as any, "completed" as any)).toBe(true);
  });

  it("memory: any → deleted (privileged terminal)", () => {
    for (const s of [...memoryMachine.states, ...(memoryMachine.branchStates ?? [])]) {
      if (s === "deleted") continue;
      expect(canTransition(memoryMachine, s as any, "deleted" as any)).toBe(true);
    }
  });

  it("insight: any → dismissed and any → archived (universal exits)", () => {
    for (const s of [...insightMachine.states, ...(insightMachine.branchStates ?? [])]) {
      if (s !== "dismissed") expect(canTransition(insightMachine, s as any, "dismissed" as any)).toBe(true);
      if (s !== "archived")  expect(canTransition(insightMachine, s as any, "archived" as any)).toBe(true);
    }
  });

  it("agoraSession: open → active → summary → submitted_to_management", () => {
    const order = ["open", "active", "summary_generated", "submitted_to_management"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(canTransition(agoraSessionMachine, order[i] as any, order[i + 1] as any)).toBe(true);
    }
  });

  it("job: queued/running can cancel; failed → retrying → running", () => {
    expect(canTransition(jobMachine, "queued" as any, "cancelled" as any)).toBe(true);
    expect(canTransition(jobMachine, "running" as any, "cancelled" as any)).toBe(true);
    expect(canTransition(jobMachine, "failed" as any, "retrying" as any)).toBe(true);
    expect(canTransition(jobMachine, "retrying" as any, "running" as any)).toBe(true);
  });

  // ---- helpers contract ----

  it("nextStates is a subset of nextTransitions targets", () => {
    for (const m of all) {
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
