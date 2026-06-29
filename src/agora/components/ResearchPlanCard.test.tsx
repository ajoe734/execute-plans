import React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkshopCardRenderer } from "./WorkshopCardRenderer";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";

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
    evaluation_criteria: "Sharpe > 0.8, max drawdown < 15%",
    warnings: ["Data availability limited post-2023"],
    approval_requirement: "human",
  },
  created_at: "2026-06-22T00:00:00Z",
  allowed_actions: { approve: true, reject: true },
};

function renderCard(card: WorkshopCard = baseCard, onContinueDiscussion?: (cardId: string) => void) {
  render(<WorkshopCardRenderer card={card} onContinueDiscussion={onContinueDiscussion} />);
}

describe("ResearchPlanCard", () => {
  it("renders with correct testid", () => {
    renderCard();
    expect(screen.getByTestId("workshop-card-card-rp-001")).toBeDefined();
  });

  it("displays card title and summary", () => {
    renderCard();
    expect(screen.getByText("Momentum Factor Research Plan")).toBeDefined();
    expect(screen.getByText(/Propose a 3-stage research run/)).toBeDefined();
  });

  it("shows status badge", () => {
    renderCard();
    expect(screen.getByText("Action required")).toBeDefined();
  });

  it("renders objectives section", () => {
    renderCard();
    expect(screen.getByText(/Validate momentum persistence/)).toBeDefined();
  });

  it("renders stages section with stage details", () => {
    renderCard();
    expect(screen.getByText("s1")).toBeDefined();
    expect(screen.getByText("s2")).toBeDefined();
    expect(screen.getByText("In-sample momentum validation")).toBeDefined();
    expect(screen.getByText("Walk-forward OOS check")).toBeDefined();
  });

  it("shows evaluation criteria", () => {
    renderCard();
    expect(screen.getByText(/Sharpe > 0.8/)).toBeDefined();
  });

  it("shows warnings section", () => {
    renderCard();
    expect(screen.getByText(/Data availability limited/)).toBeDefined();
  });

  it("shows approval requirement", () => {
    renderCard();
    expect(screen.getByText("Approval")).toBeDefined();
    expect(screen.getByText("human")).toBeDefined();
  });

  it("renders approve and reject buttons when allowed_actions permits", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDefined();
  });

  it("does not render approve button when allowed_actions.approve is falsy", () => {
    const card: WorkshopCard = { ...baseCard, allowed_actions: { approve: false, reject: true } };
    renderCard(card);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDefined();
  });

  it("renders Ask Servant button when onContinueDiscussion is provided", () => {
    renderCard(baseCard, () => undefined);
    expect(screen.getByTestId("workshop-card-card-rp-001-discuss")).toBeDefined();
  });

  it("calls onContinueDiscussion with card_id when Ask Servant is clicked", () => {
    const handler = vi.fn();
    renderCard(baseCard, handler);
    fireEvent.click(screen.getByTestId("workshop-card-card-rp-001-discuss"));
    expect(handler).toHaveBeenCalledWith("card-rp-001");
  });

  it("does not render Ask Servant button when no callback is provided", () => {
    renderCard();
    expect(screen.queryByTestId("workshop-card-card-rp-001-discuss")).toBeNull();
  });
});
