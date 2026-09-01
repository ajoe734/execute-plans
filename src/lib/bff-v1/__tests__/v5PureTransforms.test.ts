import { describe, expect, it } from "vitest";
import {
  adaptBffControlRoom,
  adaptBffIntervention,
  adaptBffInterventionsResponse,
  adaptBffLoopRun,
  adaptBffPersonaHealth,
  adaptBffSentinelFinding,
  adaptBffStrategyHealth,
  adaptHealthStatus,
  adaptLoopEvidence,
  adaptLoopEvidenceRef,
  adaptLoopKind,
  adaptLoopNextAction,
  adaptLoopStatus,
  adaptSentinelSeverity,
  adaptSentinelStatus,
  adaptStageStatus,
  asEvidenceRefs,
  liveKpi,
  scoreForStatus,
} from "@/lib/bff-v1/v5";

describe("v5 DTO / View Model Pure Transforms", () => {
  it("adaptBffIntervention is pure: identical inputs at different times yield identical output", async () => {
    const input = {};
    const first = adaptBffIntervention(input);

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = adaptBffIntervention(input);

    expect(first).toEqual(second);
    expect(first.createdAt).toBe("");
    expect(first.updatedAt).toBe("");
    expect(second.createdAt).toBe("");
    expect(second.updatedAt).toBe("");
  });

  it("adaptBffIntervention supports caller-injected deterministic fallbackIso", () => {
    const fallback = "2026-08-30T12:00:00.000Z";
    const item = adaptBffIntervention({}, 1, fallback);

    expect(item.id).toBe("intervention_1");
    expect(item.createdAt).toBe(fallback);
    expect(item.updatedAt).toBe(fallback);
  });

  it("adaptBffInterventionsResponse is pure and deterministic across time", async () => {
    const body = { items: [{}, { intervention_id: "int-123", kind: "risk_breach" }] };
    const first = adaptBffInterventionsResponse(body);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = adaptBffInterventionsResponse(body);

    expect(first).toEqual(second);
    expect(first.items[0].createdAt).toBe("");
    expect(first.items[1].severity).toBe("critical");
    expect(first.items[1].source).toBe("policy_exception");
  });

  it("adaptBffLoopRun is pure: zero wall-clock reads or non-deterministic fallbacks", async () => {
    const input = {};
    const first = adaptBffLoopRun(input, 0);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = adaptBffLoopRun(input, 0);

    expect(first).toEqual(second);
    expect(first.startedAt).toBe("");
    expect(first.updatedAt).toBe("");
  });

  it("adaptBffPersonaHealth is pure: zero wall-clock reads", async () => {
    const input = { persona_id: "p-1", status: "healthy" };
    const first = adaptBffPersonaHealth(input);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = adaptBffPersonaHealth(input);

    expect(first).toEqual(second);
    expect(first.updatedAt).toBe("");
    expect(first.score).toBe(90);
  });

  it("adaptBffStrategyHealth is pure: zero wall-clock reads", async () => {
    const input = { strategy_id: "s-1", status: "watch" };
    const first = adaptBffStrategyHealth(input);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = adaptBffStrategyHealth(input);

    expect(first).toEqual(second);
    expect(first.updatedAt).toBe("");
    expect(first.score).toBe(72);
  });

  it("adaptBffSentinelFinding is pure: zero wall-clock reads", async () => {
    const input = { finding_id: "f-1", severity: "critical" };
    const first = adaptBffSentinelFinding(input);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = adaptBffSentinelFinding(input);

    expect(first).toEqual(second);
    expect(first.detectedAt).toBe("");
    expect(first.updatedAt).toBe("");
  });

  it("adaptBffControlRoom is pure: default session and generatedAt are deterministic", async () => {
    const body = {
      loops: { items: [{ loop_run_id: "lr-1", status: "running" }] },
      sentinel: { items: [{ finding_id: "sf-1", status: "open", severity: "critical" }] },
      interventions: { items: [{ intervention_id: "iv-1" }] },
    };
    const first = adaptBffControlRoom(body);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = adaptBffControlRoom(body);

    expect(first).toEqual(second);
    expect(first.session.serverTime).toBe("1970-01-01T00:00:00.000Z");
    expect(first.generatedAt).toBe("");
    expect(first.kpi).toEqual({
      loopsRunning: 1,
      loopsBlocked: 0,
      openFindings: 1,
      criticalFindings: 1,
      pendingInterventions: 1,
      personasHealthy: 0,
      personasDegraded: 0,
      strategiesHealthy: 0,
      strategiesDegraded: 0,
    });
  });

  it("helper adapters produce deterministic enum and reference structures", () => {
    expect(adaptLoopStatus("IN_PROGRESS")).toBe("running");
    expect(adaptLoopStatus("UNKNOWN")).toBe("idle");
    expect(adaptStageStatus("AWAITING_INTERVENTION")).toBe("blocked");
    expect(adaptLoopKind("macro_research_loop")).toBe("research");
    expect(adaptLoopKind("rebalance_optim_loop")).toBe("optimization");
    expect(adaptLoopKind("execution_flow")).toBe("execution");

    expect(adaptHealthStatus("ok")).toBe("healthy");
    expect(adaptHealthStatus("warning")).toBe("watch");
    expect(adaptHealthStatus("failed")).toBe("critical");
    expect(adaptHealthStatus("unknown")).toBe("degraded");
    expect(scoreForStatus("healthy")).toBe(90);
    expect(scoreForStatus("watch")).toBe(72);
    expect(scoreForStatus("critical")).toBe(20);
    expect(scoreForStatus("degraded")).toBe(50);

    expect(adaptSentinelStatus("ACCEPTED")).toBe("acknowledged");
    expect(adaptSentinelStatus("ACTION_PENDING")).toBe("action_pending");
    expect(adaptSentinelStatus("MITIGATING")).toBe("mitigating");
    expect(adaptSentinelStatus("CLOSED")).toBe("resolved");
    expect(adaptSentinelStatus("REJECTED")).toBe("dismissed");
    expect(adaptSentinelStatus("OTHER")).toBe("open");

    expect(adaptSentinelSeverity("critical")).toBe("critical");
    expect(adaptSentinelSeverity("high")).toBe("warning");
    expect(adaptSentinelSeverity("medium")).toBe("watch");
    expect(adaptSentinelSeverity("low")).toBe("info");

    expect(asEvidenceRefs(["audit:123", "incident:inc_1", { id: "p1", kind: "policy" }])).toEqual([
      { kind: "audit", id: "123" },
      { kind: "incident", id: "inc_1" },
      { kind: "policy", id: "p1" },
    ]);

    expect(adaptLoopEvidenceRef({ kind: "approval", id: "app-1" })).toEqual({ kind: "approval", id: "app-1" });
    expect(adaptLoopEvidenceRef({ kind: "invalid", id: "app-1" })).toBeUndefined();

    expect(adaptLoopEvidence({ approval_id: "app-2", evidence: [{ kind: "incident", id: "inc-1" }] })).toEqual([
      { kind: "incident", id: "inc-1" },
      { kind: "approval", id: "app-2" },
    ]);

    expect(adaptLoopNextAction({ kind: "approval", label: "Approve trade", href: "/management/approvals?id=1" })).toEqual({
      kind: "awaiting_approval",
      label: "Approve trade",
      href: "/management/approvals?id=1",
    });

    expect(liveKpi([], [], [])).toEqual({
      loopsRunning: 0,
      loopsBlocked: 0,
      openFindings: 0,
      criticalFindings: 0,
      pendingInterventions: 0,
      personasHealthy: 0,
      personasDegraded: 0,
      strategiesHealthy: 0,
      strategiesDegraded: 0,
    });
  });
});
