// 2026-07-11 MGMT-PERF-IA-004 - Consolidated Rankings Center - Recommendation page tests
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { mgmt } from "@/lib/bff-v1";
import { defaultPersonaLeague } from "@/lib/v5/management/personaLeague";
import { defaultQuarterlyFormula, defaultQuarterlyRanking } from "@/lib/v5/management/quarterlyRanking";
import { PersonaLeaguePage } from "./PersonaLeague";
import { PromotionAllocationPage } from "./PromotionAllocation";
import { QuarterlyRankingPage } from "./QuarterlyRanking";
import { RankingsCenterPage } from "../centers/RankingsCenterPage";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
  sendRankingRecommendation: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

vi.mock("@/lib/v5/management/rankingGovernance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/v5/management/rankingGovernance")>();
  return {
    ...actual,
    sendRankingRecommendation: mocks.sendRankingRecommendation,
  };
});

void i18n.changeLanguage("en-US");

function renderWithRoutes(initialEntry: string, element: ReactElement, routePath = initialEntry.split("?")[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/management/human-inbox/:id" element={<div>Human Inbox detail route</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("ranking recommendation submit pages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.useV5Live.mockReset();
    mocks.sendRankingRecommendation.mockReset();
  });

  it("Promotion & Allocation is a legacy shell that links to the canonical centers, not a tabbed workbench", () => {
    mocks.useV5Live.mockReturnValue({ data: [], loading: false, refresh: vi.fn() });
    renderWithRoutes("/management/promotion-allocation", <PromotionAllocationPage />);

    expect(screen.getByRole("heading", { name: "Promotion & Allocation" })).toBeInTheDocument();
    // MGMT-PERF-IA-005: every other tab now redirects before this page ever
    // renders (PromotionAllocationLegacyGate) — no internal tab list survives.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Rankings Center/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Governance Decisions/ })).toBeInTheDocument();
  });

  it("Quarterly ranking page is independently routable", () => {
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: defaultQuarterlyRanking(), loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    renderWithRoutes("/management/quarterly-ranking", <QuarterlyRankingPage />);
    expect(screen.getByRole("heading", { name: "Quarterly Ranking" })).toBeInTheDocument();
  });

  it("Paper candidate tab preserves Fleet persona focus and scopes the ranking row", () => {
    const rows = defaultQuarterlyRanking();
    const focused = rows[1];
    const other = rows[0];
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: [other, focused], loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    renderWithRoutes(
      `/management/rankings?tab=quarterly&persona=${focused.personaId}`,
      <RankingsCenterPage />,
      "/management/rankings"
    );

    expect(screen.getByText(`Focused persona: ${focused.personaId} · 1 quarterly ranking row(s)`)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText(focused.personaName)).toBeInTheDocument();
    expect(within(table).queryByText(other.personaName)).not.toBeInTheDocument();
  });

  it("Paper candidate tab preserves Fleet persona focus when live rows use the BFF persona alias", () => {
    const focused = {
      persona: "persona-live-smoke-b",
      name: "Deploy Smoke Persona 2026-05-13 B Persisted",
      rank: 7,
      previous_quarter_rank: 9,
      rank_delta: 2,
      tier_label: "B",
      score: 71.25,
      eligibility: "eligible",
      metrics: { pnl: 12500, sharpe: 1.42 },
      evidence_refs: ["evidence:live-smoke-b"],
      links: {},
    };
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: [focused], loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    renderWithRoutes(
      "/management/rankings?tab=quarterly&persona=persona-live-smoke-b",
      <RankingsCenterPage />,
      "/management/rankings"
    );

    expect(screen.getByText("Focused persona: persona-live-smoke-b · 1 quarterly ranking row(s)")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Deploy Smoke Persona 2026-05-13 B Persisted")).toBeInTheDocument();
    expect(within(table).getByText("#7")).toBeInTheDocument();
  });

  it("Quarterly Ranking focused route fetches a bounded snapshot before client-side focus filtering", async () => {
    const listLiveOnly = vi.spyOn(mgmt.quarterlyRanking, "listLiveOnly").mockResolvedValue([]);
    mocks.useV5Live.mockReturnValue({ data: undefined, loading: true, refresh: vi.fn() });

    renderWithRoutes(
      "/management/quarterly-ranking?persona=persona-live-smoke-b",
      <QuarterlyRankingPage />,
    );
    const rankingLoader = mocks.useV5Live.mock.calls[0]?.[0] as (() => Promise<unknown>) | undefined;
    expect(rankingLoader).toBeDefined();
    await rankingLoader?.();

    expect(listLiveOnly).toHaveBeenCalledWith(undefined, { pageSize: 200 });
    expect(listLiveOnly).not.toHaveBeenCalledWith(undefined, expect.objectContaining({ persona: "persona-live-smoke-b" }));
    expect(screen.queryByText("No data.")).not.toBeInTheDocument();
  });

  it("Persona League honors persona query focus from Fleet rank links", () => {
    const rows = defaultPersonaLeague();
    const focused = rows[1];
    const other = rows[0];
    mocks.useV5Live.mockReturnValue({ data: [other, focused], loading: false, refresh: vi.fn() });

    renderWithRoutes(`/management/persona-league?persona=${focused.personaId}`, <PersonaLeaguePage />);

    expect(screen.getByText(`Focused persona: ${focused.personaId} · 1 matching league row(s)`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all personas" })).toHaveAttribute("href", "/management/rankings?tab=rolling");
    const table = screen.getByRole("table");
    expect(within(table).getByText(focused.personaName)).toBeInTheDocument();
    expect(within(table).queryByText(other.personaName)).not.toBeInTheDocument();
  });

  it("Quarterly Ranking keeps an ineligible focused Persona in the ranking table", () => {
    const focused = {
      ...defaultQuarterlyRanking()[0],
      personaId: "persona-20260528-04688755",
      personaName: "Crypto-Alt-Hunter",
      currentRank: 9,
      score: 53.875,
      eligibility: "insufficient_data" as const,
      disqualificationReason: "No telemetry coverage",
    };
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: [focused], loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    renderWithRoutes(
      `/management/quarterly-ranking?persona=${focused.personaId}`,
      <QuarterlyRankingPage />,
    );

    expect(screen.getByText(`Focused persona: ${focused.personaId} · 1 quarterly ranking row(s)`)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Crypto-Alt-Hunter")).toBeInTheDocument();
    expect(within(table).getByText("#9")).toBeInTheDocument();
    expect(within(table).getByText(/insufficient data/i)).toBeInTheDocument();
  });

  it("Persona League submits through the adapter and navigates to returned Human Inbox detail", async () => {
    const row = {
      ...defaultPersonaLeague()[0],
      recommendationId: "pm12-rec-league-alpha",
      evidenceRefs: ["evidence:league-alpha"],
    };
    mocks.useV5Live.mockReturnValue({ data: [row], loading: false, refresh: vi.fn() });
    mocks.sendRankingRecommendation.mockResolvedValue({
      ok: true,
      persisted: true,
      recommendationId: "pm12-rec-league-alpha",
      actionId: "promote_to_canary_candidate",
      quarter: "2026-Q3",
      personaId: row.personaId,
      status: "accepted",
      idempotencyKey: "idk-league-page",
      humanInboxId: "promotion_review:review-league-alpha",
      detailHref: "/management/human-inbox/promotion_review%3Areview-league-alpha",
      liveCapitalMutation: false,
      governanceDestinations: ["human_inbox", "human_gate_decision"],
    });

    renderWithRoutes("/management/promotion-allocation", <PersonaLeaguePage />);

    fireEvent.click(screen.getByRole("button", { name: /Promote to canary candidate/ }));

    await waitFor(() => {
      expect(mocks.sendRankingRecommendation).toHaveBeenCalledWith(
        expect.objectContaining({
          recommendationId: "pm12-rec-league-alpha",
          source: "persona_league",
          personaId: row.personaId,
          recommendation: "promote_to_canary_candidate",
          evidenceRefs: ["evidence:league-alpha"],
        }),
      );
    });
    expect(await screen.findByText("Human Inbox detail route")).toBeInTheDocument();
  });

  it("Quarterly Ranking shows local-only state when BFF writes are disabled", async () => {
    const row = {
      ...defaultQuarterlyRanking()[0],
      recommendationId: "pm12-rec-quarterly-alpha",
      quarter: "2026-Q3",
    };
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: [row], loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });
    mocks.sendRankingRecommendation.mockResolvedValue({
      ok: true,
      persisted: false,
      recommendationId: "pm12-rec-quarterly-alpha",
      actionId: "promote_to_canary_candidate",
      quarter: "2026-Q3",
      personaId: row.personaId,
      status: "write_disabled",
      idempotencyKey: "idk-quarterly-page",
      liveCapitalMutation: false,
      governanceDestinations: ["human_inbox", "governance_queue", "human_gate_decision"],
    });

    renderWithRoutes("/management/promotion-allocation", <QuarterlyRankingPage />);

    fireEvent.click(screen.getByRole("button", { name: /Promote to canary candidate/ }));

    await waitFor(() => {
      expect(mocks.sendRankingRecommendation).toHaveBeenCalledWith(
        expect.objectContaining({
          recommendationId: "pm12-rec-quarterly-alpha",
          source: "quarterly_ranking",
          personaId: row.personaId,
          quarter: "2026-Q3",
        }),
      );
    });
    expect(screen.getByText("Every recommendation requires Human Review; live capital is never changed directly.")).toBeInTheDocument();
    expect(screen.getByText("Real writes are disabled, so no BFF Human Inbox review was created.")).toBeInTheDocument();
  });
});
