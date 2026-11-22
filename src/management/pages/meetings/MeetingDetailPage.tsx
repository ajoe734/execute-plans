// Management Meeting Detail Page (FE-MANAGEMENT-MEETINGS-20261115, SD_PERSONA_MEETINGS_2026-11-15 §11.3 & §12.9).
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";
import { detectMode, getMockResolver } from "@/lib/bff-v1/client";
import { readBffEnv } from "@/lib/bff-v1/runtimeEnv";
import { reasonCodeDisplay, resolveBffSubjectDisplay, statusLabel } from "@/lib/enumLabels";
import {
  MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS,
  buildFollowUpConveneInput,
  conveneMeeting,
  countMeetingReviewNoteChars,
  getMeetingDetail,
  normalizeOperatorReview,
  registerMeetingQueryClient,
  resolveMeetingReviewCause,
  reviewMeeting,
  stripPrivateMemory,
  type ConveneMeetingReceipt,
  type MeetingCaseFileItem,
  type MeetingDetail,
  type MeetingPreReadInterpretation,
  type MeetingsRead,
} from "@/lib/bff-v1/meetings";
import { isFailedMeeting, meetingLastError, meetingTopicText } from "./meetingDisplay";

function BffSubjectInline({
  id,
  displayName,
  nameMissing,
  testIdPrefix,
}: {
  id?: string | null;
  displayName?: string | null;
  nameMissing?: boolean | null;
  testIdPrefix?: string;
}) {
  const { t } = useTranslation();
  const resolved = resolveBffSubjectDisplay({ id, displayName, nameMissing }, t);
  if (resolved.primaryText === "—") {
    return <code className="text-foreground">—</code>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={resolved.hasDisplayName ? "font-sans font-semibold text-foreground" : "font-mono font-semibold text-foreground"}
        data-testid={testIdPrefix ? `${testIdPrefix}-primary` : undefined}
      >
        {resolved.primaryText}
      </span>
      {resolved.secondaryId ? (
        <code
          className="font-mono text-[11px] text-muted-foreground"
          data-testid={testIdPrefix ? `${testIdPrefix}-id` : undefined}
        >
          ({resolved.secondaryId})
        </code>
      ) : null}
      {resolved.nameMissing ? (
        <Badge
          variant="outline"
          className="text-[10px] py-0 px-1"
          data-name-missing="true"
          data-testid={testIdPrefix ? `${testIdPrefix}-name-missing` : undefined}
        >
          {resolved.nameMissingBadgeLabel}
        </Badge>
      ) : null}
    </span>
  );
}

function extractPreReadList(
  preRead: MeetingDetail["pre_read"],
): MeetingPreReadInterpretation[] {
  if (!preRead) return [];
  if (Array.isArray(preRead)) return preRead;
  if (typeof preRead === "object") {
    if (Array.isArray(preRead.interpretations)) return preRead.interpretations;
    if (Array.isArray(preRead.items)) return preRead.items;
  }
  return [];
}

function formatAgenda(agenda: MeetingDetail["agenda"]): string[] {
  if (!agenda) return [];
  if (Array.isArray(agenda)) {
    return agenda.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  }
  if (typeof agenda === "string" && agenda.trim()) return [agenda.trim()];
  return [];
}

function caseItemContent(item: MeetingCaseFileItem): string | undefined {
  if (item.status === "unavailable") return undefined;
  const ref = item.source_id || item.item_id;
  return [item.excerpt, item.raw_text].find((value) => {
    const text = value?.trim();
    return text && text !== item.item_id && text !== ref &&
      !(item.kind === "evidence_ref" && text.startsWith(`Evidence ${ref} for `));
  });
}

function caseCitationIndex(items: MeetingCaseFileItem[], ref: string): number {
  const exact = items.findIndex((item) => item.item_id === ref);
  if (exact >= 0) return exact;
  const sourced = items.filter((item) => item.source_id === ref);
  return sourced.length === 1 ? items.indexOf(sourced[0]) : -1;
}

export const MeetingDetailPage = () => {
  const { id = "" } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const access = useAgoraWriteAccess();
  registerMeetingQueryClient(useContext(QueryClientContext));
  const [read, setRead] = useState<MeetingsRead<MeetingDetail> | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const caseFileRef = useRef<HTMLDetailsElement>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpReceipt, setFollowUpReceipt] = useState<ConveneMeetingReceipt | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const reviewIdemRef = useRef<{ key: string; signature: string } | null>(null);

  useEffect(() => {
    let live = true;
    setRead(null);
    setShowReveal(false);
    setReviewNote("");
    setReviewError(null);
    setFollowUpReceipt(null);
    setFollowUpError(null);
    reviewIdemRef.current = null;
    if (!id) {
      setRead({ state: "not_found", reason: "missing_meeting_id" });
      return;
    }
    void getMeetingDetail(id).then((res) => {
      if (live) setRead(res);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (read === null) {
    return (
      <section className="p-6" data-testid="meeting-detail-loading">
        <p className="text-sm text-muted-foreground">
          {t("common.loading", { defaultValue: "Loading…" })}
        </p>
      </section>
    );
  }

  if (read.state === "not_found") {
    const notFoundReason = reasonCodeDisplay(read.reason, t);
    return (
      <section className="p-6 space-y-4" data-testid="meeting-detail-not-found">
        <Card className="p-6 space-y-3">
          <h1 className="text-lg font-semibold text-foreground">
            {t("meetingsCenter.detail.notFound", {
              id,
              defaultValue: `Meeting ${id} was not found.`,
            })}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            reason: <span className="font-sans text-foreground">{notFoundReason.text}</span>
            {notFoundReason.code && notFoundReason.code !== notFoundReason.text ? (
              <>
                {" "}
                <code>{notFoundReason.code}</code>
              </>
            ) : null}
          </p>
          <div>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/meetings">
                {t("meetingsCenter.detail.backToCenter", {
                  defaultValue: "Back to Meetings Center",
                })}
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  if (read.state === "unavailable") {
    const unavailableReason = reasonCodeDisplay(read.reason, t);
    return (
      <section className="p-6 space-y-4" data-testid="meeting-detail-unavailable" role="status">
        <Card className="border-dashed p-6 space-y-2">
          <h1 className="text-lg font-semibold text-foreground">
            {t("meetingsCenter.unavailable", {
              defaultValue: "Consultation meetings surface is unavailable",
            })}
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            reason: <span className="font-sans text-foreground">{unavailableReason.text}</span>
            {unavailableReason.code && unavailableReason.code !== unavailableReason.text ? (
              <>
                {" "}
                <code>{unavailableReason.code}</code>
              </>
            ) : null}
            {read.owner ? (
              <>
                {" · "}owner: <code>{read.owner}</code>
              </>
            ) : null}
          </p>
          <div>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/meetings">
                {t("meetingsCenter.detail.backToCenter", {
                  defaultValue: "Back to Meetings Center",
                })}
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  const m = stripPrivateMemory(read.data);
  const typeLabel = t(`meetingsCenter.typeName.${m.meeting_type}`, { defaultValue: m.meeting_type });
  const topic = meetingTopicText(m, t);
  const agendaItems = formatAgenda(m.agenda).filter((item) => item !== m.topic?.trim() && item !== topic);
  const preReadItems = extractPreReadList(m.pre_read).filter(
    (item) => item.text?.trim() || item.summary?.trim() || item.citations?.length,
  );
  const rounds = [...m.rounds].sort((a, b) => a.round - b.round);
  const speakerRoles = new Map(
    rounds.flatMap((round) => round.positions.map((position) => [position.label, position.role ?? "participant"] as const)),
  );
  const participantRoles = [...new Set(m.participants.map((participant) => participant.role).filter(Boolean))];
  const labelForRole = (role?: string) => t(`meetingsCenter.detail.roles.${role ?? "participant"}`, {
    defaultValue: t("meetingsCenter.detail.roles.participant"),
  });
  const speakerLabel = (label: string, role?: string) => {
    const speakersWithRole = [...speakerRoles].filter(([, value]) => value === (role ?? "participant"));
    const position = speakersWithRole.findIndex(([value]) => value === label);
    const roleName = labelForRole(role);
    return speakersWithRole.length > 1 && position >= 0
      ? t("meetingsCenter.detail.speakerNumber", { role: roleName, number: position + 1 })
      : roleName;
  };
  const labelForStance = (stance: string) =>
    t(`meetingsCenter.detail.stances.${stance.trim().toLowerCase()}`, { defaultValue: stance });
  const openCaseFile = () => {
    if (caseFileRef.current) caseFileRef.current.open = true;
  };
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
        }).format(date) + " UTC";
  };
  const proposals =
    m.proposals && m.proposals.length > 0
      ? m.proposals
      : m.synthesis?.proposals ?? [];
  const labelReveal = m.label_reveal && typeof m.label_reveal === "object" ? m.label_reveal : null;
  const canRevealLabels = Boolean(m.anonymised_labels_revealed && labelReveal);
  const isReview =
    String(m.outcome ?? "").toUpperCase() === "REVIEW" ||
    String(m.status ?? "").toUpperCase() === "REVIEW" ||
    String(m.synthesis?.outcome ?? "").toUpperCase() === "REVIEW" ||
    Boolean(m.operator_review);
  const reviewCause =
    resolveMeetingReviewCause(m as unknown as Record<string, unknown>, m.synthesis) ?? "unknown";
  const isLegacyUnknownCause = !reviewCause || reviewCause.toLowerCase() === "unknown";
  const causeDisplay = reasonCodeDisplay(reviewCause, t);
  const blockingReasonDisplay = reasonCodeDisplay("synthesis_review_required", t);
  const operatorReview = normalizeOperatorReview(m.operator_review, reviewCause);
  const isReviewed = operatorReview?.status === "reviewed";
  const shownDate = m.closed_at ?? m.created_at;
  const failed = isFailedMeeting(m);
  const executionError = meetingLastError(m);
  const rawOutcome = m.synthesis?.outcome ?? m.outcome;
  const outcomeKey = rawOutcome?.trim().toLowerCase();
  const tally = m.synthesis?.tally;
  const stanceCounts = Object.entries(tally?.by_stance ?? {}).filter(([, count]) => Number.isFinite(count));
  const referenceOnly = m.case_file_items.length > 0 && m.case_file_items.every((item) =>
    item.kind === "evidence_ref" && !caseItemContent(item),
  );
  const outcomeText = isReview
    ? t(`meetingsCenter.detail.review.${isReviewed ? "reviewedBadge" : "pendingBadge"}`)
    : rawOutcome && t(`meetingsCenter.detail.outcomes.${outcomeKey}`, { defaultValue: reasonCodeDisplay(rawOutcome, t).text });
  const operatorWriteRoles = new Set([
    "operator",
    "approver",
    "admin",
    "ops",
    "platform_admin",
    "portfolio_manager",
  ]);
  const normalizedRoles = Array.isArray(access.roles)
    ? access.roles.map((r) => String(r).trim().toLowerCase()).filter(Boolean)
    : [];
  const hasExplicitOperatorRole = normalizedRoles.some((r) => operatorWriteRoles.has(r));
  const hasExplicitNonOperatorRole =
    normalizedRoles.length > 0 && !hasExplicitOperatorRole;
  const isUnmockedMockResolverSession =
    detectMode() !== "live" &&
    Boolean(getMockResolver()) &&
    Array.isArray(access.agoraCapabilities) &&
    readBffEnv()?.VITE_BFF_REAL_WRITES !== "false";
  const isReadOnlyViewer =
    m.anonymised_labels_revealed === false ||
    hasExplicitNonOperatorRole ||
    (!isUnmockedMockResolverSession &&
      !access.loading &&
      (access.writeAllowed === false ||
        (!hasExplicitOperatorRole && access.interactionAllowed === false)));
  const canWriteReview = (isUnmockedMockResolverSession || !access.loading) && !isReadOnlyViewer;
  const trimmedReviewNote = reviewNote.trim();
  const reviewNoteCharCount = countMeetingReviewNoteChars(trimmedReviewNote);
  const followUpCenterHref = `/management/meetings?tab=upcoming&type=${encodeURIComponent(
    m.meeting_type || "MT-1",
  )}${m.chair_persona_id ? `&persona_id=${encodeURIComponent(m.chair_persona_id)}` : ""}&source_meeting_id=${encodeURIComponent(m.meeting_id)}`;

  const handleReviewSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWriteReview || isReviewed || reviewBusy) return;
    if (!trimmedReviewNote) {
      setReviewError("review_note_required");
      return;
    }
    if (reviewNoteCharCount > MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS) {
      setReviewError("review_note_too_long");
      return;
    }
    const sig = `${m.meeting_id}:${trimmedReviewNote}`;
    if (!reviewIdemRef.current || reviewIdemRef.current.signature !== sig) {
      reviewIdemRef.current = {
        signature: sig,
        key: `idem-review-${m.meeting_id}-${Date.now()}`,
      };
    }
    setReviewBusy(true);
    setReviewError(null);
    try {
      const res = await reviewMeeting(
        m.meeting_id,
        { note: trimmedReviewNote },
        reviewIdemRef.current.key,
      );
      if (res.state === "ok") {
        setRead(res);
        setReviewNote("");
      } else {
        setReviewError(res.reason);
      }
    } finally {
      setReviewBusy(false);
    }
  };

  const handleFollowUpConvene = async () => {
    if (!canWriteReview || followUpBusy) return;
    setFollowUpBusy(true);
    setFollowUpError(null);
    setFollowUpReceipt(null);
    try {
      const res = await conveneMeeting(buildFollowUpConveneInput(m));
      if (res.state === "ok") {
        setFollowUpReceipt(res.data);
      } else {
        setFollowUpError(res.reason);
      }
    } finally {
      setFollowUpBusy(false);
    }
  };

  return (
    <section
      className="p-6 space-y-6"
      aria-label={`Meeting ${m.meeting_id}`}
      data-testid="meeting-detail-page"
    >
      {/* Back navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/management/meetings">
            ← {t("meetingsCenter.detail.backToCenter", { defaultValue: "Back to Meetings Center" })}
          </Link>
        </Button>
        {isReview ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/management/human-inbox" data-testid="meeting-detail-back-to-inbox">
              {t("mgmt.inbox.backToInbox", { defaultValue: "Back to Human Inbox" })}
            </Link>
          </Button>
        ) : null}
      </div>

      <Card className="space-y-4 p-4 sm:p-6" data-testid="meeting-detail-header">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {topic && typeLabel ? <span className="text-muted-foreground">{typeLabel}</span> : null}
            <Badge variant={failed ? "destructive" : "outline"}>
              {failed ? t("meetingsCenter.executionFailed") : statusLabel(m.status, t)}
            </Badge>
            <span className="text-muted-foreground">{t("meetingsCenter.authorityBadge")}</span>
          </div>
          <h1 className="break-words text-xl font-semibold leading-snug sm:text-2xl">
            {topic || typeLabel || t("meetingsCenter.detail.recordTitle")}
          </h1>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t("meetingsCenter.detail.participantCount", { count: m.participants.length })}
              {participantRoles.length > 0 ? ` · ${participantRoles.map(labelForRole).join(" / ")}` : ""}
            </span>
            <span>{t("meetingsCenter.detail.recordedRounds", { count: rounds.length })}</span>
            {shownDate ? <time dateTime={shownDate}>{formatDate(shownDate)}</time> : null}
          </div>
        </div>
        <div className="space-y-2 rounded-md border-l-2 border-primary bg-muted/30 px-4 py-3" data-testid="meeting-detail-synthesis">
          <h2 className="text-sm font-semibold">{outcomeText || t("meetingsCenter.detail.synthesisTitle")}</h2>
          {failed && executionError ? (
            <p className="text-sm">{t("meetingsCenter.failureReason", { reason: reasonCodeDisplay(executionError, t).text })}</p>
          ) : null}
          {m.synthesis?.summary ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.synthesis.summary}</p> : null}
          {!outcomeText && !m.synthesis?.summary && !failed ? (
            <p className="text-sm text-muted-foreground">{t("meetingsCenter.detail.noSynthesis")}</p>
          ) : null}
          {referenceOnly ? <p className="text-sm">{t("meetingsCenter.detail.referenceOnlyNote")}</p> : null}
          {stanceCounts.length > 0 || typeof tally?.support === "number" || typeof tally?.dissent === "number" ? (
            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground" data-testid="meeting-synthesis-tally">
              <span className="font-medium">{t("meetingsCenter.detail.stanceDistribution")}</span>
              {stanceCounts.length > 0
                ? stanceCounts.map(([stance, count]) => (
                    <span key={stance}>{labelForStance(stance)} {count}</span>
                  ))
                : <>
                    {typeof tally?.support === "number" ? <span>{t("meetingsCenter.detail.legacySupport")} {tally.support}</span> : null}
                    {typeof tally?.dissent === "number" ? <span>{t("meetingsCenter.detail.legacyDissent")} {tally.dissent}</span> : null}
                  </>}
            </div>
          ) : null}
          {m.synthesis?.dissent_summary ? <p className="break-words text-sm">{m.synthesis.dissent_summary}</p> : null}
        </div>
        <nav aria-label={t("meetingsCenter.detail.sections")} className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-primary">
          <a className="underline underline-offset-4" href="#meeting-discussion">{t("meetingsCenter.detail.roundsTitle")}</a>
          <a className="underline underline-offset-4" href="#meeting-sources" onClick={openCaseFile}>{t("meetingsCenter.detail.caseFileTitle")}</a>
          {proposals.length > 0 ? (
            <a className="underline underline-offset-4" href="#meeting-proposals">{t("meetingsCenter.detail.proposalsTitle")}</a>
          ) : null}
        </nav>
      </Card>

      {/* 1b. Meeting Synthesis Review & Operator Disposition (FE-MEETING-REVIEW-DISPOSITION-20261121) */}
      {isReview ? (
        <Card
          id="meeting-review-disposition"
          data-testid="meeting-detail-review-disposition"
          className="p-5 space-y-4 border-primary/40"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {t("meetingsCenter.detail.review.title", {
                  defaultValue: "Meeting Synthesis Review & Operator Disposition",
                })}
              </h2>
              <Badge
                variant={isReviewed ? "secondary" : "destructive"}
                data-testid="meeting-review-status-badge"
              >
                {isReviewed
                  ? t("meetingsCenter.detail.review.reviewedBadge", {
                      defaultValue: "Reviewed · Closed with No Proposal",
                    })
                  : t("meetingsCenter.detail.review.pendingBadge", {
                      defaultValue: "Pending Operator Review",
                    })}
              </Badge>
            </div>
          </div>

          {/* Explanation & Localized Blocking / Cause Reason */}
          <div
            className="rounded border border-border bg-muted/20 p-3.5 space-y-2 text-xs"
            data-testid="meeting-review-explanation"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <span className="font-semibold text-muted-foreground">
                  {t("meetingsCenter.detail.review.blockingReasonLabel", {
                    defaultValue: "Inbox Blocking Reason",
                  })}
                  :{" "}
                </span>
                <span className="text-foreground" data-testid="meeting-review-blocking-reason">
                  {blockingReasonDisplay.text}
                </span>{" "}
                <code className="font-mono text-[11px] text-muted-foreground">
                  (synthesis_review_required)
                </code>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">
                  {t("meetingsCenter.detail.review.causeLabel", {
                    defaultValue: "Review / Synthesis Cause",
                  })}
                  :{" "}
                </span>
                <span className="text-foreground" data-testid="meeting-review-cause">
                  {causeDisplay.text}
                </span>{" "}
                <code className="font-mono text-[11px] text-muted-foreground">
                  ({reviewCause})
                </code>
              </div>
            </div>
            <p className="text-sm text-foreground" data-testid="meeting-review-cause-explanation">
              {isLegacyUnknownCause
                ? t("meetingsCenter.detail.review.legacyUnknownCauseExplanation", {
                    defaultValue:
                      "This legacy meeting record did not store a detailed machine cause code (cause: unknown). The chair synthesis was recorded as REVIEW with zero proposals (0 proposals); inspect the actual deliberation rounds and shared case-file facts below to complete the review.",
                  })
                : t("meetingsCenter.detail.review.specificCauseExplanationFmt", {
                    cause: causeDisplay.text,
                    defaultValue: `Recorded synthesis review cause: ${causeDisplay.text}. This meeting closed in REVIEW with zero proposals (0 proposals); verify the deliberation transcript and shared case-file facts below.`,
                  })}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-primary">
            <a className="underline underline-offset-4" href="#meeting-discussion">{t("meetingsCenter.detail.roundsTitle")}</a>
            <a className="underline underline-offset-4" href="#meeting-sources" onClick={openCaseFile}>{t("meetingsCenter.detail.caseFileTitle")}</a>
          </div>

          {/* Separate Path: Convene Follow-Up Meeting for More Research */}
          <div
            className="rounded border border-border bg-muted/10 p-3.5 space-y-2 text-xs"
            data-testid="meeting-review-followup-convene"
          >
            <h3 className="font-semibold text-foreground">
              {t("meetingsCenter.detail.review.followUpTitle", {
                defaultValue:
                  "Need More Research? Convene a Follow-Up Meeting with Source Context",
              })}
            </h3>
            <p className="text-muted-foreground">
              {t("meetingsCenter.detail.review.followUpBody", {
                defaultValue:
                  "If participants requested more research or you want a fresh deliberation, use the existing convene flow with this source meeting's context (type, chair/participants, and evidence refs). This path is separate from closing this review with no proposal and never runs automatically.",
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild size="sm" variant="outline">
                <Link
                  to={followUpCenterHref}
                  data-testid="meeting-review-convene-followup-link"
                >
                  {t("meetingsCenter.detail.review.followUpOpenCenter", {
                    defaultValue: "Open Convene Flow in Meetings Center",
                  })}
                </Link>
              </Button>
              {canWriteReview ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="meeting-review-convene-followup-button"
                  disabled={followUpBusy}
                  onClick={() => void handleFollowUpConvene()}
                >
                  {followUpBusy
                    ? t("meetingsCenter.detail.review.followUpConvening", {
                        defaultValue: "Convening Follow-Up Meeting…",
                      })
                    : t("meetingsCenter.detail.review.followUpConveneNow", {
                        defaultValue: "Convene Follow-Up Meeting with Source Context",
                      })}
                </Button>
              ) : null}
            </div>
            {followUpReceipt ? (
              <div
                className="rounded border border-border bg-muted/30 p-2 text-xs"
                data-testid="meeting-review-followup-receipt"
              >
                {t("meetingsCenter.detail.review.followUpReceiptFmt", {
                  id: followUpReceipt.meeting_id,
                  status: followUpReceipt.status,
                  defaultValue: `Follow-up research meeting convened: ${followUpReceipt.meeting_id} (${followUpReceipt.status})`,
                })}{" "}
                <Link
                  to={`/management/meetings/${encodeURIComponent(followUpReceipt.meeting_id)}`}
                  className="font-mono underline text-primary"
                >
                  {followUpReceipt.meeting_id}
                </Link>
              </div>
            ) : null}
            {followUpError ? (
              <div
                role="alert"
                data-testid="meeting-review-followup-error"
                className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
              >
                {reasonCodeDisplay(followUpError, t).text}{" "}
                <code className="font-mono">({followUpError})</code>
              </div>
            ) : null}
          </div>

          {/* Persisted Operator Review OR Actionable Close-Review Form OR Read-Only Notice */}
          {isReviewed && operatorReview ? (
            <div
              className="rounded border border-primary/30 bg-primary/5 p-4 space-y-2 text-xs"
              data-testid="meeting-review-recorded"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("meetingsCenter.detail.review.recordedTitle", {
                    defaultValue: "Persisted Operator Review Disposition",
                  })}
                </h3>
                <Badge variant="secondary" data-testid="meeting-review-recorded-disposition">
                  {reasonCodeDisplay(operatorReview.disposition ?? "closed_no_proposal", t).text}{" "}
                  <code className="ml-1 font-mono text-[10px]">
                    ({operatorReview.disposition ?? "closed_no_proposal"})
                  </code>
                </Badge>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <dt className="text-muted-foreground">
                    {t("meetingsCenter.detail.review.recordedByLabel", {
                      defaultValue: "Reviewed By",
                    })}
                  </dt>
                  <dd
                    className="font-mono font-semibold text-foreground"
                    data-testid="meeting-review-recorded-by"
                  >
                    {operatorReview.reviewed_by ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("meetingsCenter.detail.review.recordedAtLabel", {
                      defaultValue: "Reviewed At",
                    })}
                  </dt>
                  <dd
                    className="font-mono text-foreground"
                    data-testid="meeting-review-recorded-at"
                  >
                    {operatorReview.reviewed_at ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("meetingsCenter.detail.review.causeLabel", {
                      defaultValue: "Review / Synthesis Cause",
                    })}
                  </dt>
                  <dd className="text-foreground" data-testid="meeting-review-recorded-cause">
                    {reasonCodeDisplay(operatorReview.cause ?? reviewCause, t).text}{" "}
                    <code className="font-mono text-[11px] text-muted-foreground">
                      ({operatorReview.cause ?? reviewCause})
                    </code>
                  </dd>
                </div>
              </dl>
              <div>
                <div className="text-muted-foreground">
                  {t("meetingsCenter.detail.review.recordedNoteLabel", {
                    defaultValue: "Review Note",
                  })}
                </div>
                <p
                  className="mt-1 rounded border border-border bg-background p-2.5 text-sm text-foreground whitespace-pre-wrap"
                  data-testid="meeting-review-recorded-note"
                >
                  {operatorReview.note ?? "—"}
                </p>
              </div>
              <p className="text-muted-foreground">
                {t("meetingsCenter.detail.review.recordedPreservedNote", {
                  defaultValue:
                    "This meeting has been removed from the pending Human Inbox queue; the original outcome (REVIEW), chair synthesis, transcript, and zero proposals remain intact.",
                })}
              </p>
            </div>
          ) : canWriteReview ? (
            <form
              onSubmit={(e) => void handleReviewSubmit(e)}
              className="rounded border border-border p-4 space-y-3"
              data-testid="meeting-review-form"
            >
              <div
                className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1"
                data-testid="meeting-review-consequence"
              >
                <div className="font-semibold text-foreground">
                  {t("meetingsCenter.detail.review.consequenceTitle", {
                    defaultValue: "Consequence Before Submission",
                  })}
                </div>
                <p className="text-muted-foreground">
                  {t("meetingsCenter.detail.review.consequenceBodyFmt", {
                    id: m.meeting_id,
                    defaultValue: `Submitting records an operator review with disposition closed_no_proposal via the meeting review API and removes meeting_review:${m.meeting_id} from the pending Human Inbox queue. The original meeting outcome (REVIEW), chair synthesis, deliberation transcript, and zero proposals (0) remain intact.`,
                  })}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="meeting-review-note-input" className="text-xs font-semibold">
                    {t("meetingsCenter.detail.review.noteLabel", {
                      defaultValue: "Operator Review Note",
                    })}
                  </Label>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {reviewNoteCharCount} / {MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS}
                  </span>
                </div>
                <Textarea
                  id="meeting-review-note-input"
                  data-testid="meeting-review-note-input"
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  disabled={reviewBusy}
                  placeholder={t("meetingsCenter.detail.review.notePlaceholder", {
                    defaultValue:
                      "Record your review rationale and disposition note (e.g. two participants requested more research across two rounds; closing review with no proposal)…",
                  })}
                />
              </div>

              {reviewError ? (
                <div
                  role="alert"
                  data-testid="meeting-review-error"
                  className="rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
                >
                  {t("meetingsCenter.detail.review.errorPrefixFmt", {
                    reason: reasonCodeDisplay(reviewError, t).text,
                    defaultValue: `Failed to save meeting review: ${reasonCodeDisplay(reviewError, t).text}`,
                  })}{" "}
                  <code className="font-mono">({reviewError})</code>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  data-testid="meeting-review-submit"
                  disabled={
                    reviewBusy ||
                    !trimmedReviewNote ||
                    reviewNoteCharCount > MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS
                  }
                >
                  {reviewBusy
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
              className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground"
              data-testid="meeting-review-read-only"
            >
              {t("meetingsCenter.detail.review.readOnlyNotice", {
                defaultValue:
                  "Read-only view: you may inspect the synthesis review reason, deliberation transcript, shared case-file facts, and review status without write controls.",
              })}
            </div>
          )}
        </Card>
      ) : null}

      {/* 2. MT-4 Attribution Record (above rounds when present, per design §12.9) */}
      {m.attribution_record ? (
        <Card className="p-4 space-y-2" data-testid="meeting-detail-attribution">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {t("meetingsCenter.detail.attributionTitle", {
                defaultValue: "Outlier Performance Attribution Record (MT-4)",
              })}
            </h2>
            <Badge variant="outline" className="font-mono">
              {m.attribution_record.record_id}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
            <div>
              Subject: {m.attribution_record.subject_kind ?? "—"}:{" "}
              {m.attribution_record.subject_id ?? m.attribution_record.agora_user_id ?? "—"}
            </div>
            <div>Direction: {m.attribution_record.direction ?? "—"}</div>
            <div>Sample Size: {m.attribution_record.sample_size ?? "—"}</div>
            <div>
              Luck Interval:{" "}
              {Array.isArray(m.attribution_record.luck_interval)
                ? `[${m.attribution_record.luck_interval.join(", ")}]`
                : "—"}
            </div>
            {m.attribution_record.account_id ? (
              <div>Account: {m.attribution_record.account_id}</div>
            ) : null}
            {Array.isArray(m.attribution_record.broker_ids) &&
            m.attribution_record.broker_ids.length > 0 ? (
              <div>Brokers: {m.attribution_record.broker_ids.join(", ")}</div>
            ) : null}
          </div>
          {m.attribution_record.decomposition ? (
            <div className="text-xs font-mono text-muted-foreground pt-1">
              Decomposition:{" "}
              {Object.entries(m.attribution_record.decomposition)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ")}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card id="meeting-discussion" className="space-y-4 p-4 sm:p-6" data-testid="meeting-detail-rounds">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("meetingsCenter.detail.roundsTitle")}</h2>
          {canRevealLabels ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={showReveal}
              data-testid="meeting-label-reveal-toggle"
              onClick={() => setShowReveal((prev) => !prev)}
            >
              {t(`meetingsCenter.detail.${showReveal ? "hideIdentities" : "showIdentities"}`)}
            </Button>
          ) : null}
        </div>
        {rounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("meetingsCenter.detail.noRounds")}</p>
        ) : (
          <ol className="space-y-5">
            {rounds.map((round) => (
              <li key={round.round} data-testid={`meeting-round-${round.round}`} className="space-y-3 border-l-2 border-primary/30 pl-3 sm:pl-4">
                <div>
                  <h3 className="font-semibold">
                    {t("meetingsCenter.detail.roundLabel", { round: round.round })}
                    {" · "}
                    {t(`meetingsCenter.detail.${round.round === 1 ? "independentRound" : round.round === 2 ? "responseRound" : "evidenceRound"}`)}
                  </h3>
                  {round.evidence_note ? <p className="break-words text-sm text-muted-foreground">{round.evidence_note}</p> : null}
                </div>
                {round.positions.length === 0 ? <p className="text-sm text-muted-foreground">{t("meetingsCenter.detail.noPositions")}</p> : null}
                <ul className="divide-y divide-border rounded-md border border-border bg-muted/10">
                  {round.positions.map((position, index) => {
                    const revealedId = canRevealLabels && showReveal
                      ? position.revealed_persona_id ?? labelReveal?.[position.label] ?? position.persona_id
                      : undefined;
                    const participant = revealedId ? m.participants.find((item) => item.persona_id === revealedId) : undefined;
                    const name = revealedId ? position.persona_display_name ?? participant?.persona_display_name : undefined;
                    const replies = round.round > 1
                      ? [
                          { label: "accepted", entries: position.accepted },
                          { label: "disputed", entries: position.disputed },
                        ]
                      : [];
                    return (
                      <li
                        key={`${position.label}-${index}`}
                        data-testid={`round-${round.round}-position-${position.label}`}
                        className="min-w-0 space-y-2 p-3 sm:p-4"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <strong data-testid={`round-${round.round}-anon-label-${position.label}`}>
                            {speakerLabel(position.label, position.role)}
                          </strong>
                          {revealedId ? (
                            <span data-testid={`round-${round.round}-revealed-${position.label}`} className="break-all text-muted-foreground">
                              {name || revealedId}
                            </span>
                          ) : null}
                          {round.round > 1 && typeof position.changed === "boolean" ? (
                            <Badge variant={position.changed ? "default" : "outline"}>
                              {t(`meetingsCenter.detail.${position.changed ? "changedPosition" : "unchangedPosition"}`)}
                            </Badge>
                          ) : null}
                        </div>
                        {position.stance ? <p className="break-words text-sm font-medium">{labelForStance(position.stance)}</p> : null}
                        {position.rationale || position.summary ? (
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{position.rationale || position.summary}</p>
                        ) : null}
                        {replies.map(({ label, entries }) => {
                          const text = Array.isArray(entries)
                            ? entries.filter((entry) => typeof entry === "string" && entry.trim() && entry !== "baseline_case_facts")
                            : [];
                          return text.length > 0 ? (
                            <div key={label} className="text-sm">
                              <span className="font-medium">{t(`meetingsCenter.detail.${label}`)}</span>
                              <ul className="ml-4 list-disc break-words">
                                {text.map((entry, entryIndex) => <li key={entryIndex}>{entry}</li>)}
                              </ul>
                            </div>
                          ) : null;
                        })}
                        {Array.isArray(position.citations) && position.citations.length > 0 ? (
                          <ul className="flex flex-wrap gap-2 text-xs">
                            {position.citations.map((citation, citationIndex) => {
                              const itemIndex = caseCitationIndex(m.case_file_items, citation);
                              return (
                                <li key={citationIndex} className="min-w-0">
                                  {itemIndex >= 0 ? (
                                    <a href={`#meeting-case-item-${itemIndex}`} onClick={openCaseFile} className="text-primary underline underline-offset-4">
                                      {t("meetingsCenter.detail.citationLink", { number: itemIndex + 1 })}
                                    </a>
                                  ) : (
                                    <span className="break-all text-muted-foreground">{t("meetingsCenter.detail.unmatchedCitation", { citation })}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {typeof position.confidence === "number" && Number.isFinite(position.confidence) ? (
                          <p className="text-xs text-muted-foreground">
                            {t("meetingsCenter.detail.confidence", {
                              value: new Intl.NumberFormat(i18n.resolvedLanguage, { style: "percent" }).format(position.confidence),
                            })}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {canRevealLabels && showReveal && labelReveal ? (
          <details className="rounded-md border border-border p-3 text-xs">
            <summary className="cursor-pointer font-medium">{t("meetingsCenter.detail.operatorRevealTitle")}</summary>
            <ul className="mt-2 space-y-1 break-all font-mono" data-testid="meeting-label-reveal">
              {Object.entries(labelReveal).map(([anonLabel, personaId]) => (
                <li key={anonLabel} data-testid={`label-reveal-${anonLabel}`}>{anonLabel} → {personaId}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      {/* 8. Proposals with Live Downstream Links */}
      <Card id="meeting-proposals" className="p-4 space-y-2" data-testid="meeting-detail-proposals">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.proposalsTitle", {
            defaultValue: "Proposals & Live Downstream Status",
          })}
        </h2>
        {proposals.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("meetingsCenter.detail.noProposals")}</p>
        ) : (
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li
                key={p.proposal_id}
                data-testid={`detail-proposal-${p.proposal_id}`}
                className="rounded border border-border p-3 text-xs flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{p.proposal_id}</span>
                  {p.kind ? <Badge variant="outline">{p.kind}</Badge> : null}
                  <span className="inline-flex items-center gap-1">
                    {t("meetingsCenter.detail.sponsor")}{" "}
                    <BffSubjectInline
                      id={p.sponsor_persona_id}
                      displayName={p.sponsor_persona_display_name ?? p.persona_display_name}
                      nameMissing={p.sponsor_persona_name_missing ?? p.persona_name_missing}
                      testIdPrefix={`detail-proposal-sponsor-${p.proposal_id}`}
                    />
                  </span>
                  {p.strategy_id || p.strategy_display_name ? (
                    <span className="inline-flex items-center gap-1">
                      {t("meetingsCenter.detail.strategy")}{" "}
                      <BffSubjectInline
                        id={p.strategy_id}
                        displayName={p.strategy_display_name}
                        nameMissing={p.strategy_name_missing}
                        testIdPrefix={`detail-proposal-strategy-${p.proposal_id}`}
                      />
                    </span>
                  ) : null}
                  {p.downstream?.status ? (() => {
                    const dsLabel = statusLabel(p.downstream.status, t);
                    return (
                      <Badge variant="secondary">
                        <span>{dsLabel}</span>
                        {dsLabel !== p.downstream.status ? (
                          <>
                            {" "}
                            <code className="ml-1 font-mono text-[10px] opacity-80">{p.downstream.status}</code>
                          </>
                        ) : null}
                      </Badge>
                    );
                  })() : null}
                </div>
                {p.downstream?.href ? (
                  <Link
                    to={p.downstream.href}
                    className="font-mono underline text-primary"
                    data-testid={`proposal-downstream-link-${p.proposal_id}`}
                  >
                    {t("meetingsCenter.detail.openProposal")} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <details id="meeting-sources" ref={caseFileRef}>
          <summary className="cursor-pointer text-base font-semibold">{t("meetingsCenter.detail.caseFileTitle")}</summary>
          <div className="mt-4 space-y-4">
            <section className="space-y-2" data-testid="meeting-detail-case-file">
              {typeof m.private_items_withheld === "number" && m.private_items_withheld > 0 ? (
                <p className="text-xs text-muted-foreground" data-testid="meeting-private-withheld-badge">
                  {t("meetingsCenter.detail.withheldPrivate", { count: m.private_items_withheld })}
                </p>
              ) : null}
              {m.case_file_items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("meetingsCenter.detail.noCaseItems")}</p>
              ) : (
                <ul className="space-y-2">
                  {m.case_file_items.map((item, index) => {
                    const itemContent = caseItemContent(item);
                    return (
                      <li
                        key={item.item_id}
                        id={`meeting-case-item-${index}`}
                        tabIndex={-1}
                        data-testid={`case-file-item-${item.item_id}`}
                        className="space-y-1 rounded-md border border-border p-3 text-sm target:border-primary"
                      >
                        <h3 className="font-medium">{t("meetingsCenter.detail.citationLink", { number: index + 1 })}</h3>
                        {itemContent ? (
                          <p className="whitespace-pre-wrap break-words">{itemContent}</p>
                        ) : (
                          <p>{item.status === "unavailable" ? t("meetingsCenter.detail.caseUnavailable") : t("meetingsCenter.detail.referenceOnlyNote")}</p>
                        )}
                        {item.unavailable_reason ? <p className="break-words">{reasonCodeDisplay(item.unavailable_reason, t).text}</p> : null}
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">{t("meetingsCenter.detail.referenceDetails")}</summary>
                          <p className="break-all font-mono">{[item.item_id, item.source_id, item.kind, item.source_owner, item.relevance_scope].filter(Boolean).join(" · ")}</p>
                          {item.raw_text && item.raw_text !== itemContent ? <p className="whitespace-pre-wrap break-words">{item.raw_text}</p> : null}
                          {item.agora_user_id || item.trader_id || item.account_id || item.broker_ids?.length ? (
                            <p className="break-all font-mono">{[item.agora_user_id ?? item.trader_id, item.account_id, ...(Array.isArray(item.broker_ids) ? item.broker_ids : [])].filter(Boolean).join(" · ")}</p>
                          ) : null}
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {agendaItems.length > 0 ? (
              <section className="space-y-2" data-testid="meeting-detail-agenda">
                <h3 className="text-sm font-semibold">{t("meetingsCenter.detail.agendaTitle")}</h3>
                <ol className="list-inside list-decimal space-y-1 text-sm">
                  {agendaItems.map((item, index) => <li key={index} className="break-words">{item}</li>)}
                </ol>
              </section>
            ) : null}
            {preReadItems.length > 0 ? (
              <section className="space-y-2" data-testid="meeting-detail-pre-read">
                <h3 className="text-sm font-semibold">{t("meetingsCenter.detail.preReadTitle")}</h3>
                <ul className="space-y-2">
                  {preReadItems.map((item, index) => (
                    <li key={`${item.persona_id}-${index}`} data-testid={`pre-read-item-${item.persona_id}`} className="space-y-1 rounded-md border border-border p-3 text-sm">
                        <BffSubjectInline id={item.persona_id} displayName={item.persona_display_name} nameMissing={item.persona_name_missing} />
                      {item.text || item.summary ? <p className="whitespace-pre-wrap break-words">{item.text || item.summary}</p> : null}
                      {Array.isArray(item.citations) && item.citations.length ? <p className="break-all text-xs text-muted-foreground">{item.citations.join(", ")}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </details>
      </Card>

      <Card className="p-4 sm:p-6">
        <details>
          <summary className="cursor-pointer text-base font-semibold">{t("meetingsCenter.detail.recordDetails")}</summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-1 break-all font-mono text-xs text-muted-foreground">
              <p>{[m.meeting_id, m.meeting_type, m.status, rawOutcome].filter(Boolean).join(" · ")}</p>
              {m.synthesis?.dissent_memo_id ? (
                <p data-testid="meeting-dissent-memo">{t("meetingsCenter.detail.dissentMemo")} {m.synthesis.dissent_memo_id}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div>
                {t("meetingsCenter.detail.roles.chair")}{" "}
                <BffSubjectInline
                  id={m.chair_persona_id}
                  displayName={m.chair_persona_display_name}
                  nameMissing={m.chair_persona_name_missing}
                  testIdPrefix="meeting-detail-chair"
                />
              </div>
              {m.strategy_id || m.strategy_display_name ? (
                <div>
                  {t("meetingsCenter.detail.strategy")}{" "}
                  <BffSubjectInline
                    id={m.strategy_id}
                    displayName={m.strategy_display_name}
                    nameMissing={m.strategy_name_missing}
                    testIdPrefix="meeting-detail-strategy"
                  />
                </div>
              ) : null}
              <div>
                {t("meetingsCenter.detail.convenedBy")}{" "}
                <code className="text-foreground">
                  {m.convened_by
                    ? `${m.convened_by.kind}${m.convened_by.id ? `:${m.convened_by.id}` : ""}`
                    : "—"}
                </code>
              </div>
            </div>

            {/* Participants / Roster */}
            <div className="pt-2 border-t border-border space-y-2" data-testid="meeting-detail-participants">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {t("meetingsCenter.detail.participantCount", { count: m.participants.length })}
              </h2>
              <div className="flex flex-wrap gap-2">
                {m.participants.map((p) => (
                  <div
                    key={`${p.persona_id}-${p.role ?? ""}`}
                    data-testid={`meeting-participant-${p.persona_id}`}
                    className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-xs space-y-0.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <BffSubjectInline
                        id={p.persona_id}
                        displayName={p.persona_display_name}
                        nameMissing={p.persona_name_missing}
                        testIdPrefix={`participant-${p.persona_id}`}
                      />
                      {p.role ? <Badge variant="outline">{labelForRole(p.role)}</Badge> : null}
                      {p.origin ? <Badge variant="secondary">{t(`meetingsCenter.detail.origins.${p.origin}`, { defaultValue: p.origin })}</Badge> : null}
                      {p.servant || p.origin === "private_servant" ? (
                        <Badge variant="outline" data-testid={`servant-flag-${p.persona_id}`}>
                          {t("meetingsCenter.detail.origins.private_servant")}
                        </Badge>
                      ) : null}
                    </div>
                    {p.agora_user_id || p.trader_id || p.account_id ? (
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {p.agora_user_id ?? p.trader_id ? `trader:${p.agora_user_id ?? p.trader_id}` : ""}
                        {p.account_id ? ` · account:${p.account_id}` : ""}
                        {Array.isArray(p.broker_ids) && p.broker_ids.length > 0
                          ? ` · brokers:${p.broker_ids.join(",")}`
                          : ""}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            {/* 9. Per-Participant Memory Writeback IDs (never private memory text) */}
            <section className="space-y-2" data-testid="meeting-detail-writebacks">
              <h2 className="text-sm font-semibold">
                {t("meetingsCenter.detail.writebacksTitle", {
                  defaultValue: "Per-Participant Memory Writeback IDs",
                })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("meetingsCenter.detail.noPrivateMemoryNote", {
                  defaultValue:
                    "Private memory text never enters a round or console view; only writeback IDs are recorded.",
                })}
              </p>
              {m.writebacks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("meetingsCenter.detail.noWritebacks")}</p>
              ) : (
                <ul className="space-y-1 text-xs font-mono">
                  {m.writebacks.map((wb) => (
                    <li
                      key={`${wb.persona_id}-${wb.entry_id}`}
                      data-testid={`writeback-${wb.persona_id}-${wb.entry_id}`}
                    >
                      <BffSubjectInline
                        id={wb.persona_id}
                        displayName={wb.persona_display_name}
                        nameMissing={wb.persona_name_missing}
                        testIdPrefix={`writeback-persona-${wb.persona_id}-${wb.entry_id}`}
                      />{" "}
                      → <code>{wb.entry_id}</code>
                      {wb.status ? ` (${wb.status})` : ""}
                      {wb.written_at ? ` · ${wb.written_at}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 10. Usage */}
            <section className="space-y-1" data-testid="meeting-detail-usage">
              <h2 className="text-sm font-semibold">
                {t("meetingsCenter.detail.usageTitle", { defaultValue: "Meeting Usage & Budget" })}
              </h2>
              <div className="text-xs font-mono text-muted-foreground">
                {t("meetingsCenter.detail.participantCount", { count: m.usage?.participants ?? m.participants.length })}
                {" · "}{t("meetingsCenter.detail.recordedRounds", { count: m.usage?.rounds ?? rounds.length })}
                {" · "}{m.usage?.calls === undefined ? t("meetingsCenter.detail.usageUnknown") : t("meetingsCenter.detail.usageCalls", { count: m.usage.calls })}
              </div>
            </section>
          </div>
        </details>
      </Card>
    </section>
  );
};
