import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import { actOnGovernedProposal, type GovernedProposal, type ProposalAction } from "@/lib/bff-v1/agora/governance";

export interface GovernedProposalCardProps {
  initialProposal: GovernedProposal;
  initialEtag: string;
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

export function GovernedProposalCard({ initialProposal, initialEtag, onUpdated }: GovernedProposalCardProps) {
  const [proposal, setProposal] = useState(initialProposal);
  const [etag, setEtag] = useState(initialEtag);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display(initialProposal.proposed_value));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ProposalAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminal = ["approved", "rejected", "cancelled"].includes(proposal.state);
  const highEnvironment = ["paper", "canary", "live"].includes(proposal.environment_ceiling);

  async function run(action: ProposalAction) {
    setBusy(action); setError(null);
    try {
      let proposedValue: unknown;
      if (action === "modify") {
        try { proposedValue = JSON.parse(draft); } catch { proposedValue = draft; }
      }
      const result = await actOnGovernedProposal(proposal.proposal_id, {
        action, reason: reason.trim() || `${action.replaceAll("_", " ")} requested from proposal review`,
        ...(action === "modify" ? { proposed_value: proposedValue } : {}),
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

    {proposal.validation ? <section className="rounded-md border border-slate-200 p-3" aria-label="Validation result"><h4 className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">{proposal.validation.valid ? <CheckCircle2 className="h-4 w-4 text-green-600"/> : <AlertTriangle className="h-4 w-4 text-red-600"/>}Validation</h4>
      <p className="mt-2 text-xs text-slate-700">{proposal.validation.valid ? "Passed" : "Not passed"}</p>{proposal.validation.errors?.map(item => <p className="text-xs text-red-700" key={item}>{item}</p>)}</section> : null}
    <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600"><strong>Decision handoff only.</strong> Conversation and approval do not mean execution. {proposal.governed_action_link?.execution_authority === "none" ? "This handoff has no execution authority." : "Any execution remains with the governed downstream owner."}</div>
    {error ? <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</div> : null}
    {!terminal ? <footer className="space-y-2"><input aria-label="Decision reason" className="w-full rounded border border-slate-200 px-3 py-2 text-sm" placeholder="Reason or decision note" value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {editing ? <button onClick={() => run("modify")} disabled={!!busy} className="rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Save new revision</button> : <button onClick={() => setEditing(true)} className="rounded border px-3 py-2 text-xs">Modify</button>}
        {(["request_review", "request_research", "validate", "approve", "reject", "defer", "cancel"] as ProposalAction[]).map(action => <button key={action} disabled={!!busy || (action === "approve" && proposal.state !== "validated")} onClick={() => run(action)} className="rounded border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">{action.replaceAll("_", " ")}</button>)}
      </div></footer> : null}
  </article>;
}
