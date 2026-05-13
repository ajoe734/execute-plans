import { afterEach, describe, expect, it, vi } from "vitest";

import { getLiveStatusSnapshot } from "@/lib/bff/liveTransport";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

function stubLiveEnv(fallback: "auto" | "strict" = "auto") {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", fallback);
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
}

describe("BFF live transport snapshot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("reports healthy strict live as real without seed fallback", () => {
    stubLiveEnv("strict");

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("real");
    expect(snap.usingSeed).toBe(false);
    expect(snap.seedFallbackArmed).toBe(false);
    expect(snap.typedError).toBe(false);
  });

  it("reports hybrid live as seed fallback armed without claiming seed is active", () => {
    stubLiveEnv("auto");

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("hybrid");
    expect(snap.usingSeed).toBe(false);
    expect(snap.seedFallbackArmed).toBe(true);
    expect(snap.typedError).toBe(false);
  });

  it("reports hybrid transport fallback as active seed source", () => {
    stubLiveEnv("auto");
    liveStatus.reportFallback("ECONNREFUSED");

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("mock-fallback");
    expect(snap.usingSeed).toBe(true);
    expect(snap.seedFallbackArmed).toBe(true);
    expect(snap.fellBack).toBe(true);
  });

  it("reports strict transport failure as typed-error, not seed fallback", () => {
    stubLiveEnv("strict");
    liveStatus.reportFallback("strict: ECONNREFUSED");

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("real-error");
    expect(snap.usingSeed).toBe(false);
    expect(snap.seedFallbackArmed).toBe(false);
    expect(snap.typedError).toBe(true);
    expect(snap.fellBack).toBe(false);
  });
});
