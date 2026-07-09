// Command Center — Spec Part 3 §5 / Page §5.
// Management Console home: KPIs, lifecycle bottlenecks, pending actions, risk snapshot,
// running jobs, capital exposure, alerts/incidents, Agora incoming, recent state transitions.
import { useEffect, useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff-v1";
import type {
  Alert, ApprovalRequest, Job, Strategy, Incident, CapitalPool, AuditEvent, Persona,
} from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { usePlatform } from "@/platform/store";
import { useNavigate } from "react-router-dom";
import { ArrowRight, AlertOctagon, Activity, Wallet, Inbox } from "lucide-react";
import { isLive, lifecycleOf } from "@/lib/v4/strategyTripleDerive";
import { safeDateTime } from "@/lib/utils";

const relTime = (iso: string, locale: string, justNow: string) => {
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  if (abs < 60_000) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return justNow;
};

const poolBarClass = (pct: number) =>
  pct > 90 ? "bg-risk-critical" : pct > 75 ? "bg-risk-high" : pct > 60 ? "bg-risk-medium" : "bg-accent";

const poolRiskLevel = (pct: number): "low" | "medium" | "high" | "critical" =>
  pct > 90 ? "critical" : pct > 75 ? "high" : pct > 60 ? "medium" : "low";

interface State {
  strategies: Strategy[];
  personas: Persona[];
  pools: CapitalPool[];
  alerts: Alert[];
  incidents: Incident[];
  approvals: ApprovalRequest[];
  jobs: Job[];
  audit: AuditEvent[];
}

const empty: State = {
  strategies: [], personas: [], pools: [], alerts: [], incidents: [], approvals: [], jobs: [], audit: [],
};

export const CommandCenter = () => {
  const t = useT();
  const navigate = useNavigate();
  const env = usePlatform((s) => s.env);
  const locale = usePlatform((s) => s.locale);
  const [d, setD] = useState<State>(empty);

  useEffect(() => {
    Promise.all([
      bff.strategies.list(), bff.personas.list(), bff.capitalPools.list(),
      bff.alerts.list(), bff.incidents.list(), bff.approvals.list(),
      bff.jobs.list(), bff.audit.list(),
    ]).then(([strategies, personas, pools, alerts, incidents, approvals, jobs, audit]) =>
      setD({ strategies, personas, pools, alerts, incidents, approvals, jobs, audit }),
    );
  }, []);

  const kpi = useMemo(() => {
    const openAlerts = d.alerts.filter((a) => !a.acknowledged).length;
    const openIncidents = d.incidents.filter((i) => i.status !== "resolved").length;
    const pendingApprovals = d.approvals.filter((a) => a.state === "pending").length;
    const runningJobs = d.jobs.filter((j) => j.status === "running").length;
    const liveRisk = d.strategies.filter((s) => isLive(s) && (s.risk === "high" || s.risk === "critical")).length;
    const utilPct = d.pools.length
      ? Math.round((d.pools.reduce((acc, p) => acc + p.utilized / p.allocated, 0) / d.pools.length) * 100)
      : 0;
    return { openAlerts, openIncidents, pendingApprovals, runningJobs, liveRisk, utilPct };
  }, [d]);

  const bottlenecks = useMemo(() => {
    const groups: Record<string, number> = {};
    d.strategies.forEach((s) => {
      const lc = lifecycleOf(s);
      groups[lc] = (groups[lc] ?? 0) + 1;
    });
    return Object.entries(groups).map(([state, count]) => ({ state, count }));
  }, [d.strategies]);

  // Mocked Agora incoming queue — surfaces handoffs not yet promoted to Management workflow.
  const agoraIncoming = useMemo(
    () => [
      { id: "ag_in_01", title: "Persona suggests pausing stg_004 (FX Carry)", source: "Quant Architect", risk: "high" as const, ts: "2026-05-03T10:12:00Z" },
      { id: "ag_in_02", title: "Decision: promote macro_briefing v2 → review", source: "Macro Strategist", risk: "medium" as const, ts: "2026-05-03T09:48:00Z" },
      { id: "ag_in_03", title: "Signal flagged: cross-asset momentum divergence", source: "Signal Review", risk: "low" as const, ts: "2026-05-03T08:30:00Z" },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title={t("nav.commandCenter")}
        subtitle={t("commandCenter.subtitle")}
        actions={
          <Badge variant="outline" className="font-medium uppercase text-mono text-xs">
            {t("env.label")}: {t(`env.${env}`)}
          </Badge>
        }
      />
      <PageBody>
        {/* ── Top KPI Strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label={t("commandCenter.kpi.liveRisk")} value={kpi.liveRisk} hint={t("commandCenter.kpi.liveRiskHint")} tone={kpi.liveRisk > 0 ? "warning" : "default"} />
          <StatCard label={t("commandCenter.kpi.openIncidents")} value={kpi.openIncidents} tone={kpi.openIncidents > 0 ? "danger" : "success"} />
          <StatCard label={t("commandCenter.kpi.pendingApprovals")} value={kpi.pendingApprovals} tone={kpi.pendingApprovals > 0 ? "warning" : "default"} />
          <StatCard label={t("commandCenter.kpi.runningJobs")} value={kpi.runningJobs} />
          <StatCard label={t("commandCenter.kpi.runtimeHealth")} value="99.94%" hint={t("commandCenter.kpi.runtimeHint")} tone="success" />
          <StatCard label={t("commandCenter.kpi.capitalUtil")} value={`${kpi.utilPct}%`} hint={t("commandCenter.kpi.capitalHint")} />
        </div>

        {/* ── Lifecycle bottlenecks + Pending actions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <Card className="p-4 flex flex-col h-full">
            <SectionHeader icon={<Activity className="h-4 w-4" />} title={t("commandCenter.section.bottlenecks")} hint={t("commandCenter.section.bottlenecksHint")} />
            <div className="mt-3 flex flex-wrap gap-2">
              {bottlenecks.map((b) => (
                <button
                  key={b.state}
                  onClick={() => navigate(`/management/strategies?state=${b.state}`)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 hover:bg-muted/60 transition px-3 py-1.5"
                >
                  <StatusBadge state={b.state} />
                  <span className="text-mono text-sm font-semibold">{b.count}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4 flex flex-col h-full">
            <SectionHeader icon={<Inbox className="h-4 w-4" />} title={t("commandCenter.section.pendingActions")} hint={t("commandCenter.section.pendingHint")} />
            <ul className="mt-3 divide-y divide-border">
              {d.approvals.filter((a) => a.state === "pending").slice(0, 5).map((a) => (
                <li
                  key={a.id}
                  onClick={() => navigate(`/management/governance/${a.id}`)}
                  className="py-2 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.subject}</div>
                    <div className="text-xs text-muted-foreground text-mono">{a.kind} · {a.requester}</div>
                  </div>
                  <RiskBadge level={a.riskLevel} />
                </li>
              ))}
              {d.approvals.filter((a) => a.state === "pending").length === 0 && (
                <li className="py-6 text-center text-xs text-muted-foreground">{t("commandCenter.empty")}</li>
              )}
            </ul>
          </Card>
        </div>

        {/* ── Capital exposure + Alerts/Incidents + Persona ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <Card className="p-4 flex flex-col h-full">
            <SectionHeader icon={<Wallet className="h-4 w-4" />} title={t("commandCenter.section.capitalExposure")} />
            <ul className="mt-3 space-y-3">
              {d.pools.map((p) => {
                const pct = Math.round((p.utilized / p.allocated) * 100);
                const level = poolRiskLevel(pct);
                return (
                  <li key={p.id} className="text-sm">
                    <div className="flex justify-between items-center gap-2">
                      <button onClick={() => navigate(`/management/capital-pools/${p.id}`)} className="font-medium hover:underline truncate">{p.name}</button>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-mono text-xs text-muted-foreground">{pct}%</span>
                        <RiskBadge level={level} />
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 bg-muted rounded overflow-hidden">
                      <div className={`h-full ${poolBarClass(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4 flex flex-col h-full">
            <SectionHeader icon={<AlertOctagon className="h-4 w-4" />} title={t("commandCenter.section.alertsIncidents")} />
            <ul className="mt-3 divide-y divide-border">
              {d.incidents.filter((i) => i.status !== "resolved").map((i) => (
                <li key={i.id} onClick={() => navigate(`/management/incidents/${i.id}`)} className="py-2 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded">
                  <div className="flex items-center gap-2">
                    <RiskBadge level={i.severity} />
                    <span className="text-sm font-medium truncate flex-1">{i.title}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-mono">{i.id}</span>
                    <span>·</span>
                    <span>{relTime(i.openedAt, locale, t("common.justNow"))}</span>
                  </div>
                </li>
              ))}
              {d.alerts.filter((a) => !a.acknowledged).slice(0, 3).map((a) => (
                <li key={a.id} onClick={() => navigate("/management/alerts")} className="py-2 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded">
                  <div className="flex items-center gap-2">
                    <RiskBadge level={a.severity} />
                    <span className="text-sm truncate flex-1">{a.title}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-mono">{a.source}</span>
                    <span>·</span>
                    <span>{relTime(a.openedAt, locale, t("common.justNow"))}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 flex flex-col h-full">
            <SectionHeader title={t("commandCenter.section.personaActivity")} />
            <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 text-xs items-center">
              <div className="text-muted-foreground tracking-wide">{t("common.owner")}</div>
              <div className="text-muted-foreground tracking-wide text-right">{t("common.successRate")}</div>
              <div className="text-muted-foreground tracking-wide text-right">{t("common.risk")}</div>
              {d.personas.map((p) => (
                <div key={p.id} className="contents">
                  <button onClick={() => navigate(`/management/personas/${p.id}`)} className="text-sm hover:underline truncate text-left">{p.name}</button>
                  <span className="text-mono text-sm text-right">{Math.round(p.successRate * 100)}%</span>
                  <div className="justify-self-end"><RiskBadge level={p.risk} /></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Agora Incoming Queue ── */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <SectionHeader title={t("commandCenter.section.agoraIncoming")} hint={t("commandCenter.section.agoraIncomingHint")} />
            <Button size="sm" variant="ghost" onClick={() => navigate("/agora")}>
              {t("commandCenter.openAgora")} <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <DataTable
            rows={agoraIncoming}
            columns={[
              { key: "risk", header: t("common.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
              { key: "title", header: t("commandCenter.col.signal"), cell: (r) => <span className="font-medium">{r.title}</span> },
              { key: "source", header: t("commandCenter.col.source"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
              { key: "ts", header: t("common.updated"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.ts)}</span> },
              { key: "act", header: "", cell: () => <Button size="sm" variant="outline">{t("commandCenter.convert")}</Button> },
            ]}
          />
        </Card>

        {/* ── Recent state transitions ── */}
        <Card className="p-4">
          <SectionHeader title={t("commandCenter.section.recentEvents")} />
          <ol className="mt-3 space-y-2">
            {d.audit.slice(0, 8).map((e) => (
              <li key={e.id} className="text-sm flex gap-3 items-baseline">
                <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{safeDateTime(e.ts, "time")}</span>
                <span className="text-mono text-xs text-accent">{e.actor}</span>
                <span className="text-mono text-xs">{e.action}</span>
                <span className="text-xs text-muted-foreground">→ {e.target}</span>
              </li>
            ))}
          </ol>
        </Card>

        {/* Running jobs quick view */}
        <Card className="p-4">
          <SectionHeader title={t("commandCenter.section.runningJobs")} />
          <DataTable
            rows={d.jobs}
            onRowClick={() => navigate("/management/jobs")}
            columns={[
              { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
              { key: "kind", header: t("commandCenter.col.kind"), cell: (r) => r.kind },
              { key: "status", header: t("common.state"), cell: (r) => <StatusBadge state={r.status} /> },
              { key: "owner", header: t("common.owner"), cell: (r) => r.owner },
            ]}
          />
        </Card>
      </PageBody>
    </>
  );
};

const SectionHeader = ({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) => (
  <div>
    <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground">
      {icon}
      {title}
    </div>
    {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
  </div>
);
