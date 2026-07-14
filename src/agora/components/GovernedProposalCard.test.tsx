import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GovernedProposalCard } from "./GovernedProposalCard";
import * as api from "@/lib/bff-v1/agora/governance";
import { proposalActionDisabledReason } from "@/agora/governedProposalAccess";

vi.mock("@/agora/useAgoraWriteAccess", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/agora/useAgoraWriteAccess")>();
  return {
    ...original,
    useAgoraWriteAccess: () => ({
      actorId: "reviewer-1",
      agoraCapabilities: ["agora.workshop.v1"],
      capabilities: ["risk.approve"],
      roles: ["reviewer"],
      loading: false,
      interactionAllowed: true,
      interactionDisabledReason: null,
      writeAllowed: true,
      writeDisabledReason: null,
    }),
  };
});

const base = {
  proposal_id: "prop-1", proposal_type: "risk_limit_recommendation", target_kind: "strategy", target_id: "s1", target_version: "v7",
  current_value: { limit: 5 }, proposed_value: { limit: 3 }, rationale: "Reduce drawdown", evidence_refs: ["evidence-1"],
  environment_ceiling: "live" as const, required_permissions: ["risk.approve"], required_reviewers: ["human", "risk"], human_gate: true,
  proposer: "persona-proposer",
  execution_authority: "none",
  revision: 1, state: "draft", expires_at: "2026-08-01T00:00:00Z", audit: [{ action: "create", actor: "persona", at: "now" }],
  governed_action_link: null,
};

describe("GovernedProposalCard", () => {
  it("renders structured diff, ceiling, approvals, and non-execution truth", () => {
    render(<GovernedProposalCard initialProposal={base} initialEtag={'"v1"'} />);
    expect(screen.getByLabelText("Structured proposal diff").textContent).toContain("Current");
    expect(screen.getByText((_, element) => element?.textContent === "strategy · s1 · immutable target v7")).toBeTruthy();
    expect(screen.getByText("Human gate: required")).toBeTruthy();
    expect(screen.getByText(/Conversation and approval do not mean execution/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "validate" })).toBeDisabled();
  });

  it("forwards authoritative validation and approval artifacts", async () => {
    const validated = { ...base, state: "validated", validation: { valid: true } };
    vi.spyOn(api, "actOnGovernedProposal").mockResolvedValue({ proposal: { ...validated, state: "approved", revision: 2 }, etag: '"v2"' });
    render(<GovernedProposalCard initialProposal={validated} initialEtag={'"v1"'} validationResult={{ valid: true }} approvalRefs={["risk-approval-9"]} />);
    fireEvent.click(screen.getByRole("button", { name: "approve" }));
    await waitFor(() => expect(api.actOnGovernedProposal).toHaveBeenCalledWith("prop-1", expect.objectContaining({ action: "approve", approval_refs: ["risk-approval-9"] }), '"v1"'));
  });

  it("modify creates a backend revision and updates rendered truth", async () => {
    const updated = { ...base, revision: 2, proposed_value: { limit: 2 } };
    vi.spyOn(api, "actOnGovernedProposal").mockResolvedValue({ proposal: updated, etag: '"v2"' });
    render(<GovernedProposalCard initialProposal={base} initialEtag={'"v1"'} />);
    fireEvent.click(screen.getByRole("button", { name: "Modify" }));
    fireEvent.change(screen.getByLabelText("Proposed value"), { target: { value: '{"limit":2}' } });
    fireEvent.click(screen.getByRole("button", { name: "Save new revision" }));
    await waitFor(() => expect(screen.getByText(/revision 2/)).toBeTruthy());
    expect(api.actOnGovernedProposal).toHaveBeenCalledWith("prop-1", expect.objectContaining({ action: "modify", proposed_value: { limit: 2 } }), '"v1"');
  });

  it("turns stale ETag failures into a reload instruction", async () => {
    vi.spyOn(api, "actOnGovernedProposal").mockRejectedValue({ status: 412 });
    render(<GovernedProposalCard initialProposal={base} initialEtag={'"stale"'} />);
    fireEvent.click(screen.getByRole("button", { name: "request review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload it");
  });

  it("fails closed for viewer, disabled writes, and proposer self-approval", () => {
    const allowed = {
      actorId: "reviewer-1", agoraCapabilities: ["agora.workshop.v1"], capabilities: ["risk.approve"], roles: ["reviewer"], loading: false,
      interactionAllowed: false, interactionDisabledReason: null, writeAllowed: true, writeDisabledReason: null,
    };
    expect(proposalActionDisabledReason("approve", { ...base, state: "validated" }, {
      ...allowed, roles: ["viewer"],
    })).toMatch(/require an operator/i);
    expect(proposalActionDisabledReason("approve", { ...base, state: "validated" }, {
      ...allowed, writeAllowed: false, writeDisabledReason: "Writes disabled by deployment policy.",
    })).toBe("Writes disabled by deployment policy.");
    expect(proposalActionDisabledReason("approve", { ...base, state: "validated", proposer: "reviewer-1" }, allowed)).toBe(
      "Proposal self-approval is forbidden.",
    );
  });

  it("uses the audience-filtered Agora manifest rather than JWT proposal permissions", () => {
    const access = {
      actorId: "reviewer-1",
      agoraCapabilities: ["agora.workshop.v1"],
      capabilities: [],
      roles: ["reviewer"],
      loading: false,
      interactionAllowed: true,
      interactionDisabledReason: null,
      writeAllowed: true,
      writeDisabledReason: null,
    };
    expect(proposalActionDisabledReason("validate", base, access)).toBeNull();
    expect(proposalActionDisabledReason("validate", base, {
      ...access,
      capabilities: ["risk.approve", "strategy.review"],
      agoraCapabilities: [],
    })).toMatch(/authoritative agora\.workshop\.v1/i);
  });
});
