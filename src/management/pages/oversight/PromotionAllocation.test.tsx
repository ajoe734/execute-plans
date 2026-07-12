import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { PromotionAllocationPage } from "./PromotionAllocation";
import type { HumanInboxItem } from "@/lib/v5/management/humanInbox";

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
          <Route path="/management/promotion-allocation" element={<PromotionAllocationPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("Promotion & Allocation legacy shell", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("is a legacy shell with no internal tabs, no embedded ranking table, and links to the canonical centers", () => {
    mocks.useV5Live.mockReturnValue({ data: [], loading: false, refresh: vi.fn() });
    renderPage("/management/promotion-allocation");

    // MGMT-PERF-IA-005: every other tab (paper-candidates/real-ranking/
    // quarterly-capital/formula-policy) now redirects to a canonical center
    // before this page ever renders (PromotionAllocationLegacyGate) — no
    // internal <Tabs> and no embedded RealRankingPanel/CapitalPoolsList/
    // RankingFormulasList table survives here.
    expect(screen.getByRole("heading", { name: "Promotion & Allocation" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Real allocation target weights")).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Open Performance Center/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/management/performance"),
    );
    expect(screen.getByRole("link", { name: /Open Rankings Center/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/management/rankings"),
    );
    expect(screen.getByRole("link", { name: /Open Governance Decisions/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/management/governance-decisions"),
    );
  });

  it("Emergency actions is read-only, links out, and never offers to promote or increase capital", () => {
    const items: HumanInboxItem[] = [
      {
        id: "capital_breach:persona-canary-alpha",
        kind: "capital_breach",
        title: "Drawdown breach — Canary Alpha",
        summary: "Daily loss exceeded policy threshold.",
        requiredRole: "risk_owner",
        consequenceIfApproved: "", consequenceIfRejected: "", consequenceIfIgnored: "",
        canDecide: true, canProceed: true,
        detailHref: "/management/human-inbox/capital_breach%3Apersona-canary-alpha",
        links: { manageHref: "/management/human-inbox/capital_breach%3Apersona-canary-alpha" },
      },
      {
        id: "approval:unrelated",
        kind: "approval",
        title: "Unrelated approval",
        requiredRole: "operator",
        consequenceIfApproved: "", consequenceIfRejected: "", consequenceIfIgnored: "",
        canDecide: true, canProceed: true,
        detailHref: "/management/human-inbox/approval%3Aunrelated",
        links: { manageHref: "/management/human-inbox/approval%3Aunrelated" },
      },
    ];
    mocks.useV5Live.mockReturnValue({ data: items, loading: false, refresh: vi.fn() });

    renderPage("/management/promotion-allocation?tab=emergency-actions");

    expect(screen.getByText("Drawdown breach — Canary Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated approval")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review →" })).toHaveAttribute(
      "href",
      "/management/human-inbox/capital_breach%3Apersona-canary-alpha",
    );
    expect(screen.getByText(/cannot promote a persona or increase capital/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote|increase|freeze|suspend|retire/i })).not.toBeInTheDocument();
  });
});
