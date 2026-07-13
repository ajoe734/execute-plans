/**
 * AG-UIPOL-002 - hosted standalone Agora shell scroll/header proof.
 *
 * This spec runs only when the Pantheon dev frontend URL is supplied. It does
 * not intercept Agora responses: every tab renders against the deployed BFF.
 */

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { installOidcDevLogin } from "./helpers/auth";

const FE_BASE_URL = (
  process.env.AG_UIPOL_002_FE_BASE_URL ||
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  ""
).replace(/\/+$/, "");
const AUTH_TOKEN =
  process.env.BFF_AUTH_TOKEN ||
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  process.env.VITE_BFF_DEV_BEARER_TOKEN ||
  "pantheon-dev-browser:operator,reviewer,approver,risk_owner,admin:mfa";
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/ag-uipol-002";

const VIEWPORTS = [
  { name: "desktop-narrow", width: 1280, height: 900 },
  { name: "desktop-wide", width: 2560, height: 1440 },
] as const;

const TABS = [
  { name: "trading-room", path: "/agora/trading-room" },
  { name: "strategy-workshop", path: "/agora/strategy-workshop" },
  { name: "strategy-performance", path: "/agora/strategy-performance" },
] as const;

async function expectSinglePageScrollOwner(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="agora-standalone-shell"]');
    const main = document.querySelector<HTMLElement>('[data-testid="trading-desk-main"]');
    if (!shell || !main) throw new Error("Agora shell scroll surfaces were not rendered");

    return {
      bodyHeight: document.body.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      mainOverflowX: getComputedStyle(main).overflowX,
      mainOverflowY: getComputedStyle(main).overflowY,
      shellHeight: shell.getBoundingClientRect().height,
      shellOverflow: getComputedStyle(shell).overflow,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });

  expect(dimensions.bodyHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.shellHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  expect(dimensions.shellOverflow).toBe("hidden");
  expect(dimensions.mainOverflowX).toBe("hidden");
  expect(dimensions.mainOverflowY).toBe("auto");
}

test.describe("AG-UIPOL-002 hosted standalone Agora shell", () => {
  test.skip(!FE_BASE_URL, "Set AG_UIPOL_002_FE_BASE_URL or PANTHEON_FE_BASE_URL.");
  test.setTimeout(120_000);

  for (const viewport of VIEWPORTS) {
    for (const tab of TABS) {
      test(`${tab.name} has one page scroll owner at ${viewport.name}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await installOidcDevLogin(page, {
          goto: false,
          pageBaseUrl: FE_BASE_URL,
          tenantId: TENANT_ID,
          token: AUTH_TOKEN,
        });

        await page.goto(`${FE_BASE_URL}${tab.path}`);
        await expect(page.getByTestId("agora-standalone-shell")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("trading-desk-main")).toBeVisible();
        await expectSinglePageScrollOwner(page);

        if (tab.name === "strategy-workshop") {
          const runtimeHeader = page.getByTestId("strategy-workshop-runtime-header");
          await expect(runtimeHeader).toBeVisible({ timeout: 30_000 });
          await expect(runtimeHeader.locator("h1, h2, h3, h4, h5, h6")).toHaveCount(0);
        }

        mkdirSync(EVIDENCE_DIR, { recursive: true });
        const screenshotPath = `${EVIDENCE_DIR}/ag-uipol-002-${tab.name}-${viewport.name}.png`;
        await page.screenshot({ path: screenshotPath });
        await testInfo.attach(`ag-uipol-002-${tab.name}-${viewport.name}`, {
          path: screenshotPath,
          contentType: "image/png",
        });
      });
    }
  }
});
