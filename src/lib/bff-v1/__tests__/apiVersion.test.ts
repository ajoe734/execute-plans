import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { liveStatus, BFF_API_VERSION, bffFetch } from "@/lib/bff-v1";

describe("H1+ X-BFF-Api-Version mismatch detection", () => {
  const realFetch = globalThis.fetch;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://x.test" });
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    warnSpy.mockRestore();
    liveStatus._reset();
  });

  it("matching version → no mismatch flag, no warn", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-BFF-Api-Version": BFF_API_VERSION },
      }),
    );
    await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" });
    expect(liveStatus.get().serverApiVersion).toBe(BFF_API_VERSION);
    expect(liveStatus.get().apiVersionMismatch).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("mismatch → flag set + console.warn fired once on rising edge", async () => {
    const make = () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-BFF-Api-Version": "9999-12-31" },
      });
    globalThis.fetch = vi.fn().mockImplementation(async () => make());
    await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" });
    await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" });
    expect(liveStatus.get().apiVersionMismatch).toBe(true);
    expect(liveStatus.get().serverApiVersion).toBe("9999-12-31");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("absent header → no change", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" });
    expect(liveStatus.get().serverApiVersion).toBeUndefined();
    expect(liveStatus.get().apiVersionMismatch).toBeUndefined();
  });
});
