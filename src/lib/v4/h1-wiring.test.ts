import { describe, expect, it, beforeEach } from "vitest";
import { bff } from "@/lib/bff/client";
import { __resetIdempotencyForTests } from "@/lib/v4/idempotency";
import {
  issueConfirmTokenV4, redeemConfirmToken, revokeConfirmToken,
  __resetConfirmTokenStoreForTests,
} from "@/lib/v4/confirmToken";

describe("Pack C-H1 wiring", () => {
  beforeEach(() => {
    __resetIdempotencyForTests();
    __resetConfirmTokenStoreForTests();
  });

  it("C028 idempotency replay returns the same audit on repeat key", async () => {
    const key = `idem-${Math.random()}`;
    const r1 = await bff.mutations.runAction({ kind: "Strategy", id: "_does_not_exist", action: "noop", idempotencyKey: key });
    const r2 = await bff.mutations.runAction({ kind: "Strategy", id: "_does_not_exist", action: "noop", idempotencyKey: key });
    expect(r2.audit.id).toBe(r1.audit.id);
  });

  it("C019 confirm token reuse + revoke + binding mismatch", () => {
    const t = issueConfirmTokenV4(
      { entityType: "deployment", entityId: "d1", actionId: "emergency_kill",
        expectedVersion: 1, memo: "x", idempotencyKey: "k1" },
      { userId: "u1", role: "admin" },
    );
    const ok = redeemConfirmToken({ tokenId: t.tokenId, entityType: "deployment", entityId: "d1",
      actionId: "emergency_kill", expectedVersion: 1, idempotencyKey: "k1" });
    expect(ok.ok).toBe(true);
    const reuse = redeemConfirmToken({ tokenId: t.tokenId, entityType: "deployment", entityId: "d1",
      actionId: "emergency_kill", expectedVersion: 1, idempotencyKey: "k1" });
    expect(reuse.ok).toBe(false);
    expect((reuse as { error: { code: string } }).error.code).toBe("CONFIRM_TOKEN_REUSED");

    const t2 = issueConfirmTokenV4(
      { entityType: "deployment", entityId: "d2", actionId: "emergency_kill",
        expectedVersion: 1, memo: "x", idempotencyKey: "k2" },
      { userId: "u1", role: "admin" },
    );
    revokeConfirmToken(t2.tokenId);
    const revoked = redeemConfirmToken({ tokenId: t2.tokenId, entityType: "deployment", entityId: "d2",
      actionId: "emergency_kill", expectedVersion: 1, idempotencyKey: "k2" });
    expect(revoked.ok).toBe(false);

    const t3 = issueConfirmTokenV4(
      { entityType: "deployment", entityId: "d3", actionId: "emergency_kill",
        expectedVersion: 5, memo: "x", idempotencyKey: "k3" },
      { userId: "u1", role: "admin" },
    );
    const mismatch = redeemConfirmToken({ tokenId: t3.tokenId, entityType: "deployment", entityId: "d3",
      actionId: "emergency_kill", expectedVersion: 6, idempotencyKey: "k3" });
    expect(mismatch.ok).toBe(false);
    expect((mismatch as { error: { code: string } }).error.code).toBe("CONFIRM_TOKEN_BINDING_MISMATCH");
  });
});
