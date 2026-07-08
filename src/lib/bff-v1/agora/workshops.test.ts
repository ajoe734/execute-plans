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

vi.mock("@/lib/bff-v1/client", () => ({
  bffFetch: vi.fn(),
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
  it("returns a React effect cleanup and forwards parsed stream events", () => {
    const close = vi.fn();
    const source = { close, onmessage: null as ((message: MessageEvent<string>) => void) | null };
    const EventSourceMock = vi.fn().mockReturnValue(source);
    vi.stubGlobal("EventSource", EventSourceMock);
    const onEvent = vi.fn<(event: WorkshopStreamEvent) => void>();

    const cleanup = openWorkshopStream("ws/001", onEvent);

    expect(EventSourceMock).toHaveBeenCalledWith(
      "/bff/agora/workshops/ws%2F001/stream",
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
    expect(onEvent).toHaveBeenCalledWith({
      event_id: "evt-001",
      workshop_id: "ws/001",
      event_type: "workshop.snapshot",
      payload: {},
      occurred_at: "2026-06-01T00:00:00Z",
    });

    cleanup();
    expect(close).toHaveBeenCalled();
  });
});
