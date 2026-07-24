import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BffError } from "../errors";
import {
  actOnPerformanceSuggestion,
  getStrategyPerformance,
  type AdjustmentSuggestion,
  type PerformanceProjectionEnvelope,
  type SuggestionActionEnvelope,
} from "./performance";

const writeGateMocks = vi.hoisted(() => ({ liveWriteGated: vi.fn() }));

vi.mock("../writeGate", () => ({ liveWriteGated: writeGateMocks.liveWriteGated }));

function suggestion(overrides: Partial<AdjustmentSuggestion> = {}): AdjustmentSuggestion {
  return {
    suggestion_id: "suggestion-1",
    strategy_id: "strategy/alpha",
    period: "latest",
    status: "proposed",
    version: 1,
    title: "Review threshold",
    rationale: "Persisted rationale",
    expected_effect: { drawdown_delta: -0.01 },
    expected_risk: { turnover_delta: 0.02 },
    provenance: {
      source_id: "servant-run-1",
      source_type: "servant_analysis",
      produced_at: "2026-07-22T12:00:00Z",
      source_version: "v4",
      evidence_refs: ["sensitive://not-for-display"],
    },
    as_of: "2026-07-22T12:00:00Z",
    updated_at: null,
    no_order_route_proof: "agora_suggestion_state_only",
    ...overrides,
  };
}

function projection(): PerformanceProjectionEnvelope {
  const available = {
    status: "available" as const,
    as_of: "2026-07-22T12:00:00Z",
    source_ids: ["performance-projector"],
    reason: null,
  };
  return {
    data: {
      strategy_id: "strategy/alpha",
      period: "latest",
      environment: "paper",
      availability: "available",
      freshness: {
        status: "available",
        snapshot_at: "2026-07-22T12:01:00Z",
        as_of: "2026-07-22T12:00:00Z",
        source_watermarks: { performance_projector: "2026-07-22T12:00:00Z" },
        projection_revision: 5,
        projection_generation: 11,
        unavailable_sources: [],
      },
      compliance: { availability: available, metrics: [] },
      interventions: { availability: available, aggregate: { total: 0, by_status: {} }, items: [] },
      execution_history: { availability: available, items: [] },
      warnings: { availability: available, items: [] },
      adjustment_suggestions: { availability: available, items: [suggestion()] },
      no_order_route_proof: "agora_performance_read_only",
    },
    meta: { capability: "agora.performance.truth.v1" },
  };
}

function actionEnvelope(overrides: Partial<SuggestionActionEnvelope["data"]> = {}): SuggestionActionEnvelope {
  const readback = suggestion({ status: "applied", version: 2, updated_at: "2026-07-22T12:02:00Z" });
  return {
    data: {
      receipt_id: "receipt-1",
      audit_event_id: "audit-1",
      suggestion_id: readback.suggestion_id,
      strategy_id: readback.strategy_id,
      action: "apply",
      previous_status: "proposed",
      status: "applied",
      previous_version: 1,
      version: 2,
      actor_id: "operator-1",
      reason: null,
      recorded_at: "2026-07-22T12:02:00Z",
      authoritative_readback: readback,
      idempotent_replay: false,
      execution_authority: "none",
      no_order_route_proof: "agora_suggestion_state_only",
      ...overrides,
    },
    meta: { authoritative_store: "agora_performance_sqlite" },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test/");
  writeGateMocks.liveWriteGated.mockReset();
  writeGateMocks.liveWriteGated.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Strategy Performance truth client", () => {
  it("reads the exact strategy, period, and paper environment with no mock fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(projection()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStrategyPerformance("strategy/alpha")).resolves.toEqual(projection());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bff.example.test/bff/agora/trading-room/strategies/strategy%2Falpha/performance?period=latest&environment=paper");
    expect(request.credentials).toBe("include");
    expect(request.method).toBe("GET");
  });

  it("fails closed when the projection crosses its strategy binding or execution proof", async () => {
    const malformed = projection();
    malformed.data.strategy_id = "strategy-other";
    malformed.data.no_order_route_proof = "agora_order_route" as "agora_performance_read_only";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(malformed)));

    await expect(getStrategyPerformance("strategy/alpha")).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
      status: 503,
    });
  });

  it("does not submit when deployment or session write policy is closed", async () => {
    writeGateMocks.liveWriteGated.mockResolvedValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(actOnPerformanceSuggestion({
      strategyId: "strategy/alpha",
      suggestionId: "suggestion-1",
      action: "apply",
      expectedVersion: 1,
      idempotencyKey: "agperf-action-1",
    })).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports success only after an independently fetched receipt readback matches", async () => {
    const posted = actionEnvelope();
    const readback = actionEnvelope();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(posted))
      .mockResolvedValueOnce(jsonResponse(readback));
    vi.stubGlobal("fetch", fetchMock);

    await expect(actOnPerformanceSuggestion({
      strategyId: "strategy/alpha",
      suggestionId: "suggestion-1",
      action: "apply",
      expectedVersion: 1,
      idempotencyKey: "agperf-action-1",
    })).resolves.toEqual(readback);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [postUrl, postRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toContain("/strategies/strategy%2Falpha/performance/suggestions/suggestion-1/actions");
    expect(postRequest.method).toBe("POST");
    expect(postRequest.headers).toMatchObject({ "Idempotency-Key": "agperf-action-1" });
    expect(JSON.parse(String(postRequest.body))).toEqual({
      action: "apply",
      expected_version: 1,
      reason: null,
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://bff.example.test/bff/agora/performance/action-receipts/receipt-1");
  });

  it("does not claim success when receipt readback is missing or mismatched", async () => {
    const mismatched = actionEnvelope({ audit_event_id: "audit-other" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(actionEnvelope()))
      .mockResolvedValueOnce(jsonResponse(mismatched)));

    await expect(actOnPerformanceSuggestion({
      strategyId: "strategy/alpha",
      suggestionId: "suggestion-1",
      action: "apply",
      expectedVersion: 1,
      idempotencyKey: "agperf-action-1",
    })).rejects.toMatchObject({ code: "BACKEND_UNAVAILABLE", status: 503 });
  });

  it("keeps request conflicts typed and skips receipt readback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: "suggestion version conflict" }, 409));
    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await actOnPerformanceSuggestion({
        strategyId: "strategy/alpha",
        suggestionId: "suggestion-1",
        action: "reject",
        expectedVersion: 1,
        idempotencyKey: "agperf-action-2",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BffError);
    expect(caught).toMatchObject({ code: "STATE_CONFLICT", status: 409 });
    expect((caught as Error).message).toContain("version conflict");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
