import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { bffV1 } from "@/lib/bff-v1";
import { RankingFormulaDetail } from "./RankingFormulaDetail";

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
    vi.spyOn(bffV1.strategies, "list").mockResolvedValue([]);
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

    // Proves the retired Activate button is not present
    expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Activate Ranking Formula")).not.toBeInTheDocument();

    // Proves the replacement read link to governance decisions policy tab is present
    const link = document.querySelector('a[href="/management/governance-decisions?tab=policy"]');
    expect(link).toBeInTheDocument();
  });
});
