import React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkshopCardRenderer } from "./WorkshopCardRenderer";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";

afterEach(cleanup);

const baseCard: WorkshopCard = {
  spec_version: "1.0",
  card_id: "card-cr-001",
  card_type: "consult_result",
  workshop_id: "ws-001",
  sequence_no: 7,
  status: "completed",
  title: "Risk Committee Consultation",
  summary: "Committee review on momentum strategy concentration risk.",
  payload: {
    consultation_id: "consult-001",
    consultation_type: "risk_committee",
    participant_persona_refs: ["persona-risk-a", "persona-risk-b"],
    status: "completed",
    consensus_summary: "Agreed: strategy acceptable with position size cap at 2% per name.",
    disagreements: ["Persona B prefers 1.5% cap due to illiquidity tail risk"],
    risk_notes: ["Liquidity deteriorates beyond $5M notional in small-cap names"],
    conditions: ["Implement hard stop at -8% drawdown", "Review quarterly"],
    freshness: "fresh",
  },
  created_at: "2026-06-22T00:00:00Z",
};

function renderCard(card: WorkshopCard = baseCard, onContinueDiscussion?: (cardId: string) => void) {
  render(<WorkshopCardRenderer card={card} onContinueDiscussion={onContinueDiscussion} />);
}

describe("ConsultResultCard", () => {
  it("renders with correct testid", () => {
    renderCard();
    expect(screen.getByTestId("workshop-card-card-cr-001")).toBeDefined();
  });

  it("displays card title", () => {
    renderCard();
    expect(screen.getByText("Risk Committee Consultation")).toBeDefined();
  });

  it("shows status badge from payload.status", () => {
    renderCard();
    expect(screen.getByText("Completed")).toBeDefined();
  });

  it("shows freshness badge", () => {
    renderCard();
    expect(screen.getByText("Freshness")).toBeDefined();
    expect(screen.getByText("fresh")).toBeDefined();
  });

  it("renders consensus summary", () => {
    renderCard();
    expect(screen.getByText(/position size cap at 2%/)).toBeDefined();
  });

  it("renders disagreements list", () => {
    renderCard();
    expect(screen.getByText(/1.5% cap/)).toBeDefined();
  });

  it("renders risk notes section", () => {
    renderCard();
    expect(screen.getByText(/Liquidity deteriorates/)).toBeDefined();
  });

  it("renders conditions list", () => {
    renderCard();
    expect(screen.getByText(/hard stop at -8%/)).toBeDefined();
  });

  it("does not show disagreements section when empty", () => {
    const card: WorkshopCard = {
      ...baseCard,
      payload: { ...baseCard.payload, disagreements: [] },
    };
    renderCard(card);
    expect(screen.queryByText("Disagreements")).toBeNull();
  });

  it("does not show risk notes section when missing", () => {
    const card: WorkshopCard = {
      ...baseCard,
      payload: { ...baseCard.payload, risk_notes: undefined },
    };
    renderCard(card);
    expect(screen.queryByText("Risk Notes")).toBeNull();
  });

  it("renders Ask Servant button when onContinueDiscussion provided", () => {
    renderCard(baseCard, () => undefined);
    expect(screen.getByTestId("workshop-card-card-cr-001-discuss")).toBeDefined();
  });

  it("calls onContinueDiscussion with card_id on click", () => {
    const handler = vi.fn();
    renderCard(baseCard, handler);
    fireEvent.click(screen.getByTestId("workshop-card-card-cr-001-discuss"));
    expect(handler).toHaveBeenCalledWith("card-cr-001");
  });

  it("handles in_progress status", () => {
    const card: WorkshopCard = {
      ...baseCard,
      payload: { ...baseCard.payload, status: "in_progress" },
    };
    renderCard(card);
    expect(screen.getByText("in_progress")).toBeDefined();
  });
});
