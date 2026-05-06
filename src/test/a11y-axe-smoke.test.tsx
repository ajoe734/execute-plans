// Pack C §C056 — axe-core smoke. Renders a representative composition of
// design-system primitives in jsdom and asserts no critical/serious violations.
// Heavy widgets are excluded because Radix relies on layout/measurement APIs
// that jsdom cannot satisfy; this smoke pass guards against trivial regressions
// (missing labels, color-only status, untyped buttons, etc.).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

describe("Pack C §C056 axe smoke", () => {
  it("Button + labelled Input pass critical/serious axe rules", async () => {
    const { container } = render(
      <main>
        <h1>Smoke</h1>
        <form aria-labelledby="smoke-title">
          <span id="smoke-title">Smoke form</span>
          <Label htmlFor="smoke-input">Email</Label>
          <Input id="smoke-input" type="email" defaultValue="alice@example.com" />
          <Button type="submit" aria-label="submit smoke form">Submit</Button>
        </form>
      </main>,
    );
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      rules: {
        // jsdom can't compute layout-dependent contrast.
        "color-contrast": { enabled: false },
        region: { enabled: false },
      },
    });
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    if (blocking.length) {
      // Surface a readable failure if it ever regresses.
      console.log(JSON.stringify(blocking.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2));
    }
    expect(blocking).toHaveLength(0);
  });
});
