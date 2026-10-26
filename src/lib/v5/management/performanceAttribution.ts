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

export interface PerformanceAttributionResult {
  rows: PerformanceAttributionRow[];
  period: AttributionPeriodState;
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
  dimension: AttributionDimension;
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
}

function dimensionToHrefKind(d: AttributionDimension): ManagementHrefKind | null {
  switch (d) {
    case "persona": return "persona";
    case "strategy": return "strategy";
    case "capital_pool": return "capital_pool";
    case "runtime": return "runtime";
    default: return null;
  }
}

export function buildAttributionLinks(
  dimension: AttributionDimension,
  key: string,
): ManagementLinkSet {
  const k = dimensionToHrefKind(dimension);
  if (k) return buildLinkSet({ primary: { kind: k, id: key } });
  // No direct entity route — fall back to evidence.
  const href = resolveManagementHref("evidence", undefined) ?? "/management/evidence";
  return { manageHref: href };
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
