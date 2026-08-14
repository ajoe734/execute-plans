import { describe, expect, it } from "vitest";

import { buildPromotionAllocationHref } from "./promotionAllocationRedirectHref";

describe("buildPromotionAllocationHref", () => {
  it("canonicalizes paper ranking routes to the paper candidate tab", () => {
    expect(buildPromotionAllocationHref({ tab: "paper-candidates" })).toBe(
      "/management/promotion-allocation?tab=paper-candidates",
    );
  });

  it("preserves existing query params while selecting the quarterly capital tab", () => {
    expect(buildPromotionAllocationHref({ tab: "quarterly-capital", search: "?pool=pool-alpha" })).toBe(
      "/management/promotion-allocation?pool=pool-alpha&tab=quarterly-capital",
    );
  });

  it("carries retired detail ids into workbench context params", () => {
    expect(buildPromotionAllocationHref({
      tab: "quarterly-capital",
      id: "rb-q3",
      idParamName: "rebalance_id",
    })).toBe("/management/promotion-allocation?tab=quarterly-capital&rebalance_id=rb-q3");

    expect(buildPromotionAllocationHref({
      tab: "formula-policy",
      id: "rank-v3",
      idParamName: "formula_id",
      hash: "#history",
    })).toBe("/management/promotion-allocation?tab=formula-policy&formula_id=rank-v3#history");
  });
});
