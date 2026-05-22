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

export type AttributionPeriod = "7d" | "30d" | "quarter" | "ytd";

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
