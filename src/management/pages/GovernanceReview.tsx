// Governance Review — Spec Part 3 §17.
// Layout: left summary / center evidence + validator results / right decision panel /
// bottom audit timeline. Decisions require a memo (HighRiskConfirm enforces it).
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { bff } from "@/lib/bff/client";
import type { ApprovalRequest, AuditEvent } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { usePermissions } from "@/lib/usePermissions";
import { Field } from "./ObjectDetailLayout";
import { toast } from "sonner";

type Decision = "approve" | "reject" | "request_changes" | "escalate" | "freeze";

export const GovernanceReview = () => {
  const t = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const perms = usePermissions();
  const [req, setReq] = useState<ApprovalRequest | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);

  useEffect(() => {
    Promise.all([bff.approvals.get(id), bff.audit.list()])
      .then(([r, a]) => { setReq(r ?? null); setAudit(a); });
  }, [id]);

  const linkedAudit = useMemo(
    () => audit.filter((e) => e.target.includes(id) || (req && e.target.includes(req.subject.split(" ")[0]))).slice(0, 8),
    [audit, id, req],
  );

  if (!req) {
    return (
      <>
        <PageHeader title={t("governance.notFound")} />
        <PageBody>
          <Card className="p-6 text-sm text-muted-foreground">{t("governance.notFoundHint")}</Card>
        </PageBody>
      </>
    );
  }

  const apply = async (d: Decision, memo: string) => {
    const mapState: Record<Decision, ApprovalRequest["state"]> = {
      approve: "approved", reject: "rejected", request_changes: "pending", escalate: "pending", freeze: "pending",
    };
    if (d === "approve") await bff.mutations.approve(req.id, memo);
    else if (d === "reject") await bff.mutations.reject(req.id, memo);
    else await bff.mutations.runAction({ kind: "Approval", id: req.id, action: d, memo });
    setReq({ ...req, state: mapState[d] });
    toast.success(`${t(`governance.decision.${d}`)} — ${req.subject}${memo ? ` · ${memo.slice(0, 40)}` : ""}`);
  };

  // Mock evidence + validator results — in real BFF these come from /bff/approvals/:id/evidence
  const evidence = [
    { kind: "backtest", label: "Q1 backtest report", status: "success" as const },
    { kind: "policy", label: "Risk policy diff", status: "warning" as const },
    { kind: "eval", label: "Evaluation suite — pass 92/100", status: "success" as const },
  ];

  return (
    <>
      <PageHeader
        title={req.subject}
        subtitle={`${req.id} · ${req.kind}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/management/approvals")}>{t("common.back")}</Button>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left — Request Summary */}
          <Card className="p-4 lg:col-span-3 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("governance.summary")}</div>
            <div className="flex items-center gap-2">
              <RiskBadge level={req.riskLevel} />
              <StatusBadge state={req.state} />
            </div>
            <Field label={t("governance.kind")} value={req.kind} mono />
            <Field label={t("governance.requester")} value={req.requester} mono />
            <Field label={t("governance.created")} value={new Date(req.createdAt).toLocaleString()} mono />
            {req.requiresStages && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("governance.stages")}</div>
                <ol className="space-y-1">
                  {req.requiresStages.map((s, i) => (
                    <li key={s} className="flex items-center gap-2 text-xs">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-mono ${i === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                      <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Card>

          {/* Center — Evidence / Validator results */}
          <div className="lg:col-span-6 space-y-4">
            {req.rationale && (
              <Card className="p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("governance.rationale")}</div>
                <p className="text-sm leading-relaxed">{req.rationale}</p>
              </Card>
            )}
            {req.diffSummary && (
              <Card className="p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("governance.diff")}</div>
                <code className="block whitespace-pre-wrap text-mono text-xs bg-muted/40 p-3 rounded">{req.diffSummary}</code>
              </Card>
            )}
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("governance.evidence")}</div>
              <ul className="divide-y divide-border">
                {evidence.map((e) => (
                  <li key={e.kind} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{e.label}</div>
                      <div className="text-mono text-xs text-muted-foreground">{e.kind}</div>
                    </div>
                    <StatusBadge state={e.status} />
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Right — Decision Panel */}
          <Card className="p-4 lg:col-span-3 space-y-3 self-start">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("governance.decision.title")}</div>
            {req.state !== "pending" ? (
              <div className="text-sm text-muted-foreground">{t("governance.alreadyDecided", { state: req.state })}</div>
            ) : (
              <div className="space-y-2">
                {perms.can("approve") && (
                  <Button className="w-full" onClick={() => setDecision("approve")}>{t("governance.decision.approve")}</Button>
                )}
                {perms.can("reject") && (
                  <Button variant="outline" className="w-full" onClick={() => setDecision("request_changes")}>{t("governance.decision.request_changes")}</Button>
                )}
                {perms.can("reject") && (
                  <Button variant="destructive" className="w-full" onClick={() => setDecision("reject")}>{t("governance.decision.reject")}</Button>
                )}
                <Button variant="ghost" className="w-full" onClick={() => setDecision("escalate")}>{t("governance.decision.escalate")}</Button>
                {perms.can("freeze") && (
                  <Button variant="ghost" className="w-full" onClick={() => setDecision("freeze")}>{t("governance.decision.freeze")}</Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("governance.memoRequired")}</p>
          </Card>
        </div>

        {/* Bottom — Audit Timeline */}
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("governance.auditTimeline")}</div>
          <ol className="space-y-2">
            <li className="flex gap-3 text-sm">
              <span className="text-mono text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleString()}</span>
              <span className="text-mono text-xs text-accent">{req.requester}</span>
              <span>requested {req.kind}</span>
            </li>
            {linkedAudit.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="text-mono text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                <span className="text-mono text-xs text-accent">{e.actor}</span>
                <span className="text-mono text-xs">{e.action}</span>
                <span className="text-xs text-muted-foreground">→ {e.target}</span>
              </li>
            ))}
          </ol>
        </Card>

        <HighRiskConfirm
          open={decision !== null}
          onOpenChange={(o) => !o && setDecision(null)}
          operation={decision ? `governance.${decision}` : undefined}
          target={{ type: "Approval", id: req.id, name: req.subject }}
          currentState={req.state}
          newState={
            decision === "approve" ? "approved" :
            decision === "reject" ? "rejected" : req.state
          }
          risk={req.riskLevel}
          requiredApproval={req.requiresStages}
          destructive={decision === "reject" || decision === "freeze"}
          confirmToken={req.riskLevel === "critical" ? decision?.toUpperCase() : undefined}
          onConfirm={(memo) => { if (decision) apply(decision, memo); }}
        />
      </PageBody>
    </>
  );
};
