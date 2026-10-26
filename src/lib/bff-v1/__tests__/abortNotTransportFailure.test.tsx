import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAbortError, isTimeoutError } from "@/lib/bff-v1/errors";
import { strictLiveRead } from "@/lib/bff-v1/domainReads";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { useLiveDetail } from "@/lib/bff-v1/useLiveDetail";
import { useLiveListV1 } from "@/lib/bff-v1/useLiveListV1";
import { __resetV5LiveCacheForTests, useV5Live } from "@/management/pages/v5/useV5Live";

const abortErr = () => new DOMException("signal is aborted without reason", "AbortError");
const timeoutErr = () => new DOMException("timed out", "TimeoutError");

/** fetch that stays pending until its signal aborts, then rejects like the browser. */
function hangingFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
}

function expectStillLive() {
  const s = liveStatus.get();
  expect(s.effective).toBe("live");
  expect(s.lastError).toBeUndefined();
}

beforeEach(() => {
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  liveStatus._reset();
  __resetV5LiveCacheForTests();
});

describe("isAbortError / isTimeoutError", () => {
  it("classifies caller aborts vs deadlines", () => {
    const c = new AbortController();
    c.abort();
    expect(isAbortError(abortErr())).toBe(true);
    expect(isAbortError(new Error("x"), c.signal)).toBe(true);
    expect(isAbortError(timeoutErr())).toBe(false);
    expect(isTimeoutError(timeoutErr())).toBe(true);
    const t = new AbortController();
    t.abort(timeoutErr());
    expect(isAbortError(t.signal.reason, t.signal)).toBe(false);
    expect(isAbortError(new Error("x"), t.signal)).toBe(false);
    expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("strictLiveRead", () => {
  it("rethrows a caller abort without reporting fallback", async () => {
    hangingFetch();
    const c = new AbortController();
    const p = strictLiveRead("t", { method: "GET", path: "/bff/x", signal: c.signal }).catch((e: unknown) => e);
    c.abort();
    const err = await p;
    expect((err as Error).name).toBe("AbortError");
    expectStillLive();
  });

  it("still reports a TimeoutError as a strict failure", async () => {
    hangingFetch();
    const c = new AbortController();
    const p = strictLiveRead("t", { method: "GET", path: "/bff/x", signal: c.signal }).catch((e: unknown) => e);
    c.abort(timeoutErr());
    await p;
    expect(liveStatus.get().lastError).toMatch(/^strict:/);
  });

  it("still reports a network failure as a strict failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await strictLiveRead("t", { method: "GET", path: "/bff/x" }).catch((e: unknown) => e);
    expect(liveStatus.get().lastError).toMatch(/^strict: Failed to fetch/);
  });
});

describe("useLiveListV1", () => {
  const kinds = ["x"];
  it("ignores a caller abort", async () => {
    const loader = vi.fn().mockRejectedValue(abortErr());
    const { result } = renderHook(() => useLiveListV1(loader, kinds));
    await waitFor(() => expect(loader).toHaveBeenCalled());
    await act(async () => {});
    expectStillLive();
    expect(result.current.meta).toBeUndefined();
  });

  it("reports a timeout and a network failure", async () => {
    for (const err of [timeoutErr(), new TypeError("Failed to fetch")]) {
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
      const loader = vi.fn().mockRejectedValue(err);
      renderHook(() => useLiveListV1(loader, kinds));
      await waitFor(() => expect(liveStatus.get().lastError).toMatch(/^strict:/));
      cleanup();
    }
  });
});

describe("useLiveDetail", () => {
  it("ignores a caller abort", async () => {
    const loader = vi.fn().mockRejectedValue(abortErr());
    const { result } = renderHook(() => useLiveDetail("abc", loader));
    await waitFor(() => expect(loader).toHaveBeenCalled());
    await act(async () => {});
    expectStillLive();
    expect(result.current.status).not.toBe("error");
  });

  it("reports a timeout and a network failure", async () => {
    for (const err of [timeoutErr(), new TypeError("Failed to fetch")]) {
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
      const loader = vi.fn().mockRejectedValue(err);
      renderHook(() => useLiveDetail("abc", loader));
      await waitFor(() => expect(liveStatus.get().lastError).toMatch(/^strict:/));
      cleanup();
    }
  });
});

describe("useV5Live + TanStack", () => {
  it("unmounting during an in-flight fetch does not flip liveStatus", async () => {
    const spy = hangingFetch();
    function Probe() {
      useV5Live((signal) => strictLiveRead("t", { method: "GET", path: "/bff/x", signal }), [], {
        cacheKey: "abort-probe",
      });
      return null;
    }
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expectStillLive();
  });
});
