import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agoraServantClient } from "./servant";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

const realFetch = globalThis.fetch;

const liveServant = {
  spec_version: "1.0",
  persona_id: "servant-live-001",
  display_name: "Live Servant",
  status: "active",
  tenant_id: "live-tenant",
  agora_user_id: "live-user",
  persona_class: "agora_servant",
  owner_scope: "user_private",
  visibility_scope: "private",
  memory_scope: "private_user",
  capability_summary: { can_ask: true, can_research: false, can_workshop: false },
  policy: {
    persona_class: "agora_servant",
    owner_scope: "user_private",
    visibility_scope: "private",
    memory_scope: "private_user",
    persona_registry_backed: true,
    execution_authority: "none",
    prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"],
  },
};

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("agoraServantClient.ensure — mock mode", () => {
  beforeEach(() => liveStatus._reset({ mode: "mock", effective: "mock" }));
  afterEach(() => liveStatus._reset());

  it("returns mock servant without calling fetch", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy;
    const profile = await agoraServantClient.ensure();
    expect(profile.persona_id).toBe("mock-servant");
    expect(profile.policy.execution_authority).toBe("none");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("agoraServantClient.ensure — live mode", () => {
  beforeEach(() => liveStatus._reset({ mode: "live", effective: "live" }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  it("POSTs to /bff/agora/servant/ensure", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(okResponse(liveServant)));
    await agoraServantClient.ensure();
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/bff/agora/servant/ensure");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("sends Idempotency-Key and X-Request-Id headers", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(okResponse(liveServant)));
    await agoraServantClient.ensure();
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(headers["X-Request-Id"]).toBeTruthy();
    expect(headers["Idempotency-Key"]).not.toBe(headers["X-Request-Id"]);
  });

  it("sends distinct Idempotency-Key and X-Request-Id on each call", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(okResponse(liveServant)));
    await agoraServantClient.ensure();
    await agoraServantClient.ensure();
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const h1 = calls[0][1].headers as Record<string, string>;
    const h2 = calls[1][1].headers as Record<string, string>;
    expect(h1["Idempotency-Key"]).not.toBe(h2["Idempotency-Key"]);
    expect(h1["X-Request-Id"]).not.toBe(h2["X-Request-Id"]);
  });

  it("returns adapted ServantProfile from a flat live response", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(okResponse(liveServant)));
    const profile = await agoraServantClient.ensure();
    expect(profile.persona_id).toBe("servant-live-001");
    expect(profile.status).toBe("active");
  });

  it("returns adapted ServantProfile from a data-envelope response", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(okResponse({ data: liveServant })));
    const profile = await agoraServantClient.ensure();
    expect(profile.persona_id).toBe("servant-live-001");
  });

  it("throws on non-2xx without silent mock fallback", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));
    await expect(agoraServantClient.ensure()).rejects.toThrow();
  });

  it("throws on network error, does not fall back to mock silently", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(agoraServantClient.ensure()).rejects.toThrow(/Failed to fetch|strict mode/);
  });
});
