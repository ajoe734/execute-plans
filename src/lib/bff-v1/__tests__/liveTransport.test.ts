import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { withLiveOrMock } from "@/lib/bff-v1/liveTransport";
import { BffError, makeBffError } from "@/lib/bff-v1";

describe("BFF live transport — fallback to mock on failure", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // These cases exercise the auto (mock-fallback) path explicitly; the product default is
    // now strict (VITE_BFF_FALLBACK=strict in .env), so pin auto here rather than rely on it.
    vi.stubEnv("VITE_BFF_FALLBACK", "auto");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://example.test" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("network error → falls back to mock + reports error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const out = await withLiveOrMock(
      { method: "GET", path: "/bff/strategies" },
      async () => ({ items: ["mock"] }),
    );
    expect(out).toEqual({ items: ["mock"] });
    expect(liveStatus.get().effective).toBe("mock");
    expect(liveStatus.get().lastError).toMatch(/ECONNREFUSED/);
  });

  it("5xx → fallback (transport-class failure)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("oops", { status: 503 }),
    );
    const out = await withLiveOrMock(
      { method: "GET", path: "/bff/strategies" },
      async () => "fallback",
    );
    expect(out).toBe("fallback");
    expect(liveStatus.get().effective).toBe("mock");
  });

  it("4xx BffError envelope is propagated, NOT treated as transport failure", async () => {
    const err = makeBffError({ code: "VALIDATION_FAILED", message: "bad" });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(err.envelope), { status: 400, headers: { "Content-Type": "application/json" } }),
    );
    await expect(
      withLiveOrMock({ method: "GET", path: "/bff/strategies" }, async () => "x"),
    ).rejects.toBeInstanceOf(BffError);
    // Did NOT fall back.
    expect(liveStatus.get().effective).toBe("live");
  });

  it("2xx success → reportSuccess clears any prior fallback flag", async () => {
    liveStatus.reportFallback("prior");
    expect(liveStatus.get().effective).toBe("mock");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    // Manual retry to re-attempt live.
    liveStatus.retry();
    const out = await withLiveOrMock<{ ok: boolean }>(
      { method: "GET", path: "/bff/strategies" },
      async () => ({ ok: false }),
    );
    expect(out.ok).toBe(true);
    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
  });

  it("mock mode: never touches fetch", async () => {
    liveStatus._reset({ mode: "mock", effective: "mock" });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const out = await withLiveOrMock(
      { method: "GET", path: "/bff/x" },
      async () => "mock-only",
    );
    expect(out).toBe("mock-only");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
