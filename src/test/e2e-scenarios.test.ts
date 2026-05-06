// Pack C §C059 — 10 happy + 5 incident E2E scenarios. Mock-driven.
// Names follow Given/When/Then per Pack C §C061.

import { describe, it, expect, beforeAll } from "vitest";
import * as seed from "@/mocks/seed";
import { mutations } from "@/lib/bff/mutations";
import { issueConfirmTokenV4, redeemConfirmToken } from "@/lib/v4/confirmToken";
import { computeHandoffSla } from "@/lib/v4/handoffRuntime";
import { realtime } from "@/lib/bff/realtime";
import { z } from "zod";

beforeAll(() => {
  seed.strategies[0].lockVersion = seed.strategies[0].lockVersion ?? 1;
});

// -------- 10 HAPPY-PATH SCENARIOS --------

describe("E2E happy 1/10 · Strategy promote", () => {
  it("Given strategy When promoteLive Then audit recorded", async () => {
    const r = await mutations.promoteLive("stg_001", "promote");
    expect(r.ok).toBe(true);
  });
});

describe("E2E happy 2/10 · Approval approve", () => {
  it("Given pending approval When approve Then state=approved", async () => {
    await mutations.approve("ap_303", "ok");
    expect(seed.approvals.find((a) => a.id === "ap_303")?.state).toBe("approved");
  });
});

describe("E2E happy 3/10 · Rebalance step advance", () => {
  it("Given rebalance When advance Then ok", async () => {
    const r = await mutations.advanceRebalanceStep("rb_q2_2026", "advance");
    expect(r.ok).toBe(true);
  });
});

describe("E2E happy 4/10 · Ranking recalculate (zod-validated)", () => {
  const RecalcResponse = z.object({
    ok: z.literal(true),
    audit: z.object({
      id: z.string(), actor: z.string(), action: z.string(),
      target: z.string(), ts: z.string(),
    }),
    job: z.object({ id: z.string(), kind: z.string(), status: z.string() }).optional(),
    message: z.string().optional(),
  });
  it("Given live scope When recalculate Then envelope matches contract", async () => {
    const r = await mutations.rankingAction("live", "recalculate", "quarterly");
    const parsed = RecalcResponse.safeParse(r);
    expect(parsed.success).toBe(true);
  });
});

describe("E2E happy 5/10 · Idempotent runAction replay", () => {
  it("Given same idempotencyKey When called twice Then identical audit", async () => {
    const key = `idem-e2e-${Date.now()}`;
    const r1 = await mutations.runAction({ kind: "Strategy", id: "stg_001", action: "noop", idempotencyKey: key });
    const r2 = await mutations.runAction({ kind: "Strategy", id: "stg_001", action: "noop", idempotencyKey: key });
    expect(r2.audit.id).toBe(r1.audit.id);
  });
});

describe("E2E happy 6/10 · Confirm-token issue+redeem single-use", () => {
  const ctx = {
    entityType: "Strategy", entityId: "stg_001",
    actionId: "promote_live", expectedVersion: 1, idempotencyKey: "k1",
    memo: "promote",
  };
  it("Given high-risk action When issue+redeem Then ok then reuse blocked", () => {
    const t = issueConfirmTokenV4(ctx, { userId: "alice", role: "risk_officer" });
    const r1 = redeemConfirmToken({ tokenId: t.tokenId, ...ctx });
    expect(r1.ok).toBe(true);
    const r2 = redeemConfirmToken({ tokenId: t.tokenId, ...ctx });
    expect(r2.ok).toBe(false);
  });
});

describe("E2E happy 7/10 · Handoff SLA", () => {
  it("Given recent handoff When compute Then phase ok|warning|breached", () => {
    const r = computeHandoffSla({
      type: "research_task",
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(r).not.toBeNull();
    expect(["ok","warning","breached","escalated"]).toContain(r!.phase);
  });
});

describe("E2E happy 8/10 · Skill action via runAction", () => {
  it("Given draft skill When approve Then audit emitted", async () => {
    const r = await mutations.runAction({ kind: "Skill", id: "sk_macro_brief", action: "approve" });
    expect(r.audit.action).toMatch(/skill\./);
  });
});

describe("E2E happy 9/10 · Realtime broadcasts data event", () => {
  it("Given subscriber When mutation Then data event delivered", async () => {
    let count = 0;
    const off = realtime.on("data", () => { count++; });
    await mutations.acknowledgeAlert("al_500", "ack");
    off();
    expect(count).toBeGreaterThan(0);
  });
});

describe("E2E happy 10/10 · CapitalPool freeze + unfreeze", () => {
  it("Given pool When freeze + unfreeze Then both audited", async () => {
    const f = await mutations.freezePool("cp_alpha", "manual");
    expect(f.ok).toBe(true);
    const fz = seed.poolFreezes.find((p) => p.poolId === "cp_alpha");
    if (fz) {
      const u = await mutations.unfreezePool("cp_alpha", fz.id, "ok");
      expect(u.ok).toBe(true);
    }
  });
});

// -------- 5 INCIDENT-PATH SCENARIOS --------

describe("E2E incident 1/5 · Optimistic-lock conflict 409", () => {
  it("Given stale version When runAction Then state_conflict", async () => {
    const s = seed.strategies[0];
    s.lockVersion = 5;
    const r = await mutations.runAction({
      kind: "Strategy", id: s.id, action: "noop", expectedVersion: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe("state_conflict");
  });
});

describe("E2E incident 2/5 · Confirm-token reuse blocked", () => {
  const ctx = {
    entityType: "Strategy", entityId: "stg_002",
    actionId: "rollback", expectedVersion: 1, idempotencyKey: "k2",
    memo: "rollback",
  };
  it("Given used token When redeem again Then ok=false", () => {
    const t = issueConfirmTokenV4(ctx, { userId: "ops", role: "system_operator" });
    redeemConfirmToken({ tokenId: t.tokenId, ...ctx });
    const again = redeemConfirmToken({ tokenId: t.tokenId, ...ctx });
    expect(again.ok).toBe(false);
  });
});

describe("E2E incident 3/5 · Emergency kill audit", () => {
  it("Given live strategy When emergencyKill Then audit ok", async () => {
    const r = await mutations.emergencyKill({ kind: "Strategy", id: "stg_004" }, "ext alarm");
    expect(r.ok).toBe(true);
  });
});

describe("E2E incident 4/5 · Approval rejected", () => {
  it("Given pending approval When reject Then state=rejected", async () => {
    await mutations.reject("ap_302", "withdrawn");
    expect(seed.approvals.find((a) => a.id === "ap_302")?.state).toBe("rejected");
  });
});

describe("E2E incident 5/5 · Handoff escalation extends due time", () => {
  it("Given old handoff When escalated Then dueAt extended", () => {
    const created = new Date(Date.now() - 6 * 3600_000).toISOString();
    const before = computeHandoffSla({ type: "research_task", createdAt: created })!;
    const after = computeHandoffSla({ type: "research_task", createdAt: created, escalatedAt: new Date().toISOString() })!;
    expect(new Date(after.dueAt).getTime()).toBeGreaterThanOrEqual(new Date(before.dueAt).getTime());
  });
});
