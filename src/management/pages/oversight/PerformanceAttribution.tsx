// 2026-05-22 PM12-008 — Performance Attribution page.
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { ManagementOperationsNav } from "@/management/components/operations/ManagementOperationsNav";
import { mgmt } from "@/lib/bff-v1";
import type {
  ManagementDataConfidence,
  ManagementOperationsReadModel,
  ManagementPersonaFleetRow,
} from "@/lib/bff-v1/management";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { HoldingRow } from "@/lib/v5/management/portfolio";
import {
  ATTRIBUTION_DIMENSIONS, buildAttributionLinks,
  type AttributionDimension, type AttributionPeriod, type PerformanceAttributionRow,
} from "@/lib/v5/management/performanceAttribution";

const MISSING = "—";
const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : MISSING;
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : MISSING);

const PERIODS: AttributionPeriod[] = ["7d", "30d", "quarter", "ytd"];

const confidenceTone = (confidence: ManagementDataConfidence): string =>
  confidence === "formal"
    ? "border-status-success/40 bg-status-success/10 text-status-success"
    : confidence === "partial" || confidence === "fallback"
      ? "border-status-warning/40 bg-status-warning/10 text-status-warning"
      : "border-status-failed/40 bg-status-failed/10 text-status-failed";

type RawLinks = {
  manageHref?: unknown;
  manage_href?: unknown;
};

type RawMetrics = {
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

type RawSourceRefs = {
  personaIds?: unknown;
  persona_ids?: unknown;
};

type RawAttributionRow = Partial<PerformanceAttributionRow> & {
  dimension?: unknown;
  key?: unknown;
  dimensionKey?: unknown;
  dimension_key?: unknown;
  label?: unknown;
  total_pnl?: unknown;
  pnl_contribution_pct?: unknown;
  risk_contribution_pct?: unknown;
  drawdown_contribution_pct?: unknown;
  metrics?: RawMetrics | null;
  evidence_refs?: unknown;
  links?: RawLinks | null;
  sourceRefs?: RawSourceRefs | null;
  source_refs?: RawSourceRefs | null;
};

type AttributionViewRow = PerformanceAttributionRow & {
  sourceRefs?: RawSourceRefs | null;
};

type RawPersonaFleetRow = ManagementPersonaFleetRow & {
  id?: string;
  persona_id?: string;
  name?: string;
  runtime_id?: unknown;
  runtime_binding_id?: unknown;
  capital_pool_id?: unknown;
  performance_summary?: {
    pnl?: unknown;
    sharpe?: unknown;
    max_drawdown?: unknown;
    maxDrawdown?: unknown;
    violation_count?: unknown;
    violationCount?: unknown;
  } | null;
};

type RawPortfolioHolding = Partial<HoldingRow> & {
  id?: unknown;
  holding_id?: unknown;
  capital_pool_id?: unknown;
  runtime_id?: unknown;
  strategy_id?: unknown;
  persona_id?: unknown;
  instrument?: {
    symbol?: unknown;
    asset_class?: unknown;
    currency?: unknown;
    market?: unknown;
  } | null;
  totalPnl?: unknown;
  total_pnl?: unknown;
  unrealized_pnl?: unknown;
  realized_pnl?: unknown;
  pnl_pct?: unknown;
  exposure_pct?: unknown;
  holdingStart?: unknown;
  holding_start?: unknown;
  openedAt?: unknown;
  opened_at?: unknown;
  enteredAt?: unknown;
  entered_at?: unknown;
  firstSeenAt?: unknown;
  first_seen_at?: unknown;
  holdingEnd?: unknown;
  holding_end?: unknown;
  closedAt?: unknown;
  closed_at?: unknown;
  exitedAt?: unknown;
  exited_at?: unknown;
  lastMarkAt?: unknown;
  last_mark_at?: unknown;
  asOf?: unknown;
  as_of?: unknown;
  updated_at?: unknown;
  telemetry?: {
    window?: unknown;
    collectedAt?: unknown;
    collected_at?: unknown;
    totalTrades?: unknown;
    total_trades?: unknown;
  } | null;
};

type PerformanceSourceDetailRow = {
  id: string;
  source: string;
  sourceHref?: string;
  symbol: string;
  holdingWindow: string;
  runtimeId: string;
  capitalPoolId: string;
  capitalPoolHref?: string;
  strategyId: string;
  pnlContribution: number;
  pnlContributionPct: number;
  drawdownContributionPct: number;
  basis: string;
};

function cleanText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function cleanDataText(...values: unknown[]): string | undefined {
  const value = cleanText(...values);
  if (!value || value.toLowerCase() === "nan" || value === MISSING) return undefined;
  return value;
}

function displayText(...values: unknown[]): string {
  return cleanDataText(...values) ?? MISSING;
}

function finiteNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return NaN;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter((item): item is string => Boolean(item))
    : [];
}

function isAttributionDimension(value: unknown): value is AttributionDimension {
  return typeof value === "string" && ATTRIBUTION_DIMENSIONS.includes(value as AttributionDimension);
}

function isAttributionPeriod(value: unknown): value is AttributionPeriod {
  return typeof value === "string" && PERIODS.includes(value as AttributionPeriod);
}

function selectedDimensionFromQuery(value: string | null, personaFocus: string): AttributionDimension | "all" {
  if (personaFocus) return "persona";
  return isAttributionDimension(value) ? value : "all";
}

function normalizePerformanceAttributionRow(raw: unknown): AttributionViewRow {
  const r = raw as RawAttributionRow;
  const metrics = r.metrics ?? {};
  const dimension = isAttributionDimension(r.dimension) ? r.dimension : "persona";
  const key = cleanDataText(r.key, r.dimensionKey, r.dimension_key, r.label) ?? "unknown";
  const label = cleanDataText(r.label, key) ?? MISSING;
  const links = r.links ?? {};
  const manageHref = cleanText(links.manageHref, links.manage_href) ?? buildAttributionLinks(dimension, key).manageHref;

  return {
    ...r,
    dimension,
    key,
    label,
    pnlContribution: finiteNumber(r.pnlContribution, r.total_pnl, metrics.totalPnl, metrics.total_pnl),
    pnlContributionPct: finiteNumber(r.pnlContributionPct, r.pnl_contribution_pct, metrics.pnlContributionPct, metrics.pnl_contribution_pct),
    riskContributionPct: finiteNumber(r.riskContributionPct, r.risk_contribution_pct, metrics.riskContributionPct, metrics.risk_contribution_pct),
    drawdownContributionPct: finiteNumber(
      r.drawdownContributionPct,
      r.drawdown_contribution_pct,
      metrics.drawdownContributionPct,
      metrics.drawdown_contribution_pct,
      metrics.worstDrawdown,
      metrics.worst_drawdown,
    ),
    evidenceRefs: stringArray(r.evidenceRefs ?? r.evidence_refs),
    links: { ...buildAttributionLinks(dimension, key), ...links, manageHref },
    sourceRefs: r.sourceRefs ?? r.source_refs,
  };
}

function sourceRefPersonaIds(row: AttributionViewRow): string[] {
  const refs = row.sourceRefs;
  if (!refs) return [];
  return stringArray(refs.personaIds ?? refs.persona_ids);
}

function fleetPersonaId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawPersonaFleetRow;
  return cleanDataText(row.personaId, raw.persona_id, raw.id);
}

function fleetRuntimeId(row: ManagementPersonaFleetRow | undefined): string | undefined {
  if (!row) return undefined;
  const raw = row as RawPersonaFleetRow;
  return cleanDataText(row.runtimeId, row.runtimeBinding?.runtimeId, raw.runtime_id, row.runtimeBindingId, raw.runtime_binding_id);
}

function fleetCapitalPoolId(row: ManagementPersonaFleetRow | undefined): string | undefined {
  if (!row) return undefined;
  const raw = row as RawPersonaFleetRow;
  return cleanDataText(row.capitalPoolId, row.capitalPool?.id, raw.capital_pool_id);
}

function fleetStrategyId(row: ManagementPersonaFleetRow | undefined): string | undefined {
  if (!row) return undefined;
  return cleanDataText(
    row.researchStatus?.strategyId,
    row.researchStatus?.strategySpecId,
    row.currentResearchProjects?.[0]?.strategyId,
    row.currentResearchProjects?.[0]?.strategySpecId,
  );
}

function focusedFleetRow(
  fleetRows: ManagementPersonaFleetRow[] | undefined,
  personaFocus: string,
): ManagementPersonaFleetRow | undefined {
  const focus = personaFocus.trim();
  if (!focus) return undefined;
  return (fleetRows ?? []).find((item) => fleetPersonaId(item) === focus);
}

function fallbackAttributionRowFromFleet(
  row: ManagementPersonaFleetRow | undefined,
  personaFocus: string,
): AttributionViewRow | null {
  const focus = personaFocus.trim();
  if (!focus) return null;
  if (!row) return null;
  const raw = row as RawPersonaFleetRow;
  const summary = row.performanceSummary ?? raw.performance_summary ?? {};
  const label = cleanText(row.personaName, raw.name, focus) ?? focus;
  return {
    dimension: "persona",
    key: focus,
    label: `${label} · Persona Fleet summary`,
    pnlContribution: finiteNumber(summary.pnl),
    pnlContributionPct: finiteNumber(row.perfDelta),
    riskContributionPct: NaN,
    drawdownContributionPct: finiteNumber(summary.maxDrawdown, summary.max_drawdown),
    evidenceRefs: [],
    links: {
      manageHref: `/management/persona-fleet?persona=${encodeURIComponent(focus)}`,
    },
    sourceRefs: { personaIds: [focus] },
  };
}

function attributionRowFromReadModel(
  model: ManagementOperationsReadModel | undefined,
  personaFocus: string,
): AttributionViewRow | null {
  if (!model || model.dataConfidence === "unavailable") return null;
  const focus = personaFocus.trim();
  if (!focus || model.identity.personaId !== focus) return null;
  const label = model.identity.personaLabel || focus;
  const fallbackLabel = model.dataConfidence === "formal"
    ? label
    : `${label} · operations summary`;
  return {
    dimension: "persona",
    key: focus,
    label: fallbackLabel,
    pnlContribution: model.performance.pnl ?? NaN,
    pnlContributionPct: model.performance.pnlPct ?? model.performance.performanceDelta ?? NaN,
    riskContributionPct: model.performance.riskPct ?? NaN,
    drawdownContributionPct: model.performance.drawdownPct ?? NaN,
    evidenceRefs: [],
    links: { manageHref: `/management/persona-fleet?persona=${encodeURIComponent(focus)}` },
    sourceRefs: { personaIds: [focus] },
  };
}

function filterPerformanceRowsForPersona(
  rows: AttributionViewRow[],
  personaFocus: string,
): { rows: AttributionViewRow[]; matched: boolean } {
  const focus = personaFocus.trim();
  if (!focus) return { rows, matched: true };
  const filtered = rows.filter((row) => {
    if (row.dimension !== "persona") return false;
    return [row.key, ...sourceRefPersonaIds(row)].some((value) => value === focus);
  });
  return { rows: filtered, matched: filtered.length > 0 };
}

function holdingPersonaId(row: RawPortfolioHolding): string | undefined {
  return cleanDataText(row.personaId, row.persona_id);
}

function holdingRuntimeId(row: RawPortfolioHolding): string | undefined {
  return cleanDataText(row.runtimeId, row.runtime_id);
}

function holdingCapitalPoolId(row: RawPortfolioHolding): string | undefined {
  return cleanDataText(row.capitalPoolId, row.capital_pool_id);
}

function holdingStrategyId(row: RawPortfolioHolding): string | undefined {
  return cleanDataText(row.strategyId, row.strategy_id);
}

function holdingSymbol(row: RawPortfolioHolding): string {
  return displayText(row.symbol, row.instrument?.symbol);
}

function holdingWindow(row: RawPortfolioHolding): string {
  const start = cleanDataText(
    row.holdingStart,
    row.holding_start,
    row.openedAt,
    row.opened_at,
    row.enteredAt,
    row.entered_at,
    row.firstSeenAt,
    row.first_seen_at,
  );
  const end = cleanDataText(
    row.holdingEnd,
    row.holding_end,
    row.closedAt,
    row.closed_at,
    row.exitedAt,
    row.exited_at,
    row.lastMarkAt,
    row.last_mark_at,
    row.updatedAt,
    row.updated_at,
    row.asOf,
    row.as_of,
    row.telemetry?.collectedAt,
    row.telemetry?.collected_at,
  );
  if (!start && !end) return MISSING;
  return `${start ?? MISSING} to ${end ?? MISSING}`;
}

function holdingPnl(row: RawPortfolioHolding): number {
  const total = finiteNumber(row.totalPnl, row.total_pnl);
  if (Number.isFinite(total)) return total;
  const unrealized = finiteNumber(row.unrealizedPnl, row.unrealized_pnl);
  const realized = finiteNumber(row.realizedPnl, row.realized_pnl);
  if (Number.isFinite(unrealized) || Number.isFinite(realized)) {
    return (Number.isFinite(unrealized) ? unrealized : 0) + (Number.isFinite(realized) ? realized : 0);
  }
  return NaN;
}

function capitalPoolHref(capitalPoolId: string): string | undefined {
  return capitalPoolId !== MISSING
    ? `/management/promotion-allocation?tab=quarterly-capital&capital_id=${encodeURIComponent(capitalPoolId)}`
    : undefined;
}

function matchingHoldingsForPersona(
  holdings: HoldingRow[] | undefined,
  personaFocus: string,
  fleetRow: ManagementPersonaFleetRow | undefined,
): RawPortfolioHolding[] {
  const focus = personaFocus.trim();
  if (!focus) return [];
  const runtimeId = fleetRuntimeId(fleetRow);
  const capitalPoolId = fleetCapitalPoolId(fleetRow);

  return (holdings ?? []).filter((item) => {
    const holding = item as RawPortfolioHolding;
    const declaredPersona = holdingPersonaId(holding);
    if (declaredPersona) return declaredPersona === focus;
    const declaredRuntime = holdingRuntimeId(holding);
    if (declaredRuntime) return Boolean(runtimeId && declaredRuntime === runtimeId);
    const declaredPool = holdingCapitalPoolId(holding);
    return Boolean(capitalPoolId && declaredPool === capitalPoolId);
  }) as RawPortfolioHolding[];
}

function sourceRowFromAttribution(
  row: AttributionViewRow,
  personaFocus: string,
  fleetRow: ManagementPersonaFleetRow | undefined,
  summarySource?: "operations-read-model" | "persona-fleet.performanceSummary",
): PerformanceSourceDetailRow {
  const runtimeId = fleetRuntimeId(fleetRow);
  const capitalPoolId = fleetCapitalPoolId(fleetRow);
  const strategyId = fleetStrategyId(fleetRow);
  const displayCapitalPoolId = displayText(row.dimension === "capital_pool" ? row.key : undefined, capitalPoolId);
  return {
    id: `${row.dimension}-${row.key}-aggregate`,
    source: summarySource ?? "performance-attribution",
    sourceHref: summarySource
      ? `/management/persona-fleet?persona=${encodeURIComponent(personaFocus)}`
      : undefined,
    symbol: row.dimension === "symbol" ? row.key : MISSING,
    holdingWindow: MISSING,
    runtimeId: displayText(row.dimension === "runtime" ? row.key : undefined, runtimeId),
    capitalPoolId: displayCapitalPoolId,
    capitalPoolHref: capitalPoolHref(displayCapitalPoolId),
    strategyId: displayText(row.dimension === "strategy" ? row.key : undefined, strategyId),
    pnlContribution: row.pnlContribution,
    pnlContributionPct: row.pnlContributionPct,
    drawdownContributionPct: row.drawdownContributionPct,
    basis: summarySource === "operations-read-model"
      ? "operations read model summary"
      : summarySource === "persona-fleet.performanceSummary"
        ? "Persona Fleet performance summary"
        : "performance-attribution row",
  };
}

function sourceRowsFromHoldings(
  holdings: RawPortfolioHolding[],
  fleetRow: ManagementPersonaFleetRow | undefined,
): PerformanceSourceDetailRow[] {
  return holdings.map((holding, index) => {
    const holdingId = displayText(holding.holdingId, holding.holding_id, holding.id, index);
    const displayCapitalPoolId = displayText(holdingCapitalPoolId(holding), fleetCapitalPoolId(fleetRow));
    return {
      id: `holding-${holdingId}-${index}`,
      source: "portfolio-book.holdings",
      sourceHref: "/management/portfolio-book",
      symbol: holdingSymbol(holding),
      holdingWindow: holdingWindow(holding),
      runtimeId: displayText(holdingRuntimeId(holding), fleetRuntimeId(fleetRow)),
      capitalPoolId: displayCapitalPoolId,
      capitalPoolHref: capitalPoolHref(displayCapitalPoolId),
      strategyId: displayText(holdingStrategyId(holding), fleetStrategyId(fleetRow)),
      pnlContribution: holdingPnl(holding),
      pnlContributionPct: finiteNumber(holding.pnlPct, holding.pnl_pct),
      drawdownContributionPct: NaN,
      basis: "holding mark-to-market row",
    };
  });
}

function buildPerformanceSourceDetails(
  rows: AttributionViewRow[],
  personaFocus: string,
  fleetRow: ManagementPersonaFleetRow | undefined,
  summaryRow: AttributionViewRow | null,
  summarySource: "operations-read-model" | "persona-fleet.performanceSummary" | undefined,
  holdings: HoldingRow[] | undefined,
): PerformanceSourceDetailRow[] {
  if (!personaFocus) return [];
  if (rows.length === 0 && !fleetRow) return [];
  const details = rows.map((row) => sourceRowFromAttribution(
    row,
    personaFocus,
    fleetRow,
    row === summaryRow ? summarySource : undefined,
  ));
  const matchingHoldings = matchingHoldingsForPersona(holdings, personaFocus, fleetRow);
  const holdingDetails = sourceRowsFromHoldings(matchingHoldings, fleetRow);
  return [...details, ...holdingDetails];
}

export const PerformanceAttributionPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const personaFocus = (searchParams.get("persona_id") ?? searchParams.get("persona"))?.trim() ?? "";
  const entityFocus = searchParams.get("entity")?.trim() ?? "";
  const dimension = selectedDimensionFromQuery(searchParams.get("dimension"), personaFocus);
  const periodParam = searchParams.get("period");
  const period: AttributionPeriod = isAttributionPeriod(periodParam) ? periodParam : "30d";

  const { data } = useV5Live(
    () => mgmt.performanceAttribution.listLiveOnly(
      dimension === "all" ? undefined : dimension,
      period,
    ),
    [dimension, period],
  );
  const { data: fleetRows } = useV5Live(() => mgmt.personaFleet.get(), []);
  const { data: holdings } = useV5Live(() => mgmt.portfolioBook.holdingsLiveOnly(), []);
  const { data: operationsReadModel, loading: operationsLoading } = useV5Live(
    () => personaFocus
      ? mgmt.operationsReadModel.getLiveOnly(personaFocus, period)
      : Promise.resolve(undefined),
    [personaFocus, period],
  );
  const allRows = useMemo(() => (data ?? []).map(normalizePerformanceAttributionRow), [data]);
  const dimensionRows = useMemo(() => {
    const filtered = dimension === "all" ? allRows : allRows.filter((r) => r.dimension === dimension);
    return [...filtered].sort((a, b) => (b.pnlContribution || 0) - (a.pnlContribution || 0));
  }, [allRows, dimension]);
  const scopedDimensionRows = useMemo(
    () => entityFocus
      ? dimensionRows.filter((row) => row.key === entityFocus || row.label === entityFocus)
      : dimensionRows,
    [dimensionRows, entityFocus],
  );
  const focus = useMemo(
    () => filterPerformanceRowsForPersona(scopedDimensionRows, personaFocus),
    [personaFocus, scopedDimensionRows],
  );
  const focusedFleet = useMemo(
    () => focusedFleetRow(fleetRows, personaFocus),
    [fleetRows, personaFocus],
  );
  const operationsSummary = useMemo(
    () => focus.matched ? null : attributionRowFromReadModel(operationsReadModel, personaFocus),
    [focus.matched, operationsReadModel, personaFocus],
  );
  const fleetFallback = useMemo(
    () => focus.matched || operationsSummary ? null : fallbackAttributionRowFromFleet(focusedFleet, personaFocus),
    [focusedFleet, focus.matched, operationsSummary, personaFocus],
  );
  const summaryRow = operationsSummary ?? fleetFallback;
  const rows = useMemo(
    () => summaryRow ? [summaryRow] : focus.rows,
    [focus.rows, summaryRow],
  );
  const dataConfidence: ManagementDataConfidence = focus.matched
    ? "formal"
    : operationsSummary && operationsReadModel?.dataConfidence === "formal"
      ? "partial"
      : operationsReadModel?.dataConfidence
      ?? (fleetFallback ? "fallback" : "unavailable");
  const summarySource = operationsSummary
    ? "operations-read-model" as const
    : fleetFallback
      ? "persona-fleet.performanceSummary" as const
      : undefined;
  const focusResolved = focus.matched || Boolean(summaryRow);
  const sourceDetails = useMemo(
    () => buildPerformanceSourceDetails(rows, personaFocus, focusedFleet, summaryRow, summarySource, holdings),
    [focusedFleet, holdings, personaFocus, rows, summaryRow, summarySource],
  );
  const showAllPersonaHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dimension", "persona");
    params.set("period", period);
    return `/management/performance-attribution?${params.toString()}`;
  }, [period]);

  const updateDimension = (nextDimension: AttributionDimension | "all") => {
    const next = new URLSearchParams(searchParams);
    if (nextDimension === "all") next.delete("dimension");
    else next.set("dimension", nextDimension);
    if (nextDimension !== "persona") next.delete("persona");
    next.delete("entity");
    setSearchParams(next, { replace: true });
  };

  const updatePeriod = (nextPeriod: AttributionPeriod) => {
    const next = new URLSearchParams(searchParams);
    next.set("period", nextPeriod);
    setSearchParams(next, { replace: true });
  };

  return (
    <section className={embedded ? "space-y-6" : "p-6 space-y-6"} aria-label={t("mgmt.attribution.title")}>
      {!embedded ? <ManagementOperationsNav /> : null}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.attribution.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.attribution.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={dimension}
            onChange={(e) => updateDimension(e.target.value as AttributionDimension | "all")}
            aria-label={t("mgmt.attribution.dimension")}
          >
            <option value="all">{t("mgmt.attribution.allDimensions")}</option>
            {ATTRIBUTION_DIMENSIONS.map((d) => (
              <option key={d} value={d}>{t(`mgmt.attribution.dimensions.${d}`, { defaultValue: d })}</option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={period}
            onChange={(e) => updatePeriod(e.target.value as AttributionPeriod)}
            aria-label={t("mgmt.attribution.period")}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>{t(`mgmt.attribution.periods.${p}`, { defaultValue: p })}</option>
            ))}
          </select>
        </div>
      </header>

      {personaFocus && (
        <Card className="p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={confidenceTone(dataConfidence)}>
                  {t(`mgmt.attribution.confidence.${dataConfidence}`)}
                </Badge>
                <span className="text-foreground">
                  {operationsLoading && !focusResolved
                    ? t("mgmt.attribution.focusLoadingPersonaFmt", { persona: personaFocus })
                    : dataConfidence === "formal" && focus.matched
                      ? t("mgmt.attribution.focusedPersonaFmt", { persona: personaFocus, count: rows.length })
                      : summaryRow
                        ? t("mgmt.attribution.fallbackPersonaFmt", { persona: personaFocus })
                        : t("mgmt.attribution.focusMissingPersonaFmt", { persona: personaFocus })}
                </span>
              </div>
              {summaryRow && dataConfidence !== "formal" ? (
                <p className="text-xs text-muted-foreground">
                  {t("mgmt.attribution.fallbackWarning")}
                </p>
              ) : null}
              {operationsReadModel?.sources.length ? (
                <div className="flex flex-wrap gap-2" data-testid="attribution-source-confidence">
                  {operationsReadModel.sources.map((source) => (
                    <Badge key={source.sourceName} variant="outline" title={source.sourceError}>
                      {source.sourceName}: {source.sourceStatus}
                      {source.sourceRowCount !== undefined ? ` (${source.sourceRowCount})` : ""}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {operationsReadModel?.diagnostics.length ? (
                <ul className="space-y-1 text-xs text-muted-foreground" data-testid="attribution-diagnostics">
                  {operationsReadModel.diagnostics.map((diagnostic) => (
                    <li key={`${diagnostic.sourceName}-${diagnostic.code}`}>
                      <span className="font-medium text-foreground">{diagnostic.code}:</span> {diagnostic.message}
                    </li>
                  ))}
                </ul>
              ) : fleetFallback ? (
                <p className="text-xs text-muted-foreground" data-testid="attribution-diagnostics">
                  {t("mgmt.attribution.fleetFallbackDiagnostic")}
                </p>
              ) : null}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={showAllPersonaHref}>{t("mgmt.attribution.showAllPersona")}</Link>
            </Button>
          </div>
        </Card>
      )}

      {!personaFocus && entityFocus && (
        <Card className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-foreground">
              {rows.length > 0
                ? t("mgmt.attribution.focusedEntityFmt", { entity: entityFocus, count: rows.length })
                : t("mgmt.attribution.focusMissingEntityFmt", { entity: entityFocus })}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to={`/management/performance-attribution?dimension=${dimension}&period=${period}`}>
                {t("mgmt.attribution.showAllEntities")}
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <ManagementTableScroll minScrollWidth={1040}>
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.attribution.dimension")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.entity")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.pnlContribution")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.pnlPct")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.riskPct")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.drawdownPct")}</th>
              <th className="px-3 py-2">{t("mgmt.actions.manage")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.dimension}-${r.key}`} className="border-b border-border/50">
                <td className="px-3 py-2"><Badge variant="outline">{t(`mgmt.attribution.dimensions.${r.dimension}`, { defaultValue: r.dimension })}</Badge></td>
                <td className="px-3 py-2 font-mono">{r.label}</td>
                <td className={`px-3 py-2 font-mono ${r.pnlContribution < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(r.pnlContribution)}</td>
                <td className={`px-3 py-2 font-mono ${r.pnlContributionPct < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtPct(r.pnlContributionPct)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(r.riskContributionPct)}</td>
                <td className="px-3 py-2 font-mono text-status-failed">{fmtPct(r.drawdownContributionPct)}</td>
                <td className="px-3 py-2">
                  <Link to={r.links.manageHref} className="text-primary hover:underline text-xs">{t("mgmt.actions.manage")} →</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-4 text-center text-muted-foreground" colSpan={7}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
        </ManagementTableScroll>
      </Card>

      {personaFocus && sourceDetails.length > 0 && (
        <Card>
          <header className="px-4 py-2 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">{t("mgmt.attribution.sourceDetailTitle")}</h2>
          </header>
          <ManagementTableScroll minScrollWidth={1500}>
            <table className="w-full min-w-[1500px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-2">{t("mgmt.attribution.source")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.symbol")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.holdingWindow")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.runtime")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.capitalPool")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.strategy")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.pnlContribution")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.pnlPct")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.drawdownPct")}</th>
                  <th className="px-3 py-2">{t("mgmt.attribution.basis")}</th>
                </tr>
              </thead>
              <tbody>
                {sourceDetails.map((detail) => (
                  <tr key={detail.id} className="border-b border-border/50">
                    <td className="px-3 py-2 font-mono">
                      {detail.sourceHref ? (
                        <Link to={detail.sourceHref} className="text-primary hover:underline">{detail.source}</Link>
                      ) : detail.source}
                    </td>
                    <td className="px-3 py-2 font-mono">{detail.symbol}</td>
                    <td className="px-3 py-2 font-mono">{detail.holdingWindow}</td>
                    <td className="px-3 py-2 font-mono">{detail.runtimeId}</td>
                    <td className="px-3 py-2 font-mono">
                      {detail.capitalPoolHref ? (
                        <Link to={detail.capitalPoolHref} className="text-primary underline underline-offset-4 hover:text-primary/80">
                          {detail.capitalPoolId}
                        </Link>
                      ) : detail.capitalPoolId}
                    </td>
                    <td className="px-3 py-2 font-mono">{detail.strategyId}</td>
                    <td className={`px-3 py-2 font-mono ${detail.pnlContribution < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(detail.pnlContribution)}</td>
                    <td className={`px-3 py-2 font-mono ${detail.pnlContributionPct < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtPct(detail.pnlContributionPct)}</td>
                    <td className="px-3 py-2 font-mono text-status-failed">{fmtPct(detail.drawdownContributionPct)}</td>
                    <td className="px-3 py-2 font-mono">{detail.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ManagementTableScroll>
        </Card>
      )}
    </section>
  );
};
