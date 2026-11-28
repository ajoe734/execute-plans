import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { TFunction } from "i18next";

import {
  candidateApprovalStatusOf,
  createMeetingCandidateDecision,
  getCommitteeMeeting,
  getCommitteeMeetingProposals,
  getCommitteeMemos,
  getCommitteeSessions,
  isDeliberativeSession,
  isUnsponsoredCandidateProposal,
  publishCommitteeMemo,
  sessionIdOf,
  stripPrivateMemory,
  type CandidateDecisionReadback,
  type CommitteeMeetingProposal,
  type CommitteeMemo,
  type CommitteeParticipant,
  type CommitteeRound,
  type CommitteeSession,
} from "@/lib/bff-v1/agora/learning";
import { outcomeLabel, statusLabel } from "@/lib/enumLabels";
import { CaseFileViewPanel } from "@/management/components/case-file/CaseFileViewPanel";
import {
  OutcomeView,
  PageShell,
  ReadBoundary,
  UnavailableNotice,
  WriteGateNote,
  useLearningRead,
  useLearningWriteAccess,
  type ActionOutcome,
} from "./shared";

function formatRoleLabel(role: string | null | undefined, t: TFunction): string {
  const key = (role ?? "").trim().toLowerCase();
  if (!key) return "";
  switch (key) {
    case "chair":
      return t("agora.learning.committee.personaRoles.chair");
    case "advisor":
      return t("agora.learning.committee.personaRoles.advisor");
    case "servant":
      return t("agora.learning.committee.personaRoles.servant");
    case "risk_officer":
      return t("agora.learning.committee.personaRoles.risk_officer");
    case "panel_reviewer":
      return t("agora.learning.committee.personaRoles.panel_reviewer");
    case "participant":
      return t("agora.learning.committee.personaRoles.participant");
    default:
      return role ?? "";
  }
}

function buildPersonaNameMap(session: CommitteeSession, t: TFunction): Map<string, string> {
  const map = new Map<string, string>();
  const add = (id?: string | null, displayName?: string | null, isServant?: boolean) => {
    const cleanId = (id ?? "").trim();
    if (!cleanId) return;
    if (isServant || displayName?.trim() === "Your servant" || cleanId.includes("servant")) {
      map.set(cleanId, t("agora.learning.committee.privateServant"));
      return;
    }
    const cleanName = (displayName ?? "").trim();
    if (cleanName && cleanName !== cleanId) {
      map.set(cleanId, cleanName);
    }
  };
  add(session.chair_persona_id, session.chair_display_name, false);
  for (const rawP of session.participants ?? []) {
    if (typeof rawP === "string") {
      add(rawP, null, rawP.includes("servant"));
    } else {
      add(
        rawP.persona_id,
        rawP.display_name,
        Boolean(rawP.is_caller_servant || rawP.origin === "private_servant" || rawP.role === "servant"),
      );
    }
  }
  for (const round of session.rounds ?? []) {
    for (const pos of round.positions ?? []) {
      add(pos.persona_id, pos.display_name, pos.role === "servant");
    }
  }
  return map;
}

function resolvePersonaDisplayName(
  input: {
    personaId?: string | null;
    displayName?: string | null;
    role?: string | null;
    origin?: string | null;
    isCallerServant?: boolean;
  },
  t: TFunction,
  nameMap?: Map<string, string>,
): string {
  const personaId = (input.personaId ?? "").trim();
  const rawDisplay = (input.displayName ?? "").trim();
  if (
    input.isCallerServant ||
    input.origin === "private_servant" ||
    input.role === "servant" ||
    rawDisplay === "Your servant" ||
    personaId.includes("servant")
  ) {
    return t("agora.learning.committee.privateServant");
  }
  if (rawDisplay && rawDisplay !== personaId) {
    return rawDisplay;
  }
  const mapped = personaId ? nameMap?.get(personaId) : undefined;
  if (mapped && mapped !== personaId) {
    return mapped;
  }
  const roleLabel = formatRoleLabel(input.role, t) || t("agora.learning.committee.personaRoles.participant");
  return personaId ? t("agora.learning.committee.personaFallback", { role: roleLabel, id: personaId }) : roleLabel;
}

function formatMeetingDateTime(iso: string | null | undefined): string | null {
  const raw = (iso ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

function sortSessionsNewestFirst(sessions: CommitteeSession[]): CommitteeSession[] {
  return [...sessions]
    .map((session, index) => {
      const ts = session.created_at ? Date.parse(session.created_at) : Number.NaN;
      return { session, index, ts };
    })
    .sort((a, b) => {
      const aValid = !Number.isNaN(a.ts);
      const bValid = !Number.isNaN(b.ts);
      if (aValid && bValid && a.ts !== b.ts) {
        return b.ts - a.ts;
      }
      if (aValid !== bValid) {
        return aValid ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.session);
}

function buildSessionTitle(session: CommitteeSession, t: TFunction): { title: string; personaSummary: string | null } {
  const nameMap = buildPersonaNameMap(session, t);
  const directTitle = (session.topic ?? session.agenda ?? session.question ?? session.title ?? "").trim();
  const targetRef = (
    session.subject_ref ??
    (session.target_type && session.target_id
      ? `${session.target_type}:${session.target_id}`
      : session.target_id ?? session.target_type ?? "")
  ).trim();

  const personaNames: string[] = [];
  const pushUnique = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !personaNames.includes(trimmed)) {
      personaNames.push(trimmed);
    }
  };

  if (session.chair_persona_id || session.chair_display_name) {
    pushUnique(
      resolvePersonaDisplayName(
        {
          personaId: session.chair_persona_id,
          displayName: session.chair_display_name,
          role: "chair",
        },
        t,
        nameMap,
      ),
    );
  }
  for (const rawP of session.participants ?? []) {
    const p = normalizeParticipant(rawP);
    pushUnique(
      resolvePersonaDisplayName(
        {
          personaId: p.persona_id,
          displayName: p.display_name,
          role: p.role,
          origin: p.origin,
          isCallerServant: p.is_caller_servant,
        },
        t,
        nameMap,
      ),
    );
  }
  for (const round of session.rounds ?? []) {
    for (const pos of round.positions ?? []) {
      if (pos.persona_id || pos.display_name) {
        pushUnique(
          resolvePersonaDisplayName(
            {
              personaId: pos.persona_id,
              displayName: pos.display_name,
              role: pos.role,
            },
            t,
            nameMap,
          ),
        );
      }
    }
  }

  const baseTitle = directTitle
    ? directTitle
    : targetRef
      ? t("agora.learning.committee.targetPrefix", { target: targetRef })
      : isDeliberativeSession(session)
        ? t("agora.learning.committee.classDeliberative")
        : t("agora.learning.committee.classGatePanel");

  return {
    title: baseTitle,
    personaSummary: personaNames.length > 0 ? personaNames.join("、") : null,
  };
}

function RoundsSection({
  rounds,
  isDeliberative,
  nameMap,
}: {
  rounds: CommitteeRound[];
  isDeliberative: boolean;
  nameMap?: Map<string, string>;
}) {
  const { t } = useTranslation();
  if (!rounds.length) return null;
  return (
    <section className="space-y-3" data-testid="committee-rounds">
      <h3 className="font-medium text-sm">{t("agora.learning.committee.rounds")}</h3>
      {rounds.map((r) => {
        const modeLabel = r.mode === "independent" || (!isDeliberative && r.round === 1) || (isDeliberative && r.round === 1)
          ? t("agora.learning.committee.modeIndependent")
          : t("agora.learning.committee.modeCrossVisibility");
        return (
          <div
            key={r.round}
            className="rounded border border-border p-3 text-sm space-y-2"
            data-testid={`committee-round-${r.round}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{t("agora.learning.committee.round", { round: r.round })}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {modeLabel}
              </span>
            </div>
            <ul className="space-y-2">
              {(r.positions ?? []).map((pos, idx) => {
                const personaLabel = (pos.persona_id || pos.display_name)
                  ? resolvePersonaDisplayName(
                      {
                        personaId: pos.persona_id,
                        displayName: pos.display_name,
                        role: pos.role,
                      },
                      t,
                      nameMap,
                    )
                  : null;
                const roleText = formatRoleLabel(pos.role, t);
                return (
                  <li
                    key={`${r.round}-${pos.persona_id ?? pos.label ?? idx}`}
                    className="rounded border border-border/60 bg-muted/20 p-2 text-xs space-y-1"
                    data-testid={`committee-round-${r.round}-position-${idx}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {personaLabel ? <span className="font-semibold text-foreground">{personaLabel}</span> : null}
                      {pos.label ? <code className="font-semibold">{pos.label}</code> : null}
                      {roleText ? <span className="text-muted-foreground">· {roleText}</span> : null}
                      {pos.style ? <span className="text-muted-foreground">· {pos.style}</span> : null}
                      {pos.stance ? (
                        <span className="rounded border border-border px-1.5 py-0.5 font-medium">
                          {statusLabel(pos.stance, t)}
                        </span>
                      ) : null}
                      {typeof pos.confidence === "number" ? (
                        <span className="text-muted-foreground">
                          {t("agora.learning.committee.confidence")}: {pos.confidence.toFixed(2)}
                        </span>
                      ) : null}
                      {pos.changed ? (
                        <span
                          className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300"
                          data-testid={`committee-round-${r.round}-position-${idx}-changed`}
                        >
                          {t("agora.learning.committee.positionChanged")}
                        </span>
                      ) : null}
                    </div>
                    {Array.isArray(pos.citations) && pos.citations.length > 0 ? (
                      <p className="text-muted-foreground">
                        {t("agora.learning.committee.citations")}: <code>{pos.citations.join(", ")}</code>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function Memos({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const { result, reload } = useLearningRead(() => getCommitteeMemos(sessionId), `memos:${sessionId}`);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const publish = async (memo: CommitteeMemo) => {
    setBusy(memo.memo_id);
    const res = await publishCommitteeMemo(sessionId, memo.memo_id);
    setBusy(null);
    if (res.state === "ok") {
      setOutcome({ kind: "receipt", title: t("agora.learning.committee.publishReceipt"), value: res.data });
      reload();
    } else setOutcome({ kind: "unavailable", reason: res.reason });
  };

  return (
    <div data-testid="committee-memos">
      <h2 className="mb-2 font-medium">{t("agora.learning.committee.memos")}</h2>
      <WriteGateNote reason={write.reason} />
      <ReadBoundary result={result}>
        {(memos) => (
          <ul className="space-y-2">
            {memos.map((rawMemo) => {
              const memo = stripPrivateMemory(rawMemo);
              return (
                <li key={memo.memo_id} className="rounded border border-border p-2 text-sm" data-testid={`memo-${memo.memo_id}`}>
                  <p>
                    <code>{memo.memo_id}</code> · {memo.status ? statusLabel(memo.status, t) : t("agora.learning.notReported")}
                  </p>
                  {memo.summary ? <p>{memo.summary}</p> : null}
                  {memo.recommendation ? <p>{statusLabel(memo.recommendation, t)}</p> : null}
                  <div className="mt-2">
                    <CaseFileViewPanel view={memo.case_file_view} scope={`memo-${memo.memo_id}`}
                                       testId={`memo-${memo.memo_id}-case-file`} />
                  </div>
                  {memo.status !== "published" ? (
                    <button
                      type="button"
                      className="mt-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                      disabled={!write.allowed || busy === memo.memo_id}
                      onClick={() => void publish(memo)}
                    >
                      {t("agora.learning.committee.publish")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </ReadBoundary>
      <OutcomeView outcome={outcome} />
    </div>
  );
}

function normalizeParticipant(p: string | CommitteeParticipant): CommitteeParticipant {
  if (typeof p === "string") {
    return { persona_id: p, role: "participant", origin: p.includes("servant") ? "private_servant" : "institutional" };
  }
  return p;
}

function DeliberativeMeetingDetail({ session }: { session: CommitteeSession }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const meetingId = sessionIdOf(session);
  const [detailSession, setDetailSession] = useState<CommitteeSession>(session);
  const [extraProposals, setExtraProposals] = useState<CommitteeMeetingProposal[] | null>(null);
  const [dissentMemos, setDissentMemos] = useState<CommitteeMemo[]>([]);
  const [detailUnavailable, setDetailUnavailable] = useState<{ reason: string; owner?: string } | null>(null);
  const [candidateReadbacks, setCandidateReadbacks] = useState<Record<string, CandidateDecisionReadback>>({});
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  useEffect(() => {
    let live = true;
    setDetailSession(session);
    setExtraProposals(null);
    setDissentMemos([]);
    setDetailUnavailable(null);

    void getCommitteeMeeting(meetingId).then((res) => {
      if (!live) return;
      if (res.state === "ok") {
        setDetailSession((prev) => ({ ...prev, ...res.data }));
      } else if (res.reason !== "RESOURCE_NOT_FOUND") {
        setDetailUnavailable({ reason: res.reason, owner: res.owner });
      }
    });

    void getCommitteeMeetingProposals(meetingId).then((res) => {
      if (!live) return;
      if (res.state === "ok") {
        setExtraProposals(res.data);
      }
    });

    void getCommitteeMemos(meetingId).then((res) => {
      if (!live) return;
      if (res.state === "ok") {
        setDissentMemos(stripPrivateMemory(res.data));
      }
    });

    return () => {
      live = false;
    };
  }, [meetingId, session]);

  const rounds = detailSession.rounds ?? [];
  const synthesis = detailSession.synthesis ?? null;
  const rawProposals = extraProposals ?? detailSession.proposals ?? synthesis?.proposals ?? [];
  const participants = (detailSession.participants ?? []).map(normalizeParticipant);
  const nameMap = buildPersonaNameMap(detailSession, t);
  const dissentMemoId = synthesis?.dissent_memo_id ?? null;
  const dissentText = typeof synthesis?.dissent === "string"
    ? synthesis.dissent
    : synthesis?.dissent
      ? JSON.stringify(synthesis.dissent)
      : null;

  const chairDisplayName = (detailSession.chair_persona_id || detailSession.chair_display_name)
    ? resolvePersonaDisplayName(
        {
          personaId: detailSession.chair_persona_id,
          displayName: detailSession.chair_display_name,
          role: "chair",
        },
        t,
        nameMap,
      )
    : t("agora.learning.notReported");
  const rawOutcome = synthesis?.outcome ?? detailSession.outcome;
  const outcomeDisplay = rawOutcome ? outcomeLabel(rawOutcome, t) : t("agora.learning.notReported");
  const authorityText = !detailSession.execution_authority || detailSession.execution_authority === "none"
    ? t("agora.learning.paperBoundary")
    : `${t("agora.learning.environmentPaper")} · ${t("agora.learning.executionAuthorityLabel")}：${statusLabel(detailSession.execution_authority, t)}`;

  const routeToCandidateDecision = async (proposal: CommitteeMeetingProposal) => {
    setBusyProposalId(proposal.proposal_id);
    const res = await createMeetingCandidateDecision(meetingId, proposal.proposal_id);
    setBusyProposalId(null);
    if (res.state === "ok") {
      setCandidateReadbacks((prev) => ({ ...prev, [proposal.proposal_id]: res.data }));
      setOutcome({
        kind: "receipt",
        title: t("agora.learning.committee.candidateReceipt"),
        value: res.data,
      });
    } else {
      setOutcome({ kind: "unavailable", reason: res.reason });
    }
  };

  return (
    <div className="space-y-4 rounded border border-border p-3" data-testid="committee-deliberative-detail">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-semibold">{meetingId}</code>
          <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-300">
            {t("agora.learning.committee.classDeliberative")}
          </span>
          {detailSession.meeting_type ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-xs font-mono">
              {detailSession.meeting_type}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {detailSession.status ? statusLabel(detailSession.status, t) : t("agora.learning.notReported")}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {authorityText}
        </span>
      </div>

      {detailUnavailable ? (
        <UnavailableNotice reason={detailUnavailable.reason} owner={detailUnavailable.owner} />
      ) : null}

      {detailSession.agenda || detailSession.topic ? (
        <p className="text-sm font-medium" data-testid="committee-meeting-agenda">
          {detailSession.agenda ?? detailSession.topic}
        </p>
      ) : null}

      {participants.length > 0 ? (
        <section className="space-y-1" data-testid="committee-meeting-participants">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("agora.learning.committee.participants")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {participants.map((p) => {
              const isServant = Boolean(
                p.is_caller_servant ||
                  p.origin === "private_servant" ||
                  p.role === "servant" ||
                  p.display_name === "Your servant" ||
                  p.persona_id.includes("servant"),
              );
              const displayName = resolvePersonaDisplayName(
                {
                  personaId: p.persona_id,
                  displayName: p.display_name,
                  role: p.role,
                  origin: p.origin,
                  isCallerServant: p.is_caller_servant,
                },
                t,
                nameMap,
              );
              const roleText = formatRoleLabel(p.role, t);
              return (
                <span
                  key={p.persona_id}
                  className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-0.5 text-xs"
                  data-testid={`committee-participant-${p.persona_id}`}
                >
                  <span className="font-medium text-foreground">{displayName}</span>
                  {roleText && !isServant ? <span className="text-muted-foreground">· {roleText}</span> : null}
                  {isServant ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      {t("agora.learning.committee.privateServant")}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
          {typeof detailSession.private_items_withheld === "number" && detailSession.private_items_withheld > 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="committee-private-withheld">
              {t("agora.learning.committee.privateWithheld", { count: detailSession.private_items_withheld })}
            </p>
          ) : null}
        </section>
      ) : null}

      <RoundsSection rounds={rounds} isDeliberative={true} nameMap={nameMap} />

      <section className="rounded border border-border p-3 text-sm space-y-2" data-testid="committee-synthesis">
        <h3 className="font-medium">{t("agora.learning.committee.synthesis")}</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span>
            {t("agora.learning.committee.chair")}:{" "}
            <span className="font-medium">{chairDisplayName}</span>
          </span>
          <span>
            {t("agora.learning.committee.outcome")}:{" "}
            <span className="font-medium">{outcomeDisplay}</span>
          </span>
        </div>
        {synthesis?.tally ? (
          <div className="rounded bg-muted/30 p-2 text-xs" data-testid="committee-synthesis-tally">
            <span className="font-medium">{t("agora.learning.committee.tally")}: </span>
            <span>
              {t("agora.learning.committee.tallySupport")}={String(synthesis.tally.support ?? 0)}
            </span>
            {" · "}
            <span>
              {t("agora.learning.committee.tallyOppose")}={String(synthesis.tally.oppose ?? 0)}
            </span>
          </div>
        ) : null}
        {synthesis?.summary ? <p className="text-xs">{synthesis.summary}</p> : null}

        <div className="border-t border-border pt-2 text-xs space-y-1" data-testid="committee-dissent">
          <p className="font-medium">{t("agora.learning.committee.dissent")}</p>
          {dissentMemoId || dissentText || dissentMemos.length > 0 ? (
            <div className="space-y-1">
              {dissentMemoId ? (
                <p>
                  Memo ID: <code data-testid="committee-dissent-memo-id">{dissentMemoId}</code>
                </p>
              ) : null}
              {dissentText ? <p>{dissentText}</p> : null}
              {dissentMemos.map((m) => (
                <div key={m.memo_id} className="rounded border border-border/60 p-1.5" data-testid={`dissent-memo-${m.memo_id}`}>
                  <code>{m.memo_id}</code> · {m.status ? statusLabel(m.status, t) : t("agora.learning.notReported")}
                  {m.summary ? <p>{m.summary}</p> : null}
                  {m.recommendation ? <p>{statusLabel(m.recommendation, t)}</p> : null}
                  <div className="mt-2">
                    <CaseFileViewPanel
                      view={m.case_file_view}
                      scope={`memo-${m.memo_id}`}
                      testId={`memo-${m.memo_id}-case-file`}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">{t("agora.learning.committee.noDissent")}</p>
          )}
        </div>
      </section>

      <section className="space-y-2" data-testid="committee-proposals">
        <h3 className="font-medium text-sm">{t("agora.learning.committee.proposals")}</h3>
        <WriteGateNote reason={write.reason} />
        {rawProposals.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("agora.learning.committee.noProposals")}</p>
        ) : (
          <ul className="space-y-2">
            {rawProposals.map((proposal) => {
              const unsponsored = isUnsponsoredCandidateProposal(proposal);
              const readback = candidateReadbacks[proposal.proposal_id];
              const approvalStatus = candidateApprovalStatusOf(proposal, readback);
              const candidateState = readback?.candidate?.state;
              const formalOutcome = readback?.formal_approval_receipts?.[0]?.outcome;
              const validationOutcome = readback?.validation_receipts?.[0]?.outcome;
              const sponsorName = proposal.sponsor_persona_id
                ? resolvePersonaDisplayName(
                    {
                      personaId: proposal.sponsor_persona_id,
                      displayName: proposal.sponsor_display_name,
                      role: proposal.sponsor_persona_id === detailSession.chair_persona_id ? "chair" : "participant",
                    },
                    t,
                    nameMap,
                  )
                : "";
              const proposalAuthorityText = !proposal.execution_authority || proposal.execution_authority === "none"
                ? `${t("agora.learning.executionAuthorityLabel")}：${t("agora.learning.executionAuthorityNone")}`
                : `${t("agora.learning.executionAuthorityLabel")}：${statusLabel(proposal.execution_authority, t)}`;
              return (
                <li
                  key={proposal.proposal_id}
                  className="rounded border border-border p-3 text-xs space-y-1.5"
                  data-testid={`committee-proposal-${proposal.proposal_id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-semibold">{proposal.proposal_id}</code>
                      {unsponsored ? (
                        <span
                          className="rounded bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300"
                          data-testid={`agora-candidate-decision-${proposal.proposal_id}`}
                        >
                          {t("agora.learning.committee.agoraCandidateDecision")} · {t("agora.learning.committee.unsponsored")}
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300">
                          {t("agora.learning.committee.sponsoredProposal")} · {t("agora.learning.committee.sponsor")}:{" "}
                          <span>{sponsorName}</span>
                        </span>
                      )}
                    </div>
                    <span
                      className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-foreground"
                      data-testid={`candidate-approval-status-${proposal.proposal_id}`}
                    >
                      {t("agora.learning.committee.approvalStatus")}: {statusLabel(approvalStatus, t)}
                      {candidateState && formalOutcome
                        ? ` (${statusLabel(candidateState, t)} / ${outcomeLabel(formalOutcome, t)})`
                        : ""}
                      {validationOutcome ? ` · ${outcomeLabel(validationOutcome, t)}` : ""}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                    <span>
                      {t("agora.learning.committee.approvalPath")}:{" "}
                      <code>{proposal.approval_path ?? (unsponsored ? "agora_candidate_decision" : "governed_owner_entry_point")}</code>
                    </span>
                    {proposal.downstream ? (
                      <span data-testid={`proposal-downstream-${proposal.proposal_id}`}>
                        {t("agora.learning.committee.downstream")}:{" "}
                        <code>
                          {proposal.downstream.target ?? proposal.kind ?? "unknown"}
                          {proposal.downstream.id ? `:${proposal.downstream.id}` : ""}
                          {proposal.downstream.status ? ` (${statusLabel(proposal.downstream.status, t)})` : ""}
                        </code>
                      </span>
                    ) : null}
                    <span>{proposalAuthorityText}</span>
                  </div>

                  {proposal.payload ? (
                    <pre className="overflow-x-auto rounded bg-muted/30 p-1.5 text-[11px]">
                      {JSON.stringify(proposal.payload, null, 2)}
                    </pre>
                  ) : null}

                  {unsponsored ? (
                    <div className="pt-1">
                      <button
                        type="button"
                        className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                        data-testid={`route-candidate-decision-${proposal.proposal_id}`}
                        disabled={!write.allowed || busyProposalId === proposal.proposal_id}
                        onClick={() => void routeToCandidateDecision(proposal)}
                      >
                        {t("agora.learning.committee.routeCandidate")}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <OutcomeView outcome={outcome} />
    </div>
  );
}

export function CommitteePage() {
  const { t } = useTranslation();
  const { result } = useLearningRead(() => getCommitteeSessions(), "sessions");
  const [selected, setSelected] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<"all" | "gate_panel" | "deliberative_meeting">("all");

  const isEmptyTraderMeetings =
    result !== null &&
    ((result.state === "unavailable" && result.reason === "no_trader_meetings") ||
      (result.state === "ok" && result.data.length === 0));

  return (
    <PageShell title={t("agora.learning.committee.title")} testId="agora-committee-page">
      {isEmptyTraderMeetings ? (
        <div
          className="max-w-[680px] rounded-lg border border-border bg-card p-4 text-card-foreground"
          data-testid="committee-empty-state"
        >
          <h2 className="m-0 text-[15px] font-bold text-foreground">
            {t("agora.learning.committee.emptyTitle")}
          </h2>
          <p className="mt-2 mb-3 text-xs leading-relaxed text-muted-foreground">
            {t("agora.learning.committee.emptyDescription")}
          </p>
          <Link
            to="/agora/strategy-workshop"
            data-testid="committee-open-workshop"
            className="inline-flex items-center rounded bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground"
          >
            {t("agora.learning.committee.goToWorkshop")}
          </Link>
        </div>
      ) : (
        <ReadBoundary result={result}>
          {(sessions) => {
            const orderedSessions = sortSessionsNewestFirst(sessions);
            const visibleSessions = orderedSessions.filter((s) => {
              if (classFilter === "all") return true;
              const delib = isDeliberativeSession(s);
              return classFilter === "deliberative_meeting" ? delib : !delib;
            });
            const selectedSession = selected
              ? orderedSessions.find((s) => sessionIdOf(s) === selected) ?? null
              : null;
            const selectedIsDelib = selectedSession ? isDeliberativeSession(selectedSession) : false;

            return (
              <>
                <div className="flex flex-wrap gap-2 text-xs" data-testid="committee-class-filters">
                  <button
                    type="button"
                    className="rounded border border-border px-2.5 py-1 text-muted-foreground aria-pressed:bg-muted aria-pressed:font-semibold aria-pressed:text-foreground"
                    aria-pressed={classFilter === "all"}
                    data-testid="committee-filter-all"
                    onClick={() => setClassFilter("all")}
                  >
                    {t("agora.learning.committee.filterAll")}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2.5 py-1 text-muted-foreground aria-pressed:bg-muted aria-pressed:font-semibold aria-pressed:text-foreground"
                    aria-pressed={classFilter === "gate_panel"}
                    data-testid="committee-filter-gate_panel"
                    onClick={() => setClassFilter("gate_panel")}
                  >
                    {t("agora.learning.committee.filterGatePanels")}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2.5 py-1 text-muted-foreground aria-pressed:bg-muted aria-pressed:font-semibold aria-pressed:text-foreground"
                    aria-pressed={classFilter === "deliberative_meeting"}
                    data-testid="committee-filter-deliberative_meeting"
                    onClick={() => setClassFilter("deliberative_meeting")}
                  >
                    {t("agora.learning.committee.filterDeliberative")}
                  </button>
                </div>

                <ul className="space-y-2" data-testid="committee-sessions">
                  {visibleSessions.map((s) => {
                    const id = sessionIdOf(s);
                    const delib = isDeliberativeSession(s);
                    const { title, personaSummary } = buildSessionTitle(s, t);
                    const formattedDateTime = formatMeetingDateTime(s.created_at);
                    const roundCount = Array.isArray(s.rounds) ? s.rounds.length : s.round;
                    const localizedStatus = s.status ? statusLabel(s.status, t) : t("agora.learning.notReported");
                    return (
                      <li
                        key={id}
                        data-testid={`committee-session-${id}`}
                        data-session-class={delib ? "deliberative_meeting" : "gate_panel"}
                      >
                        <button
                          type="button"
                          className="w-full rounded border border-border bg-card/60 p-2.5 text-left text-sm text-foreground hover:bg-muted/40"
                          aria-pressed={selected === id}
                          onClick={() => setSelected(id)}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="font-semibold text-foreground"
                                  data-testid={`committee-session-title-${id}`}
                                >
                                  {title}
                                </span>
                                <span
                                  className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-foreground"
                                  data-testid={`committee-session-status-${id}`}
                                >
                                  {localizedStatus}
                                </span>
                                {formattedDateTime ? (
                                  <span
                                    className="text-xs text-muted-foreground"
                                    data-testid={`committee-session-datetime-${id}`}
                                  >
                                    {formattedDateTime}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {personaSummary ? (
                                  <span data-testid={`committee-session-personas-${id}`}>
                                    {personaSummary}
                                  </span>
                                ) : null}
                                <code className="text-[11px] text-muted-foreground">{id}</code>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="rounded border border-border px-1.5 py-0.5 text-foreground">
                                {delib ? t("agora.learning.committee.classDeliberative") : t("agora.learning.committee.classGatePanel")}
                              </span>
                              {s.meeting_type ? (
                                <code
                                  className="rounded bg-muted px-1.5 py-0.5 text-foreground"
                                  data-testid={`committee-meeting-type-${id}`}
                                >
                                  {s.meeting_type}
                                </code>
                              ) : null}
                              {typeof roundCount === "number" ? (
                                <span className="text-muted-foreground">
                                  {t("agora.learning.committee.rounds")}: {roundCount}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {selected && selectedSession ? (
                  selectedIsDelib ? (
                    <DeliberativeMeetingDetail key={selected} session={selectedSession} />
                  ) : (
                    <div className="space-y-4" key={selected}>
                      {Array.isArray(selectedSession.rounds) && selectedSession.rounds.length > 0 ? (
                        <RoundsSection
                          rounds={selectedSession.rounds}
                          isDeliberative={false}
                          nameMap={buildPersonaNameMap(selectedSession, t)}
                        />
                      ) : null}
                      <Memos sessionId={selected} />
                    </div>
                  )
                ) : selected ? (
                  <Memos key={selected} sessionId={selected} />
                ) : null}
              </>
            );
          }}
        </ReadBoundary>
      )}
    </PageShell>
  );
}
