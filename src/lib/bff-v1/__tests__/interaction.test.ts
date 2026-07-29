import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interaction } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

describe("Agora Interactions client tests", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    liveStatus._reset({ mode: "mock", effective: "mock", baseUrl: "" });
    vi.stubEnv("VITE_BFF_REAL_WRITES", "true");
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { session: { authenticated: true, session_kind: "bearer" }, environment: { name: "dev" } },
    }), { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("mock resolveContext returns a mock workshop_id", async () => {
    const res = await interaction.resolveContext({
      context_refs: [
        { type: "journal_entry", id: "episode-123" },
        { type: "persona", id: "per_quant" }
      ]
    });
    expect(res.data.workshop_id).toBeDefined();
    expect(res.data.workshop_id).toContain("wksp-mock-");
    expect(res.data.verified).toBe(true);
  });

  it("mock participants returns included and excluded list", async () => {
    const res = await interaction.participants({
      workshop_id: "wksp-1",
      mode: "consult",
      environment: "paper"
    });
    expect(res.data.included.length).toBeGreaterThan(0);
    expect(res.data.included.some(p => p.persona_id === "per_quant")).toBe(true);
  });

  it("mock submit returns a queued status", async () => {
    const res = await interaction.submit({
      workshop_id: "wksp-1",
      mode: "consult",
      topic: "Review risk",
      participant_persona_ids: ["per_quant"],
      context_refs: [
        { type: "journal_entry", id: "episode-123" }
      ]
    });
    expect(res.data.status).toBe("queued");
    expect(res.data.execution_authority).toBe("none");
  });

  it("live strict mode surfaces transport failure", async () => {
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { session: { authenticated: true, session_kind: "bearer" }, environment: { name: "dev" } },
      }), { status: 200 }))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      interaction.resolveContext({
        context_refs: [{ type: "journal_entry", id: "episode-123" }]
      })
    ).rejects.toThrow(/ECONNREFUSED|strict mode/);
  });

  it("makes zero requests when real writes are disabled", async () => {
    vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    await expect(interaction.resolveContext({
      context_refs: [{ type: "persona", id: "persona-1" }],
    })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(interaction.submit({
      workshop_id: "ws-1", mode: "ask", topic: "Reflect", participant_persona_ids: ["persona-1"],
      context_refs: [{ type: "persona", id: "persona-1" }],
    })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks strict stub sessions before any interaction POST", async () => {
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        session: { authenticated: true, session_kind: "stub" },
        environment: { name: "dev", strict_auth: true },
      },
    }), { status: 200 }));
    globalThis.fetch = fetchMock;
    await expect(interaction.resolveContext({
      context_refs: [{ type: "persona", id: "persona-1" }],
    })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/bff/me");
  });
});
