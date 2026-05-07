// E3 — In-memory overlay for LoopRun stage progress + run status.
// Same TTL semantics as v5ActionOverlay (Q10/Q27): 30 min, NEVER persisted.
// Used by ExecutionLoop drawer to drive advance/pause/resume/cancel without
// mutating seed; overlay is folded into deriveLoopRuns() output via apply().

import type { LoopRun, LoopStage } from "./types";
import type { LoopStatus, LoopStageStatus } from "./enums";

export const LOOP_OVERLAY_TTL_MS = 30 * 60 * 1000;

export interface LoopRunPatch {
  runStatus?: LoopStatus;
  stageStatuses?: Record<string, LoopStageStatus>;
  pausedReason?: string;
  updatedAt: string;
  expiresAt: number;
}

class LoopRunOverlay {
  private runs = new Map<string, LoopRunPatch>();

  get(id: string): LoopRunPatch | undefined {
    const p = this.runs.get(id);
    if (!p) return undefined;
    if (p.expiresAt < Date.now()) { this.runs.delete(id); return undefined; }
    return p;
  }

  patch(id: string, patch: Partial<Omit<LoopRunPatch, "expiresAt" | "updatedAt">>, ttlMs = LOOP_OVERLAY_TTL_MS): LoopRunPatch {
    const cur = this.get(id);
    const merged: LoopRunPatch = {
      runStatus: patch.runStatus ?? cur?.runStatus,
      stageStatuses: { ...(cur?.stageStatuses ?? {}), ...(patch.stageStatuses ?? {}) },
      pausedReason: patch.pausedReason ?? cur?.pausedReason,
      updatedAt: new Date().toISOString(),
      expiresAt: Date.now() + ttlMs,
    };
    this.runs.set(id, merged);
    return merged;
  }

  clear() { this.runs.clear(); }
}

export const loopRunOverlay = new LoopRunOverlay();

/** Apply overlay patches to a derived LoopRun list (immutable output). */
export function applyLoopOverlay(runs: LoopRun[]): LoopRun[] {
  return runs.map((r) => {
    const p = loopRunOverlay.get(r.id);
    if (!p) return r;
    const stages: LoopStage[] = r.stages.map((s) =>
      p.stageStatuses?.[s.id]
        ? { ...s, status: p.stageStatuses[s.id], completedAt: ["succeeded","failed","skipped"].includes(p.stageStatuses[s.id]!) ? p.updatedAt : s.completedAt }
        : s,
    );
    const runStatus = p.runStatus ?? r.status;
    return {
      ...r,
      stages,
      status: runStatus,
      updatedAt: p.updatedAt,
      currentStageId: stages.find((s) => s.status === "running" || s.status === "blocked")?.id ?? r.currentStageId,
    };
  });
}

// ---------- Mutators returning the new patch (for bff.v5.loops.*) ----------

function firstIndexBy(stages: LoopStage[], pred: (s: LoopStage) => boolean): number {
  return stages.findIndex(pred);
}

/** Advance the currently running/pending stage → succeeded; promote next pending → running. */
export function advanceLoopRun(run: LoopRun): LoopRunPatch {
  const stages = run.stages;
  const runningIdx = firstIndexBy(stages, (s) => s.status === "running");
  const target = runningIdx >= 0 ? runningIdx : firstIndexBy(stages, (s) => s.status === "pending");
  const stageStatuses: Record<string, LoopStageStatus> = {};
  if (target >= 0) stageStatuses[stages[target].id] = "succeeded";
  const nextIdx = stages.findIndex((s, i) => i > target && s.status === "pending");
  if (nextIdx >= 0) stageStatuses[stages[nextIdx].id] = "running";
  const allDone = stages.every((s, i) => i === target || i === nextIdx
    ? (stageStatuses[s.id] ?? s.status) === "succeeded"
    : s.status === "succeeded" || s.status === "skipped");
  const runStatus: LoopStatus = nextIdx >= 0 ? "running" : (allDone ? "succeeded" : run.status);
  return loopRunOverlay.patch(run.id, { stageStatuses, runStatus });
}

export function pauseLoopRun(run: LoopRun, reason?: string): LoopRunPatch {
  const runningIdx = firstIndexBy(run.stages, (s) => s.status === "running");
  const stageStatuses: Record<string, LoopStageStatus> = {};
  if (runningIdx >= 0) stageStatuses[run.stages[runningIdx].id] = "blocked";
  return loopRunOverlay.patch(run.id, { stageStatuses, runStatus: "blocked", pausedReason: reason });
}

export function resumeLoopRun(run: LoopRun): LoopRunPatch {
  const blockedIdx = firstIndexBy(run.stages, (s) => s.status === "blocked");
  const stageStatuses: Record<string, LoopStageStatus> = {};
  if (blockedIdx >= 0) stageStatuses[run.stages[blockedIdx].id] = "running";
  return loopRunOverlay.patch(run.id, { stageStatuses, runStatus: "running", pausedReason: undefined });
}

export function cancelLoopRun(run: LoopRun): LoopRunPatch {
  const stageStatuses: Record<string, LoopStageStatus> = {};
  for (const s of run.stages) {
    if (s.status === "running" || s.status === "pending" || s.status === "blocked") {
      stageStatuses[s.id] = s.status === "pending" ? "skipped" : "failed";
    }
  }
  return loopRunOverlay.patch(run.id, { stageStatuses, runStatus: "cancelled" });
}

// ---------- Stage timeout state ----------

export type StageTimeoutState = "idle" | "ok" | "warn" | "escalate";

export function stageTimeoutState(
  stage: LoopStage,
  policy: { runningWarnMs: number; blockedEscalateMs: number },
  now = Date.now(),
): StageTimeoutState {
  if (stage.status === "running" && stage.startedAt) {
    const age = now - new Date(stage.startedAt).getTime();
    return age >= policy.runningWarnMs ? "warn" : "ok";
  }
  if (stage.status === "blocked" && stage.startedAt) {
    const age = now - new Date(stage.startedAt).getTime();
    return age >= policy.blockedEscalateMs ? "escalate" : "warn";
  }
  return "idle";
}
