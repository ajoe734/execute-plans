import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { PromotionAllocationPage } from "./PromotionAllocation";
import type { ManagementPersonaFleetRow, AllocationPolicyLine } from "@/lib/bff-v1/management";
import type { PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
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

const fleetRow: ManagementPersonaFleetRow = {
  personaId: "persona-canary-alpha",
  personaName: "Canary Alpha",
  owner: "research-1",
  ooda: "Orient",
  autonomy: "supervised",
  perfDelta: 0.01,
  humanNeeded: false,
  lastMutation: "2026-07-01",
  deploymentStage: "canary_running",
  capitalMode: "canary",
  capitalScope: "canary_sleeve",
  capitalSleeveId: "sleeve-canary-01",
  currentWeight: 0.03,
  bindingState: "bound",
};

const leagueRow: PersonaLeagueRow = {
  personaId: "persona-canary-alpha",
  personaName: "Canary Alpha",
  currentRank: 1,
  tier: "S",
  score: 92,
  scoreBreakdown: {
    pnlScore: 80, sharpeScore: 75, drawdownControlScore: 70, executionQualityScore: 85,
    riskComplianceScore: 90, improvementScore: 60, interventionPenalty: 2, hardPenalty: 0,
  },
  pnlToday: 1000, pnl7d: 5000, pnl30d: 20000, pnlQuarter: 60000, pnlYtd: 100000,
  sharpe: 2.1, maxDrawdown: -0.03, winRate: 0.6, turnover: 1.2, slippageBps: 2,
  fillRatio: 0.98, orderRejectRate: 0.002, riskPolicyViolations: 0, humanInterventions: 0,
  sentinelFindings: 0, mutationCount: 4, improvedMutations: 3, degradedMutations: 1,
  status: "active",
  links: { manageHref: "/management/personas/persona-canary-alpha" },
};

const increaseLine: AllocationPolicyLine = {
  personaId: "persona-canary-alpha",
  stage: "canary_running",
  capitalScope: "real",
  capitalSleeveId: "sleeve-canary-01",
  currentWeight: 0.03,
  targetWeight: 0.05,
  delta: 0.02,
  rankScore: 0.42,
  capacityAdjustedScore: 0.42,
  recommendation: "canary_to_live_review",
  capReasons: ["canary_cap"],
  exclusions: [],
  evidenceRefs: [],
  requiresHumanApproval: true,
};

describe("Promotion & Allocation workbench", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("exposes Emergency actions alongside the other PPL-ALLOC-006 tabs", () => {
    mocks.useV5Live.mockReturnValue({ data: [], loading: false, refresh: vi.fn() });
    renderPage("/management/promotion-allocation");

    expect(screen.getByRole("tab", { name: "Paper → Real" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Real ranking" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Quarterly allocation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Emergency actions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Formula policy" })).toBeInTheDocument();
  });

  it("normalizes legacy aliases (league, emergency) onto the canonical tab ids", () => {
    mocks.useV5Live.mockReturnValue({ data: [], loading: false, refresh: vi.fn() });
    renderPage("/management/promotion-allocation?tab=league");
    expect(screen.getByRole("tab", { name: "Real ranking" })).toHaveAttribute("aria-selected", "true");
  });

  it("Real ranking shows a capital increase as requiring approval, never as applied", () => {
    let call = 0;
    mocks.useV5Live.mockImplementation(() => {
      call += 1;
      if (call === 1) return { data: [fleetRow], loading: false, refresh: vi.fn() }; // personaFleet.get
      if (call === 2) return { data: [leagueRow], loading: false, refresh: vi.fn() }; // personaLeague.rankingsLiveOnly
      if (call === 3) return { data: [increaseLine], loading: false, refresh: vi.fn() }; // allocationPolicy.evaluate
      return { data: [leagueRow], loading: false, refresh: vi.fn() }; // embedded PersonaLeaguePage
    });

    renderPage("/management/promotion-allocation?tab=real-ranking");

    expect(screen.getByText("3.00%")).toBeInTheDocument(); // current weight
    expect(screen.getByText("5.00%")).toBeInTheDocument(); // target weight
    expect(screen.getByText("Requires human approval")).toBeInTheDocument();
    expect(screen.getByText("canary_cap")).toBeInTheDocument();
    expect(screen.queryByText(/^Applied$/)).not.toBeInTheDocument();
  });

  it("Real ranking shows no eligible rows without fabricating a target weight", () => {
    mocks.useV5Live.mockReturnValue({ data: [], loading: false, refresh: vi.fn() });
    renderPage("/management/promotion-allocation?tab=real-ranking");
    expect(screen.getByText("No canary/live personas are eligible for real allocation yet.")).toBeInTheDocument();
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
