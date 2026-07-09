import { describe, expect, it } from "vitest";
import { extractDegradation } from "../degradation";

describe("extractDegradation", () => {
  it("returns not-degraded for empty/invalid meta", () => {
    expect(extractDegradation(undefined)).toEqual({ degraded: false });
    expect(extractDegradation(null)).toEqual({ degraded: false });
    expect(extractDegradation("nope")).toEqual({ degraded: false });
    expect(extractDegradation([])).toEqual({ degraded: false });
  });

  it("returns not-degraded when surfaces are all ok", () => {
    const meta = { surfaces: { skill_list: { status: "ok", source: "service_store" } } };
    expect(extractDegradation(meta)).toEqual({ degraded: false });
  });

  it("detects an unavailable surface and surfaces the degradation reason", () => {
    // mirrors the live /bff/skills envelope
    const meta = {
      snapshot_at: "2026-06-16T00:58:05Z",
      surfaces: { skill_list: { status: "unavailable", source: "missing" } },
      total: 0,
      degradation: { reason: "skill list is currently unavailable." },
    };
    expect(extractDegradation(meta)).toEqual({
      degraded: true,
      level: "unavailable",
      reason: "skill list is currently unavailable.",
    });
  });

  it("treats degraded as degraded (without a reason)", () => {
    const meta = { surfaces: { x: { status: "degraded" } } };
    expect(extractDegradation(meta)).toEqual({ degraded: true, level: "degraded" });
  });

  it("prefers unavailable over degraded when both are present", () => {
    const meta = {
      surfaces: { a: { status: "degraded" }, b: { status: "unavailable" } },
    };
    expect(extractDegradation(meta).level).toBe("unavailable");
  });

  it("counts a bare degradation block as degraded even with no surface status", () => {
    const meta = { degradation: { reason: "no upstream yet" } };
    expect(extractDegradation(meta)).toEqual({
      degraded: true,
      level: "degraded",
      reason: "no upstream yet",
    });
  });
});
