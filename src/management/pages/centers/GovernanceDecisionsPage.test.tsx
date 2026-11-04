import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { GovernanceDecisionsPage } from "./GovernanceDecisionsPage";
import type { HumanInboxItem } from "@/lib/v5/management/humanInbox";
import { deriveGovernanceDecisionState } from "./governanceDecisionState";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
  useLiveListV1: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    useLiveListV1: mocks.useLiveListV1,
  };
});

void i18n.changeLanguage("en-US");

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname}{loc.search}</output>;
}

function renderPage(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/management/governance-decisions"
              element={(
                <>
                  <GovernanceDecisionsPage />
                  <LocationProbe />
                </>
              )}
            />
            <Route path="/management/capital/:id" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
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
    mocks.useLiveListV1.mockReset();
    mocks.useLiveListV1.mockReturnValue({ items: [], pending: 0, refresh: vi.fn(), meta: {} });
  });

  it("renders the recommendations queue and a Rankings Center link without any embedded ranking table", () => {
    mocks.useV5Live.mockReturnValue({ data: [recommendationItem], loading: false, refresh: vi.fn() }); // GovernanceDecisionQueue -> humanInbox.list

    renderPage("/management/governance-decisions?tab=recommendations");

    expect(screen.getByRole("heading", { name: "Governance Decisions" })).toBeInTheDocument();
    expect(screen.getByText("Increase canary allocation — Canary Alpha")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View decision receipt/ })).toHaveAttribute(
      "href",
      "/management/human-inbox/ranking_recommendation%3Apersona-canary-alpha?returnUrl=%2Fmanagement%2Fgovernance-decisions%3Ftab%3Drecommendations",
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

describe("Governance Decisions — capital queue", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    mocks.useLiveListV1.mockReset();
    mocks.useLiveListV1.mockReturnValue({ items: [], pending: 0, refresh: vi.fn(), meta: {} });
  });

  it("keeps broker disconnect and sentinel containment items visible after the legacy route redirect", () => {
    const containmentItems: HumanInboxItem[] = [
      {
        ...recommendationItem,
        id: "broker_disconnect:kraken",
        kind: "broker_disconnect",
        title: "Kraken disconnected",
      },
      {
        ...recommendationItem,
        id: "sentinel:drawdown",
        kind: "sentinel",
        title: "Drawdown sentinel fired",
      },
    ];
    mocks.useV5Live.mockReturnValue({ data: containmentItems, loading: false, refresh: vi.fn() });

    renderPage("/management/governance-decisions?tab=capital");

    expect(screen.getByText("Kraken disconnected")).toBeInTheDocument();
    expect(screen.getByText("Drawdown sentinel fired")).toBeInTheDocument();
  });

  it("renders formal, paper, and archived capital pool scopes with counts, auto-switches on capital_id focus, and opens /management/capital/:id on row click", () => {
    mocks.useV5Live.mockReturnValue({ data: [], loading: false, refresh: vi.fn() });
    const paperPool = {
      id: "hosted-all12-h12-claude-20261027-4923-pool",
      poolId: "hosted-all12-h12-claude-20261027-4923-pool",
      name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      owner: "tenant-dev",
      status: "active",
      state: undefined,
      risk: undefined,
      currency: "TWD",
      allocated: 0,
      utilized: 0,
      riskBudget: 0,
      updatedAt: "2026-11-01T08:41:17Z",
      capitalScope: "paper",
      reportedFields: {
        currency: true,
        allocated: false,
        utilized: false,
        riskBudget: false,
        risk: false,
      },
    };
    const archivedPool = {
      ...paperPool,
      id: "hosted-all12-archived-pool",
      poolId: "hosted-all12-archived-pool",
      name: "persona-strat-hosted-all12-archived paper pool",
      status: "archived",
      state: "retired" as const,
    };

    mocks.useLiveListV1.mockImplementation((_loader: unknown, liveKinds?: string[]) => {
      if (liveKinds?.includes("CapitalPool")) {
        return {
          items: [paperPool, archivedPool],
          pending: 0,
          refresh: vi.fn(),
          meta: {},
        };
      }
      return { items: [], pending: 0, refresh: vi.fn(), meta: {} };
    });

    renderPage(
      "/management/governance-decisions?tab=capital&capital_id=hosted-all12-h12-claude-20261027-4923-pool",
    );

    expect(screen.getByRole("button", { name: "Formal (0)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Paper (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Archived (1)" })).toHaveAttribute("aria-pressed", "false");

    const rowText = screen.getByText(
      "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
    );
    expect(rowText).toBeInTheDocument();

    fireEvent.click(rowText);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/management/capital/hosted-all12-h12-claude-20261027-4923-pool",
    );
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
