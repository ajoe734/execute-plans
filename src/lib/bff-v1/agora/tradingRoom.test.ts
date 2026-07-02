// AG-FE-TR-002 — focused tests for trading room BFF client header contract.
//
// Coverage:
//   * decideOnEvent forwards If-Match, Idempotency-Key, and X-Request-Id when provided
//   * decideOnEvent does NOT send headers when options are omitted
//   * decideOnEvent POSTs to the correct URL
//   * listDecisionEvents returns items + etag from response header
//   * Read-only methods (getTradingRoom, listDecisionEvents, getDecisionEvent) do NOT send mutation headers
//   * Error handling: non-2xx throws with message from error.message

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  acceptTradingRoomWorkspaceProposal,
  acceptTradingRoomWorkspaceProposalWithMeta,
  acceptWidgetRevisionProposal,
  createTradingRoomWorkspaceProposal,
  createWidgetRevisionProposal,
  decideOnEvent,
  getTradingRoomWorkspace,
  getTradingRoomWorkspaceWithMeta,
  getTradingRoomWorkspaceProposal,
  listDecisionEvents,
  listTradingRoomWorkspaceVersions,
  patchTradingRoomWorkspaceLayout,
  rollbackTradingRoomWorkspaceVersion,
  getTradingRoom,
  getDecisionEvent,
} from "./tradingRoom";
import { BffError } from "../errors";
import { getAuthProvider, setAuthProvider } from "../headers";

const BASE = "https://test.example";

function ok(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function bffErrorResponse(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
      },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setAuthProvider({ getToken: () => null, getTenantId: () => null });
});

// ── decideOnEvent — header forwarding ────────────────────────────────────────

describe("decideOnEvent — If-Match, Idempotency-Key, X-Request-Id", () => {
  it("forwards all three headers when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: { decision_state: "approved_by_trader" } }));
    globalThis.fetch = fetchMock;

    await decideOnEvent(
      "evt-001",
      { decision: "approve" },
      {
        ifMatch: '"evt-etag-v1"',
        idempotencyKey: "idem-decide-1",
        requestId: "req-decide-1",
      },
      BASE,
    );

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["If-Match"]).toBe('"evt-etag-v1"');
    expect(headers["Idempotency-Key"]).toBe("idem-decide-1");
    expect(headers["X-Request-Id"]).toBe("req-decide-1");
  });

  it("sends X-Request-Id without If-Match when only requestId provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: {} }));
    globalThis.fetch = fetchMock;

    await decideOnEvent(
      "evt-002",
      { decision: "reject" },
      { idempotencyKey: "idem-2", requestId: "req-2" },
      BASE,
    );

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Request-Id"]).toBe("req-2");
    expect(headers["Idempotency-Key"]).toBe("idem-2");
    expect(headers["If-Match"]).toBeUndefined();
  });

  it("does NOT send mutation headers when options are omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: {} }));
    globalThis.fetch = fetchMock;

    await decideOnEvent("evt-003", { decision: "defer" }, undefined, BASE);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["If-Match"]).toBeUndefined();
    expect(headers["Idempotency-Key"]).toBeUndefined();
    expect(headers["X-Request-Id"]).toBeUndefined();
  });

  it("POSTs to the correct decisions URL with encoded event ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: {} }));
    globalThis.fetch = fetchMock;

    await decideOnEvent(
      "evt/abc-001",
      { decision: "modify" },
      { requestId: "req-1" },
      BASE,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/bff/agora/trading-room/decision-events/evt%2Fabc-001/decisions`,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("sends Content-Type application/json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: {} }));
    globalThis.fetch = fetchMock;

    await decideOnEvent("evt-004", { decision: "approve" }, { requestId: "req-4" }, BASE);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ── listDecisionEvents — ETag capture ────────────────────────────────────────

describe("listDecisionEvents — ETag in response", () => {
  const mockEvent = {
    spec_version: "1.0",
    decision_event_id: "evt-list-001",
    event_kind: "entry",
    origin: "strategy_signal",
    strategy_id: "strat-001",
    strategy_spec_registry_id: "reg-001",
    subject: { symbol: "TSLA" },
    state: "pending_review",
    triggered_at: "2026-06-22T10:00:00Z",
    confidence: { value: 0.7, basis: "model", calibration_state: "calibrated" },
    probability: { value: 0.6, target_outcome: "price_up", horizon: "5d" },
    expected_value: { horizon: "5d", unit: "pct_return", gross: 0.05, cost: 0.002, net: 0.048, downside: -0.01 },
    rationale: [],
    risk_notes: [],
    evidence_refs: [],
    invalidation: { conditions: [], current_state: "valid" },
    suggested_action: "enter",
    no_order_route_proof: "agora_decision_support_only",
  };

  it("returns items and etag from response header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ items: [mockEvent] }, 200, { ETag: '"events-etag-v1"' }),
    );
    globalThis.fetch = fetchMock;

    const result = await listDecisionEvents(undefined, BASE);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].decision_event_id).toBe("evt-list-001");
    expect(result.etag).toBe('"events-etag-v1"');
  });

  it("returns null etag when server omits ETag header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ items: [] }));
    globalThis.fetch = fetchMock;

    const result = await listDecisionEvents(undefined, BASE);

    expect(result.items).toHaveLength(0);
    expect(result.etag).toBeNull();
  });

  it("uses GET and sends no mutation headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ items: [] }));
    globalThis.fetch = fetchMock;

    await listDecisionEvents(undefined, BASE);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["If-Match"]).toBeUndefined();
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
    expect((init.headers as Record<string, string>)["X-Request-Id"]).toBeUndefined();
  });

  it("appends event_kind filter to query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ items: [] }));
    globalThis.fetch = fetchMock;

    await listDecisionEvents({ event_kind: "entry" }, BASE);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/bff/agora/trading-room/decision-events?event_kind=entry`,
    );
  });
});

// ── Read-only methods — no mutation headers ──────────────────────────────────

describe("getTradingRoom — read-only, no mutation headers", () => {
  it("uses GET and sends no X-Request-Id, If-Match, or Idempotency-Key", async () => {
    const aggregate = {
      spec_version: "1.0",
      user_scope_ref: "scope-1",
      strategies: [],
      queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
      risk_summary: { state: "normal" },
      snapshot_at: "2026-06-22T10:00:00Z",
      data_cutoff: "2026-06-22T09:55:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: aggregate }));
    globalThis.fetch = fetchMock;

    await getTradingRoom(BASE);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-Request-Id"]).toBeUndefined();
    expect((init.headers as Record<string, string>)["If-Match"]).toBeUndefined();
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  it("normalizes missing live aggregate sections to safe UI defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        data: {
          strategies: [
            {
              id: "strategy-live-1",
              name: "Live Strategy",
            },
          ],
        },
      }),
    );
    globalThis.fetch = fetchMock;

    const aggregate = await getTradingRoom(BASE);

    expect(aggregate.queue_summary).toEqual({ entry: 0, add: 0, reduce: 0, exit: 0, review: 0 });
    expect(aggregate.risk_summary).toEqual({ state: "normal", summary: undefined, alerts: [] });
    expect(aggregate.strategies[0]).toMatchObject({
      strategy_id: "strategy-live-1",
      strategy_spec_registry_id: "strategy-live-1",
      title: "Live Strategy",
      readiness_state: "blocked",
      monitoring_state: "inactive",
      pending_event_counts: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
    });
  });
});

// ── Authorization forwarding — AG-DYNUI-LIVE-DEFAULT-001 auth-header fix ──────
//
// The BFF's trading-room routes are `require_read_role`/user-scoped and 401
// with AUTH_REQUIRED when no Bearer token is present; `credentials: "include"`
// alone does not satisfy that. Every exported call in this file must forward
// the auth provider's token/tenant, and must not send them when unauthenticated.

describe("Authorization header forwarding", () => {
  it("getTradingRoom sends Authorization and X-Tenant-Id when the auth provider has a token", async () => {
    setAuthProvider({ getToken: () => "live-token-1", getTenantId: () => "tenant-dev" });
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        data: {
          strategies: [],
          queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
          risk_summary: { state: "normal" },
        },
      }),
    );
    globalThis.fetch = fetchMock;

    await getTradingRoom(BASE);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer live-token-1");
    expect(headers["X-Tenant-Id"]).toBe("tenant-dev");
  });

  it("getTradingRoom omits Authorization when the auth provider has no token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        data: {
          strategies: [],
          queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
          risk_summary: { state: "normal" },
        },
      }),
    );
    globalThis.fetch = fetchMock;

    await getTradingRoom(BASE);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Tenant-Id"]).toBeUndefined();
  });

  it("listDecisionEvents forwards Authorization", async () => {
    setAuthProvider({ getToken: () => "live-token-2", getTenantId: () => null });
    const fetchMock = vi.fn().mockResolvedValue(ok({ items: [] }));
    globalThis.fetch = fetchMock;

    await listDecisionEvents(undefined, BASE);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer live-token-2");
  });

  it("decideOnEvent forwards Authorization alongside If-Match/Idempotency-Key/X-Request-Id", async () => {
    setAuthProvider({ getToken: () => "live-token-3", getTenantId: () => null });
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: { decision_state: "approved_by_trader" } }));
    globalThis.fetch = fetchMock;

    await decideOnEvent(
      "evt-1",
      { decision: "approve" },
      { ifMatch: '"evt-etag-v1"', idempotencyKey: "idem-decide-1", requestId: "req-decide-1" },
      BASE,
    );

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer live-token-3");
    expect(headers["If-Match"]).toBe('"evt-etag-v1"');
    expect(headers["Idempotency-Key"]).toBe("idem-decide-1");
    expect(headers["X-Request-Id"]).toBe("req-decide-1");
  });

  it("createTradingRoomWorkspaceProposal forwards Authorization", async () => {
    setAuthProvider({ getToken: () => "live-token-4", getTenantId: () => null });
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: { id: "proposal-1" } }));
    globalThis.fetch = fetchMock;

    await createTradingRoomWorkspaceProposal("strat-001", { strategyVersion: "v1" }, undefined, BASE);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer live-token-4");
  });

  it("getAuthProvider reflects the provider set via setAuthProvider", () => {
    setAuthProvider({ getToken: () => "probe-token", getTenantId: () => "probe-tenant" });
    expect(getAuthProvider().getToken()).toBe("probe-token");
    expect(getAuthProvider().getTenantId()).toBe("probe-tenant");
  });
});

describe("getDecisionEvent — returns null on 404", () => {
  it("returns null for 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    globalThis.fetch = fetchMock;

    const result = await getDecisionEvent("missing-evt", BASE);

    expect(result).toBeNull();
  });
});

// ── v1.5 workspace proposal and workspace routes ────────────────────────────

const mockProposal = {
  strategyId: "strat-001",
  strategyVersion: "winner-branch-v4",
  proposalId: "proposal-001",
  generatedAt: "2026-06-29T00:00:00Z",
  status: "preview",
  views: [],
  rationale: "Generate a complete workspace.",
  dataAvailability: { status: "complete", sources: [] },
  warnings: [],
  personalizationApplied: { status: "applied", items: [] },
};

const mockWorkspace = {
  id: "workspace-001",
  userId: "user-001",
  strategyId: "strat-001",
  strategyVersion: "winner-branch-v4",
  dashboardVersion: 1,
  activeViewId: "overview",
  views: [],
  status: "active",
  generatedBy: "trading_servant",
  createdAt: "2026-06-29T00:00:00Z",
  updatedAt: "2026-06-29T00:00:00Z",
};

const mockWidget = {
  id: "widget-001",
  widgetType: "candidate_funnel",
  title: "Candidate Funnel",
  purpose: "Show candidate lifecycle distribution.",
  whyIncluded: "Required by the strategy overview.",
  dataSource: "agora.candidate.members",
  query: { filters: { strategy_id: "strat-001" }, limit: 50, window: "20d" },
  chartSpec: {
    spec_version: "1.0",
    kind: "bar",
    encodings: {
      x: { field: "status", type: "nominal" },
      y: { field: "count", type: "quantitative" },
    },
  },
  interactions: [{ kind: "request_widget_revision" }],
  placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
  minSize: { width: 2, height: 2 },
  maxSize: { width: 12, height: 6 },
  sensitivity: "user_private",
};

const mockWidgetRevisionProposal = {
  id: "wrp-001",
  workspaceId: "workspace-001",
  viewId: "overview",
  widgetId: "widget-001",
  instruction: "改成表格",
  beforeSpec: mockWidget,
  proposedSpec: { ...mockWidget, title: "Candidate Funnel Table" },
  rationale: "Table is better for direct comparison.",
  warnings: [],
  dataAvailability: "complete",
  status: "preview",
};

describe("Trading Room workspace proposal routes", () => {
  it("creates a workspace proposal with strategyVersion and Idempotency-Key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: mockProposal }));
    globalThis.fetch = fetchMock;

    const result = await createTradingRoomWorkspaceProposal(
      "strat/001",
      { strategyVersion: "winner-branch-v4", tradingRoomReady: true },
      { idempotencyKey: "idem-proposal-1" },
      BASE,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/bff/agora/strategies/strat%2F001/trading-room/proposals`);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ strategyVersion: "winner-branch-v4", tradingRoomReady: true }));
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-proposal-1");
    expect(result.proposalId).toBe("proposal-001");
  });

  it("gets a workspace proposal and sends no mutation headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: mockProposal }));
    globalThis.fetch = fetchMock;

    const result = await getTradingRoomWorkspaceProposal("strat-001", "proposal/001", BASE);

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/bff/agora/strategies/strat-001/trading-room/proposals/proposal%2F001`);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
    expect(result?.proposalId).toBe("proposal-001");
  });

  it("throws typed BffError when a workspace proposal is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(404, "RESOURCE_NOT_FOUND", "proposal missing"));
    globalThis.fetch = fetchMock;

    await expect(getTradingRoomWorkspaceProposal("strat-001", "missing", BASE)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
    });
  });

  it("accepts a workspace proposal real BFF envelope and returns data.workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ data: { workspaceId: "workspace-001", workspace: mockWorkspace, version: { version: 1 } } }),
    );
    globalThis.fetch = fetchMock;

    const result = await acceptTradingRoomWorkspaceProposal(
      "strat-001",
      "proposal-001",
      { expectedStatus: "preview" },
      { idempotencyKey: "idem-accept-1" },
      BASE,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/bff/agora/strategies/strat-001/trading-room/proposals/proposal-001/accept`);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ expectedStatus: "preview" }));
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-accept-1");
    expect(result.id).toBe("workspace-001");
    expect(result.views).toEqual([]);
  });

  it("accepts a workspace proposal with ETag and version metadata", async () => {
    const version = {
      id: "version-001",
      dashboardVersion: 1,
      changeLog: { reason: "initial proposal" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      ok(
        { data: { workspaceId: "workspace-001", workspace: mockWorkspace, version } },
        200,
        { ETag: '"workspace-etag-v1"' },
      ),
    );
    globalThis.fetch = fetchMock;

    const result = await acceptTradingRoomWorkspaceProposalWithMeta(
      "strat-001",
      "proposal-001",
      { expectedStatus: "preview" },
      { idempotencyKey: "idem-accept-meta-1" },
      BASE,
    );

    expect(result.workspace.id).toBe("workspace-001");
    expect(result.etag).toBe('"workspace-etag-v1"');
    expect(result.version?.id).toBe("version-001");
  });

  it("fetches the accepted workspace by workspaceId when accept omits embedded workspace", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ data: { workspaceId: "workspace-001", version: { version: 1 } } }))
      .mockResolvedValueOnce(ok({ data: mockWorkspace }));
    globalThis.fetch = fetchMock;

    const result = await acceptTradingRoomWorkspaceProposal(
      "strat-001",
      "proposal-001",
      { expectedStatus: "preview" },
      { idempotencyKey: "idem-accept-2" },
      BASE,
    );

    expect(result.id).toBe("workspace-001");
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/bff/agora/trading-room/workspaces/workspace-001`);
  });

  it("gets an accepted workspace and throws typed BffError on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ data: mockWorkspace }))
      .mockResolvedValueOnce(bffErrorResponse(404, "RESOURCE_NOT_FOUND", "workspace missing"));
    globalThis.fetch = fetchMock;

    await expect(getTradingRoomWorkspace("workspace/001", BASE)).resolves.toMatchObject({ id: "workspace-001" });
    await expect(getTradingRoomWorkspace("missing", BASE)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/bff/agora/trading-room/workspaces/workspace%2F001`);
  });

  it("gets an accepted workspace with current ETag metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ data: mockWorkspace }, 200, { ETag: '"workspace-etag-v1"' }),
    );
    globalThis.fetch = fetchMock;

    const result = await getTradingRoomWorkspaceWithMeta("workspace/001", BASE);

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/bff/agora/trading-room/workspaces/workspace%2F001`);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(result.workspace.id).toBe("workspace-001");
    expect(result.etag).toBe('"workspace-etag-v1"');
  });

  it("patches workspace layout with If-Match and Idempotency-Key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok(
        { data: { ...mockWorkspace, dashboardVersion: 2 }, meta: { version_id: "version-002" } },
        200,
        { ETag: '"workspace-etag-v2"' },
      ),
    );
    globalThis.fetch = fetchMock;

    const result = await patchTradingRoomWorkspaceLayout(
      "workspace/001",
      {
        operations: [
          { kind: "move_widget", widgetId: "widget-001", payload: { x: 1, y: 2 } },
          { kind: "resize_widget", widgetId: "widget-001", payload: { width: 4, height: 3 } },
        ],
      },
      { ifMatch: '"workspace-etag-v1"', idempotencyKey: "idem-layout-1" },
      BASE,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/bff/agora/trading-room/workspaces/workspace%2F001/layout`);
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({
      operations: [
        { kind: "move_widget", widgetId: "widget-001", payload: { x: 1, y: 2 } },
        { kind: "resize_widget", widgetId: "widget-001", payload: { width: 4, height: 3 } },
      ],
    }));
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["If-Match"]).toBe('"workspace-etag-v1"');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-layout-1");
    expect(result.workspace.dashboardVersion).toBe(2);
    expect(result.etag).toBe('"workspace-etag-v2"');
    expect(result.versionId).toBe("version-002");
  });

  it("lists workspace versions and rolls back a version with ETag metadata", async () => {
    const versions = [
      { id: "version-001", dashboardVersion: 1, changeSummary: "initial" },
      { id: "version-002", dashboardVersion: 2, changeSummary: "layout changed" },
    ];
    const rollbackVersion = { id: "version-003", dashboardVersion: 3 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ data: versions }))
      .mockResolvedValueOnce(
        ok(
          {
            data: {
              workspace: { ...mockWorkspace, dashboardVersion: 3, generatedBy: "user_modified" },
              version: rollbackVersion,
              rollbackOfVersion: versions[0],
            },
            meta: { version_id: "version-003" },
          },
          200,
          { ETag: '"workspace-etag-v3"' },
        ),
      );
    globalThis.fetch = fetchMock;

    await expect(listTradingRoomWorkspaceVersions("workspace-001", BASE)).resolves.toHaveLength(2);
    const result = await rollbackTradingRoomWorkspaceVersion(
      "workspace-001",
      "version-001",
      { reason: "restore initial layout" },
      { ifMatch: '"workspace-etag-v2"', idempotencyKey: "idem-rollback-1" },
      BASE,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/bff/agora/trading-room/workspaces/workspace-001/versions`);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["If-Match"]).toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/bff/agora/trading-room/workspaces/workspace-001/versions/version-001/rollback`);
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ reason: "restore initial layout" }));
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>)["If-Match"]).toBe('"workspace-etag-v2"');
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-rollback-1");
    expect(result.workspace.dashboardVersion).toBe(3);
    expect(result.version?.id).toBe("version-003");
    expect(result.etag).toBe('"workspace-etag-v3"');
  });

  it("creates a widget revision proposal with proposedSpec and Idempotency-Key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ data: mockWidgetRevisionProposal }, 201, { ETag: '"revision-etag-v1"' }),
    );
    globalThis.fetch = fetchMock;

    const result = await createWidgetRevisionProposal(
      "workspace/001",
      "widget/001",
      {
        dataAvailability: "complete",
        instruction: "改成表格",
        proposedSpec: mockWidgetRevisionProposal.proposedSpec,
        rationale: "Table is better for direct comparison.",
        viewId: "overview",
        warnings: [],
      },
      { idempotencyKey: "idem-revision-create-1" },
      BASE,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/bff/agora/trading-room/workspaces/workspace%2F001/widgets/widget%2F001/revision-proposals`,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({
      dataAvailability: "complete",
      instruction: "改成表格",
      proposedSpec: mockWidgetRevisionProposal.proposedSpec,
      rationale: "Table is better for direct comparison.",
      viewId: "overview",
      warnings: [],
    }));
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-revision-create-1");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["If-Match"]).toBeUndefined();
    expect(result.proposal.id).toBe("wrp-001");
    expect(result.etag).toBe('"revision-etag-v1"');
  });

  it("accepts a widget revision proposal with If-Match and keep-copy action", async () => {
    const version = { id: "version-002", dashboardVersion: 2, changeLog: { sourceRevisionProposalId: "wrp-001" } };
    const acceptedProposal = { ...mockWidgetRevisionProposal, status: "accepted" };
    const fetchMock = vi.fn().mockResolvedValue(
      ok(
        {
          data: {
            appliedAction: "keep_original_add_modified_copy",
            copiedWidgetId: "widget-001-copy",
            proposal: acceptedProposal,
            version,
            workspace: { ...mockWorkspace, dashboardVersion: 2 },
          },
          meta: { version_id: "version-002" },
        },
        200,
        { ETag: '"workspace-etag-v2"' },
      ),
    );
    globalThis.fetch = fetchMock;

    const result = await acceptWidgetRevisionProposal(
      "wrp/001",
      { acceptanceAction: "keep_original_add_modified_copy", copyWidgetId: "widget-001-copy" },
      { ifMatch: '"workspace-etag-v1"', idempotencyKey: "idem-revision-accept-1" },
      BASE,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/bff/agora/trading-room/widget-revision-proposals/wrp%2F001/accept`,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({
      acceptanceAction: "keep_original_add_modified_copy",
      copyWidgetId: "widget-001-copy",
    }));
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["If-Match"]).toBe('"workspace-etag-v1"');
    expect(headers["Idempotency-Key"]).toBe("idem-revision-accept-1");
    expect(result.workspace.dashboardVersion).toBe(2);
    expect(result.proposal.status).toBe("accepted");
    expect(result.appliedAction).toBe("keep_original_add_modified_copy");
    expect(result.copiedWidgetId).toBe("widget-001-copy");
    expect(result.etag).toBe('"workspace-etag-v2"');
  });

  it("preserves typed 403 widget revision creation failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(403, "TENANT_SCOPE_MISMATCH", "wrong tenant"));
    globalThis.fetch = fetchMock;

    await expect(
      createWidgetRevisionProposal(
        "workspace-001",
        "widget-001",
        {
          dataAvailability: "complete",
          instruction: "改成表格",
          proposedSpec: mockWidgetRevisionProposal.proposedSpec,
          rationale: "Table is better for direct comparison.",
          viewId: "overview",
          warnings: [],
        },
        { idempotencyKey: "idem-widget-403" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
      status: 403,
    });
  });

  it("preserves typed 404 widget revision creation failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(404, "RESOURCE_NOT_FOUND", "widget missing"));
    globalThis.fetch = fetchMock;

    await expect(
      createWidgetRevisionProposal(
        "workspace-001",
        "widget-missing",
        {
          dataAvailability: "complete",
          instruction: "改成表格",
          proposedSpec: mockWidgetRevisionProposal.proposedSpec,
          rationale: "Table is better for direct comparison.",
          viewId: "overview",
          warnings: [],
        },
        { idempotencyKey: "idem-widget-404" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
    });
  });

  it("preserves typed 412 widget revision accept failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(412, "STATE_CONFLICT", "workspace etag stale"));
    globalThis.fetch = fetchMock;

    await expect(
      acceptWidgetRevisionProposal(
        "wrp-001",
        { acceptanceAction: "apply" },
        { ifMatch: '"workspace-etag-old"', idempotencyKey: "idem-widget-412" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "STATE_CONFLICT",
      status: 412,
    });
  });

  it("preserves typed 422 widget revision validation failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(422, "VALIDATION_FAILED", "invalid widget spec"));
    globalThis.fetch = fetchMock;

    await expect(
      createWidgetRevisionProposal(
        "workspace-001",
        "widget-001",
        {
          dataAvailability: "complete",
          instruction: "改成表格",
          proposedSpec: mockWidgetRevisionProposal.proposedSpec,
          rationale: "Table is better for direct comparison.",
          viewId: "overview",
          warnings: [],
        },
        { idempotencyKey: "idem-widget-422" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 422,
    });
  });

  it("fails closed on malformed widget revision proposal envelopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: { id: "wrp-001" } }, 201));
    globalThis.fetch = fetchMock;

    await expect(
      createWidgetRevisionProposal(
        "workspace-001",
        "widget-001",
        {
          dataAvailability: "complete",
          instruction: "改成表格",
          proposedSpec: mockWidgetRevisionProposal.proposedSpec,
          rationale: "Table is better for direct comparison.",
          viewId: "overview",
          warnings: [],
        },
        { idempotencyKey: "idem-widget-malformed" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
      status: 502,
    });
  });

  it("preserves typed 403 proposal creation failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(403, "TENANT_SCOPE_MISMATCH", "wrong tenant"));
    globalThis.fetch = fetchMock;

    await expect(
      createTradingRoomWorkspaceProposal(
        "strat-001",
        { strategyVersion: "winner-branch-v4" },
        { idempotencyKey: "idem-proposal-403" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
      status: 403,
    });
  });

  it("preserves typed 409 proposal read failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(409, "STATE_CONFLICT", "proposal state changed"));
    globalThis.fetch = fetchMock;

    await expect(getTradingRoomWorkspaceProposal("strat-001", "proposal-001", BASE)).rejects.toMatchObject({
      code: "STATE_CONFLICT",
      status: 409,
    });
  });

  it("preserves typed 412 accept failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(412, "STATE_CONFLICT", "proposal stale"));
    globalThis.fetch = fetchMock;

    await expect(
      acceptTradingRoomWorkspaceProposal(
        "strat-001",
        "proposal-001",
        { expectedStatus: "preview" },
        { idempotencyKey: "idem-accept-412" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "STATE_CONFLICT",
      status: 412,
    });
  });

  it("preserves typed 422 accept validation failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(422, "VALIDATION_FAILED", "proposal invalid"));
    globalThis.fetch = fetchMock;

    await expect(
      acceptTradingRoomWorkspaceProposal(
        "strat-001",
        "proposal-001",
        { expectedStatus: "preview" },
        { idempotencyKey: "idem-accept-422" },
        BASE,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 422,
    });
  });

  it("preserves typed 501 workspace load capability failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(bffErrorResponse(501, "CAPABILITY_MISSING", "workspace route not ready"));
    globalThis.fetch = fetchMock;

    await expect(getTradingRoomWorkspace("workspace-001", BASE)).rejects.toMatchObject({
      code: "CAPABILITY_MISSING",
      status: 501,
    });
  });

  it("creates a typed fallback BffError when BFF omits an error envelope", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("capability route not implemented", { status: 501 })));
    globalThis.fetch = fetchMock;

    await expect(getTradingRoomWorkspace("workspace-001", BASE)).rejects.toBeInstanceOf(BffError);
    await expect(getTradingRoomWorkspace("workspace-001", BASE)).rejects.toMatchObject({
      code: "CAPABILITY_MISSING",
      status: 501,
    });
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("decideOnEvent throws on 412 with message from error envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "etag mismatch" } }),
        { status: 412, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    await expect(
      decideOnEvent(
        "evt-001",
        { decision: "approve" },
        { ifMatch: '"stale-etag"', idempotencyKey: "idem-1", requestId: "req-1" },
        BASE,
      ),
    ).rejects.toThrow("etag mismatch");
  });

  it("decideOnEvent throws on 409 (idempotency replay conflict)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "idempotency key conflict" } }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    await expect(
      decideOnEvent(
        "evt-002",
        { decision: "approve" },
        { idempotencyKey: "idem-dupe", requestId: "req-dupe" },
        BASE,
      ),
    ).rejects.toThrow("idempotency key conflict");
  });

  it("listDecisionEvents throws on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "unauthorized" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    await expect(listDecisionEvents(undefined, BASE)).rejects.toThrow("unauthorized");
  });
});
