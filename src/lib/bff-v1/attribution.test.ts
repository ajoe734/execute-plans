import { afterEach, describe, expect, it } from "vitest";
import { setMockResolver } from "./client";
import { makeBffError } from "./errors";
import { getAttributionOutliers, getShadowComparison, settlementLabelKind } from "./attribution";

const json = (body: unknown) => ({ kind: "json" as const, status: 200, body });
afterEach(() => setMockResolver(undefined));

describe("attribution client", () => {
  it("forwards decomposition untouched and maps empty", async () => {
    setMockResolver((_m, p) => p.endsWith("/outliers") ? () => json({ status: "ok", items: [{ record_id: "r", decomposition: { selection: 0.4 } }] }) : undefined);
    const r = await getAttributionOutliers();
    expect(r.state === "ok" && r.data.items[0].decomposition.selection).toBe(0.4);
    setMockResolver(() => () => json({ status: "empty", items: [] }));
    expect((await getAttributionOutliers()).state).toBe("empty");
  });
  it("maps 404 to not_found and unavailable envelopes", async () => {
    setMockResolver(() => () => { throw makeBffError({ status: 404, code: "RESOURCE_NOT_FOUND" } as never); });
    expect((await getShadowComparison("x")).state).toBe("not_found");
    setMockResolver(() => () => json({ status: "unavailable", reason: "r1" }));
    expect(await getShadowComparison("x")).toEqual({ state: "unavailable", reason: "r1" });
  });
  it("never classifies paper proxy as actual fill", () => {
    expect(settlementLabelKind("paper_proxy")).toBe("paper_proxy");
    expect(settlementLabelKind("actual_fill")).toBe("actual_fill");
    expect(settlementLabelKind(null)).toBe("unknown");
  });
});
