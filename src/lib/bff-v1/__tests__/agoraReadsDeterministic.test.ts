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

  it("preserves journal aliases and filters the requested strategy", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { entry_id: "j1", scope: { type: "Strategy", id: "s1" }, decision: "Keep paper", actor_id: "operator", decided_at: "2026-09-30T00:00:00Z", outcome: "good" },
      { id: "j2", subjectKind: "Strategy", subjectId: "s2" },
    ] }), { status: 200 }));
    expect(await decisionJournal.forSubject("Strategy", "s1")).toEqual([
      { id: "j1", subjectKind: "Strategy", subjectId: "s1", title: "Keep paper", decidedBy: "operator", decidedAt: "2026-09-30T00:00:00Z", outcome: "good" },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://bff.example.test/bff/agora/journal", expect.anything());
  });

  it("propagates a journal transport failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(decisionJournal.list()).rejects.toThrow();
  });
});
