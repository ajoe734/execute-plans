import { afterEach, describe, expect, it, vi } from "vitest";
import { bffFetch } from "@/lib/bff-v1/client";
import {
  getWorkshop,
  getWorkshopCompleteness,
  getWorkshopReadiness,
  listWorkshopCards,
  listWorkshopEvents,
  listWorkshops,
  openWorkshopStream,
  postWorkshopMessage,
  type WorkshopCard,
  type WorkshopStreamEvent,
} from "./workshops";
import type { StrategyWorkshop } from "./types";
import { materializeWorkshopCompleteness } from "@/agora/components/workshopCompletenessDisplay";

vi.mock("@/lib/bff-v1/client", () => ({
  bffFetch: vi.fn(),
  detectBaseUrl: () => "https://bff.example.test",
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
  it("unwraps a data envelope for created message reads", async () => {
    const message = {
      message_id: "msg-001",
      workshop_id: "ws-001",
      created_at: "2026-07-08T00:00:00Z",
    };
    vi.mocked(bffFetch).mockResolvedValue({ data: message });

    const result = await postWorkshopMessage("ws-001", { content: "Continue" });

    expect(result).toEqual(message);
  });
});

describe("openWorkshopStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the workshop stream via authenticated fetch and forwards parsed stream events", async () => {
    const streamEvent = {
      event_id: "evt-001",
      workshop_id: "ws/001",
      event_type: "workshop.snapshot",
      payload: {},
      occurred_at: "2026-06-01T00:00:00Z",
    };
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`id: evt-001\nevent: workshop.snapshot\ndata: ${JSON.stringify({ data: streamEvent })}\n\n`),
          );
          controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const onEvent = vi.fn<(event: WorkshopStreamEvent) => void>();

    const cleanup = openWorkshopStream("ws/001", onEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bff.example.test/bff/agora/workshops/ws%2F001/stream");
    expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
    expect(init.credentials).toBe("include");

    expect(onEvent).toHaveBeenCalledWith(streamEvent);

    cleanup();
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });
});
