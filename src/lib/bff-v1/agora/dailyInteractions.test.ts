import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({ bffFetch: vi.fn() }));
vi.mock("../writeGate", () => ({ liveWriteGated: vi.fn() }));

import { bffFetch } from "../client";
import { liveWriteGated } from "../writeGate";
import {
  DailyInteractionUnsupportedError,
  createCandidateFromMeasure,
  decideCandidate,
  getCandidateReviewReadiness,
  listCandidateDecisions,
  listDailyInteractions,
  retryDailyInteraction,
  requestAuthoritativeValidation,
  type AuthorityBoundary,
  type CandidateDecisionRecord,
  type CandidateReadback,
  type DailyInteraction,
} from "./dailyInteractions";
import { makeBffError } from "../errors";

const authority: AuthorityBoundary = {
  execution_authority: "none",
  order_submitted: false,
  broker_called: false,
  capital_changed: false,
  runtime_bound: false,
  lifecycle_promoted: false,
  policy_mutated: false,
  persona_memory_mutated: false,
};

function interaction(id: string, workshopId: string): DailyInteraction {
  return {
    interaction_id: id,
    workshop_id: workshopId,
    status: "queued",
    human_request: { request_id: `req-${id}`, operator_id: "operator-1", mode: "ask", request_text: "Why?", submitted_at: "2026-07-17T00:00:00Z", request_sha256: "a".repeat(64) },
    context_snapshot: {
      tenant_id: "tenant-1", source_route: "/management/personas/p1", focused_object: { kind: "persona", id: "p1" },
      context_refs: [{ kind: "persona", id: "p1" }], evidence_cutoff: "2026-07-17T00:00:00Z",
      selected_persona_ids: ["p1"], initial_mode: "ask", return_route: "/management/personas/p1", captured_at: "2026-07-17T00:00:00Z",
    },
    participants: [], provider_invocations: [], opinions: [], synthesis: null,
    missing_participant_ids: [], degraded_participant_ids: [], candidate_proposal_links: [], audit_refs: [],
    created_at: "2026-07-17T00:00:00Z", updated_at: "2026-07-17T00:00:00Z", authority,
  };
}

function candidateReadback(decisions: CandidateDecisionRecord[] = []): CandidateReadback {
  const candidate: CandidateReadback["candidate"] = {
    proposal_id: "p1", revision: 3, state: "review_requested", proposer_id: "operator-1",
    interaction_id: "i1", opinion_id: "opinion-1", opinion_sha256: "c".repeat(64), measure_id: "m1",
    measure_sha256: "a".repeat(64), proposal_digest: "b".repeat(64), proposal_type: "risk_limit_recommendation",
    target_kind: "strategy", target_id: "strategy-1", target_version: "spec-v4",
    proposed_value: { max_risk: 0.02 }, rationale: "Bound risk", evidence_refs: [], environment_ceiling: "paper",
    validation_plan: { validator: "pantheon_candidate_validation_v1", required_checks: ["source_binding"] },
    created_at: "2026-07-17T00:00:00Z", updated_at: "2026-07-17T00:01:00Z", expires_at: "2026-07-24T00:00:00Z",
    execution_authority: "none", authority, audit: [],
  };
  return {
    candidate, revisions: [candidate], decisions, validation_receipts: [], formal_approval_receipts: [],
    etag: `"${"e".repeat(64)}"`,
    readiness: {
      candidate: { ready: true, reason: null, allowed_actions: ["modify", "reject", "defer"] },
      validation: { adapter_ready: true, reason: null, adapter_id: "pantheon_candidate_validation_v1", can_run: true, current_passed: false, current_receipt_id: null },
      reviewer: { store_ready: true, reason: null, can_request_decision: false, can_link_formal_approval: false, current_formal_approval_id: null },
      execution_authority: "none",
    },
    execution_authority: "none",
  };
}

beforeEach(() => {
  vi.mocked(bffFetch).mockReset();
  vi.mocked(liveWriteGated).mockReset();
  vi.mocked(liveWriteGated).mockResolvedValue(true);
});

describe("daily Persona interaction v1.9 adapter", () => {
  it("filters authoritative list readback by Workshop without fabricating data", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: [interaction("i1", "w1"), interaction("i2", "w2")],
      meta: {
        capability: "agora.persona.interaction.daily.v1",
        audience: "tenant:t1:user:operator-1",
        snapshot_at: "2026-07-17T00:00:00Z",
        authoritative_store: "agora_interaction_postgres",
        next_page_token: null,
      },
    });
    await expect(listDailyInteractions("w2")).resolves.toEqual([expect.objectContaining({ interaction_id: "i2" })]);
    expect(bffFetch).toHaveBeenCalledWith({
      method: "GET",
      path: "/bff/agora/interactions",
      query: { page_size: 100, page_token: undefined, workshop_id: "w2" },
    });
  });

  it("passes the Workshop filter to the server and drains every authoritative page", async () => {
    vi.mocked(bffFetch)
      .mockResolvedValueOnce({ data: [interaction("i1", "w1")], meta: { next_page_token: "page-2" } })
      .mockResolvedValueOnce({ data: [interaction("i2", "w1")], meta: { next_page_token: null } });

    await expect(listDailyInteractions("w1")).resolves.toEqual([
      expect.objectContaining({ interaction_id: "i1" }),
      expect.objectContaining({ interaction_id: "i2" }),
    ]);
    expect(bffFetch).toHaveBeenNthCalledWith(1, expect.objectContaining({
      query: { page_size: 100, page_token: undefined, workshop_id: "w1" },
    }));
    expect(bffFetch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      query: { page_size: 100, page_token: "page-2", workshop_id: "w1" },
    }));
  });

  it("feature-detects an undeployed contract instead of falling back to a fake success", async () => {
    vi.mocked(bffFetch).mockRejectedValue(makeBffError({ code: "RESOURCE_NOT_FOUND", message: "missing" }));
    await expect(listDailyInteractions("w1")).rejects.toBeInstanceOf(DailyInteractionUnsupportedError);
  });

  it("rejects readback that claims any execution authority", async () => {
    const unsafe = interaction("i1", "w1");
    unsafe.authority = { ...authority, order_submitted: true as false };
    vi.mocked(bffFetch).mockResolvedValue({ data: [unsafe], meta: {} });
    await expect(listDailyInteractions()).rejects.toThrow("advisory-only authority boundary");
  });

  it("sends only exact candidate revision/digest and operator decision data", async () => {
    const decision: CandidateDecisionRecord = {
      decision_id: "d1", proposal_id: "p1", interaction_id: "i1", measure_id: "m1",
      opinion_id: "opinion-1", opinion_sha256: "c".repeat(64), measure_sha256: "a".repeat(64),
      action: "accepted_for_review", actor_id: "operator-1", reason: "Review the evidence",
      revision: 3, proposal_digest: "b".repeat(64), review_request_id: "review-1",
      decided_at: "2026-07-17T00:00:00Z", formal_approval: false, execution_authority: "none", audit_ref: "audit-1",
    };
    vi.mocked(bffFetch).mockResolvedValue({ data: candidateReadback([decision]), meta: {} });
    await decideCandidate({
      proposalId: "p1",
      action: "accept_for_review",
      reason: "Review the evidence",
      revision: 3,
      proposalDigest: "b".repeat(64),
      proposalEtag: '"candidate-etag-3"',
      idempotencyKey: "pint15-decision-93f19d24",
    });
    expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/bff/agora/proposals/p1/candidate-decisions",
      headers: { "If-Match": '"candidate-etag-3"' },
      idempotencyKey: "pint15-decision-93f19d24",
      body: {
        action: "accept_for_review",
        reason: "Review the evidence",
        expected_revision: 3,
        expected_proposal_digest: "b".repeat(64),
      },
    }));
    expect(JSON.stringify(vi.mocked(bffFetch).mock.calls[0][0])).not.toContain("validation_result");
  });

  it("creates a candidate by server-persisted measure identity without a browser-authored digest", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: candidateReadback(), meta: {} });
    await createCandidateFromMeasure({
      interactionId: "i1",
      opinionId: "opinion-1",
      measureId: "m1",
      measureSha256: "a".repeat(64),
      idempotencyKey: "pint15-candidate-93f19d24",
    });
    expect(bffFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/bff/agora/interactions/i1/recommended-measures/m1/candidates",
      idempotencyKey: "pint15-candidate-93f19d24",
      body: {
        interaction_id: "i1",
        opinion_id: "opinion-1",
        measure_id: "m1",
      },
    });
    expect(JSON.stringify(vi.mocked(bffFetch).mock.calls[0][0])).not.toContain("expected_measure_sha256");
  });

  it("fails closed when candidate creation crosses the selected server measure digest", async () => {
    const crossed = candidateReadback();
    crossed.candidate.measure_sha256 = "d".repeat(64);
    vi.mocked(bffFetch).mockResolvedValue({ data: crossed, meta: {} });

    await expect(createCandidateFromMeasure({
      interactionId: "i1", opinionId: "opinion-1", measureId: "m1",
      measureSha256: "a".repeat(64), idempotencyKey: "pint15-candidate-digest-cross",
    })).rejects.toThrow("persisted Persona measure binding");
    expect(JSON.stringify(vi.mocked(bffFetch).mock.calls[0][0])).not.toContain("measureSha256");
  });

  it("rejects truthy non-boolean readiness and cross-candidate durable audit rows", async () => {
    const malformed = candidateReadback();
    malformed.readiness.validation.adapter_ready = "false" as unknown as boolean;
    vi.mocked(bffFetch).mockResolvedValueOnce({ data: malformed, meta: {} });
    await expect(listCandidateDecisions("p1")).rejects.toThrow("readiness was malformed");

    const crossedDecision: CandidateDecisionRecord = {
      decision_id: "crossed", proposal_id: "p1", interaction_id: "other-interaction",
      opinion_id: "opinion-1", opinion_sha256: "c".repeat(64), measure_id: "m1",
      measure_sha256: "a".repeat(64), action: "deferred", actor_id: "operator-1",
      reason: "Wait", revision: 3, proposal_digest: "b".repeat(64), decided_at: "2026-07-17T00:00:00Z",
      formal_approval: false, execution_authority: "none", audit_ref: "audit-crossed",
    };
    vi.mocked(bffFetch).mockResolvedValueOnce({ data: candidateReadback([crossedDecision]), meta: {} });
    await expect(listCandidateDecisions("p1")).rejects.toThrow("durable source");
  });

  it("reads candidate decisions from the reload-safe candidate detail envelope", async () => {
    const decision = {
      decision_id: "decision-1", proposal_id: "p1", interaction_id: "i1", measure_id: "m1",
      opinion_id: "opinion-1", opinion_sha256: "c".repeat(64), measure_sha256: "a".repeat(64),
      action: "accepted_for_review" as const, actor_id: "operator-1", reason: "Ready for independent review",
      revision: 3, proposal_digest: "b".repeat(64), review_request_id: "review-1",
      decided_at: "2026-07-17T00:00:00Z", formal_approval: false as const,
      execution_authority: "none" as const, audit_ref: "audit-1",
    };
    vi.mocked(bffFetch).mockResolvedValue({ data: candidateReadback([decision]), meta: {} });

    await expect(listCandidateDecisions("p1")).resolves.toEqual([decision]);
    expect(bffFetch).toHaveBeenCalledWith({ method: "GET", path: "/bff/agora/proposals/p1/candidate" });
  });

  it("runs only server-owned validation and reads reviewer readiness without browser results", async () => {
    const readback = candidateReadback();
    vi.mocked(bffFetch)
      .mockResolvedValueOnce({ data: readback, meta: {} })
      .mockResolvedValueOnce({ data: {
        proposal_id: "p1", readiness: readback.readiness, etag: readback.etag, execution_authority: "none",
      }, meta: {} });
    await requestAuthoritativeValidation({
      proposalId: "p1", revision: 3, proposalDigest: "b".repeat(64), proposalEtag: readback.etag,
      idempotencyKey: "pint15-validation-93f19d24",
    });
    expect(bffFetch).toHaveBeenNthCalledWith(1, {
      method: "POST", path: "/bff/agora/proposals/p1/validations",
      headers: { "If-Match": readback.etag }, idempotencyKey: "pint15-validation-93f19d24",
      body: { expected_revision: 3, expected_proposal_digest: "b".repeat(64) },
    });
    expect(JSON.stringify(vi.mocked(bffFetch).mock.calls[0][0])).not.toContain("validation_result");
    await expect(getCandidateReviewReadiness("p1")).resolves.toMatchObject({
      proposal_id: "p1", etag: readback.etag, execution_authority: "none",
    });
    expect(bffFetch).toHaveBeenNthCalledWith(2, {
      method: "GET", path: "/bff/agora/proposals/p1/review-readiness",
    });
  });

  it("retries failed providers through the durable interaction retry command", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: interaction("i1", "w1") });
    await retryDailyInteraction({ interactionId: "i1", reason: "Transient provider outage", idempotencyKey: "pint15-retry-93f19d24" });
    expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/bff/agora/interactions/i1:retry",
      body: { reason: "Transient provider outage" },
      idempotencyKey: "pint15-retry-93f19d24",
    }));
  });

  it("rejects a retry idempotency key derived from free-form reason text", async () => {
    await expect(retryDailyInteraction({
      interactionId: "i1",
      reason: "Provider outage",
      idempotencyKey: "pint15-retry-原因",
    })).rejects.toThrow("ASCII-safe");
    expect(bffFetch).not.toHaveBeenCalled();
  });
});
