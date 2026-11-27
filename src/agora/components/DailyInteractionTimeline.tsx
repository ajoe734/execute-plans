import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createCandidateFromMeasure,
  decideCandidate,
  getCandidate,
  requestAuthoritativeValidation,
  retryDailyInteraction,
  type CandidateDecisionAction,
  type CandidateReadback,
  type DailyInteraction,
  type RecommendedMeasure,
  type TypedPersonaOpinion,
} from "@/lib/bff-v1/agora/dailyInteractions";
import { asRecord, formatLabel, formatScalar, stringList, workshopCopy } from "./workshopCardUtils";

export type DailyRuntimeState = "loading" | "ready" | "unsupported" | "error";

interface Props {
  interactions: DailyInteraction[];
  runtimeState: DailyRuntimeState;
  runtimeMessage?: string | null;
  writeAllowed: boolean;
  onRefresh: () => void | Promise<void>;
}

const statusTone: Record<DailyInteraction["status"], string> = {
  queued: "border-border bg-muted/40 text-muted-foreground",
  running: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  completed: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  degraded: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  failed: "border-rose-500/40 bg-rose-500/15 text-rose-300",
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatReadableValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    return value.map((item) => formatReadableValue(item)).join("、");
  }
  if (typeof value === "object") {
    const entries = Object.entries(asRecord(value))
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${formatLabel(k)}: ${formatScalar(v)}`);
    return entries.length > 0 ? entries.join("；") : "-";
  }
  return formatScalar(value);
}

function ReadableMeasureFields({ measure }: { measure: RecommendedMeasure }) {
  const proposedRecord = asRecord(measure.proposed_value);
  const proposedEntries = Object.entries(proposedRecord);
  const hasScalarProposed =
    proposedEntries.length === 0 &&
    measure.proposed_value !== null &&
    measure.proposed_value !== undefined &&
    typeof measure.proposed_value !== "object";

  const fieldItems: Array<{ label: string; value: string }> = [];
  for (const [key, val] of proposedEntries) {
    fieldItems.push({
      label: `${workshopCopy("agora.workshop.interaction.proposedValueSummary", "建議調整內容")} · ${formatLabel(key)}`,
      value: formatReadableValue(val),
    });
  }
  if (hasScalarProposed) {
    fieldItems.push({
      label: workshopCopy("agora.workshop.interaction.proposedValueSummary", "建議調整內容"),
      value: formatScalar(measure.proposed_value),
    });
  }
  if (measure.expected_benefit) {
    fieldItems.push({
      label: workshopCopy("agora.workshop.cardLabels.predicted_effects", "預期影響"),
      value: measure.expected_benefit,
    });
  }
  if (typeof measure.confidence === "number") {
    fieldItems.push({
      label: workshopCopy("agora.workshop.interaction.confidenceScore", "信心水準"),
      value: `${Math.round(measure.confidence * 100)}%`,
    });
  }
  if (measure.environment_ceiling) {
    fieldItems.push({
      label: workshopCopy("agora.workshop.interaction.measureCategory", "指標類別"),
      value: `${measure.measure_type} (${measure.environment_ceiling})`,
    });
  }
  if (measure.rollback_trigger || measure.rollback_action) {
    fieldItems.push({
      label: workshopCopy("agora.workshop.interaction.measureRule", "規則定義"),
      value: [measure.rollback_trigger, measure.rollback_action].filter(Boolean).join(" → "),
    });
  }
  const adverse = stringList(measure.adverse_scenarios);
  if (adverse.length > 0) {
    fieldItems.push({
      label: workshopCopy("agora.workshop.cardLabels.risk_notes", "風險備註"),
      value: adverse.join("、"),
    });
  }

  return (
    <dl
      className="mt-2 grid gap-2 rounded-md border border-border/70 bg-card/70 p-2.5 sm:grid-cols-2"
      data-testid={`measure-readable-fields-${measure.measure_id}`}
    >
      {fieldItems.map((field) => (
        <div className="min-w-0" key={field.label}>
          <dt className="text-[11px] font-medium text-muted-foreground">{field.label}</dt>
          <dd className="break-words text-xs font-semibold text-foreground">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
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
    <div className="mt-2 space-y-2 rounded border border-amber-500/30 bg-amber-500/10 p-2" data-testid={`provider-retry-${interactionId}`}>
      <label className="block text-xs font-medium text-amber-200">
        Provider retry reason
        <input
          className="mt-1 w-full rounded border border-amber-500/40 bg-background px-2 py-1 text-xs text-foreground"
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
      {error ? <p className="text-xs text-rose-400" role="alert">{error}</p> : null}
      {status ? <p aria-live="polite" className="text-xs text-emerald-400" role="status">{status}</p> : null}
    </div>
  );
}

function legalAttemptKey(prefix: string): string | null {
  return globalThis.crypto?.randomUUID ? `${prefix}-${globalThis.crypto.randomUUID()}` : null;
}

type CandidateLink = DailyInteraction["candidate_proposal_links"][number];

function GovernedCandidateMeasure({
  interactionId,
  opinion,
  measure,
  linked,
  writeAllowed,
  onRefresh,
}: {
  interactionId: string;
  opinion: TypedPersonaOpinion;
  measure: RecommendedMeasure;
  linked?: CandidateLink;
  writeAllowed: boolean;
  onRefresh: Props["onRefresh"];
}) {
  const [readback, setReadback] = useState<CandidateReadback | null>(null);
  const [loading, setLoading] = useState(Boolean(linked));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [proposedValue, setProposedValue] = useState("");
  const [attempt, setAttempt] = useState<{ fingerprint: string; key: string } | null>(null);

  const keyForAttempt = (prefix: string, fingerprint: string): string | null => {
    if (attempt?.fingerprint === fingerprint) return attempt.key;
    const key = legalAttemptKey(prefix);
    if (key) setAttempt({ fingerprint, key });
    return key;
  };

  const proposalId = readback?.candidate.proposal_id ?? linked?.proposal_id ?? null;
  const load = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getCandidate(id);
      setReadback(next);
      setProposedValue(safeJson(next.candidate.proposed_value));
      setAttempt(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Candidate readback failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (linked?.proposal_id) void load(linked.proposal_id);
    // The proposal identity is the authoritative reload key; revisions are fetched by detail.
  }, [linked?.proposal_id]);

  const create = async () => {
    if (!/^[a-f0-9]{64}$/.test(measure.measure_sha256)) {
      setError("The persisted Persona measure omitted its server-authored digest.");
      return;
    }
    const fingerprint = JSON.stringify({
      operation: "create", interactionId, opinionId: opinion.opinion_id,
      measureId: measure.measure_id, measureSha256: measure.measure_sha256,
    });
    const key = keyForAttempt("pint15-candidate", fingerprint);
    if (!key) {
      setError("Secure candidate identity support is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const next = await createCandidateFromMeasure({
        interactionId,
        opinionId: opinion.opinion_id,
        measureId: measure.measure_id,
        measureSha256: measure.measure_sha256,
        idempotencyKey: key,
      });
      setReadback(next);
      setProposedValue(safeJson(next.candidate.proposed_value));
      setAttempt(null);
      setStatus("Governed candidate created from the persisted Persona measure.");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Candidate creation failed.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (action: CandidateDecisionAction) => {
    if (!readback || !reason.trim()) {
      setError("A decision reason is required.");
      return;
    }
    let parsedValue: unknown;
    if (action === "modify") {
      try {
        parsedValue = JSON.parse(proposedValue);
      } catch {
        setError("Proposed value must be valid JSON.");
        return;
      }
    }
    const fingerprint = JSON.stringify({
      operation: "decision",
      proposalId: readback.candidate.proposal_id,
      action,
      reason: reason.trim(),
      revision: readback.candidate.revision,
      proposalDigest: readback.candidate.proposal_digest,
      proposalEtag: readback.etag,
      ...(action === "modify" ? { proposedValue: parsedValue } : {}),
    });
    const key = keyForAttempt(`pint15-${action}`, fingerprint);
    if (!key) {
      setError("Secure candidate decision identity support is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const next = await decideCandidate({
        proposalId: readback.candidate.proposal_id,
        action,
        reason: reason.trim(),
        revision: readback.candidate.revision,
        proposalDigest: readback.candidate.proposal_digest,
        proposalEtag: readback.etag,
        idempotencyKey: key,
        ...(action === "modify" ? { proposedValue: parsedValue } : {}),
      });
      setReadback(next);
      setProposedValue(safeJson(next.candidate.proposed_value));
      setReason("");
      setAttempt(null);
      setStatus(action === "accept_for_review"
        ? "Candidate accepted for independent review; this is not formal approval."
        : `Candidate ${action} decision recorded.`);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Candidate decision failed.");
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    if (!readback) return;
    const fingerprint = JSON.stringify({
      operation: "validation",
      proposalId: readback.candidate.proposal_id,
      revision: readback.candidate.revision,
      proposalDigest: readback.candidate.proposal_digest,
      proposalEtag: readback.etag,
    });
    const key = keyForAttempt("pint15-validation", fingerprint);
    if (!key) {
      setError("Secure candidate validation identity support is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const next = await requestAuthoritativeValidation({
        proposalId: readback.candidate.proposal_id,
        revision: readback.candidate.revision,
        proposalDigest: readback.candidate.proposal_digest,
        proposalEtag: readback.etag,
        idempotencyKey: key,
      });
      setReadback(next);
      setAttempt(null);
      setStatus("Authoritative server validation completed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authoritative validation failed.");
    } finally {
      setBusy(false);
    }
  };

  const allowed = (action: CandidateDecisionAction) => Boolean(
    writeAllowed && readback?.readiness.candidate.ready === true
    && readback.readiness.candidate.allowed_actions.includes(action),
  );
  const acceptReady = allowed("accept_for_review")
    && readback?.readiness.validation.adapter_ready === true
    && readback?.readiness.reviewer.store_ready === true;

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3" data-testid={`recommended-measure-${measure.measure_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{formatLabel(measure.measure_type)}</div>
          <div className="text-xs text-muted-foreground">{measure.target.kind} · {measure.target.id} · {measure.target.version}</div>
        </div>
        <span className="rounded border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">authority: none</span>
      </div>
      <p className="mt-2 text-sm text-foreground/90">{measure.rationale}</p>

      {/* Readable labelled fields instead of raw JSON (AC4 / V10 §2.2) */}
      <ReadableMeasureFields measure={measure} />

      <details
        className="mt-2 rounded border border-border/70 bg-card/50 p-2 text-xs"
        data-testid={`measure-engineering-details-${measure.measure_id}`}
      >
        <summary className="cursor-pointer font-medium text-muted-foreground">
          {workshopCopy("agora.workshop.interaction.engineeringDetails", "展開工程與憑證細節")}
        </summary>
        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          <div className="break-all">Server measure SHA-256: {measure.measure_sha256}</div>
          <div>Measure ID: {measure.measure_id}</div>
          {measure.validation_plan ? (
            <div>
              Validator: {measure.validation_plan.validator} ({measure.validation_plan.required_checks.join(", ")})
            </div>
          ) : null}
        </div>
      </details>

      {!proposalId ? (
        <div className="mt-2 space-y-2">
          <Button disabled={!writeAllowed || busy || !/^[a-f0-9]{64}$/.test(measure.measure_sha256)} onClick={() => void create()} size="sm" variant="outline">
            {busy ? "Creating…" : "Create governed candidate"}
          </Button>
        </div>
      ) : loading && !readback ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">Loading authoritative candidate readback…</p>
      ) : readback ? (
        <div className="mt-3 space-y-3" data-testid={`candidate-${readback.candidate.proposal_id}`}>
          <details className="rounded border border-border bg-card p-2 text-xs text-foreground/85" open>
            <summary className="cursor-pointer font-semibold">
              Proposal {readback.candidate.proposal_id} · revision {readback.candidate.revision} · {readback.candidate.state}
            </summary>
            <div className="mt-1 break-all text-muted-foreground">Current ETag: {readback.etag}</div>
            <div className="break-all text-muted-foreground">Proposal digest: {readback.candidate.proposal_digest}</div>
          </details>
          <label className="block text-xs font-medium text-foreground/90">
            Decision reason for {readback.candidate.proposal_id}
            <input
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              maxLength={1000}
              onChange={(event) => { setReason(event.target.value); setAttempt(null); setStatus(null); }}
              value={reason}
            />
          </label>
          <details className="rounded border border-border/70 bg-card/50 p-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              {workshopCopy("agora.workshop.interaction.engineeringDetails", "展開工程與憑證細節")} ({readback.candidate.proposal_id})
            </summary>
            <label className="mt-2 block text-xs font-medium text-foreground/90">
              Proposed value (JSON) for {readback.candidate.proposal_id}
              <textarea
                className="mt-1 min-h-24 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                onChange={(event) => { setProposedValue(event.target.value); setAttempt(null); setStatus(null); }}
                value={proposedValue}
              />
            </label>
          </details>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Candidate ${readback.candidate.proposal_id} decisions`}>
            <Button disabled={busy || !allowed("modify")} onClick={() => void decide("modify")} size="sm" variant="outline">Modify</Button>
            <Button disabled={busy || !acceptReady} onClick={() => void decide("accept_for_review")} size="sm" variant="outline">Accept for review</Button>
            <Button disabled={busy || !allowed("reject")} onClick={() => void decide("reject")} size="sm" variant="outline">Reject</Button>
            <Button disabled={busy || !allowed("defer")} onClick={() => void decide("defer")} size="sm" variant="outline">Defer</Button>
            <Button disabled={busy || !writeAllowed || readback.readiness.validation.can_run !== true} onClick={() => void validate()} size="sm" variant="outline">Run authoritative validation</Button>
            <Button disabled={busy} onClick={() => void load(readback.candidate.proposal_id)} size="sm" variant="ghost">Reload candidate</Button>
          </div>
          <div className="rounded border border-indigo-500/30 bg-indigo-500/10 p-2 text-xs text-indigo-200" data-testid={`candidate-readiness-${readback.candidate.proposal_id}`}>
            Validator: {readback.readiness.validation.adapter_ready === true ? "ready" : `blocked (${readback.readiness.validation.reason ?? "unknown"})`};
            reviewer store: {readback.readiness.reviewer.store_ready === true ? "ready" : `blocked (${readback.readiness.reviewer.reason ?? "unknown"})`};
            formal approval: {readback.readiness.reviewer.current_formal_approval_id ?? "none"}. Accept for review is never approval.
          </div>
          <details className="rounded border border-border bg-card p-2 text-xs text-muted-foreground" data-testid={`candidate-history-${readback.candidate.proposal_id}`}>
            <summary className="cursor-pointer font-medium">
              Durable history: {readback.revisions.length} revision(s), {readback.decisions.length} operator decision(s), {readback.validation_receipts.length} validation receipt(s), {readback.formal_approval_receipts.length} formal approval receipt(s).
            </summary>
            {readback.decisions.length ? (
              <ul className="mt-2 space-y-1" aria-label={`Candidate ${readback.candidate.proposal_id} audit history`}>
                {readback.decisions.map((decision) => (
                  <li key={decision.decision_id}>
                    r{decision.revision} · {decision.action} · {decision.actor_id} · {decision.reason} · {decision.audit_ref}
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-400" role="alert">{error}</p> : null}
      {status ? <p aria-live="polite" className="mt-2 text-xs text-emerald-400" role="status">{status}</p> : null}
    </div>
  );
}

function CandidateActions({ interaction, writeAllowed, onRefresh }: {
  interaction: DailyInteraction;
  writeAllowed: boolean;
  onRefresh: Props["onRefresh"];
}) {
  const measures = interaction.opinions.flatMap((opinion) => opinion.recommended_measures);

  return (
    <section aria-label="Governed candidate measures" className="space-y-3 border-t border-border/70 pt-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {workshopCopy("agora.workshop.interaction.candidatesHeading", "候選指標與建議調整")}
      </h4>
      {measures.length === 0 ? <p className="text-xs text-muted-foreground">No Persona recommended measure was returned.</p> : null}
      {interaction.opinions.flatMap((opinion) => opinion.recommended_measures.map((measure) => {
        const linked = interaction.candidate_proposal_links.find((item) =>
          item.opinion_id === opinion.opinion_id
          && item.measure_id === measure.measure_id
          && item.measure_sha256 === measure.measure_sha256,
        );
        return (
          <GovernedCandidateMeasure
            interactionId={interaction.interaction_id}
            key={`${opinion.opinion_id}:${measure.measure_id}`}
            linked={linked}
            measure={measure}
            onRefresh={onRefresh}
            opinion={opinion}
            writeAllowed={writeAllowed}
          />
        );
      }))}
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

export function resolveEffectiveInteractionStatus(item: DailyInteraction): DailyInteraction["status"] {
  if (item.status !== "running" && item.status !== "queued") {
    return item.status;
  }
  if (!item.participants || item.participants.length === 0) {
    return item.status;
  }
  const latest = latestProviderInvocations(item);
  const participantStatuses = item.participants.map((p) => latest.get(p.persona_id)?.status);
  const allSucceeded =
    participantStatuses.every((st) => st === "succeeded") &&
    item.missing_participant_ids.length === 0 &&
    item.degraded_participant_ids.length === 0;
  if (allSucceeded) {
    return "completed";
  }
  const allTerminal = participantStatuses.every((st) => st === "succeeded" || st === "failed");
  if (allTerminal) {
    const anySucceeded = participantStatuses.some((st) => st === "succeeded");
    return anySucceeded ? "degraded" : "failed";
  }
  return item.status;
}

function LifecycleIcon({ status }: { status: DailyInteraction["status"] }) {
  if (status === "completed") return <CheckCircle2 aria-hidden="true" className="h-4 w-4" />;
  if (status === "failed") return <XCircle aria-hidden="true" className="h-4 w-4" />;
  if (status === "degraded") return <AlertTriangle aria-hidden="true" className="h-4 w-4" />;
  return <Clock3 aria-hidden="true" className="h-4 w-4" />;
}

export function DailyInteractionTimeline({ interactions, runtimeState, runtimeMessage, writeAllowed, onRefresh }: Props) {
  if (runtimeState === "loading") {
    return <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="daily-interactions-loading" role="status">Loading durable Persona interactions…</div>;
  }
  if (runtimeState === "unsupported") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200" data-testid="daily-interactions-unsupported" role="status">
        <div className="font-semibold">Daily Persona runtime is not available on this BFF.</div>
        <p className="mt-1 text-xs">{runtimeMessage ?? "PINT-012–014 routes must be deployed before submissions and authoritative readback are enabled."}</p>
      </div>
    );
  }
  if (runtimeState === "error") {
    return <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300" data-testid="daily-interactions-error" role="alert">{runtimeMessage ?? "Authoritative interaction readback failed."}</div>;
  }
  if (interactions.length === 0) {
    return <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="daily-interactions-empty">No durable Persona interactions in this Workshop yet.</div>;
  }

  return (
    <section aria-label="Durable Persona interaction timeline" className="space-y-4" data-testid="daily-interaction-timeline">
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {interactions.map((item) => `${item.interaction_id}: ${resolveEffectiveInteractionStatus(item)}`).join("; ") || "No Persona interactions yet."}
      </p>
      <div className="flex justify-end">
        <Button aria-label="Refresh Persona interaction readback" onClick={() => void onRefresh()} size="sm" variant="ghost"><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>
      {interactions.map((item) => {
        const effectiveStatus = resolveEffectiveInteractionStatus(item);
        return (
          <article className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm" data-testid={`daily-interaction-${item.interaction_id}`} key={item.interaction_id}>
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.human_request.mode.replace("_", " ")} · {item.human_request.submitted_at}</div>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{item.human_request.request_text}</h3>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${statusTone[effectiveStatus]}`} data-testid={`interaction-status-${item.interaction_id}`}>
                <LifecycleIcon status={effectiveStatus} />{effectiveStatus}
              </span>
            </header>

            <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Provider invocation status">
              {item.participants.map((participant) => {
                const invocation = latestProviderInvocations(item).get(participant.persona_id);
                return (
                  <div className="rounded border border-border/70 bg-muted/30 p-2 text-xs" key={participant.persona_id}>
                    <div className="font-semibold text-foreground">{participant.display_name ?? participant.persona_id} · v{participant.persona_version}</div>
                    <div className="text-muted-foreground">OpenClaw {participant.provider_agent_id} · {invocation?.status ?? "not started"}</div>
                    {invocation?.error ? <div className="mt-1 text-rose-400">{invocation.error.code}: {invocation.error.message}</div> : null}
                  </div>
                );
              })}
            </div>
            {Array.from(latestProviderInvocations(item).values()).some((invocation) => invocation.status === "failed" && invocation.error?.retryable) ? (
              <ProviderRetry interactionId={item.interaction_id} onRefresh={onRefresh} writeAllowed={writeAllowed} />
            ) : null}

            {item.missing_participant_ids.length || item.degraded_participant_ids.length ? (
              <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200" data-testid={`interaction-partial-${item.interaction_id}`}>
                Missing: {item.missing_participant_ids.join(", ") || "none"}; degraded: {item.degraded_participant_ids.join(", ") || "none"}. Successful Persona opinions remain independently visible.
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 lg:grid-cols-2" aria-label="Independent Persona opinions">
              {item.opinions.map((opinion) => (
                <section className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-3" data-testid={`persona-opinion-${opinion.opinion_id}`} key={opinion.opinion_id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <h4 className="text-sm font-semibold text-indigo-200">{opinion.participant.display_name ?? opinion.participant.persona_id}</h4>
                    <span className="text-xs font-semibold text-indigo-300">{opinion.conclusion} · {Math.round(opinion.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground/90">{opinion.rationale}</p>
                  <details className="mt-2 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer">
                      {workshopCopy("agora.workshop.interaction.engineeringDetails", "展開工程與憑證細節")}
                    </summary>
                    <div className="mt-1">Provider invocation {opinion.provider_invocation_id} · correlated OpenClaw response</div>
                  </details>
                </section>
              ))}
            </div>

            {item.synthesis ? (
              <section className="mt-3 rounded-md border border-violet-500/30 bg-violet-500/10 p-3" data-testid={`interaction-synthesis-${item.interaction_id}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-200"><ShieldCheck className="h-4 w-4" />Synthesis · {item.synthesis.status}</div>
                <p className="mt-2 text-sm text-foreground/90">{item.synthesis.summary}</p>
                {item.synthesis.disagreements.length ? (
                  <div className="mt-2 space-y-1" aria-label="Persona disagreements">
                    {item.synthesis.disagreements.map((disagreement, index) => <p className="text-xs text-violet-200" key={`${disagreement.cause}-${index}`}><strong>{disagreement.cause}:</strong> {disagreement.detail}</p>)}
                  </div>
                ) : null}
              </section>
            ) : effectiveStatus === "completed" ? (
              <p className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300" role="alert">Completed interaction omitted its authoritative synthesis.</p>
            ) : null}

            <CandidateActions interaction={item} onRefresh={onRefresh} writeAllowed={writeAllowed} />
            <footer className="mt-3 text-[11px] text-muted-foreground">Audit: {item.audit_refs.join(", ") || "pending"} · execution authority: none</footer>
          </article>
        );
      })}
    </section>
  );
}
