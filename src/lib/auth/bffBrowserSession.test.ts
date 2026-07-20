import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { buildHeaders, clearAuthProvider } from "@/lib/bff-v1/headers";
import {
  clearBffBrowserSession,
  refreshAndVerifyBffBrowserSession,
  registerBffBrowserSession,
  signedTenantId,
  verifyBffBrowserSession,
} from "./bffBrowserSession";

function session(input: {
  token?: string;
  appMetadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
} = {}): Session {
  return {
    access_token: input.token ?? "short-lived-supabase-access-token",
    refresh_token: "refresh-token-never-forwarded",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "supabase-user",
      app_metadata: input.appMetadata ?? {},
      user_metadata: input.userMetadata ?? {},
    },
  } as Session;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function me(roles = ["viewer"]) {
  return {
    data: {
      user: { id: "bff-user" },
      tenant: { id: "tenant-signed" },
      roles,
      capabilities: roles.includes("operator") ? ["agora.workshop.v1"] : [],
      session: { authenticated: true, session_kind: "bearer" },
    },
  };
}

function readiness(operator = false) {
  return {
    data: {
      ready: operator,
      authReady: operator,
      providerReady: true,
      sourceCommitSha: "1".repeat(40),
      auth: {
        mode: "strict",
        strict: true,
        stub: false,
        sessionKind: "bearer",
        operatorRoleReady: operator,
        interactionCapabilityReady: operator,
      },
    },
  };
}

afterEach(() => {
  clearBffBrowserSession();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("strict browser BFF session bridge", () => {
  it("uses only signed app_metadata for tenant selection", () => {
    expect(signedTenantId(session({
      appMetadata: { tenant_id: "tenant-signed" },
      userMetadata: { tenant_id: "tenant-attacker" },
    }))).toBe("tenant-signed");
    expect(signedTenantId(session({
      userMetadata: { tenant_id: "tenant-attacker" },
    }))).toBeNull();
  });

  it("registers the short-lived bearer in memory and ignores stale Web Storage", () => {
    window.localStorage.setItem("pantheon.bff.bearerToken", "stale-persistent-token");
    window.sessionStorage.setItem("pantheon_tenant_id", "stale-persistent-tenant");
    clearAuthProvider();

    expect(buildHeaders({ method: "GET" })).not.toHaveProperty("Authorization");

    registerBffBrowserSession(session({
      token: "fresh-in-memory-token",
      appMetadata: { tenant_id: "tenant-signed" },
    }));
    expect(buildHeaders({ method: "GET" })).toMatchObject({
      Authorization: "Bearer fresh-in-memory-token",
      "X-Tenant-Id": "tenant-signed",
    });

    clearBffBrowserSession();
    expect(buildHeaders({ method: "GET" })).not.toHaveProperty("Authorization");
  });

  it("accepts an authenticated viewer boundary but never reports write readiness", async () => {
    registerBffBrowserSession(session({ appMetadata: { tenant_id: "tenant-signed" } }));
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(me(["viewer"])))
      .mockResolvedValueOnce(response(readiness(false)));

    const verified = await verifyBffBrowserSession();

    expect(verified.identity.roles).toEqual(["viewer"]);
    expect(verified.identity.capabilities).toEqual([]);
    expect(verified.readiness.authReady).toBe(false);
    expect(verified.readiness.operatorRoleReady).toBe(false);
    for (const call of fetcher.mock.calls) {
      expect((call[1] as RequestInit).headers).toMatchObject({
        Authorization: "Bearer short-lived-supabase-access-token",
        "X-Tenant-Id": "tenant-signed",
      });
    }
  });

  it("refreshes the BFF session before /me and readiness readback", async () => {
    registerBffBrowserSession(session({ token: "refreshed-token" }));
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ data: { state: "active" } }))
      .mockResolvedValueOnce(response(me(["operator"])))
      .mockResolvedValueOnce(response(readiness(true)));

    await expect(refreshAndVerifyBffBrowserSession()).resolves.toMatchObject({
      identity: { roles: ["operator"] },
      readiness: { authReady: true },
    });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "/bff/auth/refresh",
      "/bff/me",
      "/bff/auth/readiness",
    ]);
  });

  it("fails closed for stub readiness", async () => {
    registerBffBrowserSession(session());
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(me(["operator"])))
      .mockResolvedValueOnce(response({
        data: {
          ready: true,
          authReady: true,
          providerReady: true,
          auth: { mode: "permissive", strict: false, stub: true, sessionKind: "stub" },
        },
      }));

    await expect(verifyBffBrowserSession()).rejects.toThrow(/strict browser readiness/);
  });
});
