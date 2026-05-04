import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Strategy, Job, AuditEvent, ApprovalRequest } from "@/lib/bff/types";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
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
  const { can } = usePermissions();
  const [s, setS] = useState<Strategy | undefined>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTr, setActiveTr] = useState<Transition<StrategyState> | null>(null);

  useEffect(() => {
    if (!id) return;
    bff.strategies.get(id).then(setS);
    bff.jobs.list().then(setJobs);
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id)));
    bff.approvals.list().then((a) => setApprovals(a.filter((x) => x.subject.includes(id))));
  }, [id]);

  // Strategy machine state derived from current state — falls back to "live" demo fixture
  // until seed.ts is migrated to the strategy-specific lifecycle (Phase 15).
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
          {
            value: "overview", label: t("section.overview"),
            content: (
              <Section>
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("lifecycle.title")}</div>
                  <LifecycleStepper machine={strategyMachine} current={machineState} i18nPrefix="lifecycle.strategy" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Alpha" value={s.alpha} mono />
                  <Field label={t("nav.capitalPools")} value={s.capitalPoolId} mono />
                  <Field label={t("nav.personas")} value={s.personaIds.join(", ")} mono />
                  <Field label={t("table.updated")} value={new Date(s.updatedAt).toLocaleString()} mono />
                </div>
              </Section>
            ),
          },
          {
            value: "performance", label: t("section.performance"),
            content: (
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="PnL 30d" value={`${(s.pnl30d * 100).toFixed(2)}%`} tone={s.pnl30d >= 0 ? "success" : "danger"} />
                <StatCard label={t("table.sharpe")} value={s.sharpe.toFixed(2)} />
                <StatCard label={t("table.drawdown")} value={`${(s.drawdown * 100).toFixed(2)}%`} tone="warning" />
              </div>
            ),
          },
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
          {
            value: "risk", label: t("table.risk"),
            content: <Placeholder text={t("empty.none")} />,
          },
          {
            value: "runtime", label: t("nav.runtimes"),
            content: (
              <DataTable rows={jobs.slice(0, 5)} columns={[
                { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                { key: "kind", header: t("table.kind"), cell: (r) => r.kind },
                { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status} /> },
                { key: "started", header: t("table.started"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</span> },
              ]} empty={t("empty.noResults")} />
            ),
          },
          {
            value: "approvals", label: t("nav.approvals"),
            content: (
              <DataTable rows={approvals} columns={[
                { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                { key: "subject", header: t("table.subject"), cell: (r) => r.subject },
                { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
              ]} empty={t("empty.noResults")} />
            ),
          },
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
            // refresh local state + audit
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
