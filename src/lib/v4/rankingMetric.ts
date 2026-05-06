// v4 / Pack C §C039 — Ranking metric metadata.

export type MetricUnit = "percent" | "ratio" | "currency" | "days" | "count" | "score";
export type MetricDirection = "higher_better" | "lower_better";
export type MetricNormalization = "z_score" | "min_max" | "none" | "winsorized_z";
export type MetricScope = "persona" | "strategy" | "alpha_family" | "capital_pool" | "paper" | "live";

export interface RankingMetricDefinition {
  id: string;
  labelKey: string;
  unit: MetricUnit;
  direction: MetricDirection;
  normalization: MetricNormalization;
  defaultWeight: number;
  allowedScopes: readonly MetricScope[];
}
