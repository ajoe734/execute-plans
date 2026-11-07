// Persona onboarding readiness model.
// Spec: docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md §3 §5 §6
//
// Derives a 5-stage checklist from any persona-management surface shape we can read today:
//   - Pack D persona seed (lifecycle = "draft" | "active" | "paused" | ...)
//   - Optional F4 fields: data.bindings / data.deploymentPlans / data.approvals /
//     data.runtimeBindings / data.health / data.activeIncidents
//
// Tolerant of missing fields — degrades gracefully when BFF F4 surface isn't live yet.

import type { Persona, Runtime } from "@/lib/bff-v1";
import type { PersonaManagementSurfaceStatus } from "@/lib/bff-v1/personas";

export type PersonaStageKey = "lifecycle" | "binding" | "plan" | "approval" | "runtime";

export type PersonaStageStatus =
  | "done"
  | "not_upgraded"
  | "not_created"
  | "not_submitted"
  | "not_started"
  | "paused"
  | "retired"
  | "unavailable";

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
  status: PersonaStageStatus;
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
  mode?: "paper" | "live" | "canary" | "unknown";
  runtimeId?: string;
  /** Optional happy-path telemetry. */
  activeSessions?: number;
  pnl?: number | null;
  drawdown?: number | null;
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

export interface PersonaManagementShape {
  data?: {
    persona?: Record<string, unknown> & {
      lifecycle_state?: string;
      lifecycleState?: string;
      state?: string;
      lifecycleStatus?: string;
      status?: string;
      containment_state?: string;
      frozen?: boolean;
      metadata?: Record<string, unknown>;
    };
    bindings?: unknown[];
    deploymentPlans?: unknown[];
    approvals?: Array<Record<string, unknown>>;
    runtimeBindings?: unknown[];
    activeIncidents?: unknown[];
    health?: {
      status?: HealthStatus;
      reasons?: string[];
      latest_telemetry_at?: string | null;
      latestTelemetryAt?: string | null;
      pnl?: number | null;
      drawdown?: number | null;
      activeSessions?: number;
    };
  };
  meta?: {
    snapshot_at?: string;
    surfaces?: Record<string, PersonaManagementSurfaceStatus>;
  };
  // Fallback flat persona shape (current FE Persona type).
  persona?: Persona | null;
  // Optional runtime readback when caller has fetched runtime detail.
  runtime?: Runtime | Record<string, unknown> | null;
  // True when the authoritative persona-management read failed or returned unavailable.
  managementUnavailable?: boolean;
}

const ACTIVE_LIFECYCLE = new Set([
  "paper_owner",
  "live_owner",
  "active",
  "paper_running",
  "paper_active",
  "live_running",
  "live_active",
  "canary_running",
  "deployed",
  "ready",
  "running",
]);

const HALTED_OR_TERMINAL_LIFECYCLE = new Set([
  "paused",
  "suspended",
  "frozen",
  "retired",
  "archived",
  "deprecated",
  "provisioning_failed",
]);

const INACTIVE_BINDING_STATES = new Set([
  "pending",
  "draft",
  "suspended",
  "revoked",
  "expired",
  "retired",
  "inactive",
  "failed",
  "rejected",
  "terminated",
  "archived",
  "cancelled",
  "canceled",
]);

const INACTIVE_POOL_STATES = new Set([
  "frozen",
  "retired",
  "suspended",
  "inactive",
  "rejected",
  "archived",
]);

const INACTIVE_PLAN_STATES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "failed",
  "aborted",
  "rolled_back",
  "retired",
  "revoked",
  "archived",
]);

const COMPLETED_DEPLOYMENT_READBACK_STATES = new Set([
  "completed",
  "approved",
  "executing",
  "executed",
  "active",
  "running",
  "admitted",
]);

const APPROVED_DECISION_VALUES = new Set([
  "approve",
  "approved",
  "approved_with_conditions",
]);

const ACTIVE_RUNTIME_STATES = new Set([
  "active",
  "running",
  "ready",
  "ok",
  "idle",
  "healthy",
  "bound",
  "paper_running",
  "live_running",
]);

const PAUSED_RUNTIME_STATES = new Set([
  "paused",
  "suspended",
  "frozen",
  "halted",
  "standby",
]);

const RETIRED_RUNTIME_STATES = new Set([
  "retired",
  "stopped",
  "terminated",
  "decommissioned",
  "archived",
  "killed",
  "cancelled",
  "canceled",
  "failed",
  "failed_inactive",
  "error",
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normStr(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function nonEmptyStr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveCanonicalLifecycle(
  wrappedPersona: Record<string, unknown> | undefined,
  flatPersona: Persona | undefined,
): { state: string; halted: boolean } {
  const metadata = asRecord(wrappedPersona?.metadata);
  const flatRec = asRecord(flatPersona);

  const containment =
    normStr(wrappedPersona?.containment_state) ||
    normStr(metadata?.containment_state) ||
    normStr(flatRec?.containment_state);
  const frozen =
    wrappedPersona?.frozen === true ||
    metadata?.frozen === true ||
    flatRec?.frozen === true ||
    containment === "frozen";
  const recordStatus = normStr(wrappedPersona?.status) || normStr(flatRec?.status);

  const rawWrappedLifecycle =
    normStr(wrappedPersona?.lifecycle_state) || normStr(wrappedPersona?.lifecycleState);
  const metaLifecycle =
    normStr(metadata?.lifecycle_state) || normStr(metadata?.lifecycleState);
  const wrappedCanonical =
    normStr(wrappedPersona?.lifecycleStatus) || normStr(wrappedPersona?.state);
  const flatLifecycleStatus = normStr(flatPersona?.lifecycleStatus);
  const flatState =
    normStr(flatPersona?.state) ||
    normStr(flatRec?.lifecycle_state) ||
    normStr(flatRec?.lifecycleState);

  const candidates = [
    wrappedCanonical,
    metaLifecycle,
    flatLifecycleStatus,
    rawWrappedLifecycle,
    flatState,
  ].filter(Boolean);

  const haltedCandidate = candidates.find((c) => HALTED_OR_TERMINAL_LIFECYCLE.has(c));
  if (
    frozen ||
    recordStatus === "suspended" ||
    recordStatus === "archived" ||
    recordStatus === "retired" ||
    Boolean(haltedCandidate)
  ) {
    return {
      state: haltedCandidate || (frozen ? "frozen" : recordStatus || "suspended"),
      halted: true,
    };
  }

  // `create-paper-bundle` stores `lifecycle_state = "draft"` on the base row while writing
  // canonical `"paper_running"` to `metadata.lifecycle_state` and the projected Persona DTO.
  for (const candidate of candidates) {
    if (candidate !== "draft") {
      return { state: candidate, halted: false };
    }
  }

  return { state: candidates[0] ?? "", halted: false };
}

function extractRuntimeStateTokens(record: Record<string, unknown> | undefined): string[] {
  if (!record) return [];
  const meta = asRecord(record.metadata);
  return [
    normStr(record.paper_runtime_state),
    normStr(record.runtime_status),
    normStr(record.runtime_state),
    normStr(record.status),
    normStr(record.state),
    normStr(record.lifecycle_state),
    normStr(meta?.paper_runtime_state),
    normStr(meta?.status),
  ].filter(Boolean);
}

export function derivePersonaReadiness(
  input: PersonaManagementShape | Persona | undefined | null,
): PersonaReadiness {
  if (!input) {
    return {
      stages: STAGE_ORDER.map((k) => ({
        key: k,
        done: false,
        status: "unavailable",
        blockedReason: k === "lifecycle" ? "persona_lifecycle_not_active" : undefined,
      })),
      completed: 0,
      total: 5,
      nextStage: "lifecycle",
      healthStatus: "unknown",
      reasons: [],
      mode: "unknown",
    };
  }

  const asMgmt = input as PersonaManagementShape;
  const isWrapper =
    typeof input === "object" &&
    input !== null &&
    ("data" in input ||
      "meta" in input ||
      "managementUnavailable" in input ||
      ("persona" in input && typeof asMgmt.persona === "object") ||
      ("runtime" in input && typeof asMgmt.runtime === "object"));

  const wrapped = isWrapper ? asMgmt.data ?? undefined : undefined;
  const meta = isWrapper ? asMgmt.meta : undefined;
  const flat = isWrapper ? (asMgmt.persona ?? undefined) : (input as Persona);
  const explicitRuntime = isWrapper ? asRecord(asMgmt.runtime) : undefined;
  const managementUnavailable = isWrapper ? Boolean(asMgmt.managementUnavailable) : false;

  const wrappedPersona = asRecord(wrapped?.persona);
  const personaMeta = asRecord(wrappedPersona?.metadata);
  const authReadback = asRecord(personaMeta?.provisioning_authoritative_readback);

  const isSurfaceUnavailable = (keys: string[]): boolean => {
    if (!wrapped || managementUnavailable) return true;
    const surfaces = meta?.surfaces;
    if (!surfaces) return false;
    return keys.some((k) => normStr(surfaces[k]?.status) === "unavailable");
  };

  // 1. Lifecycle stage — never inferred from flat IDs alone; respects halted/terminal overrides.
  const { state: lifecycleState, halted: lifecycleHalted } = resolveCanonicalLifecycle(
    wrappedPersona,
    flat,
  );
  const lifecycleDone = !lifecycleHalted && ACTIVE_LIFECYCLE.has(lifecycleState);
  const lifecycleStatus: PersonaStageStatus = lifecycleDone
    ? "done"
    : lifecycleState
      ? "not_upgraded"
      : "unavailable";

  // 2. Capital Binding stage — requires an actual active binding in `wrapped.bindings`.
  const rawBindings = Array.isArray(wrapped?.bindings) ? wrapped.bindings : undefined;
  const bindingUnavailable =
    !wrapped ||
    managementUnavailable ||
    rawBindings === undefined ||
    isSurfaceUnavailable(["persona_bindings", "capital_pool_bindings"]);
  const activeBindings = bindingUnavailable
    ? []
    : (rawBindings ?? [])
        .map(asRecord)
        .filter((b): b is Record<string, unknown> => {
          if (!b) return false;
          const bStatus = normStr(b.status) || normStr(b.state) || normStr(b.validity);
          if (!bStatus || INACTIVE_BINDING_STATES.has(bStatus)) return false;
          const pool = asRecord(b.capital_pool) ?? asRecord(b.capitalPool);
          const poolStatus = normStr(pool?.status) || normStr(pool?.state);
          if (poolStatus && INACTIVE_POOL_STATES.has(poolStatus)) return false;
          return true;
        });

  const bindingDone = activeBindings.length > 0;
  const bindingStatus: PersonaStageStatus = bindingDone
    ? "done"
    : bindingUnavailable
      ? "unavailable"
      : "not_created";

  // Inspect runtimeBindings and runtime surface availability early so we can also
  // cross-verify authoritative deployment readback against positive current runtime state.
  const rawRuntimeBindings = Array.isArray(wrapped?.runtimeBindings)
    ? wrapped.runtimeBindings
    : undefined;
  const runtimeBindingRecords = (rawRuntimeBindings ?? [])
    .map(asRecord)
    .filter((rb): rb is Record<string, unknown> => Boolean(rb));

  const explicitRuntimeTokens = extractRuntimeStateTokens(explicitRuntime);
  const readbackPaperWorker = asRecord(authReadback?.paper_worker);
  const readbackRuntimeBinding = asRecord(authReadback?.runtime_binding);
  const readbackRuntimeTokens = [
    ...extractRuntimeStateTokens(readbackPaperWorker),
    ...extractRuntimeStateTokens(readbackRuntimeBinding),
  ];

  const explicitPaused = explicitRuntimeTokens.some((t) => PAUSED_RUNTIME_STATES.has(t));
  const explicitRetired = explicitRuntimeTokens.some((t) => RETIRED_RUNTIME_STATES.has(t));
  const readbackPaused = readbackRuntimeTokens.some((t) => PAUSED_RUNTIME_STATES.has(t));
  const readbackRetired = readbackRuntimeTokens.some((t) => RETIRED_RUNTIME_STATES.has(t));
  const runtimeHaltedByOverride =
    explicitPaused ||
    explicitRetired ||
    ((readbackPaused || readbackRetired) &&
      !explicitRuntimeTokens.some((t) => ACTIVE_RUNTIME_STATES.has(t)));

  const runtimeUnavailable =
    !wrapped ||
    managementUnavailable ||
    rawRuntimeBindings === undefined ||
    isSurfaceUnavailable(["runtime_bindings", "persona_health"]);

  const activeRuntimeBindings =
    runtimeUnavailable || runtimeHaltedByOverride
      ? []
      : runtimeBindingRecords.filter((rb) => {
          const tokens = extractRuntimeStateTokens(rb);
          if (tokens.length === 0) return false;
          if (
            tokens.some((t) => PAUSED_RUNTIME_STATES.has(t) || RETIRED_RUNTIME_STATES.has(t))
          ) {
            return false;
          }
          return tokens.some((t) => ACTIVE_RUNTIME_STATES.has(t));
        });

  // 3. Deployment Plan stage — from `wrapped.deploymentPlans` or cross-verified owner readback.
  const rawPlans = Array.isArray(wrapped?.deploymentPlans) ? wrapped.deploymentPlans : undefined;
  const planSurfaceUnavailable = isSurfaceUnavailable(["deployment_plans"]);
  const validPlans = planSurfaceUnavailable
    ? []
    : (rawPlans ?? [])
        .map(asRecord)
        .filter((p): p is Record<string, unknown> => {
          if (!p) return false;
          const pStatus =
            normStr(p.status) ||
            normStr(p.state) ||
            normStr(p.saga_status) ||
            normStr(p.progress_status);
          return Boolean(pStatus) && !INACTIVE_PLAN_STATES.has(pStatus);
        });

  const readbackDeployment = asRecord(authReadback?.deployment);
  const readbackPlanId = nonEmptyStr(readbackDeployment?.plan_id);
  const readbackPlanState =
    normStr(readbackDeployment?.saga_status) ||
    normStr(readbackDeployment?.progress_status) ||
    normStr(readbackDeployment?.status);
  const authoritativePlanDone =
    !runtimeUnavailable &&
    Boolean(readbackPlanId) &&
    COMPLETED_DEPLOYMENT_READBACK_STATES.has(readbackPlanState) &&
    bindingDone &&
    activeRuntimeBindings.some(
      (rb) =>
        nonEmptyStr(rb.plan_id) === readbackPlanId ||
        nonEmptyStr(rb.deployment_plan_id) === readbackPlanId,
    );

  const planDone = validPlans.length > 0 || authoritativePlanDone;
  const planUnavailable =
    !wrapped ||
    managementUnavailable ||
    rawPlans === undefined ||
    planSurfaceUnavailable;
  const planStatus: PersonaStageStatus = planDone
    ? "done"
    : planUnavailable
      ? "unavailable"
      : "not_created";

  // 4. Governance Approval stage — handles `state: "decided"` + `outcome: "approved"`,
  // approved deployment plans, or cross-verified owner readback.
  const rawApprovals = Array.isArray(wrapped?.approvals) ? wrapped.approvals : undefined;
  const approvalSurfaceUnavailable = isSurfaceUnavailable(["approvals"]);
  const approvedInList =
    !approvalSurfaceUnavailable &&
    (rawApprovals ?? [])
      .map(asRecord)
      .some((a) => {
        if (!a) return false;
        const outcome = normStr(a.decision) || normStr(a.outcome) || normStr(a.resolution);
        const state = normStr(a.state) || normStr(a.status) || normStr(a.decision_state);
        if (APPROVED_DECISION_VALUES.has(outcome) || APPROVED_DECISION_VALUES.has(state)) {
          return true;
        }
        if (state === "decided" && outcome && APPROVED_DECISION_VALUES.has(outcome)) {
          return true;
        }
        return false;
      });

  const approvedInPlan = validPlans.some((p) => {
    const pStatus = normStr(p.status) || normStr(p.state);
    const decisionId =
      nonEmptyStr(p.approval_decision_id) ?? nonEmptyStr(p.approvalDecisionId);
    return (
      Boolean(decisionId) &&
      COMPLETED_DEPLOYMENT_READBACK_STATES.has(pStatus)
    );
  });

  const hasBindingApprovalId = activeBindings.some(
    (b) =>
      Boolean(nonEmptyStr(b.approval_decision_id)) ||
      Boolean(nonEmptyStr(b.approvalDecisionId)),
  );
  const hasMetadataApprovalId = Boolean(nonEmptyStr(personaMeta?.approval_decision_id));
  const authoritativeApprovalDone =
    authoritativePlanDone && (hasBindingApprovalId || hasMetadataApprovalId);

  const approvalDone = approvedInList || approvedInPlan || authoritativeApprovalDone;
  const approvalUnavailable =
    !wrapped ||
    managementUnavailable ||
    rawApprovals === undefined ||
    approvalSurfaceUnavailable;
  const approvalStatus: PersonaStageStatus = approvalDone
    ? "done"
    : approvalUnavailable
      ? "unavailable"
      : "not_submitted";

  // 5. Runtime stage — checks actual runtime / binding state, distinguishing paused and retired,
  // and honoring explicit surface unavailability before declaring runtime done.
  const allBindingTokens = runtimeBindingRecords.flatMap(extractRuntimeStateTokens);
  const bindingsPaused =
    !runtimeUnavailable &&
    runtimeBindingRecords.length > 0 &&
    activeRuntimeBindings.length === 0 &&
    allBindingTokens.some((t) => PAUSED_RUNTIME_STATES.has(t));
  const bindingsRetired =
    !runtimeUnavailable &&
    runtimeBindingRecords.length > 0 &&
    activeRuntimeBindings.length === 0 &&
    allBindingTokens.some((t) => RETIRED_RUNTIME_STATES.has(t));

  let runtimeDone = false;
  let runtimeStatus: PersonaStageStatus = "not_started";
  let runtimeBlockedReason: string | undefined = "no_runtime_binding";

  if (runtimeUnavailable) {
    runtimeDone = false;
    runtimeStatus = "unavailable";
    runtimeBlockedReason = "no_runtime_binding";
  } else if (
    explicitPaused ||
    bindingsPaused ||
    (readbackPaused && !explicitRuntimeTokens.some((t) => ACTIVE_RUNTIME_STATES.has(t)))
  ) {
    runtimeDone = false;
    runtimeStatus = "paused";
    runtimeBlockedReason = "runtime_status_attention";
  } else if (
    explicitRetired ||
    bindingsRetired ||
    (readbackRetired && !explicitRuntimeTokens.some((t) => ACTIVE_RUNTIME_STATES.has(t)))
  ) {
    runtimeDone = false;
    runtimeStatus = "retired";
    runtimeBlockedReason = "runtime_status_attention";
  } else if (activeRuntimeBindings.length > 0) {
    runtimeDone = true;
    runtimeStatus = "done";
    runtimeBlockedReason = undefined;
  } else {
    runtimeDone = false;
    runtimeStatus = "not_started";
    runtimeBlockedReason = "no_runtime_binding";
  }

  const stages: PersonaStageState[] = [
    {
      key: "lifecycle",
      done: lifecycleDone,
      status: lifecycleStatus,
      blockedReason: lifecycleDone ? undefined : "persona_lifecycle_not_active",
    },
    {
      key: "binding",
      done: bindingDone,
      status: bindingStatus,
      blockedReason: bindingDone ? undefined : "no_binding",
    },
    {
      key: "plan",
      done: planDone,
      status: planStatus,
      blockedReason: planDone ? undefined : "no_deployment_plan",
    },
    {
      key: "approval",
      done: approvalDone,
      status: approvalStatus,
      blockedReason: approvalDone ? undefined : "no_approval",
    },
    {
      key: "runtime",
      done: runtimeDone,
      status: runtimeStatus,
      blockedReason: runtimeBlockedReason,
    },
  ];

  const completed = stages.filter((s) => s.done).length;
  const nextStage = stages.find((s) => !s.done)?.key;

  // Use BFF-computed health status and reasons directly without UI re-synthesis.
  const rawHealthStatus = wrapped?.health?.status;
  const healthStatus: HealthStatus =
    rawHealthStatus === "healthy" ||
    rawHealthStatus === "degraded" ||
    rawHealthStatus === "critical" ||
    rawHealthStatus === "unknown"
      ? rawHealthStatus
      : "unknown";
  const reasons: PersonaHealthReason[] = Array.isArray(wrapped?.health?.reasons)
    ? [...wrapped.health.reasons]
    : [];

  const flatRec = asRecord(flat);
  const modeTokens = [
    normStr(personaMeta?.capital_mode),
    normStr(personaMeta?.deployment_stage),
    normStr(personaMeta?.execution_mode),
    normStr(flatRec?.capitalMode),
    normStr(flatRec?.deploymentStage),
    normStr(flatRec?.capital_mode),
    normStr(flatRec?.deployment_stage),
    normStr(activeRuntimeBindings[0]?.deployment_mode),
    normStr(runtimeBindingRecords[0]?.deployment_mode),
    normStr(validPlans[0]?.deployment_mode),
    lifecycleState,
  ].filter(Boolean);

  let mode: "paper" | "live" | "canary" | "unknown" = "unknown";
  if (modeTokens.some((m) => m === "paper" || m.startsWith("paper_"))) {
    mode = "paper";
  } else if (modeTokens.some((m) => m === "live" || m.startsWith("live_"))) {
    mode = "live";
  } else if (modeTokens.some((m) => m === "canary" || m.startsWith("canary_"))) {
    mode = "canary";
  }

  const runtimeId =
    nonEmptyStr(explicitRuntime?.id) ??
    nonEmptyStr(explicitRuntime?.runtime_id) ??
    nonEmptyStr(activeRuntimeBindings[0]?.runtime_id) ??
    nonEmptyStr(runtimeBindingRecords[0]?.runtime_id) ??
    nonEmptyStr(readbackRuntimeBinding?.runtime_id) ??
    nonEmptyStr(personaMeta?.runtime_id) ??
    nonEmptyStr(flatRec?.runtimeId) ??
    nonEmptyStr(flatRec?.runtime_id);

  return {
    stages,
    completed,
    total: 5,
    nextStage,
    healthStatus,
    reasons,
    mode,
    runtimeId,
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
