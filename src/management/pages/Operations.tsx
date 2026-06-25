import { useEffect, useMemo, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { lists } from "@/lib/bff-v1";
import { mutations } from "@/lib/bff/mutations";
import type { Job, Alert, Incident, ApprovalRequest, AuditEvent } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Field } from "./ObjectDetailLayout";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { X } from "lucide-react";

const loadListItems = <T,>(loader: () => Promise<{ items: T[] }>) =>
  loader().then((envelope) => envelope.items);

export const JobsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Job[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  useEffect(() => { loadListItems<Job>(lists.jobs).then(setRows); }, []);
  useEffect(() => {
    import("@/lib/bff/realtime").then(({ realtime }) => {
      const off = realtime.on("job", (p) => {
        const e = p as { jobId: string; kind: string; status: Job["status"]; owner: string; ts: string };
        setRows((rs) => [{ id: e.jobId, kind: e.kind, status: e.status, owner: e.owner, startedAt: e.ts }, ...rs].slice(0, 50));
        setLiveCount((c) => c + 1);
      });
      return off;
    });
  }, []);
  return (
    <>
      <PageHeader title={t("nav.jobs")} subtitle={t("page.jobsSubtitle", { count: liveCount })} />
      <PageBody>
        <DataTable rows={rows} columns={[
          { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
          { key: "kind", header: t("table.kind"), cell: (r) => r.kind },
          { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status} /> },
          { key: "owner", header: t("table.owner"), cell: (r) => r.owner },
          { key: "started", header: t("table.started"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.startedAt)}</span> },
        ]} />
      </PageBody>
    </>
  );
};

export const AlertsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Alert[]>([]);
  const [active, setActive] = useState<Alert | null>(null);
  useEffect(() => { loadListItems<Alert>(lists.alerts).then(setRows); }, []);
  useEffect(() => {
    import("@/lib/bff/realtime").then(({ realtime }) => {
      const off = realtime.on("alert", (p) => {
        setRows((rs) => [p as Alert, ...rs]);
      });
      return off;
    });
  }, []);

  const ack = async (id: string) => {
    await mutations.acknowledgeAlert(id);
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, acknowledged: true } : r));
    setActive((a) => a && a.id === id ? { ...a, acknowledged: true } : a);
    toast.success(t("toast.alertAcknowledged", { id }));
  };

  return (
    <>
      <PageHeader title={t("nav.alerts")} subtitle={t("page.alertsSubtitle")} />
      <PageBody>
        <DataTable rows={rows} onRowClick={(r) => setActive(r)} columns={[
          { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
          { key: "title", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
          { key: "src", header: t("table.source"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
          { key: "opened", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.openedAt)}</span> },
          { key: "ack", header: t("table.status"), cell: (r) => r.acknowledged ? <span className="text-status-success text-xs">✓ {t("table_actions.acknowledged")}</span> : <span className="text-status-warning text-xs">{t("table_actions.open")}</span> },
          { key: "act", header: "", cell: (r) => !r.acknowledged && (
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); ack(r.id); }}>{t("table_actions.acknowledge")}</Button>
          )},
        ]} />
      </PageBody>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          {active && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-2"><RiskBadge level={active.severity} /><span className="text-mono text-xs text-muted-foreground">{active.id}</span></div>
                <SheetTitle>{active.title}</SheetTitle>
                <SheetDescription>{active.description ?? t("empty.noDescription")}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Card className="p-4 grid grid-cols-2 gap-4">
                  <Field label={t("table.source")} value={active.source} mono />
                  <Field label={t("table.related")} value={active.relatedTarget ?? "—"} mono />
                  <Field label={t("table.metric")} value={active.metric ?? "—"} mono />
                  <Field label={t("table.threshold")} value={active.threshold ?? "—"} mono />
                  <Field label={t("table.observed")} value={active.observed ?? "—"} mono />
                  <Field label={t("table.opened")} value={safeDateTime(active.openedAt)} mono />
                </Card>
                {active.suggestedAction && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("section.suggestedAction")}</div>
                    <div className="text-sm">{active.suggestedAction}</div>
                  </Card>
                )}
                <div className="flex gap-2">
                  {!active.acknowledged && <Button onClick={() => ack(active.id)}>{t("table_actions.acknowledge")}</Button>}
                  <Button variant="outline" onClick={() => toast(t("table_actions.incidentEscalateQueued"))}>{t("table_actions.escalateIncident")}</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export const IncidentsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Incident[]>([]);
  const [active, setActive] = useState<Incident | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  useEffect(() => { loadListItems<Incident>(lists.incidents).then(setRows); }, []);

  const advance = async (id: string, status: Incident["status"], memo?: string) => {
    await mutations.setIncidentStatus(id, status, memo);
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, status } : r));
    setActive((a) => a && a.id === id ? { ...a, status } : a);
    toast.success(t("toast.incidentAdvanced", { id, status }));
  };

  return (
    <>
      <PageHeader title={t("nav.incidents")} subtitle={t("page.incidentsSubtitle")} />
      <PageBody>
        <DataTable rows={rows} onRowClick={(r) => setActive(r)} columns={[
          { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
          { key: "title", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
          { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "resolved" ? "success" : r.status === "mitigating" ? "running" : "warning"} /> },
          { key: "opened", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.openedAt)}</span> },
        ]} />
      </PageBody>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px]">
          {active && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-2">
                  <RiskBadge level={active.severity} />
                  <StatusBadge state={active.status === "resolved" ? "success" : active.status === "mitigating" ? "running" : "warning"} />
                  <span className="text-mono text-xs text-muted-foreground">{active.id}</span>
                </div>
                <SheetTitle>{active.title}</SheetTitle>
                <SheetDescription>{active.description ?? ""}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Card className="p-4 grid grid-cols-2 gap-4">
                  <Field label={t("table.commander")} value={active.commander ?? "—"} mono />
                  <Field label={t("table.affected")} value={active.affected?.join(", ") ?? "—"} mono />
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("section.timeline")}</div>
                  <ol className="space-y-2">
                    {(active.timeline ?? []).map((e, i) => (
                      <li key={i} className="text-sm flex gap-3">
                        <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{safeDateTime(e.ts, "time")}</span>
                        <span className="text-mono text-xs text-accent">{e.actor}</span>
                        <span>{e.note}</span>
                      </li>
                    ))}
                    {(!active.timeline || active.timeline.length === 0) && <li className="text-xs text-muted-foreground">{t("empty.noEvents")}</li>}
                  </ol>
                </Card>
                <div className="flex gap-2">
                  {active.status === "open" && <Button onClick={() => advance(active.id, "mitigating")}>{t("table_actions.startMitigation")}</Button>}
                  {active.status !== "resolved" && <Button variant="destructive" onClick={() => setResolveOpen(true)}>{t("table_actions.resolve")}</Button>}
                </div>
              </div>

              <HighRiskConfirm
                open={resolveOpen}
                onOpenChange={setResolveOpen}
                title={t("confirmDialog.resolveIncident", { title: active.title })}
                description={t("confirmDialog.resolveIncidentDesc")}
                confirmToken="RESOLVE"
                onConfirm={() => { advance(active.id, "resolved"); }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export const ApprovalsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [active, setActive] = useState<ApprovalRequest | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  useEffect(() => { loadListItems<ApprovalRequest>(lists.approvals).then(setRows); }, []);

  const filtered = useMemo(() => filter === "all" ? rows : rows.filter((r) => r.state === "pending"), [rows, filter]);

  const decide = async (id: string, state: ApprovalRequest["state"], memo?: string) => {
    if (state === "approved") await mutations.approve(id, memo);
    else if (state === "rejected") await mutations.reject(id, memo);
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, state } : r));
    setActive((a) => a && a.id === id ? { ...a, state } : a);
    toast.success(t("toast.approvalDecided", { id, state }));
  };

  return (
    <>
      <PageHeader
        title={t("nav.approvals")}
        subtitle={t("page.approvalsSubtitle")}
        actions={
          <div className="flex gap-1">
            <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>{t("filter.pending")}</Button>
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>{t("filter.all")}</Button>
          </div>
        }
      />
      <PageBody>
        <DataTable rows={filtered} onRowClick={(r) => setActive(r)} columns={[
          { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
          { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
          { key: "req", header: t("table.requester"), cell: (r) => <span className="text-mono text-xs">{r.requester}</span> },
          { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
          { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
          { key: "created", header: t("table.created"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.createdAt)}</span> },
        ]} />
      </PageBody>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px]">
          {active && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-2">
                  <RiskBadge level={active.riskLevel} />
                  <StatusBadge state={active.state} />
                  <span className="text-mono text-xs text-muted-foreground">{active.id}</span>
                </div>
                <SheetTitle>{active.subject}</SheetTitle>
                <SheetDescription className="text-mono text-xs">{active.kind}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Card className="p-4 grid grid-cols-2 gap-4">
                  <Field label={t("table.requester")} value={active.requester} mono />
                  <Field label={t("table.created")} value={safeDateTime(active.createdAt)} mono />
                </Card>
                {active.rationale && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("section.rationale")}</div>
                    <div className="text-sm leading-relaxed">{active.rationale}</div>
                  </Card>
                )}
                {active.diffSummary && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("section.changeSummary")}</div>
                    <code className="text-mono text-xs block whitespace-pre-wrap">{active.diffSummary}</code>
                  </Card>
                )}
                {active.requiresStages && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("section.approvalStages")}</div>
                    <div className="flex flex-wrap gap-2">
                      {active.requiresStages.map((s) => (
                        <span key={s} className="text-mono text-xs px-2 py-1 rounded bg-muted">{s}</span>
                      ))}
                    </div>
                  </Card>
                )}
                {active.state === "pending" && (
                  <div className="flex gap-2">
                    <Button onClick={() => setApproveOpen(true)}>{t("actions.approve")}</Button>
                    <Button variant="outline" onClick={() => setRejectOpen(true)}>{t("actions.reject")}</Button>
                  </div>
                )}
              </div>

              <HighRiskConfirm
                open={approveOpen}
                onOpenChange={setApproveOpen}
                title={t("confirmDialog.approveTitle", { subject: active.subject })}
                description={t("confirmDialog.approveDesc", { kind: active.kind })}
                confirmToken="APPROVE"
                onConfirm={() => decide(active.id, "approved")}
              />
              <HighRiskConfirm
                open={rejectOpen}
                onOpenChange={setRejectOpen}
                title={t("confirmDialog.rejectTitle", { subject: active.subject })}
                description={t("confirmDialog.rejectDesc")}
                confirmToken="REJECT"
                destructive
                onConfirm={() => decide(active.id, "rejected")}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export const AuditPage = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const target = params.get("target") ?? "";
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [actor, setActor] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [outcome, setOutcome] = useState<string>("all");
  useEffect(() => { loadListItems<AuditEvent>(lists.audit).then(setRows); }, []);
  useEffect(() => {
    import("@/lib/bff/realtime").then(({ realtime }) => {
      const off = realtime.on("audit", (p) => {
        setRows((rs) => [p as AuditEvent, ...rs].slice(0, 200));
      });
      return off;
    });
  }, []);

  const actors = useMemo(() => Array.from(new Set(rows.map((r) => r.actor))).sort(), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((r) =>
    (actor === "all" || r.actor === actor) &&
    (action === "all" || r.action === action) &&
    (outcome === "all" || (r.outcome ?? "ok") === outcome) &&
    (!target || r.target === target),
  ), [rows, actor, action, outcome, target]);

  const reset = () => { setActor("all"); setAction("all"); setOutcome("all"); };
  const clearTarget = () => { const p = new URLSearchParams(params); p.delete("target"); setParams(p, { replace: true }); };
  const hasFilter = actor !== "all" || action !== "all" || outcome !== "all";

  return (
    <>
      <PageHeader title={t("nav.audit")} subtitle={t("page.auditSubtitle")} />
      <PageBody>
        {target && (
          <Card className="p-3 flex flex-wrap items-center gap-2 border-accent/40 bg-accent/5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("audit.targetFilter")}</span>
            <span className="text-mono text-sm text-accent">{target}</span>
            <span className="text-mono text-xs text-muted-foreground ml-2">{filtered.length} / {rows.length}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={clearTarget}>
              <X className="h-3 w-3 mr-1" />{t("audit.clearTargetFilter")}
            </Button>
          </Card>
        )}
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
            {t("audit.filterTitle")}
          </span>
          <select value={actor} onChange={(e) => setActor(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="all">{t("audit.allActors")}</option>
            {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-mono">
            <option value="all">{t("audit.allActions")}</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="all">{t("audit.allOutcomes")}</option>
            <option value="ok">{t("audit.outcomeOk")}</option>
            <option value="rejected">{t("audit.outcomeRejected")}</option>
          </select>
          <span className="text-mono text-xs text-muted-foreground ml-auto">
            {filtered.length} / {rows.length}
          </span>
          {hasFilter && (
            <Button size="sm" variant="ghost" onClick={reset}>{t("qa.reset")}</Button>
          )}
        </Card>
        {target ? (
          <AuditTimeline entries={filtered} title={target} />
        ) : (
          <DataTable rows={filtered} columns={[
            { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs">{safeDateTime(r.ts)}</span> },
            { key: "actor", header: t("table.actor"), cell: (r) => r.actor },
            { key: "action", header: t("table.action"), cell: (r) => <span className="text-mono text-xs">{r.action}</span> },
            { key: "tgt", header: t("table.target"), cell: (r) => <span className="text-mono text-xs">{r.target}</span> },
            { key: "outcome", header: t("audit.outcome"), cell: (r) => (
              <span className={`text-mono text-[10px] uppercase ${r.outcome === "rejected" ? "text-destructive" : "text-muted-foreground"}`}>
                {r.outcome ?? "ok"}
              </span>
            ) },
          ]} />
        )}
      </PageBody>
    </>
  );
};
