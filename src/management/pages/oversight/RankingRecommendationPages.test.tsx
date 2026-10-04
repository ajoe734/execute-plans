// 2026-07-11 MGMT-PERF-IA-004 - Consolidated Rankings Center - Recommendation page tests
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { mgmt } from "@/lib/bff-v1";
import { adaptQuarterlyRankingRows } from "@/lib/bff-v1/management";
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

const live = (data: unknown) => ({ data, loading: false, refresh: vi.fn() });

/** Dispatch the mocked live hook by cache key: rows, owner recommendations (saved proposals) or formula. */
function mockLive({ rows, formula, proposals = [] }: { rows: unknown; formula?: unknown; proposals?: unknown }) {
  mocks.useV5Live.mockImplementation((_loader, _deps, opts?: { cacheKey?: string }) =>
    live(opts?.cacheKey?.includes("recommendations") ? proposals : opts?.cacheKey?.includes("formula") ? formula : rows));
}

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
    mockLive({ rows: defaultQuarterlyRanking(), formula: defaultQuarterlyFormula() });

    renderWithRoutes("/management/quarterly-ranking", <QuarterlyRankingPage />);
    expect(screen.getByRole("heading", { name: "Quarterly Ranking" })).toBeInTheDocument();
  });

  it("Quarterly Ranking exposes named pagination controls and contrast-safe success tones", async () => {
    mockLive({ rows: defaultQuarterlyRanking(), formula: defaultQuarterlyFormula() });

    const { container } = renderWithRoutes("/management/quarterly-ranking", <QuarterlyRankingPage />);

    await expectAccessibleRankingStatusAndPagination(container);
  });

  it("Paper candidate tab preserves Fleet persona focus and scopes the ranking row", () => {
    const rows = defaultQuarterlyRanking();
    const focused = rows[1];
    const other = rows[0];
    mockLive({ rows: [other, focused], formula: defaultQuarterlyFormula() });

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
    mockLive({ rows: [focused], formula: defaultQuarterlyFormula() });

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
    mockLive({ rows: [focused], formula: defaultQuarterlyFormula() });

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

  const OWNER = { available: true, to_state: "frozen", version: 1, vote_count: 0 };
  /** Owner recommendation wire envelope (Pantheon pm12 shape) read through the real adapter. */
  const savedProposals = (state: object, personaId: string, action = "promote_to_canary_candidate") =>
    adaptQuarterlyRankingRows({
      data: { items: [{
        recommendation_id: `pm12-2026-q3-${personaId}-${action}`, persona_id: personaId, action_id: action,
        quarter: "2026-Q3", human_review_state: { submitted: true, ...state },
      }] },
    });
  const pending = (id = "dec-1") => ({ status: "pending_human_gate", decision_status: "pending", owner_decision: { ...OWNER, decision_id: id } });
  const decided = (decision: string, id: string) => ({
    status: "decision_accepted", decision_status: "decided", decision,
    owner_decision: { ...OWNER, decision_id: id, decision_state: "decided" },
  });
  const unavailable = (id: string) => ({ status: "owner_unavailable", decision_status: "unavailable", owner_decision: { decision_id: id, available: false } });

  it("adapter keeps the owner proposal identity and review state of each saved recommendation", () => {
    const [row] = savedProposals(pending("dec-9"), "persona-x") ?? [];
    expect(row as object).toMatchObject({ personaId: "persona-x", action_id: "promote_to_canary_candidate" });
    expect((row as { human_review_state?: object }).human_review_state).toMatchObject({ decision_status: "pending", owner_decision: { decision_id: "dec-9" } });
  });

  it("Persona League links the saved pending proposal from the owner read and has no submit control", async () => {
    const row = { ...defaultPersonaLeague()[0], recommendedAction: "promote_to_canary_candidate" as const };
    mockLive({ rows: [row], proposals: savedProposals(pending(), row.personaId) });

    renderWithRoutes("/management/promotion-allocation", <PersonaLeaguePage />);

    expect(screen.queryByRole("button", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Promote to canary candidate · pending/ });
    expect(link).toHaveAttribute("href", "/management/human-inbox/approval%3Adec-1");
    fireEvent.click(link);
    expect(await screen.findByText("Human Inbox detail route")).toBeInTheDocument();
  });

  it.each([
    ["a different action", (id: string) => savedProposals(pending(), id, "freeze_persona")],
    ["a failed owner read", () => undefined],
  ])("Persona League does not invent a proposal for %s", (_name, proposals) => {
    const row = { ...defaultPersonaLeague()[0], recommendedAction: "promote_to_canary_candidate" as const };
    mockLive({ rows: [row], proposals: proposals(row.personaId) });

    renderWithRoutes("/management/promotion-allocation", <PersonaLeaguePage />);
    expect(screen.queryByText(/Promote to canary candidate · /)).not.toBeInTheDocument();
    expect(screen.getByText("Promote to canary candidate")).toBeInTheDocument();
  });

  it.each([
    ["approved", decided("approved", "dec-2"), /· approved$/],
    ["approved_with_conditions", decided("approved_with_conditions", "dec-3"), /· approved with conditions$/],
    ["rejected", decided("rejected", "dec-4"), /· rejected$/],
    ["unavailable", unavailable("dec-5"), /· unavailable$/],
  ])("Quarterly Ranking shows %s owner outcome read-only without a link or action", (_name, state, label) => {
    const base = defaultQuarterlyRanking()[0];
    const row = { ...base, quarter: "2026-Q3", recommendation: "promote_to_canary_candidate" as const };
    mockLive({ rows: [row], formula: defaultQuarterlyFormula(), proposals: savedProposals(state, base.personaId) });

    renderWithRoutes("/management/promotion-allocation", <QuarterlyRankingPage />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
  });

  it("Quarterly Ranking row without a saved proposal is advisory with no mutation action", () => {
    const row = { ...defaultQuarterlyRanking()[0], quarter: "2026-Q3" };
    mockLive({ rows: [row], formula: defaultQuarterlyFormula() });

    renderWithRoutes("/management/promotion-allocation", <QuarterlyRankingPage />);

    expect(screen.queryByRole("button", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Promote to canary candidate/ })).not.toBeInTheDocument();
  });
});
