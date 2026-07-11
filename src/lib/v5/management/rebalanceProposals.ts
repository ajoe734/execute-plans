// 2026-07-07 PPL-ALLOC-006 — Rebalance proposal view-model.
//
// A rebalance proposal is the auditable output of the quarterly real
// allocation review: ranking snapshot -> target weights -> proposal ->
// simulation + constraints -> Human Inbox approval -> apply command.
// This module is pure (no fetch, no React) so it stays unit-testable.

import type { RealAllocationLine } from "./realAllocation";

export interface RebalanceProposalLine {
  personaId: string;
  stage: string;
  capitalScope?: string;
  currentWeight: number;
  targetWeight: number;
  delta: number;
  capReasons: string[];
  evidenceRefs: string[];
}

export type RebalanceProposalApprovalState =
  | "not_proposed"
  | "pending_approval"
  | "approved"
  | "applied";

export interface RebalanceProposal {
  id: string;
  capitalPoolId?: string;
  status?: string;
  proposalType?: "quarterly_rebalance" | "emergency_containment" | string;
  rankingSnapshotId?: string;
  lines: RebalanceProposalLine[];
  simulation?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  rollbackTarget?: Record<string, unknown>;
  approvalRef?: string;
  auditRefs: string[];
  applied: boolean;
  createdAt?: string;
  createdBy?: string;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function adaptRebalanceProposalLine(raw: unknown): RebalanceProposalLine | null {
  const value = asRecord(raw);
  const personaId = value ? asString(value.persona_id ?? value.personaId) : undefined;
  if (!value || !personaId) return null;
  return {
    personaId,
    stage: asString(value.stage) ?? "",
    capitalScope: asString(value.capital_scope ?? value.capitalScope),
    currentWeight: asNumber(value.current_weight ?? value.currentWeight),
    targetWeight: asNumber(value.target_weight ?? value.targetWeight),
    delta: asNumber(value.delta),
    capReasons: asStringArray(value.cap_reasons ?? value.capReasons),
    evidenceRefs: asStringArray(value.evidence_refs ?? value.evidenceRefs),
  };
}

/** Normalize one raw `/bff/rebalances` list or detail record. */
export function adaptRebalanceProposal(raw: unknown): RebalanceProposal | null {
  const envelope = asRecord(raw);
  const value = envelope && "data" in envelope && asRecord(envelope.data) ? asRecord(envelope.data) : envelope;
  const id = value ? asString(value.rebalance_id ?? value.id) : undefined;
  if (!value || !id) return null;
  const linesRaw = Array.isArray(value.lines) ? value.lines : [];
  return {
    id,
    capitalPoolId: asString(value.capital_pool_id ?? value.capitalPoolId),
    status: asString(value.status),
    proposalType: asString(value.proposal_type ?? value.proposalType),
    rankingSnapshotId: asString(value.ranking_snapshot_id ?? value.rankingSnapshotId),
    lines: linesRaw.map(adaptRebalanceProposalLine).filter((line): line is RebalanceProposalLine => line !== null),
    simulation: asRecord(value.simulation),
    constraints: asRecord(value.constraints),
    rollbackTarget: asRecord(value.rollback_target ?? value.rollbackTarget),
    approvalRef: asString(value.approval_ref ?? value.approvalRef),
    auditRefs: asStringArray(value.audit_refs ?? value.auditRefs),
    applied: Boolean(value.applied),
    createdAt: asString(value.created_at ?? value.createdAt),
    createdBy: asString(value.created_by ?? value.createdBy),
  };
}

export function adaptRebalanceProposals(raw: unknown): RebalanceProposal[] | null {
  const envelope = asRecord(raw);
  const data = envelope?.data;
  const items = Array.isArray(data) ? data : Array.isArray(envelope?.items) ? envelope?.items : Array.isArray(raw) ? raw : null;
  if (!items) return null;
  return items.map(adaptRebalanceProposal).filter((item): item is RebalanceProposal => item !== null);
}

/** True once a proposal has at least one line requiring a human sign-off before apply. */
export function proposalRequiresHumanApproval(proposal: RebalanceProposal): boolean {
  return proposal.lines.some((line) => line.delta > 0) || proposal.proposalType === "quarterly_rebalance";
}

export function proposalApprovalState(proposal: RebalanceProposal): RebalanceProposalApprovalState {
  if (proposal.applied) return "applied";
  if (proposal.approvalRef) return "approved";
  return "pending_approval";
}

/** Find the most recently created proposal that contains a line for `personaId`. */
export function latestProposalLineFor(
  proposals: readonly RebalanceProposal[],
  personaId: string,
): { proposal: RebalanceProposal; line: RebalanceProposalLine } | undefined {
  const sorted = [...proposals].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  for (const proposal of sorted) {
    const line = proposal.lines.find((candidate) => candidate.personaId === personaId);
    if (line) return { proposal, line };
  }
  return undefined;
}

/** Build proposal lines from freshly evaluated (non-persisted) allocation policy lines. */
export function proposalLinesFromAllocationLines(lines: readonly RealAllocationLine[]): RebalanceProposalLine[] {
  return lines.map((line) => ({
    personaId: line.personaId,
    stage: line.stage,
    capitalScope: line.capitalScope,
    currentWeight: line.currentWeight,
    targetWeight: line.targetWeight,
    delta: line.delta,
    capReasons: line.capReasons,
    evidenceRefs: line.evidenceRefs,
  }));
}
