import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResearchPlanCard } from "./ResearchPlanCard";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";
import "@/i18n";

afterEach(cleanup);

const baseCard: WorkshopCard = {
  spec_version: "1.0",
  card_id: "card-rp-001",
  card_type: "research_plan_proposal",
  workshop_id: "ws-001",
  sequence_no: 5,
  status: "action_required",
  title: "Momentum Factor Research Plan",
  summary: "Propose a 3-stage research run for the momentum factor hypothesis.",
  payload: {
    plan_id: "plan-001",
    objectives: ["Validate momentum persistence over 12M horizon", "Check sector correlation"],
    data_requirements: ["OHLCV daily 10Y", "sector classifications"],
    stages: [
      {
        stage_id: "s1",
        stage_type: "backtest",
        purpose: "In-sample momentum validation",
        preferred_backend: "vectorbt",
        dependencies: [],
      },
      {
        stage_id: "s2",
        stage_type: "oos_validation",
        purpose: "Walk-forward OOS check",
        preferred_backend: "vectorbt",
        dependencies: ["s1"],
      },
    ],
    evaluation_criteria: {
      sharpe: "> 0.8",
      max_drawdown: "< 15%",
    },
    warnings: ["Data availability limited post-2023"],
    approval_requirement: "human",
    budget: {
      max_runtime_minutes: 30,
      max_cost_usd: 25,
    },
  },
  created_at: "2026-06-22T00:00:00Z",
  allowed_actions: { approve: true, reject: true },
};

describe("ResearchPlanCard", () => {
  it("renders plan metadata from payload", () => {
    render(<ResearchPlanCard payload={baseCard.payload} />);
    expect(screen.getByText("plan-001")).toBeDefined();
    expect(screen.getByText("human")).toBeDefined();
  });

  it("renders objectives section", () => {
    render(<ResearchPlanCard payload={baseCard.payload} />);
    expect(screen.getByText("目標")).toBeDefined();
    expect(screen.getByText("Validate momentum persistence over 12M horizon")).toBeDefined();
  });

  it("renders data requirements", () => {
    render(<ResearchPlanCard payload={baseCard.payload} />);
    expect(screen.getByText("資料需求")).toBeDefined();
    expect(screen.getByText("OHLCV daily 10Y")).toBeDefined();
    expect(screen.getByText("sector classifications")).toBeDefined();
  });

  it("renders stages section with stage details", () => {
    render(<ResearchPlanCard payload={baseCard.payload} />);
    expect(screen.getByText("階段")).toBeDefined();
    expect(screen.getByText("s1")).toBeDefined();
    expect(screen.getByText("s2")).toBeDefined();
    expect(screen.getByText("In-sample momentum validation")).toBeDefined();
    expect(screen.getByText("依賴於 s1")).toBeDefined();
  });

  it("shows evaluation criteria", () => {
    render(<ResearchPlanCard payload={baseCard.payload} />);
    expect(screen.getByText("評估準則")).toBeDefined();
    expect(screen.getByText("> 0.8")).toBeDefined();
    expect(screen.getByText("< 15%")).toBeDefined();
  });

  it("shows warnings section", () => {
    render(<ResearchPlanCard payload={baseCard.payload} />);
    expect(screen.getByText("警告")).toBeDefined();
    expect(screen.getByText("Data availability limited post-2023")).toBeDefined();
  });

  it("shows budget details when present", () => {
    render(<ResearchPlanCard payload={baseCard.payload} />);
    expect(screen.getByText("預算")).toBeDefined();
    expect(screen.getByText("30")).toBeDefined();
    expect(screen.getByText("25")).toBeDefined();
  });
});
