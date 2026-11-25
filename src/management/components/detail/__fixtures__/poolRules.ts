// Shapes documented in BFF_API_CONTRACT.md (BFF-PERSONA-STRATEGY-VISIBILITY-20261119),
// values taken from the recorded hosted responses of 2026-11-19 and 2026-11-25 with the post-change roles.
import type { Strategy, StrategyRule } from "@/lib/bff-v1";

const MOMENTUM_LOGIC = {
  kind: "close_to_close_momentum", positive_action: "BUY", non_positive_action: "SELL",
  lookback_parameter: "lookback_bars", threshold_parameter: "momentum_threshold",
};
const MOMENTUM_PARAMS = {
  market: "TW", symbols: ["2330.TWSE"], data_source: "source-ingest:tw_price_daily", bar_frequency: "1d",
  lookback_bars: 2, quantity_type: "SHARES", order_quantity: 1, momentum_threshold: 0.0, zero_momentum_action: "SELL",
};

const BASELINE_LOGIC = {
  kind: "close_to_close_momentum", positive_action: "HOLD", non_positive_action: "HOLD",
  lookback_parameter: "lookback_bars", threshold_parameter: "momentum_threshold",
};
const BASELINE_PARAMS = {
  market: "TW", symbols: ["2330.TWSE"], data_source: "source-ingest:tw_price_daily", bar_frequency: "1d",
  lookback_bars: 2, quantity_type: "SHARES", order_quantity: 0, momentum_threshold: 0.0, zero_momentum_action: "HOLD",
};

export const POOL_MEMBER_RULE: StrategyRule = {
  registryId: "artifact-persona-paper-06d4775a9b6a8f63b311", version: "1.0.0", role: "pool_member",
  strategyLogic: MOMENTUM_LOGIC, parameters: MOMENTUM_PARAMS,
};

export const POOL_ENVELOPE_RULE: StrategyRule = {
  registryId: "artifact-persona-pool-06d4775a9b6a8f63b311-v2", version: "1.2.0", role: "pool_envelope",
  strategyLogic: { kind: "persona_portfolio_v1", combination_rule: "clipped_weighted_sum_v1" },
  parameters: { pool_version: 2 },
  combinationRule: "clipped_weighted_sum_v1",
  riskLimits: { max_net_strength: 1.0, gross_weight_limit: 1.0 },
  members: [
    { registryId: "artifact-persona-paper-06d4775a9b6a8f63b311", riskWeight: 1.0, strategyLogic: MOMENTUM_LOGIC, parameters: MOMENTUM_PARAMS },
    { registryId: "artifact-unknown-kind", riskWeight: 0.5, strategyLogic: { kind: "stat_arb_pairs_zscore" }, parameters: { window: 30 } },
  ],
};

// Recorded hosted response for strategy-persona-a81b4fd15944698341aa (2026-11-25 on BFF adc027da9):
// rollback_baseline order_quantity 0; pool_member artifact-persona-paper-a81b4fd15944698341aa order_quantity 1;
// pool_envelope artifact-persona-pool-a81b4fd15944698341aa-v2.
export const RECORDED_A81B_STRATEGY_ID = "strategy-persona-a81b4fd15944698341aa";

export const RECORDED_A81B_ROLLBACK_BASELINE_RULE: StrategyRule = {
  registryId: "artifact-persona-paper-baseline-a81b4fd15944698341aa",
  version: "1.0.0",
  role: "rollback_baseline",
  strategyLogic: BASELINE_LOGIC,
  parameters: BASELINE_PARAMS,
};

export const RECORDED_A81B_POOL_MEMBER_RULE: StrategyRule = {
  registryId: "artifact-persona-paper-a81b4fd15944698341aa",
  version: "1.0.0",
  role: "pool_member",
  strategyLogic: MOMENTUM_LOGIC,
  parameters: MOMENTUM_PARAMS,
};

export const RECORDED_A81B_POOL_ENVELOPE_RULE: StrategyRule = {
  registryId: "artifact-persona-pool-a81b4fd15944698341aa-v2",
  version: "1.2.0",
  role: "pool_envelope",
  strategyLogic: { kind: "persona_portfolio_v1", combination_rule: "clipped_weighted_sum_v1" },
  parameters: { pool_version: 2 },
  combinationRule: "clipped_weighted_sum_v1",
  riskLimits: { max_net_strength: 1.0, gross_weight_limit: 1.0 },
  members: [
    {
      registryId: "artifact-persona-paper-a81b4fd15944698341aa",
      riskWeight: 1.0,
      strategyLogic: MOMENTUM_LOGIC,
      parameters: MOMENTUM_PARAMS,
    },
  ],
};

export const RECORDED_A81B_RULES: StrategyRule[] = [
  RECORDED_A81B_ROLLBACK_BASELINE_RULE,
  RECORDED_A81B_POOL_MEMBER_RULE,
  RECORDED_A81B_POOL_ENVELOPE_RULE,
];

export const RECORDED_A81B_STRATEGY: Strategy = {
  id: RECORDED_A81B_STRATEGY_ID,
  name: "青禾｜2330 台股 Paper 學習 R3 Paper Strategy",
  alpha: "",
  state: "approved",
  risk: "low",
  owner: "persona-a81b4fd15944698341aa",
  capitalPoolId: "pool-persona-paper-a81b4fd15944698341aa",
  personaIds: ["persona-a81b4fd15944698341aa"],
  personaStates: [{ personaId: "persona-a81b4fd15944698341aa", state: "paper_running" }],
  persona_display_names: { "persona-a81b4fd15944698341aa": "青禾｜2330 台股 Paper 學習 R3" },
  operationalStatus: "running",
  symbols: ["2330.TWSE"],
  rules: RECORDED_A81B_RULES,
  is_synthetic_or_stub: false,
  pnl: 0,
  pnl30d: null,
  sharpe: null,
  drawdown: 0,
  updatedAt: "2026-11-25T06:35:00Z",
} as unknown as Strategy;

