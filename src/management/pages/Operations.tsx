import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { bff } from "@/lib/bff/client";
import type { Job, Alert, Incident, ApprovalRequest, AuditEvent } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Button } from "@/components/ui/button";

export const JobsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Job[]>([]);
  useEffect(() => { bff.jobs.list().then(setRows); }, []);
  return (
    <>
      <PageHeader title={t("nav.jobs")} />
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

export const AlertsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Alert[]>([]);
  useEffect(() => { bff.alerts.list().then(setRows); }, []);
  return (
    <>
      <PageHeader title={t("nav.alerts")} />
      <PageBody>
        <DataTable rows={rows} columns={[
          { key: "sev", header: "Severity", cell: (r) => <RiskBadge level={r.severity} /> },
          { key: "title", header: "Title", cell: (r) => r.title },
          { key: "src", header: "Source", cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
          { key: "ack", header: "Acknowledged", cell: (r) => r.acknowledged ? "✓" : "—" },
          { key: "act", header: "", cell: () => <Button size="sm" variant="outline">Acknowledge</Button> },
        ]} />
      </PageBody>
    </>
  );
};

export const IncidentsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Incident[]>([]);
  useEffect(() => { bff.incidents.list().then(setRows); }, []);
  return (
    <>
      <PageHeader title={t("nav.incidents")} />
      <PageBody>
        <DataTable rows={rows} columns={[
          { key: "sev", header: "Severity", cell: (r) => <RiskBadge level={r.severity} /> },
          { key: "title", header: "Title", cell: (r) => r.title },
          { key: "status", header: "Status", cell: (r) => <StatusBadge state={r.status === "resolved" ? "success" : "running"} /> },
        ]} />
      </PageBody>
    </>
  );
};

export const ApprovalsPage = () => {
  const t = useT();
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  useEffect(() => { bff.approvals.list().then(setRows); }, []);
  return (
    <>
      <PageHeader title={t("nav.approvals")} />
      <PageBody>
        <DataTable rows={rows} columns={[
          { key: "kind", header: "Kind", cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
          { key: "subject", header: "Subject", cell: (r) => r.subject },
          { key: "req", header: "Requester", cell: (r) => r.requester },
          { key: "risk", header: "Risk", cell: (r) => <RiskBadge level={r.riskLevel} /> },
          { key: "state", header: "State", cell: (r) => <StatusBadge state={r.state} /> },
          { key: "act", header: "", cell: () => (
            <div className="flex gap-1">
              <Button size="sm" variant="outline">{t("actions.approve")}</Button>
              <Button size="sm" variant="ghost">{t("actions.reject")}</Button>
            </div>
          )},
        ]} />
      </PageBody>
    </>
  );
};

export const AuditPage = () => {
  const t = useT();
  const [rows, setRows] = useState<AuditEvent[]>([]);
  useEffect(() => { bff.audit.list().then(setRows); }, []);
  return (
    <>
      <PageHeader title={t("nav.audit")} />
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
