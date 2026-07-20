// Regression: a real backend error (e.g. a 404 on a capital-pool detail read) must NOT flip the
// whole console to offline/fallback. Previously strictLiveRead reported a transport fallback on any
// error, so clicking a pool whose detail endpoint 404s took liveStatus offline, which then cascaded
// every other live read to mock seed via withLiveOrMock's offline path.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bff, liveStatus, BffError } from "@/lib/bff-v1";

describe("strictLiveRead — real backend errors do not take the app offline", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // strictLiveRead only runs when isLiveBffModeConfigured() is true, which is force-disabled
    // under MODE/NODE_ENV === "test"; stub them so the live detail path is exercised.
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITE_BFF_MODE", "live");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://example.test" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("a 404 detail read propagates as BffError but keeps liveStatus online (no fallback)", async () => {
    const envelope = { error: { code: "RESOURCE_NOT_FOUND", message: "Capital pool not found" } };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope), { status: 404, headers: { "Content-Type": "application/json" } }),
    );
    await expect(bff.capitalPools.get("pool-crypto-paper")).rejects.toBeInstanceOf(BffError);
    // The whole console must not go offline just because one pool's detail 404s.
    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
  });

  it("a 5xx detail read IS a transport failure and does report a fallback", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
    await expect(bff.capitalPools.get("pool-x")).rejects.toBeInstanceOf(BffError);
    expect(liveStatus.get().effective).toBe("mock");
  });
});
