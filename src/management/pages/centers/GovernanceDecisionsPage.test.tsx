import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { GovernanceDecisionsPage } from "./GovernanceDecisionsPage";
import type { HumanInboxItem } from "@/lib/v5/management/humanInbox";
import { deriveGovernanceDecisionState } from "./governanceDecisionState";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderPage(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/governance-decisions" element={<GovernanceDecisionsPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const recommendationItem: HumanInboxItem = {
  id: "ranking_recommendation:persona-canary-alpha",
  kind: "ranking_recommendation",
  title: "Increase canary allocation — Canary Alpha",
  summary: "Rolling league score crossed the canary_to_live threshold.",
  requiredRole: "risk_owner",
  consequenceIfApproved: "", consequenceIfRejected: "", consequenceIfIgnored: "",
  canDecide: true, canProceed: true,
  status: "review",
  detailHref: "/management/human-inbox/ranking_recommendation%3Apersona-canary-alpha",
  links: { manageHref: "/management/human-inbox/ranking_recommendation%3Apersona-canary-alpha" },
};

describe("Governance Decisions — recommendations queue", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("renders the recommendations queue and a Rankings Center link without any embedded ranking table", () => {
    mocks.useV5Live.mockReturnValue({ data: [recommendationItem], loading: false, refresh: vi.fn() }); // GovernanceDecisionQueue -> humanInbox.list

    renderPage("/management/governance-decisions?tab=recommendations");

    expect(screen.getByRole("heading", { name: "Governance Decisions" })).toBeInTheDocument();
    expect(screen.getByText("Increase canary allocation — Canary Alpha")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View decision receipt/ })).toHaveAttribute(
      "href",
      "/management/human-inbox/ranking_recommendation%3Apersona-canary-alpha",
    );
    expect(screen.getByRole("link", { name: /Open Rankings Center/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/management/rankings"),
    );

    // Governance Decisions contains no competing full ranking table: per the
    // gap-doc decision, this tab must never host a second sortable ranking
    // table, only per-recommendation evidence links and a link out to
    // Rankings Center — assert no table element and no rank/tier/target-weight
    // columns render anywhere on the recommendations tab.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Rank")).not.toBeInTheDocument();
    expect(screen.queryByText("Tier")).not.toBeInTheDocument();
    expect(screen.queryByText("League score")).not.toBeInTheDocument();
    expect(screen.queryByText("Target weight")).not.toBeInTheDocument();
  });

  it("never renders a mutating control on the recommendations queue — every decision links out to Human Inbox", () => {
    mocks.useV5Live.mockReturnValue({ data: [recommendationItem], loading: false, refresh: vi.fn() });

    renderPage("/management/governance-decisions?tab=recommendations");

    expect(
      screen.queryByRole("button", { name: /approve|reject|apply|promote|increase|rebalance/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/cannot approve, reject, or apply anything itself/i)).toBeInTheDocument();
  });

  it("shows an honest empty queue instead of a fabricated recommendation", () => {
    mocks.useV5Live.mockReturnValue({ data: [], loading: false, refresh: vi.fn() });

    renderPage("/management/governance-decisions?tab=recommendations");

    expect(screen.getByText("No active governance decisions in this queue.")).toBeInTheDocument();
  });
});

describe("deriveGovernanceDecisionState", () => {
  it("derives blocked from canProceed/blockingReasons regardless of status", () => {
    expect(deriveGovernanceDecisionState({ status: "review", canProceed: false, blockingReasons: ["missing evidence"] }))
      .toBe("blocked");
  });

  it("maps known BFF status strings onto the governance vocabulary", () => {
    expect(deriveGovernanceDecisionState({ status: "approved", canProceed: true })).toBe("approval");
    expect(deriveGovernanceDecisionState({ status: "rejected", canProceed: true })).toBe("rejection");
    expect(deriveGovernanceDecisionState({ status: "expired", canProceed: true })).toBe("expiry");
    expect(deriveGovernanceDecisionState({ status: "deployed", canProceed: true })).toBe("applied");
    expect(deriveGovernanceDecisionState({ status: "superseded", canProceed: true })).toBe("superseded");
  });

  it("never invents a state the item did not report — unrecognized status falls back to review, not applied", () => {
    expect(deriveGovernanceDecisionState({ status: "some_future_bff_status", canProceed: true })).toBe("review");
  });
});
