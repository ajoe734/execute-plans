// 2026-05-20 PM-6 — Human Inbox detail page (/management/human-inbox/:id).

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mgmt } from "@/lib/bff-v1";
import {
  MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS,
  collectMeetingEvidenceRefs,
  countMeetingReviewNoteChars,
  getMeetingDetail,
  normalizeOperatorReview,
  resolveMeetingReviewCause,
  reviewMeeting,
  type MeetingDetail,
  type MeetingOperatorReview,
  type MeetingsRead,
} from "@/lib/bff-v1/meetings";
import { formatDetailError, isNotFoundError } from "@/lib/bff-v1/useLiveDetail";
import { reasonCodeDisplay } from "@/lib/enumLabels";
import {
  meetingIdFromInboxItem,
  meetingReviewHrefFromInboxItem,
  meetingTypeFromInboxItem,
} from "@/lib/v5/management/humanInbox";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { PromotionReviewDecisionValue } from "@/lib/bff-v1/management";

export function personaIdFromDetail(itemId: string, manageHref?: string): string | undefined {
  const decodedId = decodeURIComponent(itemId);
  const fromId = decodedId.match(/persona:([^/?#]+)/)?.[1];
  if (fromId) return fromId;
  if (!manageHref) return undefined;
  try {
    const url = new URL(manageHref, "https://pantheon.local");
    return url.searchParams.get("persona") ?? undefined;
  } catch {
    return undefined;
  }
}

export const HumanGateDetailPage = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const { data, loading, error, refresh } = useV5Live((signal) => mgmt.humanInbox.get(id, { signal }), [id], {
    cacheKey: `oversight.humanGateDetail.${id}`,
  });
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/management/human-inbox";
  const [rationale, setRationale] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState<PromotionReviewDecisionValue | null>(null);
  const [meetingRead, setMeetingRead] = useState<MeetingsRead<MeetingDetail> | null>(null);
  const [meetingReviewNote, setMeetingReviewNote] = useState("");
  const [meetingReviewBusy, setMeetingReviewBusy] = useState(false);
  const [meetingReviewError, setMeetingReviewError] = useState<string | null>(null);
  const meetingReviewIdemRef = useRef<{ key: string; signature: string } | null>(null);
  const item = data;
  const isMeetingReview = item?.kind === "meeting_review";
  const meetingId = item && isMeetingReview ? meetingIdFromInboxItem(item) : undefined;
  const meetingHref = item && isMeetingReview ? meetingReviewHrefFromInboxItem(item) : undefined;
  const notFound = Boolean(error) && isNotFoundError(error);
  const hasLoadError = Boolean(error) && !notFound;

  useEffect(() => {
    let live = true;
    setMeetingRead(null);
    setMeetingReviewNote("");
    setMeetingReviewError(null);
    meetingReviewIdemRef.current = null;
    if (!isMeetingReview || !meetingId) return;
    void getMeetingDetail(meetingId).then((res) => {
      if (live) setMeetingRead(res);
    });
    return () => {
      live = false;
    };
  }, [isMeetingReview, meetingId]);

  if (loading && !item) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.inbox.loadingDetail")}</h1>
            <p className="text-sm text-muted-foreground">{id}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={returnUrl}>{t("mgmt.inbox.backToInbox")}</Link>
          </Button>
        </header>
      </section>
    );
  }

  if (!item) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {notFound ? t("mgmt.inbox.detailNotFoundTitle") : t("mgmt.inbox.detailUnavailableTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">{id}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={returnUrl}>{t("mgmt.inbox.backToInbox")}</Link>
          </Button>
        </header>
        <Card className="p-4 text-sm text-muted-foreground">
          {notFound
            ? t("mgmt.inbox.detailNotFoundBody", { id })
            : hasLoadError
              ? `${t("mgmt.inbox.detailUnavailableBody")} (${formatDetailError(error)})`
              : t("mgmt.inbox.detailUnavailableBody")}
        </Card>
      </section>
    );
  }

  const hasConsequences = Boolean(
    item.consequenceIfApproved || item.consequenceIfRejected || item.consequenceIfIgnored,
  );
  const hasSignatures = item.signatures.length > 0;
  const hasDecisionHistory = item.decisionHistory.length > 0;
  const meetingDetail = meetingRead?.state === "ok" ? meetingRead.data : null;
  const meetingEvidenceRefs = meetingDetail
    ? collectMeetingEvidenceRefs(meetingDetail as unknown as Record<string, unknown>)
    : [];
  const effectiveEvidenceRefs = Array.from(
    new Set([...item.evidenceRefs, ...meetingEvidenceRefs].filter(Boolean)),
  );
  const hasEvidence = effectiveEvidenceRefs.length > 0;
  const rawPersonaId =
    item.personaId ??
    meetingDetail?.chair_persona_id ??
    personaIdFromDetail(item.id, item.links?.manageHref);
  const personaId = rawPersonaId && rawPersonaId.trim().toLowerCase() !== "nan" ? rawPersonaId : undefined;
  const summaryValue = item.summary && item.summary.trim().toLowerCase() !== "nan" ? item.summary : undefined;
  const reviewId = item.reviewId ?? (item.id.startsWith("promotion_review:") ? item.id.slice("promotion_review:".length) : "");
  const isPromotionReview = item.kind === "promotion_review" && Boolean(reviewId);
  const promotionTargetKey = item.reviewType === "canary_to_live"
    ? "mgmt.inbox.approveLive"
    : "mgmt.inbox.approveCanary";
  const canApprovePromotion = item.allowedActions?.canApprove ?? item.canDecide;
  const canRejectPromotion = item.allowedActions?.canReject ?? item.canDecide;
  const rationaleValue = rationale.trim();

  const rawItemRecord = item as unknown as Record<string, unknown>;
  const meetingReviewCause =
    (meetingDetail
      ? resolveMeetingReviewCause(
          meetingDetail as unknown as Record<string, unknown>,
          meetingDetail.synthesis,
        )
      : null) ??
    (typeof item.unreadableReason === "string" && item.unreadableReason.trim()
      ? item.unreadableReason.trim()
      : typeof item.cause === "string" && item.cause.trim()
        ? item.cause.trim()
        : typeof rawItemRecord.unreadable_reason === "string" &&
            rawItemRecord.unreadable_reason.trim()
          ? rawItemRecord.unreadable_reason.trim()
          : "unknown");
  const isLegacyUnknownMeetingCause =
    !meetingReviewCause || meetingReviewCause.toLowerCase() === "unknown";
  const meetingCauseDisplay = reasonCodeDisplay(meetingReviewCause, t);
  const persistedOperatorReview: MeetingOperatorReview | null =
    (meetingDetail ? normalizeOperatorReview(meetingDetail.operator_review, meetingReviewCause) : null) ??
    normalizeOperatorReview(rawItemRecord.operator_review, meetingReviewCause) ??
    (isMeetingReview && item.decisionHistory.length > 0
      ? {
          status: "reviewed",
          disposition: "closed_no_proposal",
          note: item.decisionHistory[0].note ?? null,
          reviewed_by: item.decisionHistory[0].decidedBy || null,
          reviewed_at: item.decisionHistory[0].decidedAt || null,
          cause: meetingReviewCause,
          unreadable_reason: meetingReviewCause,
        }
      : null);
  const isMeetingReviewed =
    persistedOperatorReview?.status === "reviewed" ||
    (isMeetingReview && item.status === "reviewed");
  const canWriteMeetingReview = Boolean(
    isMeetingReview &&
      meetingId &&
      item.canDecide &&
      !isMeetingReviewed &&
      meetingDetail?.anonymised_labels_revealed !== false,
  );
  const trimmedMeetingReviewNote = meetingReviewNote.trim();
  const meetingReviewNoteCharCount = countMeetingReviewNoteChars(trimmedMeetingReviewNote);
  const meetingType = (meetingDetail?.meeting_type || meetingTypeFromInboxItem(item) || "MT-1").trim();
  const meetingConveneFollowUpHref = meetingId
    ? `/management/meetings?tab=upcoming&type=${encodeURIComponent(meetingType)}${
        personaId ? `&persona_id=${encodeURIComponent(personaId)}` : ""
      }&source_meeting_id=${encodeURIComponent(meetingId)}`
    : "/management/meetings?tab=upcoming";
  const actionPageHref = item.links?.manageHref || meetingHref;

  const submitMeetingReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!meetingId || !canWriteMeetingReview || meetingReviewBusy) return;
    if (!trimmedMeetingReviewNote) {
      setMeetingReviewError("review_note_required");
      return;
    }
    if (meetingReviewNoteCharCount > MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS) {
      setMeetingReviewError("review_note_too_long");
      return;
    }
    const sig = `${meetingId}:${trimmedMeetingReviewNote}`;
    if (!meetingReviewIdemRef.current || meetingReviewIdemRef.current.signature !== sig) {
      meetingReviewIdemRef.current = {
        signature: sig,
        key: `idem-inbox-review-${meetingId}-${Date.now()}`,
      };
    }
    setMeetingReviewBusy(true);
    setMeetingReviewError(null);
    try {
      const res = await reviewMeeting(
        meetingId,
        { note: trimmedMeetingReviewNote },
        meetingReviewIdemRef.current.key,
      );
      if (res.state === "ok") {
        setMeetingRead(res);
        setMeetingReviewNote("");
        toast.success(
          t("mgmt.inbox.decisionAcceptedFmt", {
            status: res.data.operator_review?.disposition ?? "closed_no_proposal",
          }),
        );
        refresh();
      } else {
        setMeetingReviewError(res.reason);
      }
    } finally {
      setMeetingReviewBusy(false);
    }
  };
  const submitPromotionDecision = async (decision: PromotionReviewDecisionValue) => {
    if (!reviewId) return;
    if (decision === "reject" && !rationaleValue) return;
    setSubmittingDecision(decision);
    try {
      const result = await mgmt.humanInbox.decidePromotionReview(reviewId, {
        decision,
        rationale: rationaleValue,
        evidenceRefs: item.evidenceRefs,
      });
      if (result.persisted) {
        toast.success(t("mgmt.inbox.decisionAcceptedFmt", { status: result.status }));
      } else {
        toast.warning(t("mgmt.inbox.decisionLocalOnly"));
      }
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t("mgmt.inbox.decisionFailedFmt", { message }));
    } finally {
      setSubmittingDecision(null);
    }
  };

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{item.title}</h1>
          {item.kind === "incident" ? (
            item.requiredRole ? (
              <p className="text-sm text-muted-foreground">
                {t("mgmt.inbox.requiredRoleFmt", { role: item.requiredRole })}
              </p>
            ) : null
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("mgmt.inbox.headerSubtitleFmt", { role: item.requiredRole, decision: item.decisionType })}
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={returnUrl}>{t("mgmt.inbox.backToInbox")}</Link>
        </Button>
      </header>

      <Card className="p-4">
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Gate ID</dt>
            <dd className="font-mono text-foreground">{item.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Persona</dt>
            <dd className="font-mono text-foreground">
              {personaId ? (
                <Link
                  to={`/management/personas/${encodeURIComponent(personaId)}`}
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {personaId}
                </Link>
              ) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Summary</dt>
            <dd className="text-foreground">{summaryValue || "—"}</dd>
          </div>
        </dl>
      </Card>

      {!item.canProceed && !isMeetingReviewed && (
        <Card className="border-status-failed/40 bg-status-failed/5 p-3">
          <h2 className="text-sm font-semibold text-status-failed">{t("mgmt.inbox.cannotProceedTitle")}</h2>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {item.blockingReasons?.map((r) => {
              const isMachineCode = /^[a-z0-9_:-]+$/i.test(r.trim());
              if (!isMachineCode) {
                return <li key={r}>{r}</li>;
              }
              const disp = reasonCodeDisplay(r, t);
              return (
                <li key={r}>
                  <span className="text-foreground">{disp.text}</span>
                  {disp.code && disp.code !== disp.text ? (
                    <>
                      {" "}
                      <code className="font-mono text-[11px] text-muted-foreground">({disp.code})</code>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isMeetingReview && (
        <Card className="p-4 space-y-3" data-testid="inbox-meeting-review-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("meetingsCenter.detail.review.title", {
                  defaultValue: "Meeting Synthesis Review & Operator Disposition",
                })}
              </h2>
              <Badge
                variant={isMeetingReviewed ? "secondary" : "destructive"}
                data-testid="inbox-meeting-review-status-badge"
              >
                {isMeetingReviewed
                  ? t("meetingsCenter.detail.review.reviewedBadge", {
                      defaultValue: "Reviewed · Closed with No Proposal",
                    })
                  : t("meetingsCenter.detail.review.pendingBadge", {
                      defaultValue: "Pending Operator Review",
                    })}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {meetingHref ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={meetingHref} data-testid="inbox-open-meeting-review-link">
                    {t("mgmt.inbox.openMeetingReview", {
                      defaultValue: "Open meeting review",
                    })}
                  </Link>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link
                  to={meetingConveneFollowUpHref}
                  data-testid="inbox-meeting-convene-followup-link"
                >
                  {t("meetingsCenter.detail.review.followUpOpenCenter", {
                    defaultValue: "Open Convene Flow in Meetings Center",
                  })}
                </Link>
              </Button>
            </div>
          </div>

          <div
            className="rounded border border-border bg-muted/20 p-3 space-y-1.5 text-xs"
            data-testid="inbox-meeting-review-explanation"
          >
            <div>
              <span className="font-semibold text-muted-foreground">
                {t("meetingsCenter.detail.review.causeLabel", {
                  defaultValue: "Review / Synthesis Cause",
                })}
                :{" "}
              </span>
              <span className="text-foreground" data-testid="inbox-meeting-review-cause">
                {meetingCauseDisplay.text}
              </span>{" "}
              <code className="font-mono text-[11px] text-muted-foreground">
                ({meetingReviewCause})
              </code>
            </div>
            <p className="text-foreground" data-testid="inbox-meeting-review-cause-explanation">
              {isLegacyUnknownMeetingCause
                ? t("meetingsCenter.detail.review.legacyUnknownCauseExplanation", {
                    defaultValue:
                      "This legacy meeting record did not store a detailed machine cause code (cause: unknown). The chair synthesis was recorded as REVIEW with zero proposals (0 proposals); inspect the actual deliberation rounds and shared case-file facts below to complete the review.",
                  })
                : t("meetingsCenter.detail.review.specificCauseExplanationFmt", {
                    cause: meetingCauseDisplay.text,
                    defaultValue: `Recorded synthesis review cause: ${meetingCauseDisplay.text}. This meeting closed in REVIEW with zero proposals (0 proposals); verify the deliberation transcript and shared case-file facts below.`,
                  })}
            </p>
            {meetingDetail?.synthesis?.summary ? (
              <p
                className="font-mono text-muted-foreground"
                data-testid="inbox-meeting-review-synthesis-summary"
              >
                synthesis: {meetingDetail.synthesis.summary}
              </p>
            ) : null}
            {meetingDetail ? (
              <p
                className="font-mono text-muted-foreground"
                data-testid="inbox-meeting-review-transcript-stats"
              >
                {t("meetingsCenter.detail.review.transcriptSummaryStatsFmt", {
                  rounds: meetingDetail.rounds.length,
                  positions: meetingDetail.rounds.reduce(
                    (acc, r) => acc + (Array.isArray(r.positions) ? r.positions.length : 0),
                    0,
                  ),
                  caseFiles: meetingDetail.case_file_items.length,
                  proposals: meetingDetail.proposals.length,
                })}
              </p>
            ) : null}
          </div>

          {isMeetingReviewed && persistedOperatorReview ? (
            <div
              className="rounded border border-primary/30 bg-primary/5 p-3 space-y-1.5 text-xs"
              data-testid="inbox-meeting-review-recorded"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {t("meetingsCenter.detail.review.recordedTitle", {
                    defaultValue: "Persisted Operator Review Disposition",
                  })}
                </span>
                <Badge variant="secondary">
                  {reasonCodeDisplay(
                    persistedOperatorReview.disposition ?? "closed_no_proposal",
                    t,
                  ).text}{" "}
                  <code className="ml-1 font-mono text-[10px]">
                    ({persistedOperatorReview.disposition ?? "closed_no_proposal"})
                  </code>
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4 text-muted-foreground">
                <span>
                  {t("meetingsCenter.detail.review.recordedByLabel", {
                    defaultValue: "Reviewed By",
                  })}
                  :{" "}
                  <code
                    className="font-mono text-foreground"
                    data-testid="inbox-meeting-review-recorded-by"
                  >
                    {persistedOperatorReview.reviewed_by ?? "—"}
                  </code>
                </span>
                <span>
                  {t("meetingsCenter.detail.review.recordedAtLabel", {
                    defaultValue: "Reviewed At",
                  })}
                  :{" "}
                  <code
                    className="font-mono text-foreground"
                    data-testid="inbox-meeting-review-recorded-at"
                  >
                    {persistedOperatorReview.reviewed_at ?? "—"}
                  </code>
                </span>
              </div>
              {persistedOperatorReview.note ? (
                <p
                  className="rounded border border-border bg-background p-2 text-foreground whitespace-pre-wrap"
                  data-testid="inbox-meeting-review-recorded-note"
                >
                  {persistedOperatorReview.note}
                </p>
              ) : null}
            </div>
          ) : canWriteMeetingReview ? (
            <form
              onSubmit={(e) => void submitMeetingReview(e)}
              className="space-y-3"
              data-testid="inbox-meeting-review-form"
            >
              <div
                className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs space-y-1"
                data-testid="inbox-meeting-review-consequence"
              >
                <div className="font-semibold text-foreground">
                  {t("meetingsCenter.detail.review.consequenceTitle", {
                    defaultValue: "Consequence Before Submission",
                  })}
                </div>
                <p className="text-muted-foreground">
                  {t("meetingsCenter.detail.review.consequenceBodyFmt", {
                    id: meetingId ?? item.id,
                  })}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="inbox-meeting-review-note" className="text-xs text-muted-foreground">
                    {t("meetingsCenter.detail.review.noteLabel", {
                      defaultValue: "Operator Review Note",
                    })}
                  </Label>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {meetingReviewNoteCharCount} / {MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS}
                  </span>
                </div>
                <Textarea
                  id="inbox-meeting-review-note"
                  data-testid="inbox-meeting-review-note-input"
                  rows={3}
                  value={meetingReviewNote}
                  onChange={(e) => setMeetingReviewNote(e.target.value)}
                  disabled={meetingReviewBusy}
                  placeholder={t("meetingsCenter.detail.review.notePlaceholder")}
                />
              </div>
              {meetingReviewError ? (
                <div
                  role="alert"
                  data-testid="inbox-meeting-review-error"
                  className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
                >
                  {t("meetingsCenter.detail.review.errorPrefixFmt", {
                    reason: reasonCodeDisplay(meetingReviewError, t).text,
                  })}{" "}
                  <code className="font-mono">({meetingReviewError})</code>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  size="sm"
                  data-testid="inbox-meeting-review-submit"
                  disabled={
                    meetingReviewBusy ||
                    !trimmedMeetingReviewNote ||
                    meetingReviewNoteCharCount > MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS
                  }
                >
                  {meetingReviewBusy ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                  )}
                  {meetingReviewBusy
                    ? t("meetingsCenter.detail.review.submittingButton", {
                        defaultValue: "Saving Review Disposition…",
                      })
                    : t("meetingsCenter.detail.review.submitButton", {
                        defaultValue: "Close Review with No Proposal",
                      })}
                </Button>
              </div>
            </form>
          ) : (
            <div
              className="rounded border border-dashed border-border p-2.5 text-xs text-muted-foreground"
              data-testid="inbox-meeting-review-read-only"
            >
              {t("meetingsCenter.detail.review.readOnlyNotice", {
                defaultValue:
                  "Read-only view: you may inspect the synthesis review reason, deliberation transcript, shared case-file facts, and review status without write controls.",
              })}
            </div>
          )}
        </Card>
      )}

      {hasConsequences && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.consequences")}</h2>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifApproved")}</dt><dd className="text-foreground">{item.consequenceIfApproved}</dd></div>
            <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifRejected")}</dt><dd className="text-foreground">{item.consequenceIfRejected}</dd></div>
            <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifIgnored")}</dt><dd className="text-foreground">{item.consequenceIfIgnored}</dd></div>
          </dl>
        </Card>
      )}

      {hasSignatures && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.signatures")}</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {item.signatures.map((s) => (
              <li key={s.role} className="flex items-center gap-2">
                <Badge variant="outline">{s.role}</Badge>
                <span className="text-muted-foreground">{s.signedBy ?? t("mgmt.inbox.pending")}</span>
                {s.signedAt && (
                  <span className="text-muted-foreground">{t("mgmt.inbox.signedAtFmt", { at: s.signedAt })}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Apply-receipt trail: every recorded decision on this gate, with who
          decided, when, and any rationale — the durable evidence that a
          governed capital/access/promotion action was actually reviewed and
          applied, not just requested. */}
      {hasDecisionHistory && (
        <Card id="decision-history" className="p-4 scroll-mt-24">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.decisionHistory")}</h2>
          <ul className="mt-2 space-y-2 text-xs">
            {item.decisionHistory.map((record, index) => (
              <li key={`${record.decidedAt}-${index}`} className="rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{record.decision}</Badge>
                  <span className="text-foreground">
                    {t("mgmt.inbox.decidedAtFmt", { by: record.decidedBy, at: record.decidedAt })}
                  </span>
                </div>
                {record.note && <p className="mt-1 text-muted-foreground">{record.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isPromotionReview && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("mgmt.inbox.promotionDecision")}
            </h2>
            <Badge variant="outline">{item.status ?? "pending"}</Badge>
          </div>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="promotion-rationale" className="text-xs text-muted-foreground">
                {t("mgmt.inbox.rationaleLabel")}
              </Label>
              <Textarea
                id="promotion-rationale"
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
                disabled={submittingDecision !== null || !item.canDecide}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void submitPromotionDecision("approve")}
                disabled={!item.canDecide || !canApprovePromotion || submittingDecision !== null}
              >
                {submittingDecision === "approve"
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-1 h-4 w-4" />}
                {t(promotionTargetKey)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void submitPromotionDecision("approve_with_conditions")}
                disabled={!item.canDecide || !canApprovePromotion || submittingDecision !== null}
              >
                {submittingDecision === "approve_with_conditions"
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-1 h-4 w-4" />}
                {t("mgmt.inbox.approveWithConditions")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void submitPromotionDecision("reject")}
                disabled={!item.canDecide || !canRejectPromotion || !rationaleValue || submittingDecision !== null}
                className="border-status-failed/40 text-status-failed hover:text-status-failed"
              >
                {submittingDecision === "reject"
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <XCircle className="mr-1 h-4 w-4" />}
                {t("mgmt.inbox.rejectPromotion")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card id="evidence" className="p-4 scroll-mt-24">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.evidence")}</h2>
        {hasEvidence ? (
          <ul className="mt-2 space-y-1 text-xs">
            {effectiveEvidenceRefs.map((e) => (
              <li key={e}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{e}</code>
              </li>
            ))}
          </ul>
        ) : isMeetingReview ? (
          <p
            className="mt-2 text-xs text-muted-foreground"
            data-testid="inbox-meeting-evidence-empty"
          >
            {t("mgmt.inbox.meetingEvidenceEmpty", {
              defaultValue:
                "No evidence reference IDs were attached to this meeting record; open the meeting detail to inspect the deliberation rounds and chair synthesis.",
            })}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("mgmt.actions.evidenceMissing")}</p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {actionPageHref && (
          <Button asChild size="sm" variant="outline">
            <Link to={actionPageHref}>{t("mgmt.actions.openActionPage")}</Link>
          </Button>
        )}
      </div>
    </section>
  );
};
