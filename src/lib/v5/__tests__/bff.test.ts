import { afterEach, describe, it, expect, vi } from "vitest";
import { bffV5 } from "@/lib/bff-v1/v5Client";

const realFetch = globalThis.fetch;

describe("bffV5 facade (Q3/Q14/Q16/Q24)", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exposes session without depending on MeDto", async () => {
    const s = await bffV5.session.get();
    expect(s.tenantId).toBe("demo");
    expect(s.env).toBeTruthy();
    expect(s.locale).toBeTruthy();
  });

  it("controlRoom.get returns summary with kpi + topFindings", async () => {
    const s = await bffV5.controlRoom.get();
    expect(s.kpi).toBeDefined();
    expect(Array.isArray(s.topFindings)).toBe(true);
    expect(Array.isArray(s.loopRuns)).toBe(true);
  });

  it("loops.list returns V5ListResponse with totalCountExact=true", async () => {
    const r = await bffV5.loops.list();
    expect(r.totalCountExact).toBe(true);
    expect(r.items.length).toBe(r.totalCount);
  });

  it("personas.health returns adapted PersonaExecutionHealth with formulaVersion", async () => {
    const r = await bffV5.personas.health();
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].formulaVersion).toBe("v0-mock");
    expect(["live", "paper", "shadow", "suspended"]).toContain(r.items[0].mode);
  });


  describe("fail-closed write gating (VITE_BFF_REAL_WRITES=false)", () => {
    it("fails closed without network calls for all POST operations", async () => {
      vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
      vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;



      const advanceResult = await bffV5.loops.advance("loop-1");
      expect(advanceResult).toEqual({ ok: false, reason: "writes_disabled" });

      const pauseResult = await bffV5.loops.pause("loop-1", "test pause");
      expect(pauseResult).toEqual({ ok: false, reason: "writes_disabled" });

      const resumeResult = await bffV5.loops.resume("loop-1");
      expect(resumeResult).toEqual({ ok: false, reason: "writes_disabled" });

      const cancelResult = await bffV5.loops.cancel("loop-1");
      expect(cancelResult).toEqual({ ok: false, reason: "writes_disabled" });


      expect(fetchMock).toHaveBeenCalledTimes(0);
    });
  });

  describe("write-gated live dispatch (VITE_BFF_REAL_WRITES=true)", () => {
    it("dispatches live POST requests when session is authenticated and write-enabled", async () => {
      vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
      vi.stubEnv("VITE_BFF_REAL_WRITES", "true");

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/bff/me")) {
          return new Response(JSON.stringify({
            data: {
              session: { authenticated: true, session_kind: "cookie" },
              environment: { name: "dev", strict_auth: false },
            },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.endsWith("/bff/v5/loop-runs/live-loop/advance")) {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.endsWith("/bff/v5/loop-runs/live-loop/pause")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({ reason: "pause reason" });
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.endsWith("/bff/v5/loop-runs/live-loop/resume")) {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.endsWith("/bff/v5/loop-runs/live-loop/cancel")) {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response("not found", { status: 404 });
      });
      globalThis.fetch = fetchMock;



      const advanceResult = await bffV5.loops.advance("live-loop");
      expect(advanceResult).toEqual({ ok: true });

      const pauseResult = await bffV5.loops.pause("live-loop", "pause reason");
      expect(pauseResult).toEqual({ ok: true });

      const resumeResult = await bffV5.loops.resume("live-loop");
      expect(resumeResult).toEqual({ ok: true });

      const cancelResult = await bffV5.loops.cancel("live-loop");
      expect(cancelResult).toEqual({ ok: true });


      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
