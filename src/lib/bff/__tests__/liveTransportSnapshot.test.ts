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
    delete (window as unknown as Record<string, unknown>).__PANTHEON_BFF_RUNTIME__;
    delete (window as unknown as Record<string, unknown>).__PANTHEON_RUNTIME_CONFIG__;
    window.sessionStorage.clear();
    window.localStorage.clear();
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

  it("reports healthy hybrid live as fallback standby without claiming seed is armed", () => {
    stubLiveEnv("auto");

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("hybrid");
    expect(snap.usingSeed).toBe(false);
    expect(snap.fallbackStandby).toBe(true);
    expect(snap.seedFallbackArmed).toBe(false);
    expect(snap.typedError).toBe(false);
  });

  it("allows hosted dev runtime fallback selection to report strict real mode", () => {
    stubLiveEnv("auto");
    window.sessionStorage.setItem("pantheon.integration.fallback", "strict");

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("real");
    expect(snap.configuredMode).toBe("real");
    expect(snap.fallbackStandby).toBe(false);
    expect(snap.seedFallbackArmed).toBe(false);
  });

  it("allows pre-bootstrap runtime config to select strict real mode", () => {
    stubLiveEnv("auto");
    Object.assign(window as unknown as Record<string, unknown>, {
      __PANTHEON_BFF_RUNTIME__: { VITE_BFF_FALLBACK: "strict" },
    });

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("real");
    expect(snap.configuredMode).toBe("real");
    expect(snap.fallbackStandby).toBe(false);
    expect(snap.seedFallbackArmed).toBe(false);
  });

  it("reports hybrid transport fallback as active seed source", () => {
    stubLiveEnv("auto");
    liveStatus.reportFallback("ECONNREFUSED");

    const snap = getLiveStatusSnapshot();

    expect(snap.transportMode).toBe("mock-fallback");
    expect(snap.usingSeed).toBe(true);
    expect(snap.fallbackStandby).toBe(false);
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
