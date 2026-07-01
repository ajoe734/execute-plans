import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobProgressDrawer, useJobDrawer } from "./JobProgressDrawer";
import { lists } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

function resetJobDrawerStore() {
  useJobDrawer.setState({ expanded: false, jobs: [], hydrated: false });
}

describe("JobProgressDrawer — lazy job list hydration (MGMT-LOAD-003)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    liveStatus._reset({ mode: "mock", effective: "mock" });
    resetJobDrawerStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    liveStatus._reset();
    resetJobDrawerStore();
  });

  it("does not call lists.jobs() synchronously on mount", () => {
    const spy = vi.spyOn(lists, "jobs");
    render(<JobProgressDrawer />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("hydrates the job list on an idle callback after mount when never opened", async () => {
    const spy = vi.spyOn(lists, "jobs");
    render(<JobProgressDrawer />);
    expect(spy).not.toHaveBeenCalled();

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

    // The pending idle-callback fallback must have been cancelled; advancing
    // past its fallback window must not trigger a second /bff/jobs request.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
