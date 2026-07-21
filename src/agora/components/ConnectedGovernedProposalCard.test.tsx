import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bff-v1/agora/governance", () => ({
  actOnGovernedProposal: vi.fn(),
  getGovernedProposal: vi.fn(),
}));

import { ConnectedGovernedProposalCard } from "./ConnectedGovernedProposalCard";
import * as governance from "@/lib/bff-v1/agora/governance";

const proposal = {
  proposal_id: "prop-pint-010",
  proposal_type: "risk_limit_recommendation",
  target_kind: "strategy",
  target_id: "strategy-pint-010",
  target_version: "v2",
  current_value: { limit: 5 },
  proposed_value: { limit: 3 },
  rationale: "Reduce drawdown before paper validation.",
  evidence_refs: ["evidence-pint-010"],
  environment_ceiling: "paper" as const,
  required_permissions: ["strategy.review"],
  required_reviewers: ["risk"],
  human_gate: true,
  revision: 1,
  state: "draft",
  expires_at: "2026-08-01T00:00:00Z",
  audit: [{ action: "create", actor: "operator-pint-010", at: "2026-07-14T00:00:00Z" }],
  governed_action_link: null,
};

describe("ConnectedGovernedProposalCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("loads an explicit governed proposal id and renders decision controls", async () => {
    vi.mocked(governance.getGovernedProposal).mockResolvedValue({ proposal, etag: '"v1"' });

    render(<ConnectedGovernedProposalCard proposalId="prop-pint-010" />);

    expect(screen.getByTestId("governed-proposal-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("governed-proposal-prop-pint-010")).toBeInTheDocument();
    expect(governance.getGovernedProposal).toHaveBeenCalledWith("prop-pint-010");
    expect(screen.getByRole("button", { name: "approve" })).toBeDisabled();
  });

  it("fails closed when the proposal is outside the viewer scope", async () => {
    vi.mocked(governance.getGovernedProposal).mockRejectedValue({ status: 404 });

    render(<ConnectedGovernedProposalCard proposalId="prop-missing" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("not found or is outside your tenant scope");
    expect(screen.queryByRole("button", { name: "approve" })).not.toBeInTheDocument();
  });
});
