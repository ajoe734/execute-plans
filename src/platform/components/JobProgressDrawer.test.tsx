import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobProgressDrawer, toProgressFraction, useJobDrawer } from "./JobProgressDrawer";
import { lists, realtime } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { markRoutePrimaryReady, resetRoutePrimaryReadyForTests } from "@/platform/routePrimaryReady";

function resetJobDrawerStore() {
  useJobDrawer.setState({ expanded: false, jobs: [], hydrated: false });
}

describe("JobProgressDrawer — lazy job list hydration (MGMT-LOAD-003)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    liveStatus._reset({ mode: "mock", effective: "mock" });
    resetRoutePrimaryReadyForTests();
    resetJobDrawerStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetRoutePrimaryReadyForTests();
    liveStatus._reset();
    resetJobDrawerStore();
  });

  it("does not call lists.jobs() synchronously on mount", () => {
    const spy = vi.spyOn(lists, "jobs");
    render(<JobProgressDrawer />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("hydrates the job list after route-primary-ready and an idle callback when never opened", async () => {
    const spy = vi.spyOn(lists, "jobs");
    render(<JobProgressDrawer />);
    expect(spy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      markRoutePrimaryReady("/");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    // Seed mock jobs total 30, 13 of which count as running/queued/pending —
    // asserting on hydrated content (not just the fetch count) proves the
    // deferred fetch actually populated the drawer.
    expect(screen.getByText(/13/)).toBeInTheDocument();
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });

  it("hydrates immediately when the drawer is opened before the idle callback fires, without double-fetching", async () => {
    const spy = vi.spyOn(lists, "jobs");
    render(<JobProgressDrawer />);

    await act(async () => {
      useJobDrawer.getState().setExpanded(true);
      await Promise.resolve();
    });
    expect(spy).toHaveBeenCalledTimes(1);

    // The pending route-ready fallback must have been cancelled; marking the
    // route ready and advancing past the idle window must not trigger a second
    // /bff/jobs request.
    act(() => {
      markRoutePrimaryReady("/");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("JobProgressDrawer — no invented progress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    liveStatus._reset({ mode: "mock", effective: "mock" });
    resetRoutePrimaryReadyForTests();
    resetJobDrawerStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetRoutePrimaryReadyForTests();
    liveStatus._reset();
    resetJobDrawerStore();
  });

  it("toProgressFraction only accepts real numbers", () => {
    expect(toProgressFraction(0.4)).toBe(0.4);
    expect(toProgressFraction(40)).toBe(0.4);
    expect(toProgressFraction("0.25")).toBe(0.25);
    expect(toProgressFraction(undefined)).toBeUndefined();
    expect(toProgressFraction(null)).toBeUndefined();
    expect(toProgressFraction("n/a")).toBeUndefined();
    expect(toProgressFraction(-1)).toBeUndefined();
  });

  it("uses the row's real progress, shows no number for rows without one, and does not animate over time", async () => {
    vi.spyOn(lists, "jobs").mockResolvedValue({
      items: [
        { id: "j-real", kind: "k", owner: "o", startedAt: "2026-11-06T00:00:00Z", status: "running", progress: 0.35 },
        { id: "j-none", kind: "k", owner: "o", startedAt: "2026-11-06T00:00:00Z", status: "running" },
        { id: "j-done", kind: "k", owner: "o", startedAt: "2026-11-06T00:00:00Z", status: "success" },
      ],
      cursor: {},
      pageSize: 3,
      totalCountExact: true,
    } as never);
    render(<JobProgressDrawer />);
    await act(async () => {
      useJobDrawer.getState().setExpanded(true);
      await Promise.resolve();
    });
    const byId = () => Object.fromEntries(useJobDrawer.getState().jobs.map((j) => [j.id, j.progress]));
    expect(byId()).toEqual({ "j-real": 0.35, "j-none": undefined, "j-done": 1 });
    expect(screen.getAllByTestId("job-progress-indeterminate")).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(byId()).toEqual({ "j-real": 0.35, "j-none": undefined, "j-done": 1 });
  });

  it("applies realtime event progress when present and leaves it unset otherwise", async () => {
    let handler: ((p: unknown) => void) | undefined;
    vi.spyOn(realtime, "on").mockImplementation(((_kind: string, cb: (p: unknown) => void) => {
      handler = cb;
      return () => {};
    }) as never);
    useJobDrawer.setState({ hydrated: true });
    render(<JobProgressDrawer />);
    act(() => {
      handler?.({ jobId: "e1", kind: "k", owner: "o", ts: "2026-11-06T00:00:00Z", status: "running", progress: 0.6 });
      handler?.({ jobId: "e2", kind: "k", owner: "o", ts: "2026-11-06T00:00:00Z", status: "running" });
    });
    const byId = Object.fromEntries(useJobDrawer.getState().jobs.map((j) => [j.id, j.progress]));
    expect(byId).toEqual({ e1: 0.6, e2: undefined });
  });
});
