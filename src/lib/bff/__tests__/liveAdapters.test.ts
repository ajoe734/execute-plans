import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bff } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { connectLiveSse, _resetLiveSse } from "@/lib/bff-v1/sse/liveSse";
import { realtime } from "@/lib/bff/realtime";
import { bffV5 } from "@/lib/bff/v5";
import { BffError } from "@/lib/bff-v1/errors";

const realFetch = globalThis.fetch;

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

  it("strict v5 live mode throws instead of returning seeded mock data on transport failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(bffV5.sentinel.list()).rejects.toBeInstanceOf(BffError);
    expect(liveStatus.get().effective).toBe("mock");
  });

  it("Agora signals use live route DTOs when configured for live BFF", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        items: [
          {
            signal_id: "sig-live-001",
            title: "Opening auction momentum",
            symbol: "AAPL",
            side: "long",
            conviction: 0.76,
            reviewStatus: "pending_trader_review",
            updatedAt: "2026-05-09T10:30:00Z",
          },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    globalThis.fetch = fetchMock;

    const signals = await bff.agora.signals.list();

    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/agora/signals");
    expect(signals[0].id).toBe("sig-live-001");
    expect(signals[0].symbol).toBe("AAPL");
    expect(signals[0].reviewStatus).toBe("pending_trader_review");
  });

  it("Agora signal detail resolves through the canonical list route instead of a non-contract detail path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        items: [
          {
            signal_id: "sig-live-001",
            title: "Opening auction momentum",
            symbol: "AAPL",
            side: "long",
            conviction: 0.76,
            updatedAt: "2026-05-09T10:30:00Z",
          },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    globalThis.fetch = fetchMock;

    const signal = await bff.agora.signals.get("sig-live-001");

    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/agora/signals");
    expect(signal?.id).toBe("sig-live-001");
    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
  });

  it("Agora signal detail can render not-found without any BFF 404 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    globalThis.fetch = fetchMock;

    const signal = await bff.agora.signals.get("sig_missing");

    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/agora/signals");
    expect(signal).toBeUndefined();
    expect(liveStatus.get().effective).toBe("live");
    expect(liveStatus.get().lastError).toBeUndefined();
  });
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** `keepOpen: true` simulates the real BFF, which holds the connection open
 *  (heartbeats every ~30s) instead of closing after a frame — closing here
 *  would make the transport read as a dropped connection and re-trigger the
 *  reconnect/fallback path. */
function sseStreamResponse(frames: string[], { status = 200, keepOpen = false } = {}): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        if (!keepOpen) controller.close();
      },
    }),
    { status, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("live SSE realtime bridge", () => {
  beforeEach(() => {
    resetLiveMode();
    _resetLiveSse();
  });

  afterEach(() => {
    _resetLiveSse();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("opens /bff/events/stream via authenticated streaming fetch with channels and Last-Event-Id query replay", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseStreamResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const close = connectLiveSse({ channels: ["system"], lastEventId: "evt-prev-1" });
    await flush();

    const [requestUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(requestUrl, "https://bff.example.test");
    expect(url.pathname).toBe("/bff/events/stream");
    expect(url.searchParams.get("channels")).toBe("system");
    expect(url.searchParams.get("lastEventId")).toBe("evt-prev-1");
    expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
    expect(init.credentials).toBe("include");

    close();
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it("updates realtime status and bridges live SSE envelopes onto legacy data listeners", async () => {
    const seen: unknown[] = [];
    const off = realtime.on("data", (payload) => seen.push(payload));
    const envelope = {
      schemaVersion: 1,
      id: "evt-live-1",
      channel: "system",
      type: "system.heartbeat",
      occurredAt: "2026-05-09T10:00:00Z",
      payload: {},
    };
    const fetchMock = vi.fn().mockResolvedValue(
      sseStreamResponse(
        [`id: evt-live-1\nevent: system.heartbeat\ndata: ${JSON.stringify(envelope)}\n\n`],
        { keepOpen: true },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    connectLiveSse({ channels: ["system"] });
    await flush();

    expect(realtime.getStatus()).toBe("live");
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
