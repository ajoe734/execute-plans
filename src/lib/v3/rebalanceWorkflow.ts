// v3 §11 Quarterly Rebalance Workflow. Resolves G18 / G32 / G68.

export interface RebalanceReviewer {
  userId: string;
  role: "capital_manager" | "risk_officer" | "reviewer";
  status: "pending" | "approved" | "rejected" | "changes_requested";
  memo?: string;
  decidedAt?: string;
}

export interface RebalanceApprover {
  userId: string;
  role: "capital_manager" | "risk_officer" | "admin";
  status: "pending" | "approved" | "rejected";
  memo?: string;
  decidedAt?: string;
}

export interface MetricFreeze {
  startedAt?: string;
  frozenAt?: string;
  frozenBy?: string;
  metrics: string[];
}

export interface AllocationOverride {
  strategyId: string;
  delta: number;
  reason: string;
  state: "draft" | "review" | "approved" | "rejected";
  proposedBy: string;
  proposedAt: string;
}

export interface QuarterlyRebalanceV3 {
  id: string;
  quarter: string;
  capitalPoolId: string;
  formulaId: string;
  formulaVersion: number;
  status: import("./status").QuarterlyRebalanceStatus;
  reviewers: RebalanceReviewer[];
  approvers: RebalanceApprover[];
  metricFreeze: MetricFreeze;
  rankingResultId?: string;
  simulationId?: string;
  overrides: AllocationOverride[];
  scheduledEffectiveAt?: string;
  appliedAt?: string;
  rollbackOf?: string;
}

// ---------- §11.2 Step table ----------

export type RebalanceStepId =
  | "create_event" | "freeze_metrics" | "calculate_ranking" | "run_simulation"
  | "apply_override" | "submit_review" | "risk_review" | "final_approval"
  | "schedule" | "apply" | "rollback";

export interface RebalanceStep {
  id: RebalanceStepId;
  statusAfter: import("./status").QuarterlyRebalanceStatus;
  primaryRole: string | string[];
  secondaryRole: string;
  uiComponent: string;
  bffAction: string;
  canReject: boolean;
  auditEvent: string;
}

export const REBALANCE_STEPS: readonly RebalanceStep[] = [
  { id: "create_event",       statusAfter: "draft",                primaryRole: "capital_manager",                       secondaryRole: "admin",           uiComponent: "RebalanceCreateForm",        bffAction: "POST /bff/rebalances",       canReject: false, auditEvent: "rebalance.created" },
  { id: "freeze_metrics",     statusAfter: "metrics_frozen",       primaryRole: "capital_manager",                       secondaryRole: "risk_officer",    uiComponent: "MetricFreezePanel",          bffAction: "rebalance.freeze_metrics",   canReject: false, auditEvent: "rebalance.metrics_frozen" },
  { id: "calculate_ranking",  statusAfter: "ranking_calculated",   primaryRole: "capital_manager",                       secondaryRole: "admin",           uiComponent: "RankingResultViewer",        bffAction: "rebalance.calculate_ranking",canReject: false, auditEvent: "rebalance.ranking_calculated" },
  { id: "run_simulation",     statusAfter: "simulation_ready",     primaryRole: "capital_manager",                       secondaryRole: "risk_officer",    uiComponent: "AllocationSimulationPanel",  bffAction: "rebalance.run_simulation",   canReject: false, auditEvent: "rebalance.simulation_ready" },
  { id: "apply_override",     statusAfter: "simulation_ready",     primaryRole: "capital_manager",                       secondaryRole: "risk_officer",    uiComponent: "OverrideManager",            bffAction: "rebalance.apply_override",   canReject: true,  auditEvent: "rebalance.override_applied" },
  { id: "submit_review",      statusAfter: "under_review",         primaryRole: "capital_manager",                       secondaryRole: "admin",           uiComponent: "RebalanceReviewSubmitter",   bffAction: "rebalance.submit_review",    canReject: false, auditEvent: "rebalance.submitted" },
  { id: "risk_review",        statusAfter: "under_review",         primaryRole: "risk_officer",                          secondaryRole: "reviewer",        uiComponent: "ApprovalPanel",              bffAction: "rebalance.review_decide",    canReject: true,  auditEvent: "rebalance.review_decided" },
  { id: "final_approval",     statusAfter: "approved",             primaryRole: ["capital_manager", "risk_officer"],     secondaryRole: "admin",           uiComponent: "ApprovalPanel",              bffAction: "rebalance.approve",          canReject: true,  auditEvent: "rebalance.approved" },
  { id: "schedule",           statusAfter: "scheduled",            primaryRole: "capital_manager",                       secondaryRole: "system_operator", uiComponent: "ScheduleEffectiveDate",      bffAction: "rebalance.schedule",         canReject: false, auditEvent: "rebalance.scheduled" },
  { id: "apply",              statusAfter: "applied",              primaryRole: ["capital_manager", "system_operator"],  secondaryRole: "risk_officer",    uiComponent: "HighRiskConfirmationModal",  bffAction: "rebalance.apply",            canReject: false, auditEvent: "rebalance.applied" },
  { id: "rollback",           statusAfter: "rolled_back",          primaryRole: ["capital_manager", "risk_officer"],     secondaryRole: "admin",           uiComponent: "HighRiskConfirmationModal",  bffAction: "rebalance.rollback",         canReject: false, auditEvent: "rebalance.rolled_back" },
] as const;

export function getRebalanceStep(id: RebalanceStepId): RebalanceStep | undefined {
  return REBALANCE_STEPS.find((s) => s.id === id);
}
