import type { StrategyRule } from "@/lib/bff-v1";

export type StrategyRuleDisplayKind =
  | "sentence"
  | "rollback_baseline"
  | "unsupported";

export interface StrategyRuleDisplayResult {
  kind: StrategyRuleDisplayKind;
  text: string;
  rawKind?: string;
  /** For unsupported kinds: every parameter key and value, so nothing is hidden. */
  params?: Array<{ key: string; value: string }>;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Every key/value of the rule's strategy_logic (beyond kind) and parameters, verbatim. */
export function listRuleParameters(
  rule: Partial<StrategyRule> | null | undefined,
): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const logic = rule?.strategyLogic && typeof rule.strategyLogic === "object" ? rule.strategyLogic : null;
  const params = rule?.parameters && typeof rule.parameters === "object" ? rule.parameters : null;
  for (const [k, v] of Object.entries(logic ?? {})) {
    if (k === "kind") continue;
    out.push({ key: `strategy_logic.${k}`, value: stringifyValue(v) });
  }
  for (const [k, v] of Object.entries(params ?? {})) out.push({ key: k, value: stringifyValue(v) });
  return out;
}

/** Symbols the rule trades (parameters.symbols), for display beside the sentence. */
export function ruleSymbols(rule: Partial<StrategyRule> | null | undefined): string[] {
  const s = rule?.parameters?.symbols;
  return Array.isArray(s) ? s.filter((x): x is string => typeof x === "string") : [];
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
  if (rule.role === "pool_member" || rule.role === "pool_envelope") return false;
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
      params: listRuleParameters(rule),
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
      params: listRuleParameters(rule),
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

export type StrategyRuleResolvedRole =
  | "pool_envelope"
  | "pool_member"
  | "rollback_baseline"
  | "trading";

export function resolveStrategyRuleRole(
  rule: Partial<StrategyRule> | null | undefined,
  locale: string = "en-US",
): StrategyRuleResolvedRole {
  if (rule?.role === "pool_envelope") return "pool_envelope";
  if (rule?.role === "pool_member") return "pool_member";
  const formatted = formatStrategyRuleResult(rule, locale);
  if (rule?.role === "rollback_baseline" || formatted.kind === "rollback_baseline") {
    return "rollback_baseline";
  }
  return "trading";
}

/**
 * Deduplicate strategy rules so a pool member listed both at the top level of
 * `strategy.rules` and inside a `pool_envelope.members` array (or listed twice
 * in either list) is rendered once while preserving `pool_envelope`,
 * `pool_member`, `trading`, and `rollback_baseline` rules.
 */
export function deduplicateStrategyRules(
  rules: readonly StrategyRule[] | null | undefined,
): StrategyRule[] {
  if (!Array.isArray(rules)) return [];

  const topLevelMembersById = new Map<string, StrategyRule>();
  for (const rule of rules) {
    if (rule && rule.role === "pool_member" && typeof rule.registryId === "string" && rule.registryId.trim()) {
      const id = rule.registryId.trim();
      if (!topLevelMembersById.has(id)) {
        topLevelMembersById.set(id, rule);
      }
    }
  }

  const envelopeMemberIds = new Set<string>();
  const normalizedEnvelopes = new Map<StrategyRule, StrategyRule>();
  for (const rule of rules) {
    if (!rule || rule.role !== "pool_envelope") continue;
    const rawMembers = Array.isArray(rule.members) ? rule.members : [];
    const dedupedMembers: NonNullable<StrategyRule["members"]> = [];
    for (const member of rawMembers) {
      if (!member) continue;
      const memberId = typeof member.registryId === "string" ? member.registryId.trim() : "";
      if (memberId) {
        if (envelopeMemberIds.has(memberId)) continue;
        envelopeMemberIds.add(memberId);
      }
      const fallback = memberId ? topLevelMembersById.get(memberId) : undefined;
      dedupedMembers.push({
        ...member,
        strategyLogic: member.strategyLogic ?? fallback?.strategyLogic,
        parameters: member.parameters ?? fallback?.parameters,
      });
    }
    normalizedEnvelopes.set(rule, {
      ...rule,
      ...(Array.isArray(rule.members) ? { members: dedupedMembers } : {}),
    });
  }

  const seenTopLevelIds = new Set<string>();
  const out: StrategyRule[] = [];
  for (const rule of rules) {
    if (!rule) continue;
    const regId = typeof rule.registryId === "string" ? rule.registryId.trim() : "";
    if (rule.role === "pool_member" && regId && envelopeMemberIds.has(regId)) {
      continue;
    }
    if (regId) {
      if (seenTopLevelIds.has(regId)) continue;
      seenTopLevelIds.add(regId);
    }
    out.push(normalizedEnvelopes.get(rule) ?? rule);
  }
  return out;
}

