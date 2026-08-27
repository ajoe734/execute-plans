import { afterEach, describe, expect, it, vi } from "vitest";
import { bffFetch, detectBaseUrl } from "@/lib/bff-v1/client";
import { clearAuthProvider, setAuthProvider } from "@/lib/bff-v1/headers";
import {
  getWorkshop,
  getWorkshopWithEtag,
  getWorkshopCompleteness,
  getWorkshopReadiness,
  dispatchWorkshopResearchRun,
  listWorkshopCards,
  listWorkshopEvents,
  listWorkshops,
  openWorkshopStream,
  postWorkshopMessage,
  reconstructWorkshopStrategy,
  type WorkshopCard,
  type WorkshopStreamEvent,
} from "./workshops";
import type { StrategyWorkshop } from "./types";
import { materializeWorkshopCompleteness } from "@/agora/components/workshopCompletenessDisplay";

vi.mock("@/lib/bff-v1/client", () => ({
  bffFetch: vi.fn(),
  detectBaseUrl: vi.fn(() => ""),
}));


const mockWorkshop: StrategyWorkshop = {
  spec_version: "1.0",
  workshop_id: "ws-001",
  operator_id: "operator-001",
  status: "open",
  subject: {
    kind: "free_form",
    ref: "strategy-draft-001",
    title: "Momentum draft",
  },
  created_at: "2026-06-01T00:00:00Z",
};

const mockCard: WorkshopCard = {
  spec_version: "1.0",
  card_id: "card-001",
  card_type: "next_question",
  workshop_id: "ws-001",
  sequence_no: 1,
  status: "action_required",
  title: "Next question",
  payload: { question: "What is the entry rule?" },
  created_at: "2026-06-01T00:00:00Z",
};

const mockEvent: WorkshopStreamEvent = {
  event_id: "evt-001",
  workshop_id: "ws-001",
  event_type: "workshop.snapshot",
  payload: {},
  occurred_at: "2026-06-01T00:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listWorkshops", () => {
  it("unwraps live envelope items to the page array contract", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { items: [mockWorkshop], cursor: "next" } });

    const result = await listWorkshops();

    expect(result).toEqual([mockWorkshop]);
  });

  it("accepts bare array compatibility responses", async () => {
    vi.mocked(bffFetch).mockResolvedValue([mockWorkshop]);

    const result = await listWorkshops();

    expect(result).toEqual([mockWorkshop]);
  });

  it("returns an empty array for malformed list envelopes", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { items: { workshop_id: "not-an-array" } } });

    const result = await listWorkshops();

    expect(result).toEqual([]);
  });
});

describe("getWorkshop", () => {
  it("unwraps a data envelope for single workshop reads", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: mockWorkshop });

    const result = await getWorkshop("ws-001");

    expect(result).toEqual(mockWorkshop);
  });

  it("retains the BFF-issued current ETag without deriving a version from the body", async () => {
    const etag = 'W/"workshop:ws-001:v17"';
    vi.mocked(bffFetch).mockResolvedValue({ data: mockWorkshop, meta: { etag } });

    await expect(getWorkshopWithEtag("ws-001")).resolves.toEqual({
      workshop: mockWorkshop,
      etag,
    });
  });

  it("fails closed when the authoritative Workshop readback omits its ETag", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: mockWorkshop, meta: {} });

    await expect(getWorkshopWithEtag("ws-001")).rejects.toThrow(
      "Authoritative Workshop readback omitted its current ETag precondition.",
    );
  });
});

describe("dispatchWorkshopResearchRun", () => {
  it("uses the deployed plural research-runs route without inventing an empty payload", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { research_run_id: "run-001" } });

    await dispatchWorkshopResearchRun("ws/001");

    expect(bffFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/bff/agora/workshops/ws%2F001/research-runs",
      body: undefined,
    });
  });
});

describe("dispatchWorkshopResearchRun", () => {
  it("uses the deployed plural research-runs route without inventing an empty payload", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { research_run_id: "run-001" } });

    await dispatchWorkshopResearchRun("ws/001");

    expect(bffFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/bff/agora/workshops/ws%2F001/research-runs",
      body: undefined,
    });
  });
});

describe("getWorkshopCompleteness", () => {
  it("returns null for a not-yet-assessed `{ data: null }` envelope instead of a truthy placeholder", async () => {
    // AG-DYNUI-PROD-006: the hosted dev BFF returns `{"data": null}` (200 OK)
    // for a workshop that has not been assessed yet. Before this fix,
    // `dataFrom()`'s `root.data ?? value` fell through to the raw envelope,
    // producing a truthy `{ data: null, meta: {...} }` placeholder that
    // crashed StrategyCompletenessRail's `completeness.dimensions.length`.
    vi.mocked(bffFetch).mockResolvedValue({
      data: null,
      meta: { snapshot_at: "2026-07-04T17:32:02Z" },
    });

    const result = await getWorkshopCompleteness("ws-001");

    expect(result).toBeNull();
  });

  it("materializes the exact hosted snapshot shape from the same server-derived card grade", async () => {
    const liveSnapshot = {
      snapshot_id: "8f7dc9e4-108f-4067-8d05-9cad30c7e17a",
      workshop_id: "b888fb96-12b4-46e1-8def-ffe4f29b5ad7",
      strategy_version_id: "full003-postdeploy-1783268578-f4b6f0-v1",
      state_map_json: {
        data_pit: "confirmed",
        liquidity: "confirmed",
        entry_signal: "confirmed",
        universe_rule: "confirmed",
        position_sizing: "confirmed",
        risk_constraints: "confirmed",
        exit_invalidation: "confirmed",
      },
      blocking_items_json: [],
      next_question_json: {},
      created_at: "2026-07-05 16:22:58+00",
    };
    vi.mocked(bffFetch).mockResolvedValue({
      data: liveSnapshot,
      meta: {
        snapshot_at: "2026-07-13T12:38:05Z",
        capability: "agora.workshop.v1",
        audience: "tenant:pantheon-dev:user:pantheon-dev-browser",
      },
    });
    const completenessCard: WorkshopCard = {
      spec_version: "1.0",
      card_id: "card_completeness_8f7dc9e4-108f-4067-8d05-9cad30c7e17a",
      card_type: "completeness_update",
      workshop_id: liveSnapshot.workshop_id,
      sequence_no: 2,
      workshop_version_id: liveSnapshot.strategy_version_id,
      strategy_spec_registry_id: "full003-postdeploy-1783268578-f4b6f0",
      status: "completed",
      title: "Strategy completeness updated",
      payload: {
        overall_grade: "complete",
        dimension_updates: Object.entries(liveSnapshot.state_map_json).map(([dimension, current_grade]) => ({
          dimension,
          prior_grade: "unknown",
          current_grade,
          gaps: [],
          required_actions: [],
        })),
        blockers: [],
        research_ready: true,
        readiness_gates: ["preliminary_research", "full_validation", "trading_room"],
        change_since_previous: "latest_snapshot",
      },
      created_at: liveSnapshot.created_at,
    };

    const rawCompleteness = await getWorkshopCompleteness(liveSnapshot.workshop_id);
    const display = materializeWorkshopCompleteness(rawCompleteness, completenessCard);

    expect(rawCompleteness).toEqual(liveSnapshot);
    expect(display).toMatchObject({
      completeness_id: liveSnapshot.snapshot_id,
      overall_grade: "complete",
      research_ready: true,
      strategy_ref: liveSnapshot.strategy_version_id,
      workshop_id: liveSnapshot.workshop_id,
    });
    expect(display?.dimensions).toHaveLength(7);
    expect(display?.dimensions.every((dimension) => dimension.grade === "complete")).toBe(true);
    expect(materializeWorkshopCompleteness(rawCompleteness, {
      ...completenessCard,
      workshop_version_id: "stale-workshop-version",
    })).toBeNull();
    expect(materializeWorkshopCompleteness(rawCompleteness, {
      ...completenessCard,
      card_id: "card_completeness_newer-same-version-snapshot",
    })).toBeNull();
  });
});

describe("getWorkshopReadiness", () => {
  it("returns null for a not-yet-assessed `{ data: null }` envelope instead of a truthy placeholder", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: null,
      meta: { snapshot_at: "2026-07-04T17:32:02Z" },
    });

    const result = await getWorkshopReadiness("ws-001");

    expect(result).toBeNull();
  });
});

describe("listWorkshopCards", () => {
  it("unwraps live card items to the page array contract", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { items: [mockCard] } });

    const result = await listWorkshopCards("ws-001");

    expect(result).toEqual([mockCard]);
  });

  it("accepts card alias envelopes", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { cards: [mockCard] } });

    const result = await listWorkshopCards("ws-001");

    expect(result).toEqual([mockCard]);
  });
});

describe("listWorkshopEvents", () => {
  it("unwraps live event items to the page object contract", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { items: [mockEvent] } });

    const result = await listWorkshopEvents("ws-001");

    expect(result).toEqual({ items: [mockEvent] });
  });

  it("accepts event alias envelopes", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: { events: [mockEvent] } });

    const result = await listWorkshopEvents("ws-001");

    expect(result).toEqual({ items: [mockEvent] });
  });
});

describe("postWorkshopMessage", () => {
  it("unwraps the durable 202 Workshop event receipt", async () => {
    const receipt = {
      event_id: "evt-001",
      sequence_no: 2,
    };
    vi.mocked(bffFetch).mockResolvedValue({ data: receipt });

    const etag = 'W/"workshop:ws-001:v17"';
    const result = await postWorkshopMessage("ws-001", { content: "Continue" }, { ifMatch: etag });

    expect(result).toEqual(receipt);
    expect(bffFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/bff/agora/workshops/ws-001/messages",
      body: { content: "Continue" },
      headers: { "If-Match": etag },
    });
  });

  it("fails closed instead of issuing a mutation without an If-Match precondition", async () => {
    await expect(
      postWorkshopMessage("ws-001", { content: "Continue" }, { ifMatch: "   " }),
    ).rejects.toThrow("Workshop message requires the current If-Match precondition.");
    expect(bffFetch).not.toHaveBeenCalled();
  });
});

describe("reconstructWorkshopStrategy", () => {
  it("returns the canonical reconstruction result identity from the durable BFF route", async () => {
    const result = { data: { reconstruction_id: "reconstruction-001" }, meta: {} };
    vi.mocked(bffFetch).mockResolvedValue(result);

    await expect(reconstructWorkshopStrategy("ws/001")).resolves.toEqual(result);

    expect(bffFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/bff/agora/workshops/ws%2F001/reconstruct",
    });
  });
});

describe("openWorkshopStream", () => {
  afterEach(() => {
    clearAuthProvider();
    vi.restoreAllMocks();
  });

  it("cookie sessions use the configured BFF origin and native EventSource", () => {
    clearAuthProvider();
    vi.mocked(detectBaseUrl).mockReturnValue("https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io");
    const close = vi.fn();
    const source = { close, onmessage: null as ((message: MessageEvent<string>) => void) | null, addEventListener: vi.fn() };
    const EventSourceMock = vi.fn().mockReturnValue(source);
    vi.stubGlobal("EventSource", EventSourceMock);
    const onEvent = vi.fn<(event: WorkshopStreamEvent) => void>();

    const cleanup = openWorkshopStream("ws/001", onEvent);

    expect(EventSourceMock).toHaveBeenCalledWith(
      "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io/bff/agora/workshops/ws%2F001/stream",
      { withCredentials: true },
    );
    source.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          data: {
            event_id: "evt-001",
            workshop_id: "ws/001",
            event_type: "workshop.snapshot",
            payload: {},
            occurred_at: "2026-06-01T00:00:00Z",
          },
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_id: "evt-001",
      workshop_id: "ws/001",
      event_type: "workshop.snapshot",
      payload: {},
    }));

    cleanup();
    expect(close).toHaveBeenCalled();
  });

  it("cookie sessions pass last_event_id query parameter when lastEventId option is supplied", () => {
    clearAuthProvider();
    vi.mocked(detectBaseUrl).mockReturnValue("https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io");
    const close = vi.fn();
    const source = { close, onmessage: null, addEventListener: vi.fn() };
    const EventSourceMock = vi.fn().mockReturnValue(source);
    vi.stubGlobal("EventSource", EventSourceMock);

    openWorkshopStream("ws-001", undefined, { lastEventId: "evt-099" });

    expect(EventSourceMock).toHaveBeenCalledWith(
      "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io/bff/agora/workshops/ws-001/stream?last_event_id=evt-099",
      { withCredentials: true },
    );
  });

  it("bearer sessions send Authorization and X-Tenant-Id with fetch SSE", async () => {
    setAuthProvider({
      getToken: () => "bearer-token-123",
      getTenantId: () => "tenant-dev",
    });
    vi.mocked(detectBaseUrl).mockReturnValue("https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io");

    const onEvent = vi.fn<(event: WorkshopStreamEvent) => void>();
    const onOpen = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      text: async () =>
        'event: workshop.connected\nid: evt-001\ndata: {"workshop_id":"ws-001","status":"open"}\n\n',
    });
    vi.stubGlobal("fetch", fetchMock);

    const cleanup = openWorkshopStream("ws-001", onEvent, { onOpen, lastEventId: "evt-prev" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io/bff/agora/workshops/ws-001/stream?last_event_id=evt-prev",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          Authorization: "Bearer bearer-token-123",
          "X-Tenant-Id": "tenant-dev",
          "Last-Event-ID": "evt-prev",
        }),
      }),
    );

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
        event_id: "evt-001",
        workshop_id: "ws-001",
        event_type: "workshop.connected",
      }));
    });

    cleanup();
  });

  it("HTML responses fail typed content checks", async () => {
    setAuthProvider({
      getToken: () => "bearer-token-123",
      getTenantId: () => "tenant-dev",
    });

    const onError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      text: async () => "<!DOCTYPE html><html><body>SPA fallback</body></html>",
    });
    vi.stubGlobal("fetch", fetchMock);

    const cleanup = openWorkshopStream("ws-001", undefined, { onError });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Invalid SSE Content-Type"),
        }),
      );
    });

    cleanup();
  });

  it("stops reconnect on 401/403 until auth refresh", async () => {
    setAuthProvider({
      getToken: () => "stale-bearer-token",
    });

    const onError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => '{"error":"token_expired"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    const cleanup = openWorkshopStream("ws-001", undefined, { onError });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("SSE auth failed with status 401"),
        }),
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("treats 409 replay-unavailable as a signal to trigger onResync", async () => {
    setAuthProvider({
      getToken: () => "bearer-token-123",
    });

    const onResync = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: "Conflict",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => '{"error":"replay_unavailable"}',
    });
    vi.stubGlobal("fetch", fetchMock);

    const cleanup = openWorkshopStream("ws-001", undefined, { onResync });

    await vi.waitFor(() => {
      expect(onResync).toHaveBeenCalledWith("replay_unavailable");
    });

    cleanup();
  });
});

