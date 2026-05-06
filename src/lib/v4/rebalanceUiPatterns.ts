// v4 / Pack C §C074 — Rebalance per-step UI patterns.

import type { RebalanceStep } from "./rebalanceQuorum";

export interface RebalanceStepUi {
  step: RebalanceStep;
  uiPattern: string;
  requiredComponent: string;
}

export const REBALANCE_STEP_UI: readonly RebalanceStepUi[] = [
  { step: "metric_freeze", uiPattern: "snapshot table + freeze confirmation", requiredComponent: "MetricFreezePanel" },
  { step: "ranking_calculation", uiPattern: "score table + score breakdown drawer", requiredComponent: "RankingResultPanel" },
  { step: "allocation_simulation", uiPattern: "current vs recommended side-by-side diff", requiredComponent: "AllocationSimulation" },
  { step: "constraint_check", uiPattern: "breach checklist + severity table", requiredComponent: "ConstraintChecker" },
  { step: "review", uiPattern: "approval panel + memo editor", requiredComponent: "ApprovalPanel" },
  { step: "scheduled", uiPattern: "deployment calendar", requiredComponent: "RebalanceApplyMonitor" },
  { step: "applied", uiPattern: "deployment-style progress + post-apply metrics", requiredComponent: "RebalanceApplyMonitor" },
] as const;
