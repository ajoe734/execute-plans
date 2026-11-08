import { describe, expect, it } from "vitest";
import type { StrategyRule } from "@/lib/bff-v1";
import {
  formatStrategyRuleResult,
  formatStrategyRuleText,
  isRollbackBaselineRule,
} from "./strategyRuleText";

const REAL_TRADING_BUNDLE: StrategyRule = {
  registryId: "artifact-persona-paper-b9f9e2e4d44cdd44d160",
  version: "1.0.0",
  role: "trading",
  strategyLogic: {
    kind: "close_to_close_momentum",
    lookback_parameter: "lookback_bars",
    threshold_parameter: "momentum_threshold",
    positive_action: "BUY",
    non_positive_action: "SELL",
  },
  parameters: {
    market: "TW",
    symbols: ["2330.TW"],
    data_source: "source-ingest:paper/persona-bootstrap",
    bar_frequency: "1d",
    lookback_bars: 2,
    quantity_type: "SHARES",
    order_quantity: 1,
    momentum_threshold: 0,
    zero_momentum_action: "SELL",
  },
  adjustableControls: [
    {
      parameter_key: "lookback_bars",
      value_type: "integer",
      current_value: 2,
      allowed_range: { min: 2, max: 60 },
      step: 1,
    },
    {
      parameter_key: "momentum_threshold",
      value_type: "number",
      current_value: 0.0,
      allowed_range: { min: 0.0, max: 0.05 },
      step: 0.001,
    },
  ],
  immutableParameters: [
    "symbols",
    "bar_frequency",
    "data_source",
    "order_quantity",
    "quantity_type",
    "zero_momentum_action",
    "market",
  ],
};

const REAL_BASELINE_BUNDLE: StrategyRule = {
  registryId: "artifact-persona-paper-baseline-b9f9e2e4d44cdd44d160",
  version: "1.0.0",
  role: "rollback_baseline",
  strategyLogic: {
    kind: "close_to_close_momentum",
    lookback_parameter: "lookback_bars",
    threshold_parameter: "momentum_threshold",
    positive_action: "HOLD",
    non_positive_action: "HOLD",
  },
  parameters: {
    market: "TW",
    symbols: ["2330.TW"],
    data_source: "source-ingest:paper/persona-bootstrap",
    bar_frequency: "1d",
    lookback_bars: 2,
    quantity_type: "SHARES",
    order_quantity: 0,
    momentum_threshold: 0,
    zero_momentum_action: "HOLD",
  },
  adjustableControls: [],
  immutableParameters: [
    "symbols",
    "bar_frequency",
    "data_source",
    "order_quantity",
    "quantity_type",
    "zero_momentum_action",
    "market",
  ],
};

describe("strategyRuleText", () => {
  it("formats the real trading bundle from the hosted registry in zh-TW and en-US", () => {
    expect(formatStrategyRuleText(REAL_TRADING_BUNDLE, "zh-TW")).toBe(
      "每根日K 收盤時，比較最新收盤價與 1 根前的收盤價：漲幅大於 0% 就買進 1 股，否則賣出 1 股。",
    );
    expect(formatStrategyRuleText(REAL_TRADING_BUNDLE, "en-US")).toBe(
      "At each 1d bar close, compare the latest close with the close 1 bars earlier: if it rose more than 0%, buy 1 shares; otherwise sell 1 shares.",
    );
  });

  it("labels the real baseline bundle as a no-order rollback baseline instead of a trading sentence in both locales", () => {
    expect(isRollbackBaselineRule(REAL_BASELINE_BUNDLE)).toBe(true);
    expect(
      isRollbackBaselineRule({
        ...REAL_BASELINE_BUNDLE,
        role: "trading",
      }),
    ).toBe(true);

    const zhResult = formatStrategyRuleResult(REAL_BASELINE_BUNDLE, "zh-TW");
    expect(zhResult.kind).toBe("rollback_baseline");
    expect(zhResult.text).toBe("不送單回滾基準（正負向皆不動作，下單數量 0）");

    const enResult = formatStrategyRuleResult(REAL_BASELINE_BUNDLE, "en-US");
    expect(enResult.kind).toBe("rollback_baseline");
    expect(enResult.text).toBe(
      "No-order rollback baseline (both actions HOLD, order quantity 0)",
    );
  });

  it("formats momentum_threshold 0.005 as 0.5% and lookback_bars 5 as 4 bars earlier in both locales", () => {
    const customBundle: StrategyRule = {
      ...REAL_TRADING_BUNDLE,
      parameters: {
        ...REAL_TRADING_BUNDLE.parameters,
        lookback_bars: 5,
        momentum_threshold: 0.005,
      },
    };

    expect(formatStrategyRuleText(customBundle, "zh-TW")).toBe(
      "每根日K 收盤時，比較最新收盤價與 4 根前的收盤價：漲幅大於 0.5% 就買進 1 股，否則賣出 1 股。",
    );
    expect(formatStrategyRuleText(customBundle, "en-US")).toBe(
      "At each 1d bar close, compare the latest close with the close 4 bars earlier: if it rose more than 0.5%, buy 1 shares; otherwise sell 1 shares.",
    );
  });

  it("preserves unknown action values raw and non-1d/non-SHARES values raw in both locales", () => {
    const unknownActionBundle: StrategyRule = {
      ...REAL_TRADING_BUNDLE,
      strategyLogic: {
        ...REAL_TRADING_BUNDLE.strategyLogic,
        positive_action: "REBALANCE_LONG",
        non_positive_action: "HOLD",
      },
      parameters: {
        ...REAL_TRADING_BUNDLE.parameters,
        bar_frequency: "4h",
        quantity_type: "LOTS",
      },
    };

    expect(formatStrategyRuleText(unknownActionBundle, "zh-TW")).toBe(
      "每根4hK 收盤時，比較最新收盤價與 1 根前的收盤價：漲幅大於 0% 就REBALANCE_LONG 1 LOTS，否則不動作 1 LOTS。",
    );
    expect(formatStrategyRuleText(unknownActionBundle, "en-US")).toBe(
      "At each 4h bar close, compare the latest close with the close 1 bars earlier: if it rose more than 0%, REBALANCE_LONG 1 LOTS; otherwise hold 1 LOTS.",
    );
  });

  it("reports unsupported rule kinds with their raw kind and never invents a sentence", () => {
    const unsupportedRule: StrategyRule = {
      ...REAL_TRADING_BUNDLE,
      strategyLogic: {
        kind: "stat_arb_pairs_zscore",
      },
    };

    const zh = formatStrategyRuleResult(unsupportedRule, "zh-TW");
    expect(zh).toEqual({
      kind: "unsupported",
      rawKind: "stat_arb_pairs_zscore",
      text: "不支援的規則類型：stat_arb_pairs_zscore",
    });

    const en = formatStrategyRuleResult(unsupportedRule, "en-US");
    expect(en).toEqual({
      kind: "unsupported",
      rawKind: "stat_arb_pairs_zscore",
      text: "Unsupported rule kind: stat_arb_pairs_zscore",
    });
  });
});
