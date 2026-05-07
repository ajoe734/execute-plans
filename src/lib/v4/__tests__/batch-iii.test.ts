import { describe, it, expect, beforeEach } from "vitest";
import {
  paginate,
  clearCursorStore,
  issueCursor,
  readCursor,
} from "../listEnvelope";
import { makeSseEnvelope, isSseEventEnvelope, SSE_SCHEMA_VERSION } from "../sseEnvelope";
import { realtime } from "@/lib/bff/realtime";
import { bff } from "@/lib/bff/client";

describe("Pack D Batch III — listEnvelope", () => {
  beforeEach(() => clearCursorStore());

  it("paginates with cursor.next + totalCountExact", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
    const r1 = paginate(items, { pageSize: 10 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.envelope.items.length).toBe(10);
    expect(r1.envelope.cursor.next).toBeTruthy();
    expect(r1.envelope.totalCountExact).toBe(true);
    expect(r1.envelope.estimatedTotal).toBe(25);
    const r2 = paginate(items, { cursor: r1.envelope.cursor.next, pageSize: 10 });
    if (!r2.ok) throw new Error("expected ok");
    expect(r2.envelope.items[0].id).toBe(10);
  });

  it("rejects unknown cursor with CURSOR_EXPIRED", () => {
    const r = paginate([1, 2, 3], { cursor: "cur_bogus" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("CURSOR_EXPIRED");
  });

  it("invalidates cursor when filterHash mismatches", () => {
    const c = issueCursor(5, "hashA");
    const read = readCursor(c, "hashB");
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("CURSOR_INVALID");
  });

  it("non-exact list omits estimatedTotal", () => {
    const r = paginate([1, 2, 3], { exact: false });
    if (!r.ok) throw new Error("ok expected");
    expect(r.envelope.totalCountExact).toBe(false);
    expect(r.envelope.estimatedTotal).toBeUndefined();
  });
});

describe("Pack D Batch III — SseEventEnvelope", () => {
  it("makeSseEnvelope stamps schemaVersion=1", () => {
    const e = makeSseEnvelope({ id: "id1", channel: "strategy", type: "strategy.updated", payload: { id: "s_1" } });
    expect(e.schemaVersion).toBe(SSE_SCHEMA_VERSION);
    expect(isSseEventEnvelope(e)).toBe(true);
  });

  it("realtime.emitEnvelope dispatches typed envelope to subscribers", () => {
    let received: unknown = null;
    const off = realtime.on("data", (p) => { received = p; });
    realtime.emitEnvelope({
      topic: "data",
      channel: "deployment",
      type: "deployment.completed",
      payload: { deploymentId: "dp_1" },
      correlationId: "corr_1",
    });
    off();
    expect(isSseEventEnvelope(received)).toBe(true);
  });

  it("rejects malformed payloads in isSseEventEnvelope", () => {
    expect(isSseEventEnvelope(null)).toBe(false);
    expect(isSseEventEnvelope({ schemaVersion: 0 })).toBe(false);
    expect(isSseEventEnvelope({ schemaVersion: 1, channel: "x" })).toBe(false);
  });
});

describe("Pack D Batch III — bff.me facade", () => {
  it("bff.me.get returns MeResponse and invalidate clears cache", async () => {
    bff.me.invalidate();
    const a = await bff.me.get();
    expect(a.user.id).toBeTruthy();
    expect(a.tenant.locale).toBeTruthy();
    const b = await bff.me.get();
    expect(b).toBe(a);
    bff.me.invalidate();
    const c = await bff.me.get();
    expect(c).not.toBe(a);
  });
});
