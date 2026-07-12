// MGMT-PERF-IA-003 — Exposure & Holdings tab of the canonical Performance
// Center. Consolidates the capital-pool risk-budget rollup
// (mgmt.portfolioBook.exposureLiveOnly, previously unconsumed by any page)
// with a pool-scoped holdings drill-down reusing the same holdings monitor
// Overview relies on. Never renders degraded/fallback exposure data as a
// formal "covered" claim; missing telemetry stays a diagnostic, not a
// dropped row or `nan` metric.
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { ManagementOperationsNav } from "@/management/components/operations/ManagementOperationsNav";
import { mgmt, type ManagementDataConfidence } from "@/lib/bff-v1/management";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import type { PortfolioHoldingFilters, PortfolioHoldingsMonitor } from "@/lib/v5/management/portfolio";

const EMPTY_HOLDINGS: PortfolioHoldingsMonitor = {
  items: [],
  incidents: [],
  surfaceStatus: "unavailable",
  coverage: {
    holdingCount: 0, sourceRowCount: 0, runtimeCount: 0, telemetryRuntimeCount: 0,
    staleRowCount: 0, missingBindingCount: 0, degradedSourceCount: 0, incidentCount: 0,
  },
};

const fmtUsd = (n?: number) =>
  n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtNum = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
const fmtPct = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)}%`;

const confidenceTone = (confidence: ManagementDataConfidence): string =>
  confidence === "formal"
    ? "border-status-success/40 bg-status-success/10 text-status-success"
    : confidence === "partial" || confidence === "fallback"
      ? "border-status-warning/40 bg-status-warning/10 text-status-warning"
      : "border-status-failed/40 bg-status-failed/10 text-status-failed";

const RISK_STATE_TONE: Record<string, string> = {
  within_budget: "bg-status-success/15 text-status-success border-status-success/30",
  near_limit: "bg-status-warning/15 text-status-warning border-status-warning/30",
  over_budget: "bg-status-failed/15 text-status-failed border-status-failed/30",
  unknown: "bg-muted text-muted-foreground border-border",
};
const riskTone = (state: string) => RISK_STATE_TONE[state] ?? RISK_STATE_TONE.unknown;

export const PortfolioExposurePage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const focusedPool = (params.get("capital_pool_id") ?? params.get("pool"))?.trim() || undefined;
  const personaId = params.get("persona_id")?.trim() || undefined;
  const runtimeId = params.get("runtime_id")?.trim() || undefined;
  const period = params.get("period")?.trim() || undefined;
  const filterKey = [focusedPool, personaId, runtimeId, period].join("|");

  const { data, loading, refresh } = useV5Live(
    () => mgmt.portfolioBook.exposureLiveOnly({
      capitalPoolId: focusedPool, personaId, runtimeId, period,
    }),
    [filterKey],
  );

  const holdingFilters = useMemo<PortfolioHoldingFilters>(
    () => ({ capitalPoolId: focusedPool, personaId, runtimeId }),
    [focusedPool, personaId, runtimeId],
  );
  const { data: holdingsData, loading: holdingsLoading } = useV5Live(
    () => focusedPool ? mgmt.portfolioBook.monitorLiveOnly(holdingFilters) : Promise.resolve(undefined),
    [focusedPool, filterKey],
  );
  const holdingsMonitor = holdingsData ?? EMPTY_HOLDINGS;

  const clearPoolFocus = () => {
    const next = new URLSearchParams(params);
    next.delete("capital_pool_id");
    next.delete("pool");
    setParams(next, { replace: true });
  };

  const items = data?.items ?? [];

  return (
    <section className={embedded ? "space-y-6" : "p-6 space-y-6"} aria-label={t("performanceCenter.tabs.exposure")}>
      {!embedded ? <ManagementOperationsNav /> : null}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("performanceCenter.tabs.exposure")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.portfolio.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </header>

      {data === undefined && !loading ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t("mgmt.liveOnly.unavailableTitle", { defaultValue: "Live data unavailable" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("mgmt.liveOnly.unavailableBody", { defaultValue: "This page does not render seed, demo, or non-production fallback data." })}
          </p>
        </Card>
      ) : null}

      {data ? (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={confidenceTone(data.dataConfidence)}>
              {t(`mgmt.portfolio.confidence.${data.dataConfidence}`)}
            </Badge>
            {focusedPool ? (
              <>
                <span className="text-sm text-muted-foreground" data-testid="exposure-focused-pool">
                  {t("mgmt.portfolio.focusedPoolFmt", { pool: focusedPool })}
                </span>
                <Button variant="ghost" size="sm" onClick={clearPoolFocus}>
                  {t("mgmt.portfolio.showAllPools")}
                </Button>
              </>
            ) : null}
            {data.sourceIssues.length > 0 ? (
              <span className="text-sm text-status-warning">{data.sourceIssues.join(" · ")}</span>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t("mgmt.portfolio.riskBudgetTotal"), fmtUsd(data.summary.riskBudgetTotal)],
              [t("mgmt.portfolio.currentExposureTotal"), fmtUsd(data.summary.currentExposureTotal)],
              [t("mgmt.portfolio.availableBudgetTotal"), fmtUsd(data.summary.availableBudgetTotal)],
              [t("mgmt.portfolio.riskBudgetUtilization"), fmtPct(data.summary.riskBudgetUtilization)],
              [t("mgmt.portfolio.overBudgetCount"), fmtNum(data.summary.overBudgetCount)],
              [t("mgmt.portfolio.nearLimitCount"), fmtNum(data.summary.nearLimitCount)],
              [t("mgmt.portfolio.unknownExposureCount"), fmtNum(data.summary.unknownExposureCount)],
              [t("mgmt.portfolio.telemetryRuntimeCount"), fmtNum(data.summary.telemetryRuntimeCount)],
              [t("mgmt.portfolio.totalPnl"), fmtUsd(data.summary.totalPnl)],
              [t("mgmt.portfolio.latestTelemetryAt"), data.summary.latestTelemetryAt ?? "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded border border-border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-mono text-foreground">{value}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <header className="px-4 py-2 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.portfolio.poolsTitle")}</h2>
        </header>
        <ManagementTableScroll minScrollWidth={1200}>
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                {["Pool", "Status", "Risk budget", "Current exposure", "Available budget", "Utilization", "Risk state", "PnL", "Runtimes", "Telemetry", "Actions"].map((heading) => (
                  <th key={heading} className="px-3 py-2">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/50 align-top" data-testid="exposure-pool-row">
                  <td className="px-3 py-3">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.capitalPoolId}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline">{item.status}</Badge>
                  </td>
                  <td className="px-3 py-3 font-mono">{fmtUsd(item.riskBudget)}</td>
                  <td className="px-3 py-3 font-mono">{fmtUsd(item.currentExposure)}</td>
                  <td className="px-3 py-3 font-mono">{fmtUsd(item.availableBudget)}</td>
                  <td className="px-3 py-3 font-mono">{fmtPct(item.riskBudgetUtilization)}</td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className={riskTone(item.riskState)}>{item.riskState}</Badge>
                  </td>
                  <td className={`px-3 py-3 font-mono ${(item.pnl ?? 0) < 0 ? "text-status-failed" : "text-status-success"}`}>
                    {fmtUsd(item.pnl)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {item.activeRuntimeCount}/{item.runtimeCount}
                    <div className="text-muted-foreground">
                      {item.paperRuntimeCount} paper · {item.liveRuntimeCount} live
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {item.telemetryAvailable ? (
                      <Badge variant="outline" className="bg-status-success/15 text-status-success border-status-success/30">ok</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/30">no telemetry</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {item.capitalPoolId !== focusedPool ? (
                        <button
                          type="button"
                          className="text-primary hover:underline text-left"
                          onClick={() => {
                            const next = new URLSearchParams(params);
                            next.set("capital_pool_id", item.capitalPoolId);
                            next.delete("pool");
                            setParams(next, { replace: true });
                          }}
                        >
                          Focus pool
                        </button>
                      ) : null}
                      <Link
                        className="text-primary hover:underline"
                        to={canonicalCenterUrl("performance", "overview", { capital_pool_id: item.capitalPoolId })}
                      >
                        View holdings
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={11}>
                    {data === undefined
                      ? "Exposure source is unavailable."
                      : "No capital pools match the current filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ManagementTableScroll>
      </Card>

      {focusedPool ? (
        <Card>
          <header className="px-4 py-2 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">{t("mgmt.portfolio.holdingsTitle")}</h2>
          </header>
          <ManagementTableScroll minScrollWidth={900}>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  {["Holding", "Market value", "Unrealized PnL", "Source confidence", "Risk"].map((heading) => (
                    <th key={heading} className="px-3 py-2">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdingsMonitor.items.map((row) => (
                  <tr key={row.holdingId} className="border-b border-border/50" data-testid="exposure-holding-row">
                    <td className="px-3 py-3 font-mono text-foreground">{row.symbol}</td>
                    <td className="px-3 py-3 font-mono">{fmtUsd(row.marketValue)}</td>
                    <td className={`px-3 py-3 font-mono ${(row.unrealizedPnl ?? 0) < 0 ? "text-status-failed" : "text-status-success"}`}>
                      {fmtUsd(row.unrealizedPnl)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">{row.sourceStatus}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">{row.riskState}</Badge>
                    </td>
                  </tr>
                ))}
                {!holdingsLoading && holdingsMonitor.items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                      No holdings match the focused pool.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ManagementTableScroll>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Select a pool to view its holdings.</p>
      )}
    </section>
  );
};
