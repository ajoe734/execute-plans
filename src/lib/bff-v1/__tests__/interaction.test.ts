import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interaction } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

describe("Agora Interactions client tests", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    liveStatus._reset({ mode: "mock", effective: "mock", baseUrl: "" });
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
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      interaction.resolveContext({
        context_refs: [{ type: "journal_entry", id: "episode-123" }]
      })
    ).rejects.toThrow(/ECONNREFUSED|strict mode/);
  });
});
