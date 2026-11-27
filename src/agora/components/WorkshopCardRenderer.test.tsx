import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/agora/useAgoraWriteAccess", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/agora/useAgoraWriteAccess")>();
  return {
    ...original,
    useAgoraWriteAccess: () => ({
      actorId: "operator-1",
      agoraCapabilities: ["agora.workshop.v1"],
      capabilities: ["risk.review"],
      roles: ["operator"],
      loading: false,
      interactionAllowed: true,
      interactionDisabledReason: null,
      writeAllowed: true,
      writeDisabledReason: null,
    }),
  };
});

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
    expect(screen.getByText("核准")).toBeInTheDocument();
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

    expect(screen.getByText("樣本資料")).toBeInTheDocument();
    expect(screen.getByText("績效表現")).toBeInTheDocument();
    expect(screen.getByText("sharpe")).toBeInTheDocument();
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

  it("renders workshop conclusion card fields", () => {
    render(
      <WorkshopCardRenderer
        card={card({
          card_type: "workshop_concluded",
          status: "completed",
          title: "Workshop Concluded",
          payload: {
            concluded_outcome: "Strategy draft validated and version 2 created.",
            concluded_by: "operator-001",
            concluded_at: "2026-08-13T12:00:00Z",
            final_version_id: "v2-draft",
            next_actions: ["Promote to Paper Trading"],
          },
        })}
      />,
    );

    expect(screen.getByText("Strategy draft validated and version 2 created.")).toBeInTheDocument();
    expect(screen.getByText("operator-001")).toBeInTheDocument();
    expect(screen.getByText("Promote to Paper Trading")).toBeInTheDocument();
  });

  it("renders BFF strategy_reconstruction card in zh-TW with clickable decision options and expandable engineering details", () => {
    const onSubmitDecision = vi.fn();
    render(
      <WorkshopCardRenderer
        card={card({
          card_id: "card-recon-1",
          card_type: "strategy_reconstruction",
          status: "completed",
          title: "策略重建卡",
          payload: {
            registry_draft_ref: "draft-001",
            reconstruction: {
              reconstruction_id: "recon-001",
              strategy_map: {
                market_scope: "台股上市半導體前 30 大",
                entry_holding: "法說前 10 日分點連續買超進場",
              },
              explicit_facts: ["只做台股上市半導體族群"],
              inferences: ["停損預設為跌破 10 日均線"],
              assumptions: ["日成交金額大於 3 億新台幣"],
              contradictions: ["隔日沖出場與波段持有 15 天存在時間窗衝突"],
              next_decision: {
                question_id: "q-exit-horizon",
                question: "請確認主要出場條件應以事件日隔天或波段停利為準？",
                why_high_value: "解決持有時間窗衝突後才能鎖定回測視窗",
                options: [
                  { option_id: "opt-event-t1", label: "事件後 T+1 出場", summary: "純事件前領先交易" },
                  { option_id: "opt-swing-15d", label: "波段持有 15 日", summary: "搭配移動停利" },
                ],
                servant_default: {
                  option_id: "opt-event-t1",
                  label: "事件後 T+1 出場",
                },
              },
              provider_lineage: {
                provider: "openclaw",
                model: "claude-sonnet",
              },
            },
          },
        })}
        onSubmitDecision={onSubmitDecision}
      />,
    );

    expect(screen.getByText("一、已確認的策略核心與顯性規則")).toBeInTheDocument();
    expect(screen.getByText("二、助理推定與暫時假設（待您確認）")).toBeInTheDocument();
    expect(screen.getByText("三、尚缺定義與潛在衝突")).toBeInTheDocument();
    expect(screen.getByText("四、下一個最高價值決策問題")).toBeInTheDocument();
    expect(screen.getByText("只做台股上市半導體族群")).toBeInTheDocument();
    expect(screen.getByText("隔日沖出場與波段持有 15 天存在時間窗衝突")).toBeInTheDocument();
    expect(screen.getByTestId("reconstruction-engineering-details")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reconstruction-decision-option-opt-event-t1"));
    expect(onSubmitDecision).toHaveBeenCalledWith({
      question_id: "q-exit-horizon",
      selected_option_id: "opt-event-t1",
    });

    fireEvent.click(screen.getByTestId("reconstruction-decision-servant-default"));
    expect(onSubmitDecision).toHaveBeenCalledWith({
      question_id: "q-exit-horizon",
      use_servant_default: true,
    });
  });

  it("renders failed strategy_reconstruction card with typed failure_reason and retry callback", () => {
    const onRetry = vi.fn();
    render(
      <WorkshopCardRenderer
        card={card({
          card_id: "card-recon-failed",
          card_type: "strategy_reconstruction",
          status: "failed",
          title: "策略重建未完成",
          payload: {
            failure_reason: "provider_timeout",
            failure_status: 504,
          },
        })}
        onRetryReconstruction={onRetry}
      />,
    );

    expect(screen.getByTestId("reconstruction-failed-card-recon-failed")).toBeInTheDocument();
    expect(screen.getByTestId("reconstruction-failure-reason")).toHaveTextContent("provider_timeout");
    expect(screen.getByText(/策略重建服務回應逾時/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("retry-reconstruction-btn"));
    expect(onRetry).toHaveBeenCalledWith("card-recon-failed");
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

    expect(screen.getByText("資料依賴")).toBeInTheDocument();
    expect(screen.getByText("PIT data source unknown")).toBeInTheDocument();
    expect(screen.getByText("Critical definition missing")).toBeInTheDocument();
    expect(screen.getByText("初步研究")).toBeInTheDocument();
    expect(screen.getByText("PR-03 blocked")).toBeInTheDocument();
  });
});
