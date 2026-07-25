import { afterEach, describe, expect, it, vi } from "vitest";
import type { Route } from "@playwright/test";
import {
  installContainedLoopbackAuth,
  installOidcDevLogin,
  LOCAL_FIXTURE_AUTH_TOKEN,
  type E2ePage,
} from "../../e2e/helpers/auth";

type RouteHandler = (route: Route) => Promise<unknown> | unknown;

function fakePage() {
  const handlers = new Map<string, RouteHandler>();
  const addInitScript = vi.fn().mockResolvedValue(undefined);
  const evaluate = vi.fn(async (script: (arg: unknown) => unknown, arg: unknown) => script(arg));
  const goto = vi.fn().mockResolvedValue(undefined);
  const route = vi.fn(async (pattern: string, handler: RouteHandler) => {
    handlers.set(pattern, handler);
  });
  return {
    handlers,
    operations: { addInitScript, evaluate, goto, route },
    page: { addInitScript, evaluate, goto, route } as unknown as E2ePage,
  };
}

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("loopback Supabase/BFF E2E auth helper", () => {
  it("installs a Supabase-rehydratable same-tab session and exact BFF auth mocks", async () => {
    const { page, handlers } = fakePage();

    const installed = await installOidcDevLogin(page, {
      env: {
        PANTHEON_FE_BASE_URL: "http://127.0.0.1:4173",
        PANTHEON_BROWSER_BFF_BASE_URL: "http://127.0.0.1:4173",
        VITE_SUPABASE_URL: "https://project-ref.supabase.co",
      },
      goto: false,
    });

    expect(installed.token).toBe(LOCAL_FIXTURE_AUTH_TOKEN);
    const raw = window.sessionStorage.getItem("sb-project-ref-auth-token");
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    expect(stored).toMatchObject({
      access_token: LOCAL_FIXTURE_AUTH_TOKEN,
      token_type: "bearer",
      user: {
        id: "op-fe-gate",
        app_metadata: { tenant_id: "tenant-dev" },
        user_metadata: {},
      },
    });
    expect(stored).toHaveProperty("refresh_token");
    expect(stored).toHaveProperty("expires_at");
    for (const legacyKey of [
      "pantheon.bff.bearerToken",
      "pantheon_operator_token",
      "pantheon.bff.tenantId",
      "pantheon_tenant_id",
    ]) {
      expect(window.sessionStorage.getItem(legacyKey)).toBeNull();
      expect(window.localStorage.getItem(legacyKey)).toBeNull();
    }

    const meFulfill = vi.fn().mockResolvedValue(undefined);
    await handlers.get("**/bff/me")?.({ fulfill: meFulfill } as unknown as Route);
    expect(JSON.parse(meFulfill.mock.calls[0][0].body)).toMatchObject({
      data: {
        roles: ["operator", "reviewer", "approver"],
        session: { authenticated: true, session_kind: "bearer" },
      },
    });

    const readinessFulfill = vi.fn().mockResolvedValue(undefined);
    await handlers.get("**/bff/auth/readiness")?.({ fulfill: readinessFulfill } as unknown as Route);
    expect(JSON.parse(readinessFulfill.mock.calls[0][0].body)).toMatchObject({
      data: {
        authReady: true,
        auth: { mode: "strict", stub: false, sessionKind: "bearer" },
        authority: { execution: "none", broker: "none", capital: "none" },
      },
    });
  });

  it("refuses to synthesize a browser session for external or hosted targets", async () => {
    const { page, operations } = fakePage();

    await expect(installOidcDevLogin(page, {
      env: { PANTHEON_FE_BASE_URL: "https://fe.example.test" },
      goto: false,
      token: "real-short-lived-token",
    })).rejects.toThrow(/real Supabase\/BFF strict browser session/);
    expect(operations.addInitScript).not.toHaveBeenCalled();
    expect(operations.evaluate).not.toHaveBeenCalled();
    expect(operations.route).not.toHaveBeenCalled();
  });

  it("contains synthetic fixture credentials behind a deny-by-default BFF route", async () => {
    const { page, handlers, operations } = fakePage();

    const installed = await installContainedLoopbackAuth(page, {
      env: {
        PANTHEON_BROWSER_BFF_BASE_URL: "https://bff.example.test",
        PANTHEON_FE_BASE_URL: "http://127.0.0.1:4173",
        PANTHEON_HOSTED_E2E: "1",
        VITE_SUPABASE_URL: "https://project-ref.supabase.co",
      },
    });

    expect(installed.token).toBe(LOCAL_FIXTURE_AUTH_TOKEN);
    expect(operations.goto).not.toHaveBeenCalled();
    expect(operations.route.mock.calls[0][0]).toBe("**/bff/**");

    const abort = vi.fn().mockResolvedValue(undefined);
    await handlers.get("**/bff/**")?.({ abort } as unknown as Route);
    expect(abort).toHaveBeenCalledWith("blockedbyclient");
  });

  it("rejects localStorage and dual-storage fixture modes", async () => {
    for (const storage of ["local", "both"] as const) {
      const { page, operations } = fakePage();
      await expect(installOidcDevLogin(page, {
        env: { PANTHEON_FE_BASE_URL: "http://127.0.0.1:4173" },
        goto: false,
        storage,
      })).rejects.toThrow(/same-tab sessionStorage only/);
      expect(operations.addInitScript).not.toHaveBeenCalled();
    }
  });
});
