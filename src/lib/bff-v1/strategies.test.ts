import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BffError } from "./errors";
import { liveStatus } from "./liveStatus";
import {
  createStrategy,
  getStrategy,
  listNonDraftStrategies,
  listStrategiesForPersona,
  strategies,
} from "./strategies";
import { writeOverlay } from "./writeOverlay";

describe("strategies BFF client", () => {
  beforeEach(() => {
    writeOverlay.clear();
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    liveStatus._reset();
    writeOverlay.clear();
    vi.restoreAllMocks();
  });

  it("posts draft strategy creation to POST /bff/strategies with Idempotency-Key header and returns the canonical owner DTO unchanged", async () => {
    const addSpy = vi.spyOn(writeOverlay, "add");
    const ownerDto = {
      id: "strategy-20261106-a1b2c3d4",
      strategy_id: "strategy-20261106-a1b2c3d4",
      name: "Cross-Sectional Momentum Draft",
      owner: "ops@mvl-cap.tw",
      updatedAt: "2026-11-06T07:00:00Z",
      state: "draft" as const,
      risk: "medium" as const,
      alpha: "alpha_cs_mom_v1",
      capitalPoolId: "pool-paper-01",
      personaIds: ["persona-alpha-1", "persona-risk-2"],
      pnl: null,
      pnl30d: null,
      sharpe: null,
      drawdown: null,
      totalTrades: null,
      metricsAsOf: null,
      metricsResolution: "missing" as const,
      metricsPersonaId: null,
      availableActions: ["edit", "submit", "retire"],
      labelKey: "strategy.strategy-20261106-a1b2c3d4",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: ownerDto,
          meta: {
            snapshot_at: "2026-11-06T07:00:00Z",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const created = await createStrategy(
      {
        name: "  Cross-Sectional Momentum Draft  ",
        alpha: "  alpha_cs_mom_v1  ",
        capitalPoolId: "  pool-paper-01  ",
        personaIds: [" persona-alpha-1 ", "persona-risk-2", "   "],
        owner: "you",
        state: "approved",
      } as unknown as Parameters<typeof createStrategy>[0],
      { idempotencyKey: "idem-strat-create-001" },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://bff.example/bff/strategies");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("idem-strat-create-001");

    const parsedBody = JSON.parse(String(init?.body ?? "{}"));
    expect(parsedBody).toEqual({
      name: "Cross-Sectional Momentum Draft",
      alpha: "alpha_cs_mom_v1",
      capitalPoolId: "pool-paper-01",
      personaIds: ["persona-alpha-1", "persona-risk-2"],
      state: "draft",
    });
    expect(parsedBody).not.toHaveProperty("owner");
    expect(parsedBody).not.toHaveProperty("idempotencyKey");
    expect(parsedBody).not.toHaveProperty("idempotency_key");

    expect(created).toEqual(ownerDto);
    expect(addSpy).not.toHaveBeenCalled();
    expect(writeOverlay.list("strategy")).toHaveLength(0);
  });

  it("forwards an explicit non-placeholder owner and optional risk level when provided", async () => {
    const ownerDto = {
      id: "strategy-20261106-f00dbabe",
      strategy_id: "strategy-20261106-f00dbabe",
      name: "Vol Carry Draft",
      owner: "desk-quant",
      updatedAt: "2026-11-06T07:05:00Z",
      state: "draft" as const,
      risk: "low" as const,
      alpha: "alpha_vol_carry",
      capitalPoolId: "pool-paper-02",
      personaIds: ["persona-1"],
      pnl: null,
      pnl30d: null,
      sharpe: null,
      drawdown: null,
      totalTrades: null,
      metricsAsOf: null,
      metricsResolution: "missing" as const,
      metricsPersonaId: null,
      availableActions: ["edit", "submit", "retire"],
      labelKey: "strategy.strategy-20261106-f00dbabe",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: ownerDto,
          meta: {
            snapshot_at: "2026-11-06T07:05:00Z",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const created = await strategies.create(
      {
        name: "Vol Carry Draft",
        alpha: "alpha_vol_carry",
        capitalPoolId: "pool-paper-02",
        personaIds: ["persona-1"],
        owner: "desk-quant",
        risk: "low",
      },
      { idempotencyKey: "idem-strat-create-002" },
    );

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
      name: "Vol Carry Draft",
      alpha: "alpha_vol_carry",
      capitalPoolId: "pool-paper-02",
      personaIds: ["persona-1"],
      owner: "desk-quant",
      risk: "low",
      state: "draft",
    });
    expect(created).toEqual(ownerDto);
  });

  it.each([
    [401, "AUTH_REQUIRED", "Authentication required."],
    [403, "PERMISSION_DENIED", "Write role required."],
    [409, "IDEMPOTENCY_CONFLICT", "Idempotency key already used with different payload."],
    [503, "UPSTREAM_UNAVAILABLE", "Strategy write owner unavailable."],
  ])("propagates HTTP %i (%s) without writing to overlay", async (status, code, message) => {
    const addSpy = vi.spyOn(writeOverlay, "add");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code,
            message,
            correlation_id: `corr-${status}`,
          },
        }),
        { status, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      createStrategy(
        {
          name: "Blocked Draft",
          alpha: "alpha_1",
          capitalPoolId: "pool-1",
          personaIds: ["persona-1"],
        },
        { idempotencyKey: `idem-${status}` },
      ),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(BffError);
      const bffErr = err as BffError;
      expect(bffErr.status).toBe(status);
      expect(bffErr.code).toBe(code);
      expect(bffErr.message).toContain(message);
      return true;
    });

    expect(addSpy).not.toHaveBeenCalled();
    expect(writeOverlay.list("strategy")).toHaveLength(0);
  });

  it("fails closed when the backend response has malformed canonical data, omits canonical data.id, or omits/violates canonical data.state==='draft'", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const requestPayload = {
      name: "Strict Validation Strategy",
      alpha: "alpha_1",
      capitalPoolId: "pool-1",
      personaIds: ["persona-1"],
    };

    for (const malformedBody of [
      { data: { name: "Missing ID Strategy", state: "draft" } },
      { data: { strategy_id: "strategy-alias-only", state: "draft" } },
      { id: "strategy-raw-top-level", state: "draft" },
      { data: null },
      { data: [] },
    ]) {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(malformedBody), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(createStrategy(requestPayload)).rejects.toMatchObject({
        code: "BACKEND_UNAVAILABLE",
      });
    }

    for (const badStateBody of [
      { data: { id: "s" } },
      { data: { id: "s", lifecycle_state: "draft" } },
      { data: { id: "strategy-20261106-non-draft", name: "Unexpected Approved Strategy", state: "approved" } },
    ]) {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(badStateBody), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(createStrategy(requestPayload)).rejects.toMatchObject({
        code: "STATE_CONFLICT",
      });
    }
  });

  it("loads non-draft strategies with exclude_state=draft across pages and preserves strategies.get behavior", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "strat-existing-1",
              name: "Existing Strategy",
              owner: "quant",
              updatedAt: "2026-11-06T00:00:00Z",
              state: "approved",
              risk: "low",
              alpha: "alpha_1",
              capitalPoolId: "pool-1",
              personaIds: ["persona-1"],
            },
          ],
          meta: { page: 1, page_size: 200, total: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const listed = await listNonDraftStrategies();
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://bff.example/bff/strategies?exclude_state=draft&page_size=200",
    );
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe("strat-existing-1");

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: "strategy-20261106-a1b2c3d4",
            name: "Created Draft Strategy",
            owner: "ops@mvl-cap.tw",
            updatedAt: "2026-11-06T07:00:00Z",
            state: "draft",
            risk: "medium",
            alpha: "alpha_cs_mom_v1",
            capitalPoolId: "pool-paper-01",
            personaIds: ["persona-alpha-1"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const detail = await getStrategy("strategy-20261106-a1b2c3d4");
    expect(String(fetchSpy.mock.calls[1][0])).toBe(
      "https://bff.example/bff/strategies/strategy-20261106-a1b2c3d4",
    );
    expect(detail?.id).toBe("strategy-20261106-a1b2c3d4");
    expect(detail?.state).toBe("draft");
  });

  it("paginates non-draft and persona-scoped strategy reads across multiple pages with bounded page cap enforcement", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const page1Rows = Array.from({ length: 200 }, (_, idx) => ({
      id: `strat-p1-${idx + 1}`,
      name: `Strategy ${idx + 1}`,
      owner: "quant",
      updatedAt: "2026-11-06T00:00:00Z",
      state: "approved",
      risk: "low",
      alpha: "alpha_1",
      capitalPoolId: "pool-1",
      personaIds: ["persona-1"],
    }));
    const page2Rows = [
      {
        id: "strategy-persona-298e138c136c9840b0e4",
        name: "Page 2 Persona Strategy",
        owner: "quant",
        updatedAt: "2026-11-06T00:00:00Z",
        state: "approved",
        risk: "low",
        alpha: "alpha_2",
        capital_pool_id: "pool-persona-paper-298e138c136c9840b0e4",
        persona_id: "persona-be19a1fac471247f2b2a",
      },
    ];

    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: page1Rows,
            page_info: { page_size: 200, total: 201, next_page_token: "200" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: page2Rows,
            page_info: { page_size: 200, total: 201, next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const allNonDraft = await strategies.listNonDraft();
    expect(allNonDraft).toHaveLength(201);
    expect(allNonDraft[200].id).toBe("strategy-persona-298e138c136c9840b0e4");
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://bff.example/bff/strategies?exclude_state=draft&page_size=200",
    );
    expect(String(fetchSpy.mock.calls[1][0])).toBe(
      "https://bff.example/bff/strategies?exclude_state=draft&page_size=200&page_token=200",
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: page2Rows,
          page_info: { page_size: 200, total: 1, next_page_token: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const forPersona = await listStrategiesForPersona("persona-be19a1fac471247f2b2a");
    expect(forPersona).toHaveLength(1);
    expect(forPersona[0].personaIds).toContain("persona-be19a1fac471247f2b2a");
    expect(String(fetchSpy.mock.calls[2][0])).toBe(
      "https://bff.example/bff/strategies?persona_id=persona-be19a1fac471247f2b2a&page_size=200",
    );
    expect((strategies as Record<string, unknown>).list).toBeUndefined();
  });
});
