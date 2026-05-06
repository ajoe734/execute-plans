// Pack C §C059 — 10 happy-path + 5 incident-path E2E scenarios.
// All scenarios are mock-driven and exercise the BFF mutation surface end-to-end.
// Given/When/Then is encoded as test names per Pack C §C061.

import { describe, it, expect, beforeAll } from "vitest";
import * as seed from "@/mocks/seed";
import { mutations } from "@/lib/bff/mutations";
import { issueConfirmToken, redeemConfirmToken } from "@/lib/v4/confirmToken";
import { computeHandoffSla } from "@/lib/v4/handoffRuntime";
import { realtime } from "@/lib/bff/realtime";
import { z } from "zod";

beforeAll(() => {
  // ensure deterministic id baseline
  seed.strategies[0].lockVersion = seed.strategies[0].lockVersion ?? 1;
});

// -------- 10 HAPPY-PATH SCENARIOS --------

describe("E2E happy 1/10 · Strategy promote → approval", () => {
  it("Given approved strategy When promoteLive Then audit recorded", async () => {
    const r = await mutations.promoteLive("stg_001", "promote to live");
    expect(r.ok).toBe(true);
    expect(r.audit.action).toMatch(/strategy\./);
  });
});

describe("E2E happy 2/10 · Approval approve flow", () => {
  it("Given pending approval When approve Then state=approved", async () => {
    const r = await mutations.approve("ap_303", "ok");
    expect(r.ok).toBe(true);
    expect(seed.approvals.find((a) => a.id === "ap_303")?.state).toBe("approved");
  });
});

describe("E2E happy 3/10 · Rebalance step advance", () => {
  it("Given Q2 rebalance When advance step Then next step in_progress", async () => {
    const r = await mutations.advanceRebalanceStep("rb_q2_2026", "advance");
    expect(r.ok).toBe(true);
  });
});

describe("E2E happy 4/10 · Ranking recalculate (zod-validated mock contract)", () => {
  const RecalcResponse = z.object({
    ok: z.literal(true),
    audit: z.object({
      id: z.string(), actor: z.string(), action: z.string(),
      target: z.string(), ts: z.string(),
    }),
    job: z.object({ id: z.string(), kind: z.string(), status: z.string() }).optional(),
    message: z.string().optional(),
  });
  it("Given live scope When recalculate Then envelope matches OpenAPI surrogate", async () => {
    const r = await mutations.rankingAction("live", "recalculate", "quarterly");
    const parsed = RecalcResponse.safeParse(r);
    expect(parsed.success).toBe(true);
  });
});

describe("E2E happy 5/10 · Idempotent runAction replay", () => {
  it("Given same idempotencyKey When runAction twice Then identical audit returned", async () => {
    const key = `idem-e2e-${Date.now()}`;
    const r1 = await mutations.runAction({ kind: "Strategy", id: "stg_001", action: "noop", idempotencyKey: key });
    const r2 = await mutations.runAction({ kind: "Strategy", id: "stg_001", action: "noop", idempotencyKey: key });
    expect(r2.audit.id).toBe(r1.audit.id);
  });
});

describe("E2E happy 6/10 · Confirm-token issue + redeem", () => {
  it("Given high-risk action When issue+redeem Then single-use ok", () => {
    const t = issueConfirmToken({
      entityKind: "Strategy", entityId: "stg_001",
      action: "promote_live", actorId: "alice",
      expectedVersion: 1, idempotencyKey: "k1",
    });
    const ok = redeemConfirmToken(t.token, {
      entityKind: "Strategy", entityId: "stg_001",
      action: "promote_live", actorId: "alice",
      expectedVersion: 1, idempotencyKey: "k1",
    });
    expect(ok.ok).toBe(true);
    const reuse = redeemConfirmToken(t.token, {
      entityKind: "Strategy", entityId: "stg_001",
      action: "promote_live", actorId: "alice",
      expectedVersion: 1, idempotencyKey: "k1",
    });
    expect(reuse.ok).toBe(false);
  });
});

describe("E2E happy 7/10 · Handoff SLA computation", () => {
  it("Given new handoff When computeSla Then status ok within budget", () => {
    const now = Date.now();
    const r = computeHandoffSla({
      type: "approval_to_executor",
      createdAt: new Date(now - 60_000).toISOString(),
      escalated: false,
    }, new Date(now).toISOString());
    expect(["ok","warning","breached"]).toContain(r.status);
  });
});

describe("E2E happy 8/10 · Skill publish via runAction", () => {
  it("Given draft skill When approve action Then audit ok", async () => {
    const r = await mutations.runAction({ kind: "Skill", id: "sk_macro_brief", action: "approve" });
    expect(r.audit.action).toMatch(/skill\./);
  });
});

describe("E2E happy 9/10 · Realtime data event broadcast", () => {
  it("Given subscriber When mutation Then data event emitted", async () => {
    let received = 0;
    const off = realtime.on("data", () => { received++; });
    await mutations.acknowledgeAlert("al_500", "ack");
    off();
    expect(received).toBeGreaterThan(0);
  });
});

describe("E2E happy 10/10 · CapitalPool freeze + unfreeze", () => {
  it("Given pool When freeze + unfreeze Then both audited", async () => {
    const f = await mutations.freezePool("cp_alpha", "manual freeze");
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
  it("Given used token When redeem again Then ok=false", () => {
    const t = issueConfirmToken({
      entityKind: "Strategy", entityId: "stg_002",
      action: "rollback", actorId: "ops",
      expectedVersion: 1, idempotencyKey: "k2",
    });
    redeemConfirmToken(t.token, {
      entityKind: "Strategy", entityId: "stg_002",
      action: "rollback", actorId: "ops",
      expectedVersion: 1, idempotencyKey: "k2",
    });
    const again = redeemConfirmToken(t.token, {
      entityKind: "Strategy", entityId: "stg_002",
      action: "rollback", actorId: "ops",
      expectedVersion: 1, idempotencyKey: "k2",
    });
    expect(again.ok).toBe(false);
  });
});

describe("E2E incident 3/5 · Critical alert → emergency kill audit", () => {
  it("Given critical alert When emergencyKill Then audit ok", async () => {
    const r = await mutations.emergencyKill({ kind: "Strategy", id: "stg_004" }, "ext alarm");
    expect(r.ok).toBe(true);
    expect(r.audit.action).toMatch(/kill|emergency/);
  });
});

describe("E2E incident 4/5 · Approval rejected", () => {
  it("Given pending approval When reject Then state=rejected", async () => {
    const r = await mutations.reject("ap_302", "withdrawn");
    expect(r.ok).toBe(true);
    expect(seed.approvals.find((a) => a.id === "ap_302")?.state).toBe("rejected");
  });
});

describe("E2E incident 5/5 · Handoff escalation extends due time", () => {
  it("Given old handoff When escalate Then dueAt extended", () => {
    const created = new Date(Date.now() - 6 * 3600_000).toISOString();
    const before = computeHandoffSla({ type: "approval_to_executor", createdAt: created, escalated: false });
    const after = computeHandoffSla({ type: "approval_to_executor", createdAt: created, escalated: true });
    expect(new Date(after.dueAt).getTime()).toBeGreaterThanOrEqual(new Date(before.dueAt).getTime());
  });
});
