import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureServant, getServant } from "./servant";
import { liveStatus } from "../liveStatus";

const realFetch = globalThis.fetch;

const liveServant = {
  persona_id: "servant-live-001",
  display_name: "Live Servant",
  status: "paper_only",
  tenant_id: "live-tenant",
  agora_user_id: "live-user",
  capability_summary: { can_ask: true, can_research: false, can_workshop: false },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const mockFetch = (impl: () => Promise<Response>) => {
  const spy = vi.fn(impl);
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
};

describe("servant client (strict live)", () => {
  beforeEach(() => {
    liveStatus._reset({ mode: "live", effective: "live" });
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("GETs the servant from the configured BFF base URL, never the page origin", async () => {
    const spy = mockFetch(() => Promise.resolve(json({ data: liveServant })));
    const profile = await getServant();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bff.example.test/bff/agora/servant");
    expect(init.credentials).toBe("include");
    expect(profile?.persona_id).toBe("servant-live-001");
    expect(profile?.status).toBe("paper_only");
    expect(profile?.policy.execution_authority).toBe("none");
  });

  it("returns null on 404", async () => {
    mockFetch(() => Promise.resolve(json({ error: { code: "RESOURCE_NOT_FOUND", message: "none" } }, 404)));
    await expect(getServant()).resolves.toBeNull();
  });

  it("throws on 401 and on network failure instead of returning mock data", async () => {
    mockFetch(() => Promise.resolve(json({ error: { code: "UNAUTHORIZED", message: "no" } }, 401)));
    await expect(getServant()).rejects.toThrow();
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(getServant()).rejects.toThrow();
  });

  it("rejects an unknown status rather than defaulting to active", async () => {
    mockFetch(() => Promise.resolve(json({ ...liveServant, status: "weird" })));
    await expect(getServant()).rejects.toThrow(/unknown status/);
  });

  it("ensure POSTs with Idempotency-Key and X-Request-Id and returns the same persona_id twice", async () => {
    const spy = mockFetch(() => Promise.resolve(json(liveServant)));
    const a = await ensureServant();
    const b = await ensureServant();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://bff.example.test/bff/agora/servant/ensure");
    expect(init.method).toBe("POST");
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(headers["X-Request-Id"]).toBeTruthy();
    expect(a.persona_id).toBe(b.persona_id);
  });
});
