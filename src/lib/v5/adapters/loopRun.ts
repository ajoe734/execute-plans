// Q27 — LoopRun is derived view-model. No DB / localStorage.
// Derived from seed jobs / approvals / alerts / incidents + v5 overlay.

import type { Job, ApprovalRequest, Alert, Incident, Strategy, Rebalance, ResearchExperiment } from "@/lib/bff/types";
import type { LoopRun, LoopStage } from "../types";
import type { LoopKind, LoopStatus, LoopStageStatus } from "../enums";
import { DEFAULT_TIMEOUT_POLICY, V5_TIMEOUT_POLICY_VERSION } from "../timeoutPolicy";

function jobToStageStatus(j: Job): LoopStageStatus {
  switch (j.status) {
    case "running": return "running";
    case "success": return "succeeded";
    case "failed":  return "failed";
    case "warning": return "blocked";
    case "paused":  return "blocked";
    default:        return "pending";
  }
}

function aggregate(stages: LoopStage[]): LoopStatus {
  if (stages.some((s) => s.status === "failed")) return "failed";
  if (stages.some((s) => s.status === "running")) return "running";
  if (stages.some((s) => s.status === "blocked")) return "blocked";
  if (stages.length > 0 && stages.every((s) => s.status === "succeeded" || s.status === "skipped")) return "succeeded";
  return "idle";
}

interface DeriveCtx {
  strategies: Strategy[];
  rebalances: Rebalance[];
  jobs: Job[];
  approvals: ApprovalRequest[];
  alerts: Alert[];
  incidents: Incident[];
  research?: ResearchExperiment[];
}

export function deriveLoopRuns(ctx: DeriveCtx): LoopRun[] {
  const runs: LoopRun[] = [];

  // Execution loop runs — one per active strategy
  for (const s of ctx.strategies.filter((x) => x.state === "deployed" || x.state === "review")) {
    const relatedJobs = ctx.jobs.filter((j) => j.kind.toLowerCase().includes("exec") || j.owner === s.owner).slice(0, 3);
    const stages: LoopStage[] = relatedJobs.map((j) => ({
      id: `stg_${j.id}`,
      name: j.kind,
      status: jobToStageStatus(j),
      startedAt: j.startedAt,
      timeoutPolicySource: V5_TIMEOUT_POLICY_VERSION,
      warnAfterMs: DEFAULT_TIMEOUT_POLICY.runningWarnMs,
    }));
    if (stages.length === 0) {
      stages.push({ id: `stg_idle_${s.id}`, name: "Idle", status: "pending", timeoutPolicySource: V5_TIMEOUT_POLICY_VERSION });
    }
    const status = aggregate(stages);
    runs.push({
      id: `lr_exec_${s.id}`,
      loopKind: "execution",
      status,
      startedAt: s.updatedAt,
      updatedAt: s.updatedAt,
      triggeredBy: s.owner,
      subjectKind: "strategy",
      subjectId: s.id,
      subjectName: s.name,
      stages,
      currentStageId: stages.find((st) => st.status === "running" || st.status === "blocked")?.id,
      nextAction: status === "blocked" ? { kind: "awaiting_human_decision", label: "Resolve blocker" } : { kind: "automatic" },
      evidence: ctx.alerts.filter((a) => a.relatedTarget === s.id).slice(0, 3).map((a) => ({ kind: "alert" as const, id: a.id })),
    });
  }

  // Optimization loop runs — one per pending rebalance
  for (const r of ctx.rebalances.filter((x) => x.state === "review" || x.state === "draft")) {
    const approval = ctx.approvals.find((a) => a.subject.includes(r.id) || a.kind.toLowerCase().includes("rebalance"));
    const stages: LoopStage[] = [
      { id: `stg_${r.id}_propose`, name: "Propose", status: "succeeded" },
      { id: `stg_${r.id}_review`, name: "Review", status: approval?.state === "approved" ? "succeeded" : approval ? "running" : "pending", warnAfterMs: DEFAULT_TIMEOUT_POLICY.runningWarnMs, timeoutPolicySource: V5_TIMEOUT_POLICY_VERSION },
      { id: `stg_${r.id}_apply`, name: "Apply", status: approval?.state === "approved" ? "pending" : "pending" },
    ];
    runs.push({
      id: `lr_opt_${r.id}`,
      loopKind: "optimization",
      status: aggregate(stages),
      startedAt: r.updatedAt,
      updatedAt: r.updatedAt,
      triggeredBy: r.owner,
      subjectKind: "rebalance",
      subjectId: r.id,
      subjectName: r.name,
      stages,
      currentStageId: stages.find((st) => st.status === "running")?.id,
      nextAction: approval && approval.state === "pending"
        ? { kind: "awaiting_approval", label: `Approval ${approval.id}` }
        : { kind: "none" },
      evidence: approval ? [{ kind: "approval", id: approval.id }] : [],
    });
  }

  return runs;
}

export function loopRunsByKind(runs: LoopRun[], kind: LoopKind): LoopRun[] {
  return runs.filter((r) => r.loopKind === kind);
}
