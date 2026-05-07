// Pack D D32 — Metric Registry (Batch IV provisional, but spec-stable).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_DomainRules_Contract.md

export type MetricUnit = "pct" | "bps" | "ms" | "usd" | "score" | "count";

export interface MetricDef {
  id: string;
  labelKey: string;
  unit: MetricUnit;
  higherIsBetter: boolean;
  precision: number;
}

export const METRIC_REGISTRY: readonly MetricDef[] = [
  { id: "pnl_24h_pct", labelKey: "metrics.pnl_24h_pct", unit: "pct", higherIsBetter: true, precision: 2 },
  { id: "pnl_7d_pct", labelKey: "metrics.pnl_7d_pct", unit: "pct", higherIsBetter: true, precision: 2 },
  { id: "pnl_30d_pct", labelKey: "metrics.pnl_30d_pct", unit: "pct", higherIsBetter: true, precision: 2 },
  { id: "sharpe", labelKey: "metrics.sharpe", unit: "score", higherIsBetter: true, precision: 2 },
  { id: "max_drawdown_pct", labelKey: "metrics.max_drawdown_pct", unit: "pct", higherIsBetter: false, precision: 2 },
  { id: "live_paper_divergence_pct", labelKey: "metrics.live_paper_divergence_pct", unit: "pct", higherIsBetter: false, precision: 2 },
  { id: "slippage_p95_bps", labelKey: "metrics.slippage_p95_bps", unit: "bps", higherIsBetter: false, precision: 1 },
  { id: "latency_p95_ms", labelKey: "metrics.latency_p95_ms", unit: "ms", higherIsBetter: false, precision: 0 },
  { id: "fill_rate_pct", labelKey: "metrics.fill_rate_pct", unit: "pct", higherIsBetter: true, precision: 2 },
  { id: "order_reject_rate_pct", labelKey: "metrics.order_reject_rate_pct", unit: "pct", higherIsBetter: false, precision: 2 },
  { id: "capital_utilization_pct", labelKey: "metrics.capital_utilization_pct", unit: "pct", higherIsBetter: false, precision: 2 },
  { id: "risk_budget_usage_pct", labelKey: "metrics.risk_budget_usage_pct", unit: "pct", higherIsBetter: false, precision: 2 },
  { id: "persona_decision_quality_score", labelKey: "metrics.persona_decision_quality_score", unit: "score", higherIsBetter: true, precision: 2 },
  { id: "sentinel_confidence", labelKey: "metrics.sentinel_confidence", unit: "score", higherIsBetter: true, precision: 2 },
];

export function findMetric(id: string): MetricDef | undefined {
  return METRIC_REGISTRY.find((m) => m.id === id);
}
