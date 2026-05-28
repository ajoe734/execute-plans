// Persona onboarding readiness model.
// Spec: docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md §3 §5 §6
//
// Derives a 5-stage checklist from any persona-management surface shape we can read today:
//   - Pack D persona seed (lifecycle = "draft" | "active" | "paused" | ...)
//   - Optional F4 fields: data.bindings / data.deploymentPlans / data.approvals /
//     data.runtimeBindings / data.health / data.activeIncidents
//
// Tolerant of missing fields — degrades gracefully when BFF F4 surface isn't live yet.

import type { Persona } from "@/lib/bff/types";

export type PersonaStageKey = "lifecycle" | "binding" | "plan" | "approval" | "runtime";

export type HealthStatus = "healthy" | "degraded" | "critical" | "unknown";

export type PersonaHealthReason =
  | "persona_lifecycle_not_active"
  | "no_runtime_binding"
  | "active_incident"
  | "drawdown_threshold"
  | "negative_pnl"
  | "runtime_status_attention"
  | string;

export interface PersonaStageState {
  key: PersonaStageKey;
  done: boolean;
  /** Reason code if not done (e.g. "lifecycle_not_active"). */
  blockedReason?: string;
}

export interface PersonaReadiness {
  stages: PersonaStageState[];
  completed: number; // 0..5
  total: 5;
  nextStage?: PersonaStageKey;
  healthStatus: HealthStatus;
  reasons: PersonaHealthReason[];
  /** Optional happy-path telemetry. */
  activeSessions?: number;
  pnl?: number;
  drawdown?: number;
}

const STAGE_ORDER: PersonaStageKey[] = ["lifecycle", "binding", "plan", "approval", "runtime"];

const REASON_NEXT_STEP_KEY: Record<string, string> = {
  persona_lifecycle_not_active: "persona.health.nextStep.lifecycle_not_active",
  no_runtime_binding: "persona.health.nextStep.no_runtime_binding",
  active_incident: "persona.health.nextStep.active_incident",
  drawdown_threshold: "persona.health.nextStep.drawdown_threshold",
  negative_pnl: "persona.health.nextStep.negative_pnl",
  runtime_status_attention: "persona.health.nextStep.runtime_status_attention",
};

/** i18n key for a reason's display text. */
export function reasonI18nKey(reason: string): string {
  // Strip "persona_health_" / "persona_" prefix if BE returns long form.
  const trimmed = reason.replace(/^persona_health_|^persona_/, "");
  return `persona.health.${trimmed}`;
}

export function reasonNextStepI18nKey(reason: string): string | undefined {
  return REASON_NEXT_STEP_KEY[reason];
}

interface PersonaManagementShape {
  data?: {
    persona?: { lifecycle_state?: string; lifecycleState?: string };
    bindings?: unknown[];
    deploymentPlans?: unknown[];
    approvals?: Array<{ state?: string; status?: string }>;
    runtimeBindings?: unknown[];
    activeIncidents?: unknown[];
    health?: {
      status?: HealthStatus;
      reasons?: string[];
      latest_telemetry_at?: string;
      latestTelemetryAt?: string;
      pnl?: number;
      drawdown?: number;
      activeSessions?: number;
    };
  };
  // Fallback flat persona shape (current FE Persona type).
  persona?: Persona;
}

const ACTIVE_LIFECYCLE = new Set(["paper_owner", "live_owner", "active"]);

export function derivePersonaReadiness(
  input: PersonaManagementShape | Persona | undefined | null,
): PersonaReadiness {
  if (!input) {
    return {
      stages: STAGE_ORDER.map((k) => ({ key: k, done: false })),
      completed: 0, total: 5, nextStage: "lifecycle",
      healthStatus: "unknown", reasons: [],
    };
  }

  // Normalize: try the F4 shape first, then fall back to flat Persona.
  const wrapped = (input as PersonaManagementShape).data
    ? (input as PersonaManagementShape).data!
    : undefined;
  const flat = !wrapped ? (input as Persona) : undefined;

  const lifecycleState =
    wrapped?.persona?.lifecycle_state ??
    wrapped?.persona?.lifecycleState ??
    (flat ? (flat as unknown as { state?: string; lifecycleState?: string }).state
              ?? (flat as unknown as { lifecycleState?: string }).lifecycleState
          : undefined);

  const lifecycleDone = ACTIVE_LIFECYCLE.has((lifecycleState ?? "").toLowerCase());
  const bindingDone = (wrapped?.bindings?.length ?? 0) > 0;
  const planDone = (wrapped?.deploymentPlans?.length ?? 0) > 0;
  const approvalDone =
    (wrapped?.approvals ?? []).some(
      (a) => (a?.state ?? a?.status ?? "").toLowerCase() === "approved",
    );
  const runtimeDone = (wrapped?.runtimeBindings?.length ?? 0) > 0;

  const stages: PersonaStageState[] = [
    { key: "lifecycle", done: lifecycleDone,
      blockedReason: lifecycleDone ? undefined : "persona_lifecycle_not_active" },
    { key: "binding", done: bindingDone,
      blockedReason: bindingDone ? undefined : "no_binding" },
    { key: "plan", done: planDone,
      blockedReason: planDone ? undefined : "no_deployment_plan" },
    { key: "approval", done: approvalDone,
      blockedReason: approvalDone ? undefined : "no_approval" },
    { key: "runtime", done: runtimeDone,
      blockedReason: runtimeDone ? undefined : "no_runtime_binding" },
  ];

  const completed = stages.filter((s) => s.done).length;
  const nextStage = stages.find((s) => !s.done)?.key;

  const beReasons = wrapped?.health?.reasons ?? [];
  // Synthesize reasons from local derivation if BE didn't supply.
  const synthReasons: string[] = [];
  if (!lifecycleDone) synthReasons.push("persona_lifecycle_not_active");
  if (lifecycleDone && !runtimeDone) synthReasons.push("no_runtime_binding");
  if ((wrapped?.activeIncidents?.length ?? 0) > 0) synthReasons.push("active_incident");

  const reasons = beReasons.length ? beReasons : synthReasons;

  let healthStatus: HealthStatus =
    wrapped?.health?.status ??
    (completed === 5 ? "healthy" : completed >= 4 ? "degraded" : "unknown");
  if (reasons.includes("active_incident") || reasons.includes("drawdown_threshold")) {
    healthStatus = "critical";
  } else if (reasons.length > 0 && healthStatus === "unknown") {
    healthStatus = "degraded";
  }

  return {
    stages,
    completed,
    total: 5,
    nextStage,
    healthStatus,
    reasons,
    activeSessions: wrapped?.health?.activeSessions,
    pnl: wrapped?.health?.pnl,
    drawdown: wrapped?.health?.drawdown,
  };
}

export function isStageOrderly(stages: PersonaStageState[]): boolean {
  // Stages must complete in order (you can't have a runtime without a binding).
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].done && !stages[i - 1].done) return false;
  }
  return true;
}
