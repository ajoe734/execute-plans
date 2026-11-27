import { afterEach, describe, expect, it, vi } from "vitest";
import { getTradingIntent, submitTradingIntentHandoff, tradingIntentProgress, withdrawTradingIntent, type IntentStage, type TradingIntentDetail } from "./tradingIntents";

const intent = { intent_id: "intent/1", strategy_id: "strategy-1", strategy_spec_registry_id: "registry-1" };
const options = { ifMatch: '"event-v2"', idempotencyKey: "idem-1", requestId: "request-1" };
const detail = { data: intent, status: "draft", lifecycle_state: "draft",
  allowedActions: { submit_handoff: true, withdraw: true },
  handoffs: [{ handoff_id: "h1", requested_stage: "shadow", state: "submitted" }] };
function mockFetch(body: unknown = detail, status = 200) {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe("governed trading intent client", () => {
  it("reads full lifecycle envelope and handoffs through the escaped intent endpoint", async () => {
    const fetchMock = mockFetch();
    expect(await getTradingIntent(intent.intent_id)).toEqual(detail);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/bff\/agora\/trading-intents\/intent%2F1$/);
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("include");
    expect(request.headers["If-Match"]).toBeUndefined();
  });
  it.each(["shadow", "paper"] as const)("creates only a governed %s handoff", async (stage) => {
    const fetchMock = mockFetch({ status: "queued" }, 202);
    await submitTradingIntentHandoff(intent, stage, "user-1", options);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/bff\/agora\/trading-intents\/intent%2F1\/handoffs$/);
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ "If-Match": '"event-v2"', "Idempotency-Key": "idem-1", "X-Request-Id": "request-1" });
    expect(JSON.parse(request.body)).toEqual({ ...intent, spec_version: "1.0", handoff_id: expect.any(String),
      created_at: expect.any(String), requested_by: { actor_type: "trader", actor_ref: "user-1" },
      requested_stage: stage, handoff_type: stage === "shadow" ? "shadow_start" : "paper_validation_request",
      state: "submitted", no_order_route_proof: "agora_request_only_no_order_route" });
    expect(Number.isNaN(Date.parse(JSON.parse(request.body).created_at))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["canary", "live"])("rejects %s before any request", (stage) => {
    const fetchMock = mockFetch();
    expect(() => submitTradingIntentHandoff(intent, stage as IntentStage, "user-1", options)).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("withdraws via only the intent endpoint with required headers", async () => {
    const fetchMock = mockFetch({ status: "completed" });
    await withdrawTradingIntent(intent.intent_id, options);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/bff\/agora\/trading-intents\/intent%2F1\/withdraw$/);
    expect(request.method).toBe("POST");
    expect(request.headers["If-Match"]).toBe('"event-v2"');
    expect(request.body).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects missing mutation metadata before transport", () => {
    const fetchMock = mockFetch();
    expect(() => withdrawTradingIntent(intent.intent_id, { ...options, ifMatch: "" })).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([403, 404, 409, 412, 422, 503])("preserves HTTP %s failures without fallback", async (status) => {
    mockFetch({ error: { code: "STATE_CONFLICT", message: "intent unavailable" } }, status);
    await expect(getTradingIntent(intent.intent_id)).rejects.toMatchObject({ status });
    await expect(withdrawTradingIntent(intent.intent_id, options)).rejects.toMatchObject({ status });
  });
  it.each([{}, { ...detail, data: { ...intent, intent_id: "foreign" } }, { ...detail, allowedActions: {} }])(
    "fails closed on malformed or mismatched detail", async (body) => {
      mockFetch(body);
      await expect(getTradingIntent(intent.intent_id)).rejects.toThrow();
    },
  );
});

describe("governed trading intent progress (read-only)", () => {
  const base: TradingIntentDetail = { ...detail, handoffs: [] };
  it("reports created only for a fresh draft and no paper-fill field", () => {
    const progress = tradingIntentProgress(base);
    expect(progress.steps.filter((s) => s.reached).map((s) => s.step)).toEqual(["created"]);
    expect(progress.paperFillsReported).toBe(false);
    expect(progress.paperFills).toEqual([]);
    expect(progress.terminal).toBeNull();
  });
  it("advances through accepted paper handoff and shows owner-reported paper fills", () => {
    const progress = tradingIntentProgress({
      ...base,
      lifecycle_state: "submitted",
      handoffs: [{
        handoff_id: "h-paper", requested_stage: "paper", state: "accepted",
        paper_fills: [
          { fill_id: "pf-1", symbol: "2330.TW", side: "buy", quantity: 1000, price: 912.5, filled_at: "2026-11-27T02:00:00Z" },
          { fill_id: "pf-1", symbol: "2330.TW" },
          { fill_id: "live-1", execution_venue: "live_broker" },
          { symbol: "no-id" },
        ],
      }],
    });
    expect(progress.steps.every((s) => s.reached)).toBe(true);
    expect(progress.paperFillsReported).toBe(true);
    expect(progress.paperFills).toEqual([{
      fill_id: "pf-1", symbol: "2330.TW", side: "buy", quantity: 1000, price: 912.5,
      filled_at: "2026-11-27T02:00:00Z", handoff_id: "h-paper",
    }]);
  });
  it("marks an empty owner-reported fill list as reported with no fills", () => {
    const progress = tradingIntentProgress({ ...base, data: { ...intent, paper_fills: [] } });
    expect(progress.paperFillsReported).toBe(true);
    expect(progress.paperFills).toEqual([]);
    expect(progress.steps.find((s) => s.step === "paper_filled")?.reached).toBe(false);
  });
  it("surfaces withdrawn and rejected as terminal states", () => {
    expect(tradingIntentProgress({ ...base, lifecycle_state: "withdrawn" }).terminal).toBe("withdrawn");
    expect(tradingIntentProgress({ ...base, lifecycle_state: "rejected" }).terminal).toBe("rejected");
  });
});

