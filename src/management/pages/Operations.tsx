import { useEffect, useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { bff } from "@/lib/bff/client";
import type { Job, Alert, Incident, ApprovalRequest, AuditEvent } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Field } from "./ObjectDetailLayout";

export const JobsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Job[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  useEffect(() => { bff.jobs.list().then(setRows); }, []);
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
      <PageHeader title={t("nav.jobs")} subtitle={`Live stream — ${liveCount} new event(s) since page load.`} />
      <PageBody>
        <DataTable rows={rows} columns={[
          { key: "id", header: "ID", cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
          { key: "kind", header: "Kind", cell: (r) => r.kind },
          { key: "status", header: "Status", cell: (r) => <StatusBadge state={r.status} /> },
          { key: "owner", header: "Owner", cell: (r) => r.owner },
          { key: "started", header: "Started", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</span> },
        ]} />
      </PageBody>
    </>
  );
};

// ─────────── Alerts ───────────

export const AlertsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Alert[]>([]);
  const [active, setActive] = useState<Alert | null>(null);
  useEffect(() => { bff.alerts.list().then(setRows); }, []);
  useEffect(() => {
    import("@/lib/bff/realtime").then(({ realtime }) => {
      const off = realtime.on("alert", (p) => {
        setRows((rs) => [p as Alert, ...rs]);
      });
      return off;
    });
  }, []);

  const ack = (id: string) => {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, acknowledged: true } : r));
    setActive((a) => a && a.id === id ? { ...a, acknowledged: true } : a);
    toast.success(`Alert ${id} acknowledged`);
  };

  return (
    <>
      <PageHeader title={t("nav.alerts")} subtitle="Real-time risk and runtime alerts. Acknowledge to claim ownership; escalate to incident if mitigation requires coordination." />
      <PageBody>
        <DataTable rows={rows} onRowClick={(r) => setActive(r)} columns={[
          { key: "sev", header: "Severity", cell: (r) => <RiskBadge level={r.severity} /> },
          { key: "title", header: "Title", cell: (r) => <div className="font-medium">{r.title}</div> },
          { key: "src", header: "Source", cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
          { key: "opened", header: "Opened", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.openedAt).toLocaleString()}</span> },
          { key: "ack", header: "Status", cell: (r) => r.acknowledged ? <span className="text-status-success text-xs">✓ Acknowledged</span> : <span className="text-status-warning text-xs">Open</span> },
          { key: "act", header: "", cell: (r) => !r.acknowledged && (
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); ack(r.id); }}>Acknowledge</Button>
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
                <SheetDescription>{active.description ?? "No additional description."}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Card className="p-4 grid grid-cols-2 gap-4">
                  <Field label="Source" value={active.source} mono />
                  <Field label="Related" value={active.relatedTarget ?? "—"} mono />
                  <Field label="Metric" value={active.metric ?? "—"} mono />
                  <Field label="Threshold" value={active.threshold ?? "—"} mono />
                  <Field label="Observed" value={active.observed ?? "—"} mono />
                  <Field label="Opened" value={new Date(active.openedAt).toLocaleString()} mono />
                </Card>
                {active.suggestedAction && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Suggested Action</div>
                    <div className="text-sm">{active.suggestedAction}</div>
                  </Card>
                )}
                <div className="flex gap-2">
                  {!active.acknowledged && <Button onClick={() => ack(active.id)}>Acknowledge</Button>}
                  <Button variant="outline" onClick={() => toast("Incident escalation queued")}>Escalate to Incident</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

// ─────────── Incidents ───────────

export const IncidentsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Incident[]>([]);
  const [active, setActive] = useState<Incident | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  useEffect(() => { bff.incidents.list().then(setRows); }, []);

  const advance = (id: string, status: Incident["status"]) => {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, status } : r));
    setActive((a) => a && a.id === id ? { ...a, status } : a);
    toast.success(`Incident ${id} → ${status}`);
  };

  return (
    <>
      <PageHeader title={t("nav.incidents")} subtitle="Coordinated mitigation for production-impacting events. Each incident has a commander and timeline." />
      <PageBody>
        <DataTable rows={rows} onRowClick={(r) => setActive(r)} columns={[
          { key: "sev", header: "Severity", cell: (r) => <RiskBadge level={r.severity} /> },
          { key: "title", header: "Title", cell: (r) => <div className="font-medium">{r.title}</div> },
          { key: "status", header: "Status", cell: (r) => <StatusBadge state={r.status === "resolved" ? "success" : r.status === "mitigating" ? "running" : "warning"} /> },
          { key: "opened", header: "Opened", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.openedAt).toLocaleString()}</span> },
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
                  <Field label="Commander" value={active.commander ?? "—"} mono />
                  <Field label="Affected" value={active.affected?.join(", ") ?? "—"} mono />
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Timeline</div>
                  <ol className="space-y-2">
                    {(active.timeline ?? []).map((e, i) => (
                      <li key={i} className="text-sm flex gap-3">
                        <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{new Date(e.ts).toLocaleTimeString()}</span>
                        <span className="text-mono text-xs text-accent">{e.actor}</span>
                        <span>{e.note}</span>
                      </li>
                    ))}
                    {(!active.timeline || active.timeline.length === 0) && <li className="text-xs text-muted-foreground">No events yet.</li>}
                  </ol>
                </Card>
                <div className="flex gap-2">
                  {active.status === "open" && <Button onClick={() => advance(active.id, "mitigating")}>Start Mitigation</Button>}
                  {active.status !== "resolved" && <Button variant="destructive" onClick={() => setResolveOpen(true)}>Resolve</Button>}
                </div>
              </div>

              <HighRiskConfirm
                open={resolveOpen}
                onOpenChange={setResolveOpen}
                title={`Resolve incident — ${active.title}`}
                description="Mark this incident as resolved. A post-mortem task will be filed automatically."
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

// ─────────── Approvals ───────────

export const ApprovalsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [active, setActive] = useState<ApprovalRequest | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  useEffect(() => { bff.approvals.list().then(setRows); }, []);

  const filtered = useMemo(() => filter === "all" ? rows : rows.filter((r) => r.state === "pending"), [rows, filter]);

  const decide = (id: string, state: ApprovalRequest["state"]) => {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, state } : r));
    setActive((a) => a && a.id === id ? { ...a, state } : a);
    toast.success(`Approval ${id} → ${state}`);
  };

  return (
    <>
      <PageHeader
        title={t("nav.approvals")}
        subtitle="Multi-stage governance inbox. High-risk actions require typed confirmation."
        actions={
          <div className="flex gap-1">
            <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>Pending</Button>
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>{t("common.all")}</Button>
          </div>
        }
      />
      <PageBody>
        <DataTable rows={filtered} onRowClick={(r) => setActive(r)} columns={[
          { key: "kind", header: "Kind", cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
          { key: "subject", header: "Subject", cell: (r) => <div className="font-medium">{r.subject}</div> },
          { key: "req", header: "Requester", cell: (r) => <span className="text-mono text-xs">{r.requester}</span> },
          { key: "risk", header: "Risk", cell: (r) => <RiskBadge level={r.riskLevel} /> },
          { key: "state", header: "State", cell: (r) => <StatusBadge state={r.state} /> },
          { key: "created", header: "Created", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span> },
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
                  <Field label="Requester" value={active.requester} mono />
                  <Field label="Created" value={new Date(active.createdAt).toLocaleString()} mono />
                </Card>
                {active.rationale && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Rationale</div>
                    <div className="text-sm leading-relaxed">{active.rationale}</div>
                  </Card>
                )}
                {active.diffSummary && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Change Summary</div>
                    <code className="text-mono text-xs block whitespace-pre-wrap">{active.diffSummary}</code>
                  </Card>
                )}
                {active.requiresStages && (
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Approval Stages</div>
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
                title={`Approve — ${active.subject}`}
                description={`Approve this ${active.kind} request. This advances to the next stage in the governance workflow.`}
                confirmToken="APPROVE"
                onConfirm={() => decide(active.id, "approved")}
              />
              <HighRiskConfirm
                open={rejectOpen}
                onOpenChange={setRejectOpen}
                title={`Reject — ${active.subject}`}
                description="Reject this request. The requester will be notified and the workflow halts."
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

// ─────────── Audit ───────────

export const AuditPage = () => {
  const t = useT();
  const [rows, setRows] = useState<AuditEvent[]>([]);
  useEffect(() => { bff.audit.list().then(setRows); }, []);
  return (
    <>
      <PageHeader title={t("nav.audit")} subtitle="Tamper-evident log of every action taken across the platform." />
      <PageBody>
        <DataTable rows={rows} columns={[
          { key: "ts", header: "Time", cell: (r) => <span className="text-mono text-xs">{new Date(r.ts).toLocaleString()}</span> },
          { key: "actor", header: "Actor", cell: (r) => r.actor },
          { key: "action", header: "Action", cell: (r) => <span className="text-mono text-xs">{r.action}</span> },
          { key: "tgt", header: "Target", cell: (r) => <span className="text-mono text-xs">{r.target}</span> },
        ]} />
      </PageBody>
    </>
  );
};
