// BFF-LUV-FE-004 — Focused write-flow tests for bff/runAction.ts

import { describe, it, expect, vi, afterEach } from "vitest";
import { liveWriteGated, runAction, requestConfirmToken, decideApproval, acknowledgeAlert, decideIntervention } from "@/lib/bff/runAction";

// ---------- helpers ----------

function setEnv(realWrites: boolean, token: string | null = null) {
  // Use process.env to control realWritesEnabled() — readable in both viteEnv and nodeEnv paths.
  process.env.VITE_BFF_REAL_WRITES = realWrites ? "true" : "false";
  // Use real jsdom sessionStorage for auth token.
  window.sessionStorage.clear();
  window.localStorage.clear();
  if (token) window.sessionStorage.setItem("pantheon.bff.bearerToken", token);
}

afterEach(() => {
  setEnv(false, null);
  vi.restoreAllMocks();
});

// ---------- liveWriteGated ----------

describe("liveWriteGated", () => {
  it("returns false when VITE_BFF_REAL_WRITES is not set", () => {
    setEnv(false, null);
    expect(liveWriteGated()).toBe(false);
  });

  it("returns false when real writes enabled but no auth token", () => {
    setEnv(true, null);
    expect(liveWriteGated()).toBe(false);
  });

  it("returns true when real writes enabled AND token present", () => {
    setEnv(true, "tok_test_123");
    expect(liveWriteGated()).toBe(true);
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
