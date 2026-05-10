import { describe, it, expect, beforeEach } from "vitest";
import { writeOverlay, withOverlay } from "@/lib/bff/writeOverlay";

describe("writeOverlay", () => {
  beforeEach(() => writeOverlay.clear());

  it("adds and lists entries by entity type", () => {
    writeOverlay.add("persona", { id: "ps_a", name: "A" });
    writeOverlay.add("strategy", { id: "st_b", name: "B" });
    expect(writeOverlay.list("persona")).toHaveLength(1);
    expect(writeOverlay.list("strategy")).toHaveLength(1);
  });

  it("withOverlay merges overlay items above base loader", async () => {
    writeOverlay.add("persona", { id: "ps_new", name: "new" });
    const loader = withOverlay<{ id: string }>("persona", async () => [{ id: "ps_seed" }]);
    const rows = await loader();
    expect(rows[0].id).toBe("ps_new");
    expect(rows[1].id).toBe("ps_seed");
  });

  it("gets a newly-created overlay item by id", () => {
    writeOverlay.add("persona", { id: "ps_detail", name: "detail persona" });
    expect(writeOverlay.get("persona", "ps_detail")?.name).toBe("detail persona");
    expect(writeOverlay.get("persona", "ps_missing")).toBeUndefined();
  });
});
