import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveStatus } from "./liveStatus";
import { patchPersonaRisk } from "./personas";
import { liveWriteGated } from "./writeGate";

// Exercise the real deployment/session gate and live client; only HTTP is stubbed.
describe("Persona risk PATCH live write safety", () => {
  const fetchMock = vi.fn();
  const json = (data: unknown) => new Response(JSON.stringify({ data }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://example.test");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
    vi.stubEnv("VITE_BFF_ALLOW_DEV_STUB_WRITES", "false");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://example.test" });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("refuses writes with VITE_BFF_REAL_WRITES=false before any HTTP dispatch", async () => {
    vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
    expect(await liveWriteGated()).toBe(false);
    await expect(patchPersonaRisk("paper-1", { risk: "medium" })).rejects.toMatchObject({
      code: "FEATURE_DISABLED", details: { reason: "write_unavailable" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["stub", "unknown"])("refuses a %s session without dispatching PATCH", async (sessionKind) => {
    fetchMock.mockImplementation(() => Promise.resolve(json({
      env: "dev", session: { authenticated: true, session_kind: sessionKind },
    })));
    await expect(patchPersonaRisk("paper-1", { risk: "medium" })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("fails closed when session authority cannot be read", async () => {
    fetchMock.mockRejectedValue(new Error("session unavailable"));
    await expect(patchPersonaRisk("paper-1", { risk: "medium" })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(fetchMock.mock.calls.every((call) => call[1].method === "GET")).toBe(true);
  });

  it("dispatches the scoped PATCH with Idempotency-Key only after genuine session authority", async () => {
    fetchMock.mockResolvedValueOnce(json({
      env: "dev", session: { authenticated: true, session_kind: "bearer" },
    })).mockResolvedValueOnce(json({ id: "paper-1", riskPolicyChange: {
      requestedRisk: "medium", effectiveRisk: null, status: "pending_approval",
      policyVersion: null, approvalId: null,
    } }));
    await expect(patchPersonaRisk("paper-1", { risk: "medium" }, { idempotencyKey: "risk-change-1" }))
      .resolves.toMatchObject({ riskPolicyChange: { effectiveRisk: null, status: "pending_approval" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe("https://example.test/bff/personas/paper-1");
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body)).toEqual({ risk: "medium" });
    expect(request.headers["Idempotency-Key"]).toBe("risk-change-1");
  });
});
