import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { PromotionAllocationPage } from "./PromotionAllocation";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import type { PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
import type { QuarterlyRankingRow } from "@/lib/v5/management/quarterlyRanking";
import type { RebalanceProposal } from "@/lib/v5/management/rebalanceProposals";
import { defaultPersonaLeague } from "@/lib/v5/management/personaLeague";
import { defaultQuarterlyFormula, defaultQuarterlyRanking } from "@/lib/v5/management/quarterlyRanking";

const mocks = vi.hoisted(() => ({
  personaFleetGet: vi.fn(),
  personaLeagueListLiveOnly: vi.fn(),
  quarterlyRankingListLiveOnly: vi.fn(),
  quarterlyRankingFormulaLiveOnly: vi.fn(),
  rebalanceProposalsListLiveOnly: vi.fn(),
  rebalanceProposalsCreate: vi.fn(),
  allocationPolicyEvaluateLiveOnly: vi.fn(),
  sendRankingRecommendation: vi.fn(),
  capitalPoolsWithFleetFallback: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    mgmt: {
      ...actual.mgmt,
      personaFleet: { ...actual.mgmt.personaFleet, get: mocks.personaFleetGet },
      personaLeague: { ...actual.mgmt.personaLeague, listLiveOnly: mocks.personaLeagueListLiveOnly },
      quarterlyRanking: {
        ...actual.mgmt.quarterlyRanking,
        listLiveOnly: mocks.quarterlyRankingListLiveOnly,
        formulaLiveOnly: mocks.quarterlyRankingFormulaLiveOnly,
      },
      rebalanceProposals: {
        ...actual.mgmt.rebalanceProposals,
        listLiveOnly: mocks.rebalanceProposalsListLiveOnly,
        create: mocks.rebalanceProposalsCreate,
      },
      allocationPolicy: { ...actual.mgmt.allocationPolicy, evaluateLiveOnly: mocks.allocationPolicyEvaluateLiveOnly },
    },
  };
});

vi.mock("@/lib/v5/management/rankingGovernance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/v5/management/rankingGovernance")>();
  return { ...actual, sendRankingRecommendation: mocks.sendRankingRecommendation };
});

vi.mock("@/management/pages/capitalPoolsFleetFallback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/management/pages/capitalPoolsFleetFallback")>();
  return { ...actual, capitalPoolsWithFleetFallback: mocks.capitalPoolsWithFleetFallback };
});

void i18n.changeLanguage("en-US");

function renderTab(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/promotion-allocation" element={<PromotionAllocationPage />} />
          <Route path="/management/human-inbox/:id" element={<div>Human Inbox detail route</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const fleetRow = (o: Partial<ManagementPersonaFleetRow> = {}): ManagementPersonaFleetRow => ({
  personaId: "persona-canary-1",
  personaName: "Canary One",
  owner: "pathreon-management",
  ooda: "Observe",
  autonomy: "supervised",
  perfDelta: 0,
  humanNeeded: false,
  lastMutation: "2026-07-01",
  stage: "canary",
  capitalScope: "canary_sleeve",
  capitalSleeveId: "sleeve-canary-1",
  currentWeight: 0.03,
  bindingState: "active",
  ...o,
});

describe("Promotion & Allocation workbench", () => {
  beforeEach(() => {
    mocks.personaFleetGet.mockReset().mockResolvedValue([]);
    mocks.personaLeagueListLiveOnly.mockReset().mockResolvedValue([]);
    mocks.quarterlyRankingListLiveOnly.mockReset().mockResolvedValue(defaultQuarterlyRanking());
    mocks.quarterlyRankingFormulaLiveOnly.mockReset().mockResolvedValue(defaultQuarterlyFormula());
    mocks.rebalanceProposalsListLiveOnly.mockReset().mockResolvedValue([]);
    mocks.rebalanceProposalsCreate.mockReset();
    mocks.allocationPolicyEvaluateLiveOnly.mockReset().mockResolvedValue([]);
    mocks.sendRankingRecommendation.mockReset();
    mocks.capitalPoolsWithFleetFallback.mockReset().mockResolvedValue({
      items: [{ id: "pool-canary", name: "Canary Pool" }],
      cursor: {},
      pageSize: 1,
      totalCountExact: true,
    });
  });

  it("exposes all five workbench tabs including Emergency actions", async () => {
    renderTab("/management/promotion-allocation");

    expect(screen.getByRole("heading", { name: "Promotion & Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Paper → Real" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Real ranking" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Quarterly allocation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Emergency actions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Formula policy" })).toBeInTheDocument();
  });

  it("Real ranking shows stage, current/target weight, delta, cap reason, and approval state from an open proposal", async () => {
    const leagueRow: PersonaLeagueRow = {
      ...defaultPersonaLeague()[0],
      personaId: "persona-canary-1",
      personaName: "Canary One",
    };
    mocks.personaFleetGet.mockResolvedValue([fleetRow()]);
    mocks.personaLeagueListLiveOnly.mockResolvedValue([leagueRow]);
    const proposal: RebalanceProposal = {
      id: "rb-20260707-001",
      capitalPoolId: "pool-canary",
      status: "pending",
      proposalType: "quarterly_rebalance",
      lines: [{
        personaId: "persona-canary-1",
        stage: "canary",
        capitalScope: "canary_sleeve",
        currentWeight: 0.03,
        targetWeight: 0.05,
        delta: 0.02,
        capReasons: ["canary_cap"],
        evidenceRefs: [],
      }],
      auditRefs: [],
      applied: false,
      createdAt: "2026-07-07T00:00:00Z",
    };
    mocks.rebalanceProposalsListLiveOnly.mockResolvedValue([proposal]);

    renderTab("/management/promotion-allocation?tab=real-ranking");

    const heading = await screen.findByText("Real allocation weights");
    const panel = heading.closest(".space-y-3");
    if (!panel) throw new Error("Real allocation panel container not found");
    const table = within(panel as HTMLElement).getByRole("table");
    expect(within(table).getByText("Canary One")).toBeInTheDocument();
    expect(within(table).getByText("3.00%")).toBeInTheDocument();
    expect(within(table).getByText("5.00%")).toBeInTheDocument();
    expect(within(table).getByText("canary_cap")).toBeInTheDocument();
    expect(within(table).getByText("Pending approval")).toBeInTheDocument();
  });

  it("Quarterly capital lists existing rebalance proposals with simulation/constraint status and a proposal link", async () => {
    const proposal: RebalanceProposal = {
      id: "rb-20260707-002",
      capitalPoolId: "pool-canary",
      status: "pending",
      proposalType: "quarterly_rebalance",
      lines: [],
      simulation: { generated_at: "2026-07-07T00:00:00Z" },
      constraints: {},
      auditRefs: [],
      applied: false,
      createdAt: "2026-07-07T00:00:00Z",
    };
    mocks.rebalanceProposalsListLiveOnly.mockResolvedValue([proposal]);

    renderTab("/management/promotion-allocation?tab=quarterly-capital");

    expect(await screen.findByText("rb-20260707-002")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "rb-20260707-002" })).toHaveAttribute(
      "href",
      "/management/promotion-allocation?tab=quarterly-capital&rebalance_id=rb-20260707-002",
    );
    expect(screen.getByText("Recorded")).toBeInTheDocument();
    expect(screen.getByText("Not evaluated")).toBeInTheDocument();
  });

  it("Emergency actions only offers containment recommendations and submits through the governed seam", async () => {
    const containmentRow: PersonaLeagueRow = {
      ...defaultPersonaLeague()[0],
      personaId: "persona-breach-1",
      personaName: "Breach One",
      recommendedAction: "freeze_persona",
    };
    mocks.personaLeagueListLiveOnly.mockResolvedValue([containmentRow]);
    mocks.quarterlyRankingListLiveOnly.mockResolvedValue([]);
    mocks.sendRankingRecommendation.mockResolvedValue({
      ok: true,
      persisted: true,
      recommendationId: "pm12-rec-emergency-breach-1",
      actionId: "freeze_persona",
      quarter: "2026-Q3",
      personaId: "persona-breach-1",
      status: "accepted",
      idempotencyKey: "idk-emergency",
      liveCapitalMutation: false,
      governanceDestinations: ["human_inbox"],
    });

    renderTab("/management/promotion-allocation?tab=emergency-actions");

    expect(await screen.findByText("Breach One")).toBeInTheDocument();
    expect(screen.getByText("Freeze persona")).toBeInTheDocument();
    expect(screen.queryByText("Promote to canary candidate")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit containment request" }));

    await waitFor(() => {
      expect(mocks.sendRankingRecommendation).toHaveBeenCalledWith(
        expect.objectContaining({
          personaId: "persona-breach-1",
          recommendation: "freeze_persona",
          source: "persona_league",
        }),
      );
    });
  });

  it("Real ranking preview runs the allocation policy and labels the result as not saved", async () => {
    const leagueRow: PersonaLeagueRow = {
      ...defaultPersonaLeague()[0],
      personaId: "persona-canary-1",
      personaName: "Canary One",
    };
    mocks.personaFleetGet.mockResolvedValue([fleetRow()]);
    mocks.personaLeagueListLiveOnly.mockResolvedValue([leagueRow]);
    mocks.allocationPolicyEvaluateLiveOnly.mockResolvedValue([{
      personaId: "persona-canary-1",
      stage: "canary",
      capitalScope: "canary_sleeve",
      currentWeight: 0.03,
      targetWeight: 0.045,
      delta: 0.015,
      capReasons: [],
      exclusions: [],
      evidenceRefs: [],
      requiresHumanApproval: true,
    }]);

    renderTab("/management/promotion-allocation?tab=real-ranking");
    await screen.findByText("Real allocation weights");

    fireEvent.click(screen.getByRole("button", { name: "Run allocation preview" }));

    await waitFor(() => {
      expect(mocks.allocationPolicyEvaluateLiveOnly).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ persona_id: "persona-canary-1", stage: "canary" })]),
      );
    });
    expect(await screen.findByText("Preview — not saved")).toBeInTheDocument();
  });

  it("Rebalance proposal creation stays honest when live writes are disabled", async () => {
    mocks.personaFleetGet.mockResolvedValue([fleetRow()]);
    mocks.personaLeagueListLiveOnly.mockResolvedValue([{
      ...defaultPersonaLeague()[0],
      personaId: "persona-canary-1",
      personaName: "Canary One",
    }]);
    mocks.allocationPolicyEvaluateLiveOnly.mockResolvedValue([{
      personaId: "persona-canary-1",
      stage: "canary",
      capitalScope: "canary_sleeve",
      currentWeight: 0.03,
      targetWeight: 0.045,
      delta: 0.015,
      capReasons: [],
      exclusions: [],
      evidenceRefs: [],
      requiresHumanApproval: true,
    }]);
    mocks.rebalanceProposalsCreate.mockResolvedValue({
      ok: true,
      persisted: false,
      status: "write_disabled",
      idempotencyKey: "idk-rebalance-1",
    });

    renderTab("/management/promotion-allocation?tab=quarterly-capital");

    fireEvent.click(await screen.findByRole("button", { name: "Start allocation review" }));
    await screen.findByText("Preview — not saved");
    fireEvent.click(screen.getByRole("button", { name: "Create rebalance proposal" }));

    await waitFor(() => {
      expect(mocks.rebalanceProposalsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ capitalPoolId: "pool-canary" }),
      );
    });
    expect(await screen.findByText("Real writes are disabled, so no BFF Human Inbox review was created.")).toBeInTheDocument();
    expect(screen.queryByText("Every recommendation requires Human Review; live capital is never changed directly.")).not.toBeInTheDocument();
  });

  it("Rebalance proposal creation links to the new proposal once persisted", async () => {
    mocks.personaFleetGet.mockResolvedValue([fleetRow()]);
    mocks.personaLeagueListLiveOnly.mockResolvedValue([{
      ...defaultPersonaLeague()[0],
      personaId: "persona-canary-1",
      personaName: "Canary One",
    }]);
    mocks.allocationPolicyEvaluateLiveOnly.mockResolvedValue([{
      personaId: "persona-canary-1",
      stage: "canary",
      capitalScope: "canary_sleeve",
      currentWeight: 0.03,
      targetWeight: 0.045,
      delta: 0.015,
      capReasons: [],
      exclusions: [],
      evidenceRefs: [],
      requiresHumanApproval: true,
    }]);
    mocks.rebalanceProposalsCreate.mockResolvedValue({
      ok: true,
      persisted: true,
      status: "submitted",
      idempotencyKey: "idk-rebalance-2",
      rebalanceId: "rb-20260707-003",
      detailHref: "/management/promotion-allocation?tab=quarterly-capital&rebalance_id=rb-20260707-003",
    });

    renderTab("/management/promotion-allocation?tab=quarterly-capital");

    fireEvent.click(await screen.findByRole("button", { name: "Start allocation review" }));
    await screen.findByText("Preview — not saved");
    fireEvent.click(screen.getByRole("button", { name: "Create rebalance proposal" }));

    const link = await screen.findByRole("link", { name: "View proposal" });
    expect(link).toHaveAttribute(
      "href",
      "/management/promotion-allocation?tab=quarterly-capital&rebalance_id=rb-20260707-003",
    );
  });
});
