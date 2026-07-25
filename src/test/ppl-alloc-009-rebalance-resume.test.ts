import { describe, expect, it } from "vitest";

import { bindPplAlloc009RebalanceProposal } from "../../e2e/helpers/pplAlloc009RebalanceResume";

const ALLOCATION_EVALUATION_ID = "allocation-evaluation-original";
const ALLOCATION_POLICY_VERSION = "persona-real-allocation-v1";
const APPROVAL_REF = "approval-resume-30095677466";
const CAPITAL_BINDING_ID = "pcb-ppl-alloc-009";
const PAPER_LEDGER_ID = "paper-ledger-ppl-alloc-009";
const POOL_ID = "pool-ppl-alloc-009";
const RANKING_SNAPSHOT_ID = "ranking-snapshot-original";
const REBALANCE_ID = "rb-ppl-alloc-009-original";
const SUBMITTED_REVIEW_ID = "promotion-review-ppl-alloc-009";

function ownerRecord(overrides: Record<string, unknown> = {}) {
  return {
    allocation_evaluation_id: ALLOCATION_EVALUATION_ID,
    allocation_policy_version: ALLOCATION_POLICY_VERSION,
    applied: true,
    approval_ref: APPROVAL_REF,
    audit_refs: [
      `promotion_review:${SUBMITTED_REVIEW_ID}`,
      `ranking_snapshot:${RANKING_SNAPSHOT_ID}`,
    ],
    capital_pool_id: POOL_ID,
    constraints: {
      canary_execution_enabled: false,
      live_capital_enabled: false,
      paper_only: true,
    },
    lines: [{
      allocation_evaluation_id: ALLOCATION_EVALUATION_ID,
      allocation_policy_version: ALLOCATION_POLICY_VERSION,
      binding_id: CAPITAL_BINDING_ID,
      paper_ledger_id: PAPER_LEDGER_ID,
      ranking_snapshot_id: RANKING_SNAPSHOT_ID,
    }],
    ranking_snapshot_id: RANKING_SNAPSHOT_ID,
    reason: "PPL-ALLOC-009 governed paper allocation",
    rebalance_id: REBALANCE_ID,
    status: "applied",
    ...overrides,
  };
}

function bindResume(records: unknown[]) {
  return bindPplAlloc009RebalanceProposal({
    allocationEvaluationId: "allocation-evaluation-new-attempt",
    allocationPolicyVersion: ALLOCATION_POLICY_VERSION,
    capitalBindingId: CAPITAL_BINDING_ID,
    expectedApprovalRef: APPROVAL_REF,
    paperLedgerId: PAPER_LEDGER_ID,
    poolId: POOL_ID,
    proposalPayload: {
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "Idempotency key was already used with a different payload",
      },
    },
    proposalStatus: 409,
    rankingSnapshotId: "ranking-snapshot-new-attempt",
    resumeListPayload: { data: records },
    submittedReviewId: SUBMITTED_REVIEW_ID,
  });
}

describe("PPL-ALLOC-009 rebalance strict resume", () => {
  it("reuses the one exact owner rebalance and its original lineage after HTTP 409", () => {
    expect(bindResume([ownerRecord()])).toEqual({
      allocationEvaluationId: ALLOCATION_EVALUATION_ID,
      allocationPolicyVersion: ALLOCATION_POLICY_VERSION,
      applied: true,
      approvalRef: APPROVAL_REF,
      mode: "resumed",
      ownerStatus: "applied",
      rankingSnapshotId: RANKING_SNAPSHOT_ID,
      rebalanceId: REBALANCE_ID,
    });
  });

  it("fails closed when more than one owner rebalance matches", () => {
    expect(() => bindResume([
      ownerRecord(),
      ownerRecord({ rebalance_id: "rb-ppl-alloc-009-duplicate" }),
    ])).toThrow("requires exactly one matching owner rebalance; found 2");
  });

  it("fails closed when owner safety or paper-ledger identity does not match", () => {
    expect(() => bindResume([
      ownerRecord({
        constraints: {
          canary_execution_enabled: true,
          live_capital_enabled: false,
          paper_only: true,
        },
      }),
    ])).toThrow("requires exactly one matching owner rebalance; found 0");

    expect(() => bindResume([
      ownerRecord({
        lines: [{
          allocation_evaluation_id: ALLOCATION_EVALUATION_ID,
          allocation_policy_version: ALLOCATION_POLICY_VERSION,
          binding_id: CAPITAL_BINDING_ID,
          paper_ledger_id: "paper-ledger-wrong",
          ranking_snapshot_id: RANKING_SNAPSHOT_ID,
        }],
      }),
    ])).toThrow("requires exactly one matching owner rebalance; found 0");
  });
});
