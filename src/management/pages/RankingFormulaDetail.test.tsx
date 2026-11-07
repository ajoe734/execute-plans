import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { bffV1 } from "@/lib/bff-v1";
import { RankingFormulaDetail } from "./RankingFormulaDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RankingFormulaDetail retired activate flow gate", () => {
  it("renders read surface link and does not render retired activate flow", async () => {
    vi.spyOn(bffV1.rankingFormulas, "list").mockResolvedValue([
      {
        id: "rf_trend_v1",
        name: "Trend Momentum Formula",
        state: "active",
        owner: "risk_team",
        expression: "0.6 * sharpe - 0.4 * abs(drawdown)",
        appliedTo: 5,
        updatedAt: "2026-08-01T00:00:00Z",
      } as unknown as import("@/lib/bff-v1").RankingFormula,
    ]);
    const listNonDraftSpy = vi.spyOn(bffV1.strategies, "listNonDraft");
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/management/ranking/formulas/rf_trend_v1"]}>
        <Routes>
          <Route
            path="/management/ranking/formulas/:id"
            element={<RankingFormulaDetail />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Trend Momentum Formula")).toBeInTheDocument();
    });

    expect(listNonDraftSpy).not.toHaveBeenCalled();

    // Proves the retired Activate button is not present
    expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Activate Ranking Formula")).not.toBeInTheDocument();

    // Proves the replacement read link to governance decisions policy tab is present
    const link = document.querySelector('a[href="/management/governance-decisions?tab=policy"]');
    expect(link).toBeInTheDocument();
  });

  it("never renders undefined when appliedTo is omitted and points the score tab to Rankings Center when no owner ranking rows are present", async () => {
    vi.spyOn(bffV1.rankingFormulas, "list").mockResolvedValue([
      {
        id: "rf_no_applied",
        name: "Formula Without AppliedTo",
        state: "approved",
        owner: "risk_team",
        expression: "0.7 * sharpe - 0.3 * drawdown",
        appliedTo: undefined,
        updatedAt: "2026-08-01T00:00:00Z",
      } as unknown as import("@/lib/bff-v1").RankingFormula,
    ]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);

    const { container } = render(
      <MemoryRouter initialEntries={["/management/ranking/formulas/rf_no_applied"]}>
        <Routes>
          <Route path="/management/ranking/formulas/:id" element={<RankingFormulaDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Formula Without AppliedTo")).toBeInTheDocument();
    });

    expect(container.textContent).not.toContain("undefined");
    const scoreTab = await screen.findByRole("tab", { name: /分數|Score/i });
    fireEvent.pointerDown(scoreTab);
    fireEvent.mouseDown(scoreTab);
    fireEvent.pointerUp(scoreTab);
    fireEvent.mouseUp(scoreTab);
    fireEvent.click(scoreTab);

    const rankingsLink = await screen.findByTestId("ranking-formula-open-rankings-center");
    expect(rankingsLink).toHaveAttribute("href", expect.stringContaining("/management/rankings"));
  });

  it("renders owner-supplied ranking rows on the score tab when provided by the formula DTO", async () => {
    vi.spyOn(bffV1.rankingFormulas, "list").mockResolvedValue([
      {
        id: "rf_with_rows",
        name: "Formula With Owner Rows",
        state: "approved",
        owner: "risk_team",
        expression: "0.6 * sharpe - 0.4 * drawdown",
        appliedTo: 2,
        updatedAt: "2026-08-01T00:00:00Z",
        rankings: [
          {
            id: "strategy-persona-298e138c136c9840b0e4",
            name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
            rank: 1,
            score: 1.425,
          },
        ],
      } as unknown as import("@/lib/bff-v1").RankingFormula,
    ]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/management/ranking/formulas/rf_with_rows"]}>
        <Routes>
          <Route path="/management/ranking/formulas/:id" element={<RankingFormulaDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const scoreTab = await screen.findByRole("tab", { name: /分數|Score/i });
    fireEvent.pointerDown(scoreTab);
    fireEvent.mouseDown(scoreTab);
    fireEvent.pointerUp(scoreTab);
    fireEvent.mouseUp(scoreTab);
    fireEvent.click(scoreTab);

    expect(await screen.findByTestId("ranking-formula-owner-rows")).toBeInTheDocument();
    expect(
      screen.getByText("青禾｜2330 台股 Paper 學習 R2 Paper Strategy"),
    ).toBeInTheDocument();
    expect(screen.getByText("1.425")).toBeInTheDocument();
  });
});
