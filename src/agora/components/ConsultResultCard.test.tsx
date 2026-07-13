import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConsultResultCard } from "./ConsultResultCard";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";
import "@/i18n";

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

describe("ConsultResultCard", () => {
  it("renders consultation metadata from payload", () => {
    render(<ConsultResultCard payload={baseCard.payload} />);
    expect(screen.getByText("consult-001")).toBeDefined();
    expect(screen.getByText("risk_committee")).toBeDefined();
    expect(screen.getByText("completed")).toBeDefined();
  });

  it("shows freshness badge", () => {
    render(<ConsultResultCard payload={baseCard.payload} />);
    expect(screen.getByText("fresh")).toBeDefined();
  });

  it("renders participant persona refs", () => {
    render(<ConsultResultCard payload={baseCard.payload} />);
    expect(screen.getByText("參與者")).toBeDefined();
    expect(screen.getByText("persona-risk-a")).toBeDefined();
    expect(screen.getByText("persona-risk-b")).toBeDefined();
  });

  it("renders consensus summary", () => {
    render(<ConsultResultCard payload={baseCard.payload} />);
    expect(screen.getByText("共識")).toBeDefined();
    expect(screen.getByText(/position size cap at 2%/)).toBeDefined();
  });

  it("renders disagreements list", () => {
    render(<ConsultResultCard payload={baseCard.payload} />);
    expect(screen.getByText("歧異")).toBeDefined();
    expect(screen.getByText(/1.5% cap/)).toBeDefined();
  });

  it("renders risk notes section", () => {
    render(<ConsultResultCard payload={baseCard.payload} />);
    expect(screen.getByText("風險備註")).toBeDefined();
    expect(screen.getByText("Liquidity deteriorates beyond $5M notional in small-cap names")).toBeDefined();
  });

  it("renders conditions list", () => {
    render(<ConsultResultCard payload={baseCard.payload} />);
    expect(screen.getByText("條件限制")).toBeDefined();
    expect(screen.getByText("Implement hard stop at -8% drawdown")).toBeDefined();
  });

  it("does not show disagreements section when empty", () => {
    const card: WorkshopCard = {
      ...baseCard,
      payload: { ...baseCard.payload, disagreements: [] },
    };
    render(<ConsultResultCard payload={card.payload} />);
    expect(screen.queryByText("歧異")).toBeNull();
  });

  it("does not show risk notes section when missing", () => {
    const card: WorkshopCard = {
      ...baseCard,
      payload: { ...baseCard.payload, risk_notes: undefined },
    };
    render(<ConsultResultCard payload={card.payload} />);
    expect(screen.queryByText("風險備註")).toBeNull();
  });

  it("handles in_progress status", () => {
    const card: WorkshopCard = {
      ...baseCard,
      payload: { ...baseCard.payload, status: "in_progress" },
    };
    render(<ConsultResultCard payload={card.payload} />);
    expect(screen.getByText("in_progress")).toBeDefined();
  });
});
