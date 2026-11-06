import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bffV1,
  collectPaginatedListPages,
  MAX_PAGINATED_LIST_PAGES,
  NON_TERMINAL_INCIDENT_STATUS_FILTER,
  PAGINATED_LIST_PAGE_SIZE,
  normalizeDeploymentFields,
} from "@/lib/bff-v1";
import { BffError } from "@/lib/bff-v1/errors";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  liveStatus._reset();
});

function enableStrictLiveMode() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
}

describe("collectPaginatedListPages and all-pages domain reads", () => {
  it("fetches every page across next_page_token for personas, capitalPools, runtimes, and deployments", async () => {
    enableStrictLiveMode();

    const fetchUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchUrls.push(url);

      if (url === `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "persona-be19a1fac471247f2b2a",
                name: "青禾｜2330 台股 Paper 學習 R2",
                owner: "operator",
                state: "approved",
                risk: "low",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 139, next_page_token: "200" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=200`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "persona-c6ef44745087d11cc138",
                name: "Retired Provisioning Audit Persona",
                owner: "operator",
                state: "retired",
                lifecycle_status: "retired",
                risk: "low",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 139, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === `/bff/capital-pools?page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            data: [{ id: "pool-page-1", name: "Pool Page 1", currency: "TWD", status: "active" }],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 136, next_page_token: "p2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/bff/capital-pools?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=p2`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "pool-persona-paper-298e138c136c9840b0e4",
                name: "pool-persona-paper-298e138c136c9840b0e4",
                currency: "USD",
                status: "active",
                capital_scope: "paper",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 136, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === `/bff/runtimes?page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "rb-page-1",
                runtime_binding_id: "rb-page-1",
                runtime_id: "rt-page-1",
                runtime_kind: "paper",
                execution_mode: "paper",
                status: "active",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 2, next_page_token: "rt2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/bff/runtimes?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=rt2`) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "rb-a1c3ada3d5894d57bc2e012f337753be",
                runtime_binding_id: "rb-a1c3ada3d5894d57bc2e012f337753be",
                runtime_id: "rt-535a82a3",
                runtime_kind: "paper",
                execution_mode: "paper",
                status: "active",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 2, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === `/bff/deployments?page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                plan_id: "plan-page-1",
                strategy_id: "strategy-page-1",
                artifact_id: "artifact-page-1",
                artifact_version: "1",
                target_stage: "paper",
                status: "active",
                updated_at: "2026-10-18T17:20:36.224810Z",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 133, next_page_token: "dep2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/bff/deployments?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=dep2`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                plan_id: "plan-persona-paper-298e138c136c9840b0e4",
                strategy_id: "strategy-persona-298e138c136c9840b0e4",
                artifact_id: "artifact-persona-298e138c136c9840b0e4",
                artifact_version: "1",
                target_stage: "paper",
                sponsor_persona_id: "persona-be19a1fac471247f2b2a",
                status: "active",
                updated_at: "2026-10-18T17:20:36.224810Z",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 133, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const [personas, pools, runtimes, deployments] = await Promise.all([
      bffV1.personas.list(),
      bffV1.capitalPools.list(),
      bffV1.runtimes.list(),
      bffV1.deployments.list(),
    ]);

    expect(personas.map((p) => p.id)).toEqual([
      "persona-be19a1fac471247f2b2a",
      "persona-c6ef44745087d11cc138",
    ]);
    expect(pools.map((p) => p.id)).toEqual([
      "pool-page-1",
      "pool-persona-paper-298e138c136c9840b0e4",
    ]);
    expect(runtimes.map((r) => r.id)).toEqual(["rt-page-1", "rt-535a82a3"]);
    expect(deployments.map((d) => d.id)).toEqual([
      "plan-page-1",
      "plan-persona-paper-298e138c136c9840b0e4",
    ]);
    expect(deployments[1]).toMatchObject({
      id: "plan-persona-paper-298e138c136c9840b0e4",
      planId: "plan-persona-paper-298e138c136c9840b0e4",
      name: "plan-persona-paper-298e138c136c9840b0e4",
      target: "paper",
      version: "1",
      strategyId: "strategy-persona-298e138c136c9840b0e4",
      artifactId: "artifact-persona-298e138c136c9840b0e4",
      sponsorPersonaId: "persona-be19a1fac471247f2b2a",
    });
    expect(fetchUrls).toEqual([
      `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/capital-pools?page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/runtimes?page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/deployments?page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=200`,
      `/bff/capital-pools?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=p2`,
      `/bff/runtimes?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=rt2`,
      `/bff/deployments?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=dep2`,
    ]);
  });

  it("reports strict fallback and throws BACKEND_UNAVAILABLE when reaching the page cap instead of silently truncating", async () => {
    enableStrictLiveMode();

    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount += 1;
      return new Response(
        JSON.stringify({
          data: [{ id: `persona-page-${callCount}`, name: `Persona ${callCount}` }],
          page_info: {
            page_size: PAGINATED_LIST_PAGE_SIZE,
            total: 9999,
            next_page_token: `token-${callCount}`,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(
      collectPaginatedListPages({
        helperName: "personas.list",
        path: "/bff/personas",
        extractPageItems: (rawPage) =>
          Array.isArray((rawPage as { data?: unknown[] })?.data)
            ? ((rawPage as { data: unknown[] }).data)
            : [],
        maxPages: 2,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(BffError);
      if (error instanceof BffError) {
        expect(error.code).toBe("BACKEND_UNAVAILABLE");
        expect(error.message).toContain("reached pagination cap (2 pages)");
        expect(error.message).toContain('next_page_token="token-2"');
      }
      return true;
    });

    expect(callCount).toBe(2);
    expect(liveStatus.get().lastError).toContain("strict:");
    expect(liveStatus.get().lastError).toContain("reached pagination cap (2 pages)");
    expect(MAX_PAGINATED_LIST_PAGES).toBeGreaterThanOrEqual(20);
  });

  it("fails through the same strict fallback and BACKEND_UNAVAILABLE error path on a two-page next_page_token cycle and returns no partial rows", async () => {
    enableStrictLiveMode();

    const fetchUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchUrls.push(url);

      if (url === `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "persona-be19a1fac471247f2b2a",
                name: "青禾｜2330 台股 Paper 學習 R2",
                owner: "operator",
                state: "approved",
                risk: "low",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 2, next_page_token: "200" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=200`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "persona-c6ef44745087d11cc138",
                name: "Retired Provisioning Audit Persona",
                owner: "operator",
                state: "retired",
                risk: "low",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 2, next_page_token: "200" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    let returnedRows: unknown;
    await expect(
      bffV1.personas.list().then((rows) => {
        returnedRows = rows;
        return rows;
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(BffError);
      if (error instanceof BffError) {
        expect(error.code).toBe("BACKEND_UNAVAILABLE");
        expect(error.message).toContain("personas.list");
        expect(error.message).toContain('repeated next_page_token="200"');
      }
      return true;
    });

    expect(returnedRows).toBeUndefined();
    expect(fetchUrls).toEqual([
      `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/personas?page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=200`,
    ]);
    expect(liveStatus.get().lastError).toContain("strict:");
    expect(liveStatus.get().lastError).toContain('repeated next_page_token="200"');
  });

  it("removes first-page unfiltered bffV1.strategies.list and exposes listNonDraft and listForPersona across pages", async () => {
    enableStrictLiveMode();

    expect("list" in bffV1.strategies).toBe(false);
    expect(typeof bffV1.strategies.listNonDraft).toBe("function");
    expect(typeof bffV1.strategies.listForPersona).toBe("function");

    const fetchUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchUrls.push(url);

      if (url === `/bff/strategies?exclude_state=draft&page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "strategy-non-draft-1",
                name: "Approved 1",
                owner: "operator",
                updatedAt: "2026-10-18T17:20:36.224810Z",
                state: "approved",
                risk: "low",
                alpha: "alpha.v1",
                capitalPoolId: "pool-1",
                personaIds: ["persona-1"],
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 26, next_page_token: "nd2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/bff/strategies?exclude_state=draft&page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=nd2`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "strategy-persona-298e138c136c9840b0e4",
                name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
                owner: "operator",
                updatedAt: "2026-10-18T17:20:36.224810Z",
                state: "approved",
                risk: "low",
                alpha: "alpha.tw.2330",
                personaIds: ["persona-be19a1fac471247f2b2a"],
                capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 26, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url ===
        `/bff/strategies?persona_id=persona-be19a1fac471247f2b2a&page_size=${PAGINATED_LIST_PAGE_SIZE}`
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "strategy-persona-298e138c136c9840b0e4",
                name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
                owner: "operator",
                updatedAt: "2026-10-18T17:20:36.224810Z",
                state: "approved",
                risk: "low",
                alpha: "alpha.tw.2330",
                personaIds: ["persona-be19a1fac471247f2b2a"],
                capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 1, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const nonDraft = await bffV1.strategies.listNonDraft();
    expect(nonDraft.map((s) => s.id)).toEqual([
      "strategy-non-draft-1",
      "strategy-persona-298e138c136c9840b0e4",
    ]);

    const forPersona = await bffV1.strategies.listForPersona("persona-be19a1fac471247f2b2a");
    expect(forPersona).toHaveLength(1);
    expect(forPersona[0]).toMatchObject({
      id: "strategy-persona-298e138c136c9840b0e4",
      alpha: "alpha.tw.2330",
      capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
      personaIds: ["persona-be19a1fac471247f2b2a"],
    });

    expect(fetchUrls).toEqual([
      `/bff/strategies?exclude_state=draft&page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/strategies?exclude_state=draft&page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=nd2`,
      `/bff/strategies?persona_id=persona-be19a1fac471247f2b2a&page_size=${PAGINATED_LIST_PAGE_SIZE}`,
    ]);
  });

  it("returns BFF strategy DTOs without persona_ids/persona_id/personaId/capital_pool_id alias synthesis and without replacing null with empty strings", async () => {
    enableStrictLiveMode();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `/bff/strategies?exclude_state=draft&page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "strategy-persona-298e138c136c9840b0e4",
                strategy_id: "strategy-persona-298e138c136c9840b0e4",
                name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
                owner: "operator",
                updatedAt: "2026-10-18T17:20:36.224810Z",
                state: "approved",
                risk: "low",
                alpha: "alpha.tw.2330",
                capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
                personaIds: ["persona-be19a1fac471247f2b2a"],
                pnl30d: null,
                sharpe: null,
                drawdown: null,
              },
              {
                id: "strategy-null-fields",
                name: "Null Fields Strategy",
                owner: "operator",
                updatedAt: "2026-10-18T17:20:36.224810Z",
                state: "approved",
                risk: "low",
                alpha: null,
                capitalPoolId: null,
                personaIds: [],
                persona_id: "legacy-alias-should-not-populate-personaIds",
                persona_ids: ["legacy-alias-should-not-populate-personaIds"],
                personaId: "legacy-alias-should-not-populate-personaIds",
                capital_pool_id: "legacy-alias-should-not-populate-capitalPoolId",
              },
            ],
            page_info: { page_size: PAGINATED_LIST_PAGE_SIZE, total: 2, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/bff/strategies/strategy-null-fields") {
        return new Response(
          JSON.stringify({
            data: {
              id: "strategy-null-fields",
              name: "Null Fields Strategy",
              owner: "operator",
              updatedAt: "2026-10-18T17:20:36.224810Z",
              state: "approved",
              risk: "low",
              alpha: null,
              capitalPoolId: null,
              personaIds: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const rows = await bffV1.strategies.listNonDraft();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "strategy-persona-298e138c136c9840b0e4",
      alpha: "alpha.tw.2330",
      capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
      personaIds: ["persona-be19a1fac471247f2b2a"],
      pnl30d: null,
      sharpe: null,
      drawdown: null,
    });
    expect("persona_id" in (rows[0] as unknown as Record<string, unknown>)).toBe(false);
    expect("persona_ids" in (rows[0] as unknown as Record<string, unknown>)).toBe(false);
    expect("personaId" in (rows[0] as unknown as Record<string, unknown>)).toBe(false);
    expect("capital_pool_id" in (rows[0] as unknown as Record<string, unknown>)).toBe(false);

    expect(rows[1].personaIds).toEqual([]);
    expect(rows[1].capitalPoolId).toBeNull();
    expect(rows[1].alpha).toBeNull();

    const detail = await bffV1.strategies.get("strategy-null-fields");
    expect(detail?.capitalPoolId).toBeNull();
    expect(detail?.alpha).toBeNull();
    expect(detail?.personaIds).toEqual([]);
  });

  it("queries GET /bff/incidents with non-terminal status filter across all pages when requested while keeping unfiltered bffV1.incidents.list single-page", async () => {
    enableStrictLiveMode();

    const encodedStatus = encodeURIComponent(NON_TERMINAL_INCIDENT_STATUS_FILTER);
    const page1Incidents = Array.from({ length: 20 }, (_, idx) => ({
      incident_id: `inc-open-${idx + 1}`,
      severity: "high",
      status: idx % 2 === 0 ? "open" : "investigating",
      summary: `Open breach ${idx + 1}`,
      detected_at: "2026-10-18T00:00:00Z",
    }));
    const page2Incidents = [
      {
        incident_id: "inc-open-21",
        severity: "critical",
        status: "mitigating",
        summary: "Open breach 21",
        detected_at: "2026-10-18T01:00:00Z",
      },
    ];

    const fetchUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchUrls.push(url);
      if (url === `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}`) {
        return new Response(
          JSON.stringify({
            incidents: page1Incidents,
            page_info: { page_size: 20, total: 21, next_page_token: "20" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url ===
        `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=20`
      ) {
        return new Response(
          JSON.stringify({
            incidents: page2Incidents,
            page_info: { page_size: 20, total: 21, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/bff/incidents") {
        return new Response(
          JSON.stringify({
            incidents: [page1Incidents[0]],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const incidents = await bffV1.incidents.list({ status: NON_TERMINAL_INCIDENT_STATUS_FILTER });
    expect(incidents).toHaveLength(21);
    expect(incidents[0].id).toBe("inc-open-1");
    expect(incidents[20].id).toBe("inc-open-21");

    const unfiltered = await bffV1.incidents.list();
    expect(unfiltered).toHaveLength(1);
    expect(fetchUrls).toEqual([
      `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}`,
      `/bff/incidents?status=${encodedStatus}&page_size=${PAGINATED_LIST_PAGE_SIZE}&page_token=20`,
      "/bff/incidents",
    ]);
  });

  it("normalizes native deployment plan_id records without id field", () => {
    const normalized = normalizeDeploymentFields({
      plan_id: "plan-persona-paper-298e138c136c9840b0e4",
      strategy_id: "strategy-persona-298e138c136c9840b0e4",
      artifact_id: "artifact-persona-298e138c136c9840b0e4",
      artifact_version: "1",
      target_stage: "paper",
      sponsor_persona_id: "persona-be19a1fac471247f2b2a",
      status: "active",
      updated_at: "2026-10-18T17:20:36.224810Z",
    });

    expect(normalized).toMatchObject({
      id: "plan-persona-paper-298e138c136c9840b0e4",
      planId: "plan-persona-paper-298e138c136c9840b0e4",
      name: "plan-persona-paper-298e138c136c9840b0e4",
      target: "paper",
      version: "1",
      strategyId: "strategy-persona-298e138c136c9840b0e4",
      artifactId: "artifact-persona-298e138c136c9840b0e4",
      sponsorPersonaId: "persona-be19a1fac471247f2b2a",
      state: "active",
    });
  });
});
