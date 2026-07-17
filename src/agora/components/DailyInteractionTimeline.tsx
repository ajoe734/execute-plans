import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createCandidateFromMeasure,
  decideCandidate,
  getAuthoritativeValidation,
  listCandidateDecisions,
  retryDailyInteraction,
  type CandidateDecisionRecord,
  type CandidateDecisionAction,
  type DailyInteraction,
  type ValidationReceipt,
} from "@/lib/bff-v1/agora/dailyInteractions";

export type DailyRuntimeState = "loading" | "ready" | "unsupported" | "error";

interface Props {
  interactions: DailyInteraction[];
  runtimeState: DailyRuntimeState;
  runtimeMessage?: string | null;
  writeAllowed: boolean;
  onRefresh: () => void | Promise<void>;
}

const statusTone: Record<DailyInteraction["status"], string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  running: "border-blue-200 bg-blue-50 text-blue-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  degraded: "border-amber-200 bg-amber-50 text-amber-900",
  failed: "border-red-200 bg-red-50 text-red-800",
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
    .join(",")}}`;
}

async function sha256Canonical(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure measure digest support is unavailable.");
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ProviderRetry({ interactionId, writeAllowed, onRefresh }: {
  interactionId: string;
  writeAllowed: boolean;
  onRefresh: Props["onRefresh"];
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = async () => {
    if (!reason.trim()) {
      setError("A retry reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await retryDailyInteraction({ interactionId, reason });
      setReason("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Provider retry failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50 p-2" data-testid={`provider-retry-${interactionId}`}>
      <label className="block text-xs font-medium text-amber-950">
        Provider retry reason
        <input className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs" onChange={(event) => setReason(event.target.value)} value={reason} />
      </label>
      <Button disabled={!writeAllowed || busy} onClick={() => void retry()} size="sm" variant="outline">{busy ? "Retrying…" : "Retry failed providers"}</Button>
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}

function CandidateActions({ interaction, writeAllowed, onRefresh }: {
  interaction: DailyInteraction;
  writeAllowed: boolean;
  onRefresh: Props["onRefresh"];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [proposedValue, setProposedValue] = useState("");
  const [decisions, setDecisions] = useState<Record<string, CandidateDecisionRecord[]>>({});
  const [decisionErrors, setDecisionErrors] = useState<Record<string, string>>({});
  const [decisionLoading, setDecisionLoading] = useState<Record<string, boolean>>({});
  const [validationReceiptIds, setValidationReceiptIds] = useState<Record<string, string>>({});
  const [validationReceipts, setValidationReceipts] = useState<Record<string, ValidationReceipt>>({});

  const measures = useMemo(() => interaction.opinions.flatMap((opinion) => opinion.recommended_measures), [interaction.opinions]);
  const proposalIds = useMemo(
    () => Array.from(new Set(interaction.candidate_proposal_links.map((link) => link.proposal_id))),
    [interaction.candidate_proposal_links],
  );
  const proposalKey = proposalIds.join("\u0000");

  const loadDecisions = useCallback(async (proposalId: string) => {
    setDecisionLoading((current) => ({ ...current, [proposalId]: true }));
    setDecisionErrors((current) => ({ ...current, [proposalId]: "" }));
    try {
      const records = await listCandidateDecisions(proposalId);
      setDecisions((current) => ({ ...current, [proposalId]: records }));
    } catch (caught) {
      setDecisionErrors((current) => ({
        ...current,
        [proposalId]: caught instanceof Error ? caught.message : "Candidate decision readback failed.",
      }));
    } finally {
      setDecisionLoading((current) => ({ ...current, [proposalId]: false }));
    }
  }, []);

  useEffect(() => {
    proposalKey.split("\u0000").filter(Boolean).forEach((proposalId) => void loadDecisions(proposalId));
  }, [loadDecisions, proposalKey]);

  const decide = async (proposal: DailyInteraction["candidate_proposal_links"][number], action: CandidateDecisionAction) => {
    if (!reason.trim()) {
      setError("A reason is required for every durable candidate decision.");
      return;
    }
    let parsed: unknown;
    if (action === "modify") {
      try {
        parsed = JSON.parse(proposedValue);
      } catch {
        setError("Modified proposed value must be valid JSON.");
        return;
      }
    }
    setBusy(`${action}:${proposal.proposal_id}`);
    setError(null);
    try {
      await decideCandidate({
        proposalId: proposal.proposal_id,
        action,
        reason: reason.trim(),
        revision: proposal.revision,
        proposalDigest: proposal.proposal_digest,
        proposedValue: parsed,
      });
      setReason("");
      setProposedValue("");
      await loadDecisions(proposal.proposal_id);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Candidate decision failed.");
    } finally {
      setBusy(null);
    }
  };

  const loadValidation = async (proposalId: string) => {
    const validationReceiptId = validationReceiptIds[proposalId]?.trim();
    if (!validationReceiptId) {
      setDecisionErrors((current) => ({ ...current, [proposalId]: "Enter an authoritative validation receipt id." }));
      return;
    }
    setBusy(`validation:${proposalId}`);
    try {
      const receipt = await getAuthoritativeValidation({ proposalId, validationReceiptId });
      setValidationReceipts((current) => ({ ...current, [proposalId]: receipt }));
      setDecisionErrors((current) => ({ ...current, [proposalId]: "" }));
    } catch (caught) {
      setDecisionErrors((current) => ({
        ...current,
        [proposalId]: caught instanceof Error ? caught.message : "Validation readback failed.",
      }));
    } finally {
      setBusy(null);
    }
  };

  const createCandidate = async (opinionId: string, measure: DailyInteraction["opinions"][number]["recommended_measures"][number]) => {
    setBusy(`create:${measure.measure_id}`);
    setError(null);
    try {
      await createCandidateFromMeasure({
        interactionId: interaction.interaction_id,
        opinionId,
        measureId: measure.measure_id,
        measureSha256: await sha256Canonical(measure),
      });
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Candidate creation failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Governed candidate measures" className="space-y-3 border-t border-slate-200 pt-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Candidate measures</h4>
      {measures.length === 0 ? <p className="text-xs text-slate-500">No Persona recommended measure was returned.</p> : null}
      {measures.map((measure) => {
        const opinion = interaction.opinions.find((item) => item.recommended_measures.some((candidate) => candidate.measure_id === measure.measure_id));
        const linked = interaction.candidate_proposal_links.find((item) => item.measure_id === measure.measure_id);
        return (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid={`recommended-measure-${measure.measure_id}`} key={measure.measure_id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{measure.measure_type}</div>
                <div className="text-xs text-slate-600">{measure.target.kind} · {measure.target.id} · {measure.target.version}</div>
              </div>
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">authority: none</span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{measure.rationale}</p>
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">{safeJson(measure.proposed_value)}</pre>
            {!linked ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-600">No governed candidate is linked yet. Creation binds the exact persisted provider measure through its deterministic canonical SHA-256.</p>
                <Button disabled={!writeAllowed || busy !== null || !opinion} onClick={() => opinion && void createCandidate(opinion.opinion_id, measure)} size="sm" variant="outline">Create governed candidate</Button>
              </div>
            ) : (
              <div className="mt-3 space-y-2" data-testid={`candidate-${linked.proposal_id}`}>
                <div className="text-xs font-semibold text-slate-700">Proposal {linked.proposal_id} · revision {linked.revision}</div>
                <label className="block text-xs font-medium text-slate-700">
                  Decision rationale
                  <textarea className="mt-1 min-h-16 w-full rounded border border-slate-300 bg-white p-2 text-sm" onChange={(event) => setReason(event.target.value)} value={reason} />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Modified proposed value (JSON; only used by Modify)
                  <textarea className="mt-1 min-h-16 w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs" onChange={(event) => setProposedValue(event.target.value)} value={proposedValue} />
                </label>
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Candidate ${linked.proposal_id} actions`}>
                  {(["modify", "accept_for_review", "reject", "defer"] as CandidateDecisionAction[]).map((action) => (
                    <Button disabled={!writeAllowed || busy !== null} key={action} onClick={() => void decide(linked, action)} size="sm" variant="outline">
                      {action === "accept_for_review" ? "Accept for review" : action[0].toUpperCase() + action.slice(1)}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">Accept for review is not formal approval and cannot execute or bind this proposal.</p>
                <div className="space-y-2 rounded border border-slate-200 bg-white p-2" data-testid={`candidate-decisions-${linked.proposal_id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">Durable decision history</span>
                    <Button disabled={decisionLoading[linked.proposal_id]} onClick={() => void loadDecisions(linked.proposal_id)} size="sm" variant="ghost">Reload</Button>
                  </div>
                  {decisionLoading[linked.proposal_id] ? <p className="text-xs text-slate-500">Loading decisions…</p> : null}
                  {(decisions[linked.proposal_id] ?? []).map((decision) => (
                    <div className="rounded border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-700" data-testid={`candidate-decision-${decision.decision_id}`} key={decision.decision_id}>
                      <div><strong>{decision.action}</strong> by {decision.actor_id} · revision {decision.revision}</div>
                      <div>Reason: {decision.reason}</div>
                      <div>Audit: {decision.audit_ref}</div>
                      {decision.review_request_id ? <div>Reviewer queue: {decision.review_request_id}</div> : null}
                    </div>
                  ))}
                  {!decisionLoading[linked.proposal_id] && (decisions[linked.proposal_id] ?? []).length === 0 ? <p className="text-xs text-slate-500">No durable decisions yet.</p> : null}
                </div>
                <div className="space-y-2 rounded border border-slate-200 bg-white p-2" data-testid={`candidate-validation-${linked.proposal_id}`}>
                  <label className="block text-xs font-medium text-slate-700">
                    Authoritative validation receipt id
                    <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs" onChange={(event) => setValidationReceiptIds((current) => ({ ...current, [linked.proposal_id]: event.target.value }))} value={validationReceiptIds[linked.proposal_id] ?? ""} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy !== null} onClick={() => void loadValidation(linked.proposal_id)} size="sm" variant="outline">Load validation</Button>
                    <Button disabled size="sm" title="The candidate link does not yet expose the canonical validation_plan_ref required by v1.9." variant="outline">Request / retry validation unavailable</Button>
                    <Button disabled size="sm" title="PINT-014 has not exposed a formal ApprovalDecision readback route in the v1.9 OpenAPI." variant="outline">Reviewer decision unavailable</Button>
                  </div>
                  {validationReceipts[linked.proposal_id] ? (
                    <div className="text-[11px] text-slate-700" data-testid={`validation-receipt-${validationReceipts[linked.proposal_id].validation_receipt_id}`}>
                      {validationReceipts[linked.proposal_id].authority} · {validationReceipts[linked.proposal_id].outcome} · revision {validationReceipts[linked.proposal_id].revision} · expires {validationReceipts[linked.proposal_id].expires_at}
                    </div>
                  ) : null}
                  <p className="text-[11px] text-amber-800">The browser sends only immutable receipt references. Validation outcomes and reviewer approval are never browser-authored.</p>
                </div>
                {decisionErrors[linked.proposal_id] ? <p className="text-xs text-red-700" role="alert">{decisionErrors[linked.proposal_id]}</p> : null}
              </div>
            )}
          </div>
        );
      })}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert">{error}</p> : null}
    </section>
  );
}

function LifecycleIcon({ status }: { status: DailyInteraction["status"] }) {
  if (status === "completed") return <CheckCircle2 aria-hidden="true" className="h-4 w-4" />;
  if (status === "failed") return <XCircle aria-hidden="true" className="h-4 w-4" />;
  if (status === "degraded") return <AlertTriangle aria-hidden="true" className="h-4 w-4" />;
  return <Clock3 aria-hidden="true" className="h-4 w-4" />;
}

export function DailyInteractionTimeline({ interactions, runtimeState, runtimeMessage, writeAllowed, onRefresh }: Props) {
  if (runtimeState === "loading") {
    return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600" data-testid="daily-interactions-loading" role="status">Loading durable Persona interactions…</div>;
  }
  if (runtimeState === "unsupported") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="daily-interactions-unsupported" role="status">
        <div className="font-semibold">Daily Persona runtime is not available on this BFF.</div>
        <p className="mt-1 text-xs">{runtimeMessage ?? "PINT-012–014 routes must be deployed before submissions and authoritative readback are enabled."}</p>
      </div>
    );
  }
  if (runtimeState === "error") {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="daily-interactions-error" role="alert">{runtimeMessage ?? "Authoritative interaction readback failed."}</div>;
  }
  if (interactions.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500" data-testid="daily-interactions-empty">No durable Persona interactions in this Workshop yet.</div>;
  }

  return (
    <section aria-label="Durable Persona interaction timeline" className="space-y-4" data-testid="daily-interaction-timeline">
      <div className="flex justify-end">
        <Button aria-label="Refresh Persona interaction readback" onClick={() => void onRefresh()} size="sm" variant="ghost"><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>
      {interactions.map((item) => (
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid={`daily-interaction-${item.interaction_id}`} key={item.interaction_id}>
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.human_request.mode.replace("_", " ")} · {item.human_request.submitted_at}</div>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">{item.human_request.request_text}</h3>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${statusTone[item.status]}`} data-testid={`interaction-status-${item.interaction_id}`}>
              <LifecycleIcon status={item.status} />{item.status}
            </span>
          </header>

          <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Provider invocation status">
            {item.participants.map((participant) => {
              const invocation = item.provider_invocations.find((value) => value.participant.persona_id === participant.persona_id);
              return (
                <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs" key={participant.persona_id}>
                  <div className="font-semibold text-slate-800">{participant.display_name ?? participant.persona_id} · v{participant.persona_version}</div>
                  <div className="text-slate-500">OpenClaw {participant.provider_agent_id} · {invocation?.status ?? "not started"}</div>
                  {invocation?.error ? <div className="mt-1 text-red-700">{invocation.error.code}: {invocation.error.message}</div> : null}
                </div>
              );
            })}
          </div>
          {item.provider_invocations.some((invocation) => invocation.error?.retryable) ? (
            <ProviderRetry interactionId={item.interaction_id} onRefresh={onRefresh} writeAllowed={writeAllowed} />
          ) : null}

          {item.missing_participant_ids.length || item.degraded_participant_ids.length ? (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" data-testid={`interaction-partial-${item.interaction_id}`}>
              Missing: {item.missing_participant_ids.join(", ") || "none"}; degraded: {item.degraded_participant_ids.join(", ") || "none"}. Successful Persona opinions remain independently visible.
            </div>
          ) : null}

          <div className="mt-3 grid gap-3 lg:grid-cols-2" aria-label="Independent Persona opinions">
            {item.opinions.map((opinion) => (
              <section className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3" data-testid={`persona-opinion-${opinion.opinion_id}`} key={opinion.opinion_id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <h4 className="text-sm font-semibold text-indigo-950">{opinion.participant.display_name ?? opinion.participant.persona_id}</h4>
                  <span className="text-xs font-semibold text-indigo-800">{opinion.conclusion} · {Math.round(opinion.confidence * 100)}%</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{opinion.rationale}</p>
                <div className="mt-2 text-[11px] text-slate-500">Provider invocation {opinion.provider_invocation_id} · correlated OpenClaw response</div>
              </section>
            ))}
          </div>

          {item.synthesis ? (
            <section className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3" data-testid={`interaction-synthesis-${item.interaction_id}`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-950"><ShieldCheck className="h-4 w-4" />Synthesis · {item.synthesis.status}</div>
              <p className="mt-2 text-sm text-slate-700">{item.synthesis.summary}</p>
              {item.synthesis.disagreements.length ? (
                <div className="mt-2 space-y-1" aria-label="Persona disagreements">
                  {item.synthesis.disagreements.map((disagreement, index) => <p className="text-xs text-violet-900" key={`${disagreement.cause}-${index}`}><strong>{disagreement.cause}:</strong> {disagreement.detail}</p>)}
                </div>
              ) : null}
            </section>
          ) : item.status === "completed" ? (
            <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert">Completed interaction omitted its authoritative synthesis.</p>
          ) : null}

          <CandidateActions interaction={item} onRefresh={onRefresh} writeAllowed={writeAllowed} />
          <footer className="mt-3 text-[11px] text-slate-500">Audit: {item.audit_refs.join(", ") || "pending"} · execution authority: none</footer>
        </article>
      ))}
    </section>
  );
}
