// Persona Meetings tab (FE-MANAGEMENT-MEETINGS-20261115, SD_PERSONA_MEETINGS_2026-11-15 §11.3).
// Shows that persona's meetings as owner/chair/participant, its weekly count vs M9 limit,
// its scheduled runs and recorded refusals, and its proposals / consult_request outcomes.
// Reads only the BFF meetings routes; unavailable owner data is shown explicitly with reason.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useT } from "@/platform/hooks";
import {
  getMeetingCatalogue,
  getMeetingProposals,
  getMeetings,
  type MeetingCatalogueData,
  type MeetingProposalItem,
  type MeetingProposalsData,
  type MeetingsListData,
  type MeetingsRead,
} from "@/lib/bff-v1/meetings";
import type { PersonaManagementEnvelope } from "@/lib/bff-v1/personas";

interface Props {
  personaId: string;
  management?: PersonaManagementEnvelope | null;
  managementUnavailable?: boolean;
}

function Unavailable({ reason, testId }: { reason?: string | null; testId: string }) {
  const t = useT();
  return (
    <div
      role="status"
      data-testid={testId}
      className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground"
    >
      {t("persona.meetings.unavailable", { defaultValue: "無法讀取會議資料 (Unavailable)" })}
      {reason ? <span className="ml-2 font-mono text-xs">({reason})</span> : null}
    </div>
  );
}

export function PersonaMeetingsPanel({ personaId }: Props) {
  const t = useT();
  const [meetingsRead, setMeetingsRead] = useState<MeetingsRead<MeetingsListData> | null>(null);
  const [proposalsRead, setProposalsRead] = useState<MeetingsRead<MeetingProposalsData> | null>(null);
  const [catalogueRead, setCatalogueRead] = useState<MeetingsRead<MeetingCatalogueData> | null>(null);

  useEffect(() => {
    let live = true;
    setMeetingsRead(null);
    setProposalsRead(null);
    setCatalogueRead(null);
    if (!personaId) return;
    void Promise.all([
      getMeetings({ personaId }),
      getMeetingProposals({ personaId }),
      getMeetingCatalogue({ personaId }),
    ]).then(([mRes, pRes, cRes]) => {
      if (!live) return;
      setMeetingsRead(mRes);
      setProposalsRead(pRes);
      setCatalogueRead(cRes);
    });
    return () => {
      live = false;
    };
  }, [personaId]);

  if (meetingsRead === null && proposalsRead === null && catalogueRead === null) {
    return (
      <div className="p-3 text-sm text-muted-foreground" data-testid="persona-meetings-loading">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  const allUnavailable =
    meetingsRead?.state === "unavailable" &&
    proposalsRead?.state === "unavailable" &&
    catalogueRead?.state === "unavailable";

  if (allUnavailable) {
    return (
      <Unavailable
        testId="persona-meetings-unavailable"
        reason={meetingsRead?.reason ?? catalogueRead?.reason ?? proposalsRead?.reason}
      />
    );
  }

  const weeklyLimit =
    catalogueRead?.state === "ok"
      ? (catalogueRead.data.types[0]?.budget?.weekly_limit ?? 3)
      : 3;
  const meetingsList = meetingsRead?.state === "ok" ? meetingsRead.data.items : [];
  const weeklyCount =
    catalogueRead?.state === "ok" && catalogueRead.data.schedule[0]?.weekly_count !== undefined
      ? catalogueRead.data.schedule[0].weekly_count
      : meetingsList.length;

  return (
    <div className="space-y-6" data-testid="persona-meetings-panel">
      {/* 1. Weekly Budget, Schedule & Refusals */}
      <section className="space-y-2" data-testid="persona-meetings-budget">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            {t("persona.meetings.budgetTitle", { defaultValue: "每週會議額度與排程 (M9 Weekly Budget & Schedule)" })}
          </h4>
          <Badge variant="outline" data-testid="persona-meetings-weekly-count">
            Weekly Count: {weeklyCount} / {weeklyLimit}
          </Badge>
        </div>
        {catalogueRead?.state !== "ok" ? (
          <Unavailable
            testId="persona-meetings-catalogue-unavailable"
            reason={catalogueRead?.reason}
          />
        ) : (
          <div className="space-y-2 text-xs font-mono">
            {catalogueRead.data.schedule.length > 0 ? (
              <ul className="space-y-1" data-testid="persona-meetings-schedule">
                {catalogueRead.data.schedule.map((s, idx) => (
                  <li key={`${s.meeting_type}-${idx}`}>
                    {s.meeting_type} · last: {s.last_run_at ?? "—"} · next due: {s.next_due_at ?? "—"}
                  </li>
                ))}
              </ul>
            ) : null}
            {catalogueRead.data.refusals.length > 0 ? (
              <ul className="space-y-1 text-destructive" data-testid="persona-meetings-refusals">
                {catalogueRead.data.refusals.map((r, idx) => (
                  <li key={`${r.meeting_type}-${idx}`}>
                    Refused {r.meeting_type}: {r.reason} ({r.at ?? "—"})
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {/* 2. Meetings as Chair / Owner / Participant */}
      <section className="space-y-2">
        <h4 className="text-sm font-medium">
          {t("persona.meetings.listTitle", { defaultValue: "出席與主持會議紀錄 (Meetings as Owner / Chair / Participant)" })}
        </h4>
        {meetingsRead?.state !== "ok" ? (
          <Unavailable testId="persona-meetings-list-unavailable" reason={meetingsRead?.reason} />
        ) : meetingsRead.data.items.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground" data-testid="persona-meetings-empty">
            {t("persona.meetings.empty", { defaultValue: "尚無此 Persona 的會議紀錄 (No meetings recorded for this persona)." })}
          </Card>
        ) : (
          <ul className="space-y-2" data-testid="persona-meetings-list">
            {meetingsRead.data.items.map((m) => {
              const role =
                m.chair_persona_id === personaId
                  ? "chair"
                  : m.participants?.find((p) => p.persona_id === personaId)?.role ?? "participant";
              return (
                <li
                  key={m.meeting_id}
                  data-testid={`persona-meeting-${m.meeting_id}`}
                  className="rounded border border-border p-3 text-xs space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/management/meetings/${encodeURIComponent(m.meeting_id)}`}
                        className="font-mono font-semibold text-primary underline"
                      >
                        {m.meeting_id}
                      </Link>
                      <Badge variant="outline">{m.meeting_type}</Badge>
                      <Badge variant="secondary">{role}</Badge>
                      <Badge variant="outline">{m.status}</Badge>
                      {m.outcome ? <Badge variant="outline">{m.outcome}</Badge> : null}
                    </div>
                    <span className="font-mono text-muted-foreground">
                      {m.closed_at ?? m.created_at ?? "—"}
                    </span>
                  </div>
                  {m.topic ? <div className="text-sm text-foreground">{m.topic}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. Proposals & consult_request Outcomes */}
      <section className="space-y-2">
        <h4 className="text-sm font-medium">
          {t("persona.meetings.proposalsTitle", { defaultValue: "會議提案與下游狀態 (Sponsored Proposals & consult_request Outcomes)" })}
        </h4>
        {proposalsRead?.state !== "ok" ? (
          <Unavailable
            testId="persona-meetings-proposals-unavailable"
            reason={proposalsRead?.reason}
          />
        ) : proposalsRead.data.items.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground" data-testid="persona-meetings-proposals-empty">
            {t("persona.meetings.proposalsEmpty", { defaultValue: "尚無此 Persona 發起的會議提案 (No meeting proposals for this persona)." })}
          </Card>
        ) : (
          <ul className="space-y-2" data-testid="persona-meetings-proposals">
            {proposalsRead.data.items.map((p: MeetingProposalItem) => (
              <li
                key={p.proposal_id}
                data-testid={`persona-proposal-${p.proposal_id}`}
                className="rounded border border-border p-3 text-xs flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{p.proposal_id}</span>
                  {p.kind ? <Badge variant="outline">{p.kind}</Badge> : null}
                  {p.meeting_id ? (
                    <Link
                      to={`/management/meetings/${encodeURIComponent(p.meeting_id)}`}
                      className="font-mono underline text-primary"
                    >
                      {p.meeting_id}
                    </Link>
                  ) : null}
                  {p.downstream?.status ? (
                    <Badge variant="secondary">{p.downstream.status}</Badge>
                  ) : null}
                </div>
                {p.downstream?.href ? (
                  <Link
                    to={p.downstream.href}
                    className="font-mono underline text-primary"
                    data-testid={`persona-proposal-downstream-${p.proposal_id}`}
                  >
                    {p.downstream.target ?? "downstream"}
                    {p.downstream.id ? ` (${p.downstream.id})` : ""} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
