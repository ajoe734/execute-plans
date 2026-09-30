import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decisionJournal } from "@/lib/bff-v1/governance";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

describe("management decision journal adapter", () => {
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

  it("does not fabricate wall-clock timestamps for missing journal fields", async () => {
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

    const journal = await decisionJournal.list();
    expect(journal).toHaveLength(1);
    expect(journal[0].decidedAt).toBe("");

  });
});
