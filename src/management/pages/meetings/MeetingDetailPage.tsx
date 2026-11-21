// Management Meeting Detail Page (FE-MANAGEMENT-MEETINGS-20261115, SD_PERSONA_MEETINGS_2026-11-15 §11.3 & §12.9).
// Shows:
//   - Header (type, topic, status, outcome, chair, convened_by, participants with Agora/servant flags & trader identity)
//   - MT-4 Outlier Performance Attribution Record (above rounds when present)
//   - Agenda
//   - Shared Case-File Facts (never private memory)
//   - Pre-Read Interpretations (scope:committee, never private memory)
//   - Rounds (Round 1 independent positions with confidence & citations; Round 2 anonymised labels + operator-only reveal)
//   - Chair Synthesis & Dissent (non-binding tally, dissent memo)
//   - Proposals with live downstream links
//   - Per-Participant Memory Writeback IDs (never private memory text)
//   - Usage
// Renders an honest not-found on 404 and explicit unavailable with reason on consultation owner outage.

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
  collectMeetingEvidenceRefs,
  conveneMeeting,
  countMeetingReviewNoteChars,
  getMeetingDetail,
  normalizeOperatorReview,
  registerMeetingQueryClient,
  resolveMeetingReviewCause,
  reviewMeeting,
  stripPrivateMemory,
  type ConveneMeetingReceipt,
  type MeetingDetail,
  type MeetingPreReadInterpretation,
  type MeetingsRead,
} from "@/lib/bff-v1/meetings";

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

export const MeetingDetailPage = () => {
  const { id = "" } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const access = useAgoraWriteAccess();
  registerMeetingQueryClient(useContext(QueryClientContext));
  const [read, setRead] = useState<MeetingsRead<MeetingDetail> | null>(null);
  const [showReveal, setShowReveal] = useState(true);
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
  const agendaItems = formatAgenda(m.agenda);
  const preReadItems = extractPreReadList(m.pre_read);
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
  const evidenceRefs = collectMeetingEvidenceRefs(m as unknown as Record<string, unknown>);
  const totalPositionsCount = m.rounds.reduce(
    (acc, r) => acc + (Array.isArray(r.positions) ? r.positions.length : 0),
    0,
  );
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

      {/* 1. Header & Roster */}
      <Card className="p-5 space-y-3" data-testid="meeting-detail-header">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold font-mono text-foreground">{m.meeting_id}</h1>
            <Badge variant="outline">{m.meeting_type}</Badge>
            <Badge variant="outline">{statusLabel(m.status, t)}</Badge>
            {m.outcome ? (() => {
              const outcomeDisplay = reasonCodeDisplay(m.outcome, t);
              return (
                <Badge variant={isReview ? "destructive" : "secondary"}>
                  <span>{outcomeDisplay.text}</span>
                  {outcomeDisplay.code && outcomeDisplay.code !== outcomeDisplay.text ? (
                    <>
                      {" "}
                      <code className="ml-1 font-mono text-[10px] opacity-80">{outcomeDisplay.code}</code>
                    </>
                  ) : null}
                </Badge>
              );
            })() : null}
            <Badge variant="outline">{t("meetingsCenter.authorityBadge")}</Badge>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            created: {m.created_at ?? "—"}
            {m.closed_at ? ` · closed: ${m.closed_at}` : ""}
          </div>
        </div>
        {m.topic ? <p className="text-base font-medium text-foreground">{m.topic}</p> : null}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>
            Chair / Sponsor:{" "}
            <BffSubjectInline
              id={m.chair_persona_id}
              displayName={m.chair_persona_display_name}
              nameMissing={m.chair_persona_name_missing}
              testIdPrefix="meeting-detail-chair"
            />
          </div>
          {m.strategy_id || m.strategy_display_name ? (
            <div>
              Strategy:{" "}
              <BffSubjectInline
                id={m.strategy_id}
                displayName={m.strategy_display_name}
                nameMissing={m.strategy_name_missing}
                testIdPrefix="meeting-detail-strategy"
              />
            </div>
          ) : null}
          <div>
            Convened By:{" "}
            <code className="text-foreground">
              {m.convened_by
                ? `${m.convened_by.kind}${m.convened_by.id ? `:${m.convened_by.id}` : ""}`
                : "—"}
            </code>
          </div>
          <div>
            Round: <code className="text-foreground">{m.round ?? m.rounds?.length ?? 1}</code>
          </div>
        </div>

        {/* Participants / Roster */}
        <div className="pt-2 border-t border-border space-y-2" data-testid="meeting-detail-participants">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Participants ({m.participants.length})
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
                  {p.role ? <Badge variant="outline">{p.role}</Badge> : null}
                  {p.origin ? <Badge variant="secondary">{p.origin}</Badge> : null}
                  {p.servant || p.origin === "private_servant" ? (
                    <Badge variant="outline" data-testid={`servant-flag-${p.persona_id}`}>
                      servant
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
            <code className="text-xs font-mono text-muted-foreground">
              meeting_review:{m.meeting_id}
            </code>
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
            {m.synthesis?.summary ? (
              <p
                className="text-xs font-mono text-muted-foreground"
                data-testid="meeting-review-synthesis-summary"
              >
                synthesis: {m.synthesis.summary}
              </p>
            ) : null}
          </div>

          {/* Actual Available Transcript & Case-File Summary Alongside Reason */}
          <div
            className="rounded border border-border p-3.5 space-y-2 text-xs"
            data-testid="meeting-review-transcript-summary"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">
                {t("meetingsCenter.detail.review.transcriptSummaryTitle", {
                  defaultValue: "Available Transcript & Case-File Summary",
                })}
              </h3>
              <span className="font-mono text-muted-foreground">
                {t("meetingsCenter.detail.review.transcriptSummaryStatsFmt", {
                  rounds: m.rounds.length,
                  positions: totalPositionsCount,
                  caseFiles: m.case_file_items.length,
                  proposals: proposals.length,
                  defaultValue: `${m.rounds.length} deliberation round(s) (${totalPositionsCount} recorded position(s)), ${m.case_file_items.length} shared case-file item(s), ${proposals.length} proposal(s)`,
                })}
              </span>
            </div>
            {m.rounds.length === 0 ? (
              <p className="text-muted-foreground">
                {t("meetingsCenter.detail.review.transcriptEmpty", {
                  defaultValue: "No deliberation round positions were recorded for this meeting.",
                })}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {m.rounds.map((r) => (
                  <li
                    key={`review-round-summary-${r.round}`}
                    className="rounded bg-muted/15 px-2.5 py-1.5 space-y-1"
                  >
                    <div className="font-mono font-semibold text-foreground">
                      {t("meetingsCenter.detail.roundLabel", {
                        round: r.round,
                        defaultValue: `Round ${r.round}`,
                      })}
                      {r.evidence_note ? ` · ${r.evidence_note}` : ""}
                    </div>
                    {r.positions.map((pos, idx) => (
                      <div
                        key={`review-pos-${r.round}-${pos.label}-${idx}`}
                        className="pl-2 border-l border-border text-muted-foreground"
                      >
                        <span className="font-mono text-foreground">{pos.label}</span>
                        {pos.stance ? (
                          <>
                            {" "}
                            · <span className="font-mono font-medium text-foreground">{pos.stance}</span>
                          </>
                        ) : null}
                        {pos.rationale || pos.summary ? (
                          <span> — {pos.rationale ?? pos.summary}</span>
                        ) : null}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            {m.case_file_items.length > 0 ? (
              <div className="pt-1 space-y-1">
                {m.case_file_items.map((cf) => (
                  <div key={`review-cf-${cf.item_id}`} className="text-muted-foreground">
                    <code className="font-mono text-foreground">{cf.item_id}</code>
                    {cf.excerpt || cf.raw_text ? `: ${cf.excerpt ?? cf.raw_text}` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Evidence Citations & Case-File References */}
          <div
            className="rounded border border-border p-3.5 space-y-2 text-xs"
            data-testid="meeting-review-evidence"
          >
            <h3 className="font-semibold text-foreground">
              {t("meetingsCenter.detail.review.evidenceTitle", {
                defaultValue: "Evidence Citations & Case-File References",
              })}
            </h3>
            {evidenceRefs.length > 0 ? (
              <ul
                className="flex flex-wrap gap-1.5"
                data-testid="meeting-review-evidence-list"
              >
                {evidenceRefs.map((ref) => (
                  <li key={ref}>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                      {ref}
                    </code>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="text-muted-foreground"
                data-testid="meeting-review-evidence-empty"
              >
                {t("meetingsCenter.detail.review.evidenceEmpty", {
                  defaultValue:
                    "No case-file citations or evidence references were recorded on this meeting.",
                })}
              </p>
            )}
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

      {/* 3. Agenda */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-agenda">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.agendaTitle", { defaultValue: "Agenda" })}
        </h2>
        {agendaItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No agenda items recorded.</p>
        ) : (
          <ol className="list-decimal list-inside space-y-1 text-sm">
            {agendaItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ol>
        )}
      </Card>

      {/* 4. Case-File Items */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-case-file">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t("meetingsCenter.detail.caseFileTitle", {
              defaultValue: "Shared Case-File Facts",
            })}
          </h2>
          {typeof m.private_items_withheld === "number" && m.private_items_withheld > 0 ? (
            <Badge variant="outline" data-testid="meeting-private-withheld-badge">
              {m.private_items_withheld} private item(s) withheld by protocol
            </Badge>
          ) : null}
        </div>
        {m.case_file_items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No shared case-file items recorded.</p>
        ) : (
          <ul className="space-y-2">
            {m.case_file_items.map((cf) => (
              <li
                key={cf.item_id}
                data-testid={`case-file-item-${cf.item_id}`}
                className="rounded border border-border p-3 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{cf.item_id}</span>
                  {cf.kind ? <Badge variant="outline">{cf.kind}</Badge> : null}
                  {cf.source_owner ? <Badge variant="secondary">{cf.source_owner}</Badge> : null}
                  {cf.relevance_scope ? (
                    <span className="font-mono text-muted-foreground">
                      scope:{cf.relevance_scope}
                    </span>
                  ) : null}
                </div>
                {cf.excerpt ? <p className="text-sm text-foreground">{cf.excerpt}</p> : null}
                {cf.raw_text ? (
                  <p className="text-xs font-mono text-muted-foreground">{cf.raw_text}</p>
                ) : null}
                {cf.agora_user_id || cf.account_id ? (
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {cf.agora_user_id ? `trader:${cf.agora_user_id}` : ""}
                    {cf.account_id ? ` · account:${cf.account_id}` : ""}
                    {Array.isArray(cf.broker_ids) && cf.broker_ids.length > 0
                      ? ` · brokers:${cf.broker_ids.join(",")}`
                      : ""}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 5. Pre-Read Interpretations */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-pre-read">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.preReadTitle", {
            defaultValue: "Pre-Read Interpretations (scope:committee)",
          })}
        </h2>
        {preReadItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pre-read interpretations recorded.</p>
        ) : (
          <ul className="space-y-2">
            {preReadItems.map((interp, idx) => (
              <li
                key={`${interp.persona_id}-${idx}`}
                data-testid={`pre-read-item-${interp.persona_id}`}
                className="rounded border border-border p-3 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <BffSubjectInline
                    id={interp.persona_id}
                    displayName={interp.persona_display_name}
                    nameMissing={interp.persona_name_missing}
                    testIdPrefix={`pre-read-persona-${interp.persona_id}`}
                  />
                  {interp.relevance_scope ? (
                    <Badge variant="outline">scope:{interp.relevance_scope}</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-foreground">
                  {interp.text ?? interp.summary ?? "—"}
                </p>
                {Array.isArray(interp.citations) && interp.citations.length > 0 ? (
                  <div className="font-mono text-muted-foreground">
                    citations: {interp.citations.join(", ")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 6. Deliberation Rounds (Round 1 & Round 2 with anonymised labels + operator-only reveal) */}
      <Card className="p-4 space-y-4" data-testid="meeting-detail-rounds">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t("meetingsCenter.detail.roundsTitle", { defaultValue: "Deliberation Rounds" })}
          </h2>
          {canRevealLabels ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="meeting-label-reveal-toggle"
              onClick={() => setShowReveal((prev) => !prev)}
            >
              {showReveal ? "Hide Operator Label Reveal" : "Show Operator Label Reveal"}
            </Button>
          ) : null}
        </div>

        {/* Operator-only label reveal table */}
        {canRevealLabels && showReveal && labelReveal ? (
          <div
            className="rounded border border-primary/30 bg-primary/5 p-3 text-xs space-y-1"
            data-testid="meeting-label-reveal"
          >
            <div className="font-semibold text-foreground">
              {t("meetingsCenter.detail.operatorRevealTitle", {
                defaultValue: "Operator-Only Anonymised Label Reveal",
              })}
            </div>
            <ul className="space-y-0.5 font-mono">
              {Object.entries(labelReveal).map(([anonLabel, personaId]) => (
                <li key={anonLabel} data-testid={`label-reveal-${anonLabel}`}>
                  {anonLabel} → <span className="font-semibold text-foreground">{personaId}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {m.rounds.length === 0 ? (
          <p className="text-xs text-muted-foreground">No deliberation rounds recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {m.rounds.map((r) => (
              <div
                key={r.round}
                data-testid={`meeting-round-${r.round}`}
                className="rounded border border-border p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider">
                    {t("meetingsCenter.detail.roundLabel", {
                      round: r.round,
                      defaultValue: `Round ${r.round}`,
                    })}
                    {r.round === 1
                      ? " — Independent Positions"
                      : r.round === 2
                        ? " — Anonymised Cross-Visibility & Devil's Advocate"
                        : " — Evidence Round"}
                  </h3>
                  {r.evidence_note ? (
                    <span className="text-xs font-mono text-muted-foreground">
                      {r.evidence_note}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {r.positions.map((pos, idx) => {
                    const revealedPersona =
                      canRevealLabels && showReveal
                        ? (pos.revealed_persona_id ??
                          pos.persona_id ??
                          (pos.label && labelReveal ? labelReveal[pos.label] : undefined))
                        : undefined;
                    return (
                      <div
                        key={`${r.round}-${pos.label}-${idx}`}
                        data-testid={`round-${r.round}-position-${pos.label}`}
                        className="rounded border border-border/70 bg-muted/10 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="font-mono font-semibold"
                              data-testid={`round-${r.round}-anon-label-${pos.label}`}
                            >
                              {pos.label}
                            </span>
                            {revealedPersona ? (
                              <Badge
                                variant="secondary"
                                className="font-mono"
                                data-testid={`round-${r.round}-revealed-${pos.label}`}
                              >
                                operator reveal: {revealedPersona}
                              </Badge>
                            ) : null}
                            {pos.role ? <Badge variant="outline">{pos.role}</Badge> : null}
                            {pos.style ? <Badge variant="outline">{pos.style}</Badge> : null}
                            {pos.changed !== undefined ? (
                              <Badge variant={pos.changed ? "default" : "outline"}>
                                {pos.changed ? "position changed" : "position unchanged"}
                              </Badge>
                            ) : null}
                          </div>
                          {typeof pos.confidence === "number" ? (
                            <span className="font-mono">
                              confidence: {(pos.confidence * 100).toFixed(0)}% ({pos.confidence})
                            </span>
                          ) : null}
                        </div>
                        {pos.stance ? (
                          <div className="text-sm text-foreground">
                            Stance: <span className="font-mono font-medium">{pos.stance}</span>
                          </div>
                        ) : null}
                        {pos.rationale || pos.summary ? (
                          <p className="text-muted-foreground">{pos.rationale ?? pos.summary}</p>
                        ) : null}
                        {Array.isArray(pos.citations) && pos.citations.length > 0 ? (
                          <div className="font-mono text-muted-foreground">
                            citations: {pos.citations.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 7. Chair Synthesis & Dissent */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-synthesis">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.synthesisTitle", {
            defaultValue: "Chair Synthesis & Dissent",
          })}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span>
            Outcome:{" "}
            {(() => {
              const rawOutcome = m.synthesis?.outcome ?? m.outcome;
              if (!rawOutcome) return <strong>—</strong>;
              const outcomeDisplay = reasonCodeDisplay(rawOutcome, t);
              return (
                <>
                  <strong className="font-sans">{outcomeDisplay.text}</strong>
                  {outcomeDisplay.code && outcomeDisplay.code !== outcomeDisplay.text ? (
                    <>
                      {" "}
                      <code className="font-mono text-muted-foreground">({outcomeDisplay.code})</code>
                    </>
                  ) : null}
                </>
              );
            })()}
          </span>
          {m.synthesis?.tally ? (
            <span data-testid="meeting-synthesis-tally">
              Tally (non-binding): support={m.synthesis.tally.support ?? "—"} · dissent=
              {m.synthesis.tally.dissent ?? "—"} · binding=
              {String(m.synthesis.tally.binding ?? false)}
            </span>
          ) : null}
          {m.synthesis?.dissent_memo_id ? (
            <span data-testid="meeting-dissent-memo">
              Dissent Memo: <code>{m.synthesis.dissent_memo_id}</code>
            </span>
          ) : null}
        </div>
        {m.synthesis?.summary ? (
          <p className="text-sm text-foreground">{m.synthesis.summary}</p>
        ) : null}
      </Card>

      {/* 8. Proposals with Live Downstream Links */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-proposals">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.proposalsTitle", {
            defaultValue: "Proposals & Live Downstream Status",
          })}
        </h2>
        {proposals.length === 0 ? (
          <p className="text-xs text-muted-foreground">No proposals issued in this meeting.</p>
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
                    Sponsor:{" "}
                    <BffSubjectInline
                      id={p.sponsor_persona_id}
                      displayName={p.sponsor_persona_display_name ?? p.persona_display_name}
                      nameMissing={p.sponsor_persona_name_missing ?? p.persona_name_missing}
                      testIdPrefix={`detail-proposal-sponsor-${p.proposal_id}`}
                    />
                  </span>
                  {p.strategy_id || p.strategy_display_name ? (
                    <span className="inline-flex items-center gap-1">
                      Strategy:{" "}
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
                    {p.downstream.target ?? "downstream"}
                    {p.downstream.id ? ` (${p.downstream.id})` : ""} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 9. Per-Participant Memory Writeback IDs (never private memory text) */}
      <Card className="p-4 space-y-2" data-testid="meeting-detail-writebacks">
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
          <p className="text-xs text-muted-foreground">No memory writeback IDs recorded.</p>
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
      </Card>

      {/* 10. Usage */}
      <Card className="p-4 space-y-1" data-testid="meeting-detail-usage">
        <h2 className="text-sm font-semibold">
          {t("meetingsCenter.detail.usageTitle", { defaultValue: "Meeting Usage & Budget" })}
        </h2>
        <div className="text-xs font-mono text-muted-foreground">
          participants: <strong className="text-foreground">{m.usage?.participants ?? m.participants.length}</strong>
          {" · "}rounds: <strong className="text-foreground">{m.usage?.rounds ?? m.rounds.length}</strong>
          {" · "}calls: <strong className="text-foreground">{m.usage?.calls ?? "—"}</strong>
        </div>
      </Card>
    </section>
  );
};
