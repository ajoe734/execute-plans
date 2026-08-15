// 2026-05-22 PM12-002 — Portfolio Book view-model.
// Pure composition; no React, no env reads.

import { buildLinkSet, type ManagementLinkSet } from "./links";

export type PortfolioStatus = "ok" | "watch" | "breach" | "frozen";
export type AssetClass =
  | "equity" | "futures" | "option" | "fx" | "crypto" | "fund" | "cash" | "other";
export type HoldingSide = "long" | "short" | "flat";

export interface PortfolioSummary {
  asOf: string;
  baseCurrency: string;
  totalNav: number;
  totalCash: number;
  grossExposure: number;
  netExposure: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  pnlToday: number;
  pnl7d: number;
  pnl30d: number;
  var95: number;
  cvar95?: number;
  activeCapitalPools: number;
  activePersonas: number;
  activeStrategies: number;
  activeRuntimes: number;
  largestExposureSymbol?: string;
  largestExposurePct?: number;
  highestRiskPoolId?: string;
}

export interface CapitalPoolSummaryRow {
  capitalPoolId: string;
  capitalPoolName: string;
  currency: string;
  nav: number;
  cash: number;
  grossExposure: number;
  netExposure: number;
  leverage: number;
  utilizationPct: number;
  riskBudgetPct: number;
  pnlToday: number;
  pnl7d: number;
  pnl30d: number;
  drawdown: number;
  activeStrategies: number;
  activePersonas: number;
  activeRuntimes: number;
  status: PortfolioStatus;
  links: ManagementLinkSet;
}

export interface HoldingRow {
  holdingId: string;
  capitalPoolId: string;
  brokerAccountRef?: string;
  runtimeId?: string;
  strategyId?: string;
  personaId?: string;
  symbol: string;
  assetClass: AssetClass;
  side: HoldingSide;
  quantity: number;
  avgPrice: number;
  markPrice: number;
  marketValue: number;
  notional: number;
  weightPct: number;
  unrealizedPnl: number;
  realizedPnl: number;
  pnlPct: number;
  exposurePct: number;
  sector?: string;
  region?: string;
  currency: string;
  updatedAt: string;
  links: ManagementLinkSet;
}

export interface PortfolioBookModel {
  summary: PortfolioSummary;
  pools: CapitalPoolSummaryRow[];
  holdings: HoldingRow[];
}

// ---------- PM12-GAP-001 holdings monitor: incidents, filters, capital scope ----------
// Mirrors the live MGMT-OPS-003 BFF holdings/incident contract 1:1 so degraded
// or missing-binding coverage can never render as formal attribution.

export type PortfolioSourceStatus = "ok" | "partial" | "degraded" | "stale" | "unavailable" | string;
export type PortfolioCapitalScopeKind = "paper_ledger" | "canary_sleeve" | "live_capital_pool" | "unclassified";

export interface PortfolioSourceIssue {
  code: string;
  message: string;
}

export interface PortfolioCapitalScope {
  stage: string;
  scopeKind: PortfolioCapitalScopeKind;
  scopeId?: string;
}

export interface PortfolioHoldingMonitorRow {
  holdingId: string;
  runtimeId?: string;
  personaId?: string;
  capitalPoolId?: string;
  brokerId?: string;
  symbol: string;
  quantity?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  deploymentStage: string;
  sourceStatus: PortfolioSourceStatus;
  telemetryStale: boolean;
  riskState: string;
  sourceIssues: PortfolioSourceIssue[];
  capitalScope: PortfolioCapitalScope;
  links: Record<string, string>;
}

export interface PortfolioIncident {
  id: string;
  holdingId?: string;
  severity: string;
  message: string;
  riskState: string;
  sourceStatus: string;
  sourceIssues: PortfolioSourceIssue[];
  links: Record<string, string>;
}

export interface PortfolioCoverageSummary {
  holdingCount: number;
  sourceRowCount: number;
  runtimeCount: number;
  telemetryRuntimeCount: number;
  staleRowCount: number;
  missingBindingCount: number;
  degradedSourceCount: number;
  incidentCount: number;
}

export interface PortfolioHoldingsMonitor {
  items: PortfolioHoldingMonitorRow[];
  incidents: PortfolioIncident[];
  coverage: PortfolioCoverageSummary;
  surfaceStatus: string;
  surfaceMessage?: string;
}

export interface PortfolioHoldingFilters {
  deploymentStage?: string;
  brokerId?: string;
  runtimeId?: string;
  sourceStatus?: string;
  staleTelemetry?: string;
  riskState?: string;
  capitalPoolId?: string;
  personaId?: string;
}

// ---------- seeds ----------

export function defaultPortfolioPools(): CapitalPoolSummaryRow[] {
  return [
    {
      capitalPoolId: "pool-alpha-us", capitalPoolName: "Alpha US Equity",
      currency: "USD", nav: 12_400_000, cash: 1_800_000,
      grossExposure: 14_200_000, netExposure: 10_600_000, leverage: 1.15,
      utilizationPct: 0.72, riskBudgetPct: 0.85,
      pnlToday: 24_000, pnl7d: 112_000, pnl30d: 320_000,
      drawdown: -0.038, activeStrategies: 4, activePersonas: 3, activeRuntimes: 2,
      status: "ok",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-alpha-us" } }),
    },
    {
      capitalPoolId: "pool-fx-macro", capitalPoolName: "FX Macro",
      currency: "USD", nav: 6_800_000, cash: 900_000,
      grossExposure: 9_500_000, netExposure: 2_400_000, leverage: 1.40,
      utilizationPct: 0.81, riskBudgetPct: 0.90,
      pnlToday: -18_000, pnl7d: -42_000, pnl30d: 85_000,
      drawdown: -0.061, activeStrategies: 2, activePersonas: 2, activeRuntimes: 1,
      status: "watch",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-fx-macro" } }),
    },
    {
      capitalPoolId: "pool-crypto-hedge", capitalPoolName: "Crypto Hedge",
      currency: "USD", nav: 3_200_000, cash: 280_000,
      grossExposure: 5_400_000, netExposure: 1_100_000, leverage: 1.69,
      utilizationPct: 0.92, riskBudgetPct: 0.95,
      pnlToday: -52_000, pnl7d: -190_000, pnl30d: -260_000,
      drawdown: -0.124, activeStrategies: 2, activePersonas: 2, activeRuntimes: 1,
      status: "breach",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-crypto-hedge" } }),
    },
  ];
}

export function defaultPortfolioHoldings(): HoldingRow[] {
  return [
    {
      holdingId: "h-aapl-1", capitalPoolId: "pool-alpha-us",
      strategyId: "strat-momo-us", personaId: "alpha-trader", runtimeId: "rt-us-1",
      symbol: "AAPL", assetClass: "equity", side: "long",
      quantity: 8500, avgPrice: 184.2, markPrice: 192.6,
      marketValue: 1_637_100, notional: 1_637_100,
      weightPct: 0.132, unrealizedPnl: 71_400, realizedPnl: 12_300,
      pnlPct: 0.045, exposurePct: 0.115,
      sector: "Technology", region: "US", currency: "USD",
      updatedAt: "2026-05-22T14:00:00Z",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-alpha-us" } }),
    },
    {
      holdingId: "h-nvda-1", capitalPoolId: "pool-alpha-us",
      strategyId: "strat-momo-us", personaId: "alpha-trader", runtimeId: "rt-us-1",
      symbol: "NVDA", assetClass: "equity", side: "long",
      quantity: 1800, avgPrice: 880.0, markPrice: 925.4,
      marketValue: 1_665_720, notional: 1_665_720,
      weightPct: 0.134, unrealizedPnl: 81_720, realizedPnl: 0,
      pnlPct: 0.052, exposurePct: 0.117,
      sector: "Technology", region: "US", currency: "USD",
      updatedAt: "2026-05-22T14:00:00Z",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-alpha-us" } }),
    },
    {
      holdingId: "h-eurusd", capitalPoolId: "pool-fx-macro",
      strategyId: "strat-fx-carry", personaId: "fx-scout", runtimeId: "rt-fx-1",
      symbol: "EURUSD", assetClass: "fx", side: "short",
      quantity: 5_000_000, avgPrice: 1.0840, markPrice: 1.0892,
      marketValue: -5_446_000, notional: 5_446_000,
      weightPct: 0.80, unrealizedPnl: -26_000, realizedPnl: 4_500,
      pnlPct: -0.0048, exposurePct: 0.573,
      region: "Global", currency: "USD",
      updatedAt: "2026-05-22T14:00:00Z",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-fx-macro" } }),
    },
    {
      holdingId: "h-btc-1", capitalPoolId: "pool-crypto-hedge",
      strategyId: "strat-crypto-trend", personaId: "crypto-scout", runtimeId: "rt-crypto-1",
      symbol: "BTCUSD", assetClass: "crypto", side: "long",
      quantity: 32, avgPrice: 72_000, markPrice: 68_400,
      marketValue: 2_188_800, notional: 2_188_800,
      weightPct: 0.684, unrealizedPnl: -115_200, realizedPnl: -22_000,
      pnlPct: -0.050, exposurePct: 0.405,
      region: "Global", currency: "USD",
      updatedAt: "2026-05-22T14:00:00Z",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-crypto-hedge" } }),
    },
    {
      holdingId: "h-cash-usd", capitalPoolId: "pool-alpha-us",
      symbol: "USD", assetClass: "cash", side: "flat",
      quantity: 1_800_000, avgPrice: 1, markPrice: 1,
      marketValue: 1_800_000, notional: 1_800_000,
      weightPct: 0.145, unrealizedPnl: 0, realizedPnl: 0,
      pnlPct: 0, exposurePct: 0,
      region: "US", currency: "USD",
      updatedAt: "2026-05-22T14:00:00Z",
      links: buildLinkSet({ primary: { kind: "capital_pool", id: "pool-alpha-us" } }),
    },
  ];
}

export function composePortfolioSummary(
  pools: CapitalPoolSummaryRow[],
  holdings: HoldingRow[],
): PortfolioSummary {
  const totalNav = pools.reduce((s, p) => s + p.nav, 0);
  const totalCash = pools.reduce((s, p) => s + p.cash, 0);
  const grossExposure = pools.reduce((s, p) => s + p.grossExposure, 0);
  const netExposure = pools.reduce((s, p) => s + p.netExposure, 0);
  const unrealizedPnl = holdings.reduce((s, h) => s + h.unrealizedPnl, 0);
  const realizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0);
  const pnlToday = pools.reduce((s, p) => s + p.pnlToday, 0);
  const pnl7d = pools.reduce((s, p) => s + p.pnl7d, 0);
  const pnl30d = pools.reduce((s, p) => s + p.pnl30d, 0);
  const top = holdings.reduce<HoldingRow | undefined>(
    (a, b) => (!a || b.exposurePct > a.exposurePct ? b : a),
    undefined,
  );
  const worstPool = pools.reduce<CapitalPoolSummaryRow | undefined>(
    (a, b) => (!a || b.drawdown < a.drawdown ? b : a),
    undefined,
  );
  return {
    asOf: "2026-05-22T14:00:00Z",
    baseCurrency: "USD",
    totalNav, totalCash, grossExposure, netExposure,
    leverage: totalNav > 0 ? grossExposure / totalNav : 0,
    unrealizedPnl, realizedPnl, pnlToday, pnl7d, pnl30d,
    var95: Math.round(grossExposure * 0.021),
    cvar95: Math.round(grossExposure * 0.034),
    activeCapitalPools: pools.length,
    activePersonas: new Set(holdings.map((h) => h.personaId).filter(Boolean)).size,
    activeStrategies: new Set(holdings.map((h) => h.strategyId).filter(Boolean)).size,
    activeRuntimes: new Set(holdings.map((h) => h.runtimeId).filter(Boolean)).size,
    largestExposureSymbol: top?.symbol,
    largestExposurePct: top?.exposurePct,
    highestRiskPoolId: worstPool?.capitalPoolId,
  };
}

export function defaultPortfolioBook(): PortfolioBookModel {
  const pools = defaultPortfolioPools();
  const holdings = defaultPortfolioHoldings();
  return { summary: composePortfolioSummary(pools, holdings), pools, holdings };
}
