import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agoraIdentityClient } from "./identity";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

const realFetch = globalThis.fetch;

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const liveScope = {
  spec_version: "1.0",
  scope_id: "live-scope-001",
  tenant_id: "live-tenant",
  user_id: "live-user",
  operator_id: "live-op",
  granted_capabilities: ["agora.identity.v1"],
  read_predicate: { tenant_id: "live-tenant", user_id: "live-user", required_fields: ["tenant_id", "user_id"], fail_closed: true },
  servant_policy: {
    persona_class: "agora_servant",
    owner_scope: "user_private",
    visibility_scope: "private",
    memory_scope: "private_user",
    persona_registry_backed: true,
    execution_authority: "none",
    prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"],
  },
  created_at: "2026-01-01T00:00:00Z",
};

describe("agoraIdentityClient.getMe — mock mode", () => {
  beforeEach(() => liveStatus._reset({ mode: "mock", effective: "mock" }));
  afterEach(() => liveStatus._reset());

  it("returns mock user scope without calling fetch", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy;
    const scope = await agoraIdentityClient.getMe();
    expect(scope.scope_id).toBe("mock-scope");
    expect(scope.user_id).toBe("mock-user");
    expect(scope.servant_policy.execution_authority).toBe("none");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("agoraIdentityClient.getMe — live mode", () => {
  beforeEach(() => liveStatus._reset({ mode: "live", effective: "live" }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("returns adapted AgoraUserScope from a flat live response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse(liveScope));
    const scope = await agoraIdentityClient.getMe();
    expect(scope.scope_id).toBe("live-scope-001");
    expect(scope.user_id).toBe("live-user");
  });

  it("returns adapted AgoraUserScope from a data-envelope live response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ data: { ...liveScope, scope_id: "live-scope-002" } }));
    const scope = await agoraIdentityClient.getMe();
    expect(scope.scope_id).toBe("live-scope-002");
  });

  it("throws on 4xx, does not fall back to mock", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    await expect(agoraIdentityClient.getMe()).rejects.toThrow();
  });

  it("throws on network error, does not fall back to mock silently", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(agoraIdentityClient.getMe()).rejects.toThrow(/Failed to fetch|strict mode/);
  });
});

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
