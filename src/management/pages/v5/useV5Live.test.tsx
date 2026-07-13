import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const { data, loading, error, refresh } = useV5Live(loader, [], { cacheKey });
  return (
    <div>
      <div data-testid="state">
        {loading ? "loading" : error ? `error:${error.message}` : `ready:${data?.label ?? "none"}`}
      </div>
      <div data-testid="data">{data?.label ?? "none"}</div>
      <button type="button" onClick={() => refresh()}>refresh</button>
    </div>
  );
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

  it("exposes an initial loader failure instead of treating missing data as ready", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loader = vi.fn<[], Promise<TestData>>().mockRejectedValue(new Error("request timed out"));

    render(<HookProbe loader={loader} cacheKey="human-inbox-initial-error" />);

    expect(await screen.findByTestId("state")).toHaveTextContent("error:request timed out");
    expect(screen.getByTestId("data")).toHaveTextContent("none");
  });

  it("clears the error after a successful retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loader = vi.fn<[], Promise<TestData>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ label: "recovered" });

    render(<HookProbe loader={loader} cacheKey="human-inbox-retry" />);
    expect(await screen.findByTestId("state")).toHaveTextContent("error:temporary failure");

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));

    expect(await screen.findByTestId("state")).toHaveTextContent("ready:recovered");
    expect(screen.getByTestId("data")).toHaveTextContent("recovered");
  });

  it("preserves confirmed data when a refresh fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loader = vi.fn<[], Promise<TestData>>()
      .mockResolvedValueOnce({ label: "confirmed" })
      .mockRejectedValueOnce(new Error("refresh timed out"));

    render(<HookProbe loader={loader} cacheKey="human-inbox-refresh-error" />);
    expect(await screen.findByTestId("state")).toHaveTextContent("ready:confirmed");

    act(() => {
      emitV5Event({
        channel: "v5.human-inbox",
        type: "human-inbox.refresh",
        payload: {},
      });
    });

    expect(await screen.findByTestId("state")).toHaveTextContent("error:refresh timed out");
    expect(screen.getByTestId("data")).toHaveTextContent("confirmed");
  });
});
