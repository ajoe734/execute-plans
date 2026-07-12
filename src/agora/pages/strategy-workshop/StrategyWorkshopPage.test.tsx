import React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bff-v1/agora/workshops", () => ({
  listWorkshops: vi.fn().mockResolvedValue([]),
  getWorkshop: vi.fn().mockResolvedValue(null),
  getWorkshopCompleteness: vi.fn().mockResolvedValue(null),
  getWorkshopReadiness: vi.fn().mockResolvedValue(null),
  listWorkshopCards: vi.fn().mockResolvedValue([]),
  openWorkshopStream: vi.fn().mockReturnValue(() => undefined),
}));

import { StrategyWorkshopPage } from "./StrategyWorkshopPage";
import * as workshopsModule from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";

afterEach(cleanup);

describe("StrategyWorkshopPage", () => {
  beforeEach(() => {
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the list view when no workshopId is provided", () => {
    render(<StrategyWorkshopPage />);
    expect(screen.getByTestId("strategy-workshop-page-list")).toBeDefined();
  });

  it("shows loading state while fetching workshops", () => {
    vi.mocked(workshopsModule.listWorkshops).mockReturnValue(new Promise(() => {}));
    render(<StrategyWorkshopPage />);
    expect(screen.getByTestId("workshop-list-loading")).toBeDefined();
  });

  it("shows empty state after workshops resolve to empty", async () => {
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([]);
    render(<StrategyWorkshopPage />);
    await screen.findByTestId("workshop-list-empty");
  });

  it("shows workshop list items when workshops are returned", async () => {
    vi.mocked(workshopsModule.listWorkshops).mockResolvedValue([
      {
        spec_version: "1.0",
        workshop_id: "ws-001",
        operator_id: "operator-001",
        status: "open",
        subject: {
          kind: "free_form",
          ref: "strategy-draft-001",
          title: "Winner Branch draft",
        },
        created_at: "2026-06-01T00:00:00Z",
        metadata: { updated_at: "2026-06-01T00:00:00Z", lock_version: 1 },
      } as StrategyWorkshop,
    ]);
    render(<StrategyWorkshopPage />);
    await screen.findByTestId("workshop-list");
    expect(screen.getByTestId("workshop-list")).toBeDefined();
  });

  it("renders the session view when workshopId is provided", () => {
    vi.mocked(workshopsModule.getWorkshop).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("strategy-workshop-page-session")).toBeDefined();
  });

  it("renders the conversation and completeness rail in session view", () => {
    vi.mocked(workshopsModule.getWorkshop).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("workshop-conversation")).toBeDefined();
    expect(screen.getByTestId("completeness-rail")).toBeDefined();
  });

  it("renders the servant composer in session view", () => {
    vi.mocked(workshopsModule.getWorkshop).mockReturnValue(new Promise(() => {}));
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue([]);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("servant-composer")).toBeDefined();
  });

  it("calls listWorkshops through the BFF module (not direct fetch)", () => {
    render(<StrategyWorkshopPage />);
    expect(workshopsModule.listWorkshops).toHaveBeenCalled();
  });

  it("renders the Context Bar, Mode Selector, and Participant Picker in session view", () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: "ws-abc",
      operator_id: "operator-001",
      status: "open",
      subject: { kind: "strategy_spec", ref: "stg_001", title: "Quant Alpha" },
      created_at: "2026-06-01T00:00:00Z",
    } as any);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue({ items: [] });
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    expect(screen.getByTestId("context-bar")).toBeDefined();
    expect(screen.getByTestId("mode-selector")).toBeDefined();
    expect(screen.getByTestId("participant-picker")).toBeDefined();
    expect(screen.getByTestId("eligibility-explanation")).toBeDefined();
  });

  it("renders warning banners when stale/degraded/denied triggers are toggled", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: "ws-abc",
      operator_id: "operator-001",
      status: "open",
      subject: { kind: "strategy_spec", ref: "stg_001", title: "Quant Alpha" },
      created_at: "2026-06-01T00:00:00Z",
    } as any);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue({ items: [] });
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    
    // Simulate user clicking on state toggle buttons using fireEvent and findBy
    const staleBtn = screen.getByTestId("toggle-stale-btn");
    fireEvent.click(staleBtn);
    expect(await screen.findByTestId("warning-stale")).toBeDefined();

    const degradedBtn = screen.getByTestId("toggle-degraded-btn");
    fireEvent.click(degradedBtn);
    expect(await screen.findByTestId("warning-degraded")).toBeDefined();

    const deniedBtn = screen.getByTestId("toggle-denied-btn");
    fireEvent.click(deniedBtn);
    expect(await screen.findByTestId("warning-denied")).toBeDefined();
  });

  it("renders independent persona opinions and debates in cards list", async () => {
    vi.mocked(workshopsModule.getWorkshop).mockResolvedValue({
      spec_version: "1.0",
      workshop_id: "ws-abc",
      operator_id: "operator-001",
      status: "open",
      subject: { kind: "strategy_spec", ref: "stg_001", title: "Quant Alpha" },
      created_at: "2026-06-01T00:00:00Z",
    } as any);
    vi.mocked(workshopsModule.listWorkshopCards).mockResolvedValue({
      items: [
        {
          card_id: "card-opinion-1",
          card_type: "persona_opinion",
          workshop_id: "ws-abc",
          sequence_no: 1,
          status: "completed",
          title: "Opinion by Quant Architect",
          payload: {
            stance: "approve",
            confidence: 0.9,
            rationale: "The backtest Sharpe is high and meets criteria.",
            persona_id: "per_quant",
            persona_version: "1.2",
            uncertainty: "Data coverage lacks 2020 crash."
          },
          created_at: "2026-06-01T00:00:00Z",
        },
        {
          card_id: "card-debate-1",
          card_type: "debate",
          workshop_id: "ws-abc",
          sequence_no: 2,
          status: "informational",
          title: "Debate on Regime Shift",
          payload: {
            topic: "Regime Shift sensitivity",
            summary: "Quant vs Macro on Sharpe persistence",
            exchanges: [
              {
                speaker: "Quant Architect",
                stance: "approve",
                message: "Parameters are robust.",
              },
              {
                speaker: "Macro Strategist",
                stance: "challenge",
                message: "Interest rate cut could break regime assumptions.",
              }
            ]
          },
          created_at: "2026-06-01T00:00:00Z",
        }
      ]
    } as any);
    vi.mocked(workshopsModule.getWorkshopCompleteness).mockResolvedValue(null);
    vi.mocked(workshopsModule.getWorkshopReadiness).mockResolvedValue(null);

    render(<StrategyWorkshopPage workshopId="ws-abc" />);
    
    // Verify custom cards exist
    await screen.findByTestId("workshop-card-card-opinion-1");
    expect(screen.getByText("Opinion Stance:")).toBeDefined();
    expect(screen.getByText("Approve (贊成)")).toBeDefined();
    expect(screen.getByText("The backtest Sharpe is high and meets criteria.")).toBeDefined();

    expect(screen.getByTestId("workshop-card-card-debate-1")).toBeDefined();
    expect(screen.getByText("Quant Architect")).toBeDefined();
    expect(screen.getByText("Macro Strategist")).toBeDefined();
    expect(screen.getByText("Parameters are robust.")).toBeDefined();
  });
});
