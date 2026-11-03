import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bffFetch, liveStatus } from "@/lib/bff-v1";
import {
  clearSessionExpiry,
  getRecordedSessionExpiry,
  isUnauthorizedError,
  onBffSessionRefreshed,
  onBffUnauthorized,
  recordSessionExpiryFromPayload,
  resetSessionTransportForTests,
} from "@/lib/auth/sessionExpiry";

describe("BFF 401 session-expiry signal & renewal transport", () => {
  const realFetch = globalThis.fetch;
  const listener = vi.fn();
  let unsubscribe = () => {};

  beforeEach(() => {
    resetSessionTransportForTests();
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://x.test" });
    listener.mockReset();
    unsubscribe = onBffUnauthorized(listener);
  });
  afterEach(() => {
    unsubscribe();
    resetSessionTransportForTests();
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    liveStatus._reset();
  });

  const respond = (status: number) => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "expired" } }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  it("reports a 401 after refresh failure and still throws the status to the caller", async () => {
    respond(401);
    const failure = await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" })
      .catch((error: unknown) => error);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed: true }),
    );
    expect(isUnauthorizedError(failure)).toBe(true);
  });

  it.each([403, 500])("does not report HTTP %i", async (status) => {
    respond(status);
    await expect(
      bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" }),
    ).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
  });

  it("performs a single-flight POST /bff/auth/refresh across concurrent 401 requests and retries each once", async () => {
    let refreshCalls = 0;
    const attempts = new Map<string, number>();
    const refreshedListener = vi.fn();
    const unsubRefreshed = onBffSessionRefreshed(refreshedListener);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = new URL(url, "https://x.test").pathname;
      if (path === "/bff/auth/refresh") {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
        return new Response(
          JSON.stringify({
            authenticated: true,
            expires_at: "2026-11-04T07:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const prev = attempts.get(path) ?? 0;
      attempts.set(path, prev + 1);
      if (prev === 0) {
        return new Response(
          JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Access token expired" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ data: { path, method: (init?.method ?? "GET").toUpperCase() } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const [r1, r2, r3] = await Promise.all([
      bffFetch<{ data: { path: string } }>({
        method: "GET",
        path: "/bff/a",
        mode: "live",
        baseUrl: "https://x.test",
      }),
      bffFetch<{ data: { path: string } }>({
        method: "GET",
        path: "/bff/b",
        mode: "live",
        baseUrl: "https://x.test",
      }),
      bffFetch<{ data: { path: string } }>({
        method: "GET",
        path: "/bff/c",
        mode: "live",
        baseUrl: "https://x.test",
      }),
    ]);

    expect(refreshCalls).toBe(1);
    expect(r1.data.path).toBe("/bff/a");
    expect(r2.data.path).toBe("/bff/b");
    expect(r3.data.path).toBe("/bff/c");
    expect(attempts.get("/bff/a")).toBe(2);
    expect(attempts.get("/bff/b")).toBe(2);
    expect(attempts.get("/bff/c")).toBe(2);
    expect(listener).not.toHaveBeenCalled();
    expect(refreshedListener).toHaveBeenCalledTimes(1);
    expect(getRecordedSessionExpiry().expiresAtMs).toBe(Date.parse("2026-11-04T07:00:00Z"));
    unsubRefreshed();
  });

  it("reuses the exact original Idempotency-Key when retrying a write after 401 refresh", async () => {
    const seenIdempotencyKeys: string[] = [];
    const seenRequestIds: string[] = [];
    let attempt = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = new URL(url, "https://x.test").pathname;
      if (path === "/bff/auth/refresh") {
        return new Response(
          JSON.stringify({
            authenticated: true,
            expires_at: "2026-11-04T07:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const headers = new Headers(init?.headers);
      const idem = headers.get("Idempotency-Key");
      const reqId = headers.get("X-Request-Id");
      if (idem) seenIdempotencyKeys.push(idem);
      if (reqId) seenRequestIds.push(reqId);

      attempt += 1;
      if (attempt === 1) {
        return new Response(
          JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Access token expired" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ data: { accepted: true, idempotency_key: idem } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await bffFetch<{ data: { accepted: boolean; idempotency_key: string } }>({
      method: "POST",
      path: "/bff/management/actions",
      body: { action: "approve" },
      mode: "live",
      baseUrl: "https://x.test",
    });

    expect(result.data.accepted).toBe(true);
    expect(seenIdempotencyKeys).toHaveLength(2);
    expect(seenIdempotencyKeys[0]).toBeTruthy();
    expect(seenIdempotencyKeys[0]).toBe(seenIdempotencyKeys[1]);
  });

  it("proactively renews before expires_at and when the tab becomes visible again", async () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-11-03T05:00:00Z");
    vi.setSystemTime(now);

    let refreshCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const path = new URL(url, "https://x.test").pathname;
      if (path === "/bff/auth/refresh") {
        refreshCalls += 1;
        // Each refresh extends expiry by 30 minutes from current fake time
        const nextExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
        return new Response(
          JSON.stringify({
            authenticated: true,
            expires_at: nextExpiresAt,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    // Seed initial /bff/me payload with 30-minute access token expiry
    const initialExpiresAt = new Date(now + 30 * 60_000).toISOString();
    recordSessionExpiryFromPayload(
      {
        authenticated: true,
        user_id: "admintest",
        expires_at: initialExpiresAt,
      },
      { baseUrl: "https://x.test" },
    );

    expect(getRecordedSessionExpiry().expiresAtMs).toBe(now + 30 * 60_000);
    expect(refreshCalls).toBe(0);

    // Advance 28 minutes (< 29m lead window): no refresh yet
    await vi.advanceTimersByTimeAsync(28 * 60_000);
    expect(refreshCalls).toBe(0);

    // Advance past 29m mark (1 minute before 30m expiry): proactive timer fires!
    await vi.advanceTimersByTimeAsync(60_000 + 100);
    expect(refreshCalls).toBe(1);

    // Simulate user returning to tab when visibilitychange fires
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(50);

    expect(refreshCalls).toBe(2);
    expect(listener).not.toHaveBeenCalled();

    clearSessionExpiry();
    expect(getRecordedSessionExpiry().expiresAtMs).toBeNull();
  });

  it("renews on cold page load when initial /bff/me returns 401 and establishes session without /auth redirect", async () => {
    resetSessionTransportForTests();
    localStorage.setItem("agora.session.renewal-until", String(Date.now() + 86_400_000));
    let meAttempts = 0;
    let refreshCalls = 0;
    const nextExpiresAt = "2026-11-04T08:00:00Z";

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const path = new URL(url, "https://x.test").pathname;
      if (path === "/bff/auth/refresh") {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({
            authenticated: true,
            expires_at: nextExpiresAt,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (path === "/bff/me") {
        meAttempts += 1;
        if (meAttempts === 1) {
          return new Response(
            JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Access token expired" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              user: { id: "admintest" },
              tenant: { id: "default" },
              roles: ["operator"],
              capabilities: ["agora.workshop.v1"],
              session: {
                authenticated: true,
                session_kind: "cookie",
                expires_at: nextExpiresAt,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const meResult = await bffFetch<{
      data: {
        user: { id: string };
        session: { authenticated: boolean; session_kind: string; expires_at: string };
      };
    }>({
      method: "GET",
      path: "/bff/me",
      mode: "live",
      baseUrl: "https://x.test",
    });

    expect(refreshCalls).toBe(1);
    expect(meAttempts).toBe(2);
    expect(meResult.data.session.authenticated).toBe(true);
    expect(meResult.data.user.id).toBe("admintest");
    expect(listener).not.toHaveBeenCalled();
    expect(getRecordedSessionExpiry().expiresAtMs).toBe(Date.parse(nextExpiresAt));
  });

  const coldLoadFetch = (calls: string[]) => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "https://x.test").pathname;
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/bff/auth/refresh") {
        return new Response(JSON.stringify({ expires_at: "2099-01-01T00:00:00Z" }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    }) as typeof fetch;
  };
  const coldMe = () =>
    bffFetch({ method: "GET", path: "/bff/me", mode: "live", baseUrl: "https://x.test" }).catch(() => undefined);

  it("anonymous cold load sends no POST /bff/auth/refresh", async () => {
    const calls: string[] = [];
    coldLoadFetch(calls);
    await Promise.all([
      coldMe(),
      bffFetch({ method: "GET", path: "/bff/auth/readiness", mode: "live", baseUrl: "https://x.test" }).catch(() => undefined),
    ]);
    expect(calls.sort()).toEqual(["GET /bff/auth/readiness", "GET /bff/me"]);
  });

  it("returning user with unexpired marker refreshes once then retries", async () => {
    localStorage.setItem("agora.session.renewal-until", String(Date.now() + 86_400_000));
    const calls: string[] = [];
    coldLoadFetch(calls);
    await coldMe();
    expect(calls).toEqual(["GET /bff/me", "POST /bff/auth/refresh", "GET /bff/me"]);
  });

  it("ignores and removes an expired marker without POSTing", async () => {
    localStorage.setItem("agora.session.renewal-until", String(Date.now() - 1000));
    const calls: string[] = [];
    coldLoadFetch(calls);
    await coldMe();
    expect(calls).toEqual(["GET /bff/me"]);
    expect(localStorage.getItem("agora.session.renewal-until")).toBeNull();
  });

  it("records the marker from refresh_expires_at and removes it on refresh 401", async () => {
    const until = Date.now() + 86_400_000;
    recordSessionExpiryFromPayload({ refresh_expires_at: new Date(until).toISOString() });
    expect(localStorage.getItem("agora.session.renewal-until")).toBe(String(until));
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 401 })) as typeof fetch;
    await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" }).catch(() => undefined);
    expect(localStorage.getItem("agora.session.renewal-until")).toBeNull();
  });
  it("removes the marker when the logout endpoint is called", async () => {
    localStorage.setItem("agora.session.renewal-until", String(Date.now() + 86_400_000));
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
    await bffFetch({ method: "POST", path: "/bff/logout", mode: "live", baseUrl: "https://x.test" });
    expect(localStorage.getItem("agora.session.renewal-until")).toBeNull();
  });

  const apiThenRefresh = (refresh: () => Promise<Response>) => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/bff/auth/refresh")) return refresh();
      return new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "expired" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
  };

  it.each([401, 403])("starts the session-expired flow when refresh returns %i", async (status) => {
    apiThenRefresh(async () => new Response("{}", { status }));
    await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" }).catch(() => undefined);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ confirmed: true }));
  });

  it.each([404, 500, 503])("does not expire the session when refresh returns %i", async (status) => {
    apiThenRefresh(async () => new Response("{}", { status }));
    const failure = await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" })
      .catch((error: unknown) => error);
    expect(listener).not.toHaveBeenCalled();
    expect(isUnauthorizedError(failure)).toBe(true);
  });

  it("does not expire the session when refresh fails on the network", async () => {
    apiThenRefresh(async () => {
      throw new TypeError("Failed to fetch");
    });
    await bffFetch({ method: "GET", path: "/bff/x", mode: "live", baseUrl: "https://x.test" }).catch(() => undefined);
    expect(listener).not.toHaveBeenCalled();
  });
});
