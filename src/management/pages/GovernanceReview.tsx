import { bffV1 } from "@/lib/bff-v1";
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
import { bffWrites } from "@/lib/bff-v1/writes";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";
import type { ApprovalRequest, AuditEvent } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { usePermissions } from "@/lib/usePermissions";
import { Field } from "./ObjectDetailLayout";
import { toast } from "sonner";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { ApprovalStagesStepper } from "@/platform/components/LifecycleStepper";
import { StageDecisionPanel } from "@/platform/components/StageDecisionPanel";
import { BffError } from "@/lib/bff-v1/errors";
import { PolicyValidatorPanel } from "@/management/components/governance/PolicyValidatorPanel";
import { safeDateTime } from "@/lib/utils";

type Decision = "approve" | "reject";

export const GovernanceReview = () => {
  const t = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const perms = usePermissions();
  const [req, setReq] = useState<ApprovalRequest | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);

  const reload = () => bffV1.approvals.get(id).then((r) => setReq(r ?? null));

  useEffect(() => {
    Promise.all([bffV1.approvals.get(id), bffV1.audit.list()])
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
    let receipt;
    try {
      receipt = await bffWrites.decideApproval(req.id, d, memo, { expectedVersion: req.version });
    } catch (err) {
      if (err instanceof BffError && err.status === 409) {
        const fresh = await reload().then(() => true, () => false);
        toast.error(fresh
          ? t("governance.conflict", { defaultValue: "Approval changed on the owner; review the refreshed state and decide again." })
          : t("governance.conflictReadbackFailed", { defaultValue: "Approval changed on the owner and could not be refreshed. Reload before deciding again." }));
        return;
      }
      // The modal resets on close; Retry re-sends this exact attempt (same memo/version => same key).
      toast.error(err instanceof Error ? err.message : String(err), {
        action: { label: t("actions.retry", { defaultValue: "Retry" }), onClick: () => void apply(d, memo) },
      });
      return;
    }
    try {
      await reload();
      toast.success(`${t("governance.voteSubmitted", { defaultValue: "Vote submitted" })} - ${req.subject}${memo ? ` · ${memo.slice(0, 40)}` : ""}`, {
        description: commandReceiptDescription(receipt, { fallback: `Approval ${req.id} · ${d}` }),
      });
    } catch {
      toast.warning(t("governance.readbackFailed", { defaultValue: "Vote submitted, but the owner state could not be read back. Reload to confirm." }));
    }
  };

  return (
    <>
      <PageHeader
        title={req.subject}
        subtitle={`${req.id} · ${req.kind}${req.version !== undefined ? ` · v${req.version}` : ""}`}
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
            <Field label={t("governance.caseId", { defaultValue: "Case ID" })} value={req.id} mono />
            <Field label={t("governance.version", { defaultValue: "Version" })} value={req.version !== undefined ? `v${req.version}` : t("governance.unavailable", { defaultValue: "Unavailable" })} mono />
            <Field label={t("governance.canonicalState", { defaultValue: "Canonical State" })} value={req.state ?? t("governance.unavailable", { defaultValue: "Unavailable" })} mono />
            <Field label={t("governance.targetId", { defaultValue: "Target ID" })} value={!req.targetConflict && typeof req.targetId === "string" && req.targetId.trim() ? req.targetId : t("governance.unavailable", { defaultValue: "Unavailable" })} mono />
            <Field label={t("governance.targetVersion", { defaultValue: "Target Version" })} value={!req.targetConflict && typeof req.targetVersion === "string" && req.targetVersion.trim() ? req.targetVersion : t("governance.unavailable", { defaultValue: "Unavailable" })} mono />
            <Field label={t("governance.kind")} value={req.kind} mono />
            <Field label={t("governance.requester")} value={req.requester} mono />
            <Field label={t("governance.created")} value={safeDateTime(req.createdAt)} mono />
            {req.stages && req.stages.length > 0 ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("governance.stages")}</div>
                <StageDecisionPanel
                  stages={req.stages}
                  i18nPrefix="lifecycle.approval"
                  disabled
                  onDecide={() => undefined}
                />
              </div>
            ) : req.requiresStages && (
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
              <div className="text-sm text-muted-foreground">{t("governance.evidenceNotProvided", { defaultValue: "Not provided" })}</div>
            </Card>
            <PolicyValidatorPanel approvalId={req.id} />
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
                <PermissionAwareButton requiredAction="reject" variant="destructive" className="w-full" onClick={() => setDecision("reject")}>
                  {t("governance.decision.reject")}
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
          risk={req.riskLevel}
          requiredApproval={req.requiresStages}
          destructive={decision === "reject"}
          confirmToken={req.riskLevel === "critical" ? decision?.toUpperCase() : undefined}
          onConfirm={(memo) => decision ? apply(decision, memo) : undefined}
        />
      </PageBody>
    </>
  );
};
