import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { strictLiveRead } from "@/lib/bff-v1/domainReads";
import { BffError, makeBffError } from "@/lib/bff-v1";

describe("BFF live transport — strictLiveRead behavior", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://example.test" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("network error → reports fallback error and throws BffError", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      strictLiveRead("test.network", { method: "GET", path: "/bff/strategies" }),
    ).rejects.toBeInstanceOf(BffError);
    expect(liveStatus.get().effective).toBe("mock");
    expect(liveStatus.get().lastError).toMatch(/ECONNREFUSED/);
  });

  it("5xx → reports fallback error (transport-class failure)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("oops", { status: 503 }),
    );
    await expect(
      strictLiveRead("test.503", { method: "GET", path: "/bff/strategies" }),
    ).rejects.toBeInstanceOf(BffError);
    expect(liveStatus.get().effective).toBe("mock");
  });

  it("4xx BffError envelope is propagated, NOT treated as transport failure", async () => {
    const err = makeBffError({ code: "VALIDATION_FAILED", message: "bad" });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(err.envelope), { status: 400, headers: { "Content-Type": "application/json" } }),
    );
    await expect(
      strictLiveRead("test.400", { method: "GET", path: "/bff/strategies" }),
    ).rejects.toBeInstanceOf(BffError);
    // Did NOT fall back to mock.
    expect(liveStatus.get().effective).toBe("live");
  });

  it("2xx success → reportSuccess clears any prior fallback flag", async () => {
    liveStatus.reportFallback("prior");
    expect(liveStatus.get().effective).toBe("mock");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    // Manual retry to re-attempt live.
    liveStatus.retry();
    const out = await strictLiveRead<{ ok: boolean }>(
      "test.success",
      { method: "GET", path: "/bff/strategies" },
    );
    expect(out.ok).toBe(true);
    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
  });
});
