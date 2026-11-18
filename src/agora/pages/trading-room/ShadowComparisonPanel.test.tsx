import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { ShadowComparisonPanel } from "./ShadowComparisonPanel";
import type { TradingDecisionEvent } from "@/lib/bff-v1/agora/tradingRoom";

const BASE = "https://test.example";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SAMPLE_EVENTS: TradingDecisionEvent[] = [
  {
    confidence: { basis: "model", calibration_state: "calibrated", value: 0.82 },
    decision_event_id: "dec-1",
    event_kind: "entry",
    evidence_refs: [],
    expected_value: {
      cost: 0.001,
      downside: -0.015,
      gross: 0.03,
      horizon: "5d",
      net: 0.029,
      unit: "pct_return",
    },
    invalidation: { conditions: [], current_state: "valid" },
    no_order_route_proof: "agora_decision_support_only",
    origin: "strategy_signal",
    probability: { horizon: "5d", target_outcome: "up", value: 0.62 },
    rationale: [{ claim: "Signal", confidence: 0.82 }],
    risk_notes: [],
    spec_version: "1.0",
    state: "decided",
    strategy_id: "strat-001",
    strategy_spec_registry_id: "reg-001",
    subject: { symbol: "2330.TW" },
    suggested_action: "enter",
    triggered_at: "2026-11-11T00:00:00Z",
  },
  {
    confidence: { basis: "model", calibration_state: "calibrated", value: 0.74 },
    decision_event_id: "dec-2",
    event_kind: "reduce",
    evidence_refs: [],
    expected_value: {
      cost: 0.001,
      downside: -0.01,
      gross: 0.018,
      horizon: "3d",
      net: 0.017,
      unit: "pct_return",
    },
    invalidation: { conditions: [], current_state: "valid" },
    no_order_route_proof: "agora_decision_support_only",
    origin: "risk_rule",
    probability: { horizon: "3d", target_outcome: "reduce_risk", value: 0.58 },
    rationale: [{ claim: "Trim risk", confidence: 0.74 }],
    risk_notes: [],
    spec_version: "1.0",
    state: "decided",
    strategy_id: "strat-001",
    strategy_spec_registry_id: "reg-001",
    subject: { symbol: "2454.TW" },
    suggested_action: "reduce",
    triggered_at: "2026-11-11T01:00:00Z",
  },
];

// Recorded BFF response shape from BFF-ATTRIBUTION-VIEWS-20261116 (GET /bff/management/attribution/shadow/:decision_id)
const RECORDED_SHADOW_RESPONSE = {
  status: "ok",
  owner: "attribution+agora",
  data: {
    decision_id: "dec-1",
    account_id: "acct-alice-01",
    arms: [
      {
        arm: "trader",
        decision_detail: {
          available: true,
          decision: "enter",
          trading_room_verdict: "approve",
          execution_observation_kind: "pantheon_paper_proxy",
          execution_display_label: "交易員決策（紙上代理）",
          execution_verified: false,
          decision_time: "2026-11-11T00:00:00Z",
        },
        settlement_source: "pantheon_paper_proxy",
        outcome: { pnl: -0.01 },
        settled_at: "2026-11-12T00:00:00Z",
        unavailable_reason: null,
      },
      {
        arm: "base_strategy",
        decision_detail: {
          available: true,
          strategy_id: "strat-001",
          suggested_action: "enter",
        },
        settlement_source: "market_data_replay",
        outcome: { pnl: 0.01 },
        settled_at: "2026-11-12T00:00:00Z",
        unavailable_reason: null,
      },
      {
        arm: "private_servant",
        decision_detail: {
          available: false,
          unavailable_reason: "no_servant_suggestion_on_decision_event",
        },
        settlement_source: null,
        outcome: null,
        settled_at: null,
        unavailable_reason: "no_suggestion",
      },
      {
        arm: "institutional_view",
        decision_detail: {
          available: true,
          suggested_action: "hold",
        },
        settlement_source: "market_data_replay",
        outcome: { pnl: 0.02 },
        settled_at: "2026-11-12T00:00:00Z",
        unavailable_reason: null,
      },
    ],
  },
  meta: {
    snapshot_at: "2026-11-12T01:00:00Z",
    sources: {
      attribution: "ok",
      agora: "ok",
    },
  },
};

describe("ShadowComparisonPanel (FE-AGORA-SYSTEM-SUGGESTIONS-20261116)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("renders all four arms with settlement source labels and never shows paper proxy as an actual fill", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(RECORDED_SHADOW_RESPONSE));

    render(
      <ShadowComparisonPanel
        baseUrl={BASE}
        decisionEvents={SAMPLE_EVENTS}
        decisionId="dec-1"
      />,
    );

    await screen.findByTestId("shadow-comparison-arms");

    const traderArm = screen.getByTestId("shadow-arm-trader");
    expect(traderArm).toHaveAttribute("data-settlement-kind", "paper_proxy");
    expect(traderArm).toHaveAttribute("data-actual-fill", "false");
    const traderSource = screen.getByTestId("shadow-arm-source-trader");
    expect(traderSource.textContent).toContain("Paper proxy (not an actual fill)");
    expect(traderSource.textContent).toContain("pantheon_paper_proxy");
    expect(traderSource.textContent).not.toContain("Actual fill (verified)");
    expect(traderArm.textContent).toContain('{"pnl":-0.01}');

    const baseArm = screen.getByTestId("shadow-arm-base_strategy");
    expect(baseArm).toHaveAttribute("data-settlement-kind", "market_data_replay");
    expect(baseArm).toHaveAttribute("data-actual-fill", "false");
    expect(screen.getByTestId("shadow-arm-source-base_strategy").textContent).toContain(
      "Market data replay (not an actual fill)",
    );

    const servantArm = screen.getByTestId("shadow-arm-private_servant");
    expect(servantArm).toHaveAttribute("data-settlement-kind", "unsettled");
    expect(servantArm).toHaveAttribute("data-actual-fill", "false");
    expect(screen.getByTestId("shadow-arm-source-private_servant").textContent).toContain(
      "Settlement source unknown / unsettled",
    );
    expect(servantArm.textContent).toContain("no_suggestion");

    const instArm = screen.getByTestId("shadow-arm-institutional_view");
    expect(instArm).toHaveAttribute("data-settlement-kind", "market_data_replay");
    expect(instArm).toHaveAttribute("data-actual-fill", "false");
    expect(instArm.textContent).toContain('{"pnl":0.02}');
  });

  it("sanitizes any false actual-fill label if settlement source or observation kind is paper proxy", async () => {
    const poisonedShadow = {
      ...RECORDED_SHADOW_RESPONSE,
      data: {
        ...RECORDED_SHADOW_RESPONSE.data,
        arms: [
          {
            arm: "trader",
            decision_detail: {
              available: true,
              decision: "enter",
              execution_observation_kind: "pantheon_paper_proxy",
              execution_display_label: "實際成交",
              execution_verified: false,
            },
            settlement_source: "pantheon_paper_proxy",
            outcome: { pnl: 0.015 },
            settled_at: "2026-11-12T00:00:00Z",
            unavailable_reason: null,
          },
          ...RECORDED_SHADOW_RESPONSE.data.arms.slice(1),
        ],
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(poisonedShadow));

    render(<ShadowComparisonPanel baseUrl={BASE} decisionId="dec-1" />);

    await screen.findByTestId("shadow-comparison-arms");
    const traderArm = screen.getByTestId("shadow-arm-trader");
    expect(traderArm).toHaveAttribute("data-settlement-kind", "paper_proxy");
    expect(traderArm).toHaveAttribute("data-actual-fill", "false");
    expect(traderArm.textContent).not.toContain("實際成交");
    expect(traderArm.textContent).toContain("交易員決策（紙上代理）");
  });

  it("renders degraded status banner when one upstream owner is degraded", async () => {
    const degradedResponse = {
      ...RECORDED_SHADOW_RESPONSE,
      status: "degraded",
      meta: {
        snapshot_at: "2026-11-12T01:00:00Z",
        sources: {
          attribution: "attribution_owner_unavailable",
          agora: "ok",
        },
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(degradedResponse));

    render(<ShadowComparisonPanel baseUrl={BASE} decisionId="dec-1" />);

    const banner = await screen.findByTestId("shadow-comparison-degraded");
    expect(banner.textContent).toContain(
      "attribution=attribution_owner_unavailable",
    );
  });

  it("renders explicit empty state when no decision ID is provided", () => {
    render(<ShadowComparisonPanel baseUrl={BASE} decisionEvents={[]} decisionId={null} />);
    expect(screen.getByTestId("shadow-comparison-empty")).toBeInTheDocument();
  });

  it("renders not-found state when a decision is unknown or belongs to another trader (404)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "RESOURCE_NOT_FOUND",
            details: { reason: "decision_not_found" },
          },
        },
        404,
      ),
    );

    render(<ShadowComparisonPanel baseUrl={BASE} decisionId="dec-foreign-99" />);

    const nf = await screen.findByTestId("shadow-comparison-not-found");
    expect(nf.textContent).toContain("dec-foreign-99");
    expect(nf.textContent).toContain("decision_not_found");
  });

  it("renders unavailable state with reason when shadow comparison service is down", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          status: "unavailable",
          reason: "attribution_owner_unconfigured",
        },
        200,
      ),
    );

    render(<ShadowComparisonPanel baseUrl={BASE} decisionId="dec-1" />);

    const unavail = await screen.findByTestId("shadow-comparison-unavailable");
    expect(unavail.textContent).toContain("attribution_owner_unconfigured");
  });

  it("switches decision comparisons via read-only GET and exposes no order or capital controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(RECORDED_SHADOW_RESPONSE));
    globalThis.fetch = fetchMock;

    render(
      <ShadowComparisonPanel
        baseUrl={BASE}
        decisionEvents={SAMPLE_EVENTS}
        decisionId="dec-1"
      />,
    );

    await screen.findByTestId("shadow-comparison-arms");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/bff/management/attribution/shadow/dec-1`,
    );

    fireEvent.click(screen.getByTestId("shadow-select-dec-2"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${BASE}/bff/management/attribution/shadow/dec-2`,
    );

    fireEvent.change(screen.getByTestId("shadow-decision-input"), {
      target: { value: "dec-custom-3" },
    });
    fireEvent.click(screen.getByTestId("shadow-decision-load"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe(
      `${BASE}/bff/management/attribution/shadow/dec-custom-3`,
    );

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe("GET");
    }
  });
});
