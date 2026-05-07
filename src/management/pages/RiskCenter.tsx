// Risk Center — Spec Part 3 §18.5 Risk Center.
// Panels: Capital risk, Strategy risk, Persona risk, Runtime risk, Tool/MCP/Skill risk,
// open incidents, breach matrix, drill-downs into the offending object.
import { useEffect, useMemo, useState, Fragment } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { DataTable } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff-v1";
import type {
  Strategy, Persona, CapitalPool, Runtime, Tool, McpServer, Skill,
  Alert, Incident, RiskLevel,
} from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { useNavigate } from "react-router-dom";

const RISK_WEIGHT: Record<RiskLevel, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export const RiskCenter = () => {
  const t = useT();
  const navigate = useNavigate();
  const [data, setData] = useState<{
    strategies: Strategy[]; personas: Persona[]; pools: CapitalPool[];
    runtimes: Runtime[]; tools: Tool[]; mcp: McpServer[]; skills: Skill[];
    alerts: Alert[]; incidents: Incident[];
  }>({ strategies: [], personas: [], pools: [], runtimes: [], tools: [], mcp: [], skills: [], alerts: [], incidents: [] });

  useEffect(() => {
    Promise.all([
      bff.strategies.list(), bff.personas.list(), bff.capitalPools.list(),
      bff.runtimes.list(), bff.tools.list(), bff.mcpServers.list(), bff.skills.list(),
      bff.alerts.list(), bff.incidents.list(),
    ]).then(([strategies, personas, pools, runtimes, tools, mcp, skills, alerts, incidents]) =>
      setData({ strategies, personas, pools, runtimes, tools, mcp, skills, alerts, incidents }),
    );
  }, []);

  const summary = useMemo(() => {
    const all = [
      ...data.strategies, ...data.personas, ...data.pools, ...data.tools, ...data.mcp, ...data.skills,
    ];
    const counts: Record<RiskLevel, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
    all.forEach((o) => { counts[o.risk] = (counts[o.risk] ?? 0) + 1; });
    const utilBreaches = data.pools.filter((p) => p.utilized / p.allocated > 0.9).length;
    const drawdownBreaches = data.strategies.filter((s) => s.drawdown < -0.1).length;
    const runtimeWarnings = data.runtimes.filter((r) => r.status === "warning" || r.status === "failed").length;
    const openIncidents = data.incidents.filter((i) => i.status !== "resolved").length;
    return { counts, utilBreaches, drawdownBreaches, runtimeWarnings, openIncidents };
  }, [data]);

  return (
    <>
      <PageHeader title={t("nav.riskCenter")} subtitle={t("riskCenter.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard label={t("riskCenter.kpi.openIncidents")} value={summary.openIncidents} tone={summary.openIncidents > 0 ? "danger" : "success"} />
          <StatCard label={t("riskCenter.kpi.runtimeWarn")} value={summary.runtimeWarnings} tone={summary.runtimeWarnings > 0 ? "warning" : "default"} />
          <StatCard label={t("riskCenter.kpi.utilBreach")} value={summary.utilBreaches} tone={summary.utilBreaches > 0 ? "warning" : "default"} />
          <StatCard label={t("riskCenter.kpi.ddBreach")} value={summary.drawdownBreaches} tone={summary.drawdownBreaches > 0 ? "danger" : "default"} />
          <StatCard label={t("riskCenter.kpi.criticalObjects")} value={summary.counts.critical} tone={summary.counts.critical > 0 ? "danger" : "default"} />
          <StatCard label={t("riskCenter.kpi.highObjects")} value={summary.counts.high} tone={summary.counts.high > 0 ? "warning" : "default"} />
        </div>

        {/* Breach matrix */}
        <Card className="p-4">
          <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("riskCenter.matrix.title")}</div>
          <BreachMatrix data={data} />
        </Card>

        <Tabs defaultValue="capital">
          <TabsList>
            <TabsTrigger value="capital">{t("riskCenter.tab.capital")}</TabsTrigger>
            <TabsTrigger value="strategy">{t("riskCenter.tab.strategy")}</TabsTrigger>
            <TabsTrigger value="persona">{t("riskCenter.tab.persona")}</TabsTrigger>
            <TabsTrigger value="runtime">{t("riskCenter.tab.runtime")}</TabsTrigger>
            <TabsTrigger value="capability">{t("riskCenter.tab.capability")}</TabsTrigger>
            <TabsTrigger value="incidents">{t("riskCenter.tab.incidents")}</TabsTrigger>
          </TabsList>

          <TabsContent value="capital" className="mt-4">
            <DataTable
              rows={data.pools}
              onRowClick={(r) => navigate(`/management/capital-pools/${r.id}`)}
              columns={[
                { key: "name", header: t("table.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "alloc", header: t("section.holdings"), cell: (r) => <span className="text-mono text-xs">{(r.allocated / 1_000_000).toFixed(1)}M {r.currency}</span> },
                { key: "util", header: t("table.utilization"), cell: (r) => {
                  const pct = Math.round((r.utilized / r.allocated) * 100);
                  return <span className={`text-mono text-xs ${pct > 90 ? "text-risk-critical" : pct > 75 ? "text-risk-high" : ""}`}>{pct}%</span>;
                }},
                { key: "budget", header: t("section.limits"), cell: (r) => <span className="text-mono text-xs">{(r.riskBudget * 100).toFixed(1)}%</span> },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
              ]}
            />
          </TabsContent>

          <TabsContent value="strategy" className="mt-4">
            <DataTable
              rows={[...data.strategies].sort((a, b) => RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk])}
              onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
              columns={[
                { key: "name", header: t("nav.strategies"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                { key: "dd", header: t("table.drawdown"), cell: (r) => <span className={`text-mono text-xs ${r.drawdown < -0.1 ? "text-risk-critical" : ""}`}>{(r.drawdown * 100).toFixed(1)}%</span> },
                { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{r.sharpe.toFixed(2)}</span> },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
              ]}
            />
          </TabsContent>

          <TabsContent value="persona" className="mt-4">
            <DataTable
              rows={data.personas}
              onRowClick={(r) => navigate(`/management/personas/${r.id}`)}
              columns={[
                { key: "name", header: t("nav.personas"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "arch", header: t("table.type"), cell: (r) => <span className="text-mono text-xs">{r.archetype}</span> },
                { key: "succ", header: t("table.winRate"), cell: (r) => <span className="text-mono text-xs">{Math.round(r.successRate * 100)}%</span> },
                { key: "routed", header: t("nav.strategies"), cell: (r) => r.routedStrategies },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
              ]}
            />
          </TabsContent>

          <TabsContent value="runtime" className="mt-4">
            <DataTable
              rows={data.runtimes}
              onRowClick={() => navigate("/management/runtimes")}
              columns={[
                { key: "name", header: t("nav.runtimes"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "env", header: t("table.env"), cell: (r) => <span className="text-mono text-xs uppercase">{r.env}</span> },
                { key: "status", header: t("table.state"), cell: (r) => <StatusBadge state={r.status} /> },
                { key: "cpu", header: "CPU", cell: (r) => <span className="text-mono text-xs">{Math.round(r.cpu * 100)}%</span> },
                { key: "lat", header: "p95", cell: (r) => <span className={`text-mono text-xs ${r.latencyP95Ms > 1000 ? "text-risk-high" : ""}`}>{r.latencyP95Ms}ms</span> },
                { key: "up", header: t("table.utilization"), cell: (r) => <span className="text-mono text-xs">{r.uptimePct.toFixed(2)}%</span> },
              ]}
            />
          </TabsContent>

          <TabsContent value="capability" className="mt-4 space-y-4">
            <Card className="p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("nav.tools")}</div>
              <DataTable
                rows={[...data.tools].sort((a, b) => RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk])}
                onRowClick={(r) => navigate(`/management/tools/${r.id}`)}
                columns={[
                  { key: "name", header: t("table.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
                  { key: "cat", header: t("table.type"), cell: (r) => <span className="text-mono text-xs">{r.category}</span> },
                  { key: "used", header: t("section.relatedObjects"), cell: (r) => r.usedBy },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
                ]}
              />
            </Card>
            <Card className="p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("nav.mcp")}</div>
              <DataTable
                rows={data.mcp}
                onRowClick={(r) => navigate(`/management/mcp/${r.id}`)}
                columns={[
                  { key: "name", header: t("table.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
                  { key: "health", header: t("table.status"), cell: (r) => <StatusBadge state={r.health} /> },
                  { key: "tc", header: t("nav.tools"), cell: (r) => r.toolCount },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
                ]}
              />
            </Card>
            <Card className="p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("nav.skills")}</div>
              <DataTable
                rows={data.skills}
                onRowClick={(r) => navigate(`/management/skills/${r.id}`)}
                columns={[
                  { key: "name", header: t("table.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
                  { key: "arch", header: t("table.type"), cell: (r) => <span className="text-mono text-xs">{r.archetype}</span> },
                  { key: "score", header: t("section.performance"), cell: (r) => <span className="text-mono text-xs">{r.evalScore?.toFixed(2) ?? "—"}</span> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
                ]}
              />
            </Card>
          </TabsContent>

          <TabsContent value="incidents" className="mt-4 space-y-4">
            <DataTable
              rows={data.incidents}
              onRowClick={(r) => navigate(`/management/incidents/${r.id}`)}
              columns={[
                { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                { key: "title", header: t("table.title"), cell: (r) => <span className="font-medium">{r.title}</span> },
                { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "resolved" ? "success" : r.status === "mitigating" ? "running" : "warning"} /> },
                { key: "opened", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.openedAt).toLocaleString()}</span> },
              ]}
            />
            <DataTable
              rows={data.alerts.filter((a) => !a.acknowledged)}
              onRowClick={() => navigate("/management/alerts")}
              columns={[
                { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                { key: "title", header: t("nav.alerts"), cell: (r) => <span>{r.title}</span> },
                { key: "src", header: t("table.source"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
                { key: "act", header: "", cell: () => <Button size="sm" variant="outline">{t("table_actions.open")}</Button> },
              ]}
            />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
};

const BreachMatrix = ({ data }: { data: { strategies: Strategy[]; pools: CapitalPool[]; runtimes: Runtime[]; tools: Tool[] } }) => {
  const t = useT();
  const rows = [
    { label: t("riskCenter.tab.strategy"), counts: bucket(data.strategies.map((s) => s.risk)) },
    { label: t("riskCenter.tab.capital"), counts: bucket(data.pools.map((p) => p.risk)) },
    { label: t("riskCenter.tab.runtime"), counts: bucket(data.runtimes.map((r) => (r.status === "failed" ? "critical" : r.status === "warning" ? "high" : "low") as RiskLevel)) },
    { label: t("nav.tools"), counts: bucket(data.tools.map((tl) => tl.risk)) },
  ];
  const cell = (n: number, level: RiskLevel) => {
    if (n === 0) return <span className="text-mono text-xs text-muted-foreground">—</span>;
    return <span className={`text-mono text-sm font-semibold ${level === "critical" ? "text-risk-critical" : level === "high" ? "text-risk-high" : level === "medium" ? "text-risk-medium" : "text-risk-low"}`}>{n}</span>;
  };
  return (
    <div className="grid grid-cols-5 gap-x-6 gap-y-2 text-sm">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("table.type")}</div>
      <div className="text-xs uppercase tracking-wider text-risk-low">{t("risk.low")}</div>
      <div className="text-xs uppercase tracking-wider text-risk-medium">{t("risk.medium")}</div>
      <div className="text-xs uppercase tracking-wider text-risk-high">{t("risk.high")}</div>
      <div className="text-xs uppercase tracking-wider text-risk-critical">{t("risk.critical")}</div>
      {rows.map((r) => (
        <Fragment key={r.label}>
          <div className="font-medium">{r.label}</div>
          <div>{cell(r.counts.low, "low")}</div>
          <div>{cell(r.counts.medium, "medium")}</div>
          <div>{cell(r.counts.high, "high")}</div>
          <div>{cell(r.counts.critical, "critical")}</div>
        </Fragment>
      ))}
    </div>
  );
};

const bucket = (levels: RiskLevel[]) => {
  const acc = { low: 0, medium: 0, high: 0, critical: 0 };
  levels.forEach((l) => { acc[l] += 1; });
  return acc;
};
