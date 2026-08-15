export type PplAlloc009RebalanceRecord = Record<string, unknown>;

export type PplAlloc009RebalanceBinding = {
  allocationEvaluationId: string;
  allocationPolicyVersion: string;
  applied: boolean;
  approvalRef: string | null;
  mode: "created" | "resumed";
  ownerStatus: string;
  rankingSnapshotId: string;
  rebalanceId: string;
};

const REBALANCE_REASON = "PPL-ALLOC-009 governed paper allocation";

function record(value: unknown): PplAlloc009RebalanceRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PplAlloc009RebalanceRecord
    : {};
}

function requiredString(value: unknown, label: string): string {
  const resolved = String(value ?? "").trim();
  if (!resolved) {
    throw new Error(`PPL-ALLOC-009 ${label} must be present`);
  }
  return resolved;
}

function listRecords(value: unknown): PplAlloc009RebalanceRecord[] {
  const root = record(value);
  const candidates = Array.isArray(root.data)
    ? root.data
    : Array.isArray(value)
      ? value
      : [];
  return candidates.filter(
    (item): item is PplAlloc009RebalanceRecord =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function proposalRecord(value: unknown): PplAlloc009RebalanceRecord {
  const root = record(value);
  return Object.keys(root).length > 0 ? root : record(root.data);
}

function errorCode(value: unknown): string {
  const root = record(value);
  return String(record(root.error).code ?? root.code ?? "").trim();
}

function matchesResumeIdentity(
  candidate: PplAlloc009RebalanceRecord,
  input: {
    expectedApprovalRef: string;
    capitalBindingId: string;
    paperLedgerId: string;
    poolId: string;
    submittedReviewId: string;
  },
): boolean {
  if (candidate.capital_pool_id !== input.poolId || candidate.reason !== REBALANCE_REASON) {
    return false;
  }

  const auditRefs = Array.isArray(candidate.audit_refs)
    ? candidate.audit_refs.map((value) => String(value))
    : [];
  const promotionReviewRefs = auditRefs.filter((value) =>
    value.startsWith("promotion_review:")
    && value.slice("promotion_review:".length).trim().length > 0
  );

  const constraints = record(candidate.constraints);
  if (
    constraints.paper_only !== true
    || constraints.live_capital_enabled !== false
    || constraints.canary_execution_enabled !== false
  ) {
    return false;
  }

  const lines = Array.isArray(candidate.lines)
    ? candidate.lines.map(record)
    : [];
  if (lines.length !== 1) {
    return false;
  }
  const [line] = lines;
  if (
    line.binding_id !== input.capitalBindingId
    || line.paper_ledger_id !== input.paperLedgerId
  ) {
    return false;
  }

  const approvalRef = String(candidate.approval_ref ?? "").trim();
  const isAuthoritativelyApplied =
    candidate.applied === true
    && String(candidate.status ?? "").trim() === "applied";
  if (isAuthoritativelyApplied) {
    return (
      approvalRef === input.expectedApprovalRef
      && promotionReviewRefs.length > 0
    );
  }

  return (
    auditRefs.includes(`promotion_review:${input.submittedReviewId}`)
    && (!approvalRef || approvalRef === input.expectedApprovalRef)
  );
}

function resumedBinding(
  candidate: PplAlloc009RebalanceRecord,
): PplAlloc009RebalanceBinding {
  const rebalanceId = requiredString(candidate.rebalance_id ?? candidate.id, "resumed rebalance id");
  const rankingSnapshotId = requiredString(
    candidate.ranking_snapshot_id,
    "resumed ranking snapshot id",
  );
  const allocationEvaluationId = requiredString(
    candidate.allocation_evaluation_id,
    "resumed allocation evaluation id",
  );
  const allocationPolicyVersion = requiredString(
    candidate.allocation_policy_version,
    "resumed allocation policy version",
  );
  const ownerStatus = requiredString(candidate.status, "resumed owner status");
  if (ownerStatus === "failed") {
    throw new Error("PPL-ALLOC-009 cannot resume a failed rebalance");
  }
  if (typeof candidate.applied !== "boolean") {
    throw new Error("PPL-ALLOC-009 resumed applied state must be boolean");
  }
  if ((candidate.applied && ownerStatus !== "applied") || (!candidate.applied && ownerStatus === "applied")) {
    throw new Error("PPL-ALLOC-009 resumed owner status conflicts with applied state");
  }

  const lines = (candidate.lines as unknown[]).map(record);
  const [line] = lines;
  if (
    line.ranking_snapshot_id !== rankingSnapshotId
    || line.allocation_evaluation_id !== allocationEvaluationId
    || line.allocation_policy_version !== allocationPolicyVersion
  ) {
    throw new Error("PPL-ALLOC-009 resumed allocation line has conflicting lineage");
  }

  const auditRefs = (candidate.audit_refs as unknown[]).map((value) => String(value));
  if (!auditRefs.includes(`ranking_snapshot:${rankingSnapshotId}`)) {
    throw new Error("PPL-ALLOC-009 resumed rebalance lacks its ranking snapshot audit reference");
  }

  return {
    allocationEvaluationId,
    allocationPolicyVersion,
    applied: candidate.applied,
    approvalRef: String(candidate.approval_ref ?? "").trim() || null,
    mode: "resumed",
    ownerStatus,
    rankingSnapshotId,
    rebalanceId,
  };
}

export function bindPplAlloc009RebalanceProposal(input: {
  allocationEvaluationId: string;
  allocationPolicyVersion: string;
  capitalBindingId: string;
  expectedApprovalRef: string;
  paperLedgerId: string;
  poolId: string;
  proposalPayload: PplAlloc009RebalanceRecord;
  proposalStatus: number;
  rankingSnapshotId: string;
  resumeListPayload?: PplAlloc009RebalanceRecord;
  submittedReviewId: string;
}): PplAlloc009RebalanceBinding {
  if (input.proposalStatus === 202) {
    const proposal = proposalRecord(input.proposalPayload);
    const rebalanceId = requiredString(
      proposal.rebalance_id ?? record(proposal.data).rebalance_id,
      "created rebalance id",
    );
    const rankingSnapshotId = requiredString(
      proposal.ranking_snapshot_id,
      "created ranking snapshot id",
    );
    const allocationEvaluationId = requiredString(
      proposal.allocation_evaluation_id,
      "created allocation evaluation id",
    );
    const allocationPolicyVersion = requiredString(
      proposal.allocation_policy_version,
      "created allocation policy version",
    );
    if (
      rankingSnapshotId !== input.rankingSnapshotId
      || allocationEvaluationId !== input.allocationEvaluationId
      || allocationPolicyVersion !== input.allocationPolicyVersion
    ) {
      throw new Error("PPL-ALLOC-009 created rebalance returned conflicting lineage");
    }
    return {
      allocationEvaluationId,
      allocationPolicyVersion,
      applied: false,
      approvalRef: null,
      mode: "created",
      ownerStatus: "pending",
      rankingSnapshotId,
      rebalanceId,
    };
  }

  if (
    input.proposalStatus !== 409
    || errorCode(input.proposalPayload) !== "IDEMPOTENCY_CONFLICT"
  ) {
    throw new Error(
      `PPL-ALLOC-009 rebalance proposal returned unsupported HTTP ${input.proposalStatus}`,
    );
  }
  if (!input.resumeListPayload) {
    throw new Error("PPL-ALLOC-009 idempotency conflict requires owner-list readback");
  }

  const matches = listRecords(input.resumeListPayload).filter((candidate) =>
    matchesResumeIdentity(candidate, input),
  );
  if (matches.length !== 1) {
    throw new Error(
      `PPL-ALLOC-009 strict resume requires exactly one matching owner rebalance; found ${matches.length}`,
    );
  }
  return resumedBinding(matches[0]);
}
