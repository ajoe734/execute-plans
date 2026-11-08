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

  const REAL = {
    id: "pm12-quarterly-ranking-formula",
    formula_id: "pm12-quarterly-ranking-formula",
    version: "pm12-default-v1",
    formula_version: "pm12-default-v1",
    weights: { pnl: 0.35, risk: 0.25, execution: 0.25, activity: 0.15 },
    score_field: "overall_score",
    components: [
      { key: "pnl", label: "PnL", weight: 0.35 },
      { key: "risk", label: "Risk", weight: 0.25 },
      { key: "execution", label: "Execution", weight: 0.25 },
      { key: "activity", label: "Activity", weight: 0.15 },
    ],
    basis: "latest_available_persona_league_metrics_with_quarter_window",
    policy: "read_only_governance_advisory",
    governance_evidence_refs: ["pm12-quarterly-ranking-formula-v1-governance"],
    version_history: [
      {
        id: "pm12-quarterly-ranking-formula-pm12-default-v1",
        version: "pm12-default-v1",
        formula_version: "pm12-default-v1",
        effective_at: "2026-05-23T00:00:00Z",
        change_type: "baseline",
        governance_evidence_refs: ["pm12-quarterly-ranking-formula-v1-governance"],
        description: "Baseline formula accepted for PM-12 quarterly ranking reads.",
      },
    ],
    change_control: {
      version_policy: "formula_version_changes_require_governance_evidence",
      requires_governance_evidence: true,
      governance_evidence_refs: ["pm12-quarterly-ranking-formula-v1-governance"],
      authority: "read_only_governance_advisory",
    },
  };

  const renderDetail = (row: Record<string, unknown>) => {
    vi.spyOn(bffV1.rankingFormulas, "list").mockResolvedValue([row as unknown as import("@/lib/bff-v1").RankingFormula]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
    return render(
      <MemoryRouter initialEntries={[`/management/ranking/formulas/${row.id}`]}>
        <Routes>
          <Route path="/management/ranking/formulas/:id" element={<RankingFormulaDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it("renders the real BFF payload without dashes, no-data badges or invented fields", async () => {
    const { container } = renderDetail(REAL);
    expect(await screen.findByTestId("ranking-formula-components")).toBeInTheDocument();
    expect(screen.getAllByText("pm12-default-v1").length).toBeGreaterThan(0);
    expect(screen.getByText("overall_score")).toBeInTheDocument();
    expect(screen.getByTestId("ranking-formula-component-pnl")).toHaveTextContent("PnL35%");
    expect(screen.getByTestId("ranking-formula-component-activity")).toHaveTextContent("Activity15%");
    expect(screen.getByTestId("ranking-formula-change-control")).toBeInTheDocument();
    expect(screen.getByTestId("ranking-formula-evidence-refs")).toHaveTextContent("pm12-quarterly-ranking-formula-v1-governance");
    expect(container.textContent).not.toContain("—");
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toMatch(/無資料|No data|Unavailable|不可用/);
    expect(container.textContent).not.toContain("read_only_governance_advisory");
    expect(container.querySelector("a[href*='pm12-quarterly-ranking-formula-v1-governance']")).toBeNull();
  });

  it("lists version_history on the history tab and drops the hardcoded v3 row", async () => {
    renderDetail(REAL);
    const tab = await screen.findByRole("tab", { name: /歷程|歷史|History/i });
    fireEvent.pointerDown(tab);
    fireEvent.mouseDown(tab);
    fireEvent.pointerUp(tab);
    fireEvent.mouseUp(tab);
    fireEvent.click(tab);
    expect(await screen.findByText("Baseline formula accepted for PM-12 quarterly ranking reads.")).toBeInTheDocument();
    expect(screen.queryByText("v3")).not.toBeInTheDocument();
    expect(screen.queryByText(/Current — activated/)).not.toBeInTheDocument();
  });

  it("renders another version with a fifth component, raw unknown codes, and no-data without weights", async () => {
    const five = {
      ...REAL,
      id: "alt",
      version: "alt-v2",
      formula_version: "alt-v2",
      basis: "some_unknown_basis",
      components: [...REAL.components, { key: "liquidity", label: "Liquidity", weight: 0.1 }],
    };
    const first = renderDetail(five);
    expect(await screen.findByTestId("ranking-formula-component-liquidity")).toHaveTextContent("Liquidity10%");
    expect(screen.getByText("some_unknown_basis")).toBeInTheDocument();
    first.unmount();
    vi.restoreAllMocks();

    const bare = renderDetail({ id: "bare", version: "bare-v1" });
    const box = await screen.findByTestId("ranking-formula-components");
    expect(box).toHaveTextContent(/無資料|No data/);
    expect(box.textContent).not.toMatch(/\d%/);
    expect(bare.container.textContent).not.toContain("undefined");
  });
});
