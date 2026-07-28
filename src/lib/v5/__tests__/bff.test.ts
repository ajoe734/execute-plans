import { afterEach, describe, it, expect, vi } from "vitest";
import { bff } from "@/lib/bff-v1";
import { v5ActionOverlay } from "@/lib/v5/overlay";

const realFetch = globalThis.fetch;

describe("bff.v5 facade (Q3/Q14/Q16/Q24)", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exposes session without depending on MeDto", async () => {
    const s = await bff.v5.session.get();
    expect(s.tenantId).toBe("demo");
    expect(s.env).toBeTruthy();
    expect(s.locale).toBeTruthy();
  });

  it("controlRoom.get returns summary with kpi + topFindings", async () => {
    const s = await bff.v5.controlRoom.get();
    expect(s.kpi).toBeDefined();
    expect(Array.isArray(s.topFindings)).toBe(true);
    expect(Array.isArray(s.loopRuns)).toBe(true);
  });

  it("loops.list returns V5ListResponse with totalCountExact=true", async () => {
    const r = await bff.v5.loops.list();
    expect(r.totalCountExact).toBe(true);
    expect(r.items.length).toBe(r.totalCount);
  });

  it("personas.health returns adapted PersonaExecutionHealth with formulaVersion", async () => {
    const r = await bff.v5.personas.health();
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].formulaVersion).toBe("v0-mock");
    expect(["live","paper","shadow","suspended"]).toContain(r.items[0].mode);
  });

  it("remediation.build emergency requires HighRiskConfirm", () => {
    const a = bff.v5.remediation.build("pause_persona_routing", { targetKind: "persona", targetId: "per_quant" });
    expect(a?.mode).toBe("emergency_override");
    expect(a?.requiresHighRiskConfirm).toBe(true);
  });

  it("remediation.execute updates overlay only (no seed mutation)", async () => {
    v5ActionOverlay.clear();
    const a = bff.v5.remediation.build("switch_persona_to_shadow", { targetKind: "persona", targetId: "per_quant" })!;
    const r = await bff.v5.remediation.execute(a);
    expect(r.overlayUpdated).toBe(true);
    expect(v5ActionOverlay.getPersona("per_quant")?.forcedMode).toBe("shadow");
    v5ActionOverlay.clear();
  });

  it("sentinel.setStatus updates the mock/session list state", async () => {
    const before = await bff.v5.sentinel.list();
    const target = before.items.find((finding) => finding.status === "open") ?? before.items[0];

    const result = await bff.v5.sentinel.setStatus(target.id, "acknowledged");
    const after = await bff.v5.sentinel.list();

    expect(result).toEqual({ ok: true, persisted: false });
    expect(after.items.find((finding) => finding.id === target.id)?.status).toBe("acknowledged");
    await bff.v5.sentinel.setStatus(target.id, target.status);
  });

  it("sentinel.setStatus posts to the live status endpoint when write-gated", async () => {
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
      if (url.endsWith("/bff/v5/sentinel/findings/live-finding/status")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ status: "dismissed" });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fetchMock;

    const result = await bff.v5.sentinel.setStatus("live-finding", "dismissed");

    expect(result).toEqual({ ok: true, persisted: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://bff.example.test/bff/v5/sentinel/findings/live-finding/status");
  });
});
