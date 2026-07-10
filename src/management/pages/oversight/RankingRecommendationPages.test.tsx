import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { defaultPersonaLeague } from "@/lib/v5/management/personaLeague";
import { defaultQuarterlyFormula, defaultQuarterlyRanking } from "@/lib/v5/management/quarterlyRanking";
import { PersonaLeaguePage } from "./PersonaLeague";
import { PromotionAllocationPage } from "./PromotionAllocation";
import { QuarterlyRankingPage } from "./QuarterlyRanking";

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
    mocks.useV5Live.mockReset();
    mocks.sendRankingRecommendation.mockReset();
  });

  it("Promotion & Allocation keeps compatibility tabs while ranking pages remain independently routable", () => {
    let liveCall = 0;
    mocks.useV5Live.mockImplementation(() => {
      liveCall += 1;
      return liveCall % 2 === 1
        ? { data: defaultQuarterlyRanking(), loading: false, refresh: vi.fn() }
        : { data: defaultQuarterlyFormula(), loading: false, refresh: vi.fn() };
    });

    renderWithRoutes("/management/promotion-allocation", <PromotionAllocationPage />);

    expect(screen.getByRole("heading", { name: "Promotion & Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Paper → Real" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Real ranking" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Quarterly allocation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Formula policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quarterly Ranking" })).toBeInTheDocument();
  });

  it("Persona League honors persona query focus from Fleet rank links", () => {
    const rows = defaultPersonaLeague();
    const focused = rows[1];
    const other = rows[0];
    mocks.useV5Live.mockReturnValue({ data: [other, focused], loading: false, refresh: vi.fn() });

    renderWithRoutes(`/management/persona-league?persona=${focused.personaId}`, <PersonaLeaguePage />);

    expect(screen.getByText(`Focused persona: ${focused.personaId} · 1 matching league row(s)`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all personas" })).toHaveAttribute("href", "/management/persona-league");
    const table = screen.getByRole("table");
    expect(within(table).getByText(focused.personaName)).toBeInTheDocument();
    expect(within(table).queryByText(other.personaName)).not.toBeInTheDocument();
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
