// 2026-05-22 PM12-003 — Portfolio Book page.
// 2026-07-11 MGMT-OPS-003-GAP-001 — row-level incidents, six operator filters
// with URL round-trip, explicit capital scope, and BFF-derived source
// confidence. Never renders degraded or missing-binding coverage as formal
// attribution or "covered".
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { ManagementOperationsNav } from "@/management/components/operations/ManagementOperationsNav";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { PortfolioHoldingFilters, PortfolioHoldingsMonitor } from "@/lib/v5/management/portfolio";

const EMPTY_MONITOR: PortfolioHoldingsMonitor = {
  items: [],
  incidents: [],
  surfaceStatus: "unavailable",
  coverage: {
    holdingCount: 0, sourceRowCount: 0, runtimeCount: 0, telemetryRuntimeCount: 0,
    staleRowCount: 0, missingBindingCount: 0, degradedSourceCount: 0, incidentCount: 0,
  },
};

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

const fmtUsd = (n?: number) =>
  n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtNum = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

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

export const PortfolioBookPage = () => {
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

  const { data, loading, refresh } = useV5Live(
    () => mgmt.portfolioBook.monitorLiveOnly(filters),
    [filterKey],
  );
  const monitor = data ?? EMPTY_MONITOR;

  const setFilter = (queryKey: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(queryKey, value);
    else next.delete(queryKey);
    setParams(next, { replace: true });
  };
  const activeFilterCount = FILTERS.filter(([queryKey]) => params.get(queryKey)).length;
  const incidentsByHolding = new Map(monitor.incidents.map((incident) => [incident.holdingId, incident]));

  return (
    <section className="p-6 space-y-6" aria-label={t("mgmt.portfolio.title")}>
      <ManagementOperationsNav />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.portfolio.title")}</h1>
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

      {/* Coverage: BFF-derived confidence, never an aggregate "covered"/"formal" claim. */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={tone(monitor.surfaceStatus)}>
            Source: {monitor.surfaceStatus}
          </Badge>
          {monitor.surfaceMessage ? (
            <span className="text-sm text-muted-foreground">{monitor.surfaceMessage}</span>
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
        <ManagementTableScroll minScrollWidth={1280}>
          <table className="w-full min-w-[1280px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                {["Holding", "Stage / capital scope", "Runtime / broker", "Market value", "Unrealized PnL", "Source confidence", "Risk", "Actions"].map((heading) => (
                  <th key={heading} className="px-3 py-2">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monitor.items.map((row) => {
                const incident = incidentsByHolding.get(row.holdingId);
                const humanReviewHref = incident?.links.human_review ?? row.links.human_review;
                return (
                  <tr key={row.holdingId} className="border-b border-border/50 align-top" data-testid="portfolio-holding">
                    <td className="px-3 py-3">
                      <div className="font-mono text-foreground">{row.symbol}</div>
                      <div className="text-xs text-muted-foreground">{row.holdingId}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">{row.deploymentStage || "unknown"}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {scopeLabel(row.capitalScope.scopeKind, row.capitalScope.scopeId)}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <div>{row.runtimeId || "Unknown runtime"}</div>
                      <div>{row.brokerId || "Unknown broker"}</div>
                    </td>
                    <td className="px-3 py-3 font-mono">{fmtUsd(row.marketValue)}</td>
                    <td className={`px-3 py-3 font-mono ${(row.unrealizedPnl ?? 0) < 0 ? "text-status-failed" : "text-status-success"}`}>
                      {fmtUsd(row.unrealizedPnl)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={tone(row.sourceStatus)}>{row.sourceStatus}</Badge>
                      {row.telemetryStale ? (
                        <div className="mt-1 text-xs text-status-warning">Stale telemetry</div>
                      ) : null}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.sourceIssues.map((issue) => issue.code).join(", ") || "No reported source issue"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={tone(row.riskState)}>{row.riskState}</Badge>
                    </td>
                    <td className="px-3 py-3">
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
              {!loading && monitor.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={8}>
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
    </section>
  );
};
