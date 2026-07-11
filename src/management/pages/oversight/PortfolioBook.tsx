import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { PortfolioHoldingFilters, PortfolioHoldingsMonitor } from "@/lib/v5/management/portfolio";

const EMPTY_MONITOR: PortfolioHoldingsMonitor = {
  items: [], incidents: [], surfaceStatus: "unavailable",
  coverage: { holdingCount: 0, sourceRowCount: 0, runtimeCount: 0, telemetryRuntimeCount: 0, staleRowCount: 0, missingBindingCount: 0, degradedSourceCount: 0, incidentCount: 0 },
};
const FILTERS = [
  ["deployment_stage", "Stage", ["paper", "canary", "live", "unknown"]],
  ["broker_id", "Broker", []],
  ["runtime_id", "Runtime", []],
  ["source_status", "Source status", ["ok", "partial", "degraded", "stale", "unavailable"]],
  ["stale_telemetry", "Stale telemetry", ["true", "false"]],
  ["risk_state", "Risk state", ["healthy", "missing_binding", "degraded_source", "stale_telemetry"]],
] as const;
const FILTER_MAP: Record<string, keyof PortfolioHoldingFilters> = {
  deployment_stage: "deploymentStage", broker_id: "brokerId", runtime_id: "runtimeId",
  source_status: "sourceStatus", stale_telemetry: "staleTelemetry", risk_state: "riskState",
};
const money = (value?: number) => value === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const tone = (value: string) => value === "ok" || value === "healthy" ? "border-status-success/40 text-status-success" : value === "unavailable" || value === "missing_binding" || value === "degraded_source" ? "border-status-failed/40 text-status-failed" : "border-status-warning/40 text-status-warning";
const scopeLabel = (kind: string, id?: string) => ({ paper_ledger: "Paper ledger", canary_sleeve: "Canary sleeve", live_capital_pool: "Live capital pool", unclassified: "Unknown capital scope" }[kind] ?? "Unknown capital scope") + (id ? ` · ${id}` : "");

export const PortfolioBookPage = () => {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(FILTERS.map(([query]) => [FILTER_MAP[query], params.get(query) || undefined])) as PortfolioHoldingFilters, [params]);
  const filterKey = params.toString();
  const { data, loading, refresh } = useV5Live(() => mgmt.portfolioBook.monitor(filters, () => EMPTY_MONITOR), [filterKey]);
  const monitor = data ?? EMPTY_MONITOR;
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const incidentsByHolding = new Map(monitor.incidents.map((incident) => [incident.holdingId, incident]));

  return <section className="p-6 space-y-6" aria-label="Portfolio Book">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Portfolio Book</h1><p className="text-sm text-muted-foreground">Live holdings, capital scope, and source-confidence monitor.</p></div>
      <Button variant="outline" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
    </header>

    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2"><Badge variant="outline" className={tone(monitor.surfaceStatus)}>Source: {monitor.surfaceStatus}</Badge>{monitor.surfaceMessage && <span className="text-sm text-muted-foreground">{monitor.surfaceMessage}</span>}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Holdings", monitor.coverage.holdingCount], ["Source rows", monitor.coverage.sourceRowCount], ["Telemetry runtimes", `${monitor.coverage.telemetryRuntimeCount}/${monitor.coverage.runtimeCount}`], ["Incidents", monitor.coverage.incidentCount], ["Missing bindings", monitor.coverage.missingBindingCount], ["Degraded sources", monitor.coverage.degradedSourceCount], ["Stale rows", monitor.coverage.staleRowCount]].map(([label, value]) => <div key={label} className="rounded border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-mono">{value}</div></div>)}
      </div>
    </Card>

    <Card className="p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FILTERS.map(([key, label, options]) => <label key={key} className="space-y-1 text-xs text-muted-foreground">{label}<select aria-label={label} className="block h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={params.get(key) ?? ""} onChange={(event) => setFilter(key, event.target.value)}><option value="">All</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}{options.length === 0 && params.get(key) && <option value={params.get(key)!}>{params.get(key)}</option>}</select></label>)}
    </div>{filterKey && <Button className="mt-3" variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}</Card>

    {monitor.incidents.length > 0 && <Card className="border-status-failed/40"><header className="border-b p-4"><h2 className="font-semibold">Source incidents ({monitor.incidents.length})</h2></header><div className="divide-y">{monitor.incidents.map((incident) => <article key={incident.id} className="p-4 space-y-2" data-testid="portfolio-incident"><div className="flex flex-wrap gap-2"><Badge variant="outline" className={tone(incident.severity)}>{incident.severity} severity</Badge><Badge variant="outline">{incident.riskState}</Badge><Badge variant="outline">Source: {incident.sourceStatus}</Badge></div><p className="text-sm">{incident.message}</p><div className="text-xs text-muted-foreground">{incident.sourceIssues.map((issue) => `${issue.code}: ${issue.message}`).join(" · ")}</div>{incident.links.human_review && <Button asChild size="sm" variant="outline"><Link to={incident.links.human_review}>Human Review</Link></Button>}</article>)}</div></Card>}

    <Card className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-xs uppercase text-muted-foreground"><tr>{["Holding", "Stage / capital scope", "Runtime / broker", "Market value", "PnL", "Source confidence", "Risk", "Actions"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr></thead><tbody>
      {monitor.items.map((row) => { const incident = incidentsByHolding.get(row.holdingId); return <tr key={row.holdingId} className="border-b align-top" data-testid="portfolio-holding"><td className="px-3 py-3"><div className="font-mono">{row.symbol}</div><div className="text-xs text-muted-foreground">{row.holdingId}</div></td><td className="px-3 py-3"><Badge variant="outline">{row.deploymentStage || "unknown"}</Badge><div className="mt-1 text-xs">{scopeLabel(row.capitalScope.scopeKind, row.capitalScope.scopeId)}</div></td><td className="px-3 py-3 text-xs"><div>{row.runtimeId || "Unknown runtime"}</div><div>{row.brokerId || "Unknown broker"}</div></td><td className="px-3 py-3 font-mono">{money(row.marketValue)}</td><td className="px-3 py-3 font-mono">{money(row.unrealizedPnl)}</td><td className="px-3 py-3"><Badge variant="outline" className={tone(row.sourceStatus)}>{row.sourceStatus}</Badge>{row.telemetryStale && <div className="mt-1 text-xs text-status-warning">Stale telemetry</div>}<div className="mt-1 text-xs text-muted-foreground">{row.sourceIssues.map((issue) => issue.code).join(", ") || "No reported source issue"}</div></td><td className="px-3 py-3"><Badge variant="outline" className={tone(row.riskState)}>{row.riskState}</Badge></td><td className="px-3 py-3"><div className="flex flex-col items-start gap-1">{row.links.persona_fleet && <Link className="text-primary underline" to={row.links.persona_fleet}>Persona Fleet</Link>}{row.links.performance_attribution && <Link className="text-primary underline" to={row.links.performance_attribution}>Attribution</Link>}{(incident?.links.human_review || row.links.human_review) && <Link className="text-primary underline" to={incident?.links.human_review || row.links.human_review}>Human Review</Link>}</div></td></tr>; })}
      {!loading && monitor.items.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{monitor.surfaceStatus === "unavailable" ? "Portfolio holdings source is unavailable." : "No holdings match the current filters."}</td></tr>}
    </tbody></table></Card>
  </section>;
};
