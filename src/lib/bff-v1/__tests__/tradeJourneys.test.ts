import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("../client", () => ({ bffFetch: fetchMock }));

import { getTradeJourney, getTradeJourneyEvidence, getTradeJourneyTimeline, listTradeJourneys, resolveTradeJourney } from "../tradeJourneys";

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
