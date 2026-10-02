import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { Route, Routes } from "react-router-dom";
import {
  JobsPage,
  AlertsPage,
  IncidentsPage,
  ApprovalsPage,
  loadCachedListItems,
  updateCachedListItems,
  useCachedOperationList,
  __resetOperationListCacheForTests,
} from "./Operations";
import { BffError } from "@/lib/bff-v1/errors";
import { GovernanceReview } from "./GovernanceReview";
import { GovernanceQueuePage } from "./phase2/GovernanceQueue";
import { setAuthProvider, clearAuthProvider } from "@/lib/bff-v1/headers";
import { getSharedQueryClient, clearScopedQueries } from "@/lib/bff-v1/queryKeys";
import type { Job, Alert, Incident } from "@/lib/bff-v1";

const m = vi.hoisted(() => ({
  decide: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const { mockRealtime, mockJobs, mockAlerts, mockIncidents } = vi.hoisted(() => {
  const mockRealtime = {
    on: vi.fn(() => () => {}),
  };

  const mockJobs: Job[] = [
    {
      id: "job-101",
      kind: "backtest",
      status: "running",
      owner: "trader-alpha",
      startedAt: "2026-09-17T08:00:00Z",
    },
  ];

  const mockAlerts: Alert[] = [
    {
      id: "alt-201",
      title: "Margin threshold 80% reached",
      severity: "high",
      source: "risk-engine",
      openedAt: "2026-09-17T08:15:00Z",
      acknowledged: false,
    },
  ];

  const mockIncidents: Incident[] = [
    {
      id: "inc-301",
      title: "Market feed latency spike",
      severity: "high",
      status: "open",
      openedAt: "2026-09-17T08:30:00Z",
    },
  ];

  return { mockRealtime, mockJobs, mockAlerts, mockIncidents };
});

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    lists: {
      jobs: vi.fn().mockResolvedValue({ items: mockJobs }),
      alerts: vi.fn().mockResolvedValue({ items: mockAlerts }),
      incidents: vi.fn().mockResolvedValue({ items: mockIncidents }),
      approvals: () => m.list().then((items: unknown[]) => ({ items })),
      audit: vi.fn().mockResolvedValue({ items: [] }),
    },
    realtime: mockRealtime,
    bffV1: { approvals: { get: m.get, list: m.list }, audit: { list: () => Promise.resolve([]) } },
  };
});

vi.mock("@/lib/bff-v1/writes", async (importOriginal) => {
  const actual = await importOriginal<{ bffWrites: object }>();
  return { ...actual, bffWrites: { ...actual.bffWrites, decideApproval: m.decide } };
});
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/management/components/governance/PolicyValidatorPanel", () => ({ PolicyValidatorPanel: () => null }));

vi.mock("@/platform/hooks", () => ({
  useT: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "page.jobsSubtitle") return `Jobs count: ${params?.count ?? 0}`;
    return key;
  },
}));

import { MemoryRouter } from "react-router-dom";

describe("Operations caller migration and cache isolation (F12/S05)", () => {
  beforeEach(() => {
    __resetOperationListCacheForTests();
    clearAuthProvider();
    vi.clearAllMocks();
    m.list.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    __resetOperationListCacheForTests();
    clearAuthProvider();
  });

  describe("Operations callers migrated to TanStack Query", () => {
    it("renders JobsPage with items loaded through TanStack Query", async () => {
      render(
        <MemoryRouter>
          <JobsPage />
        </MemoryRouter>
      );
      expect(await screen.findByText("job-101")).toBeInTheDocument();
      expect(screen.getByText("trader-alpha")).toBeInTheDocument();
    });

    it("renders AlertsPage with items loaded through TanStack Query", async () => {
      render(
        <MemoryRouter>
          <AlertsPage />
        </MemoryRouter>
      );
      expect(await screen.findByText("Margin threshold 80% reached")).toBeInTheDocument();
    });

    it("renders IncidentsPage with items loaded through TanStack Query", async () => {
      render(
        <MemoryRouter>
          <IncidentsPage />
        </MemoryRouter>
      );
      expect(await screen.findByText("Market feed latency spike")).toBeInTheDocument();
    });

    it("loadCachedListItems deduplicates subsequent requests and serves fresh cache", async () => {
      const loader = vi.fn().mockResolvedValue({ items: [{ id: "item-1" }] });
      const res1 = await loadCachedListItems("test.dedup", loader);
      expect(res1).toEqual([{ id: "item-1" }]);
      expect(loader).toHaveBeenCalledTimes(1);

      const res2 = await loadCachedListItems("test.dedup", loader);
      expect(res2).toEqual([{ id: "item-1" }]);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("updateCachedListItems updates data in query cache directly", async () => {
      const loader = vi.fn().mockResolvedValue({ items: [{ id: "j1", name: "Initial" }] });
      await loadCachedListItems("test.update", loader);

      updateCachedListItems<{ id: string; name: string }>("test.update", (old) => [
        ...old,
        { id: "j2", name: "Added" },
      ]);

      const updated = await loadCachedListItems<{ id: string; name: string }>("test.update", loader);
      expect(updated).toHaveLength(2);
      expect(updated[1].name).toEqual("Added");
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe("Identity switch cache isolation", () => {
    it("ensures different operators do not share or reuse cached operation queries", async () => {
      // 1. Operator 1 queries jobs
      setAuthProvider({
        getTenantId: () => "tenant-alpha",
        getUserId: () => "operator-1",
        getToken: () => "token-op1",
      });

      const op1Loader = vi.fn().mockResolvedValue({
        items: [{ id: "op1-job", kind: "etl", status: "ok", owner: "op1", startedAt: "2026-09-17" }],
      });

      const op1Data = await loadCachedListItems<Job>("operations.jobs", op1Loader);
      expect(op1Data[0].id).toBe("op1-job");
      expect(op1Loader).toHaveBeenCalledTimes(1);

      // 2. Identity switches to Operator 2
      setAuthProvider({
        getTenantId: () => "tenant-alpha",
        getUserId: () => "operator-2",
        getToken: () => "token-op2",
      });

      const op2Loader = vi.fn().mockResolvedValue({
        items: [{ id: "op2-job", kind: "backtest", status: "ok", owner: "op2", startedAt: "2026-09-17" }],
      });

      // Operator 2 must NOT receive operator-1's cached data
      const op2Data = await loadCachedListItems<Job>("operations.jobs", op2Loader);
      expect(op2Data[0].id).toBe("op2-job");
      expect(op2Loader).toHaveBeenCalledTimes(1);

      // Returning to Operator 1 serves Operator 1's cache without re-querying
      setAuthProvider({
        getTenantId: () => "tenant-alpha",
        getUserId: () => "operator-1",
        getToken: () => "token-op1",
      });

      const op1Cached = await loadCachedListItems<Job>("operations.jobs", op1Loader);
      expect(op1Cached[0].id).toBe("op1-job");
      expect(op1Loader).toHaveBeenCalledTimes(1);
    });
  });

  describe("Environment switch cache isolation", () => {
    it("ensures different tenant or environment scopes isolate cached reads", async () => {
      // Tenant A
      setAuthProvider({
        getTenantId: () => "tenant-A",
        getUserId: () => "common-user",
        getToken: () => "token-A",
      });

      const loaderA = vi.fn().mockResolvedValue({
        items: [{ id: "alert-A", severity: "low", message: "Env A message", source: "A", occurredAt: "2026-09-17" }],
      });
      const dataA = await loadCachedListItems<Alert>("operations.alerts", loaderA);
      expect(dataA[0].id).toBe("alert-A");

      // Switch to Tenant B
      setAuthProvider({
        getTenantId: () => "tenant-B",
        getUserId: () => "common-user",
        getToken: () => "token-B",
      });

      const loaderB = vi.fn().mockResolvedValue({
        items: [{ id: "alert-B", severity: "high", message: "Env B message", source: "B", occurredAt: "2026-09-17" }],
      });
      const dataB = await loadCachedListItems<Alert>("operations.alerts", loaderB);
      expect(dataB[0].id).toBe("alert-B");
      expect(loaderB).toHaveBeenCalledTimes(1);
    });
  });

  describe("Stale in-flight response cannot overwrite new scope", () => {
    it("discards late in-flight response when scope changes before response resolves", async () => {
      let resolveOp1!: (value: { items: Job[] }) => void;
      const slowOp1Loader = vi.fn().mockImplementation(
        () => new Promise<{ items: Job[] }>((resolve) => { resolveOp1 = resolve; })
      );

      function TestHookComponent({ cacheKey }: { cacheKey: string }) {
        const [rows] = useCachedOperationList<Job>(cacheKey, slowOp1Loader);
        return <div data-testid="job-count">{rows.length}</div>;
      }

      // 1. User 1 starts in-flight fetch
      setAuthProvider({
        getTenantId: () => "tenant-1",
        getUserId: () => "user-1",
        getToken: () => "tok-1",
      });

      const qc = getSharedQueryClient();
      const inFlightPromise = loadCachedListItems<Job>("operations.jobs", slowOp1Loader);

      // 2. Identity switches to User 2 before User 1's fetch completes
      setAuthProvider({
        getTenantId: () => "tenant-1",
        getUserId: () => "user-2",
        getToken: () => "tok-2",
      });

      const op2Loader = vi.fn().mockResolvedValue({
        items: [
          { id: "op2-fast", kind: "execution", status: "running", owner: "user-2", startedAt: "2026-09-17" },
        ],
      });

      const op2Data = await loadCachedListItems<Job>("operations.jobs", op2Loader);
      expect(op2Data[0].id).toBe("op2-fast");

      // 3. User 1's slow response finally resolves
      resolveOp1({
        items: [
          { id: "op1-stale", kind: "backtest", status: "done", owner: "user-1", startedAt: "2026-09-17" },
        ],
      });
      await inFlightPromise;

      // 4. Verify User 2's cache was NOT overwritten by User 1's late response
      const op2Current = await loadCachedListItems<Job>("operations.jobs", op2Loader);
      expect(op2Current[0].id).toBe("op2-fast");
      expect(op2Current[0].id).not.toBe("op1-stale");
    });

    it("discards same-key stale response when a forced reload supersedes an in-flight request", async () => {
      setAuthProvider({
        getTenantId: () => "tenant-1",
        getUserId: () => "user-1",
        getToken: () => "tok-1",
      });

      let resolveSlow!: (value: { items: Job[] }) => void;
      const slowLoader = vi.fn().mockImplementation(
        () => new Promise<{ items: Job[] }>((resolve) => { resolveSlow = resolve; })
      );

      // 1. Initial slow query starts
      const slowPromise = loadCachedListItems<Job>("operations.jobs", slowLoader).catch(() => []);

      // 2. Forced reload supersedes slow query
      const freshLoader = vi.fn().mockResolvedValue({
        items: [
          { id: "op-fresh", kind: "execution", status: "running", owner: "user-1", startedAt: "2026-09-17" },
        ],
      });
      const freshData = await loadCachedListItems<Job>("operations.jobs", freshLoader, { force: true });
      expect(freshData[0].id).toBe("op-fresh");

      // 3. Stale query resolves later
      resolveSlow({
        items: [
          { id: "op-stale", kind: "backtest", status: "done", owner: "user-1", startedAt: "2026-09-17" },
        ],
      });
      await slowPromise;

      // 4. Cache must retain fresh data
      const currentData = await loadCachedListItems<Job>("operations.jobs", freshLoader);
      expect(currentData[0].id).toBe("op-fresh");
      expect(currentData[0].id).not.toBe("op-stale");
    });
  });

  describe("Logout cache isolation", () => {
    it("cancels in-flight queries and clears cached operations data on logout", async () => {
      // 1. Log in and load data
      setAuthProvider({
        getTenantId: () => "tenant-prod",
        getUserId: () => "operator-prod",
        getToken: () => "auth-bearer",
      });

      const loader = vi.fn().mockResolvedValue({
        items: [{ id: "confidential-job", kind: "live", status: "running", owner: "prod", startedAt: "2026-09-17" }],
      });

      const data = await loadCachedListItems<Job>("operations.jobs", loader);
      expect(data[0].id).toBe("confidential-job");
      expect(loader).toHaveBeenCalledTimes(1);

      // 2. Logout occurs
      clearAuthProvider();
      await clearScopedQueries();

      // 3. Subsequent query as unauthenticated/anonymous must re-query and not see cached data
      const anonLoader = vi.fn().mockResolvedValue({
        items: [],
      });

      const anonData = await loadCachedListItems<Job>("operations.jobs", anonLoader);
      expect(anonData).toEqual([]);
      expect(anonLoader).toHaveBeenCalledTimes(1);
    });
  });

  describe("AbortSignal cancellation", () => {
    it("threads AbortSignal through to loader and aborts on force cancellation", async () => {
      let receivedSignal: AbortSignal | undefined;
      const slowLoader = vi.fn().mockImplementation((signal?: AbortSignal) => {
        receivedSignal = signal;
        return new Promise<{ items: Job[] }>(() => {});
      });

      const slowPromise = loadCachedListItems<Job>("operations.jobs", slowLoader).catch(() => []);
      expect(slowLoader).toHaveBeenCalledTimes(1);
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal?.aborted).toBe(false);

      // Force reload cancels prior query
      const freshLoader = vi.fn().mockResolvedValue({ items: [] });
      await loadCachedListItems<Job>("operations.jobs", freshLoader, { force: true });
      expect(receivedSignal?.aborted).toBe(true);
      await slowPromise;
    });

    it("passes explicit opts.signal to loader and respects manual abort", async () => {
      const controller = new AbortController();
      let receivedSignal: AbortSignal | undefined;
      const loader = vi.fn().mockImplementation((signal?: AbortSignal) => {
        receivedSignal = signal;
        return new Promise<{ items: Job[] }>((resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      const promise = loadCachedListItems<Job>("operations.jobs", loader, { signal: controller.signal });
      expect(receivedSignal).toBe(controller.signal);
      expect(receivedSignal?.aborted).toBe(false);

      controller.abort();
      expect(receivedSignal?.aborted).toBe(true);
      await expect(promise).rejects.toThrow("Aborted");
    });
  });
});

const MEMO = "Reviewed the diff and the validator output in full.";
const row = (id: string, version: number, state = "pending") => ({
  id, kind: "Strategy", subject: `subj-${id}`, requester: "u1", riskLevel: "medium",
  createdAt: "2026-10-01T00:00:00Z", state, version,
});
const conflict = () => new BffError(409, {
  error: { code: "CONFLICT", message: "stale", i18nKey: "x", retryable: false, userActionable: true, correlationId: "c" },
} as never);
const unavailable = () => new BffError(503, {
  error: { code: "UNAVAILABLE", message: "owner down", i18nKey: "x", retryable: true, userActionable: false, correlationId: "c" },
} as never);

const confirm = (name: string) => {
  fireEvent.change(screen.getByPlaceholderText("confirm.memoPlaceholder"), { target: { value: MEMO } });
  const boxes = screen.getAllByRole("textbox");
  if (boxes.length > 1) fireEvent.change(boxes[boxes.length - 1], { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "actions.confirm" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  m.list.mockReset();
  m.get.mockReset();
  m.decide.mockReset();
  __resetOperationListCacheForTests();
  m.decide.mockResolvedValue({ ok: true, data: { approvalId: "a1", decision: "approve" }, correlationId: "c", idempotencyKey: "k" });
});

describe("Approval callers: Operations ApprovalsPage", () => {
  const open = async () => {
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("subj-a1"));
  };

  it("sends the exact memo and displayed owner version, then reads back without claiming final state", async () => {
    m.list.mockResolvedValue([row("a1", 7)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("a1", "approve", MEMO, { expectedVersion: 7 }));
    await waitFor(() => expect(m.toast.success).toHaveBeenCalled());
    expect(m.list).toHaveBeenCalledTimes(2);
  });

  it("passes the reject memo and version", async () => {
    m.list.mockResolvedValue([row("a1", 3)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.reject" }));
    confirm("REJECT");
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("a1", "reject", MEMO, { expectedVersion: 3 }));
  });

  it("warns instead of reporting success when the owner readback fails", async () => {
    m.list.mockResolvedValueOnce([row("a1", 7)]).mockRejectedValue(new Error("readback down"));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("refreshes on 409 without re-voting", async () => {
    m.decide.mockRejectedValue(conflict());
    m.list.mockResolvedValueOnce([row("a1", 7)]).mockResolvedValue([row("a1", 8)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.decide).toHaveBeenCalledTimes(1);
    expect(m.list).toHaveBeenCalledTimes(2);
  });

  it("does not claim a refreshed state on 409 when the refresh fails", async () => {
    m.decide.mockRejectedValue(conflict());
    m.list.mockResolvedValueOnce([row("a1", 7)]).mockRejectedValue(new Error("down"));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith("governance.conflictReadbackFailed"));
  });

  it("Retry after an owner error re-sends the same memo and version", async () => {
    m.decide.mockRejectedValueOnce(unavailable());
    m.list.mockResolvedValue([row("a1", 7)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith("owner down", expect.anything()));
    m.toast.error.mock.calls[0][1].action.onClick();
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(2));
    expect(m.decide.mock.calls[1]).toEqual(m.decide.mock.calls[0]);
  });
});

describe("GovernanceReview", () => {
  const open = async () => {
    render(
      <MemoryRouter initialEntries={["/g/a1"]}>
        <Routes><Route path="/g/:id" element={<GovernanceReview />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "governance.decision.approve" }));
  };

  it("submits the displayed version and shows the owner's still-pending state after a first vote", async () => {
    m.get.mockResolvedValueOnce(row("a1", 5)).mockResolvedValue(row("a1", 6));
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("a1", "approve", MEMO, { expectedVersion: 5 }));
    await waitFor(() => expect(m.toast.success).toHaveBeenCalled());
    expect(m.toast.success.mock.calls[0][0]).toContain("governance.voteSubmitted");
    expect(m.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/already decided/i)).toBeNull();
  });

  it("Retry after an owner failure re-sends the same attempt without reloading", async () => {
    m.get.mockResolvedValue(row("a1", 5));
    m.decide.mockRejectedValueOnce(unavailable());
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith("owner down", expect.anything()));
    expect(m.get).toHaveBeenCalledTimes(1);
    m.toast.error.mock.calls[0][1].action.onClick();
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(2));
    expect(m.decide.mock.calls[1]).toEqual(m.decide.mock.calls[0]);
  });

  it("warns when readback fails after an accepted vote", async () => {
    m.get.mockResolvedValueOnce(row("a1", 5)).mockRejectedValue(new Error("down"));
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("refreshes on 409 and does not re-vote", async () => {
    m.get.mockResolvedValueOnce(row("a1", 5)).mockResolvedValue(row("a1", 6));
    m.decide.mockRejectedValue(conflict());
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.decide).toHaveBeenCalledTimes(1);
    expect(m.get).toHaveBeenCalledTimes(2);
  });
});

describe("GovernanceQueuePage batch", () => {
  const select = async () => {
    render(<MemoryRouter><GovernanceQueuePage /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText("select a1"));
    fireEvent.click(screen.getByLabelText("select a2"));
    fireEvent.click(screen.getByRole("button", { name: "governance.batch.approve" }));
  };

  it("votes each item with its own displayed version and reloads", async () => {
    m.list.mockResolvedValue([row("a1", 2), row("a2", 9)]);
    await select();
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(2));
    expect(m.decide).toHaveBeenCalledWith("a1", "approve", MEMO, { expectedVersion: 2 });
    expect(m.decide).toHaveBeenCalledWith("a2", "approve", MEMO, { expectedVersion: 9 });
    await waitFor(() => expect(m.list).toHaveBeenCalledTimes(2));
  });

  it("does not re-vote a 409 item and retries an ambiguous failure with its original version and memo", async () => {
    m.list.mockResolvedValueOnce([row("a1", 2), row("a2", 9)]).mockResolvedValue([row("a1", 3), row("a2", 10)]);
    m.decide.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(unavailable());
    await select();
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledTimes(2));
    m.toast.error.mock.calls.find((c) => c[1]?.action)![1].action.onClick();
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(3));
    expect(m.decide.mock.calls[2]).toEqual(["a2", "approve", MEMO, { expectedVersion: 9 }]);
  });

  it("submits only the current selection after a failed item is deselected", async () => {
    m.list.mockResolvedValue([row("a1", 2), row("a2", 9)]);
    m.decide.mockRejectedValueOnce(unavailable());
    await select();
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText("select a1"));
    fireEvent.click(screen.getByLabelText("select a2"));
    fireEvent.click(screen.getByRole("button", { name: "governance.batch.reject" }));
    confirm("BATCH.REJECT");
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(3));
    expect(m.decide.mock.calls.slice(2).map((c) => c[0])).toEqual(["a2"]);
    expect(m.decide.mock.calls[2]).toEqual(["a2", "reject", MEMO, { expectedVersion: 9 }]);
  });

  it("keeps each retry bound to its own attempt when attempts interleave", async () => {
    m.list.mockResolvedValue([row("a1", 2), row("a2", 9)]);
    m.decide.mockRejectedValueOnce(unavailable()).mockResolvedValueOnce({} as never).mockRejectedValueOnce(unavailable());
    await select(); // attempt 1: a1 fails, a2 ok
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledTimes(1));
    const firstRetry = m.toast.error.mock.calls[0][1].action.onClick;
    fireEvent.click(await screen.findByLabelText("select a2")); // attempt 2: reject a2 only, fails
    fireEvent.click(screen.getByRole("button", { name: "governance.batch.reject" }));
    confirm("BATCH.REJECT");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledTimes(2));
    m.decide.mockClear();
    firstRetry(); // must resend attempt 1's item only
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(1));
    expect(m.decide.mock.calls[0]).toEqual(["a1", "approve", MEMO, { expectedVersion: 2 }]);
  });

  it("warns when the post-batch readback fails", async () => {
    m.list.mockResolvedValueOnce([row("a1", 2), row("a2", 9)]).mockRejectedValue(new Error("down"));
    await select();
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
  });
});
