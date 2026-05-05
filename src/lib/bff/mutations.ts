// Mock mutation layer — Phase 14 (BFF × State Machine wiring).
// All mutations update in-memory seed state, validate transitions against
// the Part 7 §17 state machines when applicable, write an AuditEvent, and
// emit a realtime "data" event so subscribers can refetch.

import * as seed from "@/mocks/seed";
import type {
  AuditEvent, ApprovalRequest, Incident, Alert,
  LifecycleState, Strategy, Job,
  MetricFreeze, RebalanceOverride, PromotionRecord, McpSecret,
  AllocationLimit, PoolFreeze, DeploymentStage,
} from "./types";
import type { RoutePolicy, RoutePolicyRule, PermissionMatrix, PermissionGrant, ConsultRule, PolicyVersion } from "./types";
import { realtime } from "./realtime";
import { usePlatform } from "@/platform/store";
import { machines, type MachineKey } from "@/lib/stateMachines";
import { findTransition } from "@/lib/stateMachines/types";
import { schedulePersist } from "./persistence";

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
};

export type MutationResult = {
  ok: boolean;
  audit: AuditEvent;
  message?: string;
  /** When the transition guard rejected the action. */
  rejected?: "illegal_transition" | "unknown_entity";
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
    const obj = col ? findById(col, id) as { state?: string } | undefined : undefined;
    const before = snap(obj);
    const guard = validateTransition(kind, id, action, newState);
    if (guard.ok === false) {
      const audit = pushAudit(
        `${kind.toLowerCase()}.illegal_transition`, id, `${action}: ${guard.reason}`,
        { before, outcome: "rejected" },
      );
      return delay({ ok: false, audit, rejected: "illegal_transition", message: guard.reason });
    }
    setState(kind, id, guard.resolvedState);
    const audit = pushAudit(
      `${kind.toLowerCase()}.${action}`, id, memo,
      { before, after: snap(obj), outcome: "ok" },
    );
    return delay({ ok: true, audit, message: `${action} applied` });
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

  acknowledgeAlert(id: string, memo?: string): Promise<MutationResult> {
    const a = findById(seed.alerts, id);
    if (a) a.acknowledged = true;
    realtime.emit("data", { kind: "Alert" });
    const audit = pushAudit("alert.acknowledge", id, memo);
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

  freezeGeneration(programId: string, memo?: string): Promise<MutationResult> {
    const p = findById(seed.evolutionPrograms, programId) as
      (typeof seed.evolutionPrograms[number] & { generationFrozen?: boolean }) | undefined;
    if (p) p.generationFrozen = true;
    realtime.emit("data", { kind: "Evolution" });
    const audit = pushAudit("evolution.freeze_generation", programId, memo);
    return delay({ ok: true, audit });
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
