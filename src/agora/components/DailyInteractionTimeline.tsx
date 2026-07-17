import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  retryDailyInteraction,
  type DailyInteraction,
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

function ProviderRetry({ interactionId, writeAllowed, onRefresh }: {
  interactionId: string;
  writeAllowed: boolean;
  onRefresh: Props["onRefresh"];
}) {
  const [reason, setReason] = useState("");
  const [attemptKey, setAttemptKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const retry = async () => {
    if (!reason.trim()) {
      setError("A retry reason is required.");
      return;
    }
    if (!globalThis.crypto?.randomUUID) {
      setError("Secure retry identity support is unavailable in this browser.");
      return;
    }
    const idempotencyKey = attemptKey ?? `pint15-retry-${globalThis.crypto.randomUUID()}`;
    setAttemptKey(idempotencyKey);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await retryDailyInteraction({ interactionId, reason, idempotencyKey });
      setReason("");
      setAttemptKey(null);
      setStatus("Provider retry command accepted.");
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
        <input
          className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            setAttemptKey(null);
            setStatus(null);
          }}
          value={reason}
        />
      </label>
      <Button disabled={!writeAllowed || busy} onClick={() => void retry()} size="sm" variant="outline">{busy ? "Retrying…" : "Retry failed providers"}</Button>
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
      {status ? <p aria-live="polite" className="text-xs text-emerald-700" role="status">{status}</p> : null}
    </div>
  );
}

function CandidateActions({ interaction }: {
  interaction: DailyInteraction;
}) {
  const measures = interaction.opinions.flatMap((opinion) => opinion.recommended_measures);
  const unavailable = "Candidate actions are unavailable until PINT-014 returns an authoritative measure SHA-256, current candidate ETag, and capability readiness.";

  return (
    <section aria-label="Governed candidate measures" className="space-y-3 border-t border-slate-200 pt-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Candidate measures</h4>
      {measures.length === 0 ? <p className="text-xs text-slate-500">No Persona recommended measure was returned.</p> : null}
      {measures.map((measure) => {
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
                <p className="text-xs text-amber-800">{unavailable}</p>
                <Button disabled size="sm" title={unavailable} variant="outline">Create governed candidate unavailable</Button>
              </div>
            ) : (
              <div className="mt-3 space-y-2" data-testid={`candidate-${linked.proposal_id}`}>
                <div className="text-xs font-semibold text-slate-700">Proposal {linked.proposal_id} · revision {linked.revision}</div>
                <div className="rounded border border-amber-200 bg-amber-50 p-2" data-testid={`candidate-actions-unavailable-${linked.proposal_id}`}>
                  <p className="text-xs text-amber-900">{unavailable}</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Candidate ${linked.proposal_id} unavailable actions`}>
                    <Button disabled size="sm" title={unavailable} variant="outline">Modify unavailable</Button>
                    <Button disabled size="sm" title={unavailable} variant="outline">Accept for review unavailable</Button>
                    <Button disabled size="sm" title={unavailable} variant="outline">Reject unavailable</Button>
                    <Button disabled size="sm" title={unavailable} variant="outline">Defer unavailable</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function latestProviderInvocations(interaction: DailyInteraction): Map<string, DailyInteraction["provider_invocations"][number]> {
  const latest = new Map<string, DailyInteraction["provider_invocations"][number]>();
  interaction.provider_invocations.forEach((invocation) => {
    latest.set(invocation.participant.persona_id, invocation);
  });
  return latest;
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
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {interactions.map((item) => `${item.interaction_id}: ${item.status}`).join("; ") || "No Persona interactions yet."}
      </p>
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
              const invocation = latestProviderInvocations(item).get(participant.persona_id);
              return (
                <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs" key={participant.persona_id}>
                  <div className="font-semibold text-slate-800">{participant.display_name ?? participant.persona_id} · v{participant.persona_version}</div>
                  <div className="text-slate-500">OpenClaw {participant.provider_agent_id} · {invocation?.status ?? "not started"}</div>
                  {invocation?.error ? <div className="mt-1 text-red-700">{invocation.error.code}: {invocation.error.message}</div> : null}
                </div>
              );
            })}
          </div>
          {Array.from(latestProviderInvocations(item).values()).some((invocation) => invocation.status === "failed" && invocation.error?.retryable) ? (
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

          <CandidateActions interaction={item} />
          <footer className="mt-3 text-[11px] text-slate-500">Audit: {item.audit_refs.join(", ") || "pending"} · execution authority: none</footer>
        </article>
      ))}
    </section>
  );
}
