import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StrategyCompletenessRail } from "./StrategyCompletenessRail";
import { WorkshopCardRenderer } from "./WorkshopCardRenderer";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";
import type { StrategyCompleteness } from "@/lib/bff-v1/agora/types";

function card(overrides: Partial<WorkshopCard>): WorkshopCard {
  return {
    spec_version: "1.0",
    card_id: "card-1",
    card_type: "research_plan_proposal",
    workshop_id: "workshop-1",
    sequence_no: 1,
    status: "informational",
    title: "Card title",
    payload: {},
    created_at: "2026-06-23T00:00:00Z",
    ...overrides,
  };
}

describe("WorkshopCardRenderer", () => {
  afterEach(() => cleanup());

  it("renders research plan proposal fields instead of raw JSON", () => {
    const { container } = render(
      <WorkshopCardRenderer
        card={card({
          status: "action_required",
          title: "Prototype winner-branch plan",
          allowed_actions: { approve: true, edit: true },
          payload: {
            plan_id: "plan-001",
            status: "draft",
            objectives: ["Validate branch accumulation lead time"],
            data_requirements: [
              {
                ref: "market.ohlcv",
                kind: "market_data",
                description: "Point-in-time price and volume.",
              },
            ],
            stages: [
              {
                stage_id: "stage-1",
                stage_type: "prototype_backtest",
                purpose: "Fast historical prototype.",
                preferred_backend: "vectorbt",
                dependencies: [],
              },
            ],
            no_order_route_proof: "research_plan_no_order_route",
          },
        })}
      />,
    );

    expect(screen.getByText("Prototype winner-branch plan")).toBeInTheDocument();
    expect(screen.getByText("Validate branch accumulation lead time")).toBeInTheDocument();
    expect(screen.getByText("vectorbt")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
    expect(container).not.toHaveTextContent('"objectives"');
  });

  it("renders user-visible workshop content without leaking private refs", () => {
    render(
      <WorkshopCardRenderer
        card={card({
          card_type: "user_strategy_description",
          title: "Initial strategy note",
          emitted_by: "user",
          payload: {
            owner_visible_content: "Track accumulation before earnings.",
            redacted_summary: "User described a pre-event accumulation strategy.",
            private_content_ref: "s3://private/raw/workshop-message",
          },
        })}
      />,
    );

    expect(screen.getByText("Track accumulation before earnings.")).toBeInTheDocument();
    expect(screen.getByText("User described a pre-event accumulation strategy.")).toBeInTheDocument();
    expect(screen.queryByText(/s3:\/\/private/)).not.toBeInTheDocument();
  });

  it("visibly labels fixture research results and groups metrics", () => {
    render(
      <WorkshopCardRenderer
        card={card({
          card_type: "research_result",
          status: "completed",
          title: "Prototype run complete",
          payload: {
            run_id: "run-001",
            outcome: "pass",
            execution_status: "succeeded",
            backend: { requested: "vectorbt", effective: "vectorbt", mode: "fixture" },
            metrics: [
              {
                category: "performance",
                name: "sharpe",
                value: 1.24,
                gate_result: "pass",
              },
            ],
            findings: [{ finding_id: "f-1", severity: "watch", summary: "Capacity remains thin." }],
            no_order_route_proof: "research_only_not_direct_action",
          },
        })}
      />,
    );

    expect(screen.getByText("Fixture")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Sharpe")).toBeInTheDocument();
    expect(screen.getByText("Capacity remains thin.")).toBeInTheDocument();
  });

  it("renders consult consensus, disagreements and risk notes", () => {
    render(
      <WorkshopCardRenderer
        card={card({
          card_type: "consult_result",
          title: "Red team consult",
          payload: {
            consultation_id: "consult-1",
            consultation_type: "red_team",
            participant_persona_refs: ["risk", "research"],
            status: "completed",
            consensus_summary: "Proceed only after liquidity checks.",
            disagreements: ["Research accepts proxy data; risk does not."],
            risk_notes: ["Liquidity source is stale."],
          },
        })}
      />,
    );

    expect(screen.getByText("Proceed only after liquidity checks.")).toBeInTheDocument();
    expect(screen.getByText("Research accepts proxy data; risk does not.")).toBeInTheDocument();
    expect(screen.getByText("Liquidity source is stale.")).toBeInTheDocument();
  });

  it("renders a governed proposal card with revision, paper validation, and no-execution truth", () => {
    render(
      <WorkshopCardRenderer
        card={card({
          card_type: "governed_proposal",
          title: "Paper risk adjustment",
          payload: {
            etag: '"proposal-v2"',
            validation_result: { valid: true },
            proposal: {
              proposal_id: "proposal-paper-1",
              proposal_type: "risk_limit_recommendation",
              target_kind: "strategy",
              target_id: "strategy-1",
              target_version: "version-7",
              current_value: { limit: 5 },
              proposed_value: { limit: 3 },
              rationale: "Reduce paper drawdown",
              evidence_refs: ["evidence-paper-1"],
              environment_ceiling: "paper",
              required_permissions: ["risk.review"],
              required_reviewers: ["human", "risk"],
              human_gate: true,
              revision: 2,
              state: "draft",
              expires_at: "2026-08-01T00:00:00Z",
              audit: [{ action: "create", actor: "persona", at: "2026-07-14T00:00:00Z" }],
              governed_action_link: { execution_authority: "none" },
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("governed-proposal-proposal-paper-1")).toBeInTheDocument();
    expect(screen.getByText(/revision 2/i)).toBeInTheDocument();
    expect(screen.getByText("paper")).toBeInTheDocument();
    expect(screen.getByText(/no execution authority/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "validate" })).toBeEnabled();
  });
});

describe("StrategyCompletenessRail", () => {
  afterEach(() => cleanup());

  it("renders completeness dimensions and readiness blockers", () => {
    const completeness: StrategyCompleteness = {
      spec_version: "1.0",
      completeness_id: "comp-1",
      strategy_ref: "strategy-1",
      workshop_id: "workshop-1",
      assessed_by_persona_id: "servant-1",
      overall_grade: "partial",
      dimensions: [
        {
          dimension: "hypothesis",
          grade: "complete",
        },
        {
          dimension: "data_dependencies",
          grade: "missing",
          gaps: ["PIT data source unknown"],
          required_actions: ["Select data vendor"],
        },
      ],
      blockers: ["Critical definition missing"],
      research_ready: false,
      assessed_at: "2026-06-23T00:00:00Z",
    };

    render(
      <StrategyCompletenessRail
        completeness={completeness}
        readiness={{
          assessment_id: "ready-1",
          workshop_id: "workshop-1",
          gate: "preliminary_research",
          passed: false,
          blockers: ["PR-03 blocked"],
          assessed_at: "2026-06-23T00:00:00Z",
        }}
      />,
    );

    expect(screen.getByText("Data dependencies")).toBeInTheDocument();
    expect(screen.getByText("PIT data source unknown")).toBeInTheDocument();
    expect(screen.getByText("Critical definition missing")).toBeInTheDocument();
    expect(screen.getByText("Preliminary research")).toBeInTheDocument();
    expect(screen.getByText("PR-03 blocked")).toBeInTheDocument();
  });
});
