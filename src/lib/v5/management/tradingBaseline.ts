// 2026-05-20 revamp §6 + design ruling §3.
// `baselineKind` is the canonical enum; `baselineLabel` is the display string.

export type TradingBaselineKind =
  | "previous_artifact"
  | "champion_artifact"
  | "7d_rolling"
  | "30d_rolling"
  | "last_paper"
  | "last_canary"
  | "last_live"
  | "last_review"
  | "pre_mutation"
  | "pre_deployment"
  | "benchmark"
  | "custom_period";

export const TRADING_BASELINE_KINDS: readonly TradingBaselineKind[] = [
  "previous_artifact", "champion_artifact", "7d_rolling", "30d_rolling",
  "last_paper", "last_canary", "last_live", "last_review",
  "pre_mutation", "pre_deployment", "benchmark", "custom_period",
] as const;

/** Defaults shown as 3 cards on Trading Pulse (per ruling §3 usage priority). */
export const TRADING_BASELINE_DEFAULTS: readonly TradingBaselineKind[] = [
  "previous_artifact", "7d_rolling", "last_review",
] as const;

export interface TradingBaseline {
  baselineKind: TradingBaselineKind;
  baselineLabel: string;
}

const FALLBACK_LABELS: Record<TradingBaselineKind, string> = {
  previous_artifact: "Previous artifact",
  champion_artifact: "Champion artifact",
  "7d_rolling": "7-day rolling",
  "30d_rolling": "30-day rolling",
  last_paper: "Last paper run",
  last_canary: "Last canary",
  last_live: "Last live snapshot",
  last_review: "Last governance review",
  pre_mutation: "Pre-mutation baseline",
  pre_deployment: "Pre-deployment baseline",
  benchmark: "Benchmark",
  custom_period: "Custom period",
};

export function baselineLabel(kind: TradingBaselineKind, override?: string): string {
  return (override && override.trim()) || FALLBACK_LABELS[kind];
}
