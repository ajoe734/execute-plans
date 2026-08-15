import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GovernedProposalWorkshopCard } from "./GovernedProposalWorkshopCard";
import * as governance from "@/lib/bff-v1/agora/governance";

vi.mock("@/agora/useAgoraWriteAccess", () => ({
  capabilitiesAllow: (granted: string[], required: string[]) => required.every((item) => granted.includes(item)),
  useAgoraWriteAccess: () => ({
    actorId: "distinct-reviewer",
    agoraCapabilities: ["agora.workshop.v1"],
    capabilities: ["risk.approve"],
    roles: ["reviewer"],
    loading: false,
    interactionAllowed: true,
    interactionDisabledReason: null,
    writeAllowed: true,
    writeDisabledReason: null,
  }),
}));

const proposal = {
  proposal_id: "prop-canonical", proposal_type: "risk_limit_recommendation", target_kind: "strategy",
  target_id: "strategy-1", target_version: "v9", current_value: { limit: 5 }, proposed_value: { limit: 3 },
  rationale: "Reduce drawdown", evidence_refs: ["evidence-1"], environment_ceiling: "paper" as const,
  required_permissions: ["risk.approve"], required_reviewers: ["reviewer"], human_gate: true,
  revision: 2, state: "validated", expires_at: "2026-08-01T00:00:00Z", audit: [],
  proposer: "proposal-author", execution_authority: "none",
  available_approval_decision_refs: ["approval-decision-7"],
  approval_decision_readiness: { ready: true },
  governed_action_link: { execution_authority: "none" },
};

describe("GovernedProposalWorkshopCard canonical approval supply", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses fetched canonical refs/readiness and enables approval for a distinct reviewer", async () => {
    vi.spyOn(governance, "getGovernedProposal").mockResolvedValue({ proposal, etag: '"v2"' });
    vi.spyOn(governance, "actOnGovernedProposal").mockResolvedValue({
      proposal: { ...proposal, revision: 3, state: "approved" }, etag: '"v3"',
    });
    render(<GovernedProposalWorkshopCard payload={{ approval_refs: ["stale-payload-ref"] }} proposalId="prop-canonical" />);

    const approve = await screen.findByRole("button", { name: "approve" });
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() => expect(governance.actOnGovernedProposal).toHaveBeenCalledWith(
      "prop-canonical",
      expect.objectContaining({ action: "approve", approval_refs: ["approval-decision-7"] }),
      '"v2"',
    ));
  });

  it("replaces an embedded event snapshot with the canonical GET readback", async () => {
    const get = vi.spyOn(governance, "getGovernedProposal").mockResolvedValue({ proposal, etag: '"v2"' });
    render(<GovernedProposalWorkshopCard payload={{
      proposal: {
        ...proposal,
        revision: 1,
        available_approval_decision_refs: ["stale-event-ref"],
      },
      proposal_etag: '"v1"',
    }} />);

    expect(screen.getByText(/revision 1/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/revision 2/i)).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith("prop-canonical");
  });

  it("honors canonical not-ready reason even when refs exist", async () => {
    vi.spyOn(governance, "getGovernedProposal").mockResolvedValue({
      proposal: {
        ...proposal,
        approval_decision_readiness: { ready: false, reason: "Waiting for risk-owner decision." },
      },
      etag: '"v2"',
    });
    render(<GovernedProposalWorkshopCard payload={{}} proposalId="prop-canonical" />);

    const approve = await screen.findByRole("button", { name: "approve" });
    expect(approve).toBeDisabled();
    expect(screen.getByTestId("proposal-approval-disabled-reason")).toHaveTextContent(
      "Waiting for risk-owner decision.",
    );
  });

  it("does not fall back to payload refs when the canonical store returns none", async () => {
    vi.spyOn(governance, "getGovernedProposal").mockResolvedValue({
      proposal: {
        ...proposal,
        available_approval_decision_refs: [],
        approval_decision_refs_authority: "canonical_read_store",
        approval_decision_readiness: {
          ready: false,
          reason: "authoritative_approval_required",
          missing_required_reviewers: ["risk"],
        },
      },
      etag: '"v2"',
    });
    render(<GovernedProposalWorkshopCard payload={{ approval_refs: ["payload-controlled"] }} proposalId="prop-canonical" />);

    const approve = await screen.findByRole("button", { name: "approve" });
    expect(approve).toBeDisabled();
    expect(screen.getByTestId("proposal-approval-disabled-reason")).toHaveTextContent(
      "authoritative_approval_required",
    );
  });
});
