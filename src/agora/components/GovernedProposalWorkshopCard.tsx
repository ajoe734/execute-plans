import { useEffect, useMemo, useState } from "react";
import {
  getGovernedProposal,
  type GovernedProposal,
  type ProposalSnapshot,
} from "@/lib/bff-v1/agora/governance";
import { GovernedProposalCard } from "./GovernedProposalCard";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function embeddedSnapshot(payload: UnknownRecord): ProposalSnapshot | null {
  const candidate = record(payload.proposal ?? payload.governed_proposal);
  const proposal = Object.keys(candidate).length ? candidate : payload;
  const proposalId = typeof proposal.proposal_id === "string" ? proposal.proposal_id : null;
  const etag = typeof payload.etag === "string"
    ? payload.etag
    : typeof payload.proposal_etag === "string"
      ? payload.proposal_etag
      : null;
  if (!proposalId || !etag || !("current_value" in proposal) || !("proposed_value" in proposal)) return null;
  return { proposal: proposal as unknown as GovernedProposal, etag };
}

export function GovernedProposalWorkshopCard({ payload, proposalId }: { payload: UnknownRecord; proposalId?: string }) {
  const initial = useMemo(() => embeddedSnapshot(payload), [payload]);
  const id = proposalId
    ?? initial?.proposal.proposal_id
    ?? (typeof payload.proposal_id === "string" ? payload.proposal_id : undefined);
  const [snapshot, setSnapshot] = useState<ProposalSnapshot | null>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getGovernedProposal(id)
      .then((result) => { if (!cancelled) setSnapshot(result); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Proposal readback unavailable."); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">{error}</div>;
  if (!snapshot) return <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">Loading governed proposal…</div>;

  const validationResult = record(payload.validation_result ?? snapshot.proposal.validation);
  const canonicalApprovalRefs = strings(snapshot.proposal.available_approval_decision_refs);
  const approvalRefs = Array.isArray(snapshot.proposal.available_approval_decision_refs)
    ? canonicalApprovalRefs
    : strings(payload.approval_refs);
  const approvalReadiness = snapshot.proposal.approval_decision_readiness;
  return (
    <GovernedProposalCard
      approvalRefs={approvalRefs}
      approvalReadiness={approvalReadiness}
      initialEtag={snapshot.etag}
      initialProposal={snapshot.proposal}
      onUpdated={(proposal, etag) => setSnapshot({ proposal, etag })}
      validationResult={Object.keys(validationResult).length ? validationResult : undefined}
    />
  );
}

export function GovernedProposalReferences({ payload }: { payload: UnknownRecord }) {
  const refs = [
    ...strings(payload.proposal_refs),
    ...(typeof payload.proposal_id === "string" ? [payload.proposal_id] : []),
  ];
  const unique = Array.from(new Set(refs));
  if (unique.length === 0) return null;
  return (
    <section aria-label="Governed proposal references" className="mt-4 space-y-3">
      {unique.map((proposalId) => <GovernedProposalWorkshopCard key={proposalId} payload={{}} proposalId={proposalId} />)}
    </section>
  );
}
