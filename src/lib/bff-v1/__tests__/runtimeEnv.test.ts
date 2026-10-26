import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeploymentRuntimeConfigError,
  getActiveDeploymentRuntimeAudit,
  PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY,
  PUBLIC_RUNTIME_CONFIG_SCHEMA,
  resetDeploymentRuntimeAuditForTests,
  type PublicDeploymentRuntimeConfigInput,
} from "@/config/deploymentRuntime";
import {
  initializeGcpIdentityRuntime,
  resolveGcpIdentityConfig,
} from "@/integrations/gcp/identity";
import { bffFetch, detectBaseUrl } from "@/lib/bff-v1/client";
import {
  isDevLoginHost,
  isDevRuntimeWriteGateHost,
  isRuntimeFallbackHost,
  readBffEnv,
} from "@/lib/bff-v1/runtimeEnv";
import { prepareDeploymentRuntime } from "@/main";

const STAGING_RUNTIME_CONFIG: PublicDeploymentRuntimeConfigInput = {
  schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
  environment: "staging",
  configRef: "stg-runtime-20261024-01",
  bffBaseUrl: "https://api.stg.mvl-cap.tw",
  gcpIdentity: {
    apiKey: "AIzaSyStagingRuntimeConfigKey0000000001",
    projectId: "pantheon-stg-20261024",
    authDomain: "pantheon-stg-20261024.firebaseapp.com",
    issuer: "https://securetoken.google.com/pantheon-stg-20261024",
    audience: "pantheon-stg-20261024",
  },
};

const PRODUCTION_RUNTIME_CONFIG: PublicDeploymentRuntimeConfigInput = {
  schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
  environment: "production",
  configRef: "prod-runtime-20261024-01",
  bffBaseUrl: "https://api.mvl-cap.tw",
  gcpIdentity: {
    apiKey: "AIzaSyProductionRuntimeConfigKey0000002",
    projectId: "pantheon-prod-20261024",
    authDomain: "pantheon-prod-20261024.firebaseapp.com",
    issuer: "https://securetoken.google.com/pantheon-prod-20261024",
    audience: "pantheon-prod-20261024",
  },
};

const DEV_RUNTIME_CONFIG: PublicDeploymentRuntimeConfigInput = {
  schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
  environment: "dev",
  configRef: "dev-runtime-20261024-01",
  bffBaseUrl: "https://api.dev.mvl-cap.tw",
  gcpIdentity: {
    apiKey: "AIzaSyDevRuntimeConfigKey00000000000003",
    projectId: "pantheon-dev-20260902",
    authDomain: "pantheon-dev-20260902.firebaseapp.com",
    issuer: "https://securetoken.google.com/pantheon-dev-20260902",
    audience: "pantheon-dev-20260902",
  },
};

function resetRuntimeState(): void {
  const runtimeWindow = window as unknown as Record<string, unknown>;
  delete runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY];
  delete runtimeWindow.__PANTHEON_RUNTIME_CONFIG__;
  delete runtimeWindow.__PANTHEON_BFF_RUNTIME__;
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetDeploymentRuntimeAuditForTests();
}

describe("BFF and GCP Identity immutable runtime environment selection", () => {
  const originalLocation = window.location;
  const originalBffBaseUrl = process.env.VITE_BFF_BASE_URL;
  const originalBffMode = process.env.VITE_BFF_MODE;
  const originalBffFallback = process.env.VITE_BFF_FALLBACK;

  beforeEach(() => {
    resetRuntimeState();
    // Simulate a bundle built with Dev build-time environment variables
    process.env.VITE_BFF_BASE_URL = "https://api.dev.mvl-cap.tw";
    process.env.VITE_BFF_MODE = "live";
    process.env.VITE_BFF_FALLBACK = "strict";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("http://localhost:8080/"),
    });
  });

  afterEach(() => {
    resetRuntimeState();
    if (originalBffBaseUrl === undefined) delete process.env.VITE_BFF_BASE_URL;
    else process.env.VITE_BFF_BASE_URL = originalBffBaseUrl;
    if (originalBffMode === undefined) delete process.env.VITE_BFF_MODE;
    else process.env.VITE_BFF_MODE = originalBffMode;
    if (originalBffFallback === undefined) delete process.env.VITE_BFF_FALLBACK;
    else process.env.VITE_BFF_FALLBACK = originalBffFallback;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("switches the identical Dev-built bundle between staging and production BFF and public IdP configs before request/auth initialization", async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          data: { status: "ok" },
          meta: { schema_version: "1.0" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const runtimeWindow = window as unknown as Record<string, unknown>;

    // 1. Mount on Staging with external /runtime-config.js payload
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://app.stg.mvl-cap.tw/"),
    });
    runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY] = STAGING_RUNTIME_CONFIG;

    prepareDeploymentRuntime();
    const stgEnv = readBffEnv();
    const stgIdp = initializeGcpIdentityRuntime();
    await bffFetch({
      method: "GET",
      path: "/bff/system/status",
      mode: "live",
    });

    expect(stgEnv.VITE_BFF_BASE_URL).toBe("https://api.stg.mvl-cap.tw");
    expect(detectBaseUrl()).toBe("https://api.stg.mvl-cap.tw");
    expect(stgEnv.VITE_GCP_IDENTITY_PROJECT_ID).toBe("pantheon-stg-20261024");
    expect(stgEnv.VITE_PANTHEON_CONFIG_REF).toBe("stg-runtime-20261024-01");
    expect(stgEnv.VITE_PANTHEON_CONFIG_SHA256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(stgIdp.config).toEqual({
      apiKey: "AIzaSyStagingRuntimeConfigKey0000000001",
      projectId: "pantheon-stg-20261024",
      authDomain: "pantheon-stg-20261024.firebaseapp.com",
    });
    expect(stgIdp.app.options.projectId).toBe("pantheon-stg-20261024");
    expect(requestedUrls[0]).toBe("https://api.stg.mvl-cap.tw/bff/system/status");
    expect(getActiveDeploymentRuntimeAudit()?.environment).toBe("staging");

    // 2. Mount the exact same bundle on Production with external /runtime-config.js payload
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://app.mvl-cap.tw/"),
    });
    runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY] = PRODUCTION_RUNTIME_CONFIG;

    prepareDeploymentRuntime();
    const prodEnv = readBffEnv();
    const prodIdp = initializeGcpIdentityRuntime();
    await bffFetch({
      method: "GET",
      path: "/bff/system/status",
      mode: "live",
    });

    expect(prodEnv.VITE_BFF_BASE_URL).toBe("https://api.mvl-cap.tw");
    expect(detectBaseUrl()).toBe("https://api.mvl-cap.tw");
    expect(prodEnv.VITE_GCP_IDENTITY_PROJECT_ID).toBe("pantheon-prod-20261024");
    expect(prodEnv.VITE_PANTHEON_CONFIG_REF).toBe("prod-runtime-20261024-01");
    expect(prodEnv.VITE_PANTHEON_CONFIG_SHA256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(prodEnv.VITE_PANTHEON_CONFIG_SHA256).not.toBe(
      stgEnv.VITE_PANTHEON_CONFIG_SHA256,
    );
    expect(prodIdp.config).toEqual({
      apiKey: "AIzaSyProductionRuntimeConfigKey0000002",
      projectId: "pantheon-prod-20261024",
      authDomain: "pantheon-prod-20261024.firebaseapp.com",
    });
    expect(prodIdp.app.options.projectId).toBe("pantheon-prod-20261024");
    expect(requestedUrls[1]).toBe("https://api.mvl-cap.tw/bff/system/status");
    expect(getActiveDeploymentRuntimeAudit()?.environment).toBe("production");
  });

  it("retains live/strict, real-write-off, dev-stub-write-off, and embedded-bearer-off on staging and production even when storage overrides are set", () => {
    const runtimeWindow = window as unknown as Record<string, unknown>;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://app.mvl-cap.tw/"),
    });
    runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY] = PRODUCTION_RUNTIME_CONFIG;

    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    window.localStorage.setItem("pantheon.e2e.realWrites", "true");
    window.sessionStorage.setItem("pantheon.integration.fallback", "auto");
    window.localStorage.setItem("pantheon.e2e.fallback", "auto");

    const env = readBffEnv();
    expect(env.VITE_BFF_MODE).toBe("live");
    expect(env.VITE_BFF_FALLBACK).toBe("strict");
    expect(env.VITE_BFF_REAL_WRITES).toBe("false");
    expect(env.VITE_BFF_ALLOW_DEV_STUB_WRITES).toBe("false");
    expect(env.VITE_BFF_EMBEDDED_BEARER_TOKEN).toBe("false");

    expect(isDevRuntimeWriteGateHost()).toBe(false);
    expect(isRuntimeFallbackHost()).toBe(false);
    expect(isDevLoginHost()).toBe(false);
    // Even if a caller passes "localhost" while production runtime config is active, dev gates remain closed
    expect(isDevRuntimeWriteGateHost("localhost")).toBe(false);
    expect(isRuntimeFallbackHost("localhost")).toBe(false);
    expect(isDevLoginHost("localhost")).toBe(false);
  });

  it("preserves local and Dev write/fallback/dev-login compatibility", () => {
    // Localhost compatibility without external runtime-config.js
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("http://localhost:8080/"),
    });
    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    window.sessionStorage.setItem("pantheon.integration.fallback", "auto");

    const localEnv = readBffEnv();
    expect(localEnv.VITE_BFF_BASE_URL).toBe("https://api.dev.mvl-cap.tw");
    expect(localEnv.VITE_BFF_REAL_WRITES).toBe("true");
    expect(localEnv.VITE_BFF_FALLBACK).toBe("auto");
    expect(isDevRuntimeWriteGateHost()).toBe(true);
    expect(isRuntimeFallbackHost()).toBe(true);
    expect(isDevLoginHost()).toBe(true);

    // Dev host compatibility with explicit dev runtime config
    window.sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://app.dev.mvl-cap.tw/"),
    });
    const runtimeWindow = window as unknown as Record<string, unknown>;
    runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY] = DEV_RUNTIME_CONFIG;
    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    window.sessionStorage.setItem("pantheon.integration.fallback", "auto");

    const devEnv = readBffEnv();
    expect(devEnv.VITE_BFF_BASE_URL).toBe("https://api.dev.mvl-cap.tw");
    expect(devEnv.VITE_BFF_REAL_WRITES).toBe("true");
    // app.dev.mvl-cap.tw is not a fallback host, so fallback stays strict
    expect(devEnv.VITE_BFF_FALLBACK).toBe("strict");
    expect(isDevRuntimeWriteGateHost()).toBe(true);
    expect(isRuntimeFallbackHost()).toBe(false);
    expect(isDevLoginHost()).toBe(true);
  });

  it("fails closed on staging and production hosts when runtime config is missing or invalid instead of falling back to Dev BFF/IdP", () => {
    for (const hostUrl of [
      "https://app.stg.mvl-cap.tw/",
      "https://app.mvl-cap.tw/",
    ]) {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: new URL(hostUrl),
      });

      expect(() => prepareDeploymentRuntime()).toThrow(
        DeploymentRuntimeConfigError,
      );
      expect(() => readBffEnv()).toThrow(DeploymentRuntimeConfigError);
      expect(() => resolveGcpIdentityConfig()).toThrow(
        DeploymentRuntimeConfigError,
      );
      expect(() => initializeGcpIdentityRuntime()).toThrow(
        DeploymentRuntimeConfigError,
      );
      // detectBaseUrl catches readBffEnv errors and returns empty string rather than Dev BFF URL
      expect(detectBaseUrl()).toBe("");
    }
  });
});
