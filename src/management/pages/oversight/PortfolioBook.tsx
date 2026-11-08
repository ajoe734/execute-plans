// 2026-05-22 PM12-003 — Portfolio Book page.
// 2026-07-11 MGMT-OPS-003-GAP-001 — row-level incidents, six operator filters
// with URL round-trip, explicit capital scope, and BFF-derived source
// confidence. Never renders degraded or missing-binding coverage as formal
// attribution or "covered".
import { useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { PortfolioHoldingFilters, PortfolioHoldingsMonitor } from "@/lib/v5/management/portfolio";

// Six required operator filters (MGMT-OPS-003 GAP-001): stage, broker,
// runtime, source status, stale telemetry, and risk state. Query key is what
// round-trips through the URL and is sent to the BFF unmodified.
const FILTERS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ["deployment_stage", "Stage", ["paper", "canary", "live", "unknown"]],
  ["broker_id", "Broker", []],
  ["runtime_id", "Runtime", []],
  ["source_status", "Source status", ["ok", "partial", "degraded", "stale", "unavailable"]],
  ["stale_telemetry", "Stale telemetry", ["true", "false"]],
  ["risk_state", "Risk state", [
    "paper_exposure", "canary_exposure", "live_exposure", "missing_binding", "stale_telemetry", "degraded_source", "unknown",
  ]],
] as const;

const FILTER_TO_MODEL: Record<string, keyof PortfolioHoldingFilters> = {
  deployment_stage: "deploymentStage",
  broker_id: "brokerId",
  runtime_id: "runtimeId",
  source_status: "sourceStatus",
  stale_telemetry: "staleTelemetry",
  risk_state: "riskState",
};

const MISSING_CURRENCY_LABEL = "幣別未提供";
const fractionDigits = (amount: number) => (Number.isInteger(amount) ? 0 : 2);
const fmtNum = (n?: number | null) => {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const amount = Object.is(n, -0) ? 0 : n;
  const digits = fractionDigits(amount);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
};
const fmtHoldingPrice = (n?: number | null, currency?: string | null) => {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const amount = Object.is(n, -0) ? 0 : n;
  const digits = fractionDigits(amount);
  const code = currency?.trim().toUpperCase();
  if (!code) return fmtNum(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${code} ${fmtNum(amount)}`;
  }
};
const fmtHoldingMoney = (n?: number | null, currency?: string | null) => {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const amount = Object.is(n, -0) ? 0 : n;
  const code = currency?.trim().toUpperCase();
  if (!code) return `${fmtNum(amount)} (${MISSING_CURRENCY_LABEL})`;
  return fmtHoldingPrice(amount, code);
};
const fmtCostPnlPct = (
  unrealizedPnl?: number | null,
  quantity?: number | null,
  averagePrice?: number | null,
  multiplier?: number | null,
): string | null => {
  if (
    typeof unrealizedPnl !== "number" || !Number.isFinite(unrealizedPnl) ||
    typeof quantity !== "number" || !Number.isFinite(quantity) ||
    typeof averagePrice !== "number" || !Number.isFinite(averagePrice)
  ) {
    return null;
  }
  const effectiveMultiplier =
    typeof multiplier === "number" && Number.isFinite(multiplier) && multiplier > 0
      ? multiplier
      : 1;
  const costBasis = Math.abs(quantity) * effectiveMultiplier * averagePrice;
  if (!(costBasis > 0) || !Number.isFinite(costBasis)) return null;
  const rawPct = (unrealizedPnl / costBasis) * 100;
  if (!Number.isFinite(rawPct)) return null;
  const rounded = Math.round(rawPct * 100) / 100;
  if (Object.is(rounded, -0) || rounded === 0) return "0.00%";
  const absText = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(rounded));
  return `${rounded > 0 ? "+" : "-"}${absText}%`;
};
const fmtMarkDate = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const isoPrefix = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoPrefix) return isoPrefix[0];
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return trimmed;
};

const CONFIDENCE_TONE: Record<string, string> = {
  ok: "bg-status-success/15 text-status-success border-status-success/30",
  healthy: "bg-status-success/15 text-status-success border-status-success/30",
  paper_exposure: "bg-status-success/15 text-status-success border-status-success/30",
  canary_exposure: "bg-status-warning/15 text-status-warning border-status-warning/30",
  live_exposure: "bg-status-warning/15 text-status-warning border-status-warning/30",
  partial: "bg-status-warning/15 text-status-warning border-status-warning/30",
  stale: "bg-status-warning/15 text-status-warning border-status-warning/30",
  stale_telemetry: "bg-status-warning/15 text-status-warning border-status-warning/30",
  degraded: "bg-status-failed/15 text-status-failed border-status-failed/30",
  degraded_source: "bg-status-failed/15 text-status-failed border-status-failed/30",
  unavailable: "bg-status-failed/15 text-status-failed border-status-failed/30",
  missing_binding: "bg-status-failed/15 text-status-failed border-status-failed/30",
  high: "bg-status-failed/15 text-status-failed border-status-failed/30",
  medium: "bg-status-warning/15 text-status-warning border-status-warning/30",
};
const tone = (value: string) => CONFIDENCE_TONE[value] ?? "bg-muted text-muted-foreground border-border";

// Distinct capital-scope labels — text-based, not color-only, so paper,
// canary, live, and unknown scope can never be confused.
const CAPITAL_SCOPE_LABEL: Record<string, string> = {
  paper_ledger: "Paper ledger",
  canary_sleeve: "Canary sleeve",
  live_capital_pool: "Live capital pool",
  unclassified: "Unknown capital scope",
};
const scopeLabel = (kind: string, id?: string) =>
  `${CAPITAL_SCOPE_LABEL[kind] ?? CAPITAL_SCOPE_LABEL.unclassified}${id ? ` · ${id}` : ""}`;

export const PortfolioBookPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const filters = useMemo<PortfolioHoldingFilters>(() => {
    const model: PortfolioHoldingFilters = Object.fromEntries(
      FILTERS.map(([queryKey]) => [FILTER_TO_MODEL[queryKey], params.get(queryKey) || undefined]),
    ) as PortfolioHoldingFilters;
    model.capitalPoolId = (params.get("capital_pool_id") ?? params.get("pool"))?.trim() || undefined;
    model.personaId = params.get("persona_id")?.trim() || undefined;
    return model;
  }, [params]);
  const filterKey = params.toString();

  const {
    data,
    loading,
    refreshing = false,
    error = null,
    refresh,
  } = useV5Live(
    (signal) => mgmt.portfolioBook.monitorLiveOnly(filters, { signal }),
    [filterKey],
    { cacheKey: `oversight.portfolioBook.monitor.${filterKey}` },
  );
  const lastLoadedRef = useRef<PortfolioHoldingsMonitor | undefined>(undefined);
  if (data !== undefined) {
    lastLoadedRef.current = data;
  }
  const monitor = data ?? ((loading || refreshing) ? lastLoadedRef.current : undefined);
  const isInitialLoading = loading && monitor === undefined;
  const isRefreshing = monitor !== undefined && (loading || refreshing);
  const hasLoadError = monitor === undefined && !isInitialLoading;
  const hasRefreshError = monitor !== undefined && Boolean(error) && !isRefreshing;

  const setFilter = (queryKey: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(queryKey, value);
    else next.delete(queryKey);
    setParams(next, { replace: true });
  };
  const activeFilterCount = FILTERS.filter(([queryKey]) => params.get(queryKey)).length;
  const incidentsByHolding = new Map((monitor?.incidents ?? []).map((incident) => [incident.holdingId, incident]));

  return (
    <section className={embedded ? "space-y-6" : "p-6 space-y-6"} aria-label={t("mgmt.portfolio.title")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.portfolio.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.portfolio.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isInitialLoading || isRefreshing}>
          {isRefreshing
            ? t("mgmt.portfolio.refreshing", { defaultValue: "Refreshing…" })
            : isInitialLoading
              ? t("mgmt.portfolio.loading", { defaultValue: "Loading…" })
              : t("mgmt.portfolio.refresh", { defaultValue: "Refresh" })}
        </Button>
      </header>

      {isInitialLoading ? (
        <Card className="p-4" role="status" aria-live="polite" data-testid="portfolio-book-loading">
          <h2 className="text-sm font-semibold text-foreground">
            {t("mgmt.portfolio.loadingTitle", { defaultValue: "Loading portfolio holdings…" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("mgmt.portfolio.loadingBody", { defaultValue: "Waiting for live BFF holdings and source coverage data." })}
          </p>
        </Card>
      ) : null}

      {hasLoadError || hasRefreshError ? (
        <Card className="p-4 border-status-failed/40 space-y-3" role="alert" data-testid="portfolio-book-error">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t("mgmt.liveOnly.unavailableTitle", { defaultValue: "Live data unavailable" })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error && error.message
                ? `${error.message} — ${t("mgmt.liveOnly.unavailableBody", { defaultValue: "This page does not render seed, demo, or non-production fallback data." })}`
                : t("mgmt.portfolio.loadErrorBody", {
                    defaultValue: "Failed to load live portfolio holdings. This page does not render seed, demo, or non-production fallback data.",
                  })}
            </p>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              {t("mgmt.portfolio.retry", { defaultValue: "Retry" })}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Coverage: BFF-derived confidence, never an aggregate "covered"/"formal" claim. */}
      {monitor ? (
        <Card className="p-4 space-y-3" data-testid="portfolio-book-coverage">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={tone(monitor.surfaceStatus)}>
              Source: {monitor.surfaceStatus}
            </Badge>
            {monitor.surfaceMessage ? (
              <span className="text-sm text-muted-foreground">{monitor.surfaceMessage}</span>
            ) : null}
            {isRefreshing ? (
              <span className="text-xs text-muted-foreground" role="status" aria-live="polite" data-testid="portfolio-book-refreshing">
                {t("mgmt.portfolio.refreshingNotice", { defaultValue: "Refreshing live holdings; showing last loaded values." })}
              </span>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Holdings", monitor.coverage.holdingCount],
              ["Source rows", monitor.coverage.sourceRowCount],
              ["Telemetry runtimes", `${monitor.coverage.telemetryRuntimeCount}/${monitor.coverage.runtimeCount}`],
              ["Incidents", monitor.coverage.incidentCount],
              ["Missing bindings", monitor.coverage.missingBindingCount],
              ["Degraded sources", monitor.coverage.degradedSourceCount],
              ["Stale rows", monitor.coverage.staleRowCount],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded border border-border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-mono text-foreground">{value}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Six required operator filters, URL-persisted and sent to the BFF. */}
      <Card className="p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FILTERS.map(([queryKey, label, options]) => (
            <label key={queryKey} className="space-y-1 text-xs text-muted-foreground">
              {label}
              <select
                aria-label={label}
                className="block h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={params.get(queryKey) ?? ""}
                onChange={(event) => setFilter(queryKey, event.target.value)}
              >
                <option value="">All</option>
                {options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                {options.length === 0 && params.get(queryKey) ? (
                  <option value={params.get(queryKey) as string}>{params.get(queryKey)}</option>
                ) : null}
              </select>
            </label>
          ))}
        </div>
        {activeFilterCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(params);
              FILTERS.forEach(([queryKey]) => next.delete(queryKey));
              setParams(next, { replace: true });
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </Card>

      {monitor ? (
        <>
          {/* Row-level incidents: every degraded or missing-binding holding stays visible. */}
          {monitor.incidents.length > 0 ? (
            <Card className="border-status-failed/40">
              <header className="border-b border-border p-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Source incidents ({monitor.incidents.length})
                </h2>
              </header>
              <div className="divide-y divide-border">
                {monitor.incidents.map((incident) => (
                  <article key={incident.id} className="space-y-2 p-4" data-testid="portfolio-incident">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={tone(incident.severity)}>{incident.severity} severity</Badge>
                      <Badge variant="outline" className={tone(incident.riskState)}>{incident.riskState}</Badge>
                      <Badge variant="outline" className={tone(incident.sourceStatus)}>Source: {incident.sourceStatus}</Badge>
                    </div>
                    <p className="text-sm text-foreground">{incident.message}</p>
                    <div className="text-xs text-muted-foreground">
                      {incident.sourceIssues.map((issue) => `${issue.code}: ${issue.message}`).join(" · ")}
                    </div>
                    {incident.links.human_review ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={incident.links.human_review}>Human Review</Link>
                      </Button>
                    ) : null}
                  </article>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Holdings: capital scope, source confidence, risk state, context-preserving links. */}
          <Card>
            <header className="px-4 py-2 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">{t("mgmt.portfolio.holdingsTitle")}</h2>
            </header>
            <ManagementTableScroll minScrollWidth={1520}>
              <table className="w-full min-w-[1520px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    {[
                      "Holding",
                      t("mgmt.portfolio.quantity", { defaultValue: "Quantity" }),
                      t("mgmt.portfolio.avgEntry", { defaultValue: "Avg entry" }),
                      t("mgmt.portfolio.lastClose", { defaultValue: "Last close" }),
                      t("mgmt.portfolio.marketValue", { defaultValue: "Market value" }),
                      t("mgmt.portfolio.unrealizedPnl", { defaultValue: "Unrealized PnL" }),
                      t("mgmt.portfolio.instrumentKind", { defaultValue: "Instrument kind" }),
                      t("mgmt.portfolio.contractMonth", { defaultValue: "Contract month" }),
                      t("mgmt.portfolio.multiplier", { defaultValue: "Multiplier" }),
                      t("mgmt.portfolio.marginReserved", { defaultValue: "Margin reserved" }),
                      t("mgmt.portfolio.reasonCode", { defaultValue: "Reason code" }),
                      "Stage / capital scope",
                      "Runtime / broker",
                      "Source confidence",
                      "Risk",
                      "Actions",
                    ].map((heading) => (
                      <th key={heading} className="px-3 py-2 whitespace-nowrap">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monitor.items.map((row) => {
                    const incident = incidentsByHolding.get(row.holdingId);
                    const humanReviewHref = incident?.links.human_review ?? row.links.human_review;
                    const hasQuantity = typeof row.quantity === "number" && Number.isFinite(row.quantity);
                    const isShortPosition = hasQuantity && (row.quantity as number) < 0;
                    const hasAveragePrice = typeof row.averagePrice === "number" && Number.isFinite(row.averagePrice);
                    const hasMarkPrice = typeof row.markPrice === "number" && Number.isFinite(row.markPrice);
                    const hasCurrentMarkPrice =
                      hasMarkPrice && row.markStatus !== "stale" && row.markStatus !== "unavailable";
                    const hasUnrealizedPnl = typeof row.unrealizedPnl === "number" && Number.isFinite(row.unrealizedPnl);
                    const hasRealizedPnl =
                      typeof row.realizedPnl === "number" &&
                      Number.isFinite(row.realizedPnl) &&
                      row.realizedPnl !== 0;
                    const unrealizedPnlPct = fmtCostPnlPct(
                      row.unrealizedPnl,
                      row.quantity,
                      row.averagePrice,
                      row.multiplier,
                    );
                    const lastMarkDate = fmtMarkDate(row.lastMarkAt);
                    const isStaleRow = row.markStatus === "stale" || row.telemetryStale;
                    const effectiveSourceStatus = isStaleRow && row.sourceStatus === "ok" ? "stale" : row.sourceStatus;
                    const noAverageCostLabel = t("mgmt.portfolio.noAverageCost", { defaultValue: "Source reports no average cost" });
                    const rawInstrumentKind = row.instrumentKind?.trim();
                    const rawInstrumentId = row.instrumentId?.trim();
                    const instrumentKindLabel =
                      rawInstrumentKind === "cash_share"
                        ? t("mgmt.portfolio.instrumentKindCashShare", { defaultValue: "Cash share" })
                        : rawInstrumentKind === "stock_future"
                          ? t("mgmt.portfolio.instrumentKindStockFuture", { defaultValue: "Stock future" })
                          : rawInstrumentKind || null;
                    const instrumentMetaText = [rawInstrumentKind, rawInstrumentId]
                      .filter((part): part is string => Boolean(part))
                      .join(" · ");
                    const hasMultiplier = typeof row.multiplier === "number" && Number.isFinite(row.multiplier);
                    const hasMarginReserved =
                      typeof row.marginReserved === "number" && Number.isFinite(row.marginReserved);
                    return (
                      <tr key={row.holdingId} className="border-b border-border/50 align-top" data-testid="portfolio-holding">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="font-mono text-foreground">{row.symbol}</div>
                          <div className="text-xs text-muted-foreground">{row.holdingId}</div>
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          <div>{fmtNum(row.quantity)}</div>
                          {isShortPosition ? (
                            <div className="mt-0.5 font-sans text-xs text-muted-foreground">
                              {t("mgmt.portfolio.shortPosition", { defaultValue: "Short position" })}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          {hasAveragePrice ? (
                            fmtHoldingPrice(row.averagePrice, row.currency)
                          ) : (
                            <span aria-label={noAverageCostLabel} title={noAverageCostLabel}>
                              <span aria-hidden="true">—</span>
                              <span className="sr-only"> {noAverageCostLabel}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          {hasCurrentMarkPrice ? (
                            <>
                              <div>{fmtHoldingPrice(row.markPrice, row.currency)}</div>
                              {lastMarkDate ? (
                                <div className="mt-0.5 font-sans text-xs text-muted-foreground">
                                  {t("mgmt.portfolio.markAsOfFmt", {
                                    date: lastMarkDate,
                                    defaultValue: `As of ${lastMarkDate}`,
                                  })}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          {row.markStatus === "stale" ? (
                            <span className="font-sans text-xs text-status-warning">
                              {lastMarkDate
                                ? t("mgmt.portfolio.markStaleWithDateFmt", {
                                    date: lastMarkDate,
                                    defaultValue: `Price stale (last mark ${lastMarkDate})`,
                                  })
                                : t("mgmt.portfolio.markStale", { defaultValue: "Price stale" })}
                            </span>
                          ) : row.markStatus === "unavailable" ? (
                            <span className="font-sans text-xs text-muted-foreground">
                              {t("mgmt.portfolio.markUnavailable", { defaultValue: "No price available" })}
                            </span>
                          ) : (
                            fmtHoldingMoney(row.marketValue, row.currency)
                          )}
                        </td>
                        <td
                          className={`px-3 py-3 font-mono whitespace-nowrap ${
                            hasUnrealizedPnl
                              ? (row.unrealizedPnl as number) < 0
                                ? "text-status-failed"
                                : "text-status-success"
                              : "text-muted-foreground"
                          }`}
                        >
                          {hasUnrealizedPnl ? (
                            <div>
                              {fmtHoldingMoney(row.unrealizedPnl, row.currency)}
                              {unrealizedPnlPct ? ` (${unrealizedPnlPct})` : ""}
                            </div>
                          ) : (
                            <span aria-label={noAverageCostLabel} title={noAverageCostLabel}>
                              <span aria-hidden="true">—</span>
                              <span className="sr-only"> {noAverageCostLabel}</span>
                            </span>
                          )}
                          {hasRealizedPnl ? (
                            <div className="mt-0.5 font-sans text-xs text-muted-foreground">
                              {t("mgmt.portfolio.realizedPnlFmt", {
                                amount: fmtHoldingMoney(row.realizedPnl, row.currency),
                                defaultValue: `Realized ${fmtHoldingMoney(row.realizedPnl, row.currency)}`,
                              })}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {instrumentKindLabel ? (
                            <>
                              <div>{instrumentKindLabel}</div>
                              {instrumentMetaText && instrumentMetaText !== instrumentKindLabel ? (
                                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                                  {instrumentMetaText}
                                </div>
                              ) : null}
                            </>
                          ) : rawInstrumentId ? (
                            <span className="font-mono">{rawInstrumentId}</span>
                          ) : (
                            <span className="font-mono">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          {row.contractMonth?.trim() ? row.contractMonth.trim() : "—"}
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          {hasMultiplier ? fmtNum(row.multiplier) : "—"}
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          {hasMarginReserved ? fmtHoldingMoney(row.marginReserved, row.currency) : "—"}
                        </td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          {row.reasonCode?.trim() ? row.reasonCode.trim() : "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Badge variant="outline">{row.deploymentStage || "unknown"}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {scopeLabel(row.capitalScope.scopeKind, row.capitalScope.scopeId)}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                          <div>{row.runtimeId || "Unknown runtime"}</div>
                          <div>{row.brokerId || "Unknown broker"}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={tone(effectiveSourceStatus)}>{effectiveSourceStatus}</Badge>
                          {isStaleRow ? (
                            <div className="mt-1 text-xs text-status-warning">
                              {t("mgmt.portfolio.staleTelemetry", { defaultValue: "Stale telemetry" })}
                            </div>
                          ) : null}
                          {row.sourceIssues.length > 0 ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.sourceIssues.map((issue) => issue.code).join(", ")}
                            </div>
                          ) : !isStaleRow ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t("mgmt.portfolio.noReportedSourceIssue", { defaultValue: "No reported source issue" })}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={tone(row.riskState)}>{row.riskState}</Badge>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            {row.links.persona_fleet ? (
                              <Link className="text-primary hover:underline" to={row.links.persona_fleet}>Persona Fleet</Link>
                            ) : null}
                            {row.links.performance_attribution ? (
                              <Link className="text-primary hover:underline" to={row.links.performance_attribution}>Attribution</Link>
                            ) : null}
                            {humanReviewHref ? (
                              <Link className="text-primary hover:underline" to={humanReviewHref}>Human Review</Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {monitor.items.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-muted-foreground" colSpan={16}>
                        {monitor.surfaceStatus === "unavailable"
                          ? "Portfolio holdings source is unavailable."
                          : "No holdings match the current filters."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </ManagementTableScroll>
          </Card>
        </>
      ) : null}
    </section>
  );
};
