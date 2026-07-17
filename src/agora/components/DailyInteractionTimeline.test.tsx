import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bff-v1/agora/dailyInteractions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bff-v1/agora/dailyInteractions")>();
  return {
    ...original,
    createCandidateFromMeasure: vi.fn(),
    decideCandidate: vi.fn(),
    getCandidate: vi.fn(),
    requestAuthoritativeValidation: vi.fn(),
    retryDailyInteraction: vi.fn().mockResolvedValue({}),
  };
});

import { DailyInteractionTimeline } from "./DailyInteractionTimeline";
import { createCandidateFromMeasure, decideCandidate, getCandidate, retryDailyInteraction } from "@/lib/bff-v1/agora/dailyInteractions";
import type { AuthorityBoundary, CandidateReadback, DailyInteraction, ParticipantSnapshot } from "@/lib/bff-v1/agora/dailyInteractions";

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

function candidateReadback(overrides: Partial<CandidateReadback["readiness"]> = {}): CandidateReadback {
  const candidate: CandidateReadback["candidate"] = {
    proposal_id: "proposal-1", revision: 4, state: "draft", proposer_id: "operator-1",
    interaction_id: "int-1", opinion_id: "op-a", opinion_sha256: "a".repeat(64), measure_id: "measure-1",
    measure_sha256: "c".repeat(64), proposal_digest: "b".repeat(64), proposal_type: "risk_limit_recommendation",
    target_kind: "strategy", target_id: "strategy-1", target_version: "spec-v4",
    proposed_value: { max_risk: 0.02 }, rationale: "Bound risk", evidence_refs: [], environment_ceiling: "paper",
    validation_plan: { validator: "pantheon_candidate_validation_v1", required_checks: ["source_binding"] },
    created_at: "2026-07-17T00:00:00Z", updated_at: "2026-07-17T00:01:00Z", expires_at: "2026-07-24T00:00:00Z",
    execution_authority: "none", authority, audit: [],
  };
  return {
    candidate, revisions: [candidate], decisions: [], validation_receipts: [], formal_approval_receipts: [],
    etag: `"${"e".repeat(64)}"`,
    readiness: {
      candidate: { ready: true, reason: null, allowed_actions: ["modify", "accept_for_review", "reject", "defer"] },
      validation: { adapter_ready: true, reason: null, adapter_id: "pantheon_candidate_validation_v1", can_run: false, current_passed: false, current_receipt_id: null },
      reviewer: { store_ready: true, reason: null, can_request_decision: false, can_link_formal_approval: false, current_formal_approval_id: null },
      execution_authority: "none",
      ...overrides,
    },
    execution_authority: "none",
  };
}

function candidateInteraction(linked = true): DailyInteraction {
  return {
    ...item,
    opinions: [{
      ...item.opinions[0],
      recommended_measures: [{
        measure_id: "measure-1", measure_sha256: "c".repeat(64), measure_type: "risk_limit_recommendation",
        target: { kind: "strategy", id: "strategy-1", version: "spec-v4" }, proposed_value: { max_risk: 0.02 },
        rationale: "Bound risk", expected_benefit: "Reduce drawdown", adverse_scenarios: [], confidence: 0.8,
        evidence_refs: [], environment_ceiling: "paper", validation_plan: { validator: "pantheon_candidate_validation_v1", required_checks: ["source_binding"] },
        rollback_trigger: "loss", rollback_action: "restore", authority,
      }],
    }],
    candidate_proposal_links: linked ? [{
      proposal_id: "proposal-1", interaction_id: "int-1", opinion_id: "op-a", opinion_sha256: "a".repeat(64),
      revision: 1, proposal_digest: "b".repeat(64), measure_id: "measure-1", measure_sha256: "c".repeat(64),
      state: "draft", created_at: "2026-07-17T00:00:03Z", execution_authority: "none",
    }] : [],
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

  it("loads the current full-record ETag and fails accept-for-review closed when reviewer readiness is false", async () => {
    const candidateItem: DailyInteraction = {
      ...item,
      opinions: [{
        ...item.opinions[0],
        recommended_measures: [{
          measure_id: "measure-1", measure_sha256: "c".repeat(64), measure_type: "risk_limit", target: { kind: "strategy", id: "strategy-1", version: "spec-v4" },
          proposed_value: { max_risk: 0.02 }, rationale: "Bound risk", expected_benefit: "Reduce drawdown", adverse_scenarios: [],
          confidence: 0.8, evidence_refs: [], environment_ceiling: "paper", validation_plan: { validator: "risk", required_checks: ["drawdown"] },
          rollback_trigger: "loss", rollback_action: "restore", authority,
        }],
      }],
      candidate_proposal_links: [{
        proposal_id: "proposal-1", interaction_id: "int-1", opinion_id: "op-a", opinion_sha256: "a".repeat(64),
        revision: 1, proposal_digest: "b".repeat(64), measure_id: "measure-1", measure_sha256: "c".repeat(64),
        state: "draft", created_at: "2026-07-17T00:00:03Z", execution_authority: "none",
      }],
    };

    const blocked = candidateReadback();
    blocked.readiness.reviewer = {
      ...blocked.readiness.reviewer,
      store_ready: false,
      reason: "approval_store_unavailable",
    };
    vi.mocked(getCandidate).mockResolvedValue(blocked);
    render(<DailyInteractionTimeline interactions={[candidateItem]} onRefresh={vi.fn()} runtimeState="ready" writeAllowed />);

    await waitFor(() => expect(getCandidate).toHaveBeenCalledWith("proposal-1"));
    expect(await screen.findByText(/Current ETag:/)).toHaveTextContent(blocked.etag);
    expect(screen.getByRole("button", { name: "Modify" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Accept for review" })).toBeDisabled();
    expect(screen.getByTestId("candidate-readiness-proposal-1")).toHaveTextContent("approval_store_unavailable");
  });

  it("creates and modifies a candidate with server bindings and a legal per-attempt identity", async () => {
    const candidateItem: DailyInteraction = {
      ...item,
      opinions: [{
        ...item.opinions[0],
        recommended_measures: [{
          measure_id: "measure-1", measure_sha256: "c".repeat(64), measure_type: "risk_limit_recommendation",
          target: { kind: "strategy", id: "strategy-1", version: "spec-v4" }, proposed_value: { max_risk: 0.02 },
          rationale: "Bound risk", expected_benefit: "Reduce drawdown", adverse_scenarios: [], confidence: 0.8,
          evidence_refs: [], environment_ceiling: "paper", validation_plan: { validator: "pantheon_candidate_validation_v1", required_checks: ["source_binding"] },
          rollback_trigger: "loss", rollback_action: "restore", authority,
        }],
      }],
      candidate_proposal_links: [],
    };
    const first = candidateReadback();
    const modified = candidateReadback();
    modified.candidate = { ...modified.candidate, revision: 5, proposed_value: { max_risk: 0.015 }, proposal_digest: "d".repeat(64) };
    modified.etag = `"${"f".repeat(64)}"`;
    vi.mocked(createCandidateFromMeasure).mockResolvedValue(first);
    vi.mocked(decideCandidate).mockResolvedValue(modified);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<DailyInteractionTimeline interactions={[candidateItem]} onRefresh={onRefresh} runtimeState="ready" writeAllowed />);

    fireEvent.click(screen.getByRole("button", { name: "Create governed candidate" }));
    await waitFor(() => expect(createCandidateFromMeasure).toHaveBeenCalledWith({
      interactionId: "int-1", opinionId: "op-a", measureId: "measure-1",
      measureSha256: "c".repeat(64),
      idempotencyKey: expect.stringMatching(/^pint15-candidate-[A-Za-z0-9._:-]+$/),
    }));
    fireEvent.change(await screen.findByLabelText(/Decision reason for proposal-1/), { target: { value: "Reduce risk after review" } });
    fireEvent.change(screen.getByLabelText(/Proposed value \(JSON\) for proposal-1/), { target: { value: '{"max_risk":0.015}' } });
    fireEvent.click(screen.getByRole("button", { name: "Modify" }));
    await waitFor(() => expect(decideCandidate).toHaveBeenCalledWith({
      proposalId: "proposal-1", action: "modify", reason: "Reduce risk after review", revision: 4,
      proposalDigest: "b".repeat(64), proposalEtag: first.etag,
      idempotencyKey: expect.stringMatching(/^pint15-modify-[A-Za-z0-9._:-]+$/),
      proposedValue: { max_risk: 0.015 },
    }));
  });

  it("reuses a decision key only for the exact failed action and payload", async () => {
    const readback = candidateReadback();
    vi.mocked(getCandidate).mockResolvedValue(readback);
    vi.mocked(decideCandidate).mockRejectedValue(new Error("transient decision failure"));
    render(<DailyInteractionTimeline interactions={[candidateInteraction()]} onRefresh={vi.fn()} runtimeState="ready" writeAllowed />);

    await screen.findByText(/Current ETag:/);
    fireEvent.change(screen.getByLabelText(/Decision reason for proposal-1/), { target: { value: "Same durable reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Modify" }));
    await waitFor(() => expect(decideCandidate).toHaveBeenCalledTimes(1));
    const firstKey = vi.mocked(decideCandidate).mock.calls[0][0].idempotencyKey;

    await waitFor(() => expect(screen.getByRole("button", { name: "Modify" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Modify" }));
    await waitFor(() => expect(decideCandidate).toHaveBeenCalledTimes(2));
    expect(vi.mocked(decideCandidate).mock.calls[1][0].idempotencyKey).toBe(firstKey);

    await waitFor(() => expect(screen.getByRole("button", { name: "Defer" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Defer" }));
    await waitFor(() => expect(decideCandidate).toHaveBeenCalledTimes(3));
    expect(vi.mocked(decideCandidate).mock.calls[2][0].idempotencyKey).not.toBe(firstKey);
  });

  it("fails malformed truthy readiness closed in every write control", async () => {
    const malformed = candidateReadback();
    malformed.readiness.candidate.ready = "false" as unknown as boolean;
    malformed.readiness.validation.adapter_ready = "false" as unknown as boolean;
    malformed.readiness.validation.can_run = "false" as unknown as boolean;
    malformed.readiness.reviewer.store_ready = "false" as unknown as boolean;
    vi.mocked(getCandidate).mockResolvedValue(malformed);
    render(<DailyInteractionTimeline interactions={[candidateInteraction()]} onRefresh={vi.fn()} runtimeState="ready" writeAllowed />);

    await screen.findByText(/Current ETag:/);
    expect(screen.getByRole("button", { name: "Modify" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept for review" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run authoritative validation" })).toBeDisabled();
  });

  it("uses a legal per-attempt key when retrying the latest failed Persona invocation", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<DailyInteractionTimeline interactions={[item]} onRefresh={onRefresh} runtimeState="ready" writeAllowed />);
    fireEvent.change(screen.getByLabelText("Provider retry reason"), { target: { value: "Retry transient provider outage" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry failed providers" }));
    await waitFor(() => expect(retryDailyInteraction).toHaveBeenCalledWith({
      interactionId: "int-1",
      reason: "Retry transient provider outage",
      idempotencyKey: expect.stringMatching(/^pint15-retry-[A-Za-z0-9._:-]+$/),
    }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("shows only the latest attempt per Persona and clears a historical retryable failure", () => {
    const recovered: DailyInteraction = {
      ...item,
      provider_invocations: [
        ...item.provider_invocations,
        {
          invocation_id: "invoke-b-retry",
          participant: participant("b", "Beta"),
          status: "succeeded",
          request_correlation_id: "request-b-retry",
          response_correlation_id: "response-b-retry",
          started_at: "2026-07-17T00:01:00Z",
        },
      ],
    };
    render(<DailyInteractionTimeline interactions={[recovered]} onRefresh={vi.fn()} runtimeState="ready" writeAllowed />);
    expect(screen.getByText("Beta · v7").parentElement).toHaveTextContent("succeeded");
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry failed providers" })).not.toBeInTheDocument();
  });
});
