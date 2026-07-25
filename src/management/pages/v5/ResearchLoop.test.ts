import { describe, expect, it } from "vitest";
import type { LoopRun } from "@/lib/v5";
import { filterResearchLoopRunsForFocus } from "./ResearchLoopFocus";

const run = (overrides: Partial<LoopRun>): LoopRun => ({
  id: "run-1",
  loopKind: "research",
  status: "running",
  startedAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:05:00Z",
  triggeredBy: "persona-a",
  subjectKind: "research",
  subjectId: "project-a",
  subjectName: "Project A",
  stages: [],
  ...overrides,
});

describe("filterResearchLoopRunsForFocus", () => {
  it("keeps matching focused research runs scoped", () => {
    const rows = [
      run({ id: "run-tw", triggeredBy: "persona-tw", subjectId: "MGMT-QLIB-006" }),
      run({ id: "run-crypto", triggeredBy: "persona-crypto", subjectId: "research-crypto-paper-001" }),
    ];

    const focus = filterResearchLoopRunsForFocus(rows, {
      personaFocus: "persona-tw",
      projectFocus: "MGMT-QLIB-006",
    });

    expect(focus.matched).toBe(true);
    expect(focus.items.map((item) => item.id)).toEqual(["run-tw"]);
  });

  it("does not fall back to global research runs when focus misses", () => {
    const rows = [
      run({ id: "run-crypto", triggeredBy: "persona-crypto", subjectId: "research-crypto-paper-001" }),
    ];

    const focus = filterResearchLoopRunsForFocus(rows, {
      personaFocus: "persona-tw",
      projectFocus: "MGMT-QLIB-006",
    });

    expect(focus.matched).toBe(false);
    expect(focus.items).toEqual([]);
  });
});
