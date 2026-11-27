/**
 * AG-UIPOL-002 - hosted standalone Agora shell scroll/header proof.
 *
 * This spec runs only when the Pantheon dev frontend URL is supplied. It does
 * not intercept Agora responses: every tab renders against the deployed BFF.
 * A hosted URL therefore requires an explicit short-lived BFF auth token.
 */

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  installOidcDevLogin,
  roleTokenFromEnv,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const FE_BASE_URL = (
  process.env.AG_UIPOL_002_FE_BASE_URL ||
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  ""
).replace(/\/+$/, "");
const IS_HOSTED_FE = Boolean(
  FE_BASE_URL && targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: FE_BASE_URL }),
);
const AUTH_TOKEN = roleTokenFromEnv("operator", [
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/ag-uipol-002";

if (IS_HOSTED_FE && !AUTH_TOKEN) {
  throw new Error("AG-UIPOL-002 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN");
}

const VIEWPORTS = [
  { name: "desktop-narrow", width: 1280, height: 900 },
  { name: "desktop-wide", width: 2560, height: 1440 },
] as const;

const ORIGINAL_IA_VIEWPORTS = [
  { name: "1600px", width: 1600, height: 960 },
  { name: "720px", width: 720, height: 960 },
  { name: "390px", width: 390, height: 844 },
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
  test.skip(
    !IS_HOSTED_FE,
    "Set AG_UIPOL_002_FE_BASE_URL or PANTHEON_FE_BASE_URL to an absolute hosted frontend URL.",
  );
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

  for (const viewport of ORIGINAL_IA_VIEWPORTS) {
    test(`FE-AGORA-SHELL-ORIGINAL-IA-20261127 header, three zh-TW tabs, command bar, and round trip at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installOidcDevLogin(page, {
        goto: false,
        pageBaseUrl: FE_BASE_URL,
        tenantId: TENANT_ID,
        token: AUTH_TOKEN,
      });

      await page.goto(`${FE_BASE_URL}/agora/trading-room`);
      await expect(page.getByTestId("agora-standalone-shell")).toBeVisible({ timeout: 30_000 });
      await expectSinglePageScrollOwner(page);

      const tabBar = page.getByTestId("trading-desk-tab-bar");
      const tabButtons = tabBar.locator("button");
      await expect(tabButtons).toHaveCount(3);
      await expect(tabButtons.nth(0)).toHaveText("交易操盤室");
      await expect(tabButtons.nth(1)).toHaveText("策略工坊");
      await expect(tabButtons.nth(2)).toHaveText("策略執行與績效");
      await expect(page.getByTestId("trading-desk-bottom-strip")).toHaveCount(0);

      const commandBar = page.getByTestId("trading-desk-command-bar");
      await expect(page.getByTestId("trader-display-name")).toBeVisible();
      await expect(page.getByTestId("trader-style")).toBeVisible();
      await expect(page.getByTestId("trading-desk-market-state")).toContainText("市場狀態：");
      await expect(commandBar).not.toContainText("Agora Servant");
      await expect(page.getByTestId("trading-desk-sign-out")).toHaveText("登出");
      await expect(page.getByTestId("trading-desk-quick-tasks").locator("button")).toHaveCount(10);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      const shellShot = `${EVIDENCE_DIR}/fe-agora-shell-original-ia-20261127-shell-${viewport.name}.png`;
      await page.screenshot({ path: shellShot });
      await testInfo.attach(`fe-agora-shell-original-ia-20261127-shell-${viewport.name}`, {
        path: shellShot,
        contentType: "image/png",
      });

      if (viewport.width === 1600) {
        const input = page.getByTestId("trading-desk-command-input");
        await expect(input).toBeEnabled({ timeout: 30_000 });
        await input.fill("檢查目前策略視角與進場條件");
        await page.getByTestId("trading-desk-command-submit").click();
        await expect(page.getByTestId("trading-desk-servant-drawer")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("servant-command-reply")).toBeVisible({ timeout: 60_000 });

        const roundTripShot = `${EVIDENCE_DIR}/fe-agora-shell-original-ia-20261127-command-roundtrip-${viewport.name}.png`;
        await page.screenshot({ path: roundTripShot });
        await testInfo.attach(`fe-agora-shell-original-ia-20261127-command-roundtrip-${viewport.name}`, {
          path: roundTripShot,
          contentType: "image/png",
        });
      }
    });
  }
});
