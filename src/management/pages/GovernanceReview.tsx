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
import { runActionSafe } from "@/lib/bff/runAction";
import type { ApprovalRequest, AuditEvent } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { usePermissions } from "@/lib/usePermissions";
import { Field } from "./ObjectDetailLayout";
import { toast } from "sonner";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { ApprovalStagesStepper } from "@/platform/components/LifecycleStepper";

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
    await bff.mutations.decideApproval(req.id, d, memo);
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
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("governance.stages")}</div>
                <ApprovalStagesStepper
                  stages={req.requiresStages}
                  currentIndex={req.state === "approved" ? req.requiresStages.length : req.state === "rejected" ? -1 : 0}
                  i18nPrefix="lifecycle.approval"
                />
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
                <PermissionAwareButton requiredAction="approve" className="w-full" onClick={() => setDecision("approve")}>
                  {t("governance.decision.approve")}
                </PermissionAwareButton>
                <PermissionAwareButton requiredAction="reject" variant="outline" className="w-full" onClick={() => setDecision("request_changes")}>
                  {t("governance.decision.request_changes")}
                </PermissionAwareButton>
                <PermissionAwareButton requiredAction="reject" variant="destructive" className="w-full" onClick={() => setDecision("reject")}>
                  {t("governance.decision.reject")}
                </PermissionAwareButton>
                <Button variant="ghost" className="w-full" onClick={() => setDecision("escalate")}>{t("governance.decision.escalate")}</Button>
                <PermissionAwareButton requiredAction="freeze" variant="ghost" className="w-full" onClick={() => setDecision("freeze")}>
                  {t("governance.decision.freeze")}
                </PermissionAwareButton>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("governance.memoRequired")}</p>
          </Card>
        </div>

        {/* Bottom — Audit Timeline */}
        <AuditTimeline
          title={t("governance.auditTimeline")}
          entries={[
            { ts: req.createdAt, actor: req.requester, action: `request.${req.kind}`, target: req.id },
            ...linkedAudit.map((e) => ({
              id: e.id, ts: e.ts, actor: e.actor, action: e.action, target: e.target, memo: e.memo,
            })),
          ]}
        />

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
