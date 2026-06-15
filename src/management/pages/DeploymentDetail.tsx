import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Rocket, Undo2, TrendingDown, CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { mutations } from "@/lib/bff/mutations";
import { toast } from "sonner";
import { bff } from "@/lib/bff-v1";
import { runActionSafe } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { ApprovalRequest, AuditEvent, Deployment, Runtime } from "@/lib/bff/types";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { DeploymentStagesPanel } from "@/management/components/detail/DeploymentStagesPanel";

const targetTone = (t: Deployment["target"]) =>
  t === "live" ? "danger" : t === "paper" ? "warning" : "default";

export const DeploymentDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [d, setD] = useState<Deployment | undefined>();
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [reduceOpen, setReduceOpen] = useState(false);
  const [newPct, setNewPct] = useState(50);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(() => new Date(Date.now() + 86400_000).toISOString().slice(0, 16));

  useEffect(() => {
    if (!id) return;
    bff.deployments.get(id).then(setD);
    bff.runtimes.list().then(setRuntimes);
    bff.approvals.list().then(setApprovals);
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action.startsWith("deployment."))));
  }, [id]);
  if (!d) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  const isLive = d.target === "live";

  return (
    <>
      <ObjectDetailLayout
        object={d}
        subtitle={`${(d.target ?? "").toUpperCase()} · ${d.version ?? ""}`}
        actions={
          <>
            {!isLive && (
              <Button size="sm" onClick={() => setPromoteOpen(true)}>
                <Rocket className="h-4 w-4 mr-1" />{t("actions.promoteLive")}
              </Button>
            )}
            {isLive && (
              <Button size="sm" variant="outline" onClick={() => setReduceOpen(true)}>
                <TrendingDown className="h-4 w-4 mr-1" />{t("deployment.reduceAllocation.action")}
              </Button>
            )}
            {!isLive && (
              <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
                <CalendarClock className="h-4 w-4 mr-1" />{t("deployment.schedule.action")}
              </Button>
            )}
            {d.rollbackAvailable && (
              <Button size="sm" variant="outline" onClick={() => setRollbackOpen(true)}>
                <Undo2 className="h-4 w-4 mr-1" />{t("actions.rollback")}
              </Button>
            )}
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("table.target")} value={(d.target ?? "—").toUpperCase()} tone={targetTone(d.target ?? "")} />
                  <StatCard label={t("table.version")} value={d.version} />
                  <StatCard label="Previous" value={d.previousVersion ?? "—"} />
                  <StatCard label="Promoted" value={d.promotedAt ? new Date(d.promotedAt).toLocaleString() : "—"} />
                </div>
                <Section title={t("detail.section.linkedObjects")}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Field label="Strategy" value={
                      d.strategyId
                        ? <button className="text-accent hover:underline text-mono" onClick={() => navigate(`/management/strategies/${d.strategyId}`)}>{d.strategyId}</button>
                        : "—"
                    } />
                    <Field label="Artifact" value={
                      <button className="text-accent hover:underline text-mono" onClick={() => navigate(`/management/artifacts/${d.artifactId}`)}>{d.artifactId}</button>
                    } />
                    <Field label={t("table.owner")} value={d.owner} mono />
                  </div>
                </Section>
              </>
            ),
          },
          { value: "stages", label: t("deployment.tab.stages"), content: <DeploymentStagesPanel deployment={d} /> },
          { value: "runtime", label: t("nav.runtimes"), content: (() => {
            const filtered = runtimes.filter((r) => r.env === d.target && r.kind === "executor");
            return (
              <DataTable rows={filtered} columns={[
                { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium text-mono text-xs">{r.name}</div> },
                { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status} /> },
                { key: "cpu", header: "CPU", cell: (r) => <span className="text-mono text-xs">{(r.cpu * 100).toFixed(0)}%</span> },
                { key: "mem", header: "MEM", cell: (r) => <span className="text-mono text-xs">{(r.memory * 100).toFixed(0)}%</span> },
                { key: "p95", header: "p95", cell: (r) => <span className="text-mono text-xs">{r.latencyP95Ms}ms</span> },
                { key: "uptime", header: "Uptime", cell: (r) => <span className="text-mono text-xs">{r.uptimePct}%</span> },
              ]} empty={t("empty.noResults")} />
            );
          })() },
          { value: "approvals", label: t("nav.approvals"), content: (() => {
            const filtered = approvals.filter((a) => a.subject.includes(d.version) || a.kind.includes("deploy"));
            return (
              <DataTable rows={filtered} columns={[
                { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
                { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
              ]} empty={t("empty.none")} />
            );
          })() },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        title={`Promote to Live — ${d.name}`}
        description={t("detail.confirm.promoteLive")}
        confirmToken="PROMOTE"
        destructive
        onConfirm={async (memo) => { await runActionSafe({ kind: "Deployment", id: d.id, action: "promote_live", newState: "deployed", memo }); toast.success("Promotion request submitted"); }}
      />
      <HighRiskConfirm
        open={rollbackOpen}
        onOpenChange={setRollbackOpen}
        title={`Rollback — ${d.name}`}
        description={`Rolls back to version ${d.previousVersion ?? "previous"}. Live orders will continue to flow through the previous artifact.`}
        confirmToken="ROLLBACK"
        destructive
        onConfirm={async (memo) => { await mutations.rollback("Deployment", d.id, memo); toast.success("Rollback executed"); }}
      />

      <Dialog open={reduceOpen} onOpenChange={setReduceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deployment.reduceAllocation.title", { name: d.name })}</DialogTitle>
            <DialogDescription>{t("deployment.reduceAllocation.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("deployment.reduceAllocation.current")}</span>
              <span className="text-mono">{((d as Deployment & { allocationPct?: number }).allocationPct ?? 100)}%</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("deployment.reduceAllocation.target")}</span>
                <span className="text-mono font-semibold">{newPct}%</span>
              </div>
              <Slider value={[newPct]} onValueChange={(v) => setNewPct(v[0])} min={0} max={100} step={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReduceOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={async () => {
              await mutations.reduceAllocation(d.id, newPct, `manual reduce → ${newPct}%`);
              toast.success(t("deployment.reduceAllocation.queued", { pct: newPct }));
              setReduceOpen(false);
              const fresh = await bff.deployments.get(d.id);
              if (fresh) setD(fresh);
            }}>{t("actions.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deployment.schedule.title", { name: d.name })}</DialogTitle>
            <DialogDescription>{t("deployment.schedule.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs text-muted-foreground">{t("deployment.schedule.when")}</label>
            <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={async () => {
              await mutations.scheduleDeployment(d.id, new Date(scheduleAt).toISOString(), `scheduled by user`);
              toast.success(t("deployment.schedule.toast", { when: new Date(scheduleAt).toLocaleString() }));
              setScheduleOpen(false);
            }}>{t("actions.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
