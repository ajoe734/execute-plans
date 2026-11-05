import { useCallback, useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import {
  bffV1,
  EVOLUTION_QUALIFICATION_CRITERIA,
  runActionSafe,
} from "@/lib/bff-v1";
import { normalizeEvolutionOriginKind } from "@/lib/bff-v1/evolution";
import { useLiveDetail } from "@/lib/bff-v1/useLiveDetail";
import { useT } from "@/platform/hooks";
import type {
  Alert,
  ApprovalRequest,
  AuditEvent,
  EvolutionProgram,
  EvolutionQualificationCriterionRow,
  EvolutionRun,
  ResearchExperiment,
} from "@/lib/bff-v1";
import {
  AlertTriangle,
  Inbox,
  Pause,
  Play,
  GitBranch,
  CheckCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { evolutionMachine, type EvolutionState } from "@/lib/stateMachines";
import { FitnessFormulaPanel } from "../components/detail/FitnessFormulaPanel";
import { PromotionPanel } from "../components/detail/PromotionPanel";
import { MutationRuleManager } from "../components/detail/MutationRuleManager";
import { EvolutionCandidatesTab } from "../components/detail/EvolutionCandidatesTab";
import { EvolutionFreezePanel } from "../components/detail/EvolutionFreezePanel";

const mapState = (s?: string): EvolutionState => {
  const clean = (s ?? "").trim().toLowerCase();
  const m: Record<string, EvolutionState> = {
    draft: "draft",
    under_review: "under_review",
    review: "under_review",
    active: "active",
    approved: "active",
    deployed: "active",
    paused: "paused",
    stopped: "stopped",
    completed: "completed",
    retired: "retired",
  };
  return m[clean] ?? "draft";
};

function formatCriterionValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatRunDetail(detail: unknown): string {
  if (!detail) return "—";
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") {
    const rec = detail as Record<string, unknown>;
    if (typeof rec.reason === "string" && rec.reason.trim()) {
      return rec.reason.trim();
    }
    if (typeof rec.message === "string" && rec.message.trim()) {
      return rec.message.trim();
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

export const EvolutionDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const { data: e, loading, isError, error, refresh } = useLiveDetail<EvolutionProgram>(
    id,
    (entityId) => bffV1.evolution.get(entityId),
    { kinds: ["evolution"] },
  );
  const [runs, setRuns] = useState<EvolutionRun[]>([]);
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [stopOpen, setStopOpen] = useState(false);
  const [newConstraint, setNewConstraint] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectValidationError, setRejectValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const loadAuxData = useCallback(async (programId: string) => {
    await Promise.all([
      bffV1.evolutionRuns
        .forProgram(programId)
        .then((items) => setRuns(items))
        .catch(() => {}),
      bffV1.approvals
        .list()
        .then((items) =>
          setApprovals(
            items.filter(
              (x) =>
                x.targetId === programId ||
                x.subject?.includes(programId) ||
                x.kind?.includes("evolution") ||
                Boolean(x.id),
            ),
          ),
        )
        .catch(() => {}),
      bffV1.research
        .list()
        .then(setExperiments)
        .catch(() => {}),
      bffV1.audit
        .list()
        .then((a) => setAudit(a.filter((x) => x.target === programId || x.action?.startsWith("evolution."))))
        .catch(() => {}),
      bffV1.alerts
        .list()
        .then((a) => setAlerts(a.filter((x) => x.relatedTarget === programId || x.source?.includes("evolution"))))
        .catch(() => {}),
    ]);
  }, []);

  const refreshProgram = useCallback(async () => {
    if (!id) return;
    await Promise.all([refresh(), loadAuxData(id)]);
  }, [id, refresh, loadAuxData]);

  useEffect(() => {
    if (!id) return;
    setActionError(null);
    setRejectValidationError(null);
    void loadAuxData(id);
  }, [id, loadAuxData]);

  if (loading) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  if (!e) {
    return (
      <>
        <PageHeader title={t("nav.evolution", { defaultValue: "Evolution" })} />
        <PageBody>
          <EmptyState
            icon={isError ? <AlertTriangle className="h-8 w-8 text-status-failed" /> : <Inbox className="h-8 w-8 text-muted-foreground" />}
            title={
              isError
                ? t("detail.loadState.errorTitle", { entity: "Evolution Program", defaultValue: "Could Not Load Evolution Program" })
                : t("detail.loadState.notFoundTitle", { entity: "Evolution Program", defaultValue: "Evolution Program Not Found" })
            }
            description={
              isError
                ? t("detail.loadState.errorDescription", {
                  entity: "Evolution Program",
                  id: id ?? "",
                  error: error ?? "unknown error",
                  defaultValue: `Failed to load Evolution Program detail for ID ${id ?? ""}: ${error ?? "unknown error"}`,
                })
                : t("detail.loadState.notFoundDescription", {
                  entity: "Evolution Program",
                  id: id ?? "",
                  defaultValue: `Evolution Program detail for ID ${id ?? ""} is not available in the live contract.`,
                })
            }
            cta={{ label: t("actions.back", { defaultValue: "Back to Evolution" }), onClick: () => nav("/management/evolution") }}
          />
        </PageBody>
      </>
    );
  }

  const rawState = e.status ?? e.state;
  const machineState = mapState(typeof rawState === "string" ? rawState : undefined);
  const originKind = normalizeEvolutionOriginKind(e.originKind ?? e.origin);
  const isWaitingForHumanReview = originKind === "automatic" && machineState === "under_review";
  const sourceDecisionIds = e.sourceDecisionIds ?? e.source_decision_ids ?? [];
  const isManualWithNoSourceDecisions = originKind === "manual" && sourceDecisionIds.length === 0;

  const ownerAllowedActions = new Set(
    (e.allowedActions ?? e.allowed_actions ?? []).map((act) => String(act).trim()),
  );
  const canSubmitReview = ownerAllowedActions.has("submit_evolution_review");
  const canApprove = ownerAllowedActions.has("approve_program");
  const canReject = ownerAllowedActions.has("reject_program");
  const canPause = ownerAllowedActions.has("pause_program");
  const canResume = ownerAllowedActions.has("resume_program");
  const canComplete = ownerAllowedActions.has("complete_program");
  const canRetire = ownerAllowedActions.has("retire_program");
  const canStop = ownerAllowedActions.has("stop");

  const reviewApprovalId =
    e.review?.approval_id ??
    e.review?.approvalId ??
    (typeof e.approval?.approval_id === "string"
      ? e.approval.approval_id
      : typeof e.approval?.id === "string"
        ? e.approval.id
        : null);
  const matchedApproval = approvals.find(
    (a) => (reviewApprovalId && a.id === reviewApprovalId) || a.targetId === e.id,
  );
  const boundApprovalId = reviewApprovalId ?? matchedApproval?.id ?? null;
  const boundApprovalRawState =
    (typeof e.approval?.status === "string"
      ? e.approval.status
      : typeof e.approval?.state === "string"
        ? e.approval.state
        : undefined) ??
    matchedApproval?.state ??
    (boundApprovalId ? "pending" : "missing");
  const boundApprovalState = String(boundApprovalRawState).trim().toLowerCase();
  const isGovernanceApproved = Boolean(boundApprovalId) && boundApprovalState === "approved";

  const programApprovals = approvals.filter(
    (a) =>
      (boundApprovalId && a.id === boundApprovalId) ||
      a.targetId === e.id ||
      a.subject?.includes(e.id) ||
      a.kind?.includes("evolution"),
  );

  const qualificationPolicyVersion =
    e.qualification?.policy_version ?? e.qualification?.policyVersion ?? "—";
  const qualificationCriteriaMap = new Map<string, EvolutionQualificationCriterionRow>();
  for (const row of e.qualification?.criteria ?? []) {
    if (row?.criterion) {
      qualificationCriteriaMap.set(row.criterion, row);
    }
  }
  const criterionRows: EvolutionQualificationCriterionRow[] = EVOLUTION_QUALIFICATION_CRITERIA.map(
    (criterionId) =>
      qualificationCriteriaMap.get(criterionId) ?? {
        criterion: criterionId,
        result: "not_evaluated",
        observed: null,
        threshold: null,
        reason: null,
      },
  );

  const executeOwnerAction = async (
    input: Parameters<typeof runActionSafe>[0],
    successTitle: string,
  ): Promise<boolean> => {
    setActionError(null);
    setActionPending(true);
    try {
      const receipt = await runActionSafe(input, { successTitle });
      if (!receipt.ok) {
        setActionError(receipt.error.message || t("toast.failed"));
        await refreshProgram();
        return false;
      }
      await refreshProgram();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message || t("toast.failed"));
      await refreshProgram();
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const handleResume = async () => {
    await executeOwnerAction(
      { kind: "Evolution", id: e.id, action: "resume_program", memo: "Operator resume" },
      t("evolution.resumed", { defaultValue: "Program resumed" }),
    );
  };

  const handlePause = async () => {
    await executeOwnerAction(
      { kind: "Evolution", id: e.id, action: "pause_program", memo: "Operator pause" },
      t("evolution.paused", { defaultValue: "Program paused" }),
    );
  };

  const handleSubmitReview = async () => {
    await executeOwnerAction(
      { kind: "Evolution", id: e.id, action: "submit_evolution_review", memo: "Operator submit review" },
      t("evolution.reviewSubmitted", { defaultValue: "Review submitted" }),
    );
  };

  const handleApprove = async () => {
    if (!isGovernanceApproved) return;
    await executeOwnerAction(
      { kind: "Evolution", id: e.id, action: "approve_program", memo: "Operator approve" },
      t("evolution.approved", { defaultValue: "Program approved" }),
    );
  };

  const handleReject = async () => {
    const cleanReason = rejectReason.trim();
    if (!cleanReason) {
      setRejectValidationError(t("evolution.review.rejectReasonRequired"));
      return;
    }
    setRejectValidationError(null);
    const ok = await executeOwnerAction(
      {
        kind: "Evolution",
        id: e.id,
        action: "reject_program",
        memo: cleanReason,
        reason: cleanReason,
        params: { reason: cleanReason },
        payload: { reason: cleanReason },
      },
      t("evolution.retired", { defaultValue: "Program rejected and retired" }),
    );
    if (ok) {
      setRejectReason("");
    }
  };

  const handleComplete = async () => {
    await executeOwnerAction(
      { kind: "Evolution", id: e.id, action: "complete_program", memo: "Operator complete" },
      t("evolution.completed", { defaultValue: "Program completed" }),
    );
  };

  const handleRetire = async () => {
    await executeOwnerAction(
      { kind: "Evolution", id: e.id, action: "retire_program", memo: "Operator retire" },
      t("evolution.retired", { defaultValue: "Program retired" }),
    );
  };

  const programConstraints = Array.isArray(e.constraints)
    ? e.constraints.map((c, idx) => ({
        id: c.id || `cst-${idx + 1}`,
        expr: c.expression || c.name || (typeof c.value !== "undefined" ? `${c.operator || "<="} ${c.value}` : `Constraint ${idx + 1}`),
        ts: c.created_at || e.updatedAt || new Date().toISOString(),
      }))
    : [];

  const renderRunsPanel = (testId = "evolution-runs-panel") => (
    <Section title={t("evolution.runs.panelTitle")}>
      <div className="space-y-3" data-testid={testId}>
        {isManualWithNoSourceDecisions && (
          <div
            data-testid="evolution-manual-no-work-notice"
            className="rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-xs font-medium text-foreground"
          >
            {t("evolution.runs.manualNoSourceDecisions")}
          </div>
        )}
        {runs.length === 0 ? (
          <div className="text-xs text-muted-foreground" data-testid="evolution-runs-empty">
            {t("evolution.runs.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("evolution.runs.runId")}</th>
                  <th className="py-2 pr-3 font-medium">{t("evolution.runs.status")}</th>
                  <th className="py-2 pr-3 font-medium">{t("evolution.runs.decisionId")}</th>
                  <th className="py-2 pr-3 font-medium">{t("evolution.runs.downstreamStatus")}</th>
                  <th className="py-2 pr-3 font-medium">{t("evolution.runs.detail")}</th>
                  <th className="py-2 font-medium">{t("evolution.runs.linkedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const runId = r.run_id || r.id;
                  const statusStr = String(r.status || "unknown");
                  const isFailed = statusStr.toLowerCase() === "failed";
                  const decisionId = r.decision_id ?? r.decisionId ?? null;
                  return (
                    <tr
                      key={runId}
                      data-testid={`evolution-run-row-${runId}`}
                      className="border-b border-border/40"
                    >
                      <td className="py-2 pr-3 text-mono font-medium" data-testid={`evolution-run-id-${runId}`}>
                        {runId}
                      </td>
                      <td className="py-2 pr-3" data-testid={`evolution-run-status-${runId}`}>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge state={statusStr} />
                          <span className="text-mono">{statusStr}</span>
                          {isFailed && (
                            <Badge
                              variant="destructive"
                              data-testid={`evolution-run-failed-${runId}`}
                              className="text-[10px]"
                            >
                              {t("evolution.runs.failedBadge")}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-mono">
                        {decisionId ? (
                          <Link
                            to={`/management/evolution-journal?decision=${encodeURIComponent(decisionId)}`}
                            className="text-primary underline hover:opacity-80"
                          >
                            {decisionId}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 text-mono">
                        {r.downstream_status ?? r.downstreamStatus ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-mono text-muted-foreground">
                        {formatRunDetail(r.detail)}
                      </td>
                      <td className="py-2 text-mono text-muted-foreground">
                        {safeDateTime(r.linked_at ?? r.linkedAt ?? r.startedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );

  return (
    <>
      <ObjectDetailLayout
        object={e}
        subtitle={`${t("evolution.origin.label")}: ${t(`evolution.origin.${originKind}`)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-mono text-xs" data-testid="evolution-detail-origin">
              {t(`evolution.origin.${originKind}`)}
            </Badge>
            {isWaitingForHumanReview && (
              <Badge
                variant="secondary"
                data-testid="evolution-detail-waiting-review"
                className="border-status-warning/40 bg-status-warning/15 text-status-warning text-xs"
              >
                {t("evolution.waitingForHumanReview")}
              </Badge>
            )}
            {canSubmitReview && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionPending}
                data-testid="evolution-submit-review-btn"
                onClick={handleSubmitReview}
              >
                {t("evolution.review.submitForReview")}
              </Button>
            )}
            {canApprove && (
              <Button
                size="sm"
                variant="outline"
                disabled={!isGovernanceApproved || actionPending}
                data-testid="evolution-approve-btn"
                onClick={handleApprove}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {t("evolution.review.approve")}
              </Button>
            )}
            {canPause && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionPending}
                data-testid="evolution-pause-btn"
                onClick={handlePause}
              >
                <Pause className="h-4 w-4 mr-1" />
                {t("evolution.review.pause")}
              </Button>
            )}
            {canResume && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionPending}
                data-testid="evolution-resume-btn"
                onClick={handleResume}
              >
                <Play className="h-4 w-4 mr-1" />
                {t("evolution.review.resume")}
              </Button>
            )}
            {canComplete && (
              <Button
                size="sm"
                variant="secondary"
                disabled={actionPending}
                data-testid="evolution-complete-btn"
                onClick={handleComplete}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {t("evolution.review.complete")}
              </Button>
            )}
            {canStop && (
              <Button
                size="sm"
                variant="destructive"
                disabled={actionPending}
                data-testid="evolution-stop-btn"
                onClick={() => setStopOpen(true)}
              >
                <Pause className="h-4 w-4 mr-1" />
                {t("evolution.review.stop")}
              </Button>
            )}
            {canRetire && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionPending}
                data-testid="evolution-retire-btn"
                onClick={handleRetire}
              >
                {t("evolution.review.retire")}
              </Button>
            )}
          </div>
        }
        tabs={[
          {
            value: "overview",
            label: t("section.overview"),
            content: (
              <div className="space-y-4">
                {actionError && (
                  <Card
                    role="alert"
                    data-testid="evolution-action-error"
                    className="border-status-failed/50 bg-status-failed/10 p-3 text-xs text-status-failed font-medium"
                  >
                    {actionError}
                  </Card>
                )}

                {e.rejection?.reason && (
                  <Card
                    data-testid="evolution-rejection-banner"
                    className="border-status-failed/40 bg-status-failed/5 p-3 text-xs text-foreground"
                  >
                    {t("evolution.review.rejectedBanner", {
                      by: e.rejection.rejected_by ?? e.rejection.rejectedBy ?? "operator",
                      at: e.rejection.rejected_at ?? e.rejection.rejectedAt ?? "—",
                      reason: e.rejection.reason,
                    })}
                  </Card>
                )}

                <Section title={t("evolution.review.title")}>
                  <div className="space-y-3" data-testid="evolution-review-gate">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="rounded border border-border/60 p-2.5">
                        <div className="text-muted-foreground">{t("evolution.origin.label")}</div>
                        <div className="mt-1 flex items-center gap-2 font-medium">
                          <span>{t(`evolution.origin.${originKind}`)}</span>
                          {isWaitingForHumanReview && (
                            <Badge
                              variant="secondary"
                              className="border-status-warning/40 bg-status-warning/15 text-status-warning text-[10px]"
                            >
                              {t("evolution.waitingForHumanReview")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="rounded border border-border/60 p-2.5" data-testid="evolution-bound-approval">
                        <div className="text-muted-foreground">{t("evolution.review.boundApproval")}</div>
                        <div className="mt-1 text-mono font-medium">
                          {boundApprovalId ? (
                            <Link
                              to={`/management/governance/${encodeURIComponent(boundApprovalId)}`}
                              data-testid="evolution-bound-approval-link"
                              className="text-primary underline hover:opacity-80 inline-flex items-center gap-1"
                            >
                              {boundApprovalId}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            t("evolution.review.noBoundApproval")
                          )}
                        </div>
                      </div>
                      <div className="rounded border border-border/60 p-2.5" data-testid="evolution-bound-approval-state">
                        <div className="text-muted-foreground">{t("evolution.review.approvalState")}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusBadge state={boundApprovalState} />
                          <span className="text-mono">{boundApprovalState}</span>
                        </div>
                      </div>
                    </div>

                    {canApprove && !isGovernanceApproved && (
                      <div
                        data-testid="evolution-approve-blocked-notice"
                        className="rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-xs space-y-2"
                      >
                        <div className="text-foreground font-medium">
                          {boundApprovalId
                            ? t("evolution.review.approveBlockedUntilGovernanceApproved", {
                                approvalId: boundApprovalId,
                                state: boundApprovalState,
                              })
                            : t("evolution.review.approveBlockedNoApproval")}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            to="/management/governance"
                            data-testid="evolution-approvals-queue-link"
                            className="inline-flex items-center gap-1 text-primary underline font-medium"
                          >
                            {t("evolution.review.openApprovalsQueue")}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          {boundApprovalId && (
                            <Link
                              to={`/management/governance/${encodeURIComponent(boundApprovalId)}`}
                              data-testid="evolution-approval-detail-link"
                              className="inline-flex items-center gap-1 text-primary underline font-medium"
                            >
                              {t("evolution.review.openApprovalDetail", { approvalId: boundApprovalId })}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    )}

                    {canReject && (
                      <div className="space-y-2 pt-2 border-t border-border/50" data-testid="evolution-reject-panel">
                        <label
                          htmlFor="evolution-reject-reason"
                          className="block text-xs font-medium text-foreground"
                        >
                          {t("evolution.review.rejectReasonLabel")}
                        </label>
                        <Textarea
                          id="evolution-reject-reason"
                          data-testid="evolution-reject-reason-input"
                          value={rejectReason}
                          onChange={(ev) => {
                            setRejectReason(ev.target.value);
                            if (rejectValidationError) setRejectValidationError(null);
                          }}
                          placeholder={t("evolution.review.rejectReasonPlaceholder")}
                          rows={2}
                        />
                        {rejectValidationError && (
                          <div
                            data-testid="evolution-reject-reason-error"
                            className="text-xs text-status-failed font-medium"
                          >
                            {rejectValidationError}
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actionPending || rejectReason.trim().length === 0}
                          data-testid="evolution-reject-btn"
                          onClick={handleReject}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          {t("evolution.review.reject")}
                        </Button>
                      </div>
                    )}

                    {ownerAllowedActions.size === 0 && (
                      <div className="text-xs text-muted-foreground" data-testid="evolution-no-allowed-actions">
                        {t("evolution.review.noAllowedActions")}
                      </div>
                    )}
                  </div>
                </Section>

                <Section title={t("evolution.qualification.detailTitle")}>
                  <div className="space-y-3" data-testid="evolution-detail-qualification">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {t("evolution.qualification.policyVersion")}:{" "}
                        <span
                          className="text-mono text-foreground font-medium"
                          data-testid="evolution-detail-policy-version"
                        >
                          {qualificationPolicyVersion}
                        </span>
                      </span>
                      {e.qualification?.evaluated_at && (
                        <span className="text-muted-foreground">
                          {t("evolution.qualification.evaluatedAt")}:{" "}
                          <span className="text-mono text-foreground">{e.qualification.evaluated_at}</span>
                        </span>
                      )}
                    </div>

                    {originKind === "manual" && !e.qualification && (
                      <div className="text-xs text-muted-foreground">
                        {t("evolution.qualification.manualProgramNoQualification")}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/60 text-left text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">{t("evolution.qualification.criterion")}</th>
                            <th className="py-2 pr-3 font-medium">{t("evolution.qualification.observed")}</th>
                            <th className="py-2 pr-3 font-medium">{t("evolution.qualification.threshold")}</th>
                            <th className="py-2 pr-3 font-medium">{t("evolution.qualification.result")}</th>
                            <th className="py-2 font-medium">{t("evolution.qualification.reason")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {criterionRows.map((row) => {
                            const criterionId = String(row.criterion);
                            const resultKey = String(row.result || "not_evaluated");
                            const localizedCriterion = t(
                              `evolution.qualification.criteria.${criterionId}`,
                              { defaultValue: criterionId },
                            );
                            const localizedResult = t(
                              `evolution.qualification.results.${resultKey}`,
                              { defaultValue: resultKey },
                            );
                            return (
                              <tr
                                key={criterionId}
                                data-testid={`evolution-criterion-row-${criterionId}`}
                                className="border-b border-border/40"
                              >
                                <td className="py-2 pr-3">
                                  <div className="font-medium text-foreground">{localizedCriterion}</div>
                                  <div className="text-mono text-[11px] text-muted-foreground">{criterionId}</div>
                                </td>
                                <td
                                  className="py-2 pr-3 text-mono"
                                  data-testid={`evolution-criterion-observed-${criterionId}`}
                                >
                                  {formatCriterionValue(row.observed)}
                                </td>
                                <td
                                  className="py-2 pr-3 text-mono"
                                  data-testid={`evolution-criterion-threshold-${criterionId}`}
                                >
                                  {formatCriterionValue(row.threshold)}
                                </td>
                                <td
                                  className="py-2 pr-3"
                                  data-testid={`evolution-criterion-result-${criterionId}`}
                                  data-result={resultKey}
                                >
                                  <Badge
                                    variant={resultKey === "passed" ? "default" : resultKey === "failed" ? "destructive" : "outline"}
                                    className="text-mono text-[11px]"
                                  >
                                    {localizedResult} ({resultKey})
                                  </Badge>
                                </td>
                                <td className="py-2 text-mono text-muted-foreground">
                                  {row.reason || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Section>

                <Section title={t("evolution.sourceDecisions.title")}>
                  <div data-testid="evolution-detail-source-decisions">
                    {sourceDecisionIds.length === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        {t("evolution.sourceDecisions.empty")}
                      </div>
                    ) : (
                      <ul className="space-y-1.5 text-xs">
                        {sourceDecisionIds.map((decisionId) => (
                          <li key={decisionId} className="flex items-center gap-2">
                            <Link
                              to={`/management/evolution-journal?decision=${encodeURIComponent(decisionId)}`}
                              data-testid={`evolution-source-decision-link-${decisionId}`}
                              className="text-mono text-primary underline hover:opacity-80 inline-flex items-center gap-1"
                            >
                              {decisionId}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                            <span className="text-muted-foreground">
                              ({t("evolution.sourceDecisions.openInJournal")})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Section>

                {renderRunsPanel("evolution-runs-panel")}

                <Section title={t("lifecycle.title")}>
                  <LifecycleStepper machine={evolutionMachine} current={machineState} i18nPrefix="lifecycle.evolution" />
                </Section>
              </div>
            ),
          },
          {
            value: "direction", label: t("evolution.tabs.direction"),
            content: (
              <Section title={t("evolution.direction.title")}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label={t("evolution.direction.parent")} value={e.parentAlpha || "—"} mono />
                  <Field label={t("evolution.direction.objective")} value={t("evolution.direction.objectiveValue")} />
                  <Field label={t("evolution.origin.label")} value={t(`evolution.origin.${originKind}`)} mono />
                  <Field label={t("evolution.columns.sourceDecisionCount")} value={sourceDecisionIds.length} mono />
                </div>
              </Section>
            ),
          },
          {
            value: "lineage", label: t("section.lineage"),
            content: (
              <Section>
                <div className="flex items-center gap-3 text-sm">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <span className="text-mono">{e.parentAlpha || e.id}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-mono">{runs.length} runs</span>
                </div>
              </Section>
            ),
          },
          { value: "fitness", label: t("evolution.tabs.fitness"), content: <FitnessFormulaPanel mode="fitness" programId={e.id} /> },
          { value: "mutation", label: t("evolution.tabs.mutation"), content: <MutationRuleManager programId={e.id} /> },
          { value: "runs", label: t("evolution.tabs.runs"), content: renderRunsPanel("evolution-runs-tab-panel") },
          { value: "candidates", label: t("evolution.tabs.candidates"), content: <EvolutionCandidatesTab programId={e.id} /> },
          { value: "promotion", label: t("evolution.tabs.promotion"), content: <PromotionPanel program={e} onRefresh={refreshProgram} /> },
          { value: "freeze", label: t("phase13.evolution.tabs.freeze"), content: <EvolutionFreezePanel program={e} onRefresh={refreshProgram} /> },
          {
            value: "constraints", label: t("evolution.tabs.constraints"),
            content: (
              <Section title={t("evolution.constraints.title")}>
                <ul className="space-y-1.5 text-sm mb-3">
                  {programConstraints.length === 0 && <li className="text-xs text-muted-foreground">{t("evolution.constraints.empty")}</li>}
                  {programConstraints.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 text-mono text-xs">
                      <Badge variant="outline" className="text-[10px]">{c.id}</Badge>
                      <span className="flex-1">{c.expr}</span>
                      <span className="text-muted-foreground">{safeDateTime(c.ts, "date")}</span>
                    </li>
                  ))}
                </ul>
                <Textarea value={newConstraint} onChange={(ev) => setNewConstraint(ev.target.value)} placeholder={t("evolution.constraints.placeholder")} rows={2} />
                <Button className="mt-2" size="sm" disabled={newConstraint.trim().length < 4} onClick={async () => {
                  const expr = newConstraint.trim();
                  const constraintPayload = {
                    name: expr,
                    operator: "<=",
                    value: expr,
                    expression: expr,
                    scope: "global",
                  };
                  const ok = await executeOwnerAction(
                    {
                      kind: "Evolution",
                      id: e.id,
                      action: "create_constraint",
                      memo: expr,
                      params: { ...constraintPayload, payload: constraintPayload },
                      payload: constraintPayload,
                    },
                    t("evolution.constraints.created"),
                  );
                  if (ok) {
                    setNewConstraint("");
                  }
                }}>{t("evolution.constraints.add")}</Button>
              </Section>
            ),
          },
          {
            value: "alerts", label: t("evolution.tabs.alerts"),
            content: alerts.length === 0
              ? <Card className="p-6 text-xs text-muted-foreground">{t("evolution.alerts.empty")}</Card>
              : <DataTable rows={alerts} columns={[
                  { key: "title", header: t("table.title", { defaultValue: "Title" }), cell: (r) => <span className="text-sm">{r.title}</span> },
                  { key: "sev", header: t("incident.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                  { key: "src", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
                ]} empty={t("empty.noResults")} />,
          },
          {
            value: "approvals", label: t("evolution.tabs.approvals"),
            content: programApprovals.length === 0
              ? <Card className="p-6 text-xs text-muted-foreground">{t("evolution.approvals.empty")}</Card>
              : <DataTable rows={programApprovals} onRowClick={(r) => nav(`/management/governance/${r.id}`)} columns={[
                  { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                  { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
                  { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                ]} empty={t("empty.none")} />,
          },
          {
            value: "config", label: "Config",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Mutation rate" value="0.12" mono />
                  <Field label="Crossover" value="single-point" mono />
                  <Field label="Selection" value="tournament(k=4)" mono />
                </div>
              </Section>
            ),
          },
          { value: "experiments", label: t("nav.experiments"), content: (
            <DataTable rows={experiments} onRowClick={(r) => nav(`/management/experiments/${r.id}`)} columns={[
              { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "metric", header: t("table.metric"), cell: (r) => <span className="text-mono text-xs">{r.metric}: {(r.metricValue ?? 0).toFixed(3)}</span> },
              { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "concluded" ? "success" : r.status === "running" ? "running" : "pending"} /> },
            ]} empty={t("empty.noResults")} />
          ) },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={stopOpen}
        onOpenChange={setStopOpen}
        title={`Stop Evolution Program — ${e.name}`}
        description={t("detail.confirm.stopEvolution")}
        confirmToken="STOP"
        destructive
        onConfirm={async (memo) => {
          await executeOwnerAction(
            { kind: "Evolution", id: e.id, action: "stop", memo },
            t("evolution.stopped", { defaultValue: "Program stopped" }),
          );
        }}
      />
    </>
  );
};
