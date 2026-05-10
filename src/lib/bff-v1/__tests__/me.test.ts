import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMe, fetchMe, refreshSession, logoutSession, invalidateMe, hasCapability, mockMe } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

describe("VI-A C4 — bff-v1 me façade", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    invalidateMe();
    liveStatus._reset({ mode: "mock", effective: "mock", baseUrl: "" });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    invalidateMe();
    liveStatus._reset();
  });

  it("fetchMe returns canonical MeResponse with required fields", async () => {
    const me = await fetchMe(true);
    expect(me.user.id).toBeTruthy();
    expect(me.tenant.id).toBeTruthy();
    expect(me.permissionsVersion).toBeTruthy();
    expect(me.serverTime).toBeTruthy();
    expect(Array.isArray(me.capabilities)).toBe(true);
  });

  it("useMe hook surfaces the cached MeResponse", async () => {
    const { result } = renderHook(() => useMe());
    await waitFor(() => expect(result.current.me).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(hasCapability(result.current.me, "strategy.create")).toBe(true);
    expect(hasCapability(result.current.me, "nope.bogus")).toBe(false);
  });

  it("live auto /bff/me falls back visibly instead of hiding transport state", async () => {
    vi.stubEnv("VITE_BFF_FALLBACK", "auto");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const me = await fetchMe(true);

    expect(me.user.id).toBe("u_mock");
    expect(liveStatus.get().effective).toBe("mock");
    expect(liveStatus.get().lastError).toMatch(/ECONNREFUSED/);
  });

  it("live strict /bff/me does not silently mock", async () => {
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(fetchMe(true)).rejects.toThrow(/ECONNREFUSED|strict mode/);
  });

  it("refresh and logout use canonical session routes in live mode", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: mockMe() }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock;
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });

    await expect(refreshSession()).resolves.toMatchObject({ user: { id: "u_mock" } });
    await expect(logoutSession()).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/auth/refresh");
    expect(fetchMock.mock.calls[1][0]).toBe("https://bff.example.test/bff/logout");
  });
});
