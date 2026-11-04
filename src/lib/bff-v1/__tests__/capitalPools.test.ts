import { afterEach, describe, expect, it, vi } from "vitest";
import { BffError, lists, liveStatus } from "@/lib/bff-v1";
import { normalizeCapitalPool } from "@/lib/bff-v1/capitalPools";

const REAL_OWNER_POOL_RECORD = {
  id: "hosted-all12-h12-claude-20261027-4923-pool",
  pool_id: "hosted-all12-h12-claude-20261027-4923-pool",
  name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
  owner_id: "tenant-dev",
  owner_type: "org",
  status: "active",
  created_at: "2026-11-01T08:41:17Z",
  currency: "TWD",
  single_runtime_enforced: true,
  risk_limits: {},
  metadata: {
    internal: true,
    execution_context: "paper",
    tenant_id: "tenant-dev",
    fixture: "hosted_all12",
    paper_only: true,
  },
};

const realFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = realFetch;
  liveStatus._reset();
});

describe("capital pool adapter", () => {
  it("normalizes Pantheon BFF capital pool DTOs into the management model", () => {
    const pool = normalizeCapitalPool({
      pool_id: "pool-crypto-paper",
      name: "Crypto Paper",
      status: "active",
      owner_id: "pantheon-dev-browser",
      currency: "USDT",
      capital_allocation: 125000,
      utilization_pct: 42,
      max_drawdown_pct: 8,
      risk_policy_ref: "risk-policy-crypto-paper",
      bindings: [{ persona_id: "persona-1" }, { persona_id: "persona-2" }],
      updated_at: "2026-07-06T00:00:00.000Z",
    });

    expect(pool).toMatchObject({
      id: "pool-crypto-paper",
      poolId: "pool-crypto-paper",
      name: "Crypto Paper",
      owner: "pantheon-dev-browser",
      currency: "USDT",
      allocated: 125000,
      utilized: 52500,
      riskBudget: 0.08,
      risk: "critical",
      status: "active",
      state: undefined,
      reportedFields: {
        currency: true,
        allocated: true,
        utilized: true,
        riskBudget: true,
        risk: false,
      },
      riskPolicyRef: "risk-policy-crypto-paper",
      bindingCount: 2,
    });
  });

  it("unwraps detail envelopes and prefers pool_id over a ledger-shaped id", () => {
    const pool = normalizeCapitalPool({
      data: {
        id: "paper-ledger-persona-20260528-04688755",
        pool_id: "pool-crypto-paper",
        name: "Crypto Paper",
        budget: 50000,
      },
    });

    expect(pool?.id).toBe("pool-crypto-paper");
    expect(pool?.allocated).toBe(50000);
  });

  it("preserves sanitized real owner facts with null budget and active status without defaulting to deployed", () => {
    const pool = normalizeCapitalPool({
      id: "c9f8b55d-e65b-4a76-be1a-77a9efaa60ef",
      name: "Default TWD Capital Pool",
      status: "active",
      currency: "TWD",
      budget: null,
      risk_policy_ref: null,
      bindings: [
        {
          role: "paper_owner",
          budget: null,
          status: "active",
          allowed_deployment_scope: "paper",
        },
      ],
    });

    expect(pool).toMatchObject({
      id: "c9f8b55d-e65b-4a76-be1a-77a9efaa60ef",
      name: "Default TWD Capital Pool",
      status: "active",
      state: undefined,
      currency: "TWD",
      riskPolicyRef: undefined,
      bindingCount: 1,
      bindings: [
        {
          role: "paper_owner",
          budget: null,
          status: "active",
          allowed_deployment_scope: "paper",
        },
      ],
      reportedFields: {
        currency: true,
        allocated: false,
        utilized: false,
        riskBudget: false,
        risk: false,
      },
    });
  });

  it("distinguishes explicit numeric zero from missing or unknown status and risk", () => {
    const pool = normalizeCapitalPool({
      pool_id: "pool-zero",
      status: "unknown_status",
      currency: "TWD",
      budget: 0,
      utilized: 0,
      risk_budget: 0,
    });

    expect(pool).toMatchObject({
      id: "pool-zero",
      status: "unknown_status",
      state: undefined,
      currency: "TWD",
      allocated: 0,
      utilized: 0,
      riskBudget: 0,
      reportedFields: {
        currency: true,
        allocated: true,
        utilized: true,
        riskBudget: true,
        risk: false,
      },
    });
  });

  it("normalizes the real owner paper pool record while leaving state undefined and marking unreported financial fields", () => {
    const pool = normalizeCapitalPool(REAL_OWNER_POOL_RECORD);

    expect(pool).toMatchObject({
      id: "hosted-all12-h12-claude-20261027-4923-pool",
      poolId: "hosted-all12-h12-claude-20261027-4923-pool",
      name: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a paper pool",
      owner: "tenant-dev",
      status: "active",
      state: undefined,
      currency: "TWD",
      allocated: 0,
      utilized: 0,
      riskBudget: 0,
      reportedFields: {
        currency: true,
        allocated: false,
        utilized: false,
        riskBudget: false,
        risk: false,
      },
    });
  });

  it("loads every page of GET /bff/capital-pools by following page_info.next_page_token", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });

    const requestedUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);
      const parsed = new URL(url, "http://localhost");
      const token = parsed.searchParams.get("page_token");
      if (!token) {
        return new Response(
          JSON.stringify({
            data: [REAL_OWNER_POOL_RECORD],
            items: [REAL_OWNER_POOL_RECORD],
            meta: {},
            page_info: { next_page_token: "cursor-page-2", total: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              ...REAL_OWNER_POOL_RECORD,
              id: "hosted-all12-page2-archived-pool",
              pool_id: "hosted-all12-page2-archived-pool",
              name: "persona-strat-hosted-all12-page2 paper pool",
              status: "archived",
            },
          ],
          items: [
            {
              ...REAL_OWNER_POOL_RECORD,
              id: "hosted-all12-page2-archived-pool",
              pool_id: "hosted-all12-page2-archived-pool",
              name: "persona-strat-hosted-all12-page2 paper pool",
              status: "archived",
            },
          ],
          meta: {},
          page_info: { next_page_token: null, total: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const env = await lists.capitalPools();

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("/bff/capital-pools?page_size=200");
    expect(requestedUrls[1]).toContain("page_token=cursor-page-2");
    expect(env.items.map((item) => item.id)).toEqual([
      "hosted-all12-h12-claude-20261027-4923-pool",
      "hosted-all12-page2-archived-pool",
    ]);
  });

  it("rejects without returning partial items when a subsequent page of GET /bff/capital-pools fails", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const token = new URL(url, "http://localhost").searchParams.get("page_token");
      if (!token) {
        return new Response(
          JSON.stringify({
            data: [REAL_OWNER_POOL_RECORD],
            items: [REAL_OWNER_POOL_RECORD],
            meta: {},
            page_info: { next_page_token: "cursor-page-2", total: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: { code: "BACKEND_UNAVAILABLE", message: "Page 2 read failed" } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(lists.capitalPools()).rejects.toBeInstanceOf(BffError);
  });
});
