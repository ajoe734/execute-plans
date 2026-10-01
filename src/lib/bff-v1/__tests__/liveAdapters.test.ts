import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { realtime } from "@/lib/bff-v1";
import { bffV5 } from "@/lib/bff-v1/v5Client";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { connectLiveSse, _resetLiveSse } from "@/lib/bff-v1/sse/liveSse";



const realFetch = globalThis.fetch;
const realEventSource = globalThis.EventSource;

function resetLiveMode() {
  vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
}

describe("BFF live read adapters", () => {
  beforeEach(() => {
    resetLiveMode();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("v5 loop-runs use the live BFF route and adapt backend list DTOs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        items: [
          {
            id: "inc-loop-1",
            status: "open",
            activePeriod: { start: "2026-05-09T10:00:00Z", end: null },
            derived_from_incident_id: "inc-loop-1",
            runtime_id: "rt-loop-1",
          },
        ],
        meta: { snapshot_at: "2026-05-09T10:00:00Z" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    globalThis.fetch = fetchMock;

    const result = await bffV5.loops.list();

    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/v5/loop-runs");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("inc-loop-1");
    expect(result.items[0].status).toBe("running");
    expect(result.totalCountExact).toBe(true);
  });


});

describe("live SSE realtime bridge", () => {
  class MockEventSource {
    static instances: MockEventSource[] = [];
    url: string;
    withCredentials?: boolean;
    listeners = new Map<string, Array<(event: unknown) => void>>();
    closed = false;

    constructor(url: string, init?: EventSourceInit) {
      this.url = url;
      this.withCredentials = init?.withCredentials;
      MockEventSource.instances.push(this);
    }

    addEventListener(type: string, handler: (event: unknown) => void) {
      const current = this.listeners.get(type) ?? [];
      current.push(handler);
      this.listeners.set(type, current);
    }

    close() {
      this.closed = true;
    }

    emit(type: string, event: unknown = {}) {
      for (const handler of this.listeners.get(type) ?? []) handler(event);
    }
  }

  beforeEach(() => {
    MockEventSource.instances = [];
    resetLiveMode();
    vi.stubGlobal("EventSource", MockEventSource);
    _resetLiveSse();
  });

  afterEach(() => {
    _resetLiveSse();
    vi.stubGlobal("EventSource", realEventSource);
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("connects EventSource to /bff/events/stream with channels and Last-Event-Id query replay", () => {
    const close = connectLiveSse({ channels: ["system"], lastEventId: "evt-prev-1" });

    const instance = MockEventSource.instances[0];
    const url = new URL(instance.url, "https://bff.example.test");
    expect(url.pathname).toBe("/bff/events/stream");
    expect(url.searchParams.get("channels")).toBe("system");
    expect(url.searchParams.get("lastEventId")).toBe("evt-prev-1");
    expect(instance.withCredentials).toBe(true);

    close();
    expect(instance.closed).toBe(true);
  });

  it("updates realtime status and bridges live SSE envelopes onto legacy data listeners", () => {
    const seen: unknown[] = [];
    const off = realtime.on("data", (payload) => seen.push(payload));
    connectLiveSse({ channels: ["system"] });
    const instance = MockEventSource.instances[0];

    instance.emit("open");
    expect(realtime.getStatus()).toBe("live");

    instance.emit("message", {
      data: JSON.stringify({
        schemaVersion: 1,
        id: "evt-live-1",
        channel: "system",
        type: "system.heartbeat",
        occurredAt: "2026-05-09T10:00:00Z",
        payload: {},
      }),
    });

    expect(realtime.getLastEventId()).toBe("evt-live-1");
    expect(seen[0]).toMatchObject({ kind: "system", channel: "system", type: "system.heartbeat" });
    off();
  });

  it("ignores mock disconnect controls while configured for live mode", () => {
    realtime.markLiveOpen();
    realtime.setConnected(false);
    expect(realtime.isConnected()).toBe(true);
  });
});
