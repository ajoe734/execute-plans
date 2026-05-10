import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { lists, useLiveListV1, asListEnvelope, normalizeLiveListResponse, type ListEnvelope } from "@/lib/bff-v1";
import { realtime } from "@/lib/bff/realtime";

describe("VI-1 lists facade", () => {
  it("wraps legacy reader into ListEnvelope shape", async () => {
    const env = await lists.strategies();
    expect(env.totalCountExact).toBe(true);
    expect(env.cursor).toEqual({});
    expect(env.pageSize).toBe(env.items.length);
    expect(env.items.length).toBeGreaterThan(0);
    expect(env.items[0]).toHaveProperty("id");
  });

  it("asListEnvelope handles empty arrays", async () => {
    const loader = asListEnvelope(async () => [] as Array<{ id: string }>);
    const env = await loader();
    expect(env.items).toEqual([]);
    expect(env.estimatedTotal).toBe(0);
  });

  it("normalizes live BFF data/page_info payloads into ListEnvelope shape", () => {
    const env = normalizeLiveListResponse<{ id: string }>(
      {
        data: [{ id: "a" }],
        page_info: { next_page_token: "n1", total: 7 },
      },
      "entityRegistry",
    );

    expect(env.items).toEqual([{ id: "a" }]);
    expect(env.cursor.next).toBe("n1");
    expect(env.pageSize).toBe(1);
    expect(env.estimatedTotal).toBe(7);
    expect(env.totalCountExact).toBe(true);
  });

  it("normalizes live BFF items/count payloads into ListEnvelope shape", () => {
    const env = normalizeLiveListResponse<{ id: string }>(
      { items: [], count: 0 },
      "governanceQueue",
    );

    expect(env.items).toEqual([]);
    expect(env.pageSize).toBe(0);
    expect(env.estimatedTotal).toBe(0);
  });
});

describe("VI-1 useLiveListV1", () => {
  it("loads items + exposes envelope fields", async () => {
    const env: ListEnvelope<{ id: string; name: string }> = {
      items: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      cursor: { next: "x" }, pageSize: 2, estimatedTotal: 2, totalCountExact: true,
    };
    const loader = vi.fn().mockResolvedValue(env);
    const { result } = renderHook(() => useLiveListV1(loader, ["X"], { auto: false }));
    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.pageSize).toBe(2);
    expect(result.current.totalCountExact).toBe(true);
    expect(result.current.pending).toBe(0);
  });

  it("auto:false bumps pending; refresh applies", async () => {
    let n = 0;
    const loader = vi.fn().mockImplementation(async () =>
      ({ items: [{ id: `${n++}` }], cursor: {}, pageSize: 1, totalCountExact: true } as ListEnvelope<{ id: string }>),
    );
    const { result } = renderHook(() => useLiveListV1(loader, ["Strategy"], { auto: false }));
    await waitFor(() => expect(result.current.items.length).toBe(1));
    act(() => { realtime.emit("data", { kind: "Strategy" }); });
    await waitFor(() => expect(result.current.pending).toBe(1));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("ignores unrelated kinds", async () => {
    const loader = vi.fn().mockResolvedValue({
      items: [], cursor: {}, pageSize: 0, totalCountExact: true,
    } as ListEnvelope<unknown>);
    const { result } = renderHook(() => useLiveListV1(loader, ["Persona"], { auto: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { realtime.emit("data", { kind: "Strategy" }); });
    expect(result.current.pending).toBe(0);
  });
});
