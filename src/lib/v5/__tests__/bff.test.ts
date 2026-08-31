import { afterEach, describe, it, expect, vi } from "vitest";
import { bffV5 } from "@/lib/bff-v1";
import { v5ActionOverlay } from "@/lib/v5/overlay";

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
    expect(["live","paper","shadow","suspended"]).toContain(r.items[0].mode);
  });

  it("remediation.build emergency requires HighRiskConfirm", () => {
    const a = bffV5.remediation.build("pause_persona_routing", { targetKind: "persona", targetId: "per_quant" });
    expect(a?.mode).toBe("emergency_override");
    expect(a?.requiresHighRiskConfirm).toBe(true);
  });

  it("remediation.execute sends live remediation command to target endpoint", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/bff/v5/interventions/per_quant/remediate")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock;

    const a = bffV5.remediation.build("switch_persona_to_shadow", { id: "per_quant", targetKind: "persona", targetId: "per_quant" })!;
    const r = await bffV5.remediation.execute(a);
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://bff.example.test/bff/v5/interventions/per_quant/remediate");
  });

  it("sentinel.setStatus posts to the live status endpoint", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/bff/v5/sentinel/findings/live-finding/status")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ status: "dismissed" });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock;

    const result = await bffV5.sentinel.setStatus("live-finding", "dismissed");

    expect(result).toEqual({ ok: true, persisted: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://bff.example.test/bff/v5/sentinel/findings/live-finding/status");
  });
});
