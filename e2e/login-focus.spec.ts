import { expect, test } from "@playwright/test";
import {
  cssBoxShadowHasVisibleLayer,
  cssColorHasVisibleAlpha,
} from "../scripts/probe-hosted-browser-bff.mjs";

const FOCUSABLE_CONTROL_IDS = ["dev-account", "dev-password", ""];

test.describe("login focus visibility", () => {
  // `reducedMotion` is only a `TestOptions.contextOptions` field, not a
  // top-level `test.use()` key (unlike `colorScheme`, which is top-level);
  // passing it directly to `test.use()` is silently ignored. `page.emulateMedia`
  // sets both media features directly and matches the release-gate probe context.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  });

  test("keyboard Tab reveals a visible focus cue on every login control immediately, before any transition settles", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForSelector("#dev-account");

    const reachedIds = new Set<string>();
    const missingVisibleCueIds: string[] = [];

    for (let attempt = 0; attempt < 12 && reachedIds.size < FOCUSABLE_CONTROL_IDS.length; attempt += 1) {
      await page.keyboard.press("Tab");
      const rawSample = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof Element) || element === document.body) {
          return null;
        }
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const reached =
          element.matches(
            'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
          ) &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden";
        return {
          id: element.id,
          reached,
          focusVisible: element.matches(":focus-visible"),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
          boxShadow: style.boxShadow,
          // Non-opacity transitions animate the focus box-shadow in from its
          // unfocused (transparent) value under `prefers-reduced-motion:
          // reduce`, so a same-tick sample can observe a transparent cue even
          // though the ring is applied. Assert the underlying CSS contract
          // directly instead of racing the animation frame.
          transitionProperty: style.transitionProperty,
        };
      });
      if (!rawSample || !rawSample.reached || reachedIds.has(rawSample.id)) continue;
      reachedIds.add(rawSample.id);

      const outlineVisible =
        rawSample.outlineStyle !== "none" &&
        Number.parseFloat(rawSample.outlineWidth || "0") >= 1 &&
        cssColorHasVisibleAlpha(rawSample.outlineColor);
      const visibleCue =
        rawSample.focusVisible &&
        (outlineVisible || cssBoxShadowHasVisibleLayer(rawSample.boxShadow));
      if (!visibleCue) missingVisibleCueIds.push(rawSample.id || "(button)");
      const transitionedProperties = rawSample.transitionProperty
        .split(",")
        .map((value) => value.trim());
      expect(
        transitionedProperties.some(
          (value) => value === "box-shadow" || value === "outline" || value === "all",
        ),
        `${rawSample.id || "(button)"} must not transition box-shadow/outline under reduced motion (transition-property: ${rawSample.transitionProperty})`,
      ).toBe(false);
    }

    expect(reachedIds.size).toBeGreaterThanOrEqual(FOCUSABLE_CONTROL_IDS.length);
    expect(missingVisibleCueIds).toEqual([]);
  });

  test("a genuinely transparent focus cue still fails the same detector", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForSelector("#dev-account");
    await page.addStyleTag({
      content: "#dev-account:focus-visible { box-shadow: none !important; outline: none !important; }",
    });

    await page.keyboard.press("Tab");
    const rawSample = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof Element)) return null;
      const style = window.getComputedStyle(element);
      return {
        id: element.id,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });

    expect(rawSample?.id).toBe("dev-account");
    const outlineVisible =
      rawSample!.outlineStyle !== "none" &&
      Number.parseFloat(rawSample!.outlineWidth || "0") >= 1 &&
      cssColorHasVisibleAlpha(rawSample!.outlineColor);
    const visibleCue =
      rawSample!.focusVisible &&
      (outlineVisible || cssBoxShadowHasVisibleLayer(rawSample!.boxShadow));
    expect(visibleCue).toBe(false);
  });
});
