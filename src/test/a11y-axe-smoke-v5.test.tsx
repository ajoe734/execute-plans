// C3 (2026-05-09) — axe smoke for v5 presentational components.
// Full v5 pages depend on react-router + bff hooks + Radix layout APIs that
// jsdom can't satisfy reliably; this smoke covers pure presentational v5
// surfaces that don't require providers, guarding against trivial a11y
// regressions (missing labels, color-only status, untyped buttons).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";
import "@/i18n";
import { PersonaHealthMatrix } from "@/management/pages/v5/PersonaHealthMatrix";
import type { PersonaExecutionHealth } from "@/lib/v5";

const personas: PersonaExecutionHealth[] = [
  {
    personaId: "p_alpha", personaName: "Alpha", mode: "live",
    status: "healthy", score: 92, routedStrategies: 3, openFindings: 0,
    formulaVersion: "v3.1.0",
  },
  {
    personaId: "p_beta", personaName: "Beta", mode: "shadow",
    status: "degraded", score: 58, routedStrategies: 1, openFindings: 2,
    formulaVersion: "v3.0.4", suspendedReason: "elevated drawdown",
  },
];

const runAxe = async (container: HTMLElement) => {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  return results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
};

describe("C3 v5 axe smoke", () => {
  it("PersonaHealthMatrix passes critical/serious axe rules", async () => {
    const { container } = render(
      <main><h1>v5 ExecutionLoop</h1><PersonaHealthMatrix items={personas} /></main>,
    );
    const blocking = await runAxe(container);
    if (blocking.length) {
      console.log(JSON.stringify(blocking.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2));
    }
    expect(blocking).toHaveLength(0);
  });

  it("PersonaHealthMatrix empty state passes axe", async () => {
    const { container } = render(
      <main><h1>v5 ExecutionLoop</h1><PersonaHealthMatrix items={[]} /></main>,
    );
    const blocking = await runAxe(container);
    expect(blocking).toHaveLength(0);
  });
});
