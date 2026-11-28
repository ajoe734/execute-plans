import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrategyCompletenessRail } from "./StrategyCompletenessRail";
import type { StrategyCompleteness } from "@/lib/bff-v1/agora/workshops";
import type { WorkshopCard, WorkshopCompletenessSnapshot } from "@/lib/bff-v1/agora/workshops";
import { V10_TWELVE_BLOCK_DEFS } from "./workshopCompletenessDisplay";
import type { WorkshopV10BlockState } from "@/lib/bff-v1/agora/workshops";

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
    expect(screen.getByText("策略完整度尚未評估")).toBeInTheDocument();
    expect(screen.queryByTestId("completeness-progress-counts")).toBeNull();
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
    expect(grade.textContent).toBe("部分完整");
    expect(screen.getByText("整體完整度")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
  });

  it("keeps the hosted card's complete gate label while showing its actual block progress", () => {
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
      spec_version: "1.0",
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

    expect(screen.getByTestId("completeness-overall-grade").textContent).toBe("完整");
    expect(screen.getByText("58%")).toBeDefined();
    expect(screen.getByTestId("completeness-progress-counts")).toHaveTextContent("已確認 7・部分 0・尚缺 5");
    expect(screen.queryByText("NaN%")).toBeNull();
    expect(screen.getByText("研究就緒").nextElementSibling?.textContent).toBe("是");
  });

  it.each([
    { name: "partly defined despite an incomplete gate", states: ["confirmed", ...Array(10).fill("inferred"), "missing"], percent: 50, counts: "已確認 1・部分 10・尚缺 1" },
    { name: "all confirmed", states: Array(12).fill("confirmed"), percent: 100, counts: "已確認 12・部分 0・尚缺 0" },
    { name: "all missing", states: Array(12).fill("missing"), percent: 0, counts: "已確認 0・部分 0・尚缺 12" },
    { name: "weak and conflict", states: ["confirmed", "inferred", "weak", "conflict", ...Array(8).fill("missing")], percent: 17, counts: "已確認 1・部分 2・尚缺 9" },
  ])("shows block progress for $name", ({ states, percent, counts }) => {
    render(<StrategyCompletenessRail completeness={{
      ...mockCompleteness,
      overall_grade: "incomplete",
      twelve_blocks: V10_TWELVE_BLOCK_DEFS.map((definition, index) => ({
        block_id: definition.v10_block_id,
        title_zh: definition.generic_title,
        state: states[index] as WorkshopV10BlockState,
      })),
    }} />);

    expect(screen.getByText(`${percent}%`)).toBeInTheDocument();
    expect(screen.getByTestId("completeness-progress-counts")).toHaveTextContent(counts);
    expect(screen.getByTestId("completeness-overall-grade")).toHaveTextContent("不完整");
    expect(screen.getByTestId("completeness-overall-grade")).toHaveClass("text-rose-400");
    const bar = screen.getByText("整體完整度").parentElement?.nextElementSibling?.firstElementChild;
    expect(bar).toHaveStyle({ width: `${percent}%` });
  });

  it("falls back to dimensions and rounds 2 complete, 7 partial, 3 incomplete to 46%", () => {
    // Twelve dimension updates belong to the flexible card payload; the
    // canonical StrategyCompleteness DTO has only seven dimension names.
    const grades = ["complete", "complete", ...Array(7).fill("partial"), ...Array(3).fill("incomplete")];
    render(<StrategyCompletenessRail
      completeness={{ ...mockCompleteness, overall_grade: "incomplete", dimensions: [] }}
      completenessCard={{
        ...mockNextQuestionCard,
        card_type: "completeness_update",
        payload: {
          overall_grade: "incomplete",
          dimension_updates: V10_TWELVE_BLOCK_DEFS.map((definition, index) => ({
            dimension: definition.v10_block_id,
            current_grade: grades[index],
            gaps: [],
            required_actions: [],
          })),
        },
      }}
    />);

    expect(screen.getByText("46%")).toBeInTheDocument();
    expect(screen.getByTestId("completeness-progress-counts")).toHaveTextContent("已確認 2・部分 7・尚缺 3");
    expect(screen.queryByTestId("v10-twelve-blocks-section")).toBeNull();
  });

  it("shows zero progress with no blocks or dimensions", () => {
    render(<StrategyCompletenessRail completeness={{ ...mockCompleteness, dimensions: [] }} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByTestId("completeness-progress-counts")).toHaveTextContent("已確認 0・部分 0・尚缺 0");
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

    expect(screen.getByTestId("completeness-dimension-hypothesis-grade").textContent).toBe("完整");
    expect(screen.getByTestId("completeness-dimension-data_dependencies-grade").textContent).toBe("部分完整");
    expect(screen.getByTestId("completeness-dimension-market_scope-grade").textContent).toBe("尚缺");
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

    expect(screen.getByTestId("readiness-gate-preliminary_research-state").textContent).toBe("有條件就緒");
    expect(screen.getByTestId("readiness-gate-full_validation-state").textContent).toBe("尚未評估");
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
    expect(gate.className).toContain("border-emerald-500/60");
    expect(screen.getByText("初步研究").className).toContain("text-emerald-300");
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

  it("renders all 12 V10 blocks with the five V10 states, notes, and submits clickable next decision options", () => {
    const onSubmitDecision = vi.fn();
    const v10Snapshot: WorkshopCompletenessSnapshot = {
      snapshot_id: "snap-v10",
      workshop_id: "ws-v10",
      strategy_version_id: "v1",
      is_branch_strategy: true,
      state_map_json: {},
      blocking_items_json: [],
      twelve_blocks: [
        { block_id: "market_scope", title_zh: "市場與標的範圍", state: "confirmed", note: "台股上市櫃電子股" },
        { block_id: "key_branch_definition", title_zh: "關鍵分點定義", state: "inferred", note: "助理推定以地緣分點為核心" },
        { block_id: "winner_branch_score", title_zh: "勝率分點評分", state: "missing", note: "尚未指定勝率回溯天數" },
        { block_id: "branch_migration_reversal", title_zh: "分點轉移與反手", state: "weak", note: "反手賣超門檻定義過寬" },
        { block_id: "event_lead_signal", title_zh: "事件前領先訊號", state: "conflict", note: "法說前 5 日與 15 日條件矛盾" },
      ],
      next_decision: {
        question_id: "q-winner-window",
        question: "勝率分點評分應採用多長的歷史回溯視窗？",
        why_high_value: "決定分點篩選穩定度與樣本數",
        options: [
          { option_id: "opt-60d", label: "近 60 個交易日", summary: "反應近期主力分點動能" },
          { option_id: "opt-120d", label: "近 120 個交易日", summary: "涵蓋兩季財報週期" },
        ],
        servant_default: {
          option_id: "opt-120d",
          label: "近 120 個交易日",
        },
      },
      created_at: "2026-11-27T00:00:00Z",
    };

    render(
      <StrategyCompletenessRail
        completeness={v10Snapshot}
        nextQuestion={null}
        onSubmitDecision={onSubmitDecision}
        readiness={null}
      />,
    );

    expect(screen.getByTestId("v10-twelve-blocks-section")).toBeInTheDocument();
    expect(screen.getByText("籌碼／分點策略結構")).toBeInTheDocument();
    expect(screen.getByTestId("v10-block-market_scope-state").textContent).toBe("已確認");
    expect(screen.getByTestId("v10-block-key_branch_definition-state").textContent).toBe("助理推定");
    expect(screen.getByTestId("v10-block-winner_branch_score-state").textContent).toBe("尚缺");
    expect(screen.getByTestId("v10-block-branch_migration_reversal-state").textContent).toBe("薄弱");
    expect(screen.getByTestId("v10-block-event_lead_signal-state").textContent).toBe("衝突");
    expect(screen.getByTestId("v10-block-event_lead_signal-note").textContent).toBe("法說前 5 日與 15 日條件矛盾");
    // Remaining 7 blocks of the 12 are materialized in V10 order
    expect(screen.getByTestId("v10-block-signal_formation")).toBeInTheDocument();
    expect(screen.getByTestId("v10-block-monitoring_update")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("rail-decision-option-opt-60d"));
    expect(onSubmitDecision).toHaveBeenCalledWith({
      question_id: "q-winner-window",
      selected_option_id: "opt-60d",
    });

    fireEvent.click(screen.getByTestId("rail-decision-servant-default"));
    expect(onSubmitDecision).toHaveBeenCalledWith({
      question_id: "q-winner-window",
      use_servant_default: true,
    });
  });
});
