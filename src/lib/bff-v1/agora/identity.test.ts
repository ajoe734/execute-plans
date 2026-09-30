import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agoraIdentityClient } from "./identity";
import { liveStatus } from "../liveStatus";

const realFetch = globalThis.fetch;

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("agoraIdentityClient.getCapabilities — mock mode", () => {
  beforeEach(() => liveStatus._reset({ mode: "mock", effective: "mock" }));
  afterEach(() => liveStatus._reset());

  it("returns empty array without calling fetch", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy;
    const caps = await agoraIdentityClient.getCapabilities();
    expect(caps).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("agoraIdentityClient.getCapabilities — live mode envelope parsing", () => {
  beforeEach(() => liveStatus._reset({ mode: "live", effective: "live" }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("parses a direct array response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse(["agora.identity.v1", "agora.session.v1"]));
    expect(await agoraIdentityClient.getCapabilities()).toEqual(["agora.identity.v1", "agora.session.v1"]);
  });

  it("parses a flat object with capabilities field", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ capabilities: ["agora.identity.v1"] }));
    expect(await agoraIdentityClient.getCapabilities()).toContain("agora.identity.v1");
  });

  it("parses a flat object with granted_capabilities field", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ granted_capabilities: ["agora.servant.v1"] }));
    expect(await agoraIdentityClient.getCapabilities()).toContain("agora.servant.v1");
  });

  it("parses a data envelope where data is an array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ data: ["agora.research.v1"] }));
    expect(await agoraIdentityClient.getCapabilities()).toContain("agora.research.v1");
  });

  it("parses a data envelope where data.capabilities is present", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ data: { capabilities: ["agora.identity.v1", "agora.servant.v1"] } }));
    expect(await agoraIdentityClient.getCapabilities()).toEqual(["agora.identity.v1", "agora.servant.v1"]);
  });

  it("parses canonical manifest objects from data.capabilities", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({
      data: {
        spec_version: "1.0",
        capabilities: [
          { name: "agora.identity.v1", auth_level: "operator", route_prefixes: ["/bff/agora"] },
          { name: "agora.workshop.v1", auth_level: "operator", route_prefixes: ["/bff/agora/workshops"] },
        ],
        scope: { scope_id: "scope-1" },
      },
      meta: { capability: "agora.identity.v1" },
    }));

    expect(await agoraIdentityClient.getCapabilities()).toEqual([
      "agora.identity.v1",
      "agora.workshop.v1",
    ]);
  });

  it("parses a data envelope where data.granted_capabilities is present", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ data: { granted_capabilities: ["agora.dashboard.v1"] } }));
    expect(await agoraIdentityClient.getCapabilities()).toContain("agora.dashboard.v1");
  });

  it("returns empty array for unrecognized response shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ unexpected: "shape" }));
    expect(await agoraIdentityClient.getCapabilities()).toEqual([]);
  });

  it("throws on 4xx, does not fall back to mock", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 }));
    await expect(agoraIdentityClient.getCapabilities()).rejects.toThrow();
  });

  it("throws on network error, does not fall back to mock silently", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("network error"));
    await expect(agoraIdentityClient.getCapabilities()).rejects.toThrow(/network error|strict mode/);
  });
});
