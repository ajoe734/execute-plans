// Mock mutation layer — Phase 15 (Persistence + Audit).
// All mutations update in-memory seed state, write an AuditEvent, and emit
// a realtime "data" event so subscribers can refetch.

import * as seed from "@/mocks/seed";
import type {
  AuditEvent, ApprovalRequest, Incident, Alert,
  LifecycleState, Strategy, Job,
} from "./types";
import { realtime } from "./realtime";
import { usePlatform } from "@/platform/store";

const delay = <T>(v: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(v), ms));

let auditSeq = 1000;
function pushAudit(action: string, target: string, memo?: string): AuditEvent {
  const ev: AuditEvent = {
    id: `au_${++auditSeq}`,
    actor: usePlatform.getState().role,
    action,
    target,
    ts: new Date().toISOString(),
    ...(memo ? { memo } : {}),
  } as AuditEvent;
  // Insert at the head so timeline shows newest first.
  (seed.auditEvents as AuditEvent[]).unshift(ev);
  realtime.emit("audit", ev);
  realtime.emit("data", { kind: "audit" });
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
};

function setState(kind: string, id: string, newState: string | undefined): boolean {
  if (!newState) return false;
  const collections: Record<string, readonly { id: string; state?: string }[]> = {
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
  const col = collections[kind];
  if (!col) return false;
  const o = findById(col, id) as { state?: string } | undefined;
  if (!o) return false;
  o.state = newState;
  realtime.emit("data", { kind });
  return true;
}

export const mutations = {
  /** Generic state-machine action. Updates state, writes audit, emits realtime. */
  runAction(input: RunActionInput): Promise<MutationResult> {
    const { kind, id, action, newState, memo } = input;
    setState(kind, id, newState);
    const audit = pushAudit(`${kind.toLowerCase()}.${action}`, id, memo);
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
};

export type Mutations = typeof mutations;

/** Helpers for accessing fresh seed snapshots from tests. */
export const _seedRef = {
  approvals: () => seed.approvals as ApprovalRequest[],
  alerts: () => seed.alerts as Alert[],
  incidents: () => seed.incidents as Incident[],
  audit: () => seed.auditEvents as AuditEvent[],
};
