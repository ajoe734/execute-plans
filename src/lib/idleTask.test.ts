import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelIdleTask, scheduleIdleTask } from "@/lib/idleTask";

describe("scheduleIdleTask", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
    delete (window as unknown as { cancelIdleCallback?: unknown }).cancelIdleCallback;
  });

  it("uses requestIdleCallback when available", () => {
    const ric = vi.fn().mockReturnValue(42);
    const cic = vi.fn();
    (window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = ric;
    (window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback = cic;

    const callback = vi.fn();
    const handle = scheduleIdleTask(callback);
    expect(ric).toHaveBeenCalledWith(callback);
    expect(handle).toBe(42);

    cancelIdleTask(handle);
    expect(cic).toHaveBeenCalledWith(42);
  });

  it("falls back to setTimeout when requestIdleCallback is unavailable", () => {
    vi.useFakeTimers();
    // vitest's fake-timer install can itself define a fake requestIdleCallback;
    // force the "unavailable" branch deterministically for this test.
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    const callback = vi.fn();

    scheduleIdleTask(callback, 500);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancelIdleTask on the setTimeout fallback prevents the callback from firing", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    const callback = vi.fn();

    const handle = scheduleIdleTask(callback, 500);
    cancelIdleTask(handle);
    vi.advanceTimersByTime(1000);

    expect(callback).not.toHaveBeenCalled();
  });

  it("cancelIdleTask is a no-op for an undefined handle", () => {
    expect(() => cancelIdleTask(undefined)).not.toThrow();
  });
});
