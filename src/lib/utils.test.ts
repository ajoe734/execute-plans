import { describe, it, expect } from "vitest";
import { safePercent, safeRatio } from "@/lib/utils";

describe("safeRatio", () => {
  it("computes a normal ratio", () => {
    expect(safeRatio(50, 200)).toBe(0.25);
  });

  it("returns 0 instead of NaN when either operand is missing", () => {
    expect(safeRatio(undefined, 200)).toBe(0);
    expect(safeRatio(50, undefined)).toBe(0);
  });

  it("returns 0 instead of Infinity when the denominator is 0", () => {
    expect(safeRatio(50, 0)).toBe(0);
  });
});

describe("safePercent", () => {
  it("formats a finite fraction as a percent string", () => {
    expect(safePercent(0.42)).toBe("42.0%");
    expect(safePercent(0.4256, 2)).toBe("42.56%");
  });

  it("returns an em dash instead of 'NaN%' for a missing/non-finite value", () => {
    expect(safePercent(undefined)).toBe("—");
    expect(safePercent(NaN)).toBe("—");
  });
});
