import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import { actOnGovernedProposal, type GovernedProposal, type ProposalAction } from "@/lib/bff-v1/agora/governance";
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";
import { proposalActionDisabledReason } from "@/agora/governedProposalAccess";

export interface GovernedProposalCardProps {
  initialProposal: GovernedProposal;
  initialEtag: string;
  validationResult?: Record<string, unknown>;
  approvalRefs?: string[];
  approvalReadiness?: { ready: boolean; reason?: string | null; missing_required_reviewers?: string[] };
  onUpdated?: (proposal: GovernedProposal, etag: string) => void;
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function actionableError(error: unknown): string {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
  if (status === 401 || status === 403) return "You do not have permission for this governance action.";
  if (status === 409 || status === 412) return "This proposal changed. Reload it before making another decision.";
  if (status === 422) return "The governance gate rejected this action. Review validation and required approvals.";
  return error instanceof Error ? error.message : "The governance service is unavailable. No action was recorded.";
}

export function GovernedProposalCard({ initialProposal, initialEtag, validationResult, approvalRefs = [], approvalReadiness, onUpdated }: GovernedProposalCardProps) {
  const access = useAgoraWriteAccess();
  const [proposal, setProposal] = useState(initialProposal);
  const [etag, setEtag] = useState(initialEtag);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display(initialProposal.proposed_value));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ProposalAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminal = ["approved", "rejected", "cancelled"].includes(proposal.state);
  const highEnvironment = ["paper", "canary", "live"].includes(proposal.environment_ceiling);
  const validationPassed = proposal.validation?.valid ?? proposal.validation?.status === "passed";

  useEffect(() => {
    setProposal(initialProposal);
    setEtag(initialEtag);
    setDraft(display(initialProposal.proposed_value));
    setEditing(false);
  }, [initialEtag, initialProposal]);

  async function run(action: ProposalAction) {
    const disabledReason = proposalActionDisabledReason(action, proposal, access);
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    setBusy(action); setError(null);
    try {
      let proposedValue: unknown;
      if (action === "modify") {
        try { proposedValue = JSON.parse(draft); } catch { proposedValue = draft; }
      }
      const result = await actOnGovernedProposal(proposal.proposal_id, {
        action, reason: reason.trim() || `${action.replaceAll("_", " ")} requested from proposal review`,
        ...(action === "modify" ? { proposed_value: proposedValue } : {}),
        ...(action === "validate" ? { validation_result: validationResult } : {}),
        ...(action === "approve" ? { approval_refs: approvalRefs } : {}),
      }, etag);
      setProposal(result.proposal); setEtag(result.etag); setEditing(false); setReason("");
      onUpdated?.(result.proposal, result.etag);
    } catch (caught) { setError(actionableError(caught)); }
    finally { setBusy(null); }
  }

  return <article className="space-y-4 rounded-lg border border-slate-200 bg-white p-4" data-testid={`governed-proposal-${proposal.proposal_id}`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-indigo-600">Governed proposal · revision {proposal.revision}</p>
        <h3 className="text-base font-semibold text-slate-900">{proposal.proposal_type.replaceAll("_", " ")}</h3>
        <p className="text-xs text-slate-500">{proposal.target_kind} · {proposal.target_id} · immutable target {proposal.target_version}</p></div>
      <span className="rounded-full border border-slate-200 px-2 py-1 text-xs font-medium">{proposal.state.replaceAll("_", " ")}</span>
    </header>

    <p className="text-sm text-slate-700">{proposal.rationale}</p>
    <section aria-label="Structured proposal diff" className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Current</h4><pre className="whitespace-pre-wrap break-words text-xs text-slate-700">{display(proposal.current_value)}</pre></div>
      <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3"><h4 className="mb-2 text-xs font-semibold uppercase text-indigo-600">Proposed</h4>
        {editing ? <textarea aria-label="Proposed value" className="min-h-28 w-full rounded border border-indigo-200 bg-white p-2 font-mono text-xs" value={draft} onChange={e => setDraft(e.target.value)} /> : <pre className="whitespace-pre-wrap break-words text-xs text-slate-700">{display(proposal.proposed_value)}</pre>}</div>
    </section>

    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border border-slate-200 p-3"><h4 className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><FileText className="h-4 w-4"/>Evidence & audit</h4>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">{proposal.evidence_refs.map(ref => <li key={ref}>{ref}</li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">{proposal.audit.length} immutable audit event(s)</p></div>
      <div className={`rounded-md border p-3 ${highEnvironment ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}><h4 className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-600"><ShieldAlert className="h-4 w-4"/>Authority ceiling</h4>
        <p className="mt-2 text-sm font-semibold">{proposal.environment_ceiling}</p><p className="text-xs text-slate-600">Human gate: {proposal.human_gate ? "required" : "not required"}</p>
        <p className="text-xs text-slate-600">Reviewers: {proposal.required_reviewers.join(", ")}</p></div>
    </section>

    {proposal.validation ? <section className="rounded-md border border-slate-200 p-3" aria-label="Validation result"><h4 className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">{validationPassed ? <CheckCircle2 className="h-4 w-4 text-green-600"/> : <AlertTriangle className="h-4 w-4 text-red-600"/>}Validation</h4>
      <p className="mt-2 text-xs text-slate-700">{validationPassed ? "Passed" : "Not passed"}</p>{proposal.validation.errors?.map(item => <p className="text-xs text-red-700" key={item}>{item}</p>)}</section> : null}
    <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600"><strong>Decision handoff only.</strong> Conversation and approval do not mean execution. {(proposal.execution_authority ?? proposal.governed_action_link?.execution_authority) === "none" ? "This handoff has no execution authority." : "No explicit no-execution authority proof is available; governance controls are disabled."}</div>
    {error ? <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</div> : null}
    {!terminal ? <footer className="space-y-2"><input aria-label="Decision reason" className="w-full rounded border border-slate-200 px-3 py-2 text-sm" disabled={!access.writeAllowed} placeholder="Reason or decision note" title={access.writeDisabledReason ?? undefined} value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {editing ? (() => { const disabledReason = proposalActionDisabledReason("modify", proposal, access); return <button onClick={() => run("modify")} disabled={!!busy || !!disabledReason} title={disabledReason ?? undefined} className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save new revision</button>; })() : (() => { const disabledReason = proposalActionDisabledReason("modify", proposal, access); return <button onClick={() => setEditing(true)} disabled={!!disabledReason} title={disabledReason ?? undefined} className="rounded border px-3 py-2 text-xs disabled:opacity-40">Modify</button>; })()}
        {(["request_review", "request_research", "validate", "approve", "reject", "defer", "cancel"] as ProposalAction[]).map(action => {
          const policyReason = proposalActionDisabledReason(action, proposal, access);
          const stateReason = action === "validate" && !validationResult
            ? "Validation requires an authoritative validation result."
            : action === "approve" && proposal.state !== "validated"
              ? "Approval requires a validated proposal."
              : action === "approve" && approvalReadiness && !approvalReadiness.ready
                ? approvalReadiness.reason || "Authoritative approval decisions are not ready."
              : action === "approve" && approvalRefs.length === 0
                ? "Approval requires authoritative approval references."
                : null;
          const disabledReason = policyReason ?? stateReason;
          return <button key={action} disabled={!!busy || !!disabledReason} title={disabledReason ?? undefined} onClick={() => run(action)} className="rounded border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">{action.replaceAll("_", " ")}</button>;
        })}
      </div>
      {(() => {
        const reason = proposalActionDisabledReason("request_review", proposal, access);
        return reason ? <p className="text-xs font-semibold text-amber-700" data-testid="proposal-controls-disabled-reason">{reason}</p> : null;
      })()}
      {(() => {
        const policyReason = proposalActionDisabledReason("approve", proposal, access);
        const reason = policyReason
          ?? (proposal.state !== "validated"
            ? "Approval requires a validated proposal."
            : approvalReadiness && !approvalReadiness.ready
              ? approvalReadiness.reason || "Authoritative approval decisions are not ready."
            : approvalRefs.length === 0
              ? "Approval requires authoritative approval references."
              : null);
        return reason ? <p className="text-xs text-slate-500" data-testid="proposal-approval-disabled-reason">Approval unavailable: {reason}</p> : null;
      })()}
    </footer> : null}
  </article>;
}
