import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import { SystemSuggestionsPanel } from "./SystemSuggestionsPanel";
import { TradingRoomWorkspace } from "./TradingRoomWorkspace";
import type {
  TradingDecisionEvent,
  TradingRoomAggregate,
  TradingRoomStrategyEntry,
} from "@/lib/bff-v1/agora/tradingRoom";

const BASE = "https://test.example";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SAMPLE_DECISION_EVENT: TradingDecisionEvent = {
  confidence: { basis: "model", calibration_state: "calibrated", value: 0.85 },
  decision_event_id: "evt-ik-2330",
  event_kind: "entry",
  evidence_refs: [],
  expected_value: {
    cost: 0.001,
    downside: -0.015,
    gross: 0.032,
    horizon: "5d",
    net: 0.031,
    unit: "pct_return",
  },
  invalidation: { conditions: ["Close below 20d MA"], current_state: "valid" },
  no_order_route_proof: "agora_decision_support_only",
  origin: "strategy_signal",
  probability: { horizon: "5d", target_outcome: "profit_target_hit", value: 0.64 },
  rationale: [{ claim: "Institutional accumulation", confidence: 0.85 }],
  risk_notes: [],
  spec_version: "1.0",
  state: "pending_review",
  strategy_id: "strat-001",
  strategy_spec_registry_id: "reg-001",
  subject: { symbol: "2330.TW", venue: "TWSE" },
  suggested_action: "enter",
  triggered_at: "2026-11-16T09:05:00Z",
};

// Recorded BFF response shape from AGORA-INSTITUTIONAL-KNOWLEDGE-20261116
const RECORDED_SUGGESTIONS_RESPONSE = {
  status: "ok",
  data: {
    decision_event_id: "evt-ik-2330",
    servant_persona_id: "agora-servant-7f8a9b0c1d2e3f4a5b6c",
    recall_scope: "institutional_facts_read_only",
    read_only: true,
    advice_only: true,
    execution_authority: "none",
    environment_ceiling: "paper",
    no_order_route_proof: "agora_decision_support_only",
    count: 3,
    counts: {
      validated_attribution_findings: 1,
      endorsed_lessons: 1,
      validated_strategy_facts: 1,
      excluded_unvalidated: 2,
      excluded_luck_or_unsupported: 3,
      returned: 3,
    },
    decision_context: {
      decision_event_id: "evt-ik-2330",
      symbol: "2330.TW",
      strategy_id: "strat-001",
      strategy_spec_registry_id: "reg-001",
      strategy_family: "momentum",
      event_kind: "entry",
      suggested_action: "enter",
      regime_ref: "regime-high-vol",
    },
    suggestions: [
      {
        suggestion_id: "sug:evt-ik-2330:fact:attr:attr-001:hyp-val-001",
        fact_id: "fact:attr:attr-001:hyp-val-001",
        fact_kind: "validated_attribution_finding",
        decision_event_id: "evt-ik-2330",
        servant_persona_id: "agora-servant-7f8a9b0c1d2e3f4a5b6c",
        title: "Validated attribution finding (entry_timing): Delay open chase on high-IV days",
        suggestion: "Wait 15 minutes after market open on high-IV semiconductor sessions to reduce entry slippage by 18 bps",
        summary: "Wait 15 minutes after market open on high-IV semiconductor sessions to reduce entry slippage by 18 bps",
        hypothesis: "Wait 15 minutes after market open on high-IV semiconductor sessions to reduce entry slippage by 18 bps",
        component: "entry_timing",
        validation_status: "validated",
        source_owner: "attribution+research",
        relevance_score: 0.95,
        relevance_reasons: ["symbol_match", "strategy_match", "component_action_match"],
        attribution_record_id: "attr-001",
        validation_result_id: "demand-val-001",
        links: {
          attribution_record: "/api/attribution/records/attr-001",
          validation_result: "/api/research/persona-demands?demand_id=demand-val-001",
        },
        evidence: {
          effect_bps: 18,
          p_value: 0.008,
          sample_size: 48,
          luck_interval: { low: 0.006, high: 0.029, level: 0.95 },
          evidence_refs: [
            {
              ref_type: "source_record",
              ref_id: "attr-001",
              summary: "Attribution outlier record attr-001 (entry_timing)",
            },
            {
              ref_type: "research_run",
              ref_id: "demand-val-001",
              summary: "Validated hypothesis card demand-val-001 (p=0.008)",
            },
          ],
        },
        evidence_refs: [
          {
            ref_type: "source_record",
            ref_id: "attr-001",
            summary: "Attribution outlier record attr-001 (entry_timing)",
          },
          {
            ref_type: "research_run",
            ref_id: "demand-val-001",
            summary: "Validated hypothesis card demand-val-001 (p=0.008)",
          },
        ],
        advice_only: true,
        read_only: true,
        execution_authority: "none",
        environment_ceiling: "paper",
        no_order_route_proof: "agora_decision_support_only",
      },
      {
        suggestion_id: "sug:evt-ik-2330:fact:lesson:lesson-endorsed-001",
        fact_id: "fact:lesson:lesson-endorsed-001",
        fact_kind: "endorsed_lesson",
        decision_event_id: "evt-ik-2330",
        servant_persona_id: "agora-servant-7f8a9b0c1d2e3f4a5b6c",
        title: "Endorsed lesson: Cap initial tranche at 50% when foreign futures net short widens",
        suggestion: "Cap initial tranche at 50% when foreign futures net short widens beyond 1.5 sigma",
        summary: "Cap initial tranche at 50% when foreign futures net short widens beyond 1.5 sigma",
        hypothesis: "Cap initial tranche at 50% when foreign futures net short widens beyond 1.5 sigma",
        component: "sizing",
        validation_status: "endorsed",
        source_owner: "memory",
        relevance_score: 0.85,
        relevance_reasons: ["symbol_match", "strategy_match"],
        attribution_record_id: "attr-001",
        validation_result_id: "audit-receipt-lesson-001",
        links: {
          attribution_record: "/api/attribution/records/attr-001",
          validation_result: "/api/memory/trade-lessons/lesson-endorsed-001",
          lesson_record: "/api/memory/trade-lessons/lesson-endorsed-001",
        },
        evidence: {
          lesson_candidate_id: "lesson-endorsed-001",
          review_state: "endorsed",
          confidence: 0.88,
          evidence_refs: [
            {
              ref_type: "evidence_item",
              ref_id: "lesson-endorsed-001",
              summary: "Endorsed trade lesson lesson-endorsed-001",
            },
          ],
        },
        evidence_refs: [
          {
            ref_type: "evidence_item",
            ref_id: "lesson-endorsed-001",
            summary: "Endorsed trade lesson lesson-endorsed-001",
          },
        ],
        advice_only: true,
        read_only: true,
        execution_authority: "none",
        environment_ceiling: "paper",
        no_order_route_proof: "agora_decision_support_only",
      },
      {
        suggestion_id: "sug:evt-ik-2330:fact:strategy:adm-strat-001",
        fact_id: "fact:strategy:adm-strat-001",
        fact_kind: "validated_strategy_fact",
        decision_event_id: "evt-ik-2330",
        servant_persona_id: "agora-servant-7f8a9b0c1d2e3f4a5b6c",
        title: "Validated strategy fact: Semis branch concentration filter passed OOS gate",
        suggestion: "Require top-3 custody branch net-buy persistence >= 3 days before momentum entry",
        summary: "Require top-3 custody branch net-buy persistence >= 3 days before momentum entry",
        hypothesis: "Require top-3 custody branch net-buy persistence >= 3 days before momentum entry",
        component: "selection",
        validation_status: "validated",
        source_owner: "research",
        relevance_score: 0.8,
        relevance_reasons: ["symbol_match", "strategy_match"],
        attribution_record_id: "attr-001",
        validation_result_id: "adm-strat-001",
        links: {
          attribution_record: "/api/attribution/records/attr-001",
          validation_result: "/api/research-orchestrator/alpha-replication/admissions/tenant-a/reg-001",
        },
        evidence: {
          oos_sharpe: 1.42,
          sample_size: 120,
          evidence_refs: [
            {
              ref_type: "experiment_artifact",
              ref_id: "adm-strat-001",
              summary: "Replicated strategy admission adm-strat-001",
            },
          ],
        },
        evidence_refs: [
          {
            ref_type: "experiment_artifact",
            ref_id: "adm-strat-001",
            summary: "Replicated strategy admission adm-strat-001",
          },
        ],
        advice_only: true,
        read_only: true,
        execution_authority: "none",
        environment_ceiling: "paper",
        no_order_route_proof: "agora_decision_support_only",
      },
    ],
  },
  meta: {
    snapshot_at: "2026-11-16T09:06:00Z",
    capability: "agora.trading.v1",
    read_only: true,
    advice_only: true,
    execution_authority: "none",
    environment_ceiling: "paper",
    no_order_route_proof: "agora_decision_support_only",
  },
};

describe("SystemSuggestionsPanel (FE-AGORA-SYSTEM-SUGGESTIONS-20261116)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("renders validated system suggestions with evidence, attribution record link, and validation result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(RECORDED_SUGGESTIONS_RESPONSE));
    globalThis.fetch = fetchMock;

    render(
      <SystemSuggestionsPanel
        baseUrl={BASE}
        decisionEvent={SAMPLE_DECISION_EVENT}
      />,
    );

    await screen.findByTestId("system-suggestions-list");

    const panel = screen.getByTestId("system-suggestions-panel");
    expect(panel).toHaveAttribute("data-advice-only", "true");
    expect(panel).toHaveAttribute("data-execution-authority", "none");
    expect(panel).toHaveAttribute(
      "data-no-order-route-proof",
      "agora_decision_support_only",
    );

    const firstCard = screen.getByTestId(
      "system-suggestion-sug:evt-ik-2330:fact:attr:attr-001:hyp-val-001",
    );
    expect(firstCard.textContent).toContain(
      "Wait 15 minutes after market open on high-IV semiconductor sessions",
    );
    expect(firstCard.textContent).toContain("demand-val-001");
    expect(firstCard.textContent).toContain("attr-001");
    expect(firstCard.textContent).toContain("effect_bps: 18");
    expect(firstCard.textContent).toContain("p_value: 0.008");
    expect(firstCard.textContent).toContain("luck_interval: [0.006, 0.029]");

    const valLink = screen.getByTestId(
      "suggestion-validation-link-sug:evt-ik-2330:fact:attr:attr-001:hyp-val-001",
    );
    expect(valLink.getAttribute("href")).toBe(
      "/api/research/persona-demands?demand_id=demand-val-001",
    );

    const attrLink = screen.getByTestId(
      "suggestion-attribution-link-sug:evt-ik-2330:fact:attr:attr-001:hyp-val-001",
    );
    expect(attrLink.getAttribute("href")).toBe(
      "/api/attribution/records/attr-001",
    );

    expect(
      screen.getByTestId(
        "system-suggestion-sug:evt-ik-2330:fact:lesson:lesson-endorsed-001",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        "system-suggestion-sug:evt-ik-2330:fact:strategy:adm-strat-001",
      ),
    ).toBeInTheDocument();
  });

  it("never renders unvalidated or luck_or_unsupported hypotheses even if injected into BFF payload", async () => {
    const poisonedPayload = {
      ...RECORDED_SUGGESTIONS_RESPONSE,
      data: {
        ...RECORDED_SUGGESTIONS_RESPONSE.data,
        suggestions: [
          ...RECORDED_SUGGESTIONS_RESPONSE.data.suggestions,
          {
            ...RECORDED_SUGGESTIONS_RESPONSE.data.suggestions[0],
            suggestion_id: "sug-unvalidated-hyp-001",
            fact_id: "fact-unvalidated-hyp-001",
            title: "FORBIDDEN UNVALIDATED HYPOTHESIS",
            suggestion: "Unvalidated hypothesis that must never appear",
            validation_status: "pending",
          },
          {
            ...RECORDED_SUGGESTIONS_RESPONSE.data.suggestions[0],
            suggestion_id: "sug-luck-hyp-001",
            fact_id: "fact-luck-hyp-001",
            title: "FORBIDDEN LUCK HYPOTHESIS",
            suggestion: "Luck or unsupported hypothesis that must never appear",
            validation_status: "luck_or_unsupported",
          },
          {
            ...RECORDED_SUGGESTIONS_RESPONSE.data.suggestions[0],
            suggestion_id: "sug-nested-luck-002",
            fact_id: "fact-nested-luck-002",
            title: "FORBIDDEN NESTED LUCK HYPOTHESIS",
            suggestion: "Nested luck_or_unsupported hypothesis that must never appear",
            validation_status: "validated",
            evidence: {
              hypothesis_validation: { status: "luck_or_unsupported" },
              evidence_refs: [{ ref_type: "source_record", ref_id: "attr-luck" }],
            },
          },
          {
            ...RECORDED_SUGGESTIONS_RESPONSE.data.suggestions[0],
            suggestion_id: "sug-proposed-lesson-003",
            fact_id: "fact-proposed-lesson-003",
            title: "FORBIDDEN PROPOSED LESSON",
            suggestion: "Proposed unendorsed lesson that must never appear",
            validation_status: "proposed",
          },
        ],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(poisonedPayload));

    render(
      <SystemSuggestionsPanel
        baseUrl={BASE}
        decisionEvent={SAMPLE_DECISION_EVENT}
      />,
    );

    await screen.findByTestId("system-suggestions-list");

    const panelText = screen.getByTestId("system-suggestions-panel").textContent ?? "";
    expect(panelText).not.toContain("FORBIDDEN UNVALIDATED HYPOTHESIS");
    expect(panelText).not.toContain("FORBIDDEN LUCK HYPOTHESIS");
    expect(panelText).not.toContain("FORBIDDEN NESTED LUCK HYPOTHESIS");
    expect(panelText).not.toContain("FORBIDDEN PROPOSED LESSON");
    expect(screen.queryByTestId("system-suggestion-sug-unvalidated-hyp-001")).toBeNull();
    expect(screen.queryByTestId("system-suggestion-sug-luck-hyp-001")).toBeNull();
    expect(screen.queryByTestId("system-suggestion-sug-nested-luck-002")).toBeNull();
    expect(screen.queryByTestId("system-suggestion-sug-proposed-lesson-003")).toBeNull();
  });

  it("renders explicit empty state when no validated suggestions match", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "ok",
        data: {
          decision_event_id: "evt-ik-2330",
          read_only: true,
          advice_only: true,
          execution_authority: "none",
          environment_ceiling: "paper",
          no_order_route_proof: "agora_decision_support_only",
          suggestions: [],
          items: [],
          count: 0,
        },
      }),
    );

    render(
      <SystemSuggestionsPanel
        baseUrl={BASE}
        decisionEvent={SAMPLE_DECISION_EVENT}
      />,
    );

    const empty = await screen.findByTestId("system-suggestions-empty");
    expect(empty.textContent).toContain(
      "No validated system suggestions match the current decision.",
    );
    expect(empty.textContent).toContain("luck_or_unsupported");
  });

  it("renders explicit unavailable state with owner and reason on BFF 503 outage", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          detail: {
            code: "DEPENDENCY_UNAVAILABLE",
            status: "unavailable",
            owner: "attribution",
            reason: "attribution_owner_unavailable",
            fallback_used: false,
          },
        },
        503,
      ),
    );

    render(
      <SystemSuggestionsPanel
        baseUrl={BASE}
        decisionEvent={SAMPLE_DECISION_EVENT}
      />,
    );

    const unavail = await screen.findByTestId("system-suggestions-unavailable");
    expect(unavail.textContent).toContain("attribution");
    expect(unavail.textContent).toContain("attribution_owner_unavailable");
  });

  it("renders not-found state on 404 decision event", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          detail: {
            code: "NOT_FOUND",
            reason: "decision_event_not_found",
          },
        },
        404,
      ),
    );

    render(
      <SystemSuggestionsPanel
        baseUrl={BASE}
        decisionEventId="evt-missing-999"
      />,
    );

    const nf = await screen.findByTestId("system-suggestions-not-found");
    expect(nf.textContent).toContain("evt-missing-999");
    expect(nf.textContent).toContain("decision_event_not_found");
  });

  it("has no order-placement or capital-changing controls and only performs read-only GETs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(RECORDED_SUGGESTIONS_RESPONSE));
    globalThis.fetch = fetchMock;

    render(
      <SystemSuggestionsPanel
        baseUrl={BASE}
        decisionEvent={SAMPLE_DECISION_EVENT}
      />,
    );

    await screen.findByTestId("system-suggestions-list");

    const panel = screen.getByTestId("system-suggestions-panel");
    const buttons = Array.from(panel.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("data-testid")).toBe(
      "system-suggestions-refresh",
    );

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe("GET");
    }
  });

  it("mounts inside TradingRoomWorkspace and updates suggestions and shadow comparison when a decision row is clicked", async () => {
    const secondEvent: TradingDecisionEvent = {
      ...SAMPLE_DECISION_EVENT,
      decision_event_id: "evt-ik-2454",
      subject: { symbol: "2454.TW", venue: "TWSE" },
    };
    const strategy: TradingRoomStrategyEntry = {
      monitoring_state: "monitoring",
      pending_event_counts: { add: 0, entry: 2, exit: 0, reduce: 0, review: 0 },
      readiness_state: "ready",
      strategy_id: "strat-001",
      strategy_spec_registry_id: "reg-001",
      title: "Taiwan Momentum Alpha",
    };
    const aggregate: TradingRoomAggregate = {
      data_cutoff: "2026-11-16T09:00:00Z",
      position_summaries: [],
      queue_summary: { add: 0, entry: 2, exit: 0, reduce: 0, review: 0 },
      risk_summary: { state: "normal" },
      snapshot_at: "2026-11-16T09:05:00Z",
      spec_version: "1.0",
      strategies: [strategy],
      user_scope_ref: "user-001",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/trading-room/workspace")) {
        return jsonResponse({ error: { code: "RESOURCE_NOT_FOUND" } }, 404);
      }
      if (url.includes("/trading-room/proposals")) {
        return jsonResponse({
          data: {
            strategyId: "strat-001",
            strategyVersion: "reg-001",
            proposalId: "prop-1",
            generatedAt: "2026-11-16T09:05:00Z",
            status: "preview",
            views: [],
            rationale: "Preview",
            dataAvailability: { status: "complete", sources: [] },
            warnings: [],
            personalizationApplied: { status: "not_applied", items: [] },
          },
        });
      }
      if (url.includes("/decision-events/evt-ik-2330/system-suggestions")) {
        return jsonResponse(RECORDED_SUGGESTIONS_RESPONSE);
      }
      if (url.includes("/decision-events/evt-ik-2454/system-suggestions")) {
        return jsonResponse({
          status: "ok",
          data: {
            ...RECORDED_SUGGESTIONS_RESPONSE.data,
            decision_event_id: "evt-ik-2454",
            suggestions: [],
            items: [],
            count: 0,
          },
        });
      }
      if (url.includes("/management/attribution/shadow/evt-ik-2330")) {
        return jsonResponse({
          status: "ok",
          data: {
            decision_id: "evt-ik-2330",
            arms: [
              {
                arm: "trader",
                decision_detail: { available: true, decision: "enter" },
                settlement_source: "pantheon_paper_proxy",
                outcome: { pnl: 0.012 },
                settled_at: "2026-11-16T09:00:00Z",
                unavailable_reason: null,
              },
            ],
          },
        });
      }
      if (url.includes("/management/attribution/shadow/evt-ik-2454")) {
        return jsonResponse({
          status: "ok",
          data: {
            decision_id: "evt-ik-2454",
            arms: [
              {
                arm: "trader",
                decision_detail: { available: true, decision: "defer" },
                settlement_source: "declared_no_trade",
                outcome: { pnl: 0 },
                settled_at: "2026-11-16T09:00:00Z",
                unavailable_reason: null,
              },
            ],
          },
        });
      }
      return jsonResponse({}, 404);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    render(
      <MemoryRouter>
        <TradingRoomWorkspace
          aggregate={aggregate}
          events={[SAMPLE_DECISION_EVENT, secondEvent]}
          eventsEtag="etag-1"
          eventsLoading={false}
          strategy={strategy}
          strategyId="strat-001"
          strategyVersion="reg-001"
        />
      </MemoryRouter>,
    );

    await screen.findByTestId("system-suggestions-list");
    await screen.findByTestId("shadow-comparison-arms");
    expect(screen.getByTestId("shadow-arm-source-trader").textContent).toContain(
      "Paper proxy (not an actual fill)",
    );

    fireEvent.click(screen.getByTestId("event-row-evt-ik-2454"));
    await screen.findByTestId("system-suggestions-empty");
    await waitFor(() =>
      expect(screen.getByTestId("shadow-arm-source-trader").textContent).toContain(
        "Declared no trade",
      ),
    );
  });
});
