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

/**
 * Representative snake_case BFF wire sample for `GET /bff/management/trading-pulse`
 * locking the 2026-11-22 hosted contract (3 operational paper personas: 青禾 2330,
 * 衡岳 0050, 澄川 2317 pre-broker risk rejection 0/452 shares; deploy probe excluded).
 *
 * For contract tests and UI view-model tests only — never used as a live fallback.
 */
export const TRADING_PULSE_HOSTED_WIRE_SAMPLE = {
  data: {
    id: "management-trading-pulse",
    summary: {
      operator_scope: {
        status: "verified",
        tenant_id: "tenant-dev",
        persona_count: 3,
        runtime_count: 3,
        verified_runtime_count: 3,
        reason: null,
        by_stage: {
          paper: { persona_count: 3, runtime_count: 3 },
        },
      },
      pnl_groups: [
        {
          stage: "paper",
          currency: "TWD",
          period_start_at: "2026-11-16T00:00:00Z",
          period_end_at: "2026-11-22T12:00:00Z",
          as_of: "2026-11-22T12:00:00Z",
          pnl_definition: "realized_plus_unrealized",
          value: -177.819,
          covered_persona_count: 2,
          eligible_persona_count: 3,
          covered_runtime_count: 2,
          eligible_runtime_count: 3,
        },
      ],
      fill_rate_aggregation: "arithmetic_mean_of_observed_runtime_rates",
      snapshot_at: "2026-11-22T12:00:00Z",
      runtime_count: 3,
      retired_runtime_count: 0,
      telemetry_coverage_count: 3,
      monitoring_coverage_count: 3,
      paper_runtime_count: 3,
      total_pnl: null,
      worst_drawdown: 0.012,
      average_fill_rate: 0.666667,
      worst_slippage_bps: 0,
      total_trades: 2,
      baseline_comparison_count: 0,
      baseline_required_count: 0,
      baseline_breached_count: 0,
      baseline_watch_count: 0,
      row_health_degraded_count: 0,
      row_health_status_counts: { ok: 3 },
      by_status: { active: 3 },
      by_stage: { paper: 3 },
      by_baseline_status: { not_required: 3 },
      missing_telemetry_runtime_ids: [],
      missing_monitoring_runtime_ids: [],
      missing_baseline_runtime_ids: [],
      metric_coverage: {
        pnl: {
          available_count: 2,
          missing_count: 1,
          missing_runtime_ids: ["rt-3252fa75"],
        },
        drawdown: {
          available_count: 2,
          missing_count: 1,
          missing_runtime_ids: ["rt-3252fa75"],
        },
        fill_rate: {
          available_count: 3,
          missing_count: 0,
          missing_runtime_ids: [],
        },
        sharpe_ratio: {
          available_count: 0,
          missing_count: 3,
          missing_runtime_ids: ["rt-ad81501b", "rt-0050paper", "rt-3252fa75"],
        },
      },
      coverage: {
        runtime_count: 3,
        paper_runtime_count: 3,
        telemetry_coverage_count: 3,
        monitoring_coverage_count: 3,
        baseline_comparison_count: 0,
        baseline_required_count: 0,
        row_health_degraded_count: 0,
        row_health_status_counts: { ok: 3 },
        degraded_runtime_ids: [],
        missing_telemetry_runtime_ids: [],
        missing_monitoring_runtime_ids: [],
        missing_baseline_runtime_ids: [],
      },
    },
    cards: [
      {
        card_id: "runtime-status",
        label: "Runtime Status",
        value: 3,
        details: {
          by_status: { active: 3 },
          by_stage: { paper: 3 },
          row_health_status_counts: { ok: 3 },
        },
      },
      {
        card_id: "row-health",
        label: "Row Health",
        value: 0,
        details: {
          row_health_status_counts: { ok: 3 },
          degraded_runtime_ids: [],
        },
      },
      {
        card_id: "pnl",
        label: "P&L",
        value: null,
        details: {
          telemetry_coverage_count: 3,
          metric_coverage: {
            available_count: 2,
            missing_count: 1,
            missing_runtime_ids: ["rt-3252fa75"],
          },
        },
      },
      {
        card_id: "drawdown",
        label: "Worst Drawdown",
        value: 0.012,
        details: {
          source: "telemetry_summaries",
          metric_coverage: {
            available_count: 2,
            missing_count: 1,
            missing_runtime_ids: ["rt-3252fa75"],
          },
        },
      },
      {
        card_id: "execution-quality",
        label: "Execution Quality",
        value: 0.666667,
        details: {
          worst_slippage_bps: 0,
          metric_coverage: {
            available_count: 3,
            missing_count: 0,
            missing_runtime_ids: [],
          },
        },
      },
      {
        card_id: "baseline-comparison",
        label: "Baseline Comparison",
        value: 0,
        details: {
          baseline_comparison_count: 0,
          baseline_required_count: 0,
          by_baseline_status: { not_required: 3 },
          missing_baseline_runtime_ids: [],
        },
      },
    ],
    runtime_rows: [
      {
        runtime_id: "rt-ad81501b",
        runtime_binding_id: "rb-3823397e125e4579ba5f4174067087ed",
        persona_id: "persona-2448c7053e33ea48da47",
        persona_name: "青禾｜2330 台股 Paper 學習 R3",
        strategy_id: "strategy-persona-06d4775a9b6a8f63b311",
        strategy_name: "2330 台股 Paper 學習策略",
        underlying_symbol: "2330",
        tenant_id: "tenant-dev",
        deployment_stage: "paper",
        status: "active",
        executed_trade_count: 1,
        total_trades: 1,
        position_count: 0,
        telemetry_summary: {
          window: "1h",
          collected_at: "2026-11-22T11:58:00Z",
          metrics: {
            pnl: -168.085,
            drawdown: 0.012,
            sharpe_ratio: null,
            fill_rate: 1.0,
            avg_slippage_bps: 0,
            total_trades: 1,
          },
        },
        performance_context: {
          ledger_fill_count: 1,
          pnl_currency: "TWD",
          pnl_period_start_at: "2026-11-16T00:00:00Z",
          pnl_at: "2026-11-22T12:00:00Z",
          pnl_definition: "realized_plus_unrealized",
          fill_rate_details: {
            status: "known",
            reason: null,
            basis: "filled_quantity_over_submitted_quantity",
            unit: "SHARES",
            numerator: 1,
            denominator: 1,
            window: {
              start_at: "2026-11-16T00:00:00Z",
              as_of: "2026-11-22T12:00:00Z",
            },
          },
          fill_rate_basis: "filled_quantity_over_submitted_quantity",
          sharpe_ratio_status: "insufficient_samples",
          sharpe_ratio_reason: "min_10_daily_returns_required",
          staleness: null,
          metric_reasons: {
            sharpe_ratio: "min_10_daily_returns_required",
          },
          metric_units: {
            pnl: "TWD",
            fill_rate: "fraction",
            drawdown: "fraction",
            sharpe_ratio: "ratio",
            avg_slippage_bps: "bps",
            total_trades: "fills",
          },
          metric_periods: {
            pnl: {
              start_at: "2026-11-16T00:00:00Z",
              as_of: "2026-11-22T12:00:00Z",
              window: "1h",
            },
          },
          latest_report_at: "2026-11-22T11:58:00Z",
          last_fill_at: "2026-11-16T06:52:08Z",
          snapshot_at: "2026-11-22T12:00:00Z",
          source_status: "available",
        },
        latest_outcome: {
          status: "available",
          occurred_at: "2026-11-16T06:58:29Z",
          reason_code: "reason_not_recorded",
          submitted_to_broker: true,
          requested_quantity: 1,
          required: null,
          available: null,
          currency: "TWD",
          journey_id: "tj_29473e86-63ff-5384-bda1-23eef61cebb2",
          source_event_id: "b7744687-f4e3-507d-8ae5-526b7c18003a",
          focus_stage: "reconciliation",
        },
        links: {
          persona: "/management/personas/persona-2448c7053e33ea48da47",
          strategy: "/management/strategies/strategy-persona-06d4775a9b6a8f63b311",
          journey: "/management/trade-journeys/tj_29473e86-63ff-5384-bda1-23eef61cebb2?tenant_id=tenant-dev&environment=paper",
        },
        row_health: {
          status: "ok",
          degraded_checks: [],
        },
        baseline_comparison: {
          runtime_id: "rt-ad81501b",
          runtime_binding_id: "rb-3823397e125e4579ba5f4174067087ed",
          deployment_stage: "paper",
          status: "not_required",
          metric_count: 0,
          breached_metric_count: 0,
          watch_metric_count: 0,
        },
        last_updated_at: "2026-11-22T11:58:00Z",
      },
      {
        runtime_id: "rt-0050paper",
        runtime_binding_id: "rb-0050paper",
        persona_id: "persona-hengyue-0050",
        persona_name: "衡岳｜0050 台股 ETF Paper",
        strategy_id: "strategy-persona-0050",
        strategy_name: "0050 台股 ETF 策略",
        underlying_symbol: "0050",
        tenant_id: "tenant-dev",
        deployment_stage: "paper",
        status: "active",
        executed_trade_count: 1,
        total_trades: 1,
        position_count: 1,
        telemetry_summary: {
          window: "1h",
          collected_at: "2026-11-22T11:58:00Z",
          metrics: {
            pnl: -9.734,
            drawdown: 0.004,
            sharpe_ratio: null,
            fill_rate: 1.0,
            avg_slippage_bps: 0,
            total_trades: 1,
          },
        },
        performance_context: {
          ledger_fill_count: 1,
          pnl_currency: "TWD",
          pnl_period_start_at: "2026-11-16T00:00:00Z",
          pnl_at: "2026-11-22T12:00:00Z",
          pnl_definition: "realized_plus_unrealized",
          fill_rate_details: {
            status: "known",
            reason: null,
            basis: "filled_quantity_over_submitted_quantity",
            unit: "SHARES",
            numerator: 1,
            denominator: 1,
          },
          fill_rate_basis: "filled_quantity_over_submitted_quantity",
          sharpe_ratio_status: "zero_variance",
          sharpe_ratio_reason: "zero_return_variance",
          staleness: null,
          metric_reasons: {
            sharpe_ratio: "zero_return_variance",
          },
          metric_units: {
            pnl: "TWD",
            fill_rate: "fraction",
            drawdown: "fraction",
            sharpe_ratio: "ratio",
            avg_slippage_bps: "bps",
            total_trades: "fills",
          },
          metric_periods: {
            pnl: {
              start_at: "2026-11-16T00:00:00Z",
              as_of: "2026-11-22T12:00:00Z",
              window: "1h",
            },
          },
          latest_report_at: "2026-11-22T11:58:00Z",
          last_fill_at: "2026-11-18T05:10:00Z",
          snapshot_at: "2026-11-22T12:00:00Z",
          source_status: "available",
        },
        latest_outcome: {
          status: "not_observed",
          occurred_at: null,
          reason_code: null,
          submitted_to_broker: null,
          requested_quantity: null,
          required: null,
          available: null,
          currency: null,
          journey_id: null,
          source_event_id: null,
        },
        links: {
          persona: "/management/personas/persona-hengyue-0050",
          strategy: "/management/strategies/strategy-persona-0050",
        },
        row_health: {
          status: "ok",
          degraded_checks: [],
        },
        baseline_comparison: {
          runtime_id: "rt-0050paper",
          runtime_binding_id: "rb-0050paper",
          deployment_stage: "paper",
          status: "not_required",
          metric_count: 0,
          breached_metric_count: 0,
          watch_metric_count: 0,
        },
        last_updated_at: "2026-11-22T11:58:00Z",
      },
      {
        runtime_id: "rt-3252fa75",
        runtime_binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
        persona_id: "persona-6507750312870d03a241",
        persona_name: "澄川｜2317 台股 Paper",
        strategy_id: "strategy-persona-039ad01f8bcd2b4aa466",
        strategy_name: "2317 台股 Paper 策略",
        underlying_symbol: "2317",
        tenant_id: "tenant-dev",
        deployment_stage: "paper",
        status: "active",
        executed_trade_count: 0,
        total_trades: 0,
        position_count: 0,
        telemetry_summary: {
          window: "1h",
          collected_at: "2026-11-19T23:46:17Z",
          metrics: {
            pnl: null,
            drawdown: null,
            sharpe_ratio: null,
            fill_rate: 0,
            avg_slippage_bps: null,
            total_trades: 0,
          },
        },
        performance_context: {
          ledger_fill_count: 0,
          pnl_currency: "TWD",
          pnl_period_start_at: null,
          pnl_at: null,
          pnl_definition: null,
          fill_rate_details: {
            status: "known",
            reason: null,
            basis: "filled_quantity_over_submitted_quantity",
            unit: "SHARES",
            numerator: 0,
            denominator: 452,
            window: {
              start_at: "2026-11-18T06:59:58Z",
              as_of: "2026-11-19T23:46:17Z",
            },
          },
          fill_rate_basis: "filled_quantity_over_submitted_quantity",
          sharpe_ratio_status: "unavailable",
          sharpe_ratio_reason: "no_fills",
          staleness: null,
          metric_reasons: {
            pnl: "no_fills",
            drawdown: "no_fills",
            sharpe_ratio: "no_fills",
            avg_slippage_bps: "no_fills",
          },
          metric_units: {
            pnl: "TWD",
            fill_rate: "fraction",
            drawdown: "fraction",
            sharpe_ratio: "ratio",
            avg_slippage_bps: "bps",
            total_trades: "fills",
          },
          metric_periods: {},
          latest_report_at: "2026-11-19T23:46:17Z",
          last_fill_at: null,
          snapshot_at: "2026-11-22T12:00:00Z",
          source_status: "available",
        },
        latest_outcome: {
          status: "available",
          occurred_at: "2026-11-19T23:46:17Z",
          reason_code: "insufficient_cash",
          submitted_to_broker: false,
          requested_quantity: 452,
          required: 100034.3461,
          available: 100000,
          currency: "TWD",
          journey_id: "tj_79726064-4cc2-5510-8e11-7f5e59ff89bd",
          source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
          focus_stage: "risk_evaluation",
        },
        links: {
          persona: "/management/personas/persona-6507750312870d03a241",
          strategy: "/management/strategies/strategy-persona-039ad01f8bcd2b4aa466",
          journey: "/management/trade-journeys/tj_79726064-4cc2-5510-8e11-7f5e59ff89bd?tenant_id=tenant-dev&environment=paper",
        },
        row_health: {
          status: "ok",
          degraded_checks: [],
        },
        baseline_comparison: {
          runtime_id: "rt-3252fa75",
          runtime_binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
          deployment_stage: "paper",
          status: "not_required",
          metric_count: 0,
          breached_metric_count: 0,
          watch_metric_count: 0,
        },
        last_updated_at: "2026-11-19T23:46:17Z",
      },
    ],
    rankings: [
      {
        rank: 1,
        runtime_id: "rt-0050paper",
        runtime_binding_id: "rb-0050paper",
        persona_id: "persona-hengyue-0050",
        persona_name: "衡岳｜0050 台股 ETF Paper",
        strategy_id: "strategy-persona-0050",
        strategy_name: "0050 台股 ETF 策略",
        underlying_symbol: "0050",
        tenant_id: "tenant-dev",
        deployment_stage: "paper",
        status: "active",
        pnl: -9.734,
        drawdown: 0.004,
        sharpe_ratio: null,
        fill_rate: 1.0,
        avg_slippage_bps: 0,
        total_trades: 1,
        last_updated_at: "2026-11-22T11:58:00Z",
        baseline_comparison_status: "not_required",
        breached_metric_count: 0,
        row_health_status: "ok",
        row_health_degraded_checks: [],
        links: {
          persona: "/management/personas/persona-hengyue-0050",
          strategy: "/management/strategies/strategy-persona-0050",
        },
      },
      {
        rank: 2,
        runtime_id: "rt-ad81501b",
        runtime_binding_id: "rb-3823397e125e4579ba5f4174067087ed",
        persona_id: "persona-2448c7053e33ea48da47",
        persona_name: "青禾｜2330 台股 Paper 學習 R3",
        strategy_id: "strategy-persona-06d4775a9b6a8f63b311",
        strategy_name: "2330 台股 Paper 學習策略",
        underlying_symbol: "2330",
        tenant_id: "tenant-dev",
        deployment_stage: "paper",
        status: "active",
        pnl: -168.085,
        drawdown: 0.012,
        sharpe_ratio: null,
        fill_rate: 1.0,
        avg_slippage_bps: 0,
        total_trades: 1,
        last_updated_at: "2026-11-22T11:58:00Z",
        baseline_comparison_status: "not_required",
        breached_metric_count: 0,
        row_health_status: "ok",
        row_health_degraded_checks: [],
        links: {
          persona: "/management/personas/persona-2448c7053e33ea48da47",
          strategy: "/management/strategies/strategy-persona-06d4775a9b6a8f63b311",
          journey: "/management/trade-journeys/tj_29473e86-63ff-5384-bda1-23eef61cebb2?tenant_id=tenant-dev&environment=paper",
        },
      },
      {
        rank: 3,
        runtime_id: "rt-3252fa75",
        runtime_binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
        persona_id: "persona-6507750312870d03a241",
        persona_name: "澄川｜2317 台股 Paper",
        strategy_id: "strategy-persona-039ad01f8bcd2b4aa466",
        strategy_name: "2317 台股 Paper 策略",
        underlying_symbol: "2317",
        tenant_id: "tenant-dev",
        deployment_stage: "paper",
        status: "active",
        pnl: null,
        drawdown: null,
        sharpe_ratio: null,
        fill_rate: 0,
        avg_slippage_bps: null,
        total_trades: 0,
        last_updated_at: "2026-11-19T23:46:17Z",
        baseline_comparison_status: "not_required",
        breached_metric_count: 0,
        row_health_status: "ok",
        row_health_degraded_checks: [],
        links: {
          persona: "/management/personas/persona-6507750312870d03a241",
          strategy: "/management/strategies/strategy-persona-039ad01f8bcd2b4aa466",
          journey: "/management/trade-journeys/tj_79726064-4cc2-5510-8e11-7f5e59ff89bd?tenant_id=tenant-dev&environment=paper",
        },
      },
    ],
    baseline_comparisons: [],
  },
  meta: {
    snapshot_at: "2026-11-22T12:00:00Z",
    surfaces: {
      management_trading_pulse: { status: "ok", source: "bff_composed" },
      runtime_roster: { status: "ok", source: "canonical" },
      telemetry_summary: { status: "ok", source: "service_store" },
      paper_runtime_monitoring: { status: "ok", source: "service_store" },
      paper_live_drift: {
        status: "ok",
        source: "service_store",
        message: "No live runtimes require paper/live baseline comparison.",
      },
      baseline_comparison: { status: "ok", source: "bff_composed" },
      runtime_row_health: { status: "ok", source: "bff_composed" },
    },
  },
} as const;

/**
 * Representative snake_case BFF wire sample for `GET /bff/management/trading-pulse/rankings`
 * locking the 2026-11-22 hosted contract.
 */
export const TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE = {
  data: {
    id: "management-trading-pulse-rankings",
    summary: {
      operator_scope: TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.summary.operator_scope,
      pnl_groups: TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.summary.pnl_groups,
      runtime_count: 3,
      ranking_block_count: 4,
      ranked_item_count: 7,
      eligible_item_count: 7,
      missing_metric_item_count: 5,
      criteria: ["pnl", "drawdown", "fill_rate", "sharpe_ratio"],
      limit: 20,
      top_runtime_id: "rt-0050paper",
    },
    items: [
      {
        block_id: "pnl-leaders",
        label: "P&L Leaders",
        metric: "pnl",
        sort_order: "desc",
        ranking_basis: "within_comparison_scope",
        eligible_item_count: 2,
        missing_metric_count: 1,
        missing_metric_runtime_ids: ["rt-3252fa75"],
        metric_reasons: {
          "rt-3252fa75": "no_fills",
        },
        items: [
          {
            rank: 1,
            ranking_block_id: "pnl-leaders",
            ranking_metric: "pnl",
            ranking_metric_value: -9.734,
            ranking_unit: "TWD",
            ranking_eligible: true,
            runtime_id: "rt-0050paper",
            runtime_binding_id: "rb-0050paper",
            persona_id: "persona-hengyue-0050",
            persona_name: "衡岳｜0050 台股 ETF Paper",
            strategy_id: "strategy-persona-0050",
            strategy_name: "0050 台股 ETF 策略",
            underlying_symbol: "0050",
            tenant_id: "tenant-dev",
            deployment_stage: "paper",
            status: "active",
            pnl: -9.734,
            comparison_scope: {
              stage: "paper",
              unit: "TWD",
              definition: "realized_plus_unrealized",
              period: {
                start_at: "2026-11-16T00:00:00Z",
                as_of: "2026-11-22T12:00:00Z",
                window: "1h",
              },
            },
            links: {
              persona: "/management/personas/persona-hengyue-0050",
              strategy: "/management/strategies/strategy-persona-0050",
            },
          },
          {
            rank: 2,
            ranking_block_id: "pnl-leaders",
            ranking_metric: "pnl",
            ranking_metric_value: -168.085,
            ranking_unit: "TWD",
            ranking_eligible: true,
            runtime_id: "rt-ad81501b",
            runtime_binding_id: "rb-3823397e125e4579ba5f4174067087ed",
            persona_id: "persona-2448c7053e33ea48da47",
            persona_name: "青禾｜2330 台股 Paper 學習 R3",
            strategy_id: "strategy-persona-06d4775a9b6a8f63b311",
            strategy_name: "2330 台股 Paper 學習策略",
            underlying_symbol: "2330",
            tenant_id: "tenant-dev",
            deployment_stage: "paper",
            status: "active",
            pnl: -168.085,
            comparison_scope: {
              stage: "paper",
              unit: "TWD",
              definition: "realized_plus_unrealized",
              period: {
                start_at: "2026-11-16T00:00:00Z",
                as_of: "2026-11-22T12:00:00Z",
                window: "1h",
              },
            },
            links: {
              persona: "/management/personas/persona-2448c7053e33ea48da47",
              strategy: "/management/strategies/strategy-persona-06d4775a9b6a8f63b311",
              journey: "/management/trade-journeys/tj_29473e86-63ff-5384-bda1-23eef61cebb2?tenant_id=tenant-dev&environment=paper",
            },
          },
        ],
      },
      {
        block_id: "drawdown-control",
        label: "Drawdown Control",
        metric: "drawdown",
        sort_order: "asc",
        ranking_basis: "within_comparison_scope",
        eligible_item_count: 2,
        missing_metric_count: 1,
        missing_metric_runtime_ids: ["rt-3252fa75"],
        metric_reasons: {
          "rt-3252fa75": "no_fills",
        },
        items: [
          {
            rank: 1,
            ranking_block_id: "drawdown-control",
            ranking_metric: "drawdown",
            ranking_metric_value: 0.004,
            ranking_unit: "fraction",
            ranking_eligible: true,
            runtime_id: "rt-0050paper",
            runtime_binding_id: "rb-0050paper",
            persona_id: "persona-hengyue-0050",
            persona_name: "衡岳｜0050 台股 ETF Paper",
            strategy_id: "strategy-persona-0050",
            strategy_name: "0050 台股 ETF 策略",
            underlying_symbol: "0050",
            tenant_id: "tenant-dev",
            deployment_stage: "paper",
            status: "active",
            drawdown: 0.004,
            comparison_scope: {
              stage: "paper",
              unit: "fraction",
            },
            links: {
              persona: "/management/personas/persona-hengyue-0050",
              strategy: "/management/strategies/strategy-persona-0050",
            },
          },
          {
            rank: 2,
            ranking_block_id: "drawdown-control",
            ranking_metric: "drawdown",
            ranking_metric_value: 0.012,
            ranking_unit: "fraction",
            ranking_eligible: true,
            runtime_id: "rt-ad81501b",
            runtime_binding_id: "rb-3823397e125e4579ba5f4174067087ed",
            persona_id: "persona-2448c7053e33ea48da47",
            persona_name: "青禾｜2330 台股 Paper 學習 R3",
            strategy_id: "strategy-persona-06d4775a9b6a8f63b311",
            strategy_name: "2330 台股 Paper 學習策略",
            underlying_symbol: "2330",
            tenant_id: "tenant-dev",
            deployment_stage: "paper",
            status: "active",
            drawdown: 0.012,
            comparison_scope: {
              stage: "paper",
              unit: "fraction",
            },
            links: {
              persona: "/management/personas/persona-2448c7053e33ea48da47",
              strategy: "/management/strategies/strategy-persona-06d4775a9b6a8f63b311",
              journey: "/management/trade-journeys/tj_29473e86-63ff-5384-bda1-23eef61cebb2?tenant_id=tenant-dev&environment=paper",
            },
          },
        ],
      },
      {
        block_id: "execution-quality",
        label: "Execution Quality",
        metric: "fill_rate",
        secondary_metric: "avg_slippage_bps",
        sort_order: "desc",
        ranking_basis: "within_comparison_scope",
        eligible_item_count: 3,
        missing_metric_count: 0,
        missing_metric_runtime_ids: [],
        metric_reasons: {},
        items: [
          {
            rank: 1,
            ranking_block_id: "execution-quality",
            ranking_metric: "fill_rate",
            ranking_metric_value: 1.0,
            ranking_unit: "fraction",
            ranking_eligible: true,
            runtime_id: "rt-ad81501b",
            runtime_binding_id: "rb-3823397e125e4579ba5f4174067087ed",
            persona_id: "persona-2448c7053e33ea48da47",
            persona_name: "青禾｜2330 台股 Paper 學習 R3",
            strategy_id: "strategy-persona-06d4775a9b6a8f63b311",
            strategy_name: "2330 台股 Paper 學習策略",
            underlying_symbol: "2330",
            tenant_id: "tenant-dev",
            deployment_stage: "paper",
            status: "active",
            fill_rate: 1.0,
            avg_slippage_bps: 0,
            comparison_scope: {
              stage: "paper",
              unit: "fraction",
              basis: "filled_quantity_over_submitted_quantity",
            },
            links: {
              persona: "/management/personas/persona-2448c7053e33ea48da47",
              strategy: "/management/strategies/strategy-persona-06d4775a9b6a8f63b311",
              journey: "/management/trade-journeys/tj_29473e86-63ff-5384-bda1-23eef61cebb2?tenant_id=tenant-dev&environment=paper",
            },
          },
          {
            rank: 2,
            ranking_block_id: "execution-quality",
            ranking_metric: "fill_rate",
            ranking_metric_value: 1.0,
            ranking_unit: "fraction",
            ranking_eligible: true,
            runtime_id: "rt-0050paper",
            runtime_binding_id: "rb-0050paper",
            persona_id: "persona-hengyue-0050",
            persona_name: "衡岳｜0050 台股 ETF Paper",
            strategy_id: "strategy-persona-0050",
            strategy_name: "0050 台股 ETF 策略",
            underlying_symbol: "0050",
            tenant_id: "tenant-dev",
            deployment_stage: "paper",
            status: "active",
            fill_rate: 1.0,
            avg_slippage_bps: 0,
            comparison_scope: {
              stage: "paper",
              unit: "fraction",
              basis: "filled_quantity_over_submitted_quantity",
            },
            links: {
              persona: "/management/personas/persona-hengyue-0050",
              strategy: "/management/strategies/strategy-persona-0050",
            },
          },
          {
            rank: 3,
            ranking_block_id: "execution-quality",
            ranking_metric: "fill_rate",
            ranking_metric_value: 0,
            ranking_unit: "fraction",
            ranking_eligible: true,
            runtime_id: "rt-3252fa75",
            runtime_binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
            persona_id: "persona-6507750312870d03a241",
            persona_name: "澄川｜2317 台股 Paper",
            strategy_id: "strategy-persona-039ad01f8bcd2b4aa466",
            strategy_name: "2317 台股 Paper 策略",
            underlying_symbol: "2317",
            tenant_id: "tenant-dev",
            deployment_stage: "paper",
            status: "active",
            fill_rate: 0,
            avg_slippage_bps: null,
            comparison_scope: {
              stage: "paper",
              unit: "fraction",
              basis: "filled_quantity_over_submitted_quantity",
            },
            latest_outcome: {
              status: "available",
              occurred_at: "2026-11-19T23:46:17Z",
              reason_code: "insufficient_cash",
              submitted_to_broker: false,
              requested_quantity: 452,
              required: 100034.3461,
              available: 100000,
              currency: "TWD",
              journey_id: "tj_79726064-4cc2-5510-8e11-7f5e59ff89bd",
              source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
              focus_stage: "risk_evaluation",
            },
            links: {
              persona: "/management/personas/persona-6507750312870d03a241",
              strategy: "/management/strategies/strategy-persona-039ad01f8bcd2b4aa466",
              journey: "/management/trade-journeys/tj_79726064-4cc2-5510-8e11-7f5e59ff89bd?tenant_id=tenant-dev&environment=paper",
            },
          },
        ],
      },
      {
        block_id: "sharpe-leaders",
        label: "Sharpe Leaders",
        metric: "sharpe_ratio",
        sort_order: "desc",
        ranking_basis: "within_comparison_scope",
        eligible_item_count: 0,
        missing_metric_count: 3,
        missing_metric_runtime_ids: ["rt-ad81501b", "rt-0050paper", "rt-3252fa75"],
        metric_reasons: {
          "rt-ad81501b": "min_10_daily_returns_required",
          "rt-0050paper": "zero_return_variance",
          "rt-3252fa75": "no_fills",
        },
        items: [],
      },
    ],
  },
  meta: {
    snapshot_at: "2026-11-22T12:00:00Z",
    surfaces: {
      management_trading_pulse_rankings: { status: "degraded", source: "bff_composed" },
    },
  },
} as const;
