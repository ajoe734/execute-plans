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
import { normalizeApprovalFields } from "@/lib/bff-v1/operations";
import { GovernanceReview } from "./GovernanceReview";
import { GovernanceQueuePage } from "./phase2/GovernanceQueue";
import { setAuthProvider, clearAuthProvider } from "@/lib/bff-v1/headers";
import { getSharedQueryClient, clearScopedQueries } from "@/lib/bff-v1/queryKeys";
import { lists, normalizeAlertListResponse } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { LiveStatusBanner } from "@/components/layout/LiveStatusBanner";
import type { Job, Alert, Incident } from "@/lib/bff-v1";

const m = vi.hoisted(() => ({
  decide: vi.fn(),
  list: vi.fn(),
  listDecisions: vi.fn(),
  get: vi.fn(),
  runAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  translate: null as ((key: string, params?: Record<string, unknown>) => string) | null,
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
    runActionSafe: (...args: unknown[]) => (m.runAction.getMockImplementation() ? m.runAction(...args) : (actual.runActionSafe as (...a: unknown[]) => unknown)(...args)),
    bffV1: { approvals: { get: m.get, list: m.list, listDecisions: m.listDecisions }, audit: { list: () => Promise.resolve([]) } },
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
    if (m.translate) return m.translate(key, params);
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
  m.listDecisions.mockReset();
  m.get.mockReset();
  m.decide.mockReset();
  m.translate = null;
  __resetOperationListCacheForTests();
  m.decide.mockResolvedValue({ ok: true, data: { approvalId: "a1", decision: "approve" }, correlationId: "c", idempotencyKey: "k" });
  m.listDecisions.mockResolvedValue([]);
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

  it("lists a new owner-shaped proposed proposal as pending and votes with its version", async () => {
    m.list.mockResolvedValue([{
      decision_id: "dec_p1", target_type: "persona_lifecycle_transition", target_id: "subj-p1", owner_user_id: "u1",
      risk_level: "medium", created_at: "2026-10-01T00:00:00Z", decision_state: "proposed", state: "pending", version: 2,
    }]);
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("subj-p1"));
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("dec_p1", "approve", MEMO, { expectedVersion: 2 }));
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

  const realDecidedBase = {
    version: 2,
    actor_id: "pantheon-dev-admin-test",
    decision: "approved",
    rationale: "approval",
    target_id: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
    tenant_id: "tenant-dev",
    actor_role: "governance_reviewer",
    conditions: [],
    created_at: "2026-11-01T14:50:02Z",
    decided_at: "2026-11-01T14:50:02Z",
    expires_at: "2026-11-08T14:50:02Z",
    persona_id: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
    revoked_at: null,
    risk_level: "low",
    decision_id: "apv-07db6c62179bfb41bcb790001c955022535fe863aa003a8458e1eea8d62c7574",
    target_type: "registry_entry",
    evidence_refs: [],
    owner_user_id: "pantheon-dev-admin-test",
    decision_state: "decided",
    target_version: "1.0.0",
    capital_pool_id: "hosted-all12-h12-claude-20261027-4923-pool",
    authority_status: "authoritative",
  };

  it("fetches GET /api/v1/approval-decisions only when the all filter is selected and lists decided and revoked records sorted newest first by decided_at then created_at", async () => {
    m.list.mockResolvedValue([row("pending-1", 1)]);
    m.listDecisions.mockResolvedValue([
      {
        ...realDecidedBase,
        decision_id: "apv-older-decided",
        target_id: "target-older-decided",
        created_at: "2026-11-01T10:00:00Z",
        decided_at: "2026-11-01T12:00:00Z",
      },
      {
        ...realDecidedBase,
        decision_id: "apv-newest-decided",
        target_id: "target-newest-decided",
        decision: "rejected",
        created_at: "2026-11-01T09:00:00Z",
        decided_at: "2026-11-02T15:00:00Z",
      },
      {
        ...realDecidedBase,
        decision_id: "apv-same-decided-newer-created",
        target_id: "target-same-decided-newer-created",
        decision_state: "revoked",
        decision: "approved",
        created_at: "2026-11-01T11:30:00Z",
        decided_at: "2026-11-01T12:00:00Z",
      },
    ].map((r) => normalizeApprovalFields(r)));

    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    expect(await screen.findByText("subj-pending-1")).toBeInTheDocument();
    expect(m.list).toHaveBeenCalledTimes(1);
    expect(m.listDecisions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
    expect(await screen.findByText("target-newest-decided")).toBeInTheDocument();
    expect(m.listDecisions).toHaveBeenCalledTimes(1);

    const cells = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(cells).toHaveLength(3);
    expect(cells[0]).toContain("target-newest-decided");
    expect(cells[0]).toContain("status.rejected");
    expect(cells[1]).toContain("target-same-decided-newer-created");
    expect(cells[1]).toContain("status.revoked");
    expect(cells[2]).toContain("target-older-decided");
    expect(cells[2]).toContain("status.approved");
  });

  it("sorts a proposed row created after the newest decision first when decided_at is null", async () => {
    m.list.mockResolvedValue([]);
    m.listDecisions.mockResolvedValue([
      {
        ...realDecidedBase,
        decision_id: "apv-newest-decided",
        target_id: "target-newest-decided",
        decision: "approved",
        created_at: "2026-11-01T09:00:00Z",
        decided_at: "2026-11-02T15:00:00Z",
      },
      {
        ...realDecidedBase,
        decision_id: "apv-newer-proposed",
        target_id: "target-newer-proposed",
        decision_state: "proposed",
        decision: null,
        actor_id: null,
        created_at: "2026-11-03T10:00:00Z",
        decided_at: null,
      },
    ].map((r) => normalizeApprovalFields(r)));

    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
    expect(await screen.findByText("target-newer-proposed")).toBeInTheDocument();

    const cells = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toContain("target-newer-proposed");
    expect(cells[0]).toContain("status.pending");
    expect(cells[1]).toContain("target-newest-decided");
    expect(cells[1]).toContain("status.approved");
  });

  it("renders localized zh-TW status labels 已駁回 and 已撤銷 for rejected and revoked rows", async () => {
    const zhTW = (await import("@/i18n/locales/zh-TW")).default;
    const enUS = (await import("@/i18n/locales/en-US")).default;
    expect(zhTW.status.rejected).toBe("已駁回");
    expect(zhTW.status.revoked).toBe("已撤銷");
    expect(zhTW.status.superseded).toBe("已取代");
    expect(enUS.status.rejected).toBe("Rejected");
    expect(enUS.status.revoked).toBe("Revoked");
    expect(enUS.status.superseded).toBe("Superseded");

    m.translate = (key: string, params?: Record<string, unknown>) => {
      const [ns, field] = key.split(".");
      const dict = zhTW as unknown as Record<string, Record<string, string>>;
      return dict[ns]?.[field] ?? (params?.defaultValue as string | undefined) ?? key;
    };
    m.list.mockResolvedValue([]);
    m.listDecisions.mockResolvedValue([
      {
        ...realDecidedBase,
        decision_id: "apv-zh-rejected",
        target_id: "target-zh-rejected",
        decision_state: "decided",
        decision: "rejected",
        decided_at: "2026-11-02T15:00:00Z",
      },
      {
        ...realDecidedBase,
        decision_id: "apv-zh-revoked",
        target_id: "target-zh-revoked",
        decision_state: "revoked",
        decision: "approved",
        decided_at: "2026-11-01T12:00:00Z",
      },
    ].map((r) => normalizeApprovalFields(r)));

    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: zhTW.filter.all }));
    expect(await screen.findByText("target-zh-rejected")).toBeInTheDocument();

    const cells = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toContain("target-zh-rejected");
    expect(cells[0]).toContain("已駁回");
    expect(cells[1]).toContain("target-zh-revoked");
    expect(cells[1]).toContain("已撤銷");
  });

  it("filters rows by decision id, target id, persona id, and capital pool id via the search box", async () => {
    m.list.mockResolvedValue([]);
    m.listDecisions.mockResolvedValue([
      realDecidedBase,
      {
        ...realDecidedBase,
        decision_id: "apv-other-999",
        target_id: "other-strategy-target-beta",
        persona_id: "persona-beta-777",
        capital_pool_id: "pool-beta-888",
      },
    ].map((r) => normalizeApprovalFields(r)));

    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
    expect(await screen.findByText(realDecidedBase.target_id)).toBeInTheDocument();
    expect(screen.getByText("other-strategy-target-beta")).toBeInTheDocument();

    const searchbox = screen.getByRole("searchbox");

    // Target ID fragment
    fireEvent.change(searchbox, { target: { value: "4923-execution-artifact" } });
    expect(screen.getByText(realDecidedBase.target_id)).toBeInTheDocument();
    expect(screen.queryByText("other-strategy-target-beta")).toBeNull();

    // Decision ID fragment
    fireEvent.change(searchbox, { target: { value: "apv-other-999" } });
    expect(screen.getByText("other-strategy-target-beta")).toBeInTheDocument();
    expect(screen.queryByText(realDecidedBase.target_id)).toBeNull();

    // Persona ID fragment
    fireEvent.change(searchbox, { target: { value: "106b4057d07a" } });
    expect(screen.getByText(realDecidedBase.target_id)).toBeInTheDocument();
    expect(screen.queryByText("other-strategy-target-beta")).toBeNull();

    // Capital pool ID fragment
    fireEvent.change(searchbox, { target: { value: "pool-beta-888" } });
    expect(screen.getByText("other-strategy-target-beta")).toBeInTheDocument();
    expect(screen.queryByText(realDecidedBase.target_id)).toBeNull();
  });

  it("shows decider, decided time, expiry, persona, and capital pool in the detail sheet (or dash when absent) and hides approve/reject controls on non-pending rows", async () => {
    m.list.mockResolvedValue([]);
    m.listDecisions.mockResolvedValue([
      realDecidedBase,
      {
        decision_id: "apv-minimal-rejected",
        target_type: "Strategy",
        target_id: "target-minimal-rejected",
        owner_user_id: "u-req",
        risk_level: "high",
        created_at: "2026-11-01T10:00:00Z",
        decision_state: "decided",
        decision: "rejected",
        actor_id: null,
        decided_at: null,
        expires_at: null,
        persona_id: null,
        capital_pool_id: null,
      },
    ].map((r) => normalizeApprovalFields(r)));

    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
    fireEvent.click(await screen.findByText(realDecidedBase.target_id));

    expect(await screen.findByText(realDecidedBase.persona_id)).toBeInTheDocument();
    expect(screen.getByText(realDecidedBase.capital_pool_id)).toBeInTheDocument();
    expect(screen.getAllByText("pantheon-dev-admin-test").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: "actions.approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "actions.reject" })).toBeNull();

    fireEvent.click(screen.getByText("target-minimal-rejected"));
    await waitFor(() => expect(screen.getByText("apv-minimal-rejected")).toBeInTheDocument());
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByRole("button", { name: "actions.approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "actions.reject" })).toBeNull();
  });

  it("shows an error state and never an empty table when reading the decisions route fails", async () => {
    m.list.mockResolvedValue([row("a1", 1)]);
    m.listDecisions.mockRejectedValue(new Error("decisions endpoint 503"));

    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    expect(await screen.findByText("subj-a1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("page.approvalsDecisionsError");
    expect(alert).toHaveTextContent("decisions endpoint 503");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("states that decided records are under the all filter when pending view is empty and carries every new label in both locales", async () => {
    const enUS = (await import("@/i18n/locales/en-US")).default;
    const zhTW = (await import("@/i18n/locales/zh-TW")).default;

    const newPageKeys = [
      "approvalsPendingEmpty",
      "approvalsDecisionsError",
      "approvalsDecider",
      "approvalsDecidedAt",
      "approvalsExpiresAt",
      "approvalsPersona",
      "approvalsCapitalPool",
    ] as const;
    for (const k of newPageKeys) {
      expect(typeof enUS.page[k]).toBe("string");
      expect(enUS.page[k].length).toBeGreaterThan(0);
      expect(typeof zhTW.page[k]).toBe("string");
      expect(zhTW.page[k].length).toBeGreaterThan(0);
    }
    expect(enUS.filter.approvalsSearch.length).toBeGreaterThan(0);
    expect(zhTW.filter.approvalsSearch.length).toBeGreaterThan(0);

    m.list.mockResolvedValue([]);
    m.translate = (key: string) => {
      const [ns, field] = key.split(".");
      const dict = enUS as unknown as Record<string, Record<string, string>>;
      return dict[ns]?.[field] ?? key;
    };

    const { unmount } = render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    expect(await screen.findByText(enUS.page.approvalsPendingEmpty)).toBeInTheDocument();
    expect(enUS.page.approvalsPendingEmpty).toMatch(/decided.*all/i);
    unmount();

    __resetOperationListCacheForTests();
    m.translate = (key: string) => {
      const [ns, field] = key.split(".");
      const dict = zhTW as unknown as Record<string, Record<string, string>>;
      return dict[ns]?.[field] ?? key;
    };
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    expect(await screen.findByText(zhTW.page.approvalsPendingEmpty)).toBeInTheDocument();
    expect(zhTW.page.approvalsPendingEmpty).toMatch(/已決策.*全部/);
  });

  it("wraps the full 68-character id with min-w-0 and break-all in the approval drawer and all Operations sheet headers without truncation while keeping StatusBadge and RiskBadge whitespace-nowrap", async () => {
    m.list.mockResolvedValue([]);
    m.listDecisions.mockResolvedValue([normalizeApprovalFields(realDecidedBase)]);

    const { unmount } = render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
    const targetCell = await screen.findByText(realDecidedBase.target_id);

    const tableStatusBadge = screen.getByText("status.approved");
    const tableRiskBadge = screen.getByText("risk.low");
    expect(tableStatusBadge).toHaveClass("whitespace-nowrap");
    expect(tableRiskBadge).toHaveClass("whitespace-nowrap");

    fireEvent.click(targetCell);

    const approvalIdSpan = await screen.findByText(realDecidedBase.decision_id);
    expect(realDecidedBase.decision_id).toHaveLength(68);
    expect(approvalIdSpan.tagName).toBe("SPAN");
    expect(approvalIdSpan).toHaveTextContent(realDecidedBase.decision_id);
    expect(approvalIdSpan.textContent).not.toContain("...");
    expect(approvalIdSpan.textContent).not.toContain("…");
    expect(approvalIdSpan).toHaveClass("min-w-0", "break-all", "text-mono", "text-xs", "text-muted-foreground");
    expect(approvalIdSpan).not.toHaveClass("truncate", "text-ellipsis");

    const statusBadges = screen.getAllByText("status.approved");
    const riskBadges = screen.getAllByText("risk.low");
    expect(statusBadges).toHaveLength(2);
    expect(riskBadges).toHaveLength(2);
    for (const badge of [...statusBadges, ...riskBadges]) {
      expect(badge).toHaveClass("whitespace-nowrap");
    }
    unmount();

    const alertRender = render(<MemoryRouter><AlertsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Margin threshold 80% reached"));
    const alertIdSpan = await screen.findByText("alt-201");
    expect(alertIdSpan).toHaveClass("min-w-0", "break-all", "text-mono", "text-xs", "text-muted-foreground");
    expect(alertIdSpan).not.toHaveClass("truncate", "text-ellipsis");
    alertRender.unmount();

    const incidentRender = render(<MemoryRouter><IncidentsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Market feed latency spike"));
    const incidentIdSpan = await screen.findByText("inc-301");
    expect(incidentIdSpan).toHaveClass("min-w-0", "break-all", "text-mono", "text-xs", "text-muted-foreground");
    expect(incidentIdSpan).not.toHaveClass("truncate", "text-ellipsis");
    incidentRender.unmount();
  });

  it("reserves right padding (pr-6) for the sheet close button on the header row in the approval drawer and all three Operations sheet headers while keeping the full 68-character id without truncation", async () => {
    m.list.mockResolvedValue([]);
    m.listDecisions.mockResolvedValue([normalizeApprovalFields(realDecidedBase)]);

    const approvalRender = render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
    fireEvent.click(await screen.findByText(realDecidedBase.target_id));

    const approvalDialog = await screen.findByRole("dialog");
    const approvalIdSpan = await screen.findByText(realDecidedBase.decision_id);
    expect(approvalIdSpan.textContent).toBe(realDecidedBase.decision_id);
    expect(approvalIdSpan.textContent).toHaveLength(68);
    expect(approvalIdSpan.textContent).not.toContain("...");
    expect(approvalIdSpan.textContent).not.toContain("…");
    expect(approvalIdSpan).toHaveClass("min-w-0", "break-all", "text-mono", "text-xs", "text-muted-foreground");
    expect(approvalIdSpan).not.toHaveClass("truncate", "text-ellipsis");
    expect(approvalIdSpan.parentElement).not.toBeNull();
    expect(approvalIdSpan.parentElement).toHaveClass("flex", "items-center", "gap-2", "mb-2", "pr-6");

    const sheetCloseBtn = Array.from(approvalDialog.children).find((el) => el.tagName === "BUTTON");
    expect(sheetCloseBtn).toBeDefined();
    expect(sheetCloseBtn).toHaveClass("absolute", "right-4", "top-4");
    approvalRender.unmount();

    const alertRender = render(<MemoryRouter><AlertsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Margin threshold 80% reached"));
    const alertIdSpan = await screen.findByText("alt-201");
    expect(alertIdSpan.textContent).toBe("alt-201");
    expect(alertIdSpan).toHaveClass("min-w-0", "break-all");
    expect(alertIdSpan).not.toHaveClass("truncate", "text-ellipsis");
    expect(alertIdSpan.parentElement).toHaveClass("flex", "items-center", "gap-2", "mb-2", "pr-6");
    alertRender.unmount();

    const incidentRender = render(<MemoryRouter><IncidentsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Market feed latency spike"));
    const incidentIdSpan = await screen.findByText("inc-301");
    expect(incidentIdSpan.textContent).toBe("inc-301");
    expect(incidentIdSpan).toHaveClass("min-w-0", "break-all");
    expect(incidentIdSpan).not.toHaveClass("truncate", "text-ellipsis");
    expect(incidentIdSpan.parentElement).toHaveClass("flex", "items-center", "gap-2", "mb-2", "pr-6");
    incidentRender.unmount();
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


describe("Jobs and incidents server paging (FE-OPS-JOBS-INCIDENTS-PAGING-20261106)", () => {
  type Listed = { items: unknown[]; cursor: { next?: string }; estimatedTotal: number };
  const jobRow = (id: string) => ({ id, kind: "backtest", status: "running", owner: "o", startedAt: "2026-09-17T08:00:00Z" });
  const incRow = (id: string, title: string) => ({ id, title, severity: "high", status: "open", openedAt: "2026-09-17T08:30:00Z" });

  beforeEach(() => {
    __resetOperationListCacheForTests();
    vi.clearAllMocks();
    m.list.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    __resetOperationListCacheForTests();
    m.runAction.mockReset();
  });

  it("pages jobs through the server with page_size/page_token and shows page_info.total", async () => {
    const jobs = lists.jobs as unknown as ReturnType<typeof vi.fn>;
    jobs.mockImplementation(async (q?: { page_token?: string }): Promise<Listed> =>
      q?.page_token === "20"
        ? { items: [jobRow("job-page2")], cursor: {}, estimatedTotal: 1521 }
        : { items: [jobRow("job-page1")], cursor: { next: "20" }, estimatedTotal: 1521 });
    render(<MemoryRouter><JobsPage /></MemoryRouter>);
    expect(await screen.findByText("job-page1")).toBeInTheDocument();
    expect(jobs).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveBeenLastCalledWith({ page_size: 20 });
    expect(screen.getByTestId("jobs-list-pagination")).toHaveAttribute("data-total", "1521");

    fireEvent.click(screen.getByTestId("jobs-page-next"));
    expect(await screen.findByText("job-page2")).toBeInTheDocument();
    expect(screen.queryByText("job-page1")).toBeNull();
    expect(jobs).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveBeenLastCalledWith({ page_size: 20, page_token: "20" });
    expect(screen.getByTestId("jobs-page-next")).toBeDisabled();

    fireEvent.click(screen.getByTestId("jobs-page-prev"));
    expect(await screen.findByText("job-page1")).toBeInTheDocument();
  });

  it("merges realtime job events only on the first page and keeps later pages intact", async () => {
    const jobs = lists.jobs as unknown as ReturnType<typeof vi.fn>;
    jobs.mockImplementation(async (q?: { page_token?: string }): Promise<Listed> =>
      q?.page_token === "20"
        ? { items: [jobRow("job-page2")], cursor: {}, estimatedTotal: 40 }
        : { items: [jobRow("job-page1")], cursor: { next: "20" }, estimatedTotal: 40 });
    render(<MemoryRouter><JobsPage /></MemoryRouter>);
    await screen.findByText("job-page1");
    await waitFor(() => expect(mockRealtime.on).toHaveBeenCalled());
    const handler = (mockRealtime.on.mock.calls as unknown as Array<[string, (p: unknown) => void]>).find(([k]) => k === "job")![1];
    const emit = (id: string) => act(() => handler({ jobId: id, kind: "k", status: "running", owner: "o", ts: "2026-09-17T09:00:00Z" }));

    emit("job-live-1");
    expect(await screen.findByText("job-live-1")).toBeInTheDocument();
    expect(screen.getByText("job-page1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("jobs-page-next"));
    await screen.findByText("job-page2");
    emit("job-live-2");
    expect(screen.queryByText("job-live-2")).toBeNull();
    expect(screen.queryByText("job-live-1")).toBeNull();
    expect(screen.getByText("job-page2")).toBeInTheDocument();
    expect(screen.getByTestId("jobs-list-pagination")).toHaveAttribute("data-total", "40");
  });

  it("pages incidents and an advanced incident updates its row on the current page", async () => {
    const incidents = lists.incidents as unknown as ReturnType<typeof vi.fn>;
    incidents.mockImplementation(async (q?: { page_token?: string }): Promise<Listed> =>
      q?.page_token === "20"
        ? { items: [incRow("inc-p2", "Second page incident")], cursor: {}, estimatedTotal: 2644 }
        : { items: [incRow("inc-p1", "First page incident")], cursor: { next: "20" }, estimatedTotal: 2644 });
    m.runAction.mockResolvedValue({ ok: true });
    render(<MemoryRouter><IncidentsPage /></MemoryRouter>);
    await screen.findByText("First page incident");
    expect(screen.getByTestId("incidents-list-pagination")).toHaveAttribute("data-total", "2644");

    fireEvent.click(screen.getByTestId("incidents-page-next"));
    fireEvent.click(await screen.findByText("Second page incident"));
    expect(incidents).toHaveBeenLastCalledWith({ page_size: 20, page_token: "20" });
    fireEvent.click(await screen.findByText("table_actions.startMitigation"));
    await waitFor(() => expect(m.runAction).toHaveBeenCalled());
    await waitFor(() => expect(m.toast.success).toHaveBeenCalled());
    // mitigating renders as the "running" status badge; the open row showed the warning badge.
    expect(screen.getAllByText("status.running").length).toBeGreaterThan(0);
  });
});

describe("AlertsPage timeout_fallback vs healthy/degraded-composed payloads (FE-ALERTS-NOT-EMPTY-20261107)", () => {
  const buildTimeoutFallbackPayload = (reason: string = "read_timeout") => ({
    alerts: [],
    summary: {
      total_active: 0,
      highest_severity: null,
      by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      by_category: { incident: 0, runtime: 0, risk: 0, governance: 0 },
    },
    meta: {
      snapshot_at: "2026-11-07T00:00:00Z",
      acknowledgement_supported: true,
      surfaces: {
        alerts: {
          status: "degraded",
          source: "timeout_fallback",
          message: "Alert aggregation timed out under concurrent read fanout; degraded empty response returned.",
          reason,
        },
      },
    },
  });

  const realAlertRow = {
    alert_id: "alert-incident-inc-001",
    severity: "critical",
    category: "incident",
    raised_at: "2026-04-18T06:05:00Z",
    summary: "Active incident: Unexpected drawdown in persona-alpha.",
    target_ref: {
      surface_id: "PKT-002",
      label: "Open incident response",
      href: "/management/incidents/inc-001",
      target_id: "inc-001",
    },
  };

  beforeEach(() => {
    __resetOperationListCacheForTests();
    clearAuthProvider();
    vi.clearAllMocks();
    m.translate = null;
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    __resetOperationListCacheForTests();
    clearAuthProvider();
    m.translate = null;
    vi.unstubAllEnvs();
    liveStatus._reset();
    (lists.alerts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockAlerts });
  });

  it("shows an unavailable state and not the empty no-alerts state on /management/alerts for timeout_fallback across read_timeout, read_saturated, and read_error without opening the site-wide banner", async () => {
    const enUS = (await import("@/i18n/locales/en-US")).default;
    const zhTW = (await import("@/i18n/locales/zh-TW")).default;
    const alertsMock = lists.alerts as unknown as ReturnType<typeof vi.fn>;

    for (const [localeDict, reason] of [
      [enUS, "read_timeout"],
      [zhTW, "read_saturated"],
      [enUS, "read_error"],
    ] as const) {
      __resetOperationListCacheForTests();
      m.translate = (key: string) => {
        const [ns, field] = key.split(".");
        const dict = localeDict as unknown as Record<string, Record<string, string>>;
        return dict[ns]?.[field] ?? key;
      };
      alertsMock.mockResolvedValueOnce(normalizeAlertListResponse(buildTimeoutFallbackPayload(reason)));

      const { container, unmount } = render(
        <MemoryRouter initialEntries={["/management/alerts"]}>
          <LiveStatusBanner />
          <AlertsPage />
        </MemoryRouter>,
      );

      const alertBanner = await screen.findByRole("alert");
      expect(alertBanner).toHaveTextContent(localeDict.page.alertsUnavailable);
      expect(alertBanner).toHaveTextContent(
        "Alert aggregation timed out under concurrent read fanout; degraded empty response returned.",
      );
      expect(screen.queryByText(localeDict.page.alertsEmpty)).toBeNull();
      expect(screen.queryByText(localeDict.empty.noResults)).toBeNull();
      expect(screen.queryByTestId("data-table-empty")).toBeNull();
      expect(liveStatus.get().effective).toBe("live");
      expect(liveStatus.get().lastError).toBeUndefined();
      expect(container.textContent).not.toMatch(/strict typed error|seed fallback|資料來源：seed/i);
      unmount();
    }
  });

  it("does not replace rows cached from an earlier success with the empty list when a subsequent read returns timeout_fallback", async () => {
    const enUS = (await import("@/i18n/locales/en-US")).default;
    m.translate = (key: string) => {
      const [ns, field] = key.split(".");
      const dict = enUS as unknown as Record<string, Record<string, string>>;
      return dict[ns]?.[field] ?? key;
    };

    const alertsMock = lists.alerts as unknown as ReturnType<typeof vi.fn>;
    alertsMock
      .mockResolvedValueOnce(
        normalizeAlertListResponse({
          alerts: [realAlertRow],
          summary: {
            total_active: 1,
            highest_severity: "critical",
            by_severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
            by_category: { incident: 1, runtime: 0, risk: 0, governance: 0 },
          },
          meta: {
            snapshot_at: "2026-11-07T00:00:00Z",
            acknowledgement_supported: true,
            surfaces: {
              alerts: { status: "ok", source: "bff_composed" },
            },
          },
        }),
      )
      .mockResolvedValueOnce(normalizeAlertListResponse(buildTimeoutFallbackPayload("read_timeout")));

    render(
      <MemoryRouter initialEntries={["/management/alerts"]}>
        <AlertsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Active incident: Unexpected drawdown in persona-alpha."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      await getSharedQueryClient().invalidateQueries();
    });

    const alertBanner = await screen.findByRole("alert");
    expect(alertBanner).toHaveTextContent(enUS.page.alertsUnavailable);
    expect(
      screen.getByText("Active incident: Unexpected drawdown in persona-alpha."),
    ).toBeInTheDocument();
    expect(screen.queryByText(enUS.page.alertsEmpty)).toBeNull();
  });

  it("shows the empty state for a healthy zero-alert response and renders real rows when a contributing surface is degraded", async () => {
    const enUS = (await import("@/i18n/locales/en-US")).default;
    m.translate = (key: string) => {
      const [ns, field] = key.split(".");
      const dict = enUS as unknown as Record<string, Record<string, string>>;
      return dict[ns]?.[field] ?? key;
    };

    const alertsMock = lists.alerts as unknown as ReturnType<typeof vi.fn>;
    alertsMock.mockResolvedValueOnce(
      normalizeAlertListResponse({
        alerts: [],
        summary: {
          total_active: 0,
          highest_severity: null,
          by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          by_category: { incident: 0, runtime: 0, risk: 0, governance: 0 },
        },
        meta: {
          snapshot_at: "2026-11-07T00:00:00Z",
          acknowledgement_supported: true,
          surfaces: {
            alerts: { status: "ok", source: "bff_composed" },
          },
        },
      }),
    );

    const healthyEmptyRender = render(
      <MemoryRouter initialEntries={["/management/alerts"]}>
        <AlertsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(enUS.page.alertsEmpty)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    healthyEmptyRender.unmount();

    __resetOperationListCacheForTests();
    alertsMock.mockResolvedValueOnce(
      normalizeAlertListResponse({
        alerts: [realAlertRow],
        summary: {
          total_active: 1,
          highest_severity: "critical",
          by_severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
          by_category: { incident: 1, runtime: 0, risk: 0, governance: 0 },
        },
        meta: {
          snapshot_at: "2026-11-07T00:00:00Z",
          acknowledgement_supported: true,
          surfaces: {
            alerts: {
              status: "degraded",
              source: "bff_composed",
              message: "Operator alert feed is available, but one or more contributing surfaces are degraded.",
            },
            telemetry_summary: {
              status: "degraded",
              source: "service_store",
              message: "Telemetry summary missing for one or more runtimes.",
            },
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/management/alerts"]}>
        <AlertsPage />
      </MemoryRouter>,
    );

    const rowTitle = await screen.findByText("Active incident: Unexpected drawdown in persona-alpha.");
    expect(rowTitle).toBeInTheDocument();
    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(rowTitle);
    expect(await screen.findByText("alert-incident-inc-001")).toBeInTheDocument();
    expect(screen.getByText("inc-001")).toBeInTheDocument();
  });
});
