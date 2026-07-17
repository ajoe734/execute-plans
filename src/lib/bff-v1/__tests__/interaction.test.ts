import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interaction } from "@/lib/bff-v1";
import { resolveContextIdempotencyKey, type ResolveContextEnvelope } from "@/lib/bff-v1/agora/interaction";
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

  it("derives one stable ASCII idempotency identity from the complete canonical request", async () => {
    const request = {
      workshop_id: "ws-1",
      context_refs: [{ type: "persona" as const, id: "persona-1" }],
      selected_persona_ids: ["persona-1"],
      initial_mode: "reflect",
      source_route: "/management/personas/persona-1",
    };
    const reordered = {
      source_route: request.source_route,
      initial_mode: request.initial_mode,
      selected_persona_ids: request.selected_persona_ids,
      context_refs: request.context_refs,
      workshop_id: request.workshop_id,
    };
    const first = await resolveContextIdempotencyKey(request);
    await expect(resolveContextIdempotencyKey(reordered)).resolves.toBe(first);
    expect(first).toMatch(/^pint15-context-[a-f0-9]{64}$/);
    await expect(resolveContextIdempotencyKey({ ...request, initial_mode: "challenge" })).resolves.not.toBe(first);
  });

  it("replays an identical live resolve request with one server receipt", async () => {
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    const receipts = new Map<string, ResolveContextEnvelope>();
    const resolveKeys: string[] = [];
    let mintedReceipts = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) {
        return new Response(JSON.stringify({
          data: { session: { authenticated: true, session_kind: "bearer" }, environment: { name: "dev" } },
        }), { status: 200 });
      }
      const idempotencyKey = new Headers(init?.headers).get("Idempotency-Key") ?? "";
      resolveKeys.push(idempotencyKey);
      let receipt = receipts.get(idempotencyKey);
      if (!receipt) {
        mintedReceipts += 1;
        receipt = {
          data: {
            workshop_id: "ws-1",
            context_refs: [{ type: "persona", id: "persona-1" }],
            context_digest: "server-context-digest",
            environment: "paper",
            verified: true,
            resolved_at: "2026-07-17T00:00:00Z",
          },
        };
        receipts.set(idempotencyKey, receipt);
      }
      return new Response(JSON.stringify(receipt), { status: 200 });
    });
    const request = {
      workshop_id: "ws-1",
      context_refs: [{ type: "persona" as const, id: "persona-1" }],
      selected_persona_ids: ["persona-1"],
      initial_mode: "reflect",
      environment: "paper",
    };

    const mountReceipt = await interaction.resolveContext(request);
    const preSubmitReceipt = await interaction.resolveContext(request);

    expect(preSubmitReceipt).toEqual(mountReceipt);
    expect(resolveKeys).toHaveLength(2);
    expect(resolveKeys[0]).toBe(resolveKeys[1]);
    expect(resolveKeys[0]).toMatch(/^pint15-context-[a-f0-9]{64}$/);
    expect(mintedReceipts).toBe(1);
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
