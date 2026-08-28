// Phase 19 — Smoke test for the scenario runner.
// Ensures every curated scenario passes end-to-end with mock seed data.
import { describe, it, expect } from "vitest";
import { runAllScenarios, scenarios } from "./scenarios";

describe("scenario runner smoke", () => {
  it("exposes the expected scenarios", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(5);
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.steps.length).toBeGreaterThan(0);
    }
  });

  it("runs every scenario green", async () => {
    const results = await runAllScenarios();
    for (const r of results) {
      const failed = r.steps.filter((s) => !s.ok);
      expect(failed, `${r.id} failed steps: ${failed.map((s) => s.label).join(", ")}`).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });
});
