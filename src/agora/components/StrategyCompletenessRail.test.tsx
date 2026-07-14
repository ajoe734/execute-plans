import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StrategyCompletenessRail } from "./StrategyCompletenessRail";
import type { StrategyCompleteness } from "@/lib/bff-v1/agora/workshops";
import type { WorkshopCard, WorkshopCompletenessSnapshot } from "@/lib/bff-v1/agora/workshops";

afterEach(cleanup);

const mockCompleteness: StrategyCompleteness = {
  spec_version: "1.0",
  completeness_id: "comp-001",
  strategy_ref: "strat-001",
  assessed_by_persona_id: "persona-a",
  overall_grade: "partial",
  dimensions: [
    { dimension: "hypothesis", grade: "complete", gaps: [], required_actions: [] },
    { dimension: "data_dependencies", grade: "partial", gaps: ["missing PIT"], required_actions: [] },
    { dimension: "market_scope", grade: "missing", gaps: [], required_actions: [] },
  ],
  blockers: [],
  research_ready: false,
  assessed_at: "2026-06-22T00:00:00Z",
} as unknown as StrategyCompleteness;

const mockReadiness = {
  spec_version: "1.0",
  assessment_id: "ready_001",
  workshop_id: "ws-001",
  strategy_id: "strat-001",
  workshop_version_id: "v-001",
  strategy_spec_registry_id: "reg-001",
  assessment_version: 1,
  gates: [
    {
      gate: "preliminary_research",
      state: "conditional",
      requirements: [],
      blocking_requirement_ids: [],
    },
    {
      gate: "full_validation",
      state: "not_assessed",
      requirements: [],
      blocking_requirement_ids: [],
    },
    {
      gate: "trading_room",
      state: "not_assessed",
      requirements: [],
      blocking_requirement_ids: [],
    },
  ],
  highest_ready_gate: null,
  assessed_at: "2026-06-22T00:00:00Z",
};

const mockNextQuestionCard: WorkshopCard = {
  spec_version: "1.0",
  card_id: "card-nq-001",
  card_type: "next_question",
  workshop_id: "ws-001",
  sequence_no: 3,
  status: "action_required",
  title: "Next Question",
  payload: {
    question_id: "q-001",
    question: "What is the entry signal definition?",
    why_now: "Missing definition blocks research dispatch.",
    score_total: 0.87,
  },
  created_at: "2026-06-22T00:00:00Z",
};

describe("StrategyCompletenessRail", () => {
  it("renders the rail container", () => {
    render(
      <StrategyCompletenessRail
        completeness={null}
        readiness={null}
        nextQuestion={null}
      />
    );
    expect(screen.getByTestId("strategy-completeness-rail")).toBeDefined();
  });

  it("shows empty states when no data is provided", () => {
    render(
      <StrategyCompletenessRail
        completeness={null}
        readiness={null}
        nextQuestion={null}
      />
    );
    expect(screen.getByTestId("completeness-empty")).toBeDefined();
    expect(screen.getByTestId("readiness-gates-empty")).toBeDefined();
  });

  it("renders overall grade from completeness data", () => {
    render(
      <StrategyCompletenessRail
        completeness={mockCompleteness}
        readiness={null}
        nextQuestion={null}
      />
    );
    const grade = screen.getByTestId("completeness-overall-grade");
    expect(grade.textContent).toBe("Partial");
    expect(screen.getByText("Overall completeness")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
  });

  it("renders the exact hosted raw snapshot as 100% from its shared completeness card", () => {
    const liveSnapshot: WorkshopCompletenessSnapshot = {
      snapshot_id: "8f7dc9e4-108f-4067-8d05-9cad30c7e17a",
      workshop_id: "b888fb96-12b4-46e1-8def-ffe4f29b5ad7",
      strategy_version_id: "full003-postdeploy-1783268578-f4b6f0-v1",
      state_map_json: {
        data_pit: "confirmed",
        liquidity: "confirmed",
        entry_signal: "confirmed",
        universe_rule: "confirmed",
        position_sizing: "confirmed",
        risk_constraints: "confirmed",
        exit_invalidation: "confirmed",
      },
      blocking_items_json: [],
      next_question_json: {},
      created_at: "2026-07-05 16:22:58+00",
    };
    const completenessCard: WorkshopCard = {
      card_id: "card_completeness_8f7dc9e4-108f-4067-8d05-9cad30c7e17a",
      card_type: "completeness_update",
      workshop_id: liveSnapshot.workshop_id,
      sequence_no: 2,
      status: "completed",
      title: "Strategy completeness updated",
      payload: {
        overall_grade: "complete",
        dimension_updates: Object.entries(liveSnapshot.state_map_json).map(([dimension, current_grade]) => ({
          dimension,
          current_grade,
        })),
        blockers: [],
        research_ready: true,
      },
      created_at: liveSnapshot.created_at,
    };
    render(
      <StrategyCompletenessRail
        completeness={liveSnapshot}
        completenessCard={completenessCard}
        readiness={null}
        nextQuestion={null}
      />
    );

    expect(screen.getByTestId("completeness-overall-grade").textContent).toBe("Complete");
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.queryByText("NaN%")).toBeNull();
    expect(screen.getByText("Research ready").nextElementSibling?.textContent).toBe("Yes");
  });

  it("renders all three dimensions with their grades", () => {
    render(
      <StrategyCompletenessRail
        completeness={mockCompleteness}
        readiness={null}
        nextQuestion={null}
      />
    );
    expect(screen.getByTestId("completeness-dimension-hypothesis")).toBeDefined();
    expect(screen.getByTestId("completeness-dimension-data_dependencies")).toBeDefined();
    expect(screen.getByTestId("completeness-dimension-market_scope")).toBeDefined();

    expect(screen.getByTestId("completeness-dimension-hypothesis-grade").textContent).toBe("Complete");
    expect(screen.getByTestId("completeness-dimension-data_dependencies-grade").textContent).toBe("Partial");
    expect(screen.getByTestId("completeness-dimension-market_scope-grade").textContent).toBe("Missing");
  });

  it("renders three readiness gates from readiness data", () => {
    render(
      <StrategyCompletenessRail
        completeness={null}
        readiness={mockReadiness}
        nextQuestion={null}
      />
    );
    expect(screen.getByTestId("readiness-gate-preliminary_research")).toBeDefined();
    expect(screen.getByTestId("readiness-gate-full_validation")).toBeDefined();
    expect(screen.getByTestId("readiness-gate-trading_room")).toBeDefined();

    expect(screen.getByTestId("readiness-gate-preliminary_research-state").textContent).toBe("Conditional");
    expect(screen.getByTestId("readiness-gate-full_validation-state").textContent).toBe("Not assessed");
  });

  it("renders ready gates as active instead of disabled", () => {
    render(
      <StrategyCompletenessRail
        completeness={mockCompleteness}
        readiness={{
          ...mockReadiness,
          gates: mockReadiness.gates.map((gate) => ({ ...gate, state: "ready" })),
        }}
        nextQuestion={null}
      />
    );

    const gate = screen.getByTestId("readiness-gate-preliminary_research");
    expect(gate.getAttribute("data-readiness-state")).toBe("ready");
    expect(gate.className).toContain("border-green-400");
    expect(screen.getByText("Preliminary research").className).toContain("text-green-900");
  });

  it("renders next question when provided", () => {
    render(
      <StrategyCompletenessRail
        completeness={null}
        readiness={null}
        nextQuestion={mockNextQuestionCard}
      />
    );
    expect(screen.getByTestId("next-question-section")).toBeDefined();
    expect(screen.getByTestId("next-question-text").textContent).toBe(
      "What is the entry signal definition?"
    );
    expect(screen.getByTestId("next-question-score")).toBeDefined();
  });

  it("does not render next question section when card is not next_question type", () => {
    const nonNQCard: WorkshopCard = {
      ...mockNextQuestionCard,
      card_type: "completeness_update",
    };
    render(
      <StrategyCompletenessRail
        completeness={null}
        readiness={null}
        nextQuestion={nonNQCard}
      />
    );
    expect(screen.queryByTestId("next-question-section")).toBeNull();
  });
});
