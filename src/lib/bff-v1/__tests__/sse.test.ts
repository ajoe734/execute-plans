import { describe, expect, it } from "vitest";
import {
  SSE_CHANNELS,
  SSE_CHANNEL_SCOPES,
  isSseChannel,
  isSseEvent,
  makeSseEvent,
} from "../sse/channels";
import { buildSseHeaders, buildSseUrl, nextBackoffMs } from "../sse/protocol";
import { publish, subscribe } from "../sse/bridge";

describe("bff-v1 SSE catalog (Final §4 — 27 named + system)", () => {
  it("includes Final C.5 mandatory channels: approval + ask", () => {
    expect(SSE_CHANNELS).toContain("approval");
    expect(SSE_CHANNELS).toContain("ask");
    expect(SSE_CHANNELS.length).toBeGreaterThanOrEqual(27);
    expect(new Set(SSE_CHANNELS).size).toBe(SSE_CHANNELS.length);
  });

  it("every channel has a capability scope", () => {
    for (const c of SSE_CHANNELS) {
      expect(SSE_CHANNEL_SCOPES[c]).toBeTypeOf("string");
    }
  });

  it("isSseChannel guards the union", () => {
    expect(isSseChannel("approval")).toBe(true);
    expect(isSseChannel("nope")).toBe(false);
  });
});

describe("bff-v1 SSE envelope", () => {
  it("makeSseEvent stamps schemaVersion=1 and ISO timestamp", () => {
    const e = makeSseEvent({ id: "x", channel: "approval", type: "approval.requested", payload: { id: "a1" } });
    expect(e.schemaVersion).toBe(1);
    expect(isSseEvent(e)).toBe(true);
    expect(new Date(e.occurredAt).toString()).not.toBe("Invalid Date");
  });
});

describe("bff-v1 SSE protocol (Last-Event-Id resume)", () => {
  it("buildSseHeaders sets Last-Event-Id when provided", () => {
    expect(buildSseHeaders({}).Accept).toBe("text/event-stream");
    expect(buildSseHeaders({ lastEventId: "evt_42" })["Last-Event-Id"]).toBe("evt_42");
  });

  it("buildSseUrl appends channels query", () => {
    const u = buildSseUrl("/bff/events/stream", { channels: ["approval", "ask"] });
    expect(u).toBe("/bff/events/stream?channels=approval%2Cask");
  });

  it("nextBackoffMs is monotonic non-decreasing and capped", () => {
    expect(nextBackoffMs(0)).toBe(1000);
    expect(nextBackoffMs(99)).toBe(30000);
  });
});

describe("bff-v1 SSE bridge", () => {
  it("publish → subscribe round trips through realtime bus", () => {
    const received: unknown[] = [];
    const off = subscribe<{ id: string }>("approval", (e) => received.push(e));
    publish({ channel: "approval", type: "approval.requested", payload: { id: "a1" } });
    off();
    expect(received).toHaveLength(1);
    const ev = received[0] as { schemaVersion: number; channel: string; payload: { id: string } };
    expect(ev.schemaVersion).toBe(1);
    expect(ev.channel).toBe("approval");
    expect(ev.payload.id).toBe("a1");
  });
});
