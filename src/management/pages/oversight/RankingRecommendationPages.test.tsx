// 2026-07-11 MGMT-PERF-IA-004 - Consolidated Rankings Center - Recommendation page tests
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
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
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

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

async function expectAccessibleRankingStatusAndPagination(container: HTMLElement) {
  const previous = within(container).getByRole("button", { name: "Go to previous page" });
  const next = within(container).getByRole("button", { name: "Go to next page" });

  expect(previous).toHaveAttribute("title", "Go to previous page");
  expect(next).toHaveAttribute("title", "Go to next page");
  expect(container.querySelector('[class~="text-emerald-500"]')).not.toBeInTheDocument();
  expect(container.querySelector('[class~="text-emerald-600"]')).not.toBeInTheDocument();
  expect(container.querySelector('[class~="text-emerald-700"]')).toBeInTheDocument();
  expect(container.querySelector('[class~="dark:text-emerald-300"]')).toBeInTheDocument();

  const results = await axe.run(previous.parentElement as HTMLElement, {
    runOnly: { type: "rule", values: ["button-name"] },
  });
  expect(results.violations).toHaveLength(0);
}

describe("ranking recommendation proposal pages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.useV5Live.mockReset();
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

  it("Quarterly Ranking exposes named pagination controls and contrast-safe success tones", async () => {
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: defaultQuarterlyRanking(), loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    const { container } = renderWithRoutes("/management/quarterly-ranking", <QuarterlyRankingPage />);

    await expectAccessibleRankingStatusAndPagination(container);
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

  it("Persona League exposes named pagination controls and contrast-safe success tones", async () => {
    mocks.useV5Live.mockReturnValue({
      data: defaultPersonaLeague(),
      loading: false,
      refresh: vi.fn(),
    });

    const { container } = renderWithRoutes("/management/persona-league", <PersonaLeaguePage />);

    await expectAccessibleRankingStatusAndPagination(container);
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

  const withOwner = (decision_status: string, owner_decision: object) => ({
    human_review_state: { status: "pending_human_gate", decision_status, owner_decision },
  });

  it("Persona League links the saved pending proposal and has no submit control", async () => {
    const row = { ...defaultPersonaLeague()[0], ...withOwner("pending", { decision_id: "dec-1", available: true }) };
    mocks.useV5Live.mockReturnValue({ data: [row], loading: false, refresh: vi.fn() });

    renderWithRoutes("/management/promotion-allocation", <PersonaLeaguePage />);

    expect(screen.queryByRole("button", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Promote to canary candidate · pending/ }));
    expect(await screen.findByText("Human Inbox detail route")).toBeInTheDocument();
  });

  it.each([
    ["decided", { decision_id: "dec-2", available: true }, /· decided/],
    ["rejected", { decision_id: "dec-3", available: true }, /· rejected/],
    ["unavailable", { decision_id: "dec-4", available: false }, /· unavailable/],
  ])("Quarterly Ranking shows %s proposal read-only without a link or action", (status, owner, label) => {
    const row = { ...defaultQuarterlyRanking()[0], quarter: "2026-Q3", ...withOwner(status, owner) };
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: [row], loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    renderWithRoutes("/management/promotion-allocation", <QuarterlyRankingPage />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
  });

  it("Quarterly Ranking row without a saved proposal is advisory with no mutation action", () => {
    const row = { ...defaultQuarterlyRanking()[0], quarter: "2026-Q3" };
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: [row], loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    renderWithRoutes("/management/promotion-allocation", <QuarterlyRankingPage />);

    expect(screen.queryByRole("button", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
  });
});
