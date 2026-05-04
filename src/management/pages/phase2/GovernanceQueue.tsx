// Governance Queue — Spec Part 3 §9.6.
// Split from Approvals: list of pending governance reviews, click to open GovernanceReview.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import type { ApprovalRequest } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

export const GovernanceQueuePage = () => {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  useEffect(() => { bff.approvals.list().then(setRows); }, []);

  const filtered = useMemo(() => filter === "all" ? rows : rows.filter((r) => r.state === "pending"), [rows, filter]);

  return (
    <>
      <PageHeader
        title={t("nav.governance")}
        subtitle={t("governance.queueSubtitle")}
        actions={
          <div className="flex gap-1">
            <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>{t("filter.pending")}</Button>
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>{t("filter.all")}</Button>
          </div>
        }
      />
      <PageBody>
        <Card>
          <DataTable
            rows={filtered}
            onRowClick={(r) => nav(`/management/governance/${r.id}`)}
            columns={[
              { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
              { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
              { key: "req", header: t("table.requester"), cell: (r) => <span className="text-mono text-xs">{r.requester}</span> },
              { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
              { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
              { key: "stages", header: t("section.approvalStages"), cell: (r) => (
                <div className="flex flex-wrap gap-1">{(r.requiresStages ?? []).map((s) => <span key={s} className="text-mono text-[10px] px-1.5 py-0.5 rounded bg-muted">{s}</span>)}</div>
              )},
              { key: "created", header: t("table.created"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span> },
            ]}
          />
        </Card>
      </PageBody>
    </>
  );
};
