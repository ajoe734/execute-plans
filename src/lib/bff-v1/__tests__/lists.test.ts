import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  lists,
  useLiveListV1,
  asListEnvelope,
  normalizeLiveListResponse,
  normalizeAlertListResponse,
  normalizeIncidentListResponse,
  normalizeRuntimeListResponse,
  type ListEnvelope,
} from "@/lib/bff-v1";
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

  it("normalizes operator alert payloads and preserves surface metadata", () => {
    const env = normalizeLiveListResponse<{ alert_id: string }>(
      {
        alerts: [{ alert_id: "al_1" }],
        meta: { surfaces: { alerts: { status: "degraded", source: "local_snapshot" } } },
      },
      "realtimeFeed",
    );

    expect(env.items).toEqual([{ alert_id: "al_1" }]);
    expect(env.meta).toEqual({ surfaces: { alerts: { status: "degraded", source: "local_snapshot" } } });
  });

  it("normalizes alert timestamp aliases into openedAt", () => {
    const env = normalizeAlertListResponse({
      alerts: [{
        alert_id: "al_1",
        severity: "high",
        message: "Paper drawdown breach",
        source_kind: "incident",
        created_at: "2026-06-30T19:54:38Z",
        acknowledged: false,
      }],
    });

    expect(env.items[0]).toMatchObject({
      id: "al_1",
      title: "Paper drawdown breach",
      source: "incident",
      openedAt: "2026-06-30T19:54:38Z",
      acknowledged: false,
    });
  });

  it("normalizes incident arrays and timestamp aliases into openedAt", () => {
    const env = normalizeIncidentListResponse({
      incidents: [{
        incident_id: "inc-1",
        severity: "critical",
        status: "open",
        summary: "Canary breach",
        detected_at: "2026-07-01T08:10:00Z",
        events: [{ created_at: "2026-07-01T08:11:00Z", user: "sentinel", message: "triaged" }],
      }],
    });

    expect(env.items[0]).toMatchObject({
      id: "inc-1",
      title: "Canary breach",
      openedAt: "2026-07-01T08:10:00Z",
      timeline: [{ ts: "2026-07-01T08:11:00Z", actor: "sentinel", note: "triaged" }],
    });
  });

  it("normalizes live runtime binding rows without inventing telemetry zeros", () => {
    const env = normalizeRuntimeListResponse({
      items: [{
        id: "rb-1",
        runtime_binding_id: "rb-1",
        runtime_id: "rt-persona-tw",
        runtime_kind: "paper",
        execution_mode: "paper",
        status: "active",
        metadata: { persona_id: "persona-tw" },
      }],
    });

    expect(env.items[0]).toMatchObject({
      id: "rt-persona-tw",
      name: "rt-persona-tw",
      runtimeId: "rt-persona-tw",
      runtimeBindingId: "rb-1",
      personaId: "persona-tw",
      kind: "paper",
      env: "paper",
      status: "active",
    });
    expect(Number.isNaN(env.items[0].cpu)).toBe(true);
    expect(Number.isNaN(env.items[0].memory)).toBe(true);
    expect(Number.isNaN(env.items[0].latencyP95Ms)).toBe(true);
    expect(Number.isNaN(env.items[0].uptimePct)).toBe(true);
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
