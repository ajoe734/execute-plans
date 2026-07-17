import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({ bffFetch: vi.fn() }));
vi.mock("../writeGate", () => ({ liveWriteGated: vi.fn() }));

import { bffFetch } from "../client";
import { liveWriteGated } from "../writeGate";
import {
  DailyInteractionUnsupportedError,
  decideCandidate,
  listDailyInteractions,
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
    vi.mocked(bffFetch).mockResolvedValue({ data: { items: [interaction("i1", "w1"), interaction("i2", "w2")] } });
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
    vi.mocked(bffFetch).mockResolvedValue({ data: { items: [unsafe] } });
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
});
