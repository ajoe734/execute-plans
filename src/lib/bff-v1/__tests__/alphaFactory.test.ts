import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  alphaFactory,
  getAlphaFactory,
  MOCK_ALPHA_FACTORY_ENVELOPE,
  normalizeAlphaFactoryCard,
  normalizeAlphaFactoryEnvelope,
} from "../alphaFactory";
import { clearAuthProvider, setAuthProvider } from "../headers";
import { liveStatus } from "../liveStatus";

const setLiveEnv = () => {
  vi.stubEnv("MODE", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  vi.stubEnv("VITE_BFF_BASE_URL", "https://api.dev.mvl-cap.tw");
};

const REAL_HOSTED_REPLICATED_RECORD = {
  id: "adm-replicated-2330",
  admission_id: "adm-replicated-2330",
  tenant_id: "default",
  lane: "replicated",
  strategy_id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
  strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-da7cb8297afb",
  spec_version: "1.0.0",
  checksum: "sha256:2330",
  approval_decision_id: "apr-2330",
  approver: "pantheon-dev-approver",
  approved_at: "2026-08-14T01:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-2330",
  mode: "paper",
  created_at: "2026-08-14T01:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: "completed",
  enqueued_at: "2026-08-14T01:06:00Z",
  enqueued_by: "pantheon-dev-operator",
  attempt_count: 1,
  max_attempts: 2,
  experiment_task_id: "rtask-20260814-001",
  experiment_run_ids: ["rrun-20260814-001", "rrun-20260901-004"],
  authority_task_id: "rtask-20261015-002",
  authority_run_ids: ["rrun-20261015-002"],
  last_revalidation_at: "2026-10-15T08:30:00Z",
  last_error: null,
};

const REAL_HOSTED_SCAFFOLDED_RECORD = {
  id: "adm-scaffolded-2317",
  admission_id: "adm-scaffolded-2317",
  tenant_id: "default",
  lane: "scaffolded",
  strategy_id: "strat-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-112233445566",
  strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-665544332211",
  spec_version: "1.0.0",
  checksum: "sha256:2317",
  approval_decision_id: "apr-2317",
  approver: "pantheon-dev-approver",
  approved_at: "2026-08-15T02:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-2317",
  mode: "paper",
  created_at: "2026-08-15T02:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: "failed",
  enqueued_at: "2026-08-15T02:06:00Z",
  enqueued_by: "pantheon-dev-operator",
  attempt_count: 2,
  max_attempts: 2,
  experiment_task_id: "rtask-20260815-003",
  experiment_run_ids: ["rrun-20260815-003"],
  authority_task_id: null,
  authority_run_ids: [],
  last_revalidation_at: null,
  last_error: "backtest window incomplete",
};

const REAL_HOSTED_PENDING_SCAFFOLDED_RECORD = {
  id: "adm-pending-2454",
  admission_id: "adm-pending-2454",
  tenant_id: "default",
  lane: "scaffolded",
  strategy_id: "strat-tw-official:tw_price_daily:TWSE:2454:1122334455667788-aabbccddeeff",
  strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2454:1122334455667788-ffeeddccbbaa",
  spec_version: "1.0.0",
  checksum: "sha256:2454",
  approval_decision_id: "apr-2454",
  approver: "pantheon-dev-approver",
  approved_at: "2026-08-16T03:00:00Z",
  requested_by: "pantheon-dev-operator",
  review_ref: "mrev-2454",
  mode: "paper",
  created_at: "2026-08-16T03:05:00Z",
  status: "admitted",
  admission_status: "admitted",
  queue_status: null,
  enqueued_at: null,
  enqueued_by: null,
  attempt_count: null,
  max_attempts: null,
  experiment_task_id: null,
  experiment_run_ids: null,
  authority_task_id: null,
  authority_run_ids: null,
  last_revalidation_at: null,
  last_error: null,
};

describe("alphaFactory BFF v1 client", () => {
  beforeEach(() => {
    setLiveEnv();
    setAuthProvider({
      getToken: () => "tok-live-operator",
      getTenantId: () => "default",
    });
    liveStatus._reset({
      mode: "live",
      effective: "live",
      baseUrl: "https://api.dev.mvl-cap.tw",
    });
  });

  afterEach(() => {
    clearAuthProvider();
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("fetches GET /bff/alpha-factory with real Pantheon client headers and normalizes lanes, null fields, and surface metadata", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "alpha-factory",
            snapshotAt: "2026-11-04T00:00:00Z",
            snapshot_at: "2026-11-04T00:00:00Z",
            reason: "no_candidate_source",
            discovered_reason: "no_candidate_source",
            lanes: [
              { id: "discovered", label: "Discovered", reason: "no_candidate_source", items: [] },
              {
                id: "scaffolded",
                label: "Scaffolded",
                items: [REAL_HOSTED_SCAFFOLDED_RECORD, REAL_HOSTED_PENDING_SCAFFOLDED_RECORD],
              },
              { id: "replicated", label: "Replicated", items: [REAL_HOSTED_REPLICATED_RECORD] },
            ],
            discovered: [],
            scaffolded: [REAL_HOSTED_SCAFFOLDED_RECORD, REAL_HOSTED_PENDING_SCAFFOLDED_RECORD],
            replicated: [REAL_HOSTED_REPLICATED_RECORD],
            items: [
              REAL_HOSTED_REPLICATED_RECORD,
              REAL_HOSTED_SCAFFOLDED_RECORD,
              REAL_HOSTED_PENDING_SCAFFOLDED_RECORD,
            ],
          },
          items: [
            REAL_HOSTED_REPLICATED_RECORD,
            REAL_HOSTED_SCAFFOLDED_RECORD,
            REAL_HOSTED_PENDING_SCAFFOLDED_RECORD,
          ],
          page_info: {
            page: 1,
            page_size: 20,
            total: 3,
            next_page_token: null,
          },
          meta: {
            snapshot_at: "2026-11-04T00:00:00Z",
            surfaces: {
              alpha_factory: {
                status: "ok",
                source: "research_orchestrator",
              },
            },
            filters: {
              lane: null,
            },
            discovered: {
              reason: "no_candidate_source",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const envelope = await alphaFactory.get({ lane: "replicated", page: 1, page_size: 20 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0];
    expect(requestUrl).toBe(
      "https://api.dev.mvl-cap.tw/bff/alpha-factory?lane=replicated&page=1&page_size=20",
    );
    const headers = (requestInit?.headers ?? {}) as Record<string, string>;
    expect(headers["Accept"]).toBe("application/json");
    expect(headers["X-BFF-Api-Version"]).toBe("2026-05-07");
    expect(headers["X-Request-Id"]).toMatch(/^req_/);
    expect(headers["X-Correlation-Id"]).toMatch(/^cid_/);
    expect(headers["Accept-Language"]).toMatch(/.+/);
    expect(headers["Authorization"]).toBe("Bearer tok-live-operator");
    expect(headers["X-Tenant-Id"]).toBe("default");

    expect(envelope.data.discovered).toEqual([]);
    expect(envelope.data.discovered_reason).toBe("no_candidate_source");
    expect(envelope.data.replicated).toHaveLength(1);
    expect(envelope.data.replicated[0]).toMatchObject({
      id: "adm-replicated-2330",
      strategy_id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
      approver: "pantheon-dev-approver",
      approved_at: "2026-08-14T01:00:00Z",
      queue_status: "completed",
      attempt_count: 1,
      last_revalidation_at: "2026-10-15T08:30:00Z",
      experiment_run_ids: ["rrun-20260814-001", "rrun-20260901-004"],
      authority_task_id: "rtask-20261015-002",
    });
    expect(envelope.data.replicated[0].sharpe).toBeUndefined();
    expect(envelope.data.replicated[0].risk).toBeUndefined();

    expect(envelope.data.scaffolded).toHaveLength(2);
    expect(envelope.data.scaffolded[1]).toMatchObject({
      id: "adm-pending-2454",
      queue_status: null,
      attempt_count: null,
      last_revalidation_at: null,
      experiment_run_ids: null,
      authority_task_id: null,
    });
    expect(envelope.meta.surfaces?.alpha_factory).toEqual({
      status: "ok",
      source: "research_orchestrator",
    });
  });

  it("preserves unavailable surface status in meta.surfaces.alpha_factory", async () => {
    const normalized = normalizeAlphaFactoryEnvelope({
      data: {
        id: "alpha-factory",
        reason: "no_candidate_source",
        discovered_reason: "no_candidate_source",
        discovered: [],
        scaffolded: [],
        replicated: [],
        items: [],
      },
      items: [],
      page_info: { page: 1, page_size: 20, total: 0, next_page_token: null },
      meta: {
        snapshot_at: "2026-11-04T00:00:00Z",
        surfaces: {
          alpha_factory: {
            status: "unavailable",
            source: "research_orchestrator",
            message: "Research orchestrator replication read failed: upstream timeout",
          },
        },
      },
    });

    expect(normalized.meta.surfaces?.alpha_factory).toEqual({
      status: "unavailable",
      source: "research_orchestrator",
      message: "Research orchestrator replication read failed: upstream timeout",
    });
  });

  it("returns mock fixtures with the same AlphaFactoryCard shape in mock mode", async () => {
    vi.unstubAllEnvs();
    liveStatus._reset({ mode: "mock", effective: "mock", baseUrl: "" });

    const envelope = await getAlphaFactory();
    expect(envelope.data.replicated).toEqual(MOCK_ALPHA_FACTORY_ENVELOPE.data.replicated);
    expect(envelope.data.scaffolded).toEqual(MOCK_ALPHA_FACTORY_ENVELOPE.data.scaffolded);
    expect(envelope.data.discovered).toEqual(MOCK_ALPHA_FACTORY_ENVELOPE.data.discovered);
    expect(envelope.data.discovered_reason).toBe("no_candidate_source");
  });

  it("only includes sharpe or risk on a card when explicitly supplied by the BFF", () => {
    const withoutMetrics = normalizeAlphaFactoryCard(REAL_HOSTED_REPLICATED_RECORD, "replicated");
    expect(withoutMetrics?.sharpe).toBeUndefined();
    expect(withoutMetrics?.risk).toBeUndefined();

    const withSuppliedNulls = normalizeAlphaFactoryCard(
      { ...REAL_HOSTED_REPLICATED_RECORD, sharpe: null, risk: null },
      "replicated",
    );
    expect(withSuppliedNulls?.sharpe).toBeNull();
    expect(withSuppliedNulls?.risk).toBeNull();

    const withSuppliedValues = normalizeAlphaFactoryCard(
      { ...REAL_HOSTED_REPLICATED_RECORD, sharpe: 1.42, risk: "low" },
      "replicated",
    );
    expect(withSuppliedValues?.sharpe).toBe(1.42);
    expect(withSuppliedValues?.risk).toBe("low");
  });
});
