import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("../client", () => ({ bffFetch: fetchMock }));

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

it("deduplicates revisioned invalidations and marks disconnect stale", () => {
  class MockEventSource {
    static instance: MockEventSource;
    onopen: (() => void) | null = null; onerror: (() => void) | null = null;
    listeners: Record<string, (event: MessageEvent) => void> = {};
    constructor(public url: string) { MockEventSource.instance = this; }
    addEventListener(name: string, listener: EventListener) { this.listeners[name] = listener as (event: MessageEvent) => void; }
    close = vi.fn();
  }
  vi.stubGlobal("EventSource", MockEventSource);
  const invalidate = vi.fn(), state = vi.fn();
  const subscription = subscribeTradeJourneys({ tenant_id: "tenant-a", environment: "paper" }, { onInvalidate: invalidate, onState: state });
  const source = MockEventSource.instance;
  expect(source.url).toContain("tenant_id=tenant-a");
  source.onopen?.();
  const emit = (revision: number, gap = false) => source.listeners.journeys_changed({ data: JSON.stringify({ revision, gap, snapshot_refetch: true }), lastEventId: String(revision) } as MessageEvent);
  emit(4); emit(4); emit(3); emit(6, true);
  expect(invalidate).toHaveBeenCalledTimes(2);
  source.onerror?.();
  expect(state).toHaveBeenLastCalledWith("stale");
  subscription.close();
  expect(source.close).toHaveBeenCalled();
  vi.unstubAllGlobals();
});
