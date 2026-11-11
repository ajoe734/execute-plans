// 2026-05-22 PM12-008 — Performance Attribution view-model.

import {
  buildLinkSet, resolveManagementHref,
  type ManagementHrefKind, type ManagementLinkSet,
} from "./links";

export type AttributionDimension =
  | "persona" | "strategy" | "capital_pool" | "asset_class"
  | "symbol" | "sector" | "region" | "broker"
  | "runtime" | "research_backend" | "quarter" | "market_regime";

export const ATTRIBUTION_DIMENSIONS: readonly AttributionDimension[] = [
  "persona", "strategy", "capital_pool", "asset_class", "symbol", "sector",
  "region", "broker", "runtime", "research_backend", "quarter", "market_regime",
] as const;

export type SupportedAttributionDimension =
  | "persona"
  | "strategy"
  | "capital_pool"
  | "symbol"
  | "broker"
  | "runtime"
  | "market_regime";

/**
 * Dimensions accepted by GET /bff/management/performance-attribution.
 * Unsupported dimensions (asset_class, sector, region, research_backend, quarter)
 * return 422 from the BFF and must not be offered as active transport filters.
 */
export const SUPPORTED_ATTRIBUTION_DIMENSIONS: readonly SupportedAttributionDimension[] = [
  "persona",
  "strategy",
  "capital_pool",
  "symbol",
  "broker",
  "runtime",
  "market_regime",
] as const;

export const UNSUPPORTED_ATTRIBUTION_DIMENSIONS = [
  "asset_class",
  "sector",
  "region",
  "research_backend",
  "quarter",
] as const;

/**
 * Exact alias map accepted by services/control-plane/bff/management_read_models/ranking_router.py
 * (_PM12_ATTRIBUTION_DIMENSION_ALIASES), normalized to the canonical frontend dimension key.
 */
export const BFF_ATTRIBUTION_DIMENSION_ALIASES: Readonly<Record<string, SupportedAttributionDimension>> = {
  persona: "persona",
  personas: "persona",
  strategy: "strategy",
  strategies: "strategy",
  pool: "capital_pool",
  pools: "capital_pool",
  capital_pool: "capital_pool",
  capital_pools: "capital_pool",
  capitalpool: "capital_pool",
  capitalpools: "capital_pool",
  asset: "symbol",
  assets: "symbol",
  instrument: "symbol",
  instruments: "symbol",
  symbol: "symbol",
  symbols: "symbol",
  broker: "broker",
  brokers: "broker",
  runtime: "runtime",
  runtimes: "runtime",
  regime: "market_regime",
  regimes: "market_regime",
  market_regime: "market_regime",
};

export const BFF_ACCEPTED_ATTRIBUTION_DIMENSIONS: readonly string[] = Object.freeze(
  Object.keys(BFF_ATTRIBUTION_DIMENSION_ALIASES),
);

export function isSupportedAttributionDimension(value: unknown): value is SupportedAttributionDimension {
  return typeof value === "string" && (SUPPORTED_ATTRIBUTION_DIMENSIONS as readonly string[]).includes(value);
}

export function normalizeSupportedAttributionDimension(value: unknown): SupportedAttributionDimension | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().replace(/-/g, "_").toLowerCase();
  if (!key) return undefined;
  return Object.prototype.hasOwnProperty.call(BFF_ATTRIBUTION_DIMENSION_ALIASES, key)
    ? BFF_ATTRIBUTION_DIMENSION_ALIASES[key]
    : undefined;
}

export function isBffAcceptedAttributionDimension(value: unknown): boolean {
  return normalizeSupportedAttributionDimension(value) !== undefined;
}

/**
 * Normalizes a BFF dimension ("pool", "asset", "regime", etc.) to its canonical
 * frontend dimension ("capital_pool", "symbol", "market_regime", etc.).
 * Unknown dimensions preserve their raw trimmed string and never fall back to "persona".
 */
export function normalizeAttributionDimension(value: unknown): SupportedAttributionDimension | string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return "unknown";
    return normalizeSupportedAttributionDimension(trimmed) ?? trimmed;
  }
  return "unknown";
}

export type AttributionPeriod = "latest" | "7d" | "30d" | "quarter" | "ytd";

export const DATED_ATTRIBUTION_SOURCE_UNAVAILABLE = "dated_attribution_source_unavailable";

/**
 * What the BFF says it actually applied for `period`. The BFF (pantheon
 * #6785) reports `meta.period = {requested, applied, windowed, basis, reason,
 * message}`; older builds sent a bare string. `windowed` is true only when the
 * BFF explicitly confirms the requested window was applied.
 */
export interface AttributionPeriodState {
  requested?: string;
  applied?: string;
  windowed: boolean;
  basis?: string;
  reason?: string;
  message?: string;
  source: "meta" | "legacy_string" | "summary" | "missing";
}

export interface AttributionInstrumentLearningDecisionRow {
  decision_id: string;
  chosen_instrument_id: string | null;
  best_instrument_id: string | null;
  direction_hit: boolean | null;
  instrument_regret: number | null;
  margin_use: number | null;
  chosen_pnl: number | null;
}

export interface AttributionInstrumentLearning {
  direction_hit_rate: number | null;
  direction_hit_count: number;
  direction_graded_count: number;
  instrument_regret: number | null;
  instrument_regret_graded_count: number;
  margin_use: number | null;
  decision_count: number;
  decisions: AttributionInstrumentLearningDecisionRow[];
}

export interface AttributionInstrumentBreakdownRow {
  instrument_key: string;
  instrument_id: string | null;
  symbol: string | null;
  instrument_kind: string | null;
  contract_month: string | null;
  multiplier: number | null;
  margin_reserved: number | null;
  holding_count: number | null;
  market_value: number | null;
  total_notional: number | null;
  total_pnl: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
}

export interface AttributionSummary {
  instrument_learning?: AttributionInstrumentLearning;
  instrument_breakdown?: AttributionInstrumentBreakdownRow[];
}

export interface PerformanceAttributionResult {
  rows: PerformanceAttributionRow[];
  period: AttributionPeriodState;
  summary?: AttributionSummary;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const optText = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

export function adaptAttributionPeriodState(raw: unknown): AttributionPeriodState {
  const root = isRecord(raw) ? raw : {};
  const meta = isRecord(root.meta) ? root.meta : {};
  const data = isRecord(root.data) ? root.data : {};
  const summary = isRecord(data.summary) ? data.summary : {};
  const metaPeriod = meta.period;

  if (isRecord(metaPeriod)) {
    return {
      requested: optText(metaPeriod.requested),
      applied: optText(metaPeriod.applied),
      windowed: metaPeriod.windowed === true,
      basis: optText(metaPeriod.basis),
      reason: optText(metaPeriod.reason),
      message: optText(metaPeriod.message),
      source: "meta",
    };
  }
  if (optText(metaPeriod)) {
    // Legacy BFF: a bare string never confirmed a window was applied.
    return { applied: optText(metaPeriod), windowed: false, source: "legacy_string" };
  }
  const summaryPeriod = optText(summary.period) ?? optText(data.period);
  if (summaryPeriod || typeof summary.period_windowed === "boolean") {
    return {
      requested: optText(summary.requested_period),
      applied: summaryPeriod,
      windowed: summary.period_windowed === true,
      source: "summary",
    };
  }
  return { windowed: false, source: "missing" };
}

/** The applied period the UI may claim, or undefined when unconfirmed. */
export function confirmedAppliedPeriod(state: AttributionPeriodState): string | undefined {
  if (state.windowed) return state.applied;
  return state.applied === "latest" ? "latest" : undefined;
}

export interface PerformanceAttributionRow {
  dimension: AttributionDimension | string;
  key: string;
  label: string;
  pnlContribution: number;
  pnlContributionPct: number;
  riskContributionPct: number;
  drawdownContributionPct: number;
  turnoverContributionPct?: number;
  slippageContributionBps?: number;
  evidenceRefs: string[];
  links: ManagementLinkSet;
  sourceRefs?: RawAttributionSourceRefs | null;
}

export type RawAttributionSourceRefs = {
  personaIds?: unknown;
  persona_ids?: unknown;
  runtimeIds?: unknown;
  runtime_ids?: unknown;
  capitalPoolIds?: unknown;
  capital_pool_ids?: unknown;
  strategyIds?: unknown;
  strategy_ids?: unknown;
};

type RawAttributionLinks = {
  manageHref?: unknown;
  manage_href?: unknown;
  managementHref?: unknown;
  management_href?: unknown;
  routeHref?: unknown;
  route_href?: unknown;
  href?: unknown;
  capital_pool?: unknown;
  capitalPool?: unknown;
  pool?: unknown;
  persona?: unknown;
  strategy?: unknown;
  runtime?: unknown;
  asset?: unknown;
  symbol?: unknown;
  regime?: unknown;
  market_regime?: unknown;
  [key: string]: unknown;
};

type RawAttributionMetrics = {
  totalPnl?: unknown;
  total_pnl?: unknown;
  pnlContributionPct?: unknown;
  pnl_contribution_pct?: unknown;
  riskContributionPct?: unknown;
  risk_contribution_pct?: unknown;
  drawdownContributionPct?: unknown;
  drawdown_contribution_pct?: unknown;
  worstDrawdown?: unknown;
  worst_drawdown?: unknown;
};

type RawAttributionRowInput = Partial<PerformanceAttributionRow> & {
  dimension?: unknown;
  key?: unknown;
  dimensionKey?: unknown;
  dimension_key?: unknown;
  label?: unknown;
  total_pnl?: unknown;
  pnl_contribution_pct?: unknown;
  risk_contribution_pct?: unknown;
  drawdown_contribution_pct?: unknown;
  metrics?: RawAttributionMetrics | null;
  evidence_refs?: unknown;
  links?: RawAttributionLinks | null;
  sourceRefs?: RawAttributionSourceRefs | null;
  source_refs?: RawAttributionSourceRefs | null;
};

const MISSING_TEXT = "—";

function cleanAttrText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function cleanAttrDataText(...values: unknown[]): string | undefined {
  const value = cleanAttrText(...values);
  if (!value || value.toLowerCase() === "nan" || value === MISSING_TEXT) return undefined;
  return value;
}

function finiteAttrNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return NaN;
}

function nullableAttrNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function nullableAttrText(...values: unknown[]): string | null {
  return cleanAttrDataText(...values) ?? null;
}

function nullableAttrBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

export function normalizeAttributionInstrumentLearningDecision(
  raw: unknown,
): AttributionInstrumentLearningDecisionRow {
  const r = isRecord(raw) ? raw : {};
  return {
    decision_id: cleanAttrDataText(r.decision_id, r.decisionId) ?? MISSING_TEXT,
    chosen_instrument_id: nullableAttrText(r.chosen_instrument_id, r.chosenInstrumentId),
    best_instrument_id: nullableAttrText(r.best_instrument_id, r.bestInstrumentId),
    direction_hit: nullableAttrBoolean(r.direction_hit, r.directionHit),
    instrument_regret: nullableAttrNumber(r.instrument_regret, r.instrumentRegret),
    margin_use: nullableAttrNumber(r.margin_use, r.marginUse),
    chosen_pnl: nullableAttrNumber(r.chosen_pnl, r.chosenPnl),
  };
}

export function adaptAttributionInstrumentLearning(
  raw: unknown,
): AttributionInstrumentLearning | undefined {
  if (!isRecord(raw)) return undefined;
  const decisionsRaw = Array.isArray(raw.decisions) ? raw.decisions : [];
  return {
    direction_hit_rate: nullableAttrNumber(raw.direction_hit_rate, raw.directionHitRate),
    direction_hit_count: nullableAttrNumber(raw.direction_hit_count, raw.directionHitCount) ?? 0,
    direction_graded_count: nullableAttrNumber(raw.direction_graded_count, raw.directionGradedCount) ?? 0,
    instrument_regret: nullableAttrNumber(raw.instrument_regret, raw.instrumentRegret),
    instrument_regret_graded_count:
      nullableAttrNumber(raw.instrument_regret_graded_count, raw.instrumentRegretGradedCount) ?? 0,
    margin_use: nullableAttrNumber(raw.margin_use, raw.marginUse),
    decision_count: nullableAttrNumber(raw.decision_count, raw.decisionCount) ?? decisionsRaw.length,
    decisions: decisionsRaw.map(normalizeAttributionInstrumentLearningDecision),
  };
}

export function normalizeAttributionInstrumentBreakdownRow(
  raw: unknown,
): AttributionInstrumentBreakdownRow {
  const r = isRecord(raw) ? raw : {};
  const instrumentId = nullableAttrText(r.instrument_id, r.instrumentId);
  const symbol = nullableAttrText(r.symbol);
  const instrumentKey =
    cleanAttrDataText(r.instrument_key, r.instrumentKey, instrumentId, symbol) ?? "unassigned";
  return {
    instrument_key: instrumentKey,
    instrument_id: instrumentId,
    symbol,
    instrument_kind: nullableAttrText(r.instrument_kind, r.instrumentKind, r.kind),
    contract_month: nullableAttrText(r.contract_month, r.contractMonth),
    multiplier: nullableAttrNumber(r.multiplier),
    margin_reserved: nullableAttrNumber(r.margin_reserved, r.marginReserved),
    holding_count: nullableAttrNumber(r.holding_count, r.holdingCount),
    market_value: nullableAttrNumber(r.market_value, r.marketValue),
    total_notional: nullableAttrNumber(r.total_notional, r.totalNotional),
    total_pnl: nullableAttrNumber(r.total_pnl, r.totalPnl),
    unrealized_pnl: nullableAttrNumber(r.unrealized_pnl, r.unrealizedPnl),
    realized_pnl: nullableAttrNumber(r.realized_pnl, r.realizedPnl),
  };
}

export function adaptAttributionInstrumentBreakdown(
  raw: unknown,
): AttributionInstrumentBreakdownRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(normalizeAttributionInstrumentBreakdownRow);
}

export function adaptAttributionSummary(raw: unknown): AttributionSummary | undefined {
  const root = isRecord(raw) ? raw : {};
  const data = isRecord(root.data) ? root.data : root;
  const summary = isRecord(data.summary)
    ? data.summary
    : isRecord(root.summary)
      ? root.summary
      : undefined;
  if (!summary) return undefined;
  const instrument_learning = adaptAttributionInstrumentLearning(
    summary.instrument_learning ?? summary.instrumentLearning,
  );
  const instrument_breakdown = adaptAttributionInstrumentBreakdown(
    summary.instrument_breakdown ?? summary.instrumentBreakdown,
  );
  if (instrument_learning === undefined && instrument_breakdown === undefined) {
    return undefined;
  }
  return {
    ...(instrument_learning !== undefined ? { instrument_learning } : {}),
    ...(instrument_breakdown !== undefined ? { instrument_breakdown } : {}),
  };
}

function stringAttrArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanAttrText(item)).filter((item): item is string => Boolean(item))
    : [];
}

function resolveExplicitAttributionManageHref(
  links: RawAttributionLinks | null | undefined,
  dimension: string,
): string | undefined {
  if (!links) return undefined;
  const direct = cleanAttrText(
    links.manageHref,
    links.manage_href,
    links.managementHref,
    links.management_href,
    links.routeHref,
    links.route_href,
    links.href,
  );
  if (direct) return direct;
  const dimensionCandidates = [
    links[dimension],
    dimension === "capital_pool" ? links.capital_pool ?? links.capitalPool ?? links.pool : undefined,
    dimension === "symbol" ? links.symbol ?? links.asset : undefined,
    dimension === "market_regime" ? links.market_regime ?? links.regime : undefined,
    dimension === "persona" ? links.persona : undefined,
    dimension === "strategy" ? links.strategy : undefined,
    dimension === "runtime" ? links.runtime : undefined,
  ];
  for (const candidate of dimensionCandidates) {
    const text = cleanAttrText(candidate);
    if (text && !text.startsWith("/bff/") && !text.startsWith("/api/")) {
      return text;
    }
  }
  return undefined;
}

function dimensionToHrefKind(d: AttributionDimension | string): ManagementHrefKind | null {
  switch (normalizeAttributionDimension(d)) {
    case "persona": return "persona";
    case "strategy": return "strategy";
    case "capital_pool": return "capital_pool";
    case "runtime": return "runtime";
    default: return null;
  }
}

export function buildAttributionLinks(
  dimension: AttributionDimension | string,
  key: string,
): ManagementLinkSet {
  const k = dimensionToHrefKind(dimension);
  if (k && key) return buildLinkSet({ primary: { kind: k, id: key } });
  // No direct entity route — fall back to evidence.
  const href = resolveManagementHref("evidence", undefined) ?? "/management/evidence";
  return { manageHref: href };
}

export function normalizePerformanceAttributionRow(raw: unknown): PerformanceAttributionRow {
  const r = (isRecord(raw) ? raw : {}) as RawAttributionRowInput;
  const metrics = r.metrics ?? {};
  const dimension = normalizeAttributionDimension(r.dimension);
  const key = cleanAttrDataText(r.key, r.dimensionKey, r.dimension_key, r.label) ?? "unknown";
  const label = cleanAttrDataText(r.label, key) ?? MISSING_TEXT;
  const rawLinks: RawAttributionLinks = isRecord(r.links) ? r.links : {};
  const defaultLinks = buildAttributionLinks(dimension, key);
  const manageHref = resolveExplicitAttributionManageHref(rawLinks, dimension) ?? defaultLinks.manageHref;

  return {
    ...r,
    dimension,
    key,
    label,
    pnlContribution: finiteAttrNumber(r.pnlContribution, r.total_pnl, metrics.totalPnl, metrics.total_pnl),
    pnlContributionPct: finiteAttrNumber(
      r.pnlContributionPct,
      r.pnl_contribution_pct,
      metrics.pnlContributionPct,
      metrics.pnl_contribution_pct,
    ),
    riskContributionPct: finiteAttrNumber(
      r.riskContributionPct,
      r.risk_contribution_pct,
      metrics.riskContributionPct,
      metrics.risk_contribution_pct,
    ),
    drawdownContributionPct: finiteAttrNumber(
      r.drawdownContributionPct,
      r.drawdown_contribution_pct,
      metrics.drawdownContributionPct,
      metrics.drawdown_contribution_pct,
      metrics.worstDrawdown,
      metrics.worst_drawdown,
    ),
    evidenceRefs: stringAttrArray(r.evidenceRefs ?? r.evidence_refs),
    links: { ...defaultLinks, ...rawLinks, manageHref },
    sourceRefs: r.sourceRefs ?? r.source_refs,
  };
}

export function defaultPerformanceAttribution(): PerformanceAttributionRow[] {
  const mk = (
    dim: AttributionDimension, key: string, label: string,
    pnl: number, pnlPct: number, riskPct: number, ddPct: number,
  ): PerformanceAttributionRow => ({
    dimension: dim, key, label,
    pnlContribution: pnl, pnlContributionPct: pnlPct,
    riskContributionPct: riskPct, drawdownContributionPct: ddPct,
    turnoverContributionPct: 0.12, slippageContributionBps: 1.4,
    evidenceRefs: [`ev-attr-${dim}-${key}`],
    links: buildAttributionLinks(dim, key),
  });
  return [
    mk("persona", "alpha-trader", "Alpha Trader", 184_000, 0.36, 0.28, 0.18),
    mk("persona", "risk-guard", "Risk Guard", 92_000, 0.18, 0.12, 0.08),
    mk("persona", "fx-scout", "FX Scout", -42_000, -0.08, 0.22, 0.31),
    mk("strategy", "strat-momo-us", "Momentum US", 220_000, 0.43, 0.34, 0.22),
    mk("strategy", "strat-fx-carry", "FX Carry", -28_000, -0.05, 0.18, 0.24),
    mk("capital_pool", "pool-alpha-us", "Alpha US Equity", 320_000, 0.62, 0.42, 0.18),
    mk("capital_pool", "pool-crypto-hedge", "Crypto Hedge", -260_000, -0.51, 0.38, 0.62),
  ];
}
