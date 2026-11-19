// Shapes documented in BFF_API_CONTRACT.md (BFF-PERSONA-STRATEGY-VISIBILITY-20261119),
// values taken from the recorded hosted responses of 2026-11-19 with the post-change roles.
import type { StrategyRule } from "@/lib/bff-v1";

const MOMENTUM_LOGIC = {
  kind: "close_to_close_momentum", positive_action: "BUY", non_positive_action: "SELL",
  lookback_parameter: "lookback_bars", threshold_parameter: "momentum_threshold",
};
const MOMENTUM_PARAMS = {
  market: "TW", symbols: ["2330.TWSE"], data_source: "source-ingest:tw_price_daily", bar_frequency: "1d",
  lookback_bars: 2, quantity_type: "SHARES", order_quantity: 1, momentum_threshold: 0.0, zero_momentum_action: "SELL",
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
