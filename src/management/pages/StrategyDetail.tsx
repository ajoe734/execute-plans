// Strategy Detail — Spec Part 3 §6 (11 tabs).
// Overview · Spec & Parameters · Experiments · Paper-Live · Risk & Alerts ·
// Incidents · Artifacts · Evolution · Governance · Lineage · Audit
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Strategy, Job, AuditEvent, ApprovalRequest, Alert, Incident, Artifact, EvolutionProgram, ResearchExperiment } from "@/lib/bff/types";
import { Inbox, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { usePermissions } from "@/lib/usePermissions";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { useInspector } from "@/platform/components/RightDrawer";
import { strategyMachine, type StrategyState } from "@/lib/stateMachines";
import { nextTransitions, type Transition } from "@/lib/stateMachines/types";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";

export const StrategyDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const { can } = usePermissions();
  const [s, setS] = useState<Strategy | undefined>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([]);
  const [evolutions, setEvolutions] = useState<EvolutionProgram[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTr, setActiveTr] = useState<Transition<StrategyState> | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      bff.strategies.get(id), bff.jobs.list(), bff.audit.list(),
      bff.approvals.list(), bff.alerts.list(), bff.incidents.list(),
      bff.artifacts.list(), bff.research.list(), bff.evolution.list(),
    ]).then(([strat, j, a, ap, al, inc, ar, ex, ev]) => {
      setS(strat); setJobs(j);
      setAudit(a.filter((x) => x.target === id || x.target.includes(id)));
      setApprovals(ap.filter((x) => x.subject.includes(id)));
      setAlerts(al.filter((x) => x.relatedTarget === id || x.source.includes(id) || x.title.includes(id)));
      setIncidents(inc.filter((x) => x.affected?.includes(id)));
      setArtifacts(ar.slice(0, 5));
      setExperiments(ex.slice(0, 6));
      setEvolutions(ev.filter((e) => e.parentAlpha === strat?.alpha));
    });
  }, [id]);

  const machineState: StrategyState = useMemo(() => {
    const map: Record<string, StrategyState> = {
      draft: "discovered", review: "replicated", approved: "approved",
      deployed: "live", paused: "paper", retired: "retired",
    };
    return s ? (map[s.state] ?? "live") : "discovered";
  }, [s]);

  const transitions = useMemo(
    () => nextTransitions(strategyMachine, machineState).filter((tr) => can(tr.action)),
    [machineState, can],
  );

  if (!s) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  // ─── Mock data scoped to this strategy ───
  const params = [
    { key: "lookback_days", value: "120", note: "Sampling window" },
    { key: "rebalance_freq", value: "weekly", note: "Cron: 0 2 * * 1" },
    { key: "max_position_pct", value: "8.0%", note: "Per-leg cap" },
    { key: "stop_loss_pct", value: "2.5%", note: "Hard stop" },
    { key: "leverage_cap", value: "3.0x", note: "Cross-margin" },
  ];

  const paperLive = [
    { metric: "Sharpe",      paper: (s.sharpe + 0.3).toFixed(2), live: s.sharpe.toFixed(2),  delta: "-0.30" },
    { metric: "PnL 30d",     paper: `${((s.pnl30d + 0.012) * 100).toFixed(2)}%`, live: `${(s.pnl30d * 100).toFixed(2)}%`, delta: "-1.20%" },
    { metric: "Max Drawdown",paper: `${((s.drawdown + 0.005) * 100).toFixed(2)}%`, live: `${(s.drawdown * 100).toFixed(2)}%`, delta: "+0.50%" },
    { metric: "Win Rate",    paper: "57.4%", live: "54.1%", delta: "-3.30%" },
    { metric: "Avg Slippage",paper: "1.2 bps", live: "2.4 bps", delta: "+1.20" },
  ];

  return (
    <>
      <ObjectDetailLayout
        object={s}
        subtitle={`${s.alpha} · ${s.id}`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => useInspector.getState().open({
              id: s.id, type: "Strategy", name: s.name, state: s.state, risk: s.risk,
              owner: s.owner, updatedAt: s.updatedAt, availableActions: s.availableActions,
              meta: [{ label: "Alpha", value: s.alpha }, { label: "Pool", value: s.capitalPoolId }],
            })}>
              <Inbox className="h-4 w-4 mr-1" />Inspect
            </Button>
            {transitions.map((tr) => (
              <Button
                key={tr.action}
                size="sm"
                variant={tr.risk === "critical" || tr.risk === "high" ? "default" : "outline"}
                onClick={() => { setActiveTr(tr); setConfirmOpen(true); }}
              >
                {tr.action} → {tr.to}
              </Button>
            ))}
          </>
        }
        tabs={[
          // ── 1. Overview ──
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <Section>
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("lifecycle.title")}</div>
                    <LifecycleStepper machine={strategyMachine} current={machineState} i18nPrefix="lifecycle.strategy" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Alpha" value={s.alpha} mono />
                    <Field label={t("nav.capital")} value={s.capitalPoolId} mono />
                    <Field label={t("nav.personas")} value={s.personaIds.join(", ")} mono />
                    <Field label={t("table.updated")} value={new Date(s.updatedAt).toLocaleString()} mono />
                  </div>
                </Section>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <StatCard label="PnL 30d" value={`${(s.pnl30d * 100).toFixed(2)}%`} tone={s.pnl30d >= 0 ? "success" : "danger"} />
                  <StatCard label={t("table.sharpe")} value={s.sharpe.toFixed(2)} />
                  <StatCard label={t("table.drawdown")} value={`${(s.drawdown * 100).toFixed(2)}%`} tone="warning" />
                </div>
              </>
            ),
          },

          // ── 2. Spec & Parameters ──
          {
            value: "spec", label: t("strategyDetail.spec"),
            content: (
              <>
                <Section title={t("strategyDetail.specTitle")}>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("strategyDetail.specBody", { alpha: s.alpha })}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2">
                    <Field label={t("strategyDetail.universe")} value="Top-50 perp by 30d ADV" />
                    <Field label={t("strategyDetail.execMode")} value="VWAP / 5min slices" />
                    <Field label={t("strategyDetail.benchmark")} value="BTC-PERP buy-and-hold" />
                  </div>
                </Section>
                <Section title={t("strategyDetail.params")}>
                  <DataTable<typeof params[number] & { id: string }>
                    rows={params.map((p) => ({ ...p, id: p.key }))}
                    columns={[
                      { key: "k", header: t("strategyDetail.paramKey"), cell: (r) => <code className="text-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.key}</code> },
                      { key: "v", header: t("table.value"), cell: (r) => <span className="text-mono text-sm">{r.value}</span> },
                      { key: "n", header: t("table.description"), cell: (r) => <span className="text-xs text-muted-foreground">{r.note}</span> },
                    ]}
                  />
                </Section>
              </>
            ),
          },

          // ── 3. Experiments ──
          {
            value: "experiments", label: t("nav.experiments"),
            content: (
              <DataTable<ResearchExperiment>
                rows={experiments}
                onRowClick={(r) => nav(`/management/experiments/${r.id}`)}
                columns={[
                  { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                  { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "hyp", header: t("strategyDetail.hypothesis"), cell: (r) => <span className="text-xs text-muted-foreground">{r.hypothesis}</span> },
                  { key: "metric", header: t("table.metric"), cell: (r) => <span className="text-mono text-xs">{r.metric}: {r.metricValue.toFixed(3)}</span> },
                  { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "concluded" ? "success" : r.status === "running" ? "running" : r.status === "review" ? "review" : "pending"} /> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },

          // ── 4. Paper-Live ──
          {
            value: "paperLive", label: t("strategyDetail.paperLive"),
            content: (
              <>
                <Section title={t("strategyDetail.paperLiveTitle")}>
                  <p className="text-xs text-muted-foreground">{t("strategyDetail.paperLiveHint")}</p>
                </Section>
                <Card className="overflow-hidden mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left p-3">{t("table.metric")}</th>
                        <th className="text-right p-3">{t("strategyDetail.paper")}</th>
                        <th className="text-right p-3">{t("strategyDetail.live")}</th>
                        <th className="text-right p-3">{t("section.changeSummary")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paperLive.map((row) => (
                        <tr key={row.metric} className="border-b border-border last:border-0">
                          <td className="p-3 font-medium">{row.metric}</td>
                          <td className="p-3 text-right text-mono text-sm">{row.paper}</td>
                          <td className="p-3 text-right text-mono text-sm">{row.live}</td>
                          <td className={`p-3 text-right text-mono text-sm ${row.delta.startsWith("-") ? "text-status-failed" : "text-status-warning"}`}>{row.delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </>
            ),
          },

          // ── 5. Risk & Alerts ──
          {
            value: "risk", label: t("strategyDetail.riskAlerts"),
            content: (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label={t("strategyDetail.var95")} value={`${(s.drawdown * 1.6 * 100).toFixed(2)}%`} tone="warning" />
                  <StatCard label={t("strategyDetail.beta")} value="0.78" />
                  <StatCard label={t("strategyDetail.exposure")} value={`${(s.pnl30d * 0 + 4.2).toFixed(1)}M`} hint="USD notional" />
                </div>
                <Section title={t("strategyDetail.activeAlerts")}>
                  <DataTable<Alert>
                    rows={alerts.length ? alerts : [
                      { id: "alt_demo_01", severity: "medium", title: "Realized vol > 30d avg + 1σ", source: s.id, openedAt: new Date(Date.now() - 3600_000).toISOString(), acknowledged: false },
                      { id: "alt_demo_02", severity: "low", title: "Slippage uptick on US session", source: s.id, openedAt: new Date(Date.now() - 7 * 3600_000).toISOString(), acknowledged: true },
                    ]}
                    columns={[
                      { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                      { key: "t", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
                      { key: "src", header: t("table.source"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
                      { key: "ts", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.openedAt).toLocaleString()}</span> },
                    ]}
                  />
                </Section>
              </>
            ),
          },

          // ── 6. Incidents ──
          {
            value: "incidents", label: t("nav.incidents"),
            content: (
              <DataTable<Incident>
                rows={incidents}
                onRowClick={(r) => nav(`/management/incidents/${r.id}`)}
                empty={t("strategyDetail.noIncidents")}
                columns={[
                  { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                  { key: "title", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
                  { key: "st", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "resolved" ? "success" : r.status === "mitigating" ? "running" : "warning"} /> },
                  { key: "cmd", header: t("table.commander"), cell: (r) => <span className="text-mono text-xs">{r.commander ?? "—"}</span> },
                  { key: "ts", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.openedAt).toLocaleString()}</span> },
                ]}
              />
            ),
          },

          // ── 7. Artifacts ──
          {
            value: "artifacts", label: t("nav.artifacts"),
            content: (
              <DataTable<Artifact>
                rows={artifacts}
                onRowClick={(r) => nav(`/management/artifacts/${r.id}`)}
                columns={[
                  { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                  { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "kind", header: t("table.kind"), cell: (r) => <Badge variant="outline" className="text-[10px] uppercase">{r.kind}</Badge> },
                  { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
                  { key: "size", header: t("strategyDetail.size"), cell: (r) => <span className="text-mono text-xs">{r.sizeMb.toFixed(1)} MB</span> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },

          // ── 8. Evolution ──
          {
            value: "evolution", label: t("nav.evolution"),
            content: evolutions.length ? (
              <DataTable<EvolutionProgram>
                rows={evolutions}
                onRowClick={(r) => nav(`/management/evolution/${r.id}`)}
                columns={[
                  { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                  { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "gen", header: t("strategyDetail.generation"), cell: (r) => <span className="text-mono text-xs">{r.generation}</span> },
                  { key: "fit", header: t("strategyDetail.bestFitness"), cell: (r) => <span className="text-mono text-xs">{r.bestFitness.toFixed(3)}</span> },
                  { key: "prog", header: t("table.progress"), cell: (r) => <span className="text-mono text-xs">{(r.progress * 100).toFixed(0)}%</span> },
                ]}
              />
            ) : (
              <Card className="p-8 text-center">
                <div className="text-sm text-muted-foreground mb-3">{t("strategyDetail.noEvolution", { alpha: s.alpha })}</div>
                <Button size="sm" variant="outline" onClick={() => nav("/management/evolution")}>
                  {t("strategyDetail.startEvolution")} <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Card>
            ),
          },

          // ── 9. Governance ──
          {
            value: "governance", label: t("nav.governance"),
            content: (
              <DataTable<ApprovalRequest>
                rows={approvals}
                onRowClick={(r) => nav(`/management/governance/${r.id}`)}
                columns={[
                  { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                  { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
                  { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                  { key: "req", header: t("table.requester"), cell: (r) => <span className="text-mono text-xs">{r.requester}</span> },
                ]}
                empty={t("strategyDetail.noGovernance")}
              />
            ),
          },

          // ── 10. Lineage ──
          {
            value: "lineage", label: t("section.lineage"),
            content: (() => {
              const nodes: LineageNode[] = [
                { id: "alpha_src", label: s.alpha, type: "Alpha", state: "deployed", risk: "low" },
                { id: s.capitalPoolId, label: s.capitalPoolId, type: "CapitalPool", state: "deployed", risk: "medium" },
                { id: s.id, label: s.name, type: "Strategy", state: s.state, risk: s.risk, highlight: true },
                ...s.personaIds.map((p) => ({ id: p, label: p, type: "Persona", state: "deployed", risk: "low" as const })),
                { id: `dp_${s.id}`, label: `${s.id} → live`, type: "Deployment", state: "deployed", risk: s.risk },
              ];
              const edges: LineageEdge[] = [
                { from: "alpha_src", to: s.id, label: "alpha" },
                { from: s.capitalPoolId, to: s.id, label: "capital" },
                ...s.personaIds.map((p) => ({ from: p, to: s.id, label: "persona" })),
                { from: s.id, to: `dp_${s.id}`, label: "deploys" },
              ];
              return (
                <LineageGraph nodes={nodes} edges={edges} onSelect={(n) => useInspector.getState().open({
                  id: n.id, type: n.type, name: n.label, state: n.state, risk: n.risk,
                })} />
              );
            })(),
          },

          // ── 11. Audit ──
          {
            value: "audit", label: t("nav.audit"),
            content: <AuditTimeline entries={audit} />,
          },
        ]}
      />

      {activeTr && (
        <HighRiskConfirm
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          operation={activeTr.action}
          target={{ type: "Strategy", id: s.id, name: s.name }}
          currentState={machineState}
          newState={activeTr.to}
          risk={activeTr.risk ?? "medium"}
          riskImpact={activeTr.requiresApproval ? "Requires approval before commit." : undefined}
          requiredApproval={activeTr.requiresApproval ? ["risk", "ops"] : undefined}
          rollbackTarget={activeTr.uiPattern === "rollback_modal" ? `${s.id}@previous` : undefined}
          affected={{ strategies: [s.id], capitalPools: [s.capitalPoolId], personas: s.personaIds }}
          destructive={activeTr.uiPattern === "destructive_modal"}
          onConfirm={async (memo) => {
            await bff.mutations.runAction({
              kind: "Strategy", id: s.id, action: activeTr.action,
              newState: ["paused", "deployed", "approved", "review", "draft", "retired"].includes(activeTr.to)
                ? activeTr.to : undefined,
              memo,
            });
            const fresh = await bff.strategies.get(s.id);
            if (fresh) setS(fresh);
            const a = await bff.audit.list();
            setAudit(a.filter((x) => x.target === s.id));
            toast.success(`${activeTr.action} requested · memo: ${memo.slice(0, 40)}…`);
          }}
        />
      )}
    </>
  );
};
