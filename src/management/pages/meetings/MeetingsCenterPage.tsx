// Management Meetings Center (FE-MANAGEMENT-MEETINGS-20261115, SD_PERSONA_MEETINGS_2026-11-15 §11.3).
// Four tabs via ?tab=:
//   - upcoming (open / triggered / convened / in round)
//   - history  (closed, with outcome)
//   - proposals (every proposal with sponsor and live downstream status link)
//   - rules / budget (meeting types, M9 budget caps, per-persona schedule & weekly count, refusals)
// Reads only the BFF meetings routes. Includes write-gated operator Convene action with Idempotency-Key.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";
import { reasonCodeDisplay, resolveBffSubjectDisplay, statusLabel } from "@/lib/enumLabels";
import { CANONICAL_CENTERS } from "@/management/navigation/managementRouteManifest";
import {
  conveneMeeting,
  formatMeetingRosterRule,
  getMeetingCatalogue,
  getMeetingProposals,
  getMeetings,
  type ConveneMeetingReceipt,
  type MeetingCatalogueData,
  type MeetingProposalItem,
  type MeetingProposalsData,
  type MeetingsListData,
  type MeetingsRead,
  type MeetingSummaryItem,
} from "@/lib/bff-v1/meetings";

import {
  collectGatePanelReviewers,
  extractGatePanelPoolVersion,
  formatGatePanelConclusionText,
  formatGatePanelDecisionLabel,
  formatGatePanelTitle,
  formatMeetingDateTimeText,
  isFailedMeeting,
  isGatePanelHistoryItem,
  isGatePanelMeeting,
  isGatePanelOperatorDecisionRequired,
  isGatePanelTypeFilter,
  matchesMeetingTypeFilter,
  meetingLastError,
  meetingTopicText,
  resolveGatePanelSubjectPersona,
} from "./meetingDisplay";

const CENTER = CANONICAL_CENTERS.meetings;

const MEETING_TYPES = [
  { id: "MT-1", label: "MT-1 Pool Evolution Review (池子演進會議)" },
  { id: "MT-2", label: "MT-2 Optimisation Review (優化會議)" },
  { id: "MT-3", label: "MT-3 Strategy Ideation (新策略發想會議)" },
  { id: "MT-4", label: "MT-4 Performance Attribution Review (績效歸因檢討)" },
  { id: "MT-5", label: "MT-5 Regime Interpretation (盤勢研判會議)" },
  { id: "MT-6", label: "MT-6 Quarterly Review (季度檢討會議)" },
] as const;

export const FILTERABLE_MEETING_TYPES = [
  "MT-1",
  "MT-2",
  "MT-3",
  "MT-4",
  "MT-5",
  "MT-6",
  "gate_panel",
] as const;

const CLOSED_STATUSES = new Set(["closed", "completed"]);
const TERMINAL_NON_OPEN = new Set(["closed", "completed", "refused", "cancelled", "canceled"]);

export function normalizeMeetingsTab(value: string | null): "upcoming" | "history" | "proposals" | "rules" {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "upcoming" || v === "open") return "upcoming";
  if (v === "history" || v === "closed") return "history";
  if (v === "proposals") return "proposals";
  if (v === "rules" || v === "budget" || v === "catalogue") return "rules";
  return "upcoming";
}

function UnavailableSurface({
  reason,
  owner,
  testId,
}: {
  reason: string;
  owner?: string;
  testId: string;
}) {
  const { t } = useTranslation();
  const reasonDisplay = reasonCodeDisplay(reason, t);
  return (
    <Card
      role="status"
      data-testid={testId}
      className="border-dashed p-4 text-sm text-muted-foreground space-y-1"
    >
      <div className="font-medium text-foreground">
        {t("meetingsCenter.unavailable", { defaultValue: "Consultation meetings surface is unavailable" })}
      </div>
      <div className="font-mono text-xs">
        reason: <span className="font-sans text-foreground">{reasonDisplay.text}</span>
        {reasonDisplay.code && reasonDisplay.code !== reasonDisplay.text ? (
          <>
            {" "}
            <code>{reasonDisplay.code}</code>
          </>
        ) : null}
        {owner ? (
          <>
            {" · "}owner: <code>{owner}</code>
          </>
        ) : null}
      </div>
    </Card>
  );
}

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
        className={resolved.hasDisplayName ? "font-sans font-medium text-foreground" : "font-mono text-foreground"}
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

function MeetingRowCard({
  meeting,
  testId,
}: {
  meeting: MeetingSummaryItem;
  testId: string;
}) {
  const { t } = useTranslation();
  const href = meeting.href || `/management/meetings/${encodeURIComponent(meeting.meeting_id)}`;

  if (isGatePanelMeeting(meeting)) {
    const titleText = formatGatePanelTitle(meeting, t);
    const conclusionText = formatGatePanelConclusionText(meeting, t);
    const decisionLabel = formatGatePanelDecisionLabel(meeting, t);
    const operatorRequired = isGatePanelOperatorDecisionRequired(meeting);
    const panelTimestamp = meeting.completed_at ?? meeting.closed_at ?? meeting.created_at ?? null;
    const formattedDateTime = formatMeetingDateTimeText(panelTimestamp);
    const subject = resolveGatePanelSubjectPersona(meeting, t);
    const poolVersion = extractGatePanelPoolVersion(meeting);
    const reviewers = collectGatePanelReviewers(meeting, t);

    return (
      <Card
        className="p-4 space-y-2"
        data-testid={testId}
        data-session-class="gate_panel"
      >
        <div
          className="text-sm font-semibold text-foreground"
          data-testid={`meeting-title-${meeting.meeting_id}`}
        >
          <Link to={href} className="hover:underline">
            {titleText}
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" data-testid={`meeting-type-badge-${meeting.meeting_id}`}>
              {t("meetingsCenter.typeName.gate_panel")}
            </Badge>
            <Badge variant="outline">{statusLabel(meeting.status, t)}</Badge>
            <Badge
              variant={operatorRequired ? "destructive" : "secondary"}
              data-testid={`meeting-gate-decision-${meeting.meeting_id}`}
            >
              {decisionLabel}
            </Badge>
            <Link
              to={href}
              className="text-xs text-primary underline"
              data-testid={`meeting-link-${meeting.meeting_id}`}
            >
              {t("meetingsCenter.gatePanel.viewDetail")}
            </Link>
          </div>
          <time
            dateTime={panelTimestamp ?? undefined}
            className="text-xs font-mono text-muted-foreground"
            data-testid={`meeting-datetime-${meeting.meeting_id}`}
          >
            {formattedDateTime}
          </time>
        </div>
        <p
          className="text-sm text-foreground"
          data-testid={`meeting-conclusion-${meeting.meeting_id}`}
        >
          {conclusionText}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {t("meetingsCenter.gatePanel.subjectPersonaLabel")}:{" "}
            <span
              className="font-sans font-medium text-foreground"
              data-testid={`meeting-subject-${meeting.meeting_id}-primary`}
            >
              {subject.name}
            </span>
          </span>
          {poolVersion ? (
            <span>
              {t("meetingsCenter.gatePanel.poolVersionLabel")}:{" "}
              <code className="text-foreground">
                {t("meetingsCenter.gatePanel.poolVersionFmt", { version: poolVersion })}
              </code>
            </span>
          ) : null}
          {reviewers.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {t("meetingsCenter.gatePanel.reviewersLabel")}:{" "}
              {reviewers.map((rev, idx) => (
                <span key={`${rev.key}-${idx}`} className="inline-flex items-center gap-1">
                  {idx > 0 ? <span>、</span> : null}
                  <span className="font-medium text-foreground">{rev.displayName}</span>
                  <span>（{rev.roleLabel}）</span>
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </Card>
    );
  }

  const isReview =
    String(meeting.outcome ?? "").toUpperCase() === "REVIEW" ||
    String(meeting.status ?? "").toUpperCase() === "REVIEW";
  const outcomeDisplay = meeting.outcome ? reasonCodeDisplay(meeting.outcome, t) : null;
  const failed = isFailedMeeting(meeting);
  const typeLabel = t(`meetingsCenter.typeName.${meeting.meeting_type}`, { defaultValue: meeting.meeting_type });
  const chair = resolveBffSubjectDisplay(
    {
      id: meeting.chair_persona_id,
      displayName: meeting.chair_persona_display_name,
      nameMissing: meeting.chair_persona_name_missing,
    },
    t,
  );
  const topicText = meetingTopicText(meeting, t);
  const titleParts = [typeLabel, chair.primaryText !== "—" ? chair.primaryText : ""].filter(Boolean);
  const lastErrorRaw = meetingLastError(meeting);
  const lastErrorText = lastErrorRaw ? reasonCodeDisplay(lastErrorRaw, t).text : "";

  return (
    <Card className="p-4 space-y-2" data-testid={testId} data-execution-failed={failed ? "true" : undefined}>
      <div className="text-sm font-semibold text-foreground" data-testid={`meeting-title-${meeting.meeting_id}`}>
        {titleParts.join(" · ")}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={href}
            className="font-mono text-xs text-muted-foreground underline"
            data-testid={`meeting-link-${meeting.meeting_id}`}
          >
            {meeting.meeting_id}
          </Link>
          <Badge variant="outline">{meeting.meeting_type}</Badge>
          {failed ? (
            <Badge variant="destructive" data-testid={`meeting-execution-failed-${meeting.meeting_id}`}>
              {t("meetingsCenter.executionFailed")}
            </Badge>
          ) : (
            <Badge variant="outline">{statusLabel(meeting.status, t)}</Badge>
          )}
          {outcomeDisplay ? (
            <Badge variant={isReview ? "destructive" : "secondary"}>
              <span>{outcomeDisplay.text}</span>
              {outcomeDisplay.code && outcomeDisplay.code !== outcomeDisplay.text ? (
                <>
                  {" "}
                  <code className="ml-1 font-mono text-[10px] opacity-80">{outcomeDisplay.code}</code>
                </>
              ) : null}
            </Badge>
          ) : null}
          {meeting.has_agora_participants ? (
            <Badge variant="outline">Agora</Badge>
          ) : null}
          {meeting.has_private_servant ? (
            <Badge variant="outline">Private Servant</Badge>
          ) : null}
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {meeting.closed_at ?? meeting.created_at ?? "—"}
        </span>
      </div>
      {topicText ? (
        <p className="text-sm text-foreground" data-testid={`meeting-topic-${meeting.meeting_id}`}>
          {topicText}
        </p>
      ) : null}
      {failed && lastErrorText ? (
        <p className="text-sm text-destructive" data-testid={`meeting-last-error-${meeting.meeting_id}`}>
          {t("meetingsCenter.failureReason", { reason: lastErrorText })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          Chair:{" "}
          <BffSubjectInline
            id={meeting.chair_persona_id}
            displayName={meeting.chair_persona_display_name}
            nameMissing={meeting.chair_persona_name_missing}
            testIdPrefix={`meeting-chair-${meeting.meeting_id}`}
          />
        </span>
        {meeting.strategy_id || meeting.strategy_display_name ? (
          <span className="inline-flex items-center gap-1">
            Strategy:{" "}
            <BffSubjectInline
              id={meeting.strategy_id}
              displayName={meeting.strategy_display_name}
              nameMissing={meeting.strategy_name_missing}
              testIdPrefix={`meeting-strategy-${meeting.meeting_id}`}
            />
          </span>
        ) : null}
        {failed ? null : (
          <span>
            Round: <code className="text-foreground">{meeting.round ?? 1}</code>
          </span>
        )}
        <span>
          Participants:{" "}
          <code className="text-foreground">
            {meeting.participant_count ?? meeting.participants?.length ?? 0}
          </code>
        </span>
        {meeting.participants?.length ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            (
            {meeting.participants.map((p, idx) => (
              <span key={`${p.persona_id}-${idx}`} className="inline-flex items-center gap-1">
                {idx > 0 ? <span>, </span> : null}
                <BffSubjectInline
                  id={p.persona_id}
                  displayName={p.persona_display_name}
                  nameMissing={p.persona_name_missing}
                  testIdPrefix={`meeting-row-${meeting.meeting_id}-participant-${p.persona_id}`}
                />
              </span>
            ))}
            )
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function ProposalRowCard({ proposal }: { proposal: MeetingProposalItem }) {
  const { t } = useTranslation();
  const meetingHref =
    proposal.meeting_href ||
    (proposal.meeting_id ? `/management/meetings/${encodeURIComponent(proposal.meeting_id)}` : null);
  const ds = proposal.downstream ?? {};
  const dsStatusLabel = ds.status ? statusLabel(ds.status, t) : "";

  return (
    <Card className="p-4 space-y-2" data-testid={`meeting-proposal-row-${proposal.proposal_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{proposal.proposal_id}</span>
          {proposal.kind ? <Badge variant="outline">{proposal.kind}</Badge> : null}
          {ds.status ? (
            <Badge variant="secondary">
              <span>{dsStatusLabel}</span>
              {dsStatusLabel !== ds.status ? (
                <>
                  {" "}
                  <code className="ml-1 font-mono text-[10px] opacity-80">{ds.status}</code>
                </>
              ) : null}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {meetingHref && proposal.meeting_id ? (
            <Link
              to={meetingHref}
              className="font-mono underline text-primary"
              data-testid={`proposal-meeting-link-${proposal.proposal_id}`}
            >
              Meeting {proposal.meeting_id}
            </Link>
          ) : null}
          {ds.href ? (
            <Link
              to={ds.href}
              className="font-mono underline text-primary"
              data-testid={`proposal-downstream-link-${proposal.proposal_id}`}
            >
              Downstream: {ds.target ?? "target"}
              {ds.id ? ` (${ds.id})` : ""} →
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          Sponsor:{" "}
          <BffSubjectInline
            id={proposal.sponsor_persona_id}
            displayName={proposal.sponsor_persona_display_name ?? proposal.persona_display_name}
            nameMissing={proposal.sponsor_persona_name_missing ?? proposal.persona_name_missing}
            testIdPrefix={`proposal-sponsor-${proposal.proposal_id}`}
          />
        </span>
        {proposal.strategy_id || proposal.strategy_display_name ? (
          <span className="inline-flex items-center gap-1">
            Strategy:{" "}
            <BffSubjectInline
              id={proposal.strategy_id}
              displayName={proposal.strategy_display_name}
              nameMissing={proposal.strategy_name_missing}
              testIdPrefix={`proposal-strategy-${proposal.proposal_id}`}
            />
          </span>
        ) : null}
        <span>
          Downstream Target: <code className="text-foreground">{ds.target ?? "—"}</code>
        </span>
        {ds.id ? (
          <span>
            Downstream ID: <code className="text-foreground">{ds.id}</code>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export const MeetingsCenterPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawTabParam = params.get("tab");
  const typeFilter = (params.get("type") ?? "").trim();
  const personaFilter = (params.get("persona_id") ?? params.get("persona") ?? "").trim();
  const includeFailed = params.get("include_failed") === "true";

  const access = useAgoraWriteAccess();
  const writeAllowed =
    !access.loading &&
    (access.interactionAllowed !== undefined ? access.interactionAllowed : access.writeAllowed);
  const writeDisabledReason = access.loading
    ? null
    : (access.interactionDisabledReason ?? access.writeDisabledReason ?? null);

  const [meetingsRead, setMeetingsRead] = useState<MeetingsRead<MeetingsListData> | null>(null);
  const [proposalsRead, setProposalsRead] = useState<MeetingsRead<MeetingProposalsData> | null>(null);
  const [catalogueRead, setCatalogueRead] = useState<MeetingsRead<MeetingCatalogueData> | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Convene form state
  const [conveneType, setConveneType] = useState<string>("MT-1");
  const [conveneTopic, setConveneTopic] = useState<string>("");
  const [conveneParticipants, setConveneParticipants] = useState<string>("");
  const [conveneAttributionId, setConveneAttributionId] = useState<string>("");
  const [conveneBusy, setConveneBusy] = useState(false);
  const [conveneReceipt, setConveneReceipt] = useState<ConveneMeetingReceipt | null>(null);
  const [conveneError, setConveneError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const filters = {
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(personaFilter ? { personaId: personaFilter } : {}),
      includeFailed,
    };
    void Promise.all([
      getMeetings(filters),
      getMeetingProposals(personaFilter ? { personaId: personaFilter } : {}),
      getMeetingCatalogue(personaFilter ? { personaId: personaFilter } : {}),
    ]).then(([mRes, pRes, cRes]) => {
      if (!live) return;
      setMeetingsRead(mRes);
      setProposalsRead(pRes);
      setCatalogueRead(cRes);
    });
    return () => {
      live = false;
    };
  }, [typeFilter, personaFilter, includeFailed, refreshTick]);

  const setActiveTab = useCallback(
    (nextTab: string) => {
      const next = new URLSearchParams(params);
      next.set("tab", normalizeMeetingsTab(nextTab));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setTypeFilter = useCallback(
    (nextType: string) => {
      const next = new URLSearchParams(params);
      const clean = nextType.trim();
      if (clean) {
        next.set("type", clean);
      } else {
        next.delete("type");
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const handleConvene = async (event: FormEvent) => {
    event.preventDefault();
    if (!writeAllowed) {
      setConveneError(writeDisabledReason ?? "Convene writes are disabled.");
      return;
    }
    const topic = conveneTopic.trim();
    if (!topic) return;
    setConveneBusy(true);
    setConveneError(null);
    setConveneReceipt(null);
    try {
      const participants = conveneParticipants
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await conveneMeeting({
        meeting_type: conveneType,
        topic,
        ...(participants.length > 0 ? { participants } : {}),
        ...(conveneAttributionId.trim()
          ? { attribution_record_id: conveneAttributionId.trim() }
          : {}),
      });
      if (res.state === "ok") {
        setConveneReceipt(res.data);
        setConveneTopic("");
        setRefreshTick((n) => n + 1);
      } else {
        setConveneError(res.reason);
      }
    } finally {
      setConveneBusy(false);
    }
  };

  const visibleMeetings = useMemo(() => {
    if (meetingsRead?.state !== "ok") return [];
    const base = includeFailed
      ? meetingsRead.data.items
      : meetingsRead.data.items.filter((m) => !isFailedMeeting(m));
    return base.filter((m) => matchesMeetingTypeFilter(m, typeFilter));
  }, [meetingsRead, includeFailed, typeFilter]);

  const deadLetterCount = useMemo(() => {
    if (meetingsRead?.state !== "ok") return undefined;
    const fromSummary = meetingsRead.data.summary?.dead_letter_count;
    if (typeof fromSummary === "number" && Number.isFinite(fromSummary)) return fromSummary;
    const local = meetingsRead.data.items.filter(isFailedMeeting).length;
    return local > 0 ? local : undefined;
  }, [meetingsRead]);

  const toggleIncludeFailed = useCallback(() => {
    const next = new URLSearchParams(params);
    if (includeFailed) next.delete("include_failed");
    else next.set("include_failed", "true");
    setParams(next, { replace: true });
  }, [params, setParams, includeFailed]);

  const upcomingItems = useMemo(
    () =>
      visibleMeetings.filter((m) => {
        if (isGatePanelMeeting(m)) {
          return !isGatePanelHistoryItem(m);
        }
        return (
          !TERMINAL_NON_OPEN.has(String(m.status ?? "").trim().toLowerCase()) ||
          isFailedMeeting(m)
        );
      }),
    [visibleMeetings],
  );

  const historyItems = useMemo(
    () =>
      visibleMeetings.filter((m) => {
        if (isGatePanelMeeting(m)) {
          return isGatePanelHistoryItem(m);
        }
        return (
          CLOSED_STATUSES.has(String(m.status ?? "").trim().toLowerCase()) &&
          !isFailedMeeting(m)
        );
      }),
    [visibleMeetings],
  );

  const activeTab = useMemo(() => {
    if (
      rawTabParam === null &&
      meetingsRead?.state === "ok" &&
      upcomingItems.length === 0 &&
      historyItems.length > 0
    ) {
      return "history";
    }
    return normalizeMeetingsTab(rawTabParam);
  }, [rawTabParam, meetingsRead, upcomingItems.length, historyItems.length]);

  return (
    <section
      className="p-6 space-y-6"
      aria-label={t("meetingsCenter.title", { defaultValue: "Meetings Center" })}
      data-testid="meetings-center-page"
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("meetingsCenter.title", { defaultValue: "Meetings Center" })}
          </h1>
          <Badge variant="outline" data-testid="meetings-authority-badge">{t("meetingsCenter.authorityBadge")}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("meetingsCenter.subtitle", {
            defaultValue:
              "Deliberative persona meetings, case-file interpretation exchange, governed proposal routing, and M9 budget rules.",
          })}
        </p>
      </header>

      {/* Operator Convene Deliberative Meeting Card */}
      <Card className="p-4 space-y-3" data-testid="meetings-convene-card">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t("meetingsCenter.convene.title", { defaultValue: "Convene Deliberative Meeting" })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("meetingsCenter.convene.subtitle", {
              defaultValue:
                "Operators may convene a deliberative meeting with a topic. A meeting executes nothing; proposals route through existing gates.",
            })}
          </p>
        </div>
        <form onSubmit={handleConvene} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label
              htmlFor="convene-meeting-type"
              className="block text-xs text-muted-foreground mb-1"
            >
              {t("meetingsCenter.convene.typeLabel", { defaultValue: "Meeting Type" })}
            </label>
            <select
              id="convene-meeting-type"
              aria-label="Meeting Type"
              data-testid="convene-meeting-type"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={conveneType}
              onChange={(e) => setConveneType(e.target.value)}
            >
              {MEETING_TYPES.map((mt) => (
                <option key={mt.id} value={mt.id}>
                  {mt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <label
              htmlFor="convene-meeting-topic"
              className="block text-xs text-muted-foreground mb-1"
            >
              {t("meetingsCenter.convene.topicLabel", { defaultValue: "Topic / Agenda" })}
            </label>
            <Input
              id="convene-meeting-topic"
              data-testid="convene-meeting-topic"
              className="h-9 text-xs"
              placeholder={t("meetingsCenter.convene.topicPlaceholder", {
                defaultValue: "Describe the topic or hypothesis to deliberate…",
              })}
              value={conveneTopic}
              onChange={(e) => setConveneTopic(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <label
              htmlFor="convene-meeting-participants"
              className="block text-xs text-muted-foreground mb-1"
            >
              {t("meetingsCenter.convene.participantsLabel", {
                defaultValue: "Participants (optional comma-separated persona IDs)",
              })}
            </label>
            <Input
              id="convene-meeting-participants"
              data-testid="convene-meeting-participants"
              className="h-9 text-xs font-mono"
              placeholder="persona-alpha, persona-risk-officer"
              value={conveneParticipants}
              onChange={(e) => setConveneParticipants(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            {conveneType === "MT-4" ? (
              <Input
                aria-label="Attribution Record ID"
                data-testid="convene-meeting-attribution-id"
                className="h-8 text-xs font-mono mb-1"
                placeholder="attr-001 (optional)"
                value={conveneAttributionId}
                onChange={(e) => setConveneAttributionId(e.target.value)}
              />
            ) : null}
            <Button
              type="submit"
              size="sm"
              data-testid="convene-meeting-submit"
              disabled={!writeAllowed || conveneBusy || !conveneTopic.trim()}
              title={
                !writeAllowed
                  ? (writeDisabledReason ?? "Convene disabled")
                  : !conveneTopic.trim()
                    ? "Enter a meeting topic to convene"
                    : undefined
              }
            >
              {conveneBusy
                ? t("meetingsCenter.convene.submitting", { defaultValue: "Convening…" })
                : t("meetingsCenter.convene.submit", { defaultValue: "Convene Meeting" })}
            </Button>
          </div>
        </form>
        {!writeAllowed && writeDisabledReason ? (
          <p className="text-xs text-muted-foreground" data-testid="meetings-write-disabled">
            {t("meetingsCenter.convene.writeDisabled", { defaultValue: "Convene disabled" })}:{" "}
            {writeDisabledReason}
          </p>
        ) : null}
        {conveneReceipt ? (
          <div
            className="rounded border border-border bg-muted/30 p-3 text-xs space-y-1"
            data-testid="convene-meeting-receipt"
          >
            <div className="font-semibold text-foreground">
              {t("meetingsCenter.convene.receiptTitle", { defaultValue: "Meeting Convened" })}:{" "}
              <Link
                to={`/management/meetings/${encodeURIComponent(conveneReceipt.meeting_id)}`}
                className="font-mono underline text-primary"
              >
                {conveneReceipt.meeting_id}
              </Link>{" "}
              ({conveneReceipt.status})
            </div>
          </div>
        ) : null}
        {conveneError ? (
          <div
            role="alert"
            data-testid="convene-meeting-error"
            className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
          >
            {conveneError}
          </div>
        ) : null}
      </Card>

      {meetingsRead?.state === "ok" && (deadLetterCount !== undefined || includeFailed) ? (
        <Card
          className="flex flex-wrap items-center justify-between gap-2 border-border/70 bg-muted/20 p-3 text-sm"
          data-testid="meetings-failed-banner"
        >
          <span data-testid="meetings-failed-text">
            {includeFailed
              ? t("meetingsCenter.showingFailed")
              : t("meetingsCenter.hiddenFailedWithCount", { count: deadLetterCount ?? 0 })}
          </span>
          <Button
            type="button"
            size="sm"
            variant={includeFailed ? "default" : "outline"}
            aria-pressed={includeFailed}
            data-testid="meetings-toggle-failed"
            onClick={toggleIncludeFailed}
          >
            {includeFailed
              ? t("meetingsCenter.hideFailed")
              : t("meetingsCenter.showFailedWithCount", { count: deadLetterCount ?? 0 })}
          </Button>
        </Card>
      ) : null}

      {/* Meeting Type Filter (six deliberative types + persona review panels) */}
      <div
        role="group"
        aria-label={t("meetingsCenter.filter.typeLabel")}
        data-testid="meetings-type-filter"
        className="flex flex-wrap items-center gap-1.5"
      >
        <span className="text-xs font-medium text-muted-foreground mr-1">
          {t("meetingsCenter.filter.typeLabel")}:
        </span>
        <Button
          type="button"
          size="sm"
          variant={typeFilter === "" ? "default" : "outline"}
          aria-pressed={typeFilter === ""}
          data-testid="meetings-type-filter-all"
          className="h-7 px-2.5 text-xs"
          onClick={() => setTypeFilter("")}
        >
          {t("meetingsCenter.filter.allTypes")}
        </Button>
        {FILTERABLE_MEETING_TYPES.map((typeId) => {
          const isGate = typeId === "gate_panel";
          const selected = isGate
            ? isGatePanelTypeFilter(typeFilter)
            : typeFilter.toUpperCase() === typeId;
          const label = isGate
            ? t("meetingsCenter.typeName.gate_panel")
            : `${typeId} ${t(`meetingsCenter.typeName.${typeId}`)}`;
          return (
            <Button
              key={typeId}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              data-testid={`meetings-type-filter-${typeId}`}
              className="h-7 px-2.5 text-xs"
              onClick={() => setTypeFilter(typeId)}
            >
              {label}
            </Button>
          );
        })}
      </div>

      {/* Four canonical tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start" data-testid="meetings-center-tabs">
          {CENTER.tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`meetings-tab-${tab.id}`}
            >
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab 1: Upcoming / Open */}
        <TabsContent value="upcoming" className="m-0 space-y-3" data-testid="meetings-panel-upcoming">
          {meetingsRead === null ? (
            <p className="text-sm text-muted-foreground" data-testid="meetings-loading">
              {t("common.loading", { defaultValue: "Loading…" })}
            </p>
          ) : meetingsRead.state !== "ok" ? (
            <UnavailableSurface
              reason={meetingsRead.reason}
              owner={meetingsRead.owner}
              testId="meetings-unavailable"
            />
          ) : upcomingItems.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground" data-testid="meetings-upcoming-empty">
              {t("meetingsCenter.empty.upcoming", {
                defaultValue: "No open or upcoming deliberative meetings.",
              })}
            </Card>
          ) : (
            <div className="space-y-2" data-testid="meetings-upcoming-list">
              {upcomingItems.map((m) => (
                <MeetingRowCard
                  key={m.meeting_id}
                  meeting={m}
                  testId={`meeting-row-${m.meeting_id}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: History */}
        <TabsContent value="history" className="m-0 space-y-3" data-testid="meetings-panel-history">
          {meetingsRead === null ? (
            <p className="text-sm text-muted-foreground" data-testid="meetings-history-loading">
              {t("common.loading", { defaultValue: "Loading…" })}
            </p>
          ) : meetingsRead.state !== "ok" ? (
            <UnavailableSurface
              reason={meetingsRead.reason}
              owner={meetingsRead.owner}
              testId="meetings-unavailable"
            />
          ) : historyItems.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground" data-testid="meetings-history-empty">
              {t("meetingsCenter.empty.history", {
                defaultValue: "No closed meetings recorded yet.",
              })}
            </Card>
          ) : (
            <div className="space-y-2" data-testid="meetings-history-list">
              {historyItems.map((m) => (
                <MeetingRowCard
                  key={m.meeting_id}
                  meeting={m}
                  testId={`meeting-history-row-${m.meeting_id}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Proposals */}
        <TabsContent value="proposals" className="m-0 space-y-3" data-testid="meetings-panel-proposals">
          {proposalsRead === null ? (
            <p className="text-sm text-muted-foreground" data-testid="meetings-proposals-loading">
              {t("common.loading", { defaultValue: "Loading…" })}
            </p>
          ) : proposalsRead.state !== "ok" ? (
            <UnavailableSurface
              reason={proposalsRead.reason}
              owner={proposalsRead.owner}
              testId="meetings-proposals-unavailable"
            />
          ) : proposalsRead.data.items.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground" data-testid="meetings-proposals-empty">
              {t("meetingsCenter.empty.proposals", {
                defaultValue: "No meeting proposals recorded yet.",
              })}
            </Card>
          ) : (
            <div className="space-y-2" data-testid="meetings-proposals-list">
              {proposalsRead.data.items.map((p) => (
                <ProposalRowCard key={p.proposal_id} proposal={p} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Rules & Budget (Catalogue, Schedule, Refusals) */}
        <TabsContent value="rules" className="m-0 space-y-4" data-testid="meetings-panel-rules">
          {catalogueRead === null ? (
            <p className="text-sm text-muted-foreground" data-testid="meetings-catalogue-loading">
              {t("common.loading", { defaultValue: "Loading…" })}
            </p>
          ) : catalogueRead.state !== "ok" ? (
            <UnavailableSurface
              reason={catalogueRead.reason}
              owner={catalogueRead.owner}
              testId="meetings-catalogue-unavailable"
            />
          ) : catalogueRead.data.types.length === 0 &&
            catalogueRead.data.schedule.length === 0 &&
            catalogueRead.data.refusals.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground" data-testid="meetings-catalogue-empty">
              {t("meetingsCenter.empty.catalogue", {
                defaultValue: "No meeting rules, schedules, or refusals recorded yet.",
              })}
            </Card>
          ) : (
            <div className="space-y-4" data-testid="meetings-catalogue-view">
              {/* Catalogue types & M9 budget caps */}
              <Card className="p-4 space-y-3" data-testid="meetings-catalogue-types">
                <h3 className="text-sm font-semibold">
                  Deliberative Meeting Types & M9 Budget Caps (Coordinator Proposals)
                </h3>
                {catalogueRead.data.types.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No meeting types configured.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {catalogueRead.data.types.map((mt) => (
                      <div
                        key={mt.meeting_type}
                        data-testid={`catalogue-type-${mt.meeting_type}`}
                        className="rounded border border-border p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-sm">{mt.meeting_type}</span>
                          <Badge variant={mt.enabled ? "default" : "outline"}>
                            {mt.enabled ? "enabled" : "disabled"}
                          </Badge>
                        </div>
                        <div>
                          Cadence: <code>{mt.cadence ?? "—"}</code> · Roster:{" "}
                          <code>{formatMeetingRosterRule(mt.roster_rule)}</code>
                        </div>
                        {mt.budget ? (
                          <div className="text-muted-foreground font-mono">
                            max_participants: {mt.budget.max_participants ?? 5} · max_rounds:{" "}
                            {mt.budget.max_rounds ?? 2} · weekly_limit:{" "}
                            {mt.budget.weekly_limit ?? 3}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Schedule & weekly count */}
              <Card className="p-4 space-y-3" data-testid="meetings-catalogue-schedule">
                <h3 className="text-sm font-semibold">Schedule & Per-Persona Cadence</h3>
                {catalogueRead.data.schedule.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No scheduled runs recorded.</p>
                ) : (
                  <ul className="space-y-1 text-xs font-mono">
                    {catalogueRead.data.schedule.map((s, idx) => (
                      <li
                        key={`${s.persona_id}-${s.meeting_type}-${idx}`}
                        data-testid={`catalogue-schedule-${s.persona_id}-${s.meeting_type}`}
                      >
                        <BffSubjectInline
                          id={s.persona_id}
                          displayName={s.persona_display_name}
                          nameMissing={s.persona_name_missing}
                          testIdPrefix={`catalogue-schedule-persona-${s.persona_id}-${s.meeting_type}`}
                        />{" "}
                        · {s.meeting_type} · last: {s.last_run_at ?? "—"} · next due:{" "}
                        {s.next_due_at ?? "—"}
                        {s.weekly_count !== undefined
                          ? ` · weekly: ${s.weekly_count}/${s.weekly_limit ?? 3}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Recorded Refusals */}
              <Card className="p-4 space-y-3" data-testid="meetings-catalogue-refusals">
                <h3 className="text-sm font-semibold">Recorded Convene & Budget Refusals</h3>
                {catalogueRead.data.refusals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No refusals recorded.</p>
                ) : (
                  <ul className="space-y-1 text-xs font-mono">
                    {catalogueRead.data.refusals.map((r, idx) => {
                      const refusalReason = reasonCodeDisplay(r.reason, t);
                      return (
                        <li
                          key={`${r.persona_id ?? "cross"}-${r.meeting_type}-${idx}`}
                          data-testid={`catalogue-refusal-${r.meeting_type}-${idx}`}
                        >
                          {r.persona_id || r.persona_display_name ? (
                            <BffSubjectInline
                              id={r.persona_id}
                              displayName={r.persona_display_name}
                              nameMissing={r.persona_name_missing}
                              testIdPrefix={`catalogue-refusal-persona-${r.meeting_type}-${idx}`}
                            />
                          ) : (
                            "cross-persona"
                          )}{" "}
                          · {r.meeting_type} · reason:{" "}
                          <span className="text-destructive font-semibold font-sans">{refusalReason.text}</span>
                          {refusalReason.code && refusalReason.code !== refusalReason.text ? (
                            <>
                              {" "}
                              <code className="font-mono text-muted-foreground">({refusalReason.code})</code>
                            </>
                          ) : null}{" "}
                          · at: {r.at ?? "—"}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
};
