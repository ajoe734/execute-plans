import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), "src", path), "utf8");
}

describe("strict browser auth source contract", () => {
  it("contains no persistent BFF bearer storage source", () => {
    const headers = source("lib/bff-v1/headers.ts");
    const authProvider = source("lib/auth/AuthProvider.tsx");
    const browserSession = source("lib/auth/bffBrowserSession.ts");
    const identityClient = source("integrations/gcp/identity.ts");
    const bffBridge = [headers, authProvider, browserSession].join("\n");

    expect(bffBridge).not.toMatch(/localStorage|sessionStorage/);
    expect(bffBridge).not.toMatch(/local\s*storage|session\s*storage/i);
    expect(bffBridge).not.toMatch(/window\s*\[\s*['"`](local|session)Storage['"`]\s*\]/i);
    expect(bffBridge).not.toMatch(/(local|session)\s*\+\s*storage/i);
    expect(bffBridge).not.toMatch(/['"`]sess['"`]\s*,\s*['"`]ion['"`]\s*,\s*['"`]Storage['"`]/i);
    expect(bffBridge).not.toMatch(/join\(\s*['"`]\.?['"`]\s*\)/i);
    expect(bffBridge).not.toContain("pantheon.bff.bearerToken");
    expect(bffBridge).not.toContain("pantheon_operator_token");
    expect(bffBridge).not.toContain("VITE_BFF_DEV_BEARER_TOKEN");
    expect(identityClient).toContain("browserSessionPersistence");
  });

  it("limits GCP Identity persistence to same-tab browser session persistence", () => {
    const identityClient = source("integrations/gcp/identity.ts");
    expect(identityClient).toContain("browserSessionPersistence");
    expect(identityClient).not.toContain("browserLocalPersistence");
    expect(identityClient).not.toContain("pantheon.bff.bearerToken");
    expect(identityClient).not.toContain("pantheon_operator_token");
  });

  it("keeps loopback E2E auth on Firebase SDK storage and removes legacy BFF keys", () => {
    const helper = readFileSync(resolve(process.cwd(), "e2e/helpers/auth.ts"), "utf8");
    expect(helper).toContain("firebase:authUser:${apiKey}:[DEFAULT]");
    expect(helper).toContain('page.route("**/bff/me"');
    expect(helper).toContain('page.route("**/bff/auth/readiness"');
    expect(helper).not.toContain("pantheon.bff.bearerToken");
    expect(helper).not.toContain("pantheon_operator_token");
    expect(helper).not.toContain("window.localStorage.setItem");
  });

  it("keeps privileged secrets out of the browser auth bridge", () => {
    const combined = [
      source("lib/auth/AuthProvider.tsx"),
      source("lib/auth/bffBrowserSession.ts"),
      source("integrations/gcp/identity.ts"),
    ].join("\n");

    expect(combined).not.toMatch(/service[_-]?role/i);
    expect(combined).not.toMatch(/client[_-]?secret/i);
    expect(combined).not.toMatch(/private[_-]?key/i);
    expect(combined).not.toMatch(/client\s*\+\s*secret/i);
    expect(combined).not.toMatch(/['"`]client['"`]\s*,\s*['"`]secret['"`]/i);
    expect(combined).not.toMatch(/secSuffix|secretKeys/);
  });

  it("mounts the complete Management shell and Agora behind ProtectedRoute", () => {
    const app = source("App.tsx");
    expect(app).toContain("<Route element={<ProtectedRoute><PlatformShellRoute /></ProtectedRoute>}>");
    expect(app).toContain("<ProtectedRoute><AgoraLayoutRoute /></ProtectedRoute>");
    expect(app).not.toContain("<Route element={<PlatformShellRoute />}>");
    expect(app).not.toContain("<ProtectedRoute><PersonaDetailRoute /></ProtectedRoute>");
  });

  it("shares one lightweight pinned-bearer browser transport between both hosted probes", () => {
    const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
    const lib = read("scripts/lib/pinned-browser-bff-bearer.mjs");
    expect(lib).not.toMatch(/(?:from|import\()\s*["']@?playwright/);
    expect(lib).not.toContain("route.fetch");
    expect(lib).toContain("Fetch.continueRequest");
    expect(lib).toContain("Fetch.requestPaused");
    expect(lib).not.toContain("route.continue({ headers");
    expect(lib).not.toMatch(/node:https?/);
    expect(lib).not.toMatch(/localStorage|sessionStorage|addInitScript/);
    for (const script of ["scripts/probe-route-load-baseline.mjs", "scripts/accept-management-hosted-production.mjs"]) {
      const src = read(script);
      expect(src).toContain('from "./lib/pinned-browser-bff-bearer.mjs"');
      expect(src).not.toMatch(/function (installPinnedBffBearer|pinnedTargetProblem|originOf)/);
    }
  });
});


describe("pinned native transport error propagation", () => {
  it("records a failed actual CDP continue, fails that request, and redacts the token", async () => {
    const { EventEmitter } = await import("node:events");
    const { installPinnedBffBearer } = await import("../../scripts/lib/pinned-browser-bff-bearer.mjs");
    const session = new EventEmitter();
    const calls: string[] = [];
    Object.assign(session, { send: async (method: string) => {
      calls.push(method);
      if (method === "Fetch.continueRequest") throw new Error("socket failure secret-test-token");
    } });
    const page = Object.assign(new EventEmitter(), { isClosed: () => false });
    const context = Object.assign(new EventEmitter(), { pages: () => [page], newCDPSession: async () => session });
    const transport = await installPinnedBffBearer(context, { token: "secret-test-token", feBase: "http://127.0.0.1:4173", bffBase: "https://api.dev.mvl-cap.tw" });
    session.emit("Fetch.requestPaused", { requestId: "one", request: {
      url: "https://api.dev.mvl-cap.tw/bff/events/stream?private=query-secret",
      headers: { Cookie: "cookie-secret", Authorization: "header-secret" },
    } });
    await transport.settle();
    expect(() => transport.assertHealthy()).toThrow(/CDP continueRequest.*socket failure \[REDACTED\]/);
    expect(calls).toEqual(["Network.enable", "Page.enable", "Performance.enable", "Page.getFrameTree", "Fetch.enable", "Fetch.continueRequest", "Fetch.failRequest"]);
    expect(transport.errors.join()).not.toContain("secret-test-token");
    expect(transport.errors.join()).not.toMatch(/query-secret|cookie-secret|header-secret|\?private/);
    const detail = JSON.parse(transport.errors[0].match(/CDP continueRequest (\{.*\}):/)![1]);
    expect(detail).toMatchObject({ interceptionId: "one", networkId: null,
      path: "/bff/events/stream", pausePhase: "active", issuePhase: "active",
      rejectionPhase: "active", queued: false, issued: true, bound: false,
      sampledBeforeIssue: null, canceled: false });
  });
});
