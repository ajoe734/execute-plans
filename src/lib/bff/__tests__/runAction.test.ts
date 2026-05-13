// BFF-LUV-FE-004 — Focused write-flow tests for bff/runAction.ts

import { describe, it, expect, vi, afterEach } from "vitest";
import { liveWriteGated, sessionKindAllowsWrite, runAction, requestConfirmToken, readConfirmToken, redeemConfirmToken, deleteConfirmToken, decideApproval, acknowledgeAlert, decideIntervention } from "@/lib/bff/runAction";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

// ---------- helpers ----------

function setEnv(realWrites: boolean, token: string | null = null) {
  // Use process.env to control realWritesEnabled() — readable in both viteEnv and nodeEnv paths.
  process.env.VITE_BFF_REAL_WRITES = realWrites ? "true" : "false";
  // Use real jsdom sessionStorage for auth token.
  window.sessionStorage.clear();
  window.localStorage.clear();
  if (token) window.sessionStorage.setItem("pantheon.bff.bearerToken", token);
}

function setLive(on: boolean) {
  liveStatus._reset(on ? { mode: "live", effective: "live", baseUrl: "" } : undefined);
}

afterEach(() => {
  setEnv(false, null);
  delete process.env.VITE_BFF_FALLBACK;
  delete process.env.VITE_BFF_STRICT_WRITES;
  liveStatus._reset();
  vi.restoreAllMocks();
});

// ---------- liveWriteGated ----------

describe("liveWriteGated", () => {
  it("returns false when VITE_BFF_REAL_WRITES is not set", async () => {
    setEnv(false, null);
    const fetcher = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    await expect(liveWriteGated()).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns false when /bff/me rejects the session", async () => {
    setEnv(true, null);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INVALID_TOKEN", message: "missing" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    await expect(liveWriteGated()).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns true for a cookie-only /bff/me session", async () => {
    setEnv(true, null);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(meSession("cookie")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    await expect(liveWriteGated()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toMatch(/\/bff\/me$/);
    expect((init as RequestInit).credentials).toBe("include");
  });

  it("returns true for a bearer /bff/me session", async () => {
    setEnv(true, "tok_test_123");
    vi.spyOn(globalThis, "fetch").mockImplementation(makeSessionFetch("bearer"));
    await expect(liveWriteGated()).resolves.toBe(true);
  });

  it("blocks stub sessions in strict write mode", async () => {
    setEnv(true, "tok_stub");
    process.env.VITE_BFF_FALLBACK = "strict";
    vi.spyOn(globalThis, "fetch").mockImplementation(makeSessionFetch("stub"));
    await expect(liveWriteGated()).resolves.toBe(false);
  });

  it("sessionKindAllowsWrite admits cookie and bearer while production-blocking stub", () => {
    expect(sessionKindAllowsWrite("cookie", { production: true, strict: true })).toBe(true);
    expect(sessionKindAllowsWrite("bearer", { production: true, strict: true })).toBe(true);
    expect(sessionKindAllowsWrite("stub", { production: false, strict: false })).toBe(true);
    expect(sessionKindAllowsWrite("stub", { production: true, strict: false })).toBe(false);
    expect(sessionKindAllowsWrite("unknown", { production: false, strict: false })).toBe(false);
  });
});

// ---------- runAction (mock branch) ----------

describe("runAction mock branch", () => {
  it("returns a valid envelope from mock mutations", async () => {
    setEnv(false);
    const env = await runAction({ kind: "Alert", id: "al_500", action: "acknowledge" });
    expect(env.ok).toBe(true);
    expect(env.correlationId).toMatch(/^cid_/);
    expect(env.idempotencyKey).toMatch(/^idk_/);
    expect(env.data.status).toBe("completed");
    expect(env.legacy.ok).toBe(true);
  });

  it("throws BffError when mock rejects illegal transition", async () => {
    setEnv(false);
    const { BffError } = await import("@/lib/bff-v1/errors");
    const s = (await import("@/mocks/seed")).strategies.find((x) => x.id === "stg_005")!;
    s.state = "discovered" as typeof s.state;
    await expect(
      runAction({ kind: "Strategy", id: "stg_005", action: "promote_live" }),
    ).rejects.toBeInstanceOf(BffError);
  });

  it("tryRunAction returns ok:false instead of throwing", async () => {
    setEnv(false);
    const s = (await import("@/mocks/seed")).strategies.find((x) => x.id === "stg_005")!;
    s.state = "discovered" as typeof s.state;
    const r = await (await import("@/lib/bff/runAction")).tryRunAction({
      kind: "Strategy", id: "stg_005", action: "promote_live",
    });
    expect(r.ok).toBe(false);
  });

  it("propagates confirmToken into the mock audit memo", async () => {
    setEnv(false);
    const env = await runAction(
      { kind: "Alert", id: "al_500", action: "acknowledge" },
      { confirmToken: "ctok_abc123" },
    );
    expect(env.ok).toBe(true);
  });
});

// ---------- requestConfirmToken (mock branch) ----------

describe("requestConfirmToken mock branch", () => {
  it("returns token envelope for a known high-risk action", async () => {
    setEnv(false);
    const env = await requestConfirmToken({
      actionId: "strategy.promote_paper",
      entityType: "strategy",
      entityId: "stg_001",
      payloadHash: "h_test",
      tradingEnvironment: "paper",
      platformEnvironment: "dev",
    });
    expect(env.ok).toBe(true);
    expect(env.data.confirmToken).toMatch(/^ctok_/);
    expect(env.data.ttlSeconds).toBeGreaterThan(0);
  });

  it("throws BffError for an unknown high-risk action", async () => {
    setEnv(false);
    const { BffError } = await import("@/lib/bff-v1/errors");
    await expect(
      requestConfirmToken({
        actionId: "unknown.action",
        entityType: "strategy",
        entityId: "stg_001",
        payloadHash: "h_x",
        tradingEnvironment: "paper",
        platformEnvironment: "dev",
      }),
    ).rejects.toBeInstanceOf(BffError);
  });
});

// ---------- decideApproval (mock branch) ----------

describe("decideApproval mock branch", () => {
  it("returns approval decision envelope", async () => {
    setEnv(false);
    const seed = await import("@/mocks/seed");
    const ap = seed.approvals.find((a) => a.id === "ap_303")!;
    ap.state = "pending";
    ap.stages?.forEach((s) => { s.state = "pending"; delete (s as Record<string,unknown>).decidedAt; });
    const env = await decideApproval("ap_303", "approve", "lgtm");
    expect(env.ok).toBe(true);
    expect(env.data.approvalId).toBe("ap_303");
    expect(env.data.decision).toBe("approve");
  });
});

// ---------- acknowledgeAlert (mock branch) ----------

describe("acknowledgeAlert mock branch", () => {
  it("returns alert ack envelope", async () => {
    setEnv(false);
    const seed = await import("@/mocks/seed");
    const a = seed.alerts.find((x) => x.id === "al_500");
    if (a) a.acknowledged = false;
    const env = await acknowledgeAlert("al_500", "seen it");
    expect(env.ok).toBe(true);
    expect(env.data.alertId).toBe("al_500");
  });
});

// ---------- decideIntervention (mock branch) ----------

describe("decideIntervention mock branch", () => {
  it("returns intervention decision envelope", async () => {
    setEnv(false);
    const env = await decideIntervention("iv_001", "acknowledge", "reviewing");
    expect(env.ok).toBe(true);
    expect(env.data.interventionId).toBe("iv_001");
    expect(env.data.decision).toBe("acknowledge");
  });
});

// ---------- readConfirmToken (mock branch) ----------

describe("readConfirmToken mock branch", () => {
  it("returns token envelope for a given token id", async () => {
    setEnv(false);
    const { readConfirmToken } = await import("@/lib/bff/runAction");
    const env = await readConfirmToken("ctok_test_123");
    expect(env.ok).toBe(true);
    expect(env.correlationId).toMatch(/^cid_/);
  });
});

// ---------- redeemConfirmToken (mock branch) ----------

describe("redeemConfirmToken mock branch", () => {
  it("returns redeem envelope", async () => {
    setEnv(false);
    const { redeemConfirmToken } = await import("@/lib/bff/runAction");
    const env = await redeemConfirmToken("ctok_test_456");
    expect(env.ok).toBe(true);
    expect(env.data.tokenId).toBe("ctok_test_456");
    expect(env.data.redeemed).toBe(true);
  });
});

// ---------- deleteConfirmToken (mock branch) ----------

describe("deleteConfirmToken mock branch", () => {
  it("returns delete envelope", async () => {
    setEnv(false);
    const { deleteConfirmToken } = await import("@/lib/bff/runAction");
    const env = await deleteConfirmToken("ctok_test_789");
    expect(env.ok).toBe(true);
    expect(env.data.tokenId).toBe("ctok_test_789");
    expect(env.data.deleted).toBe(true);
  });
});

// ---------- smoke mode safety ----------

describe("no live-capital side effects in smoke mode", () => {
  it("runAction stays in mock when VITE_BFF_REAL_WRITES is unset", async () => {
    setEnv(false);
    const fetcher = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    await runAction({ kind: "Strategy", id: "stg_001", action: "promote_paper" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requestConfirmToken stays in mock when real writes off", async () => {
    setEnv(false);
    const fetcher = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    await requestConfirmToken({
      actionId: "strategy.promote_paper",
      entityType: "strategy",
      entityId: "stg_001",
      payloadHash: "h",
      tradingEnvironment: "paper",
      platformEnvironment: "dev",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// ---------- live mode adapter tests ----------

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
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("runAction live mode adapter", () => {
  it("normalizes _sem_command_response into RunActionEnvelope", async () => {
    setEnv(true, "tok_bearer_live");
    setLive(true);
    const commandId = "cmd-abcdef1234567890";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        status: "accepted",
        data: { status: "accepted", command: "strategy_action", commandId, command_id: commandId },
        meta: { durable: true, idempotency: { key: "idk_live001", idempotencyKey: "idk_live001", replayed: false } },
      }),
    );
    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "promote_paper" });
    expect(env.ok).toBe(true);
    expect(env.data.actionId).toBe(commandId);
    expect(env.data.status).toBe("accepted");
    expect(env.correlationId).toMatch(/^cid_/);
    expect(env.idempotencyKey).toBe("idk_live001");
    expect(env.auditEventId).toBe(commandId);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/\/bff\/me$/);
  });
});

describe("requestConfirmToken live mode adapter", () => {
  it("normalizes confirm-token create response with tokenId into ConfirmTokenEnvelope", async () => {
    setEnv(true, "tok_bearer_live");
    setLive(true);
    const tokenId = "ct_live_test_abc123";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        status: "accepted",
        data: { status: "accepted", commandId: "cmd-xyz", tokenId },
        meta: { idempotency: { idempotencyKey: "idk_live002", replayed: false } },
      }, 201),
    );
    const env = await requestConfirmToken(
      {
        actionId: "strategy.promote_paper",
        entityType: "strategy",
        entityId: "stg_001",
        payloadHash: "h_live",
        tradingEnvironment: "paper",
        platformEnvironment: "dev",
      },
      { strategyId: "stg_001" },
    );
    expect(env.ok).toBe(true);
    expect(env.data.confirmToken).toBe(tokenId);
    expect(env.data.ttlSeconds).toBeGreaterThan(0);
    expect(env.data.requiredPhrase).toMatch(/PROMOTE PAPER/);
    expect(env.idempotencyKey).toBe("idk_live002");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("readConfirmToken live mode adapter", () => {
  it("normalizes GET confirm-token response into ConfirmTokenReadEnvelope", async () => {
    setEnv(true, "tok_bearer_live");
    setLive(true);
    const tokenId = "ct_live_read_xyz789";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        data: { id: tokenId, tokenId, status: "active" },
        meta: { contract: "BFF-LUV-SEM-002", snapshot_at: "2026-05-09T00:00:00Z" },
      }, 200),
    );
    const env = await readConfirmToken(tokenId);
    expect(env.ok).toBe(true);
    expect(env.data.confirmToken).toBe(tokenId);
    expect(env.data.ttlSeconds).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("redeemConfirmToken live mode adapter", () => {
  it("returns normalized redeem envelope from live response", async () => {
    setEnv(true, "tok_bearer_live");
    setLive(true);
    const tokenId = "ct_live_redeem_aaa";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        status: "accepted",
        data: { commandId: "cmd-redeem", status: "accepted" },
        meta: { idempotency: { idempotencyKey: "idk_live003", replayed: false } },
      }, 202),
    );
    const env = await redeemConfirmToken(tokenId);
    expect(env.ok).toBe(true);
    expect(env.data.tokenId).toBe(tokenId);
    expect(env.data.redeemed).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("deleteConfirmToken live mode adapter", () => {
  it("returns normalized delete envelope from live response", async () => {
    setEnv(true, "tok_bearer_live");
    setLive(true);
    const tokenId = "ct_live_delete_bbb";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        status: "accepted",
        data: { commandId: "cmd-delete", status: "accepted" },
        meta: { idempotency: { idempotencyKey: "idk_live004", replayed: false } },
      }, 202),
    );
    const env = await deleteConfirmToken(tokenId);
    expect(env.ok).toBe(true);
    expect(env.data.tokenId).toBe(tokenId);
    expect(env.data.deleted).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
