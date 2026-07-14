import { BffError, makeBffError, normalizeBffErrorEnvelope, type BffErrorEnvelope } from "../errors";
import { buildHeaders } from "../headers";
import { detectBaseUrl } from "../client";
import { liveWriteGated } from "../writeGate";

export type ProposalAction =
  | "request_review" | "request_research" | "modify" | "validate"
  | "approve" | "reject" | "defer" | "cancel";

export interface GovernedProposal {
  proposal_id: string;
  proposal_type: string;
  target_kind: string;
  target_id: string;
  target_version: string;
  current_value: unknown;
  proposed_value: unknown;
  rationale: string;
  evidence_refs: string[];
  environment_ceiling: "analysis" | "research" | "shadow" | "paper" | "canary" | "live";
  required_permissions: string[];
  required_reviewers: string[];
  proposer?: string;
  available_approval_decision_refs?: string[];
  approval_decision_refs_authority?: "canonical_read_store";
  approval_decision_readiness?: {
    ready: boolean;
    reason?: string | null;
    missing_required_reviewers?: string[];
    [key: string]: unknown;
  };
  human_gate: boolean;
  revision: number;
  state: string;
  expires_at: string;
  validation?: { valid?: boolean; errors?: string[]; warnings?: string[]; [key: string]: unknown };
  audit: Array<{ action: string; actor: string; at: string; reason?: string; approval_refs?: string[] }>;
  governed_action_link?: { route?: string; target_type?: string; target_id?: string; execution_authority?: string } | null;
  execution_authority?: "none";
  no_capital_authority_proof?: string;
}

export interface ProposalSnapshot { proposal: GovernedProposal; etag: string }
export interface ProposalActionBody {
  action: ProposalAction;
  reason: string;
  proposed_value?: unknown;
  evidence_refs?: string[];
  approval_refs?: string[];
  validation_result?: Record<string, unknown>;
}

const baseUrl = () => detectBaseUrl().replace(/\/$/, "");

async function decode<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { data?: T } | BffErrorEnvelope | null;
  if (!response.ok) {
    const normalized = normalizeBffErrorEnvelope(body, response.status);
    throw normalized ? new BffError(response.status, normalized) : makeBffError({ code: "UNKNOWN_ERROR", message: `Governance request failed (${response.status})` });
  }
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Malformed governance response" });
  }
  return (body as { data: T }).data;
}

export async function getGovernedProposal(proposalId: string): Promise<ProposalSnapshot> {
  const response = await fetch(`${baseUrl()}/bff/agora/proposals/${encodeURIComponent(proposalId)}`, {
    credentials: "include", headers: buildHeaders({ method: "GET" }),
  });
  const proposal = await decode<GovernedProposal>(response);
  const etag = response.headers.get("ETag");
  if (!etag) throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Proposal response omitted ETag" });
  return { proposal, etag };
}

export async function getProposalRevisions(proposalId: string): Promise<GovernedProposal[]> {
  const response = await fetch(`${baseUrl()}/bff/agora/proposals/${encodeURIComponent(proposalId)}/revisions`, {
    credentials: "include", headers: buildHeaders({ method: "GET" }),
  });
  return decode<GovernedProposal[]>(response);
}

export async function actOnGovernedProposal(
  proposalId: string, body: ProposalActionBody, etag: string,
): Promise<ProposalSnapshot> {
  if (!(await liveWriteGated())) {
    throw makeBffError({
      code: "PERMISSION_DENIED",
      message: "Governance writes are disabled by deployment policy or session-kind policy.",
      details: { reason: "live_write_gate_closed" },
    });
  }
  const response = await fetch(`${baseUrl()}/bff/agora/proposals/${encodeURIComponent(proposalId)}/actions`, {
    method: "POST", credentials: "include",
    headers: buildHeaders({ method: "POST", extra: { "If-Match": etag } }),
    body: JSON.stringify(body),
  });
  const proposal = await decode<GovernedProposal>(response);
  const nextEtag = response.headers.get("ETag");
  if (!nextEtag) throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Proposal action omitted ETag" });
  return { proposal, etag: nextEtag };
}
