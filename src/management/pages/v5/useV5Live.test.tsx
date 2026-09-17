import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitV5Event } from "@/lib/bff-v1";
import { __resetV5LiveCacheForTests, useV5Live } from "./useV5Live";

interface TestData {
  label: string;
}

function HookProbe({
  loader,
  cacheKey,
}: {
  loader: () => Promise<TestData>;
  cacheKey: string;
}) {
  const { data, loading } = useV5Live(loader, [], { cacheKey });
  return <div data-testid="state">{loading ? "loading" : `ready:${data?.label ?? "none"}`}</div>;
}

describe("useV5Live cache", () => {
  beforeEach(() => {
    __resetV5LiveCacheForTests();
  });

  afterEach(() => {
    cleanup();
    __resetV5LiveCacheForTests();
  });

  it("serves a fresh cache hit without calling the loader again", async () => {
    const firstLoader = vi.fn<() => Promise<TestData>>().mockResolvedValue({ label: "first" });
    render(<HookProbe loader={firstLoader} cacheKey="sentinel" />);

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:first"));
    expect(firstLoader).toHaveBeenCalledTimes(1);

    cleanup();

    const secondLoader = vi.fn<() => Promise<TestData>>().mockResolvedValue({ label: "second" });
    render(<HookProbe loader={secondLoader} cacheKey="sentinel" />);

    expect(screen.getByTestId("state")).toHaveTextContent("ready:first");
    await waitFor(() => expect(secondLoader).not.toHaveBeenCalled());
  });

  it("refreshes cached data when a v5 event arrives", async () => {
    const loader = vi.fn<() => Promise<TestData>>()
      .mockResolvedValueOnce({ label: "first" })
      .mockResolvedValueOnce({ label: "second" });
    render(<HookProbe loader={loader} cacheKey="sentinel" />);

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:first"));

    act(() => {
      emitV5Event({
        channel: "v5.sentinel.findings",
        type: "sentinel.finding.updated",
        payload: { id: "finding-1" },
      });
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:second"));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent reads for the same cache key", async () => {
    let resolveLoader!: (v: TestData) => void;
    const slowLoader = vi.fn<() => Promise<TestData>>().mockImplementation(
      () => new Promise((resolve) => { resolveLoader = resolve; })
    );

    render(
      <div>
        <HookProbe loader={slowLoader} cacheKey="shared-key" />
        <HookProbe loader={slowLoader} cacheKey="shared-key" />
      </div>
    );
    expect(slowLoader).toHaveBeenCalledTimes(1);

    act(() => {
      resolveLoader({ label: "deduped" });
    });

    await waitFor(() => {
      const states = screen.getAllByTestId("state");
      expect(states).toHaveLength(2);
      expect(states[0]).toHaveTextContent("ready:deduped");
      expect(states[1]).toHaveTextContent("ready:deduped");
    });
    expect(slowLoader).toHaveBeenCalledTimes(1);
  });

  it("isolates cache across distinct identity scopes", async () => {
    const { setAuthProvider, clearAuthProvider } = await import("@/lib/bff-v1/headers");
    setAuthProvider({ getToken: () => "tok-1", getTenantId: () => "tenant-1", getUserId: () => "user-1" });

    const loader1 = vi.fn<() => Promise<TestData>>().mockResolvedValue({ label: "user-1-data" });
    render(<HookProbe loader={loader1} cacheKey="scoped-res" />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:user-1-data"));
    expect(loader1).toHaveBeenCalledTimes(1);

    cleanup();

    // Switch identity to user-2
    setAuthProvider({ getToken: () => "tok-2", getTenantId: () => "tenant-1", getUserId: () => "user-2" });
    const loader2 = vi.fn<() => Promise<TestData>>().mockResolvedValue({ label: "user-2-data" });
    render(<HookProbe loader={loader2} cacheKey="scoped-res" />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:user-2-data"));
    expect(loader2).toHaveBeenCalledTimes(1);

    clearAuthProvider();
  });
});
