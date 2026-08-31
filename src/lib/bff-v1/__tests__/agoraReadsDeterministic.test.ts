import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bffAgora } from "@/lib/bff-v1/agora/agoraReads";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

describe("bffAgora deterministic read adapters", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("does not fabricate ticker symbols or wall-clock timestamps for missing signal DTO fields", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({
          items: [
            {
              signal_id: "sig-sparse-1",
            },
            {
              signal_id: "sig-sparse-2",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      ),
    );

    const signals = await bffAgora.signals.list();
    expect(signals).toHaveLength(2);
    expect(signals[0].symbol).toBe("");
    expect(signals[1].symbol).toBe("");
    expect(signals[0].generatedAt).toBe("");
    expect(signals[1].generatedAt).toBe("");
    expect(signals[0].reviewStatus).toBe("");
    expect(signals[0].rationale).toBe("");
  });

  it("does not fabricate wall-clock timestamps for missing insight/journal/session fields", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({
          items: [
            {
              id: "item-1",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      ),
    );

    const insights = await bffAgora.inbox.list();
    expect(insights).toHaveLength(1);
    expect(insights[0].ts).toBe("");

    const journal = await bffAgora.journal.list();
    expect(journal).toHaveLength(1);
    expect(journal[0].decidedAt).toBe("");

    const sessions = await bffAgora.ask.sessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].createdAt).toBe("");
    expect(sessions[0].updatedAt).toBe("");
  });
});
