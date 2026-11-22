// 2026-05-20 PM-4 — Trading Pulse ranking blocks (8 lists).

import type { ManagementLinkSet } from "./links";
import { buildLinkSet } from "./links";

export type SeedRankingBlockKind =
  | "top_improving_personas"
  | "top_degrading_personas"
  | "top_improving_strategies"
  | "worst_execution_quality"
  | "highest_risk_capital_pools"
  | "most_blocked_deployments"
  | "most_intervened_personas"
  | "most_unstable_after_training";

export type LiveRankingBlockKind =
  | "pnl-leaders"
  | "drawdown-control"
  | "execution-quality"
  | "sharpe-leaders";

export type RankingBlockKind = SeedRankingBlockKind | LiveRankingBlockKind | string;

export const RANKING_BLOCKS: readonly SeedRankingBlockKind[] = [
  "top_improving_personas",
  "top_degrading_personas",
  "top_improving_strategies",
  "worst_execution_quality",
  "highest_risk_capital_pools",
  "most_blocked_deployments",
  "most_intervened_personas",
  "most_unstable_after_training",
] as const;

export const LIVE_RANKING_BLOCKS: readonly LiveRankingBlockKind[] = [
  "pnl-leaders",
  "drawdown-control",
  "execution-quality",
  "sharpe-leaders",
] as const;

export const RANKING_BLOCK_LABELS: Record<SeedRankingBlockKind, string> = {
  top_improving_personas: "Top Improving Personas",
  top_degrading_personas: "Top Degrading Personas",
  top_improving_strategies: "Top Improving Strategies",
  worst_execution_quality: "Worst Execution Quality",
  highest_risk_capital_pools: "Highest Risk Capital Pools",
  most_blocked_deployments: "Most Blocked Deployments",
  most_intervened_personas: "Most Human-Intervened Personas",
  most_unstable_after_training: "Most Unstable After Training",
};

export const LIVE_RANKING_BLOCK_LABELS: Record<LiveRankingBlockKind, string> = {
  "pnl-leaders": "P&L Leaders",
  "drawdown-control": "Drawdown Control",
  "execution-quality": "Execution Quality",
  "sharpe-leaders": "Sharpe Leaders",
};

export interface ManagementTradingPulseLinks extends ManagementLinkSet {
  persona?: string;
  personaHref?: string;
  persona_href?: string;
  strategy?: string;
  strategyHref?: string;
  strategy_href?: string;
  journey?: string;
  journeyHref?: string;
  journey_href?: string;
}

export interface TradingPulseComparisonScopePeriod {
  startAt?: string | null;
  start_at?: string | null;
  endAt?: string | null;
  end_at?: string | null;
  endExclusiveAt?: string | null;
  end_exclusive_at?: string | null;
  asOf?: string | null;
  as_of?: string | null;
  window?: string | null;
  quarter?: string | null;
  [key: string]: unknown;
}

export interface TradingPulseComparisonScope {
  stage?: string | null;
  period?: TradingPulseComparisonScopePeriod | string | null;
  unit?: string | null;
  definition?: string | null;
  basis?: string | null;
  [key: string]: unknown;
}

export interface TradingPulseRankRow {
  subjectId: string;
  subjectLabel: string;
  metric: string;
  metricValue: number | string | null;
  metricUnit?: string;
  metric_unit?: string | null;
  rankingUnit?: string | null;
  ranking_unit?: string | null;
  rankingMetric?: string;
  ranking_metric?: string;
  rankingMetricValue?: number | null;
  ranking_metric_value?: number | null;
  rankingBlockId?: string;
  ranking_block_id?: string;
  rank?: number | null;
  avgSlippageBps?: number | null;
  avg_slippage_bps?: number | null;
  personaId?: string | null;
  persona_id?: string | null;
  personaName?: string | null;
  persona_name?: string | null;
  strategyId?: string | null;
  strategy_id?: string | null;
  strategyName?: string | null;
  strategy_name?: string | null;
  underlyingSymbol?: string | null;
  underlying_symbol?: string | null;
  tenantId?: string | null;
  tenant_id?: string | null;
  runtimeId?: string;
  runtime_id?: string;
  runtimeBindingId?: string;
  runtime_binding_id?: string;
  deploymentStage?: string;
  deployment_stage?: string;
  status?: string;
  comparisonScope?: TradingPulseComparisonScope | null;
  comparison_scope?: TradingPulseComparisonScope | null;
  performanceContext?: Record<string, unknown> | null;
  performance_context?: Record<string, unknown> | null;
  latestOutcome?: Record<string, unknown> | null;
  latest_outcome?: Record<string, unknown> | null;
  links?: ManagementTradingPulseLinks;
  rankingEligible?: boolean;
  ranking_eligible?: boolean;
  [key: string]: unknown;
}

export interface TradingPulseRankBlock {
  kind: RankingBlockKind;
  blockId?: string;
  block_id?: string;
  label: string;
  metric?: string;
  sortOrder?: "asc" | "desc" | string;
  sort_order?: "asc" | "desc" | string;
  secondaryMetric?: string;
  secondary_metric?: string;
  rankingBasis?: string;
  ranking_basis?: string;
  metricReasons?: Record<string, string | null>;
  metric_reasons?: Record<string, string | null>;
  rows: TradingPulseRankRow[];
  items?: TradingPulseRankRow[];
  eligibleItemCount?: number;
  eligible_item_count?: number;
  missingMetricCount?: number;
  missing_metric_count?: number;
  missingMetricRuntimeIds?: string[];
  missing_metric_runtime_ids?: string[];
  [key: string]: unknown;
}

const seed = (
  kind: SeedRankingBlockKind,
  rows: { id: string; label: string; metric: string; value: number; unit?: string;
          linkKind: Parameters<typeof buildLinkSet>[0]["primary"]["kind"] }[],
): TradingPulseRankBlock => ({
  kind,
  label: RANKING_BLOCK_LABELS[kind],
  rows: rows.map((r) => ({
    subjectId: r.id,
    subjectLabel: r.label,
    metric: r.metric,
    metricValue: r.value,
    metricUnit: r.unit,
    links: buildLinkSet({ primary: { kind: r.linkKind, id: r.id } }),
  })),
});

export function defaultPulseRankings(): TradingPulseRankBlock[] {
  return [
    seed("top_improving_personas", [
      { id: "risk-guard", label: "risk-guard", metric: "Δ Sharpe (7d)", value: 0.18, linkKind: "persona" },
      { id: "fx-scout", label: "fx-scout", metric: "Δ Sharpe (7d)", value: 0.11, linkKind: "persona" },
    ]),
    seed("top_degrading_personas", [
      { id: "alpha-trader", label: "alpha-trader", metric: "Δ Sharpe (7d)", value: -0.22, linkKind: "persona" },
    ]),
    seed("top_improving_strategies", [
      { id: "alpha-momentum", label: "alpha-momentum", metric: "Δ PnL (14d)", value: 0.034, unit: "%", linkKind: "strategy" },
    ]),
    seed("worst_execution_quality", [
      { id: "vol-target", label: "vol-target", metric: "Slippage (bps)", value: 14.2, linkKind: "strategy" },
    ]),
    seed("highest_risk_capital_pools", [
      { id: "cp-eu-mid-cap", label: "cp-eu-mid-cap", metric: "VaR utilisation", value: 0.91, linkKind: "capital_pool" },
    ]),
    seed("most_blocked_deployments", [
      { id: "dep-042", label: "dep-042", metric: "Blocked for", value: 36, unit: "h", linkKind: "deployment" },
    ]),
    seed("most_intervened_personas", [
      { id: "capital-steward", label: "capital-steward", metric: "Interventions (7d)", value: 4, linkKind: "persona" },
    ]),
    seed("most_unstable_after_training", [
      { id: "alpha-trader", label: "alpha-trader", metric: "Mutation variance", value: 0.27, linkKind: "persona" },
    ]),
  ];
}
