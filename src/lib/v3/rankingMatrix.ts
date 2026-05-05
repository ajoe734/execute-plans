// v3 §10 Ranking Formula / Metric Matrix. Resolves G17 / G31.

export type RankingScope =
  | "persona" | "strategy" | "alpha_family" | "capital_pool"
  | "paper_strategy" | "live_strategy" | "research_productivity" | "risk_adjusted";

export const RANKING_SCOPES: readonly RankingScope[] = [
  "persona", "strategy", "alpha_family", "capital_pool",
  "paper_strategy", "live_strategy", "research_productivity", "risk_adjusted",
] as const;

/** v3 §10.2 scope→metric matrix. true = metric is valid for that scope. */
export const SCOPE_METRIC_MATRIX: Record<string, Partial<Record<RankingScope, boolean>>> = {
  quarterly_return:        { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  annualized_return:       { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  sharpe:                  { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  sortino:                 { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  calmar:                  { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  max_drawdown:            { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  volatility:              { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  turnover:                { persona:true, strategy:true, alpha_family:true, capital_pool:false, paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  hit_rate:                { persona:true, strategy:true, alpha_family:true, capital_pool:false, paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  profit_factor:           { persona:true, strategy:true, alpha_family:true, capital_pool:false, paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  tail_risk:               { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  slippage:                { persona:true, strategy:true, alpha_family:true, capital_pool:false, paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  capacity:                { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  stability:               { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:true,  risk_adjusted:true },
  live_paper_gap:          { persona:false,strategy:true, alpha_family:true, capital_pool:false, paper_strategy:false,live_strategy:true, research_productivity:false, risk_adjusted:true },
  risk_violation_count:    { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  drawdown_recovery_days:  { persona:true, strategy:true, alpha_family:true, capital_pool:true,  paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  research_productivity:   { persona:true, strategy:false,alpha_family:false,capital_pool:false, paper_strategy:false,live_strategy:false,research_productivity:true,  risk_adjusted:false },
  experiment_success_rate: { persona:true, strategy:false,alpha_family:false,capital_pool:false, paper_strategy:false,live_strategy:false,research_productivity:true,  risk_adjusted:false },
  human_override_penalty:  { persona:true, strategy:true, alpha_family:false,capital_pool:false, paper_strategy:true, live_strategy:true, research_productivity:false, risk_adjusted:true },
  policy_violation_penalty:{ persona:true, strategy:false,alpha_family:false,capital_pool:false, paper_strategy:false,live_strategy:false,research_productivity:false, risk_adjusted:true },
};

export function metricsForScope(scope: RankingScope): string[] {
  return Object.entries(SCOPE_METRIC_MATRIX)
    .filter(([, scopes]) => scopes[scope] === true)
    .map(([metric]) => metric);
}

export function isMetricValidForScope(metric: string, scope: RankingScope): boolean {
  return SCOPE_METRIC_MATRIX[metric]?.[scope] === true;
}

// ---------- §10.3 Formula schema ----------

export interface RankingMetricWeight {
  metric: string;
  weight: number;
  direction: "higher_is_better" | "lower_is_better";
  transform: "identity" | "log" | "sqrt" | "clip" | "binary";
  penaltyMode: "none" | "linear" | "step" | "hard_block";
  hardBlockThreshold?: number;
}

export interface RankingFormulaSpec {
  id: string;
  name: string;
  scope: RankingScope;
  version: number;
  status: "draft" | "testing" | "approved" | "active" | "deprecated" | "retired";
  window: {
    period: "quarter" | "half_year" | "year" | "rolling_90d" | "rolling_180d" | "rolling_365d";
    startDate?: string;
    endDate?: string;
  };
  normalization: "z_score" | "min_max" | "rank_percentile" | "none";
  outlierHandling: "winsorize_1_99" | "winsorize_5_95" | "clip_3sigma" | "none";
  metrics: RankingMetricWeight[];
  caps: {
    minScore?: number;
    maxScore?: number;
    minAllocationPct?: number;
    maxAllocationPct?: number;
  };
  createdBy: string;
  approvedBy?: string;
  activeFrom?: string;
}

export interface FormulaValidationError {
  code: "weight_sum" | "negative_required" | "positive_required" | "metric_invalid_for_scope" | "activation_requires_approved";
  metric?: string;
  detail?: string;
}

export function validateFormula(f: RankingFormulaSpec): FormulaValidationError[] {
  const errs: FormulaValidationError[] = [];
  const nonPenalty = f.metrics.filter((m) => m.penaltyMode === "none");
  const sumAbs = nonPenalty.reduce((s, m) => s + Math.abs(m.weight), 0);
  if (nonPenalty.length > 0 && Math.abs(sumAbs - 1) > 0.0001) {
    errs.push({ code: "weight_sum", detail: `${sumAbs.toFixed(4)} ≠ 1` });
  }
  for (const m of f.metrics) {
    if (m.penaltyMode !== "none" && m.weight >= 0) errs.push({ code: "negative_required", metric: m.metric });
    if (m.penaltyMode === "none" && m.weight <= 0) errs.push({ code: "positive_required", metric: m.metric });
    if (!isMetricValidForScope(m.metric, f.scope)) errs.push({ code: "metric_invalid_for_scope", metric: m.metric });
  }
  return errs;
}

export function canActivateFormula(f: RankingFormulaSpec): boolean {
  return f.status === "approved";
}
