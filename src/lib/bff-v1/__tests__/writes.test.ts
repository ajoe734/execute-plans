import { afterEach, describe, it, expect, vi } from "vitest";
import { liveWriteGated, runAction, sessionKindAllowsWrite, tryRunAction, requestConfirmToken } from "@/lib/bff-v1";
import { BffError } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

function setWriteEnv(realWrites: boolean, token: string | null = null) {
  process.env.VITE_BFF_REAL_WRITES = realWrites ? "true" : "false";
  window.sessionStorage.clear();
  window.localStorage.clear();
  if (token) window.sessionStorage.setItem("pantheon.bff.bearerToken", token);
}

afterEach(() => {
  setWriteEnv(false, null);
  delete process.env.VITE_BFF_FALLBACK;
  delete process.env.VITE_BFF_STRICT_WRITES;
  liveStatus._reset();
  vi.restoreAllMocks();
});

describe("VI-2 writes seam", () => {
  it("runAction returns CommandResponse envelope with correlationId + idempotencyKey", async () => {
    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(env.ok).toBe(true);
    expect(env.data.status).toBe("completed");
    expect(env.data.actionId).toMatch(/^au_/);
    expect(env.correlationId).toMatch(/^corr_/);
    expect(env.idempotencyKey).toMatch(/^idk_/);
    expect(env.auditEventId).toBe(env.data.actionId);
  });

  it("preserves caller-supplied correlationId + idempotencyKey", async () => {
    const env = await runAction(
      { kind: "Strategy", id: "stg_001", action: "noop" },
      { correlationId: "corr_test_xyz", idempotencyKey: "idk_test_xyz" },
    );
    expect(env.correlationId).toBe("corr_test_xyz");
    expect(env.idempotencyKey).toBe("idk_test_xyz");
  });

  it("audit event carries correlationId + idempotencyKey", async () => {
    const env = await runAction(
      { kind: "Strategy", id: "stg_001", action: "noop" },
      { correlationId: "corr_audit_chk", idempotencyKey: "idk_audit_chk" },
    );
    expect(env.legacy.audit.correlationId).toBe("corr_audit_chk");
    expect(env.legacy.audit.idempotencyKey).toBe("idk_audit_chk");
  });

  it("idempotent replay returns same audit id", async () => {
    const key = `idk_replay_${Date.now()}`;
    const a = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" }, { idempotencyKey: key });
    const b = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" }, { idempotencyKey: key });
    expect(b.legacy.audit.id).toBe(a.legacy.audit.id);
  });

  it("tryRunAction returns Result without throwing", async () => {
    const r = await tryRunAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(r.ok).toBe(true);
  });

  it("requestConfirmToken issues an envelope with TTL data", async () => {
    const env = await requestConfirmToken({
      actionId: "strategy.deploy_live",
      entityType: "strategy",
      entityId: "stg_001",
      payloadHash: "mock",
      tradingEnvironment: "live",
      platformEnvironment: "production",
    });
    expect(env.ok).toBe(true);
    expect(env.data.confirmToken).toBeTruthy();
    expect(env.data.requiredPhrase).toBeTruthy();
    expect(env.correlationId).toMatch(/^corr_/);
  });

  it("requestConfirmToken throws BffError for unknown action", async () => {
    await expect(
      requestConfirmToken({
        actionId: "unknown.bogus_action",
        entityType: "strategy",
        entityId: "x",
        payloadHash: "mock",
        tradingEnvironment: "live",
        platformEnvironment: "production",
      }),
    ).rejects.toBeInstanceOf(BffError);
  });
});

function meSession(sessionKind: "cookie" | "bearer" | "stub", opts: { env?: string; strict?: boolean } = {}) {
  return {
    data: {
      session: { authenticated: true, session_kind: sessionKind },
      environment: { name: opts.env ?? "dev", strict_auth: opts.strict ?? false },
    },
  };
}

function makeJsonResponse(body: unknown, status = 202): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeSessionFetch(sessionKind: "cookie" | "bearer" | "stub"): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(makeJsonResponse(meSession(sessionKind), 200));
}

function makeLiveFetch(body: unknown, status = 202, sessionKind: "cookie" | "bearer" | "stub" = "bearer"): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/bff/me")) return makeJsonResponse(meSession(sessionKind), 200);
    return makeJsonResponse(body, status);
  });
}

describe("VI-2 live-mode adaptLive normalization", () => {
  it("runAction adaptLive maps commandId→actionId and provides legacy for runActionSafe", async () => {
    setWriteEnv(true, "tok_live_test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const commandId = "cmd_abc123";
    let commandUrl = "";
    let commandBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) return makeJsonResponse(meSession("bearer"), 200);
      commandUrl = url;
      commandBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return makeJsonResponse({
        status: "accepted",
        data: { commandId, status: "accepted" },
        meta: { idempotency: { idempotencyKey: "idk_from_server" } },
      }, 202);
    });

    const env = await runAction(
      { kind: "Strategy", id: "stg_001", action: "activate" },
      { correlationId: "corr_live_01", idempotencyKey: "idk_caller_01" },
    );

    expect(env.ok).toBe(true);
    expect(env.data.actionId).toBe(commandId);
    expect(env.auditEventId).toBe(commandId);
    expect(env.correlationId).toBe("corr_live_01");
    expect(env.idempotencyKey).toBe("idk_from_server");
    // legacy must be present so runActionSafe can return r.envelope.legacy
    expect(env.legacy).toBeDefined();
    expect(env.legacy.ok).toBe(true);
    expect(env.legacy.audit.id).toBe(commandId);
    expect(commandUrl.endsWith("/bff/v1/commands")).toBe(true);
    expect(commandBody.command).toBe("StrategyAction");
    expect(commandBody.target).toEqual({ type: "Strategy", id: "stg_001" });
    expect(commandBody.action).toBe("activate");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/\/bff\/me$/);
  });

  it("requestConfirmToken adaptLive maps tokenId→confirmToken with HighRiskConfirm fields", async () => {
    setWriteEnv(true, "tok_live_test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const tokenId = "ct_xyz789";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        status: "accepted",
        data: { tokenId, commandId: "cmd_ct_01" },
        meta: { idempotency: { idempotencyKey: "idk_srv_ct" } },
      }, 201),
    );

    const env = await requestConfirmToken(
      {
        actionId: "strategy.deploy_live",
        entityType: "strategy",
        entityId: "stg_001",
        payloadHash: "h",
        tradingEnvironment: "live",
        platformEnvironment: "production",
      },
      {},
      { correlationId: "corr_ct_01" },
    );

    expect(env.ok).toBe(true);
    // HighRiskConfirm reads r.data.confirmToken
    expect(env.data.confirmToken).toBe(tokenId);
    // HighRiskConfirm reads r.data.requiredPhrase
    expect(env.data.requiredPhrase).toBeTruthy();
    // HighRiskConfirm reads r.data.expiresAt
    expect(env.data.expiresAt).toBeTruthy();
    expect(env.correlationId).toBe("corr_ct_01");
    expect(env.idempotencyKey).toBe("idk_srv_ct");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("VI-2 confirmToken propagation to live POST body", () => {
  it("runAction live POST body includes confirmToken from opts", async () => {
    setWriteEnv(true, "tok_live_test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    let capturedBody: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_, init) => {
      if (!init?.body) return makeJsonResponse(meSession("bearer"), 200);
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return makeJsonResponse({ status: "accepted", data: { commandId: "cmd_ct_prop" }, meta: {} }, 202);
    });

    await runAction(
      { kind: "Strategy", id: "stg_001", action: "deploy_live", memo: "approve deploy" },
      { confirmToken: "ctok_v3_abc123" },
    );

    expect((capturedBody as Record<string, unknown>).command).toBe("StrategyAction");
    expect((capturedBody as Record<string, unknown>).target).toEqual({ type: "Strategy", id: "stg_001" });
    expect((capturedBody as Record<string, unknown>).confirmToken).toBe("ctok_v3_abc123");
    expect(((capturedBody as Record<string, unknown>).params as Record<string, unknown>).confirmToken).toBe("ctok_v3_abc123");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("VI-2 session-kind write gate", () => {
  it("liveWriteGated fetches /bff/me with credentials and admits cookie-only sessions", async () => {
    setWriteEnv(true, null);
    const fetcher = makeSessionFetch("cookie");
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    await expect(liveWriteGated()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toMatch(/\/bff\/me$/);
    expect((init as RequestInit).credentials).toBe("include");
  });

  it("honors the dev-host browser runtime real-write gate", async () => {
    setWriteEnv(false, null);
    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    const fetcher = makeSessionFetch("cookie");
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);

    await expect(liveWriteGated()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("honors the dev-host browser runtime strict fallback gate", async () => {
    setWriteEnv(false, null);
    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    window.sessionStorage.setItem("pantheon.integration.fallback", "strict");
    vi.spyOn(globalThis, "fetch").mockImplementation(makeSessionFetch("stub"));

    await expect(liveWriteGated()).resolves.toBe(false);
  });

  it("sessionKindAllowsWrite blocks stub in production or strict mode", () => {
    expect(sessionKindAllowsWrite("cookie", { production: true, strict: true })).toBe(true);
    expect(sessionKindAllowsWrite("bearer", { production: true, strict: true })).toBe(true);
    expect(sessionKindAllowsWrite("stub", { production: false, strict: false })).toBe(true);
    expect(sessionKindAllowsWrite("stub", { production: true, strict: false })).toBe(false);
    expect(sessionKindAllowsWrite("stub", { production: false, strict: true })).toBe(false);
  });

  it("runAction stays in mock when /bff/me rejects the session", async () => {
    setWriteEnv(true, null);
    const fetcher = vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { code: "INVALID_TOKEN", message: "missing" } }, 401),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(env.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("requestConfirmToken uses live transport for a cookie-only session", async () => {
    setWriteEnv(true, null);
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const tokenId = "ct_cookie_only";
    const fetcher = makeLiveFetch({
      status: "accepted",
      data: { tokenId, commandId: "cmd_cookie_ct" },
      meta: { idempotency: { idempotencyKey: "idk_cookie" } },
    }, 201, "cookie");
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    const env = await requestConfirmToken({
      actionId: "strategy.deploy_live",
      entityType: "strategy",
      entityId: "stg_001",
      payloadHash: "h",
      tradingEnvironment: "live",
      platformEnvironment: "production",
    });
    expect(env.ok).toBe(true);
    expect(env.data.confirmToken).toBe(tokenId);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
