import { describe, expect, it } from "vitest";
import { derivePersonaReadiness, isStageOrderly } from "./personaReadiness";
import type { Persona } from "@/lib/bff-v1";

function buildCohortManagementEnvelope(params: {
  personaId: string;
  name: string;
  suffix: string;
  runtimeId: string;
  runtimeBindingId: string;
}) {
  const { personaId, name, suffix, runtimeId, runtimeBindingId } = params;
  const ledgerId = `paper-ledger-${suffix}`;
  const poolId = `pool-persona-paper-${suffix}`;
  const bindingId = `pcb-persona-paper-${suffix}`;
  const planId = `plan-persona-paper-${suffix}`;
  const artifactApprovalId = `apv-persona-paper-artifact-${suffix}`;
  const bindingApprovalId = `apv-persona-paper-${suffix}`;

  return {
    data: {
      persona: {
        id: personaId,
        name,
        lifecycle_state: "draft",
        status: "active",
        metadata: {
          lifecycle_state: "paper_running",
          capital_mode: "paper",
          deployment_stage: "paper",
          execution_mode: "paper",
          paper_ledger_id: ledgerId,
          legacy_paper_capital_pool_id: poolId,
          persona_capital_binding_id: bindingId,
          deployment_plan_id: planId,
          approval_decision_id: artifactApprovalId,
          runtime_binding_id: runtimeBindingId,
          runtime_id: runtimeId,
          provisioning_authoritative_readback: {
            capital: {
              binding: {
                id: bindingId,
                persona_id: personaId,
                capital_pool_id: poolId,
                status: "active",
                approval_decision_id: bindingApprovalId,
              },
            },
            deployment: {
              plan_id: planId,
              saga_status: "completed",
              progress_status: "completed",
            },
            runtime_binding: {
              runtime_binding_id: runtimeBindingId,
              runtime_id: runtimeId,
              plan_id: planId,
              persona_id: personaId,
              deployment_mode: "paper",
              status: "active",
            },
            paper_worker: {
              runtime_id: runtimeId,
              status: "active",
              paper_runtime_state: "active",
              execution_mode: "paper",
            },
          },
        },
      },
      bindings: [
        {
          id: bindingId,
          persona_id: personaId,
          capital_pool_id: poolId,
          status: "active",
          approval_decision_id: bindingApprovalId,
          capital_pool: {
            id: poolId,
            status: "active",
            pool_type: "paper",
          },
        },
      ],
      // Simulates BFF detail.py where deploymentPlans/approvals sub-surfaces were empty/unavailable
      // while authoritative owner readback + active bindings + active runtimeBindings are present.
      deploymentPlans: [],
      approvals: [],
      runtimeBindings: [
        {
          id: runtimeBindingId,
          runtime_binding_id: runtimeBindingId,
          runtime_id: runtimeId,
          plan_id: planId,
          persona_id: personaId,
          deployment_mode: "paper",
          status: "active",
        },
      ],
      activeIncidents: [],
      health: {
        status: "healthy" as const,
        reasons: [],
        activeSessions: 0,
        pnl: null,
        drawdown: null,
      },
    },
    meta: {
      snapshot_at: "2026-11-06T16:40:28Z",
      surfaces: {
        persona_bindings: { status: "ok", count: 1, authoritative: true },
        deployment_plans: {
          status: "unavailable",
          count: 0,
          authoritative: false,
          reason: "no deployment plans matched persona capital bindings",
        },
        approvals: {
          status: "unavailable",
          count: 0,
          authoritative: false,
          reason: "no approval decisions matched persona bindings or deployment plans",
        },
        persona_health: { status: "ok", count: 1, authoritative: true },
      },
    },
  };
}

describe("derivePersonaReadiness", () => {
  it.each([
    {
      personaId: "persona-be19a1fac471247f2b2a",
      name: "青禾｜2330 台股 Paper 學習 R2",
      suffix: "298e138c136c9840b0e4",
      runtimeId: "rt-535a82a3",
      runtimeBindingId: "rb-a1c3ada3d5894d57bc2e012f337753be",
    },
    {
      personaId: "persona-d9363cffc0efbbbcbeb9",
      name: "澄川｜2317 台股 Paper 學習",
      suffix: "8ae996980eeccb80d928",
      runtimeId: "rt-c98e4223",
      runtimeBindingId: "rb-eda9b9a3379d4fb5a09f0e8432c84f20",
    },
    {
      personaId: "persona-9d4fb3f44cbc5e7cb84f",
      name: "衡岳｜0050 台股 Paper 學習",
      suffix: "01390a4b72713295b001",
      runtimeId: "rt-8b0d8649",
      runtimeBindingId: "rb-fd733d7c192f45898bbe0e90c8555878",
    },
  ])(
    "derives 5/5 Paper readiness from authoritative owner readback for cohort persona $personaId ($runtimeId)",
    (cohort) => {
      const envelope = buildCohortManagementEnvelope(cohort);
      const readiness = derivePersonaReadiness(envelope);

      expect(readiness.completed).toBe(5);
      expect(readiness.total).toBe(5);
      expect(readiness.nextStage).toBeUndefined();
      expect(readiness.mode).toBe("paper");
      expect(readiness.runtimeId).toBe(cohort.runtimeId);
      expect(readiness.healthStatus).toBe("healthy");
      expect(readiness.reasons).toEqual([]);
      expect(isStageOrderly(readiness.stages)).toBe(true);
      expect(readiness.stages).toEqual([
        { key: "lifecycle", done: true, status: "done", blockedReason: undefined },
        { key: "binding", done: true, status: "done", blockedReason: undefined },
        { key: "plan", done: true, status: "done", blockedReason: undefined },
        { key: "approval", done: true, status: "done", blockedReason: undefined },
        { key: "runtime", done: true, status: "done", blockedReason: undefined },
      ]);
    },
  );

  it("never infers 5/5 readiness from paper_running or flat Persona IDs when persona-management data is absent", () => {
    const flatPaperPersona: Persona = {
      id: "persona-be19a1fac471247f2b2a",
      name: "青禾｜2330 台股 Paper 學習 R2",
      owner: "tenant-default",
      updatedAt: "2026-11-06T16:12:41Z",
      state: "paper_running",
      lifecycleStatus: "paper_running",
      risk: "medium",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0,
      capitalMode: "paper",
      deploymentStage: "paper",
      paperLedgerId: "paper-ledger-298e138c136c9840b0e4",
      legacyPaperCapitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
      deploymentPlanId: "plan-persona-paper-298e138c136c9840b0e4",
      runtimeBindingId: "rb-a1c3ada3d5894d57bc2e012f337753be",
      runtimeId: "rt-535a82a3",
    };

    const readiness = derivePersonaReadiness(flatPaperPersona);

    expect(readiness.completed).toBe(1);
    expect(readiness.nextStage).toBe("binding");
    expect(readiness.healthStatus).toBe("unknown");
    expect(readiness.reasons).toEqual([]);
    expect(readiness.stages).toEqual([
      { key: "lifecycle", done: true, status: "done", blockedReason: undefined },
      { key: "binding", done: false, status: "unavailable", blockedReason: "no_binding" },
      { key: "plan", done: false, status: "unavailable", blockedReason: "no_deployment_plan" },
      { key: "approval", done: false, status: "unavailable", blockedReason: "no_approval" },
      { key: "runtime", done: false, status: "unavailable", blockedReason: "no_runtime_binding" },
    ]);
  });

  it("reports unavailable instead of not_created when persona-management sub-surfaces are unavailable", () => {
    const readiness = derivePersonaReadiness({
      data: {
        persona: {
          id: "persona-unavailable-surfaces",
          lifecycle_state: "paper_owner",
        },
        bindings: [],
        deploymentPlans: [],
        approvals: [],
        runtimeBindings: [],
        health: {
          status: "unknown",
          reasons: [],
        },
      },
      meta: {
        surfaces: {
          persona_bindings: { status: "unavailable", count: 0 },
          deployment_plans: { status: "unavailable", count: 0 },
          approvals: { status: "unavailable", count: 0 },
          runtime_bindings: { status: "unavailable", count: 0 },
        },
      },
    });

    expect(readiness.completed).toBe(1);
    expect(readiness.stages.map((s) => ({ key: s.key, status: s.status }))).toEqual([
      { key: "lifecycle", status: "done" },
      { key: "binding", status: "unavailable" },
      { key: "plan", status: "unavailable" },
      { key: "approval", status: "unavailable" },
      { key: "runtime", status: "unavailable" },
    ]);
  });

  it("reports not_upgraded / not_created / not_submitted / not_started when authoritative surfaces are ok and genuinely empty", () => {
    const readiness = derivePersonaReadiness({
      data: {
        persona: {
          id: "persona-draft-empty",
          lifecycle_state: "draft",
        },
        bindings: [],
        deploymentPlans: [],
        approvals: [],
        runtimeBindings: [],
        health: {
          status: "degraded",
          reasons: ["persona_lifecycle_not_active"],
        },
      },
      meta: {
        surfaces: {
          persona_bindings: { status: "empty", count: 0 },
          deployment_plans: { status: "empty", count: 0 },
          approvals: { status: "empty", count: 0 },
          persona_health: { status: "ok", count: 1 },
        },
      },
    });

    expect(readiness.completed).toBe(0);
    expect(readiness.healthStatus).toBe("degraded");
    expect(readiness.reasons).toEqual(["persona_lifecycle_not_active"]);
    expect(readiness.stages.map((s) => ({ key: s.key, status: s.status }))).toEqual([
      { key: "lifecycle", status: "not_upgraded" },
      { key: "binding", status: "not_created" },
      { key: "plan", status: "not_created" },
      { key: "approval", status: "not_submitted" },
      { key: "runtime", status: "not_started" },
    ]);
  });

  it("marks runtime stage as paused or retired instead of running when runtime or binding is paused or retired", () => {
    const baseData = {
      persona: {
        id: "persona-paused-rt",
        lifecycle_state: "paper_running",
      },
      bindings: [{ id: "pcb-1", status: "active" }],
      deploymentPlans: [{ id: "plan-1", status: "approved", approval_decision_id: "apv-1" }],
      approvals: [{ id: "apv-1", state: "decided", outcome: "approved" }],
      health: {
        status: "degraded" as const,
        reasons: ["runtime_status_attention"],
      },
    };

    const pausedReadiness = derivePersonaReadiness({
      data: {
        ...baseData,
        runtimeBindings: [{ id: "rb-1", runtime_id: "rt-paused", status: "paused" }],
      },
    });
    expect(pausedReadiness.completed).toBe(4);
    expect(pausedReadiness.nextStage).toBe("runtime");
    expect(pausedReadiness.stages[4]).toEqual({
      key: "runtime",
      done: false,
      status: "paused",
      blockedReason: "runtime_status_attention",
    });

    const retiredReadiness = derivePersonaReadiness({
      data: {
        ...baseData,
        runtimeBindings: [{ id: "rb-1", runtime_id: "rt-retired", status: "retired" }],
      },
    });
    expect(retiredReadiness.completed).toBe(4);
    expect(retiredReadiness.nextStage).toBe("runtime");
    expect(retiredReadiness.stages[4]).toEqual({
      key: "runtime",
      done: false,
      status: "retired",
      blockedReason: "runtime_status_attention",
    });
  });

  it("does not synthesize health status or reasons in UI when BFF health is absent", () => {
    const readiness = derivePersonaReadiness({
      data: {
        persona: { lifecycle_state: "paper_owner" },
        bindings: [{ id: "pcb-1", status: "active" }],
        deploymentPlans: [{ id: "plan-1", status: "approved" }],
        approvals: [{ id: "apv-1", state: "decided", decision: "approved" }],
        runtimeBindings: [{ id: "rb-1", runtime_id: "rt-1", status: "active" }],
        activeIncidents: [{ id: "inc-1" }],
      },
    });

    expect(readiness.completed).toBe(5);
    expect(readiness.healthStatus).toBe("unknown");
    expect(readiness.reasons).toEqual([]);
  });
});
