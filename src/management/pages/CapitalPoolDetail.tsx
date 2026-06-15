import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff-v1";
import { runActionSafe } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { ApprovalRequest, AuditEvent, CapitalPool, Rebalance, Strategy } from "@/lib/bff/types";
import { Edit, ShieldAlert } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatCard } from "@/platform/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { toast } from "sonner";
import { MandatePanel } from "../components/detail/MandatePanel";
import { RiskBudgetPanel } from "../components/detail/RiskBudgetPanel";
import { BindingsMatrix } from "../components/detail/BindingsMatrix";
import { AllocationLimitsManager } from "../components/detail/AllocationLimitsManager";
import { FreezeUnfreezePanel } from "../components/detail/FreezeUnfreezePanel";
import { AllocationSimulationPanel } from "../components/detail/AllocationSimulationPanel";
import { assessBreach } from "@/lib/v4/capitalBreach";
import { lifecycleOf } from "@/lib/v4/strategyTripleDerive";
import { findMetric } from "@/lib/v4/metricRegistry";
import { Badge } from "@/components/ui/badge";

export const CapitalPoolDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [c, setC] = useState<CapitalPool | undefined>();
  const [strats, setStrats] = useState<Strategy[]>([]);
  const [rebalances, setRebalances] = useState<Rebalance[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.capitalPools.get(id).then(setC);
    bff.strategies.list().then((all) => setStrats(all.filter((s) => s.capitalPoolId === id)));
    bff.rebalances.list().then((all) => setRebalances(all.filter((r) => r.targetPoolId === id)));
    bff.approvals.list().then((all) => setApprovals(all.filter((a) => a.subject.includes(id) || a.kind.includes("capital"))));
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action?.startsWith("capital.") || x.action?.startsWith("rebalance."))));
  }, [id]);

  if (!c) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const utilizationPct = (c.utilized / c.allocated) * 100;
  const firstRebalance = rebalances[0];

  // Lineage: pool ↔ rebalance ↔ strategy
  const lineageNodes: LineageNode[] = [
    { id: c.id, label: c.name, type: "CapitalPool", state: c.state, risk: c.risk, highlight: true },
    ...rebalances.map((r) => ({ id: r.id, label: r.name, type: "Rebalance", state: r.state, risk: r.risk })),
    ...strats.map((s) => ({ id: s.id, label: s.name, type: "Strategy", state: lifecycleOf(s), risk: s.risk })),
  ];
  const lineageEdges: LineageEdge[] = [
    ...rebalances.map((r) => ({ from: c.id, to: r.id, label: "rebalance" })),
    ...strats.map((s) => ({ from: c.id, to: s.id, label: "binds" })),
  ];

  return (
    <>
      <ObjectDetailLayout
        object={c}
        subtitle={`${c.currency} · ${c.id}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />{t("actions.edit")}</Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              <ShieldAlert className="h-4 w-4 mr-1" />Adjust Risk Budget
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (() => {
              const breach = assessBreach({
                utilized: c.utilized,
                allocated: c.allocated,
                currentDrawdownPct: strats.length ? Math.min(...strats.map((s) => s.drawdown)) : undefined,
                riskBudgetPct: c.riskBudget,
              });
              const utilMetric = findMetric("capital_utilization_pct");
              const rbuMetric = findMetric("risk_budget_usage_pct");
              const breachToneCls: Record<string, string> = {
                ok: "bg-status-success/15 text-status-success border-status-success/30",
                warn: "bg-status-warning/15 text-status-warning border-status-warning/30",
                high: "bg-status-warning/15 text-status-warning border-status-warning/30",
                critical: "bg-status-failed/15 text-status-failed border-status-failed/30",
              };
              return (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <StatCard label={t("section.holdings")} value={`${c.currency} ${(c.allocated ?? 0).toLocaleString()}`} />
                    <StatCard
                      label={utilMetric ? `Capital utilization (%)` : t("table.utilization")}
                      value={`${(breach.utilizationPct * 100).toFixed(utilMetric?.precision ?? 2)}%`}
                      hint={`${c.currency} ${(c.utilized ?? 0).toLocaleString()}`}
                    />
                    <StatCard label={t("section.limits")} value={`${(c.riskBudget * 100).toFixed(2)}%`} tone="warning" />
                  </div>
                  <Section title={t("detail.section.breachAssessment")}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="outline" className={breachToneCls[breach.level]}>{breach.level.toUpperCase()}</Badge>
                      {breach.riskBudgetUsagePct != null && rbuMetric && (
                        <span className="text-xs text-muted-foreground text-mono">
                          {rbuMetric.id}={(breach.riskBudgetUsagePct * 100).toFixed(rbuMetric.precision)}%
                        </span>
                      )}
                      {breach.reasons.length > 0 && (
                        <span className="text-xs text-muted-foreground">· {breach.reasons.join(", ")}</span>
                      )}
                    </div>
                    <Progress value={breach.utilizationPct * 100} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground text-mono">
                      <span>0</span>
                      <span>{(c.allocated ?? 0).toLocaleString()}</span>
                    </div>
                  </Section>
                </>
              );
            })(),
          },
          {
            value: "strategies", label: t("nav.strategies"),
            content: (
              <DataTable
                rows={strats}
                onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
                columns={[
                  { key: "name", header: t("nav.strategies"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
                  { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${r.pnl30d >= 0 ? "text-status-success" : "text-status-failed"}`}>{(r.pnl30d * 100).toFixed(2)}%</span> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },
          { value: "mandate", label: t("phase13.capital.tabs.mandate"), content: <MandatePanel pool={c} /> },
          { value: "riskBudget", label: t("phase13.capital.tabs.riskBudget"), content: <RiskBudgetPanel pool={c} /> },
          { value: "bindings", label: t("phase13.capital.tabs.bindings"), content: <BindingsMatrix strategies={strats} poolId={c.id} /> },
          { value: "limits", label: t("phase13.capital.tabs.limits"), content: <AllocationLimitsManager poolId={c.id} /> },
          { value: "freeze", label: t("phase13.capital.tabs.freeze"), content: <FreezeUnfreezePanel poolId={c.id} /> },

          // ── v3 §13 — Performance ──
          {
            value: "performance", label: t("section.performance", { defaultValue: "Performance" }),
            content: (
              <Section title={t("section.performance", { defaultValue: "Performance" })}>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label="PnL 30d" value={`${(strats.reduce((a, s) => a + s.pnl30d, 0) * 100).toFixed(2)}%`} tone="success" />
                  <StatCard label={t("table.sharpe")} value={(strats.reduce((a, s) => a + s.sharpe, 0) / Math.max(1, strats.length)).toFixed(2)} />
                  <StatCard label={t("table.drawdown")} value={`${(Math.min(...strats.map((s) => s.drawdown), 0) * 100).toFixed(2)}%`} tone="warning" />
                </div>
              </Section>
            ),
          },

          // ── v3 §13 — Ranking Inputs ──
          {
            value: "rankingInputs", label: t("capital.rankingInputs", { defaultValue: "Ranking Inputs" }),
            content: (
              <DataTable
                rows={strats.map((s) => ({ id: s.id, name: s.name, sharpe: s.sharpe, dd: s.drawdown, pnl: s.pnl30d }))}
                columns={[
                  { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{r.sharpe.toFixed(2)}</span> },
                  { key: "dd", header: t("table.drawdown"), cell: (r) => <span className="text-mono text-xs">{(r.dd * 100).toFixed(2)}%</span> },
                  { key: "pnl", header: "PnL 30d", cell: (r) => <span className="text-mono text-xs">{(r.pnl * 100).toFixed(2)}%</span> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },
          {
            value: "simulation", label: t("phase13.capital.tabs.simulation"),
            content: firstRebalance ? <AllocationSimulationPanel rebalance={firstRebalance} /> : <Section><div className="text-sm text-muted-foreground">{t("empty.none")}</div></Section>,
          },
          {
            value: "lineage", label: t("phase13.capital.tabs.lineage"),
            content: (
              <Section title={t("phase13.capital.tabs.lineage")}>
                <p className="text-xs text-muted-foreground mb-2">{t("phase13.capital.lineage.hint")}</p>
                <LineageGraph nodes={lineageNodes} edges={lineageEdges} onSelect={(n) => navigate(`/management/${n.type === "Rebalance" ? "rebalance" : n.type === "Strategy" ? "strategies" : "capital-pools"}/${n.id}`)} />
              </Section>
            ),
          },
          {
            value: "risk", label: "Risk",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="VaR (mock)" value={`${c.currency} ${((c.allocated ?? 0) * (c.riskBudget ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} mono />
                  <Field label={t("section.limits")} value={`${(c.riskBudget * 100).toFixed(2)}%`} mono />
                  <Field label={t("table.capacity")} value={`${(100 - utilizationPct).toFixed(1)}%`} mono />
                  <Field label={t("table.value")} value={c.currency} mono />
                </div>
              </Section>
            ),
          },
          { value: "rebalance", label: t("nav.rebalance"), content: (
            <DataTable rows={rebalances} onRowClick={(r) => navigate(`/management/rebalance/${r.id}`)} columns={[
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "q", header: "Quarter", cell: (r) => <span className="text-mono text-xs">{r.quarter}</span> },
              { key: "delta", header: "Δ", cell: (r) => <span className="text-mono text-xs">{(r.proposedDelta * 100).toFixed(1)}%</span> },
              { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
            ]} empty={t("empty.none")} />
          ) },
          {
            value: "governance", label: t("phase13.capital.tabs.governance"),
            content: (
              <DataTable rows={approvals} onRowClick={(row) => navigate(`/management/governance/${row.id}`)} columns={[
                { key: "kind", header: t("table.kind"), cell: (row) => <span className="text-mono text-xs">{row.kind}</span> },
                { key: "subject", header: t("table.subject"), cell: (row) => <div className="font-medium">{row.subject}</div> },
                { key: "risk", header: t("table.risk"), cell: (row) => <RiskBadge level={row.riskLevel} /> },
                { key: "state", header: t("table.state"), cell: (row) => <StatusBadge state={row.state} /> },
              ]} empty={t("empty.none")} />
            ),
          },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Adjust Risk Budget — ${c.name}`}
        description={t("detail.confirm.changeRiskBudget")}
        actionId="capital_pool.set_risk_budget"
        confirmEntity={{ type: "pool", id: c.id }}
        target={{ type: "CapitalPool", id: c.id, name: c.name }}
        risk="high"
        destructive
        onConfirm={async (memo, token) => { await runActionSafe({ kind: "CapitalPool", id: c.id, action: "adjust_budget", memo }, { confirmToken: token }); toast.success(t("toast.actionQueued")); }}
      />
    </>
  );
};
