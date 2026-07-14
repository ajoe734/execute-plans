import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("../client", () => ({ bffFetch: fetchMock, detectBaseUrl: () => "https://bff.example", bffV1: { detectMode: () => "live" } }));

import { getTradeJourney, getTradeJourneyEvidence, getTradeJourneyTimeline, listTradeJourneys, resolveTradeJourney, subscribeTradeJourneys } from "../tradeJourneys";

describe("canonical Trade Journey client", () => {
  beforeEach(() => fetchMock.mockReset().mockResolvedValue({ data: {}, meta: {} }));

  it("uses server list pagination and filtering without domain joins", async () => {
    await listTradeJourneys({ tenant_id: "tenant-a", environment: "paper", page_token: "25", page_size: 25, attention: "recon_mismatch" });
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", path: "/bff/management/trade-journeys", query: expect.objectContaining({ page_token: "25", attention: "recon_mismatch" }) }));
  });

  it("encodes journey IDs at every detail boundary", async () => {
    const query = { tenant_id: "tenant-a", environment: "paper" };
    await getTradeJourney("journey/a", query);
    await getTradeJourneyTimeline("journey/a", query);
    await getTradeJourneyEvidence("journey/a", query);
    expect(fetchMock.mock.calls.map(([arg]) => arg.path)).toEqual([
      "/bff/management/trade-journeys/journey%2Fa",
      "/bff/management/trade-journeys/journey%2Fa/timeline",
      "/bff/management/trade-journeys/journey%2Fa/evidence",
    ]);
  });

  it("resolves arbitrary identifiers through the ambiguity-aware canonical endpoint", async () => {
    await resolveTradeJourney({ q: "broker-order-1", tenant_id: "tenant-a", environment: "paper" });
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ path: "/bff/management/trade-journeys/resolve", query: { q: "broker-order-1", tenant_id: "tenant-a", environment: "paper" } }));
  });
});

it("polls the authenticated cursor endpoint, dedupes revisions, and marks failures stale", async () => {
  vi.useFakeTimers();
  const sse = (id: number, event: string, payload: Record<string, unknown>) =>
    ({ ok: true, text: () => Promise.resolve(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`) });
  const responses = [
    sse(4, "journeys_changed", { revision: 4, gap: false, snapshot_refetch: true }),
    sse(4, "journeys_changed", { revision: 4, gap: false, snapshot_refetch: true }),
    sse(3, "journeys_changed", { revision: 3, gap: false, snapshot_refetch: true }),
    sse(6, "snapshot_refetch_required", { revision: 6, gap: true, snapshot_refetch: true }),
  ];
  const fetchSpy = vi.fn(() => responses.length ? Promise.resolve(responses.shift()) : Promise.reject(new Error("down")));
  vi.stubGlobal("fetch", fetchSpy);
  const invalidate = vi.fn(), state = vi.fn();
  const subscription = subscribeTradeJourneys({ tenant_id: "tenant-a", environment: "paper" }, { onInvalidate: invalidate, onState: state });
  expect(state).toHaveBeenCalledWith("connecting");
  while (responses.length) await vi.advanceTimersByTimeAsync(15_000);
  // 4 scripted frames: revision 4 invalidates once (repeat + lower revision 3
  // deduped), gap revision 6 invalidates again.
  expect(invalidate).toHaveBeenCalledTimes(2);
  expect(state).toHaveBeenLastCalledWith("live");
  const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain("https://bff.example/bff/management/trade-journeys/events?");
  expect(url).toContain("tenant_id=tenant-a");
  expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
  // Cursor resume: once revision 4 was seen, subsequent polls carry it.
  const headerSets = fetchSpy.mock.calls.map(call => (call as unknown as [string, RequestInit])[1].headers as Record<string, string>);
  expect(headerSets.some(h => h["Last-Event-ID"] === "4")).toBe(true);
  await vi.advanceTimersByTimeAsync(15_000); // transport failure -> stale
  expect(state).toHaveBeenLastCalledWith("stale");
  const calls = fetchSpy.mock.calls.length;
  subscription.close();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchSpy.mock.calls.length).toBe(calls); // closed -> no further polls
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
