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

export type RankingBlockKind = SeedRankingBlockKind | string;

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

export interface TradingPulseRankRow {
  subjectId: string;
  subjectLabel: string;
  metric: string;
  metricValue: number | string | null;
  metricUnit?: string;
  links?: ManagementLinkSet;
  rankingEligible?: boolean;
  ranking_eligible?: boolean;
}

export interface TradingPulseRankBlock {
  kind: RankingBlockKind;
  label: string;
  rows: TradingPulseRankRow[];
  eligibleItemCount?: number;
  eligible_item_count?: number;
  missingMetricCount?: number;
  missing_metric_count?: number;
  missingMetricRuntimeIds?: string[];
  missing_metric_runtime_ids?: string[];
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
