import { describe, it, expect } from "vitest";
import { subscribe, publish } from "@/lib/bff-v1/sse/bridge";
import { isSseEvent, SSE_SCHEMA_VERSION } from "@/lib/bff-v1/sse/channels";

describe("VI-A C5 — SSE typed envelope (schemaVersion=1)", () => {
  it("publish emits envelope with schemaVersion=1", () =>
    new Promise<void>((resolve) => {
      const off = subscribe<{ x: number }>("strategy", (ev) => {
        expect(ev.schemaVersion).toBe(SSE_SCHEMA_VERSION);
        expect(ev.channel).toBe("strategy");
        expect(ev.type).toBe("strategy.updated");
        expect(ev.payload).toEqual({ x: 1 });
        expect(typeof ev.id).toBe("string");
        expect(typeof ev.occurredAt).toBe("string");
        expect(isSseEvent(ev)).toBe(true);
        off();
        resolve();
      });
      publish({ channel: "strategy", type: "strategy.updated", payload: { x: 1 } });
    }));

  it("isSseEvent rejects malformed payloads", () => {
    expect(isSseEvent(null)).toBe(false);
    expect(isSseEvent({ schemaVersion: 0, channel: "strategy", type: "x", id: "a" })).toBe(false);
    expect(isSseEvent({ schemaVersion: 1, channel: "bogus", type: "x", id: "a" })).toBe(false);
  });
});
