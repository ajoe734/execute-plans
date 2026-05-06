// Mock mutation layer — Phase 14 (BFF × State Machine wiring).
// All mutations update in-memory seed state, validate transitions against
// the Part 7 §17 state machines when applicable, write an AuditEvent, and
// emit a realtime "data" event so subscribers can refetch.

import * as seed from "@/mocks/seed";
import type {
  AuditEvent, ApprovalRequest, Incident, Alert,
  LifecycleState, Strategy, Job, RiskLevel,
  MetricFreeze, RebalanceOverride, PromotionRecord, McpSecret,
  AllocationLimit, PoolFreeze, DeploymentStage,
} from "./types";
import type { RoutePolicy, RoutePolicyRule, PermissionMatrix, PermissionGrant, ConsultRule, PolicyVersion } from "./types";
import { realtime } from "./realtime";
import { usePlatform } from "@/platform/store";
import { machines, type MachineKey } from "@/lib/stateMachines";
import { findTransition } from "@/lib/stateMachines/types";
import { schedulePersist } from "./persistence";
import {
  issueConfirmToken,
  type ConfirmTokenRequest,
  type ConfirmTokenResponse,
  getHighRiskAction,
} from "@/lib/v3/highRiskActions";
import { idempotencyReplay, idempotencyRemember } from "@/lib/v4/idempotency";
import { explainTripleViolation } from "@/lib/v4/strategyInvariants";

const delay = <T>(v: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(v), ms));

const snap = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  try { return JSON.stringify(v); } catch { return undefined; }
};

let auditSeq = 1000;
function pushAudit(
  action: string,
  target: string,
  memo?: string,
  extras?: { before?: string; after?: string; outcome?: "ok" | "rejected" },
): AuditEvent {
  const ev: AuditEvent = {
    id: `au_${++auditSeq}`,
    actor: usePlatform.getState().role,
    action,
    target,
    ts: new Date().toISOString(),
    ...(memo ? { memo } : {}),
    ...(extras?.before ? { before: extras.before } : {}),
    ...(extras?.after ? { after: extras.after } : {}),
    ...(extras?.outcome ? { outcome: extras.outcome } : {}),
  } as AuditEvent;
  (seed.auditEvents as AuditEvent[]).unshift(ev);
  realtime.emit("audit", ev);
  realtime.emit("data", { kind: "audit" });
  schedulePersist();
  return ev;
}

function findById<T extends { id: string }>(arr: readonly T[], id: string): T | undefined {
  return arr.find((x) => x.id === id);
}

function queueMockJob(kind: string, owner = usePlatform.getState().role): Job {
  const job: Job = {
    id: `job_${Date.now().toString(36)}`,
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
    owner,
  };
  (seed.jobs as Job[]).unshift(job);
  realtime.emit("job", { jobId: job.id, kind: job.kind, owner: job.owner, ts: job.startedAt, status: "running" });
  realtime.emit("data", { kind: "Job" });
  setTimeout(() => {
    job.status = "success";
    job.durationMs = 1_800;
    realtime.emit("job", { jobId: job.id, kind: job.kind, owner: job.owner, ts: new Date().toISOString(), status: "success" });
    realtime.emit("data", { kind: "Job" });
  }, 1800);
  return job;
}

// ---- Phase 14 Slice A: kind → state machine ----
const KIND_TO_MACHINE: Record<string, MachineKey> = {
  Strategy: "strategy",
  Persona: "persona",
  CapitalPool: "capitalPool",
  RankingFormula: "rankingFormula",
  Rebalance: "rebalance",
  Evolution: "evolution",
  Deployment: "deployment",
  Approval: "approval",
  Alert: "alert",
  Incident: "incident",
  Tool: "tool",
  McpServer: "mcpServer",
  Skill: "skill",
};

export type RunActionInput = {
  /** Entity kind, e.g. "Strategy", "Persona", "CapitalPool", "Approval", "Incident", "Alert", "Deployment", "Rebalance", "Skill", "McpTool". */
  kind: string;
  id: string;
  action: string;
  /** New lifecycle state to write (when applicable). */
  newState?: LifecycleState | string;
  memo?: string;
  /** Pack C C010 — optimistic-lock guard. */
  expectedVersion?: number;
  /** Pack C C028 — replay guard. */
  idempotencyKey?: string;
};

export type MutationResult = {
  ok: boolean;
  audit: AuditEvent;
  message?: string;
  /** When a guard rejected the action. */
  rejected?: "illegal_transition" | "unknown_entity" | "state_conflict" | "invariant_violation";
};

const SEED_COLLECTIONS: Record<string, readonly { id: string; state?: string }[]> = {
  Strategy: seed.strategies,
  Persona: seed.personas,
  CapitalPool: seed.capitalPools,
  Rebalance: seed.rebalances,
  Deployment: seed.deployments,
  Evolution: seed.evolutionPrograms,
  Research: seed.researchExperiments,
  Artifact: seed.artifacts,
  RankingFormula: seed.rankingFormulas,
  Tool: seed.tools,
  McpServer: seed.mcpServers,
  McpTool: seed.mcpTools,
  Skill: seed.skills,
  Channel: seed.channels,
};

function setState(kind: string, id: string, newState: string | undefined): boolean {
  if (!newState) return false;
  const col = SEED_COLLECTIONS[kind];
  if (!col) return false;
  const o = findById(col, id) as { state?: string } | undefined;
  if (!o) return false;
  o.state = newState;
  realtime.emit("data", { kind });
  return true;
}

/**
 * Slice A: Validate (kind, fromState, action) against the state machine.
 * Permissive when the seed state is foreign to the machine vocabulary
 * (legacy phases used `LifecycleState` like "deployed"/"review"), so the
 * existing UI keeps working while new flows opt into machine vocab.
 */
type GuardResult =
  | { ok: true; resolvedState?: string }
  | { ok: false; reason: string };

function validateTransition(
  kind: string, id: string, action: string, newState?: string,
): GuardResult {
  const mKey = KIND_TO_MACHINE[kind];
  if (!mKey) return { ok: true, resolvedState: newState };
  const machine = machines[mKey];
  const col = SEED_COLLECTIONS[kind];
  const obj = col ? findById(col, id) as { state?: string } | undefined : undefined;
  const fromState = obj?.state;

  const machineStates = new Set<string>([
    ...machine.states,
    ...(machine.branchStates ?? []),
  ]);
  if (!fromState || !machineStates.has(fromState)) {
    return { ok: true, resolvedState: newState };
  }
  const tr = findTransition(machine, fromState, action);
  if (!tr) return { ok: false, reason: "illegal_transition" };
  if (newState && newState !== tr.to) {
    return { ok: false, reason: "illegal_transition" };
  }
  return { ok: true, resolvedState: tr.to };
}

export const mutations = {
  /** Generic state-machine action. Validates transition, updates state, writes audit, emits realtime. */
  runAction(input: RunActionInput): Promise<MutationResult> {
    const { kind, id, action, newState, memo } = input;
    const col = SEED_COLLECTIONS[kind];
    const obj = col ? findById(col, id) as { state?: string; lockVersion?: number; lifecycleStatus?: string; reviewStatus?: string; deploymentStatus?: string } | undefined : undefined;
    const before = snap(obj);

    // Pack C C028 — idempotency-key replay (same key returns prior result within 24h).
    if (input.idempotencyKey) {
      const replay = idempotencyReplay<MutationResult>(input.idempotencyKey);
      if (replay) return delay(replay);
    }
    // Pack C C010 — optimistic lock check.
    if (input.expectedVersion !== undefined && obj && obj.lockVersion !== undefined &&
        obj.lockVersion !== input.expectedVersion) {
      const audit = pushAudit(
        `${kind.toLowerCase()}.optimistic_lock_failed`, id,
        `expected v${input.expectedVersion}, actual v${obj.lockVersion}`,
        { before, outcome: "rejected" },
      );
      const result: MutationResult = { ok: false, audit, rejected: "state_conflict",
        message: `STATE_CONFLICT: expected v${input.expectedVersion}, got v${obj.lockVersion}` };
      return delay(result);
    }
    const guard = validateTransition(kind, id, action, newState);
    if (guard.ok === false) {
      const audit = pushAudit(
        `${kind.toLowerCase()}.illegal_transition`, id, `${action}: ${guard.reason}`,
        { before, outcome: "rejected" },
      );
      const result: MutationResult = { ok: false, audit, rejected: "illegal_transition", message: guard.reason };
      if (input.idempotencyKey) idempotencyRemember(input.idempotencyKey, result);
      return delay(result);
    }
    setState(kind, id, guard.resolvedState);
    // Pack C C008 — Strategy three-axis invariant guard (best-effort, only when triple present).
    if (kind === "Strategy" && obj?.lifecycleStatus && obj.reviewStatus && obj.deploymentStatus) {
      const violation = explainTripleViolation({
        lifecycleStatus: obj.lifecycleStatus as never,
        reviewStatus: obj.reviewStatus as never,
        deploymentStatus: obj.deploymentStatus as never,
      });
      if (violation) {
        const audit = pushAudit(
          "strategy.invariant_violation", id, violation,
          { before, after: snap(obj), outcome: "rejected" },
        );
        const result: MutationResult = { ok: false, audit, rejected: "invariant_violation", message: violation };
        if (input.idempotencyKey) idempotencyRemember(input.idempotencyKey, result);
        return delay(result);
      }
    }
    // Pack C C010 — bump lockVersion on successful state mutation.
    if (obj && guard.resolvedState !== undefined) {
      obj.lockVersion = (obj.lockVersion ?? 0) + 1;
    }
    const audit = pushAudit(
      `${kind.toLowerCase()}.${action}`, id, memo,
      { before, after: snap(obj), outcome: "ok" },
    );
    const result: MutationResult = { ok: true, audit, message: `${action} applied` };
    if (input.idempotencyKey) idempotencyRemember(input.idempotencyKey, result);
    return delay(result);
  },

  approve(id: string, memo?: string): Promise<MutationResult> {
    const a = findById(seed.approvals, id);
    if (a) a.state = "approved";
    realtime.emit("data", { kind: "Approval" });
    const audit = pushAudit("approval.approve", id, memo);
    return delay({ ok: true, audit });
  },
  reject(id: string, memo?: string): Promise<MutationResult> {
    const a = findById(seed.approvals, id);
    if (a) a.state = "rejected";
    realtime.emit("data", { kind: "Approval" });
    const audit = pushAudit("approval.reject", id, memo);
    return delay({ ok: true, audit });
  },

  /** Phase 20 — create a new approval request from an Agora handoff
   *  (skill draft, persona update, mcp tool grant, etc.). The new request
   *  lands in the Governance queue with structured stages, surfaces in
   *  Command Center "incoming items", and writes a discoverable audit. */
  createApproval(input: {
    kind: string;
    subject: string;
    rationale?: string;
    diffSummary?: string;
    riskLevel?: RiskLevel;
    stages?: { name: string; slaHours: number; escalateTo?: string }[];
    handoffId?: string;
  }): Promise<MutationResult & { approval: ApprovalRequest }> {
    const stages = (input.stages ?? [{ name: "reviewer", slaHours: 12 }]).map((s, i) => ({
      name: s.name,
      state: "pending" as const,
      slaHours: s.slaHours,
      escalateTo: s.escalateTo,
      startedAt: i === 0 ? new Date().toISOString() : undefined,
    }));
    const req: ApprovalRequest = {
      id: `ap_${Date.now().toString(36)}`,
      kind: input.kind,
      subject: input.subject,
      requester: usePlatform.getState().role,
      state: "pending",
      riskLevel: input.riskLevel ?? "medium",
      createdAt: new Date().toISOString(),
      rationale: input.rationale,
      diffSummary: input.diffSummary,
      requiresStages: stages.map((s) => s.name),
      stages,
    };
    (seed.approvals as ApprovalRequest[]).unshift(req);
    realtime.emit("data", { kind: "Approval" });
    const audit = pushAudit(
      "approval.create", req.id,
      input.handoffId ? `from handoff ${input.handoffId}: ${input.subject}` : input.subject,
      { after: snap(req), outcome: "ok" },
    );
    return delay({ ok: true, audit, approval: req });
  },

  /** Phase 21 — advance one rebalance workflow step. Marks current in_progress
   *  as complete, opens the next pending one, and (when defined) queues the
   *  step's mock job (e.g. start_metrics_freeze, rebalance.apply, validators). */
  advanceRebalanceStep(rebalanceId: string, memo?: string): Promise<MutationResult & { stepId?: string; jobId?: string }> {
    const steps = seed.rebalanceWorkflowSteps(rebalanceId);
    const idx = steps.findIndex((s) => s.status === "in_progress");
    if (idx === -1) {
      const audit = pushAudit("rebalance.workflow.noop", rebalanceId, "no in-progress step", { outcome: "rejected" });
      return delay({ ok: false, audit, message: "no in-progress step" });
    }
    const cur = steps[idx];
    cur.status = "complete";
    cur.ts = new Date().toISOString();
    cur.actor = usePlatform.getState().role;
    if (memo) cur.note = memo;
    const next = steps[idx + 1];
    let jobId: string | undefined;
    if (next) {
      next.status = "in_progress";
      next.ts = new Date().toISOString();
      if (next.jobKind) {
        const job = queueMockJob(next.jobKind);
        jobId = job.id;
      }
    }
    realtime.emit("data", { kind: "RebalanceStep" });
    const audit = pushAudit("rebalance.workflow.advance", rebalanceId, `${cur.id} → complete${next ? `; ${next.id} → in_progress` : ""}`, { outcome: "ok" });
    return delay({ ok: true, audit, stepId: cur.id, jobId });
  },

  /** Phase 21 — run a step's job again without advancing (re-simulate, re-validate). */
  rerunRebalanceStep(rebalanceId: string, stepId: string): Promise<MutationResult & { jobId?: string }> {
    const steps = seed.rebalanceWorkflowSteps(rebalanceId);
    const step = steps.find((s) => s.id === stepId);
    if (!step?.jobKind) {
      const audit = pushAudit("rebalance.workflow.rerun_skipped", rebalanceId, stepId, { outcome: "rejected" });
      return delay({ ok: false, audit });
    }
    const job = queueMockJob(step.jobKind);
    const audit = pushAudit("rebalance.workflow.rerun", rebalanceId, `${stepId} → ${step.jobKind}`, { outcome: "ok" });
    return delay({ ok: true, audit, jobId: job.id });
  },

  acknowledgeAlert(id: string, memo?: string): Promise<MutationResult> {
    const a = findById(seed.alerts, id);
    if (a) a.acknowledged = true;
    realtime.emit("data", { kind: "Alert" });
    const audit = pushAudit("alert.acknowledge", id, memo);
    return delay({ ok: true, audit });
  },

  /** Phase P1 — Escalate an alert into an Incident, linking the alert as evidence. */
  escalateAlertToIncident(alertId: string, memo?: string): Promise<MutationResult & { incidentId: string }> {
    const alert = findById(seed.alerts, alertId);
    const id = `inc_${Date.now().toString(36)}`;
    const inc: Incident = {
      id,
      severity: alert?.severity ?? "high",
      title: alert ? `Escalated: ${alert.title}` : `Escalated alert ${alertId}`,
      status: "open",
      openedAt: new Date().toISOString(),
      description: memo,
      affected: alert?.relatedTarget ? [alert.relatedTarget] : [],
      commander: usePlatform.getState().role,
      timeline: [{ ts: new Date().toISOString(), actor: usePlatform.getState().role, note: memo ?? `Escalated from ${alertId}` }],
    };
    (seed.incidents as Incident[]).unshift(inc);
    if (alert) alert.acknowledged = true;
    realtime.emit("data", { kind: "Incident" });
    realtime.emit("data", { kind: "Alert" });
    const audit = pushAudit("alert.escalate_incident", alertId, `→ ${id}`, { outcome: "ok" });
    return delay({ ok: true, audit, incidentId: id, message: `Incident ${id} opened` });
  },

  /** Phase P1 — Append a postmortem note to an incident's timeline. */
  appendPostmortem(incidentId: string, note: string): Promise<MutationResult> {
    const inc = findById(seed.incidents, incidentId);
    if (inc) {
      inc.timeline = [
        ...(inc.timeline ?? []),
        { ts: new Date().toISOString(), actor: usePlatform.getState().role, note: `[postmortem] ${note}` },
      ];
    }
    realtime.emit("data", { kind: "Incident" });
    const audit = pushAudit("incident.postmortem.append", incidentId, note.slice(0, 80));
    return delay({ ok: true, audit });
  },

  setIncidentStatus(id: string, status: Incident["status"], memo?: string): Promise<MutationResult> {
    const i = findById(seed.incidents, id);
    if (i) {
      i.status = status;
      i.timeline = [
        ...(i.timeline ?? []),
        { ts: new Date().toISOString(), actor: usePlatform.getState().role, note: memo ?? `status → ${status}` },
      ];
    }
    realtime.emit("data", { kind: "Incident" });
    const audit = pushAudit(`incident.${status}`, id, memo);
    return delay({ ok: true, audit });
  },

  promoteLive(strategyId: string, memo?: string): Promise<MutationResult> {
    const s = findById(seed.strategies, strategyId);
    if (s) (s as Strategy).state = "deployed";
    realtime.emit("data", { kind: "Strategy" });
    const audit = pushAudit("strategy.promote_live", strategyId, memo);
    return delay({ ok: true, audit });
  },

  createResearchTaskFromNote(noteId: string, memo?: string): Promise<MutationResult & { job: Job }> {
    const job = queueMockJob("research_task.scaffold");
    const audit = pushAudit("notebook.convert_research_task", noteId, memo);
    return delay({ ok: true, audit, job, message: `Research task queued: ${job.id}` });
  },

  rollback(kind: string, id: string, memo?: string): Promise<MutationResult> {
    setState(kind, id, "paused");
    const audit = pushAudit(`${kind.toLowerCase()}.rollback`, id, memo);
    return delay({ ok: true, audit });
  },

  pause(kind: string, id: string, memo?: string): Promise<MutationResult> {
    setState(kind, id, "paused");
    const audit = pushAudit(`${kind.toLowerCase()}.pause`, id, memo);
    return delay({ ok: true, audit });
  },

  // ---- Phase 14 Slice B: typed Phase 13 helpers ----

  lockParams(strategyId: string, lock: boolean, memo?: string): Promise<MutationResult> {
    const s = findById(seed.strategies, strategyId) as (Strategy & { paramsLocked?: boolean }) | undefined;
    if (s) s.paramsLocked = lock;
    realtime.emit("data", { kind: "Strategy" });
    const audit = pushAudit(lock ? "strategy.lock_params" : "strategy.unlock_params", strategyId, memo);
    return delay({ ok: true, audit });
  },

  freezeMetric(rebalanceId: string, metric: string, frozen: boolean, memo?: string): Promise<MutationResult> {
    const list = seed.metricFreezes as MetricFreeze[];
    let row = list.find((m) => m.rebalanceId === rebalanceId && m.metric === metric);
    if (!row) {
      row = { id: `mf_${Date.now().toString(36)}`, rebalanceId, metric, frozen };
      list.unshift(row);
    } else {
      row.frozen = frozen;
    }
    row.frozenAt = frozen ? new Date().toISOString() : undefined;
    row.frozenBy = frozen ? usePlatform.getState().role : undefined;
    realtime.emit("data", { kind: "MetricFreeze" });
    const audit = pushAudit(frozen ? "rebalance.freeze_metric" : "rebalance.unfreeze_metric", rebalanceId, memo ?? metric);
    return delay({ ok: true, audit });
  },

  submitOverride(rebalanceId: string, strategyId: string, delta: number, reason: string): Promise<MutationResult> {
    const row: RebalanceOverride = {
      id: `ov_${Date.now().toString(36)}`,
      rebalanceId, strategyId, delta, reason,
      state: "review",
      proposedBy: usePlatform.getState().role,
      proposedAt: new Date().toISOString(),
    };
    (seed.rebalanceOverrides as RebalanceOverride[]).unshift(row);
    realtime.emit("data", { kind: "RebalanceOverride" });
    const audit = pushAudit("rebalance.submit_override", rebalanceId, `${strategyId} Δ${delta}`);
    return delay({ ok: true, audit });
  },

  promoteCandidate(programId: string, candidateId: string, target: "paper" | "live", memo?: string): Promise<MutationResult> {
    const cand = seed.evolutionCandidates.find((c) => c.id === candidateId);
    if (cand) cand.state = "promoted";
    const rec: PromotionRecord = {
      id: `pr_${Date.now().toString(36)}`,
      programId, candidateId, target,
      promotedAt: new Date().toISOString(),
      promotedBy: usePlatform.getState().role,
      deltaSharpe: cand ? +(cand.fitness * 0.05).toFixed(3) : 0,
      deltaDrawdown: cand ? +(cand.fitness * -0.01).toFixed(3) : 0,
    };
    (seed.promotions as PromotionRecord[]).unshift(rec);
    realtime.emit("data", { kind: "Promotion" });
    const audit = pushAudit(`evolution.promote_${target}`, candidateId, memo);
    return delay({ ok: true, audit });
  },

  rotateMcpSecret(secretId: string, memo?: string): Promise<MutationResult> {
    const s = (seed.mcpSecrets as McpSecret[]).find((x) => x.id === secretId);
    if (s) {
      s.lastRotatedAt = new Date().toISOString();
      s.rotatedBy = usePlatform.getState().role;
    }
    realtime.emit("data", { kind: "McpSecret" });
    const audit = pushAudit("mcp.rotate_secret", secretId, memo);
    return delay({ ok: true, audit });
  },

  setAllocationLimit(poolId: string, scope: AllocationLimit["scope"], scopeRef: string, cap: number): Promise<MutationResult> {
    const list = seed.allocationLimits as AllocationLimit[];
    const existing = list.find((l) => l.poolId === poolId && l.scope === scope && l.scopeRef === scopeRef);
    const actor = usePlatform.getState().role;
    if (existing) {
      existing.cap = cap;
      existing.updatedBy = actor;
      existing.updatedAt = new Date().toISOString();
    } else {
      list.unshift({
        id: `al_${Date.now().toString(36)}`,
        poolId, scope, scopeRef, cap,
        updatedBy: actor, updatedAt: new Date().toISOString(),
      });
    }
    realtime.emit("data", { kind: "AllocationLimit" });
    const audit = pushAudit("capitalPool.set_limit", poolId, `${scope}:${scopeRef} cap ${(cap * 100).toFixed(0)}%`);
    return delay({ ok: true, audit });
  },

  freezePool(poolId: string, reason: string): Promise<MutationResult> {
    const row: PoolFreeze = {
      id: `pf_${Date.now().toString(36)}`,
      poolId, reason,
      frozenBy: usePlatform.getState().role,
      frozenAt: new Date().toISOString(),
      active: true,
    };
    (seed.poolFreezes as PoolFreeze[]).unshift(row);
    realtime.emit("data", { kind: "PoolFreeze" });
    const audit = pushAudit("capitalPool.freeze_pool", poolId, reason);
    return delay({ ok: true, audit });
  },

  unfreezePool(poolId: string, freezeId: string, memo?: string): Promise<MutationResult> {
    const row = (seed.poolFreezes as PoolFreeze[]).find((f) => f.id === freezeId && f.poolId === poolId);
    if (row) row.active = false;
    realtime.emit("data", { kind: "PoolFreeze" });
    const audit = pushAudit("capitalPool.unfreeze_pool", poolId, memo ?? freezeId);
    return delay({ ok: true, audit });
  },

  promoteStage(deploymentId: string, stageId: string, memo?: string): Promise<MutationResult> {
    const stages = (seed.deploymentStages as DeploymentStage[]).filter((s) => s.deploymentId === deploymentId);
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx >= 0) {
      stages[idx].status = "complete";
      stages[idx].promotedAt = new Date().toISOString();
      const next = stages[idx + 1];
      if (next && next.status === "pending") next.status = "in_progress";
    }
    realtime.emit("data", { kind: "DeploymentStage" });
    const audit = pushAudit("deployment.promote_stage", deploymentId, memo ?? stageId);
    return delay({ ok: true, audit });
  },

  /** Phase P1 — Reduce a live deployment's allocation share without rolling back.
   *  Mock semantics: stores the new pct on the deployment as `allocationPct`,
   *  emits realtime + audit so dashboards refresh. */
  reduceAllocation(deploymentId: string, newPct: number, memo?: string): Promise<MutationResult> {
    const d = findById(seed.deployments, deploymentId) as
      (typeof seed.deployments[number] & { allocationPct?: number }) | undefined;
    const before = snap(d ? { allocationPct: d.allocationPct ?? 100 } : undefined);
    if (d) d.allocationPct = Math.max(0, Math.min(100, Math.round(newPct)));
    realtime.emit("data", { kind: "Deployment" });
    const audit = pushAudit("deployment.reduce_allocation", deploymentId,
      memo ?? `→ ${newPct}%`,
      { before, after: snap(d ? { allocationPct: d.allocationPct } : undefined), outcome: "ok" });
    return delay({ ok: true, audit, message: `Allocation set to ${newPct}%` });
  },

  freezeGeneration(programId: string, memo?: string): Promise<MutationResult> {
    const p = findById(seed.evolutionPrograms, programId) as
      (typeof seed.evolutionPrograms[number] & { generationFrozen?: boolean }) | undefined;
    if (p) p.generationFrozen = true;
    realtime.emit("data", { kind: "Evolution" });
    const audit = pushAudit("evolution.freeze_generation", programId, memo);
    return delay({ ok: true, audit });
  },

  // ---- Phase 14 Slice E: governance trio typed helpers ----

  /** Approval decision wrapper.
   *  Phase 17 — when the request has structured `stages`, the decision applies
   *  to the next pending stage and the request only finalises when all stages
   *  approve (or any stage rejects). Without stages, the decision applies to
   *  the request directly (legacy behaviour). */
  decideApproval(
    id: string,
    decision: "approve" | "reject" | "request_changes" | "escalate" | "freeze",
    memo: string,
    opts?: { stageName?: string },
  ): Promise<MutationResult> {
    const a = findById(seed.approvals, id) as ApprovalRequest | undefined;
    const before = snap(a);
    if (a) {
      if (a.stages && a.stages.length > 0 && (decision === "approve" || decision === "reject")) {
        const stage = opts?.stageName
          ? a.stages.find((s) => s.name === opts.stageName)
          : a.stages.find((s) => s.state === "pending");
        const actor = usePlatform.getState().role;
        const ts = new Date().toISOString();
        if (stage && stage.state === "pending") {
          stage.state = decision === "approve" ? "approved" : "rejected";
          stage.decidedBy = actor;
          stage.decidedAt = ts;
          stage.memo = memo;
          // Advance: open next pending stage, or finalise the request.
          if (decision === "reject") {
            a.state = "rejected";
          } else {
            const next = a.stages.find((s) => s.state === "pending");
            if (next && !next.startedAt) next.startedAt = ts;
            if (!next) a.state = "approved";
          }
        }
      } else {
        if (decision === "approve") a.state = "approved";
        else if (decision === "reject") a.state = "rejected";
      }
    }
    realtime.emit("data", { kind: "Approval" });
    const audit = pushAudit(
      `approval.${decision}`, id, opts?.stageName ? `[${opts.stageName}] ${memo}` : memo,
      { before, after: snap(a), outcome: "ok" },
    );
    return delay({ ok: true, audit });
  },

  /** Phase 17 — batch decide several requests at once. Stops on first failure. */
  async batchDecideApproval(
    ids: string[],
    decision: "approve" | "reject",
    memo: string,
  ): Promise<{ ok: boolean; results: MutationResult[] }> {
    const results: MutationResult[] = [];
    for (const id of ids) {
      results.push(await this.decideApproval(id, decision, memo));
    }
    return { ok: results.every((r) => r.ok), results };
  },

  /** Phase 17 — sweep open stages and auto-escalate any whose SLA has elapsed.
   *  Escalation: the overdue stage is marked `escalated=true` and a synthetic
   *  "committee" stage is inserted before the next pending stage (if not already
   *  present). Returns the audit events written. */
  tickApprovalSla(nowIso: string = new Date().toISOString()): Promise<{ ok: true; escalated: AuditEvent[] }> {
    const now = Date.parse(nowIso);
    const events: AuditEvent[] = [];
    for (const req of seed.approvals as ApprovalRequest[]) {
      if (req.state !== "pending" || !req.stages) continue;
      for (const stage of req.stages) {
        if (stage.state !== "pending" || stage.escalated) continue;
        const started = stage.startedAt ? Date.parse(stage.startedAt) : Date.parse(req.createdAt);
        const overdueMs = now - started - stage.slaHours * 3_600_000;
        if (overdueMs <= 0) continue;
        stage.escalated = true;
        const escalateTo = stage.escalateTo ?? "committee";
        const already = req.stages.some((s) => s.name === escalateTo);
        if (!already) {
          const idx = req.stages.indexOf(stage);
          req.stages.splice(idx + 1, 0, {
            name: escalateTo,
            state: "pending",
            slaHours: Math.max(2, Math.round(stage.slaHours / 2)),
          });
        }
        events.push(pushAudit("approval.sla_escalate", req.id, `[${stage.name}] overdue → ${escalateTo}`,
          { outcome: "ok" }));
      }
    }
    if (events.length) realtime.emit("data", { kind: "Approval" });
    return delay({ ok: true, escalated: events });
  },

  /** Phase P0 — Queue a parameter sweep job for a strategy. */
  runParameterSweep(strategyId: string, opts: { params?: string[]; memo?: string } = {}): Promise<MutationResult & { job: Job }> {
    const job = queueMockJob("strategy.param_sweep");
    const audit = pushAudit("strategy.run_sweep", strategyId, opts.memo ?? (opts.params?.join(",") ?? "all"), { outcome: "ok" });
    return delay({ ok: true, audit, job, message: `Sweep queued: ${job.id}` });
  },

  /** Phase P0 — Generic runtime row action (restart/drain/move/scale/quarantine/inspect_logs). */
  runtimeAction(runtimeId: string, action: "restart" | "drain" | "move" | "scale" | "quarantine" | "inspect_logs", memo?: string): Promise<MutationResult & { job?: Job }> {
    const r = findById(seed.runtimes, runtimeId);
    if (r && (action === "drain" || action === "quarantine")) r.status = "paused";
    if (r && action === "restart") r.status = "running";
    realtime.emit("data", { kind: "Runtime" });
    const job = action === "inspect_logs" ? undefined : queueMockJob(`runtime.${action}`);
    const audit = pushAudit(`runtime.${action}`, runtimeId, memo, { outcome: "ok" });
    return delay({ ok: true, audit, job, message: `${action} dispatched` });
  },

  /** Phase P0 — Append a training-feedback record sourced from an incident postmortem. */
  createTrainingFeedback(incidentId: string, content: string, target?: { kind: string; id: string }): Promise<MutationResult & { feedbackId: string }> {
    const fid = `tf_${Date.now().toString(36)}`;
    const inc = findById(seed.incidents, incidentId);
    if (inc) {
      inc.timeline = [
        ...(inc.timeline ?? []),
        { ts: new Date().toISOString(), actor: usePlatform.getState().role, note: `[training-feedback ${fid}] ${content.slice(0, 80)}` },
      ];
    }
    realtime.emit("data", { kind: "Incident" });
    const audit = pushAudit("incident.training_feedback.create", incidentId, target ? `${target.kind}:${target.id}` : content.slice(0, 80), { outcome: "ok" });
    return delay({ ok: true, audit, feedbackId: fid });
  },

  /** Phase P2 — Recalculate / freeze / publish / override / compare ranking. */
  rankingAction(
    scope: "persona" | "strategy" | "alphaFamily" | "capitalPool" | "paper" | "live",
    action: "recalculate" | "freeze" | "publish" | "override" | "compare",
    memo?: string,
  ): Promise<MutationResult & { job?: Job }> {
    const job = action === "compare" || action === "recalculate" ? queueMockJob(`ranking.${scope}.${action}`) : undefined;
    realtime.emit("data", { kind: "Ranking" });
    const audit = pushAudit(`ranking.${action}`, `ranking:${scope}`, memo, { outcome: "ok" });
    return delay({ ok: true, audit, job, message: `${action} ${scope}` });
  },

  /** Phase P2 — Switch active ranking formula version (high-risk). */
  setActiveRankingFormula(formulaId: string, memo?: string): Promise<MutationResult> {
    const audit = pushAudit("ranking.formula.set_active", formulaId, memo, { outcome: "ok" });
    realtime.emit("data", { kind: "RankingFormula" });
    return delay({ ok: true, audit, message: `Active formula → ${formulaId}` });
  },

  /** Phase P2 — Append a mitigation step to an incident. */
  appendIncidentMitigation(incidentId: string, content: string): Promise<MutationResult> {
    const inc = findById(seed.incidents, incidentId);
    if (inc) {
      inc.timeline = [
        ...(inc.timeline ?? []),
        { ts: new Date().toISOString(), actor: usePlatform.getState().role, note: `[mitigation] ${content.slice(0, 120)}` },
      ];
    }
    realtime.emit("data", { kind: "Incident" });
    const audit = pushAudit("incident.mitigation.add", incidentId, content.slice(0, 80), { outcome: "ok" });
    return delay({ ok: true, audit });
  },

  /** Phase P2 — Create an evolution constraint sourced from an incident. */
  createEvolutionConstraint(incidentId: string, content: string): Promise<MutationResult & { constraintId: string }> {
    const cid = `ec_${Date.now().toString(36)}`;
    const inc = findById(seed.incidents, incidentId);
    if (inc) {
      inc.timeline = [
        ...(inc.timeline ?? []),
        { ts: new Date().toISOString(), actor: usePlatform.getState().role, note: `[constraint ${cid}] ${content.slice(0, 80)}` },
      ];
    }
    realtime.emit("data", { kind: "Incident" });
    const audit = pushAudit("incident.constraint.create", incidentId, content.slice(0, 80), { outcome: "ok" });
    return delay({ ok: true, audit, constraintId: cid });
  },

  /** Phase P2 — Schedule a deployment for a future window. */
  scheduleDeployment(deploymentId: string, when: string, memo?: string): Promise<MutationResult> {
    const audit = pushAudit("deployment.schedule", deploymentId, memo ?? when, { outcome: "ok" });
    realtime.emit("data", { kind: "Deployment" });
    return delay({ ok: true, audit, message: `Scheduled for ${when}` });
  },

  /** Phase P2 — Persona ops: test, run-eval, restrict tools. */
  personaOps(personaId: string, op: "test" | "run_eval" | "restrict_tools", memo?: string): Promise<MutationResult & { job?: Job }> {
    const job = op === "test" ? undefined : queueMockJob(`persona.${op}`);
    const audit = pushAudit(`persona.${op}`, personaId, memo, { outcome: "ok" });
    realtime.emit("data", { kind: "Persona" });
    return delay({ ok: true, audit, job });
  },

  /** Phase P2 — Publish rebalance report. */
  publishRebalanceReport(rebalanceId: string, memo?: string): Promise<MutationResult> {
    const audit = pushAudit("rebalance.publish_report", rebalanceId, memo, { outcome: "ok" });
    realtime.emit("data", { kind: "Rebalance" });
    return delay({ ok: true, audit });
  },

  /** Phase P2 — Emergency kill (critical). */
  emergencyKill(target: { kind: string; id: string }, memo: string): Promise<MutationResult> {
    const audit = pushAudit("system.emergency_kill", `${target.kind}:${target.id}`, memo, { outcome: "ok" });
    if (target.kind === "Runtime") {
      const r = findById(seed.runtimes, target.id);
      if (r) r.status = "failed";
    }
    if (target.kind === "Strategy") {
      const s = findById(seed.strategies, target.id);
      if (s) s.state = "paused";
    }
    realtime.emit("data", { kind: target.kind });
    return delay({ ok: true, audit, message: "Emergency kill dispatched" });
  },

  /** Phase 11 — submit permission matrix cell updates. */
  updatePermissionMatrix(
    instance: string,
    updates: { rowId: string; colId: string; grant: PermissionGrant }[],
    memo?: string,
  ): Promise<MutationResult> {
    const matrix = (seed.permissionMatrices as PermissionMatrix[]).find((m) => m.instance === instance);
    const before = snap(matrix?.cells);
    if (matrix) {
      const actor = usePlatform.getState().role;
      const ts = new Date().toISOString();
      for (const u of updates) {
        const cell = matrix.cells.find((c) => c.rowId === u.rowId && c.colId === u.colId);
        if (cell) { cell.grant = u.grant; cell.updatedBy = actor; cell.updatedAt = ts; }
        else matrix.cells.push({ rowId: u.rowId, colId: u.colId, grant: u.grant, updatedBy: actor, updatedAt: ts });
      }
    }
    realtime.emit("data", { kind: "PermissionMatrix" });
    const audit = pushAudit(
      "permission.update_cells", instance, memo ?? `${updates.length} cell(s)`,
      { before, after: snap(matrix?.cells), outcome: "ok" },
    );
    return delay({ ok: true, audit });
  },

  /** Phase 11 — replace route-policy rules and bump a draft version. */
  publishRoutePolicy(policyId: string, rules: RoutePolicyRule[], memo?: string): Promise<MutationResult> {
    const policy = (seed.routePolicies as RoutePolicy[]).find((p) => p.id === policyId);
    const before = snap(policy?.rules);
    if (policy) {
      policy.rules = rules.map((r, i) => ({ ...r, priority: (i + 1) * 10 }));
      policy.state = "review";
      const next = `v${(seed.policyVersions as PolicyVersion[]).filter((v) => v.policyId === policyId).length + 1}`;
      (seed.policyVersions as PolicyVersion[]).unshift({
        id: `pv_${Date.now().toString(36)}`,
        policyId, version: next,
        rules: policy.rules,
        author: usePlatform.getState().role,
        createdAt: new Date().toISOString(),
        note: memo,
      });
    }
    realtime.emit("data", { kind: "RoutePolicy" });
    const audit = pushAudit(
      "routePolicy.submit_review", policyId, memo ?? `${rules.length} rule(s)`,
      { before, after: snap(policy?.rules), outcome: "ok" },
    );
    return delay({ ok: true, audit });
  },

  /** Phase 11.5 — replace consult ruleset wholesale. */
  updateConsultRules(rules: ConsultRule[], memo?: string): Promise<MutationResult> {
    const list = seed.consultRules as ConsultRule[];
    const before = snap(list);
    list.splice(0, list.length, ...rules.map((r) => ({ ...r, updatedAt: new Date().toISOString() })));
    realtime.emit("data", { kind: "ConsultRule" });
    const audit = pushAudit(
      "consult.update_rules", "consult-rules", memo ?? `${rules.length} rule(s)`,
      { before, after: snap(list), outcome: "ok" },
    );
    return delay({ ok: true, audit });
  },
  /** v3 §6.2 — Mock POST /bff/command-confirmations.
   *  Issues a short-lived confirm token for a high-risk action. The UI then
   *  replays the action with `X-Confirm-Token: <token>`. Mock layer does not
   *  enforce token expiry on subsequent calls (UI handles TTL countdown). */
  requestConfirmToken(req: ConfirmTokenRequest, params: Record<string, string> = {}): Promise<{
    ok: true;
    response: ConfirmTokenResponse;
    audit: AuditEvent;
  } | { ok: false; reason: "unknown_high_risk_action"; audit: AuditEvent }> {
    if (!getHighRiskAction(req.actionId)) {
      const audit = pushAudit(`${req.actionId}.confirm_token.rejected`, req.entityId,
        "unknown_high_risk_action", { outcome: "rejected" });
      return delay({ ok: false, reason: "unknown_high_risk_action", audit });
    }
    const response = issueConfirmToken(req, params);
    const audit = pushAudit(`${req.actionId}.confirm_token.issued`, req.entityId,
      `ttl=${response.ttlSeconds}s`, { outcome: "ok" });
    return delay({ ok: true, response, audit });
  },
};

export type Mutations = typeof mutations;

/** Helpers for accessing fresh seed snapshots from tests. */
export const _seedRef = {
  approvals: () => seed.approvals as ApprovalRequest[],
  alerts: () => seed.alerts as Alert[],
  incidents: () => seed.incidents as Incident[],
  audit: () => seed.auditEvents as AuditEvent[],
};
