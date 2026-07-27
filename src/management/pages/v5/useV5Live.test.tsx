import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitV5Event } from "@/lib/v5";
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
    const firstLoader = vi.fn<[], Promise<TestData>>().mockResolvedValue({ label: "first" });
    render(<HookProbe loader={firstLoader} cacheKey="sentinel" />);

    expect(await screen.findByTestId("state")).toHaveTextContent("ready:first");
    expect(firstLoader).toHaveBeenCalledTimes(1);

    cleanup();

    const secondLoader = vi.fn<[], Promise<TestData>>().mockResolvedValue({ label: "second" });
    render(<HookProbe loader={secondLoader} cacheKey="sentinel" />);

    expect(screen.getByTestId("state")).toHaveTextContent("ready:first");
    await waitFor(() => expect(secondLoader).not.toHaveBeenCalled());
  });

  it("refreshes cached data when a v5 event arrives", async () => {
    const loader = vi.fn<[], Promise<TestData>>()
      .mockResolvedValueOnce({ label: "first" })
      .mockResolvedValueOnce({ label: "second" });
    render(<HookProbe loader={loader} cacheKey="sentinel" />);

    expect(await screen.findByTestId("state")).toHaveTextContent("ready:first");

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
});
