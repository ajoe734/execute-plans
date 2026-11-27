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

describe("agoraIdentityClient.getTraderIdentity", () => {
  beforeEach(() => liveStatus._reset({ mode: "live", effective: "live" }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("extracts trader display name, style, and scope from /bff/me and /bff/agora/me", async () => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return Promise.resolve(
          okResponse({
            data: {
              operator_id: "admintest",
              user: {
                id: "admintest",
                display_name: "陳大戶",
                trading_style: "分點籌碼與落後補漲",
                roles: ["operator"],
              },
              tenant: { id: "pantheon-dev" },
            },
          }),
        );
      }
      if (url.endsWith("/bff/agora/me")) {
        return Promise.resolve(
          okResponse({
            data: {
              scope_id: "scope-1",
              tenant_id: "pantheon-dev",
              user_id: "admintest",
              operator_id: "admintest",
              granted_capabilities: ["agora.identity.v1", "agora.session.v1"],
            },
          }),
        );
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    });

    const identity = await agoraIdentityClient.getTraderIdentity();
    expect(identity).toEqual({
      userId: "admintest",
      tenantId: "pantheon-dev",
      displayName: "陳大戶",
      style: "分點籌碼與落後補漲",
      marketState: null,
      roles: ["operator"],
      capabilities: ["agora.identity.v1", "agora.session.v1"],
    });
  });

  it("falls back to Agora user scope when /bff/me lacks trader style", async () => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return Promise.resolve(
          okResponse({
            data: {
              operator_id: "admintest",
              user: { id: "admintest", display_name: "admintest" },
              tenant: { id: "pantheon-dev" },
            },
          }),
        );
      }
      return Promise.resolve(
        okResponse({
          data: {
            tenant_id: "pantheon-dev",
            user_id: "admintest",
            operator_id: "admintest",
            metadata: {
              trader_name: "林操盤手",
              trading_style: "事件與大額資金承接",
              market_state: "台股盤中",
            },
            granted_capabilities: ["agora.workshop.v1"],
          },
        }),
      );
    });

    const identity = await agoraIdentityClient.getTraderIdentity();
    expect(identity.displayName).toBe("admintest");
    expect(identity.style).toBe("事件與大額資金承接");
    expect(identity.marketState).toBe("台股盤中");
  });
});
