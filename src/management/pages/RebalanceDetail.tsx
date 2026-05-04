import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { ApprovalRequest, AuditEvent, Rebalance, CapitalPool } from "@/lib/bff/types";
import { Download } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { DataTable } from "@/platform/components/DataTable";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { rebalanceMachine, type RebalanceState } from "@/lib/stateMachines";
import { nextTransitions, type Transition } from "@/lib/stateMachines/types";
import { usePermissions } from "@/lib/usePermissions";
import { toast } from "sonner";

// Map mock BaseObject lifecycle → rebalance state machine.
const mapState = (s: string): RebalanceState => {
  const m: Record<string, RebalanceState> = {
    draft: "draft", review: "under_review", approved: "approved",
    deployed: "applied", paused: "scheduled", retired: "cancelled",
  };
  return m[s] ?? "draft";
};

export const RebalanceDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [r, setR] = useState<Rebalance | undefined>();
  const [pool, setPool] = useState<CapitalPool | undefined>();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [activeTr, setActiveTr] = useState<Transition<RebalanceState> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [machineState, setMachineState] = useState<RebalanceState>("draft");

  useEffect(() => {
    if (!id) return;
    bff.rebalances.get(id).then((rb) => {
      setR(rb);
      if (rb) {
        setMachineState(mapState(rb.state));
        bff.capitalPools.get(rb.targetPoolId).then(setPool);
      }
    });
    bff.approvals.list().then((all) => setApprovals(all.filter((a) => a.subject.includes(id) || a.kind.includes("rebalance"))));
    bff.audit.list().then((all) => setAudit(all.filter((a) => a.target === id || a.action.startsWith("rebalance."))));
  }, [id]);

  const transitions = useMemo(
    () => r ? nextTransitions(rebalanceMachine, machineState).filter((tr) => can(tr.action)) : [],
    [machineState, can, r],
  );

  if (!r) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const lines = r.lines ?? [];

  return (
    <>
      <ObjectDetailLayout
        object={r}
        subtitle={`${r.quarter} · target ${r.targetPoolId}`}
        actions={
          <>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
            {transitions.length === 0 && (
              <span className="text-xs text-muted-foreground">{t("rebalance.noAction")}</span>
            )}
            {transitions.map((tr) => (
              <Button
                key={tr.action}
                size="sm"
                variant={tr.risk === "critical" || tr.risk === "high" ? "default" : "outline"}
                onClick={() => { setActiveTr(tr); setConfirmOpen(true); }}
              >
                {tr.action} → {t(`lifecycle.rebalance.${tr.to}`, { defaultValue: tr.to })}
              </Button>
            ))}
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <Section>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("lifecycle.title")}</div>
                  <LifecycleStepper machine={rebalanceMachine} current={machineState} i18nPrefix="lifecycle.rebalance" />
                </Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("nav.capitalPools")} value={pool ? pool.name : r.targetPoolId} />
                  <StatCard label="Proposed Δ" value={`${(r.proposedDelta * 100).toFixed(1)}%`} tone="warning" />
                  <StatCard label={t("table.sharpe")} value={r.expectedSharpe?.toFixed(2) ?? "—"} tone="success" />
                  <StatCard label={t("table.drawdown")} value={r.expectedDrawdown != null ? `${(r.expectedDrawdown * 100).toFixed(1)}%` : "—"} tone="danger" />
                </div>
                {r.notes && (
                  <Section title={t("section.notes")}>
                    <p className="text-sm leading-relaxed">{r.notes}</p>
                  </Section>
                )}
              </>
            ),
          },
          {
            value: "lines", label: t("section.holdings"),
            content: (
              <DataTable
                rows={lines.map((l) => ({ ...l, id: l.strategyId }))}
                onRowClick={(row) => navigate(`/management/strategies/${row.strategyId}`)}
                columns={[
                  { key: "strat", header: t("nav.strategies"), cell: (row) => <div className="font-medium">{row.strategyName}</div> },
                  { key: "cur", header: t("section.overview"), cell: (row) => <span className="text-mono text-xs">{(row.currentWeight * 100).toFixed(1)}%</span> },
                  { key: "prop", header: t("section.changeSummary"), cell: (row) => <span className="text-mono text-xs">{(row.proposedWeight * 100).toFixed(1)}%</span> },
                  { key: "delta", header: "Δ", cell: (row) => <span className={`text-mono text-xs ${row.delta >= 0 ? "text-status-success" : "text-status-failed"}`}>{row.delta >= 0 ? "+" : ""}{(row.delta * 100).toFixed(1)}%</span> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },
          {
            value: "risk", label: t("table.risk"),
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label={t("table.risk")} value={pool ? `${pool.currency} ${(pool.allocated * pool.riskBudget).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} mono />
                  <Field label={t("table.utilization")} value="OK" mono />
                  <Field label={t("table.utilization")} value="Pass" mono />
                  <Field label="Stress (−20%)" value={`${(r.expectedDrawdown! * 100 * 1.5).toFixed(1)}%`} mono />
                </div>
              </Section>
            ),
          },
          {
            value: "simulation", label: t("section.simulation", { defaultValue: "Simulation" }),
            content: (
              <Section title="Backtest preview">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("table.sharpe")} value={r.expectedSharpe?.toFixed(2) ?? "—"} tone="success" />
                  <StatCard label={t("table.drawdown")} value={r.expectedDrawdown != null ? `${(r.expectedDrawdown * 100).toFixed(1)}%` : "—"} tone="warning" />
                  <StatCard label="Turnover" value={`${(Math.abs(r.proposedDelta) * 100).toFixed(1)}%`} />
                  <StatCard label="Lines" value={lines.length} />
                </div>
              </Section>
            ),
          },
          { value: "approvals", label: t("nav.approvals"), content: (
            <DataTable rows={approvals} onRowClick={(row) => navigate(`/management/governance/${row.id}`)} columns={[
              { key: "kind", header: t("table.kind"), cell: (row) => <span className="text-mono text-xs">{row.kind}</span> },
              { key: "subject", header: t("table.subject"), cell: (row) => <div className="font-medium">{row.subject}</div> },
              { key: "risk", header: t("table.risk"), cell: (row) => <RiskBadge level={row.riskLevel} /> },
              { key: "state", header: t("table.state"), cell: (row) => <StatusBadge state={row.state} /> },
            ]} empty={t("empty.none")} />
          ) },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      {activeTr && (
        <HighRiskConfirm
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          operation={activeTr.action}
          target={{ type: "Rebalance", id: r.id, name: r.name }}
          currentState={machineState}
          newState={activeTr.to}
          risk={activeTr.risk ?? "medium"}
          riskImpact={activeTr.requiresApproval ? t("rebalance.confirmDesc", { name: r.name, from: machineState, to: activeTr.to }) : undefined}
          requiredApproval={activeTr.requiresApproval ? ["risk", "ops"] : undefined}
          rollbackTarget={activeTr.uiPattern === "rollback_modal" ? `${r.id}@previous` : undefined}
          affected={{ capitalPools: [r.targetPoolId], strategies: lines.map((l) => l.strategyId) }}
          destructive={activeTr.uiPattern === "destructive_modal"}
          confirmToken={activeTr.risk === "critical" ? activeTr.action.toUpperCase() : undefined}
          onConfirm={async (memo) => {
            await bff.mutations.runAction({ kind: "Rebalance", id: r.id, action: activeTr.action, memo });
            setMachineState(activeTr.to);
            toast.success(`${activeTr.action} · ${memo.slice(0, 40)}`);
          }}
        />
      )}
    </>
  );
};
