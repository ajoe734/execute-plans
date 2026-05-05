// v3 §12 Evolution Steering Entity Schemas. Resolves G19.

export interface EvolutionConstraint {
  id: string;
  programId: string;
  type: "hard" | "soft";
  field:
    | "max_drawdown" | "turnover" | "capacity" | "correlation"
    | "market" | "asset_liquidity" | "holding_period" | "leverage";
  operator: "<=" | ">=" | "=" | "in" | "not_in";
  value: number | string | string[];
  penaltyWeight?: number;
  status: "active" | "disabled";
}

export interface EvolutionAlert {
  id: string;
  programId: string;
  runId?: string;
  severity: "info" | "warning" | "high" | "critical";
  type: "fitness_plateau" | "constraint_breach" | "compute_budget_breach" | "candidate_risk" | "data_quality";
  messageKey: string;
  createdAt: string;
  status: "new" | "acknowledged" | "resolved";
}

export interface EvolutionApproval {
  id: string;
  programId: string;
  candidateId?: string;
  type: "program_activate" | "fitness_formula_change" | "candidate_promote" | "budget_increase" | "constraint_change";
  requestedBy: string;
  reviewers: string[];
  status: "submitted" | "in_review" | "approved" | "rejected" | "changes_requested";
  memo?: string;
}
