// Pack F 短板 4 — extended TTL & GC behaviour for writeOverlay.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { writeOverlay, withOverlay, WRITE_OVERLAY_TTL_MS } from "@/lib/bff/writeOverlay";

describe("writeOverlay TTL", () => {
  beforeEach(() => {
    writeOverlay.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires entries after TTL", () => {
    writeOverlay.add("persona", { id: "ps_x", name: "X" });
    expect(writeOverlay.list("persona")).toHaveLength(1);
    vi.advanceTimersByTime(WRITE_OVERLAY_TTL_MS + 1000);
    expect(writeOverlay.list("persona")).toHaveLength(0);
  });

  it("keeps entries strictly within TTL window", () => {
    writeOverlay.add("strategy", { id: "st_a", name: "A" });
    vi.advanceTimersByTime(WRITE_OVERLAY_TTL_MS - 1000);
    expect(writeOverlay.list("strategy")).toHaveLength(1);
  });

  it("withOverlay merges only non-expired entries", async () => {
    writeOverlay.add("artifact", { id: "ar_old", name: "old" });
    vi.advanceTimersByTime(WRITE_OVERLAY_TTL_MS + 100);
    writeOverlay.add("artifact", { id: "ar_new", name: "new" });
    const loader = withOverlay<{ id: string }>("artifact", async () => [{ id: "ar_seed" }]);
    const rows = await loader();
    expect(rows.map((r) => r.id)).toEqual(["ar_new", "ar_seed"]);
  });

  it("clear() removes everything immediately", () => {
    writeOverlay.add("deployment", { id: "dp_1", name: "d" });
    writeOverlay.clear();
    expect(writeOverlay.list("deployment")).toHaveLength(0);
  });
});
