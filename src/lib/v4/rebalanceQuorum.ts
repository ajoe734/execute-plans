// v4 / Pack C §C040–C041 — Rebalance backward transitions + approval quorum.

export type RebalanceStep =
  | "metric_freeze" | "ranking_calculation" | "allocation_simulation"
  | "constraint_check" | "review" | "scheduled" | "applied";

export interface RebalanceStepRow {
  step: RebalanceStep;
  canRollbackTo: readonly RebalanceStep[] | "post_apply";
  uiPattern: string;
  quorum: string;
}

export const REBALANCE_STEPS: readonly RebalanceStepRow[] = [
  { step: "metric_freeze", canRollbackTo: [], uiPattern: "wizard + snapshot table", quorum: "capital_manager x1" },
  { step: "ranking_calculation", canRollbackTo: ["metric_freeze"], uiPattern: "score table + breakdown", quorum: "capital_manager x1" },
  { step: "allocation_simulation", canRollbackTo: ["ranking_calculation", "metric_freeze"], uiPattern: "side-by-side allocation diff", quorum: "capital_manager x1" },
  { step: "constraint_check", canRollbackTo: ["allocation_simulation"], uiPattern: "breach panel", quorum: "risk_officer x1" },
  { step: "review", canRollbackTo: ["constraint_check", "allocation_simulation"], uiPattern: "approval panel", quorum: "risk_officer x1 + capital_manager x1" },
  { step: "scheduled", canRollbackTo: ["review"], uiPattern: "deployment calendar", quorum: "capital_manager x1" },
  { step: "applied", canRollbackTo: "post_apply", uiPattern: "post-apply monitor", quorum: "rollback requires risk_officer + capital_manager" },
] as const;

export function canRollbackTo(from: RebalanceStep, to: RebalanceStep): boolean {
  const row = REBALANCE_STEPS.find((r) => r.step === from);
  if (!row || row.canRollbackTo === "post_apply") return false;
  return row.canRollbackTo.includes(to);
}
