// Pack C §C063 + spec-conflict-G QA — perf-budget baseline.
// jsdom can't measure real layout/paint timings, so this is a *registry*
// guard: the canonical PERF_BUDGET stays stable; CI consumers diff against it.
import { describe, it, expect } from "vitest";
import { PERF_BUDGET } from "@/lib/v4/perfBudget";

describe("perf budget baseline (D63)", () => {
  it("contains all 8 canonical targets including 5 mandated tiers", () => {
    const ids = PERF_BUDGET.map((p) => p.id);
    for (const required of ["lcp", "tti", "route_p95", "table_p95", "filter_p95", "sse_p95", "drawer_p95", "lineage_layout"]) {
      expect(ids).toContain(required);
    }
  });
  it("every target has a numeric upper bound", () => {
    for (const p of PERF_BUDGET) {
      expect(p.target).toMatch(/<=\s*\d/);
    }
  });
});
