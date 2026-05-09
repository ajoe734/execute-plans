import { afterEach, describe, it, expect, vi } from "vitest";
import { runAction, tryRunAction, requestConfirmToken } from "@/lib/bff-v1";
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

function makeLiveFetch(body: unknown, status = 202): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("VI-2 live-mode adaptLive normalization", () => {
  it("runAction adaptLive maps commandId→actionId and provides legacy for runActionSafe", async () => {
    setWriteEnv(true, "tok_live_test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const commandId = "cmd_abc123";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        status: "accepted",
        data: { commandId, status: "accepted" },
        meta: { idempotency: { idempotencyKey: "idk_from_server" } },
      }, 202),
    );

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
    expect(globalThis.fetch).toHaveBeenCalledOnce();
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
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});

describe("VI-2 auth gate", () => {
  it("runAction stays in mock when VITE_BFF_REAL_WRITES=true but no bearer token", async () => {
    setWriteEnv(true, null);
    const fetcher = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(env.ok).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requestConfirmToken stays in mock when VITE_BFF_REAL_WRITES=true but no bearer token", async () => {
    setWriteEnv(true, null);
    const fetcher = vi.fn();
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
    expect(fetcher).not.toHaveBeenCalled();
  });
});
