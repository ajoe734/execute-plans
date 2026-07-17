import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({ bffFetch: vi.fn() }));
vi.mock("../writeGate", () => ({ liveWriteGated: vi.fn() }));

import { bffFetch } from "../client";
import { liveWriteGated } from "../writeGate";
import {
  DailyInteractionUnsupportedError,
  decideCandidate,
  listCandidateDecisions,
  listDailyInteractions,
  retryDailyInteraction,
  type AuthorityBoundary,
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
    expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", path: "/bff/agora/interactions" }));
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
    vi.mocked(bffFetch).mockResolvedValue({ data: {
      decision_id: "d1", proposal_id: "p1", interaction_id: "i1", measure_id: "m1",
      action: "accepted_for_review", actor_id: "operator-1", reason: "Review the evidence",
      revision: 3, proposal_digest: "b".repeat(64), review_request_id: "review-1",
      decided_at: "2026-07-17T00:00:00Z", formal_approval: false, execution_authority: "none", audit_ref: "audit-1",
    } });
    await decideCandidate({ proposalId: "p1", action: "accept_for_review", reason: "Review the evidence", revision: 3, proposalDigest: "b".repeat(64) });
    expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/bff/agora/proposals/p1/candidate-decisions",
      body: {
        action: "accept_for_review",
        reason: "Review the evidence",
        expected_revision: 3,
        expected_proposal_digest: "b".repeat(64),
      },
    }));
    expect(JSON.stringify(vi.mocked(bffFetch).mock.calls[0][0])).not.toContain("validation_result");
  });

  it("reads candidate decisions from the OpenAPI data array envelope", async () => {
    const decision = {
      decision_id: "decision-1", proposal_id: "p1", interaction_id: "i1", measure_id: "m1",
      action: "accepted_for_review" as const, actor_id: "operator-1", reason: "Ready for independent review",
      revision: 3, proposal_digest: "b".repeat(64), review_request_id: "review-1",
      decided_at: "2026-07-17T00:00:00Z", formal_approval: false as const,
      execution_authority: "none" as const, audit_ref: "audit-1",
    };
    vi.mocked(bffFetch).mockResolvedValue({ data: [decision], meta: {} });

    await expect(listCandidateDecisions("p1")).resolves.toEqual([decision]);
    expect(bffFetch).toHaveBeenCalledWith({ method: "GET", path: "/bff/agora/proposals/p1/candidate-decisions" });
  });

  it("retries failed providers through the durable interaction retry command", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: interaction("i1", "w1") });
    await retryDailyInteraction({ interactionId: "i1", reason: "Transient provider outage" });
    expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/bff/agora/interactions/i1:retry",
      body: { reason: "Transient provider outage" },
      idempotencyKey: expect.stringContaining("pint15-retry-i1"),
    }));
  });
});
