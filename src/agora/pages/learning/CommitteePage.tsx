import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
  type CandidateDecisionReadback,
  type CommitteeMeetingProposal,
  type CommitteeMemo,
  type CommitteeParticipant,
  type CommitteeRound,
  type CommitteeSession,
} from "@/lib/bff-v1/agora/learning";
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

function RoundsSection({ rounds, isDeliberative }: { rounds: CommitteeRound[]; isDeliberative: boolean }) {
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
                {r.mode ? `${r.mode} · ${modeLabel}` : modeLabel}
              </span>
            </div>
            <ul className="space-y-2">
              {(r.positions ?? []).map((pos, idx) => (
                <li
                  key={`${r.round}-${pos.persona_id ?? pos.label ?? idx}`}
                  className="rounded border border-border/60 bg-muted/20 p-2 text-xs space-y-1"
                  data-testid={`committee-round-${r.round}-position-${idx}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {pos.label ? <code className="font-semibold">{pos.label}</code> : null}
                    {pos.persona_id ? <span>({pos.persona_id})</span> : null}
                    {pos.role ? <span className="text-muted-foreground">· {pos.role}</span> : null}
                    {pos.style ? <span className="text-muted-foreground">· {pos.style}</span> : null}
                    {pos.stance ? (
                      <span className="rounded border border-border px-1.5 py-0.5 font-medium">
                        {pos.stance}
                      </span>
                    ) : null}
                    {typeof pos.confidence === "number" ? (
                      <span className="text-muted-foreground">
                        {t("agora.learning.committee.confidence")}: {pos.confidence.toFixed(2)}
                      </span>
                    ) : null}
                    {pos.changed ? (
                      <span
                        className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700"
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
              ))}
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
            {memos.map((memo) => (
              <li key={memo.memo_id} className="rounded border border-border p-2 text-sm" data-testid={`memo-${memo.memo_id}`}>
                <p><code>{memo.memo_id}</code> · {memo.status ?? t("agora.learning.notReported")}</p>
                {memo.summary ? <p>{memo.summary}</p> : null}
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
            ))}
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
        setDissentMemos(res.data);
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
  const dissentMemoId = synthesis?.dissent_memo_id ?? null;
  const dissentText = typeof synthesis?.dissent === "string"
    ? synthesis.dissent
    : synthesis?.dissent
      ? JSON.stringify(synthesis.dissent)
      : null;

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
          <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {t("agora.learning.committee.classDeliberative")}
          </span>
          {detailSession.meeting_type ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-xs font-mono">
              {detailSession.meeting_type}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {detailSession.status ?? t("agora.learning.notReported")}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          paper · execution_authority: {detailSession.execution_authority ?? "none"}
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
              const isServant = p.origin === "private_servant" || p.role === "servant" || p.persona_id.includes("servant");
              return (
                <span
                  key={p.persona_id}
                  className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-0.5 text-xs"
                  data-testid={`committee-participant-${p.persona_id}`}
                >
                  <code>{p.persona_id}</code>
                  {p.role ? <span className="text-muted-foreground">· {p.role}</span> : null}
                  {isServant ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
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

      <RoundsSection rounds={rounds} isDeliberative={true} />

      <section className="rounded border border-border p-3 text-sm space-y-2" data-testid="committee-synthesis">
        <h3 className="font-medium">{t("agora.learning.committee.synthesis")}</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span>
            {t("agora.learning.committee.chair")}:{" "}
            <code>{detailSession.chair_persona_id ?? t("agora.learning.notReported")}</code>
          </span>
          <span>
            {t("agora.learning.committee.outcome")}:{" "}
            <code>{synthesis?.outcome ?? detailSession.outcome ?? t("agora.learning.notReported")}</code>
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
                  <code>{m.memo_id}</code> · {m.status ?? t("agora.learning.notReported")}
                  {m.summary ? <p>{m.summary}</p> : null}
                  {m.recommendation ? <p>{m.recommendation}</p> : null}
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
                          className="rounded bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-800"
                          data-testid={`agora-candidate-decision-${proposal.proposal_id}`}
                        >
                          {t("agora.learning.committee.agoraCandidateDecision")} · {t("agora.learning.committee.unsponsored")}
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-800">
                          {t("agora.learning.committee.sponsoredProposal")} · {t("agora.learning.committee.sponsor")}:{" "}
                          <code>{proposal.sponsor_persona_id}</code>
                        </span>
                      )}
                    </div>
                    <span
                      className="rounded border border-border bg-muted px-2 py-0.5 font-mono"
                      data-testid={`candidate-approval-status-${proposal.proposal_id}`}
                    >
                      {t("agora.learning.committee.approvalStatus")}: {approvalStatus}
                      {candidateState && formalOutcome ? ` (state=${candidateState}, formal=${formalOutcome})` : ""}
                      {validationOutcome ? ` · validation=${validationOutcome}` : ""}
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
                          {proposal.downstream.status ? ` (${proposal.downstream.status})` : ""}
                        </code>
                      </span>
                    ) : null}
                    <span>execution_authority: <code>{proposal.execution_authority ?? "none"}</code></span>
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

  return (
    <PageShell title={t("agora.learning.committee.title")} testId="agora-committee-page">
      <ReadBoundary result={result}>
        {(sessions) => {
          const visibleSessions = sessions.filter((s) => {
            if (classFilter === "all") return true;
            const delib = isDeliberativeSession(s);
            return classFilter === "deliberative_meeting" ? delib : !delib;
          });
          const selectedSession = selected
            ? sessions.find((s) => sessionIdOf(s) === selected) ?? null
            : null;
          const selectedIsDelib = selectedSession ? isDeliberativeSession(selectedSession) : false;

          return (
            <>
              <div className="flex flex-wrap gap-2 text-xs" data-testid="committee-class-filters">
                <button
                  type="button"
                  className="rounded border border-border px-2.5 py-1 aria-pressed:bg-muted aria-pressed:font-semibold"
                  aria-pressed={classFilter === "all"}
                  data-testid="committee-filter-all"
                  onClick={() => setClassFilter("all")}
                >
                  {t("agora.learning.committee.filterAll")}
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2.5 py-1 aria-pressed:bg-muted aria-pressed:font-semibold"
                  aria-pressed={classFilter === "gate_panel"}
                  data-testid="committee-filter-gate_panel"
                  onClick={() => setClassFilter("gate_panel")}
                >
                  {t("agora.learning.committee.filterGatePanels")}
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2.5 py-1 aria-pressed:bg-muted aria-pressed:font-semibold"
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
                  const label = s.agenda ?? s.topic ?? s.question;
                  const roundCount = Array.isArray(s.rounds) ? s.rounds.length : s.round;
                  return (
                    <li
                      key={id}
                      data-testid={`committee-session-${id}`}
                      data-session-class={delib ? "deliberative_meeting" : "gate_panel"}
                    >
                      <button
                        type="button"
                        className="w-full rounded border border-border p-2 text-left text-sm"
                        aria-pressed={selected === id}
                        onClick={() => setSelected(id)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <code>{id}</code> · {s.status ?? t("agora.learning.notReported")}
                            {label ? <span> · {label}</span> : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="rounded border border-border px-1.5 py-0.5">
                              {delib ? t("agora.learning.committee.classDeliberative") : t("agora.learning.committee.classGatePanel")}
                            </span>
                            {s.meeting_type ? <code className="rounded bg-muted px-1.5 py-0.5">{s.meeting_type}</code> : null}
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
                      <RoundsSection rounds={selectedSession.rounds} isDeliberative={false} />
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
    </PageShell>
  );
}
