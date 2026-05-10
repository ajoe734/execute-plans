// Governance Queue — Spec Part 3 §9.6.
// Phase 17 — adds batch approve/reject + per-row stage progress preview.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { bff } from "@/lib/bff-v1";
import type { ApprovalRequest } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { SlaCountdown } from "@/platform/components/SlaCountdown";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";
import { QUORUM_POLICIES, type QuorumRiskClass } from "@/lib/v4/reviewerQuorum";

function quorumProgressFor(r: ApprovalRequest) {
  const stages = r.stages ?? [];
  const approved = stages.filter((s) => s.state === "approved").length;
  const riskClass: QuorumRiskClass =
    r.riskLevel === "critical" ? "critical"
    : r.riskLevel === "high" ? "high"
    : r.riskLevel === "medium" ? "medium" : "low";
  const policy = QUORUM_POLICIES[riskClass];
  return { approved, min: policy.minReviewers, distinctFamily: policy.distinctRoleFamily };
}

export const GovernanceQueuePage = () => {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDecision, setBatchDecision] = useState<"approve" | "reject" | null>(null);

  const reload = () => bff.approvals.list().then(setRows);
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(
    () => filter === "all" ? rows : rows.filter((r) => r.state === "pending"),
    [rows, filter],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedIds = useMemo(
    () => Array.from(selected).filter((id) => filtered.some((r) => r.id === id && r.state === "pending")),
    [selected, filtered],
  );

  return (
    <>
      <PageHeader
        title={t("nav.governance")}
        subtitle={t("governance.queueSubtitle")}
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground">
                  {t("governance.batch.selected", { defaultValue: "{{n}} selected", n: selectedIds.length })}
                </span>
                <Button size="sm" onClick={() => setBatchDecision("approve")}>
                  {t("governance.batch.approve", { defaultValue: "Batch approve" })}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBatchDecision("reject")}>
                  {t("governance.batch.reject", { defaultValue: "Batch reject" })}
                </Button>
              </>
            )}
            <div className="flex gap-1">
              <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>{t("filter.pending")}</Button>
              <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>{t("filter.all")}</Button>
            </div>
          </div>
        }
      />
      <PageBody>
        <Card>
          <DataTable
            rows={filtered}
            onRowClick={(r) => nav(`/management/governance/${r.id}`)}
            columns={[
              {
                key: "sel",
                header: "",
                cell: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(r.id)}
                      disabled={r.state !== "pending"}
                      onCheckedChange={() => toggle(r.id)}
                      aria-label={`select ${r.id}`}
                    />
                  </div>
                ),
              },
              { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
              { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
              { key: "req", header: t("table.requester"), cell: (r) => <span className="text-mono text-xs">{r.requester}</span> },
              { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
              { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
              { key: "stages", header: t("section.approvalStages"), cell: (r) => {
                const list = r.stages ?? (r.requiresStages ?? []).map((n) => ({ name: n, state: "pending" as const, slaHours: 0 }));
                return (
                  <div className="flex flex-wrap gap-1">
                    {list.map((s, i) => (
                      <span
                        key={`${s.name}-${i}`}
                        className={
                          "text-mono text-[10px] px-1.5 py-0.5 rounded border " +
                          (s.state === "approved" ? "bg-status-success/15 text-status-success border-status-success/40"
                            : s.state === "rejected" ? "bg-status-error/15 text-status-error border-status-error/40"
                            : s.state === "pending" ? "bg-muted text-foreground border-border"
                            : "bg-muted text-muted-foreground border-border")
                        }
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                );
              }},
              { key: "sla", header: t("approval.sla.label", { defaultValue: "SLA" }), cell: (r) => {
                const cur = r.stages?.find((s) => s.state === "pending");
                if (!cur) return <span className="text-mono text-xs text-muted-foreground">—</span>;
                return <SlaCountdown startedAt={cur.startedAt} slaHours={cur.slaHours} escalated={cur.escalated} />;
              }},
              { key: "quorum", header: t("approval.quorum.label", { defaultValue: "Quorum" }), cell: (r) => {
                const q = quorumProgressFor(r);
                const reached = q.approved >= q.min;
                return (
                  <div className="flex items-center gap-1">
                    <span className={`text-mono text-xs ${reached ? "text-status-success" : "text-muted-foreground"}`}>
                      {q.approved}/{q.min}
                    </span>
                    {q.distinctFamily && (
                      <span className="text-[10px] px-1 py-0.5 rounded border border-border text-muted-foreground" title="distinct role family required">
                        2-fam
                      </span>
                    )}
                  </div>
                );
              }},
              { key: "created", header: t("table.created"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span> },
            ]}
          />
        </Card>

        <HighRiskConfirm
          open={batchDecision !== null}
          onOpenChange={(o) => !o && setBatchDecision(null)}
          operation={batchDecision ? `governance.batch.${batchDecision}` : undefined}
          target={{ type: "Approval", id: "batch", name: `${selectedIds.length} request(s)` }}
          currentState="pending"
          newState={batchDecision === "approve" ? "approved" : "rejected"}
          risk={selectedIds.some((id) => rows.find((r) => r.id === id)?.riskLevel === "critical") ? "critical" : "high"}
          destructive={batchDecision === "reject"}
          onConfirm={async (memo) => {
            if (!batchDecision) return;
            const r = await bff.mutations.batchDecideApproval(selectedIds, batchDecision, memo);
            toast.success(t("governance.batch.done", { defaultValue: "{{n}} request(s) processed", n: r.results.length }));
            setSelected(new Set());
            await reload();
          }}
        />
      </PageBody>
    </>
  );
};
