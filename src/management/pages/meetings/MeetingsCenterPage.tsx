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
import { CANONICAL_CENTERS } from "@/management/navigation/managementRouteManifest";
import {
  conveneMeeting,
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

const CENTER = CANONICAL_CENTERS.meetings;

const MEETING_TYPES = [
  { id: "MT-1", label: "MT-1 Pool Evolution Review (池子演進會議)" },
  { id: "MT-2", label: "MT-2 Optimisation Review (優化會議)" },
  { id: "MT-3", label: "MT-3 Strategy Ideation (新策略發想會議)" },
  { id: "MT-4", label: "MT-4 Performance Attribution Review (績效歸因檢討)" },
  { id: "MT-5", label: "MT-5 Regime Interpretation (盤勢研判會議)" },
  { id: "MT-6", label: "MT-6 Quarterly Review (季度檢討會議)" },
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
        reason: <code>{reason}</code>
        {owner ? (
          <>
            {" · "}owner: <code>{owner}</code>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function MeetingRowCard({
  meeting,
  testId,
}: {
  meeting: MeetingSummaryItem;
  testId: string;
}) {
  const href = meeting.href || `/management/meetings/${encodeURIComponent(meeting.meeting_id)}`;
  const isReview =
    String(meeting.outcome ?? "").toUpperCase() === "REVIEW" ||
    String(meeting.status ?? "").toUpperCase() === "REVIEW";

  return (
    <Card className="p-4 space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={href}
            className="font-mono text-sm font-semibold text-primary underline"
            data-testid={`meeting-link-${meeting.meeting_id}`}
          >
            {meeting.meeting_id}
          </Link>
          <Badge variant="outline">{meeting.meeting_type}</Badge>
          <Badge variant="outline">{meeting.status}</Badge>
          {meeting.outcome ? (
            <Badge variant={isReview ? "destructive" : "secondary"}>{meeting.outcome}</Badge>
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
      {meeting.topic ? <p className="text-sm text-foreground">{meeting.topic}</p> : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          Chair: <code className="text-foreground">{meeting.chair_persona_id ?? "—"}</code>
        </span>
        <span>
          Round: <code className="text-foreground">{meeting.round ?? 1}</code>
        </span>
        <span>
          Participants:{" "}
          <code className="text-foreground">
            {meeting.participant_count ?? meeting.participants?.length ?? 0}
          </code>
        </span>
        {meeting.participants?.length ? (
          <span className="font-mono">
            ({meeting.participants.map((p) => p.persona_id).join(", ")})
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function ProposalRowCard({ proposal }: { proposal: MeetingProposalItem }) {
  const meetingHref =
    proposal.meeting_href ||
    (proposal.meeting_id ? `/management/meetings/${encodeURIComponent(proposal.meeting_id)}` : null);
  const ds = proposal.downstream ?? {};

  return (
    <Card className="p-4 space-y-2" data-testid={`meeting-proposal-row-${proposal.proposal_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{proposal.proposal_id}</span>
          {proposal.kind ? <Badge variant="outline">{proposal.kind}</Badge> : null}
          {ds.status ? <Badge variant="secondary">{ds.status}</Badge> : null}
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
        <span>
          Sponsor: <code className="text-foreground">{proposal.sponsor_persona_id ?? "—"}</code>
        </span>
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
  const activeTab = normalizeMeetingsTab(params.get("tab"));
  const typeFilter = (params.get("type") ?? "").trim();
  const personaFilter = (params.get("persona_id") ?? params.get("persona") ?? "").trim();

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
  }, [typeFilter, personaFilter, refreshTick]);

  const setActiveTab = useCallback(
    (nextTab: string) => {
      const next = new URLSearchParams(params);
      next.set("tab", normalizeMeetingsTab(nextTab));
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

  const upcomingItems = useMemo(() => {
    if (meetingsRead?.state !== "ok") return [];
    return meetingsRead.data.items.filter(
      (m) => !TERMINAL_NON_OPEN.has(String(m.status ?? "").trim().toLowerCase()),
    );
  }, [meetingsRead]);

  const historyItems = useMemo(() => {
    if (meetingsRead?.state !== "ok") return [];
    return meetingsRead.data.items.filter((m) =>
      CLOSED_STATUSES.has(String(m.status ?? "").trim().toLowerCase()),
    );
  }, [meetingsRead]);

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
          <Badge variant="outline">paper · execution_authority: none</Badge>
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
                          <code>{mt.roster_rule ?? "—"}</code>
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
                        {s.persona_id} · {s.meeting_type} · last: {s.last_run_at ?? "—"} · next due:{" "}
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
                    {catalogueRead.data.refusals.map((r, idx) => (
                      <li
                        key={`${r.persona_id ?? "cross"}-${r.meeting_type}-${idx}`}
                        data-testid={`catalogue-refusal-${r.meeting_type}-${idx}`}
                      >
                        {r.persona_id ?? "cross-persona"} · {r.meeting_type} · reason:{" "}
                        <span className="text-destructive font-semibold">{r.reason}</span> · at:{" "}
                        {r.at ?? "—"}
                      </li>
                    ))}
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
