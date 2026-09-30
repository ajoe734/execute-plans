import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useServantStatus } from "./useServantStatus";

const mocks = vi.hoisted(() => ({ getServant: vi.fn(), ensureServant: vi.fn() }));
vi.mock("@/lib/bff-v1/agora/servant", () => mocks);

const servant = { persona_id: "p1", status: "active" };

describe("useServantStatus", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reports ready, missing and error states", async () => {
    mocks.getServant.mockResolvedValueOnce(servant);
    const ready = renderHook(() => useServantStatus());
    await waitFor(() => expect(ready.result.current.state.kind).toBe("ready"));

    mocks.getServant.mockResolvedValueOnce(null);
    const missing = renderHook(() => useServantStatus());
    await waitFor(() => expect(missing.result.current.state.kind).toBe("missing"));

    mocks.getServant.mockRejectedValueOnce(new Error("boom"));
    const failed = renderHook(() => useServantStatus());
    await waitFor(() => expect(failed.result.current.state).toEqual({ kind: "error", message: "boom" }));
  });

  it("creates via one ensure call and surfaces create failures", async () => {
    mocks.getServant.mockResolvedValue(null);
    mocks.ensureServant.mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(servant);
    const { result } = renderHook(() => useServantStatus());
    await waitFor(() => expect(result.current.state.kind).toBe("missing"));
    await act(() => result.current.create());
    expect(result.current.createError).toBe("denied");
    expect(result.current.state.kind).toBe("missing");
    await act(() => result.current.create());
    expect(result.current.state).toEqual({ kind: "ready", servant });
    expect(result.current.createError).toBeNull();
  });
});
