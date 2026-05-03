import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Strategy, Job, AuditEvent, ApprovalRequest } from "@/lib/bff/types";
import { Rocket, Pause, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { usePermissions } from "@/lib/usePermissions";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { useInspector } from "@/platform/components/RightDrawer";
import { Inbox } from "lucide-react";

export const StrategyDetail = () => {
  const { id } = useParams();
  const t = useT();
  const { can, allowed } = usePermissions();
  const [s, setS] = useState<Strategy | undefined>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [action, setAction] = useState<{ kind: string; token: string; destructive?: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    bff.strategies.get(id).then(setS);
    bff.jobs.list().then(setJobs);
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id)));
    bff.approvals.list().then((a) => setApprovals(a.filter((x) => x.subject.includes(id))));
  }, [id]);

  if (!s) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  const trigger = (kind: string, token: string, destructive = false) => {
    setAction({ kind, token, destructive });
    setConfirmOpen(true);
  };

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
            {(() => {
              const acts = new Set(allowed(s.availableActions));
              return (
                <>
                  {acts.has("pause") && can("pause") && (
                    <Button size="sm" variant="outline" onClick={() => trigger("pause", "PAUSE")}>
                      <Pause className="h-4 w-4 mr-1" />{t("actions.suspend")}
                    </Button>
                  )}
                  {acts.has("rollback") && can("rollback") && (
                    <Button size="sm" variant="outline" onClick={() => trigger("rollback", "ROLLBACK", true)}>
                      <RotateCcw className="h-4 w-4 mr-1" />{t("actions.rollback")}
                    </Button>
                  )}
                  {acts.has("promote_live") && can("promote_live") && (
                    <Button size="sm" onClick={() => trigger("promote", "PROMOTE-LIVE", true)}>
                      <Rocket className="h-4 w-4 mr-1" />{t("actions.promoteLive")}
                    </Button>
                  )}
                </>
              );
            })()}
          </>
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Alpha" value={s.alpha} mono />
                  <Field label="Capital Pool" value={s.capitalPoolId} mono />
                  <Field label="Personas" value={s.personaIds.join(", ")} mono />
                  <Field label="Updated" value={new Date(s.updatedAt).toLocaleString()} mono />
                </div>
              </Section>
            ),
          },
          {
            value: "performance", label: "Performance",
            content: (
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="PnL 30d" value={`${(s.pnl30d * 100).toFixed(2)}%`} tone={s.pnl30d >= 0 ? "success" : "danger"} />
                <StatCard label="Sharpe" value={s.sharpe.toFixed(2)} />
                <StatCard label="Max Drawdown" value={`${(s.drawdown * 100).toFixed(2)}%`} tone="warning" />
              </div>
            ),
          },
          {
            value: "lineage", label: "Lineage",
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
            value: "risk", label: "Risk",
            content: <Placeholder text="Risk dashboards & limits will appear here." />,
          },
          {
            value: "runtime", label: "Runtime",
            content: (
              <DataTable rows={jobs.slice(0, 5)} columns={[
                { key: "id", header: "Job ID", cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                { key: "kind", header: "Kind", cell: (r) => r.kind },
                { key: "status", header: "Status", cell: (r) => <StatusBadge state={r.status} /> },
                { key: "started", header: "Started", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</span> },
              ]} empty="No recent jobs" />
            ),
          },
          {
            value: "approvals", label: "Approvals",
            content: (
              <DataTable rows={approvals} columns={[
                { key: "kind", header: "Kind", cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                { key: "subject", header: "Subject", cell: (r) => r.subject },
                { key: "state", header: "State", cell: (r) => <StatusBadge state={r.state} /> },
              ]} empty="No approvals on this strategy" />
            ),
          },
          {
            value: "audit", label: "Audit",
            content: (
              <DataTable rows={audit} columns={[
                { key: "ts", header: "Time", cell: (r) => <span className="text-mono text-xs">{new Date(r.ts).toLocaleString()}</span> },
                { key: "actor", header: "Actor", cell: (r) => r.actor },
                { key: "action", header: "Action", cell: (r) => <span className="text-mono text-xs">{r.action}</span> },
              ]} empty="No audit events" />
            ),
          },
        ]}
      />

      {action && (
        <HighRiskConfirm
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`${action.kind.toUpperCase()} — ${s.name}`}
          description={`This will ${action.kind} the strategy. The action will be recorded in the audit trail.`}
          confirmToken={action.token}
          destructive={action.destructive}
          onConfirm={() => { toast.success(`${action.kind} requested`); }}
        />
      )}
    </>
  );
};
