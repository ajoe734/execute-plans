import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY,
  PUBLIC_RUNTIME_CONFIG_SCHEMA,
  resetDeploymentRuntimeAuditForTests,
} from "@/config/deploymentRuntime";
import { getLiveStatusSnapshot } from "@/lib/bff-v1/liveTransport";
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
    delete (window as unknown as Record<string, unknown>)[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY];
    delete (window as unknown as Record<string, unknown>).__PANTHEON_BFF_RUNTIME__;
    delete (window as unknown as Record<string, unknown>).__PANTHEON_RUNTIME_CONFIG__;
    resetDeploymentRuntimeAuditForTests();
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

  it("enforces strict real mode from validated __PANTHEON_DEPLOYMENT_CONFIG__ and ignores legacy runtime globals", () => {
    stubLiveEnv("auto");
    Object.assign(window as unknown as Record<string, unknown>, {
      __PANTHEON_BFF_RUNTIME__: { VITE_BFF_FALLBACK: "strict" },
      __PANTHEON_RUNTIME_CONFIG__: { VITE_BFF_FALLBACK: "strict" },
    });

    // Legacy globals are ignored; transport stays hybrid until validated deployment config or session storage is set.
    expect(getLiveStatusSnapshot().transportMode).toBe("hybrid");

    Object.assign(window as unknown as Record<string, unknown>, {
      [PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY]: {
        schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
        environment: "dev",
        configRef: "dev-runtime-20261107-01",
        bffBaseUrl: "https://api.dev.mvl-cap.tw",
        gcpIdentity: {
          apiKey: "AIzaSyDevRuntimeConfigKey00000000000003",
          projectId: "pantheon-dev-20260902",
          authDomain: "pantheon-dev-20260902.firebaseapp.com",
          issuer: "https://securetoken.google.com/pantheon-dev-20260902",
          audience: "pantheon-dev-20260902",
        },
      },
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
