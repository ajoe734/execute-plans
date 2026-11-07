import type { StrategyRule } from "@/lib/bff-v1";

export type StrategyRuleDisplayKind =
  | "sentence"
  | "rollback_baseline"
  | "unsupported";

export interface StrategyRuleDisplayResult {
  kind: StrategyRuleDisplayKind;
  text: string;
  rawKind?: string;
}

const ZH_ACTION_LABELS: Readonly<Record<string, string>> = {
  BUY: "買進",
  SELL: "賣出",
  HOLD: "不動作",
};

const EN_ACTION_LABELS: Readonly<Record<string, string>> = {
  BUY: "buy",
  SELL: "sell",
  HOLD: "hold",
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatMomentumThresholdPercent(threshold: number): string {
  const scaled = Number((threshold * 100).toPrecision(12));
  return `${Object.is(scaled, -0) ? 0 : scaled}%`;
}

export function isRollbackBaselineRule(
  rule: Partial<StrategyRule> | null | undefined,
): boolean {
  if (!rule) return false;
  if (rule.role === "rollback_baseline") return true;
  const logic =
    rule.strategyLogic && typeof rule.strategyLogic === "object"
      ? rule.strategyLogic
      : null;
  const params =
    rule.parameters && typeof rule.parameters === "object"
      ? rule.parameters
      : null;
  const positiveAction =
    typeof logic?.positive_action === "string" ? logic.positive_action.trim() : "";
  const nonPositiveAction =
    typeof logic?.non_positive_action === "string"
      ? logic.non_positive_action.trim()
      : "";
  const orderQuantity = params?.order_quantity;
  return (
    positiveAction === "HOLD" &&
    nonPositiveAction === "HOLD" &&
    isFiniteNumber(orderQuantity) &&
    orderQuantity === 0
  );
}

export function formatStrategyRuleResult(
  rule: Partial<StrategyRule> | null | undefined,
  locale: string = "en-US",
): StrategyRuleDisplayResult {
  const isZh = locale.trim().toLowerCase().startsWith("zh");

  if (isRollbackBaselineRule(rule)) {
    return {
      kind: "rollback_baseline",
      text: isZh
        ? "不送單回滾基準（正負向皆不動作，下單數量 0）"
        : "No-order rollback baseline (both actions HOLD, order quantity 0)",
    };
  }

  const logic =
    rule?.strategyLogic && typeof rule.strategyLogic === "object"
      ? rule.strategyLogic
      : null;
  const params =
    rule?.parameters && typeof rule.parameters === "object"
      ? rule.parameters
      : null;

  const rawKind =
    typeof logic?.kind === "string" && logic.kind.trim().length > 0
      ? logic.kind.trim()
      : "unknown";

  if (rawKind !== "close_to_close_momentum") {
    return {
      kind: "unsupported",
      rawKind,
      text: isZh
        ? `不支援的規則類型：${rawKind}`
        : `Unsupported rule kind: ${rawKind}`,
    };
  }

  const lookbackKey =
    typeof logic?.lookback_parameter === "string" &&
    logic.lookback_parameter.trim().length > 0
      ? logic.lookback_parameter.trim()
      : "lookback_bars";
  const thresholdKey =
    typeof logic?.threshold_parameter === "string" &&
    logic.threshold_parameter.trim().length > 0
      ? logic.threshold_parameter.trim()
      : "momentum_threshold";

  const rawLookback = params?.[lookbackKey];
  const rawThreshold = params?.[thresholdKey];
  const rawOrderQuantity = params?.order_quantity;
  const rawBar =
    typeof params?.bar_frequency === "string" ? params.bar_frequency.trim() : "";
  const rawUnit =
    typeof params?.quantity_type === "string" ? params.quantity_type.trim() : "";
  const rawPositive =
    typeof logic?.positive_action === "string"
      ? logic.positive_action.trim()
      : "";
  const rawNegative =
    typeof logic?.non_positive_action === "string"
      ? logic.non_positive_action.trim()
      : "";

  if (
    !isFiniteNumber(rawLookback) ||
    rawLookback < 1 ||
    !isFiniteNumber(rawThreshold) ||
    !isFiniteNumber(rawOrderQuantity) ||
    !rawBar ||
    !rawUnit ||
    !rawPositive ||
    !rawNegative
  ) {
    return {
      kind: "unsupported",
      rawKind,
      text: isZh
        ? `不支援的規則類型：${rawKind}`
        : `Unsupported rule kind: ${rawKind}`,
    };
  }

  const n = rawLookback - 1;
  const threshold = formatMomentumThresholdPercent(rawThreshold);
  const qty = String(rawOrderQuantity);

  if (isZh) {
    const bar = rawBar === "1d" ? "日" : rawBar;
    const positive = ZH_ACTION_LABELS[rawPositive] ?? rawPositive;
    const negative = ZH_ACTION_LABELS[rawNegative] ?? rawNegative;
    const unit = rawUnit === "SHARES" ? "股" : rawUnit;
    return {
      kind: "sentence",
      rawKind,
      text: `每根${bar}K 收盤時，比較最新收盤價與 ${n} 根前的收盤價：漲幅大於 ${threshold} 就${positive} ${qty} ${unit}，否則${negative} ${qty} ${unit}。`,
    };
  }

  const bar = rawBar;
  const positive = EN_ACTION_LABELS[rawPositive] ?? rawPositive;
  const negative = EN_ACTION_LABELS[rawNegative] ?? rawNegative;
  const unit = rawUnit === "SHARES" ? "shares" : rawUnit;

  return {
    kind: "sentence",
    rawKind,
    text: `At each ${bar} bar close, compare the latest close with the close ${n} bars earlier: if it rose more than ${threshold}, ${positive} ${qty} ${unit}; otherwise ${negative} ${qty} ${unit}.`,
  };
}

export function formatStrategyRuleText(
  rule: Partial<StrategyRule> | null | undefined,
  locale: string = "en-US",
): string {
  return formatStrategyRuleResult(rule, locale).text;
}
