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
import { bffV1, NON_TERMINAL_INCIDENT_STATUS_FILTER } from "@/lib/bff-v1";
import type {
  Strategy, Persona, CapitalPool, Runtime, Tool, McpServer, Skill,
  Alert, Incident, RiskLevel,
} from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { useNavigate } from "react-router-dom";
import { safeDateTime } from "@/lib/utils";

const RISK_WEIGHT: Record<RiskLevel, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

// Live list rows may omit numeric fields; render "—" instead of NaN / crash.
const safeFixed = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const safePct = (n: number, d = 1) => (Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : "—");
const safeRound = (n: number) => (Number.isFinite(n) ? `${Math.round(n)}` : "—");

export const DRAWDOWN_BREACH_THRESHOLD = 0.1;

/**
 * Owner contract (`services/execution/lean_runtime/performance_telemetry.py` and
 * `services/control-plane/bff/incidents/service.py`):
 * `drawdown_pct` / `drawdown` is stored as a non-negative fractional ratio
 * `(peak - portfolio_value) / peak` in `[0.0, 1.0]` (e.g. `0.18` = 18% drawdown),
 * with incident thresholds at `0.05` (medium), `0.10` (high), and `0.15` (critical).
 */
export function isDrawdownBreach(
  input: number | { drawdown?: number | null } | null | undefined,
  threshold: number = DRAWDOWN_BREACH_THRESHOLD,
): boolean {
  const drawdown =
    typeof input === "object" && input !== null ? input.drawdown : input;
  return typeof drawdown === "number" && Number.isFinite(drawdown) && drawdown > threshold;
}

const isNonTerminalIncident = (i: Incident): boolean =>
  String(i.status) !== "resolved" && String(i.status) !== "closed";

type SliceStatus = "loading" | "ready" | "error";

interface DomainSlice<T> {
  status: SliceStatus;
  items: T[];
}

const initialSlice = <T,>(): DomainSlice<T> => ({
  status: "loading",
  items: [],
});

function combineSliceStatuses(statuses: readonly SliceStatus[]): SliceStatus {
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.some((s) => s === "loading")) return "loading";
  return "ready";
}

export const RiskCenter = () => {
  const t = useT();
  const navigate = useNavigate();
  const [strategiesSlice, setStrategiesSlice] = useState<DomainSlice<Strategy>>(initialSlice);
  const [personasSlice, setPersonasSlice] = useState<DomainSlice<Persona>>(initialSlice);
  const [poolsSlice, setPoolsSlice] = useState<DomainSlice<CapitalPool>>(initialSlice);
  const [runtimesSlice, setRuntimesSlice] = useState<DomainSlice<Runtime>>(initialSlice);
  const [toolsSlice, setToolsSlice] = useState<DomainSlice<Tool>>(initialSlice);
  const [mcpSlice, setMcpSlice] = useState<DomainSlice<McpServer>>(initialSlice);
  const [skillsSlice, setSkillsSlice] = useState<DomainSlice<Skill>>(initialSlice);
  const [alertsSlice, setAlertsSlice] = useState<DomainSlice<Alert>>(initialSlice);
  const [incidentsSlice, setIncidentsSlice] = useState<DomainSlice<Incident>>(initialSlice);

  useEffect(() => {
    let cancelled = false;

    const loadSlice = <T,>(
      loader: () => Promise<T[]>,
      setter: (slice: DomainSlice<T>) => void,
    ) => {
      setter(initialSlice());
      loader()
        .then((items) => {
          if (!cancelled) setter({ status: "ready", items });
        })
        .catch(() => {
          if (!cancelled) setter({ status: "error", items: [] });
        });
    };

    loadSlice(() => bffV1.strategies.listNonDraft(), setStrategiesSlice);
    loadSlice(() => bffV1.personas.list(), setPersonasSlice);
    loadSlice(() => bffV1.capitalPools.list(), setPoolsSlice);
    loadSlice(() => bffV1.runtimes.list(), setRuntimesSlice);
    loadSlice(() => bffV1.tools.list(), setToolsSlice);
    loadSlice(() => bffV1.mcpServers.list(), setMcpSlice);
    loadSlice(() => bffV1.skills.list(), setSkillsSlice);
    loadSlice(() => bffV1.alerts.list(), setAlertsSlice);
    loadSlice(
      () => bffV1.incidents.list({ status: NON_TERMINAL_INCIDENT_STATUS_FILTER }),
      setIncidentsSlice,
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const data = useMemo(
    () => ({
      strategies: strategiesSlice.items,
      personas: personasSlice.items,
      pools: poolsSlice.items,
      runtimes: runtimesSlice.items,
      tools: toolsSlice.items,
      mcp: mcpSlice.items,
      skills: skillsSlice.items,
      alerts: alertsSlice.items,
      incidents: incidentsSlice.items,
    }),
    [
      strategiesSlice.items,
      personasSlice.items,
      poolsSlice.items,
      runtimesSlice.items,
      toolsSlice.items,
      mcpSlice.items,
      skillsSlice.items,
      alertsSlice.items,
      incidentsSlice.items,
    ],
  );

  const objectCountsStatus = combineSliceStatuses([
    strategiesSlice.status,
    personasSlice.status,
    poolsSlice.status,
    toolsSlice.status,
    mcpSlice.status,
    skillsSlice.status,
  ]);

  const summary = useMemo(() => {
    const all = [
      ...data.strategies, ...data.personas, ...data.pools, ...data.tools, ...data.mcp, ...data.skills,
    ];
    const counts: Record<RiskLevel, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
    all.forEach((o) => { counts[o.risk] = (counts[o.risk] ?? 0) + 1; });
    const utilBreaches = data.pools.filter((p) => p.allocated > 0 && p.utilized / p.allocated > 0.9).length;
    const drawdownBreaches = data.strategies.filter((s) => isDrawdownBreach(s.drawdown)).length;
    const runtimeWarnings = data.runtimes.filter((r) => r.status === "warning" || r.status === "failed").length;
    const openIncidents = data.incidents.filter(isNonTerminalIncident).length;
    return { counts, utilBreaches, drawdownBreaches, runtimeWarnings, openIncidents };
  }, [data]);

  const cardDisplay = (
    status: SliceStatus,
    value: number,
    readyTone: "default" | "warning" | "danger" | "success",
  ): { value: string | number; tone: "default" | "warning" | "danger" | "success" } => {
    if (status === "loading") {
      return { value: t("common.loading"), tone: "default" };
    }
    if (status === "error") {
      return { value: t("status.unavailable"), tone: "danger" };
    }
    return { value, tone: readyTone };
  };

  const openIncidentsCard = cardDisplay(
    incidentsSlice.status,
    summary.openIncidents,
    summary.openIncidents > 0 ? "danger" : "success",
  );
  const runtimeWarnCard = cardDisplay(
    runtimesSlice.status,
    summary.runtimeWarnings,
    summary.runtimeWarnings > 0 ? "warning" : "default",
  );
  const utilBreachCard = cardDisplay(
    poolsSlice.status,
    summary.utilBreaches,
    summary.utilBreaches > 0 ? "warning" : "default",
  );
  const ddBreachCard = cardDisplay(
    strategiesSlice.status,
    summary.drawdownBreaches,
    summary.drawdownBreaches > 0 ? "danger" : "default",
  );
  const criticalObjectsCard = cardDisplay(
    objectCountsStatus,
    summary.counts.critical,
    summary.counts.critical > 0 ? "danger" : "default",
  );
  const highObjectsCard = cardDisplay(
    objectCountsStatus,
    summary.counts.high,
    summary.counts.high > 0 ? "warning" : "default",
  );

  const tableEmptyForSlice = (status: SliceStatus) =>
    status === "error" ? t("status.unavailable") : t("empty.noResults");

  return (
    <>
      <PageHeader title={t("nav.riskCenter")} subtitle={t("riskCenter.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div data-testid="risk-card-incidents">
            <StatCard
              label={t("riskCenter.kpi.openIncidents")}
              value={openIncidentsCard.value}
              tone={openIncidentsCard.tone}
            />
          </div>
          <div data-testid="risk-card-degraded">
            <StatCard
              label={t("riskCenter.kpi.runtimeWarn")}
              value={runtimeWarnCard.value}
              tone={runtimeWarnCard.tone}
            />
          </div>
          <div data-testid="risk-card-utilization">
            <StatCard
              label={t("riskCenter.kpi.utilBreach")}
              value={utilBreachCard.value}
              tone={utilBreachCard.tone}
            />
          </div>
          <div data-testid="risk-card-drawdown">
            <StatCard
              label={t("riskCenter.kpi.ddBreach")}
              value={ddBreachCard.value}
              hint={t("riskCenter.draftsExcluded")}
              tone={ddBreachCard.tone}
            />
          </div>
          <div data-testid="risk-card-critical">
            <StatCard
              label={t("riskCenter.kpi.criticalObjects")}
              value={criticalObjectsCard.value}
              tone={criticalObjectsCard.tone}
            />
          </div>
          <div data-testid="risk-card-high">
            <StatCard
              label={t("riskCenter.kpi.highObjects")}
              value={highObjectsCard.value}
              tone={highObjectsCard.tone}
            />
          </div>
        </div>

        {/* Breach matrix */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("riskCenter.matrix.title")}
            </div>
            <div className="text-xs text-muted-foreground" data-testid="risk-matrix-drafts-excluded">
              {t("riskCenter.draftsExcluded")}
            </div>
          </div>
          <BreachMatrix
            strategiesSlice={strategiesSlice}
            poolsSlice={poolsSlice}
            runtimesSlice={runtimesSlice}
            toolsSlice={toolsSlice}
          />
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
              loading={poolsSlice.status === "loading"}
              empty={tableEmptyForSlice(poolsSlice.status)}
              onRowClick={(r) => navigate(`/management/promotion-allocation?tab=quarterly-capital&capital_id=${encodeURIComponent(r.id)}`)}
              columns={[
                { key: "name", header: t("table.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "alloc", header: t("section.holdings"), cell: (r) => <span className="text-mono text-xs">{safeFixed(r.allocated / 1_000_000, 1)}M {r.currency}</span> },
                { key: "util", header: t("table.utilization"), cell: (r) => {
                  const pct = (r.utilized / r.allocated) * 100;
                  return <span className={`text-mono text-xs ${pct > 90 ? "text-risk-critical" : pct > 75 ? "text-risk-high" : ""}`}>{safeRound(pct)}%</span>;
                }},
                { key: "budget", header: t("section.limits"), cell: (r) => <span className="text-mono text-xs">{safePct(r.riskBudget, 1)}</span> },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
              ]}
            />
          </TabsContent>

          <TabsContent value="strategy" className="mt-4 space-y-2">
            <div className="text-xs text-muted-foreground" data-testid="risk-strategies-drafts-excluded">
              {t("riskCenter.draftsExcluded")}
            </div>
            <DataTable
              rows={[...data.strategies].sort((a, b) => RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk])}
              loading={strategiesSlice.status === "loading"}
              empty={tableEmptyForSlice(strategiesSlice.status)}
              onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
              columns={[
                { key: "name", header: t("nav.strategies"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                { key: "dd", header: t("table.drawdown"), cell: (r) => <span className={`text-mono text-xs ${isDrawdownBreach(r.drawdown) ? "text-risk-critical" : ""}`}>{safePct(r.drawdown, 1)}</span> },
                { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{safeFixed(r.sharpe, 2)}</span> },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
              ]}
            />
          </TabsContent>

          <TabsContent value="persona" className="mt-4">
            <DataTable
              rows={data.personas}
              loading={personasSlice.status === "loading"}
              empty={tableEmptyForSlice(personasSlice.status)}
              onRowClick={(r) => navigate(`/management/personas/${r.id}`)}
              columns={[
                { key: "name", header: t("nav.personas"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "arch", header: t("table.type"), cell: (r) => <span className="text-mono text-xs">{r.archetype}</span> },
                { key: "succ", header: t("table.winRate"), cell: (r) => <span className="text-mono text-xs">{safeRound(r.successRate * 100)}%</span> },
                { key: "routed", header: t("nav.strategies"), cell: (r) => r.routedStrategies },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
              ]}
            />
          </TabsContent>

          <TabsContent value="runtime" className="mt-4">
            <DataTable
              rows={data.runtimes}
              loading={runtimesSlice.status === "loading"}
              empty={tableEmptyForSlice(runtimesSlice.status)}
              onRowClick={() => navigate("/management/runtimes")}
              columns={[
                { key: "name", header: t("nav.runtimes"), cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "env", header: t("table.env"), cell: (r) => <span className="text-mono text-xs uppercase">{r.env}</span> },
                { key: "status", header: t("table.state"), cell: (r) => <StatusBadge state={r.status} /> },
                { key: "cpu", header: "CPU", cell: (r) => <span className="text-mono text-xs">{safeRound(r.cpu * 100)}%</span> },
                { key: "lat", header: "p95", cell: (r) => <span className={`text-mono text-xs ${r.latencyP95Ms > 1000 ? "text-risk-high" : ""}`}>{Number.isFinite(r.latencyP95Ms) ? `${r.latencyP95Ms}ms` : "—"}</span> },
                { key: "up", header: t("table.utilization"), cell: (r) => <span className="text-mono text-xs">{safeFixed(r.uptimePct, 2)}%</span> },
              ]}
            />
          </TabsContent>

          <TabsContent value="capability" className="mt-4 space-y-4">
            <Card className="p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("nav.tools")}</div>
              <DataTable
                rows={[...data.tools].sort((a, b) => RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk])}
                loading={toolsSlice.status === "loading"}
                empty={tableEmptyForSlice(toolsSlice.status)}
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
                loading={mcpSlice.status === "loading"}
                empty={tableEmptyForSlice(mcpSlice.status)}
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
                loading={skillsSlice.status === "loading"}
                empty={tableEmptyForSlice(skillsSlice.status)}
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
              rows={data.incidents.filter(isNonTerminalIncident)}
              loading={incidentsSlice.status === "loading"}
              empty={tableEmptyForSlice(incidentsSlice.status)}
              onRowClick={(r) => navigate(`/management/incidents/${r.id}`)}
              columns={[
                { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                { key: "title", header: t("table.title"), cell: (r) => <span className="font-medium">{r.title}</span> },
                { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "resolved" ? "success" : r.status === "mitigating" ? "running" : "warning"} /> },
                { key: "opened", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.openedAt)}</span> },
              ]}
            />
            <DataTable
              rows={data.alerts.filter((a) => !a.acknowledged)}
              loading={alertsSlice.status === "loading"}
              empty={tableEmptyForSlice(alertsSlice.status)}
              onRowClick={() => navigate("/management/alerts")}
              columns={[
                { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                { key: "title", header: t("nav.alerts"), cell: (r) => <span>{r.title}</span> },
                { key: "src", header: t("table.source"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
                { key: "opened", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.openedAt)}</span> },
                { key: "act", header: "", cell: () => <Button size="sm" variant="outline">{t("table_actions.open")}</Button> },
              ]}
            />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
};

const BreachMatrix = ({
  strategiesSlice,
  poolsSlice,
  runtimesSlice,
  toolsSlice,
}: {
  strategiesSlice: DomainSlice<Strategy>;
  poolsSlice: DomainSlice<CapitalPool>;
  runtimesSlice: DomainSlice<Runtime>;
  toolsSlice: DomainSlice<Tool>;
}) => {
  const t = useT();
  const rows = [
    {
      key: "strategy",
      label: `${t("riskCenter.tab.strategy")} (${t("riskCenter.draftsExcluded")})`,
      status: strategiesSlice.status,
      counts: bucket(strategiesSlice.items.map((s) => s.risk)),
    },
    {
      key: "capital",
      label: t("riskCenter.tab.capital"),
      status: poolsSlice.status,
      counts: bucket(poolsSlice.items.map((p) => p.risk)),
    },
    {
      key: "runtime",
      label: t("riskCenter.tab.runtime"),
      status: runtimesSlice.status,
      counts: bucket(
        runtimesSlice.items.map(
          (r) => (r.status === "failed" ? "critical" : r.status === "warning" ? "high" : "low") as RiskLevel,
        ),
      ),
    },
    {
      key: "tools",
      label: t("nav.tools"),
      status: toolsSlice.status,
      counts: bucket(toolsSlice.items.map((tl) => tl.risk)),
    },
  ];
  const cell = (status: SliceStatus, n: number, level: RiskLevel) => {
    if (status === "loading") {
      return <span className="text-mono text-xs text-muted-foreground">{t("common.loading")}</span>;
    }
    if (status === "error") {
      return <span className="text-mono text-xs text-status-failed">{t("status.unavailable")}</span>;
    }
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
        <div key={r.key} className="contents" data-testid={`breach-matrix-row-${r.key}`}>
          <div className="font-medium">{r.label}</div>
          <div>{cell(r.status, r.counts.low, "low")}</div>
          <div>{cell(r.status, r.counts.medium, "medium")}</div>
          <div>{cell(r.status, r.counts.high, "high")}</div>
          <div>{cell(r.status, r.counts.critical, "critical")}</div>
        </div>
      ))}
    </div>
  );
};

const bucket = (levels: RiskLevel[]) => {
  const acc = { low: 0, medium: 0, high: 0, critical: 0 };
  levels.forEach((l) => {
    if (l in acc) {
      acc[l as keyof typeof acc] += 1;
    }
  });
  return acc;
};

export default RiskCenter;
