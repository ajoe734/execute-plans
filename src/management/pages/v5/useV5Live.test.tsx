import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitV5Event } from "@/lib/bff-v1";
import { adaptHumanInboxList } from "@/lib/bff-v1/management";
import { __resetV5LiveCacheForTests, useV5Live } from "./useV5Live";

interface TestData {
  label: string;
}

function HookProbe({
  loader,
  cacheKey,
}: {
  loader: (signal?: AbortSignal) => Promise<TestData>;
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

  it("threads AbortSignal through to loader and aborts on unmount", async () => {
    let receivedSignal: AbortSignal | undefined;
    const slowLoader = vi.fn<(signal?: AbortSignal) => Promise<TestData>>().mockImplementation(
      (signal) => {
        receivedSignal = signal;
        return new Promise(() => {});
      }
    );

    render(<HookProbe loader={slowLoader} cacheKey="abort-test" />);
    expect(slowLoader).toHaveBeenCalledTimes(1);
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(false);

    cleanup();

    expect(receivedSignal?.aborted).toBe(true);
  });

  it("cancels prior in-flight request on same-key refresh and commits fresh data", async () => {
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;
    let resolveFirst!: (v: TestData) => void;
    let resolveSecond!: (v: TestData) => void;

    let callCount = 0;
    const loader = vi.fn<(signal?: AbortSignal) => Promise<TestData>>().mockImplementation(
      (signal) => {
        callCount++;
        if (callCount === 1) {
          firstSignal = signal;
          return new Promise((resolve) => { resolveFirst = resolve; });
        }
        secondSignal = signal;
        return new Promise((resolve) => { resolveSecond = resolve; });
      }
    );

    function RefreshProbe({ cacheKey }: { cacheKey: string }) {
      const { data, loading, refresh } = useV5Live(loader, [], { cacheKey });
      return (
        <div>
          <div data-testid="state">{loading ? "loading" : `ready:${data?.label ?? "none"}`}</div>
          <button data-testid="refresh-btn" onClick={() => refresh()}>refresh</button>
        </div>
      );
    }

    render(<RefreshProbe cacheKey="same-key-race" />);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(firstSignal?.aborted).toBe(false);

    // Trigger same-key refresh while first is in-flight
    await act(async () => {
      screen.getByTestId("refresh-btn").click();
    });

    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);

    // Resolve second request first
    await act(async () => {
      resolveSecond({ label: "fresh" });
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:fresh"));

    // Now late-resolve the first request - it must not overwrite fresh data
    await act(async () => {
      resolveFirst({ label: "stale" });
    });

    expect(screen.getByTestId("state")).toHaveTextContent("ready:fresh");
  });

  it("keeps last loaded data with refreshing=true and loading=false during manual refresh and v5 events", async () => {
    let resolveFirst!: (v: TestData) => void;
    let resolveSecond!: (v: TestData) => void;
    let resolveThird!: (v: TestData) => void;
    let callCount = 0;

    const loader = vi.fn<() => Promise<TestData>>().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      if (callCount === 2) return new Promise((resolve) => { resolveSecond = resolve; });
      return new Promise((resolve) => { resolveThird = resolve; });
    });

    function RefreshStateProbe() {
      const { data, loading, refreshing, refresh } = useV5Live(loader, [], { cacheKey: "refresh-state" });
      return (
        <div>
          <div data-testid="flags">{`loading:${loading}|refreshing:${refreshing}|data:${data?.label ?? "none"}`}</div>
          <button data-testid="manual-refresh" onClick={() => void refresh()}>refresh</button>
        </div>
      );
    }

    render(<RefreshStateProbe />);
    expect(screen.getByTestId("flags")).toHaveTextContent("loading:true|refreshing:false|data:none");

    await act(async () => {
      resolveFirst({ label: "v1" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("flags")).toHaveTextContent("loading:false|refreshing:false|data:v1"),
    );

    await act(async () => {
      screen.getByTestId("manual-refresh").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("flags")).toHaveTextContent("loading:false|refreshing:true|data:v1"),
    );

    await act(async () => {
      resolveSecond({ label: "v2" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("flags")).toHaveTextContent("loading:false|refreshing:false|data:v2"),
    );

    act(() => {
      emitV5Event({
        channel: "v5.sentinel.findings",
        type: "sentinel.finding.updated",
        payload: { id: "finding-2" },
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId("flags")).toHaveTextContent("loading:false|refreshing:true|data:v2"),
    );

    await act(async () => {
      resolveThird({ label: "v3" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("flags")).toHaveTextContent("loading:false|refreshing:false|data:v3"),
    );
  });

  it("exposes error when initial request fails and sets loading=true while retrying", async () => {
    let resolveRetry!: (v: TestData) => void;
    let callCount = 0;
    const loader = vi.fn<() => Promise<TestData>>().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("Holdings timeout"));
      return new Promise((resolve) => { resolveRetry = resolve; });
    });

    function ErrorRetryProbe() {
      const { data, loading, refreshing, error, refresh } = useV5Live(loader, [], { cacheKey: "error-retry" });
      return (
        <div>
          <div data-testid="status">
            {`loading:${loading}|refreshing:${refreshing}|data:${data?.label ?? "none"}|error:${error instanceof Error ? error.message : "none"}`}
          </div>
          <button data-testid="retry-btn" onClick={() => void refresh()}>retry</button>
        </div>
      );
    }

    render(<ErrorRetryProbe />);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("loading:false|refreshing:false|data:none|error:Holdings timeout"),
    );

    await act(async () => {
      screen.getByTestId("retry-btn").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("loading:true|refreshing:false|data:none"),
    );

    await act(async () => {
      resolveRetry({ label: "recovered" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("loading:false|refreshing:false|data:recovered|error:none"),
    );
  });

  it("preserves HumanInboxList top-level meta.surfaces and page_info through real useV5Live with a cacheKey across empty and non-empty responses", async () => {
    const emptyDegraded = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [],
        summary: { total: 0 },
        facets: {},
      },
      page_info: {
        next_page_token: null,
        total: 0,
        page_size: 50,
      },
      meta: {
        snapshot_at: "2026-11-04T12:00:00Z",
        surfaces: {
          human_inbox: {
            status: "degraded",
            reason: "read_timeout",
            source: "timeout_fallback",
            message: "Read timed out",
            snapshot_at: "2026-11-04T12:00:00Z",
          },
          governance_review_queue: {
            status: "unavailable",
            reason: "read_timeout",
            source: "timeout_fallback",
            message: "Queue unavailable",
            snapshot_at: "2026-11-04T12:00:00Z",
          },
        },
      },
    })!;

    const nonEmptyDegraded = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [
          {
            artifact_id: "art-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            artifact_version: "1.0.0",
            binding_id: "bind-persona-paper-1bad2eca6831457cd885",
            capital_pool_id: "pool-paper-default",
            created_at: "2026-11-04T11:58:00Z",
            deployment_plan_id: "deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            deployment_stage: "paper",
            evidence_summary: "Compensation saga entered safe mode.",
            incident_cluster_id: "cluster-deployment-comp-1bad2eca6831457cd885",
            incident_id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            lineage_ref: "lineage:deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            persona_capital_binding_id: "pcb-persona-paper-1bad2eca6831457cd885",
            reconciliation_ids: ["rec-1bad2eca6831457cd885"],
            resolved_at: null,
            runtime_id: "runtime-persona-paper-1bad2eca6831457cd885",
            severity: "critical",
            status: "open",
            telemetry_event_ids: ["tel-1bad2eca6831457cd885"],
            title: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            trace_id: "trace-1bad2eca6831457cd885",
          },
        ],
        summary: { total: 4 },
        facets: {},
      },
      page_info: {
        next_page_token: "tok-2",
        total: 4,
        page_size: 1,
      },
      meta: {
        snapshot_at: "2026-11-04T12:01:00Z",
        surfaces: {
          human_inbox: {
            status: "degraded",
            reason: "read_timeout",
            source: "timeout_fallback",
            message: "Partial timeout",
            snapshot_at: "2026-11-04T12:01:00Z",
          },
        },
      },
    })!;

    const loader = vi
      .fn()
      .mockResolvedValueOnce(emptyDegraded)
      .mockResolvedValueOnce(nonEmptyDegraded);

    function InboxCacheProbe() {
      const { data, loading, refresh } = useV5Live(loader, [], { cacheKey: "oversight.humanInbox" });
      return (
        <div>
          <div data-testid="inbox-meta">
            {loading
              ? "loading"
              : `${data?.length ?? 0}|${data?.meta?.surfaces?.human_inbox?.status ?? "none"}|${data?.meta?.surfaces?.governance_review_queue?.status ?? "none"}|${data?.page_info?.total ?? -1}`}
          </div>
          <button data-testid="inbox-refresh" onClick={() => void refresh()}>
            refresh
          </button>
        </div>
      );
    }

    render(<InboxCacheProbe />);
    await waitFor(() =>
      expect(screen.getByTestId("inbox-meta")).toHaveTextContent("0|degraded|unavailable|0"),
    );

    await act(async () => {
      screen.getByTestId("inbox-refresh").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("inbox-meta")).toHaveTextContent("1|degraded|none|4"),
    );
  });
});

