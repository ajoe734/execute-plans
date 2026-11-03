import { afterEach, describe, it, expect, vi } from "vitest";
import { onBffUnauthorized, resetSessionTransportForTests } from "@/lib/auth/sessionExpiry";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { subscribe, publish } from "@/lib/bff-v1/sse/bridge";
import { isSseEvent, SSE_SCHEMA_VERSION } from "@/lib/bff-v1/sse/channels";
import { extractSseFrames, parseSseFrames } from "@/lib/bff-v1/sse/protocol";
import { connectLiveSse, fetchSse } from "@/lib/bff-v1/sse/liveSse";
import { setAuthProvider, clearAuthProvider } from "@/lib/bff-v1/headers";

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

describe("SD-AGC-04 — SSE Frame Parser", () => {
  it("extracts frames across chunk boundaries and buffers incomplete frames", () => {
    const chunk1 = "event: workshop.connected\nid: evt-001\ndata: {\"work";
    const res1 = extractSseFrames(chunk1);
    expect(res1.frames).toHaveLength(0);
    expect(res1.remainder).toBe(chunk1);

    const chunk2 = "shop_id\":\"ws-001\"}\n\n";
    const res2 = extractSseFrames(res1.remainder + chunk2);
    expect(res2.frames).toHaveLength(1);
    expect(res2.frames[0]).toEqual({
      event: "workshop.connected",
      id: "evt-001",
      data: '{"workshop_id":"ws-001"}',
    });
    expect(res2.remainder).toBe("");
  });

  it("handles multi-line data and ignores comments/heartbeats", () => {
    const text = ": heartbeat\n\nevent: update\ndata: line1\ndata: line2\nid: evt-002\nretry: 3000\n\n";
    const frames = parseSseFrames(text);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      event: "update",
      id: "evt-002",
      data: "line1\nline2",
      retry: 3000,
    });
  });
});

describe("SD-AGC-04 — fetchSse transport", () => {
  afterEach(() => {
    clearAuthProvider();
    vi.restoreAllMocks();
  });

  it("sends Authorization with Bearer and X-Tenant-Id for bearer sessions", async () => {
    setAuthProvider({
      getToken: () => "bearer-token-xyz",
      getTenantId: () => "tenant-test",
    });

    const onMessage = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      text: async () => "event: test.event\nid: evt-100\ndata: {\"hello\":\"world\"}\n\n",
    });

    const controller = fetchSse({
      url: "https://bff.example.test/bff/events/stream",
      lastEventId: "evt-099",
      fetchFn: fetchMock,
      onMessage,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bff.example.test/bff/events/stream",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          Authorization: "Bearer bearer-token-xyz",
          "X-Tenant-Id": "tenant-test",
          "Last-Event-ID": "evt-099",
        }),
      }),
    );

    await vi.waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith({
        event: "test.event",
        id: "evt-100",
        data: '{"hello":"world"}',
      });
    });

    controller.close();
  });

  it("fails typed content check when response is HTML fallback", async () => {
    const onError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      text: async () => "<!DOCTYPE html><html><body>Caddy SPA fallback</body></html>",
    });

    const controller = fetchSse({
      url: "https://bff.example.test/bff/events/stream",
      autoReconnect: false,
      fetchFn: fetchMock,
      onError,
    });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Invalid SSE Content-Type"),
        }),
      );
    });

    controller.close();
  });

  it("stops reconnect on 401 or 403 status", async () => {
    const onError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => '{"error":"forbidden"}',
    });

    const controller = fetchSse({
      url: "https://bff.example.test/bff/events/stream",
      autoReconnect: true,
      fetchFn: fetchMock,
      onError,
    });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("SSE auth failed with status 403"),
        }),
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    controller.close();
  });

  it("triggers onResyncRequired on 409 replay-unavailable", async () => {
    const onResyncRequired = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: "Conflict",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => '{"error":"replay_unavailable"}',
    });

    const controller = fetchSse({
      url: "https://bff.example.test/bff/events/stream",
      autoReconnect: false,
      fetchFn: fetchMock,
      onResyncRequired,
    });

    await vi.waitFor(() => {
      expect(onResyncRequired).toHaveBeenCalledWith("replay_unavailable");
    });

    controller.close();
  });

  it("refreshes session on 401 and retries fetchSse stream once", async () => {
    resetSessionTransportForTests();
    let streamAttempts = 0;
    let refreshCalls = 0;
    const onMessage = vi.fn();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/bff/auth/refresh")) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({ authenticated: true, expires_at: "2026-11-03T07:00:00Z" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      streamAttempts += 1;
      if (streamAttempts === 1) {
        return new Response(
          JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Access token expired" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        'event: strategy.updated\nid: evt-200\ndata: {"ok":true}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const controller = fetchSse({
      url: "https://bff.example.test/bff/events/stream",
      autoReconnect: false,
      fetchFn: fetchMock,
      onMessage,
    });

    await vi.waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith({
        event: "strategy.updated",
        id: "evt-200",
        data: '{"ok":true}',
      });
    });

    expect(refreshCalls).toBe(1);
    expect(streamAttempts).toBe(2);
    controller.close();
    resetSessionTransportForTests();
  });

  it("connectLiveSse cookie EventSource reconnects after refresh and does not mark fallback on refresh failure", async () => {
    resetSessionTransportForTests();
    clearAuthProvider();
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });

    const unauthorizedListener = vi.fn();
    const unsub = onBffUnauthorized(unauthorizedListener);

    const sources: Array<{
      url: string;
      close: ReturnType<typeof vi.fn>;
      onmessage: ((e: MessageEvent) => void) | null;
      onerror: ((e: Event) => void) | null;
      addEventListener: ReturnType<typeof vi.fn>;
    }> = [];
    const EventSourceMock = vi.fn((url: string) => {
      const instance = {
        url,
        close: vi.fn(),
        onmessage: null,
        onerror: null,
        addEventListener: vi.fn(),
      };
      sources.push(instance);
      return instance;
    });
    vi.stubGlobal("EventSource", EventSourceMock);

    let refreshShouldSucceed = true;
    const fetchMock = vi.fn(async () => {
      if (refreshShouldSucceed) {
        return new Response(
          JSON.stringify({ authenticated: true, expires_at: "2026-11-03T07:00:00Z" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "Refresh expired" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const close = connectLiveSse({
      channels: ["strategy"],
    });
    expect(sources).toHaveLength(1);

    // 1st error: refresh succeeds -> EventSource reconnects
    sources[0].onerror?.(new Event("error"));
    await vi.waitFor(() => {
      expect(sources).toHaveLength(2);
    });
    expect(unauthorizedListener).not.toHaveBeenCalled();

    // 2nd error: refresh fails -> unauthorized listener notified, liveStatus stays "live" (not fallback)
    refreshShouldSucceed = false;
    sources[1].onerror?.(new Event("error"));
    await vi.waitFor(() => {
      expect(unauthorizedListener).toHaveBeenCalledWith(
        expect.objectContaining({ confirmed: true }),
      );
    });
    expect(sources).toHaveLength(2);
    expect(liveStatus.get().effective).toBe("live");

    unsub();
    close();
    resetSessionTransportForTests();
    liveStatus._reset();
  });
});

