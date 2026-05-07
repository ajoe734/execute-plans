import { describe, it, expect } from "vitest";
import { asListEnvelope, LIST_CLASS_BY_KEY } from "@/lib/bff-v1/lists";

describe("VI-A C6 — per-entity totalCountExact (Pack D D22)", () => {
  it("entityRegistry lists report exact counts", async () => {
    const loader = asListEnvelope(async () => [{ id: "a" }, { id: "b" }], "entityRegistry");
    const env = await loader();
    expect(env.totalCountExact).toBe(true);
    expect(env.estimatedTotal).toBe(2);
  });

  it("governanceQueue lists report exact counts", async () => {
    const loader = asListEnvelope(async () => [{ id: "a" }], "governanceQueue");
    const env = await loader();
    expect(env.totalCountExact).toBe(true);
  });

  it("auditFeed estimates only", async () => {
    const loader = asListEnvelope(async () => [{ id: "a" }], "auditFeed");
    const env = await loader();
    expect(env.totalCountExact).toBe(false);
    expect(env.estimatedTotal).toBe(1);
  });

  it("realtimeFeed omits estimatedTotal", async () => {
    const loader = asListEnvelope(async () => [{ id: "a" }], "realtimeFeed");
    const env = await loader();
    expect(env.totalCountExact).toBe(false);
    expect(env.estimatedTotal).toBeUndefined();
  });

  it("rebalances + deployments classified as governanceQueue", () => {
    expect(LIST_CLASS_BY_KEY.rebalances).toBe("governanceQueue");
    expect(LIST_CLASS_BY_KEY.deployments).toBe("governanceQueue");
  });
});
