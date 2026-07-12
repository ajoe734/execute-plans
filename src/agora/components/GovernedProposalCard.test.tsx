import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GovernedProposalCard } from "./GovernedProposalCard";
import * as api from "@/lib/bff-v1/agora/governance";

const base = {
  proposal_id: "prop-1", proposal_type: "risk_limit_recommendation", target_kind: "strategy", target_id: "s1", target_version: "v7",
  current_value: { limit: 5 }, proposed_value: { limit: 3 }, rationale: "Reduce drawdown", evidence_refs: ["evidence-1"],
  environment_ceiling: "live" as const, required_permissions: ["risk.approve"], required_reviewers: ["human", "risk"], human_gate: true,
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
});
