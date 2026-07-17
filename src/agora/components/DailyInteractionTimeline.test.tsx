import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bff-v1/agora/dailyInteractions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bff-v1/agora/dailyInteractions")>();
  return {
    ...original,
    createCandidateFromMeasure: vi.fn().mockResolvedValue({ data: { proposal_id: "proposal-1" } }),
    decideCandidate: vi.fn(),
    listCandidateDecisions: vi.fn().mockResolvedValue([]),
    getAuthoritativeValidation: vi.fn(),
    retryDailyInteraction: vi.fn().mockResolvedValue({}),
  };
});

import { DailyInteractionTimeline } from "./DailyInteractionTimeline";
import { createCandidateFromMeasure, decideCandidate, getAuthoritativeValidation, listCandidateDecisions, retryDailyInteraction } from "@/lib/bff-v1/agora/dailyInteractions";
import type { AuthorityBoundary, DailyInteraction, ParticipantSnapshot } from "@/lib/bff-v1/agora/dailyInteractions";

const authority: AuthorityBoundary = {
  execution_authority: "none", order_submitted: false, broker_called: false, capital_changed: false,
  runtime_bound: false, lifecycle_promoted: false, policy_mutated: false, persona_memory_mutated: false,
};
const participant = (id: string, name: string): ParticipantSnapshot => ({
  persona_id: id, persona_version: "7", session_persona_id: `session-${id}`, display_name: name,
  provider_agent_id: `agent-${id}`, workspace_id: `workspace-${id}`, environment_ceiling: "paper",
  capability_snapshot: ["persona_opinion"], captured_at: "2026-07-17T00:00:00Z",
});

const item: DailyInteraction = {
  interaction_id: "int-1", workshop_id: "ws-1", status: "degraded",
  human_request: { request_id: "req-1", operator_id: "op-1", mode: "compare", request_text: "Compare the thesis", submitted_at: "2026-07-17T00:00:00Z", request_sha256: "a".repeat(64) },
  context_snapshot: {
    tenant_id: "tenant-1", source_route: "/management/personas/a", focused_object: { kind: "persona", id: "a" },
    context_refs: [{ kind: "persona", id: "a" }], evidence_cutoff: "2026-07-16T00:00:00Z",
    selected_persona_ids: ["a", "b"], initial_mode: "compare", return_route: "/management/personas/a", captured_at: "2026-07-17T00:00:00Z",
  },
  participants: [participant("a", "Alpha"), participant("b", "Beta")],
  provider_invocations: [
    { invocation_id: "invoke-a", participant: participant("a", "Alpha"), status: "succeeded", request_correlation_id: "request-a", response_correlation_id: "response-a", started_at: "2026-07-17T00:00:00Z" },
    { invocation_id: "invoke-b", participant: participant("b", "Beta"), status: "failed", request_correlation_id: "request-b", error: { code: "PROVIDER_DOWN", message: "Unavailable", retryable: true }, started_at: "2026-07-17T00:00:00Z" },
  ],
  opinions: [{
    opinion_id: "op-a", interaction_id: "int-1", participant: participant("a", "Alpha"), provider_invocation_id: "invoke-a",
    conclusion: "conditional", rationale: "Support only below the volatility cutoff.", confidence: 0.67,
    uncertainty: ["volatility"], risks: ["drawdown"], invalidation_conditions: ["spread widens"], evidence_refs: [], recommended_measures: [],
    provenance: { content_origin: "selected_persona_provider_response", provider_kind: "openclaw", provider_invocation_id: "invoke-a", request_correlated: true, response_correlated: true, canned_template: false, magic_topic_trigger: false, simulation: false },
    created_at: "2026-07-17T00:00:01Z", authority,
  }],
  synthesis: {
    synthesis_id: "syn-1", status: "degraded", opinion_ids: ["op-a"], summary: "One Persona completed; one provider failed.", agreements: [],
    disagreements: [{ opinion_ids: ["op-a", "missing-b"], cause: "provider availability", detail: "Beta could not answer." }],
    risk_notes: [], conditions: [], evidence_refs: [], created_at: "2026-07-17T00:00:02Z", authority,
  },
  missing_participant_ids: ["b"], degraded_participant_ids: ["b"], candidate_proposal_links: [], audit_refs: ["audit-1"],
  created_at: "2026-07-17T00:00:00Z", updated_at: "2026-07-17T00:00:02Z", authority,
};

afterEach(cleanup);

describe("DailyInteractionTimeline", () => {
  it("renders independent provenance, partial failure, and disagreement from backend truth", () => {
    render(<DailyInteractionTimeline interactions={[item]} onRefresh={vi.fn()} runtimeState="ready" writeAllowed />);
    expect(screen.getByTestId("interaction-status-int-1")).toHaveTextContent("degraded");
    expect(screen.getByTestId("persona-opinion-op-a")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("persona-opinion-op-a")).toHaveTextContent("invoke-a");
    expect(screen.getByTestId("interaction-partial-int-1")).toHaveTextContent("Missing: b");
    expect(screen.getByTestId("interaction-synthesis-int-1")).toHaveTextContent("Beta could not answer");
  });

  it("shows an explicit unsupported state and no success content", () => {
    render(<DailyInteractionTimeline interactions={[]} onRefresh={vi.fn()} runtimeState="unsupported" writeAllowed={false} />);
    expect(screen.getByTestId("daily-interactions-unsupported")).toHaveTextContent("not available");
    expect(screen.queryByTestId("daily-interaction-timeline")).toBeNull();
  });

  it("exposes a labelled mobile-safe refresh control", () => {
    const onRefresh = vi.fn();
    render(<DailyInteractionTimeline interactions={[item]} onRefresh={onRefresh} runtimeState="ready" writeAllowed />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh Persona interaction readback" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("reloads durable candidate decisions and canonical validation readback", async () => {
    const decision = {
      decision_id: "decision-1", proposal_id: "proposal-1", interaction_id: "int-1", measure_id: "measure-1",
      action: "accepted_for_review" as const, actor_id: "operator-7", reason: "Independent review required",
      revision: 4, proposal_digest: "b".repeat(64), review_request_id: "review-9",
      decided_at: "2026-07-17T00:00:00Z", formal_approval: false as const,
      execution_authority: "none" as const, audit_ref: "audit-decision-1",
    };
    vi.mocked(listCandidateDecisions).mockResolvedValue([decision]);
    vi.mocked(getAuthoritativeValidation).mockResolvedValue({
      validation_receipt_id: "validation-1", authority: "canonical_validation_service", tenant_id: "tenant-1",
      proposal_id: "proposal-1", revision: 4, proposal_digest: "b".repeat(64), outcome: "passed",
      evidence_refs: ["evidence-1"], validated_at: "2026-07-17T00:00:00Z", expires_at: "2026-07-18T00:00:00Z",
      receipt_sha256: "c".repeat(64),
    });
    const candidateItem: DailyInteraction = {
      ...item,
      opinions: [{
        ...item.opinions[0],
        recommended_measures: [{
          measure_id: "measure-1", measure_type: "risk_limit", target: { kind: "strategy", id: "strategy-1", version: "spec-v4" },
          proposed_value: { max_risk: 0.02 }, rationale: "Bound risk", expected_benefit: "Reduce drawdown", adverse_scenarios: [],
          confidence: 0.8, evidence_refs: [], environment_ceiling: "paper", validation_plan: { validator: "risk", required_checks: ["drawdown"] },
          rollback_trigger: "loss", rollback_action: "restore", authority,
        }],
      }],
      candidate_proposal_links: [{ proposal_id: "proposal-1", revision: 4, proposal_digest: "b".repeat(64), measure_id: "measure-1" }],
    };

    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<DailyInteractionTimeline interactions={[{ ...candidateItem, candidate_proposal_links: [] }]} onRefresh={onRefresh} runtimeState="ready" writeAllowed />);
    fireEvent.click(screen.getByRole("button", { name: "Create governed candidate" }));
    await waitFor(() => expect(createCandidateFromMeasure).toHaveBeenCalledWith(expect.objectContaining({
      interactionId: "int-1",
      opinionId: "op-a",
      measureId: "measure-1",
      measureSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })));
    expect(onRefresh).toHaveBeenCalled();

    rerender(<DailyInteractionTimeline interactions={[candidateItem]} onRefresh={onRefresh} runtimeState="ready" writeAllowed />);
    expect(await screen.findByTestId("candidate-decision-decision-1")).toHaveTextContent("accepted_for_review by operator-7 · revision 4");
    expect(screen.getByTestId("candidate-decision-decision-1")).toHaveTextContent("Audit: audit-decision-1");
    expect(listCandidateDecisions).toHaveBeenCalledWith("proposal-1");

    fireEvent.change(screen.getByLabelText("Decision rationale"), { target: { value: "Send to independent review" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept for review" }));
    await waitFor(() => expect(decideCandidate).toHaveBeenCalledWith(expect.objectContaining({
      proposalId: "proposal-1", action: "accept_for_review", reason: "Send to independent review", revision: 4,
    })));
    await waitFor(() => expect(vi.mocked(listCandidateDecisions).mock.calls.filter(([id]) => id === "proposal-1").length).toBeGreaterThanOrEqual(2));

    fireEvent.change(screen.getByLabelText("Authoritative validation receipt id"), { target: { value: "validation-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Load validation" }));
    expect(await screen.findByTestId("validation-receipt-validation-1")).toHaveTextContent("canonical_validation_service · passed · revision 4");
    expect(getAuthoritativeValidation).toHaveBeenCalledWith({ proposalId: "proposal-1", validationReceiptId: "validation-1" });
    fireEvent.change(screen.getByLabelText("Provider retry reason"), { target: { value: "Retry transient provider outage" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry failed providers" }));
    await waitFor(() => expect(retryDailyInteraction).toHaveBeenCalledWith({ interactionId: "int-1", reason: "Retry transient provider outage" }));
  });
});
