/**
 * AG-UIPOL-011 - hosted narrow responsive parity gate.
 *
 * This spec uses the deployed frontend and live BFF without route interception.
 * It pins every capture to deployment.json before checking the four governed
 * viewports, the three Agora tabs, and the two task drawers available without
 * mutating a workspace.
 */

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { installOidcDevLogin } from "./helpers/auth";

const FE_BASE_URL = (
  process.env.AG_UIPOL_011_FE_BASE_URL ||
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  ""
).replace(/\/+$/, "");
const BFF_BASE_URL = (
  process.env.AG_UIPOL_011_BFF_BASE_URL ||
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  ""
).replace(/\/+$/, "");
const EXPECTED_FE_SHA = process.env.AG_UIPOL_011_EXPECTED_FE_SHA || "";
const AUTH_TOKEN =
  process.env.BFF_AUTH_TOKEN ||
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  process.env.VITE_BFF_DEV_BEARER_TOKEN ||
  "pantheon-dev-browser:operator,reviewer,approver,risk_owner,admin:mfa";
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/ag-uipol-011";

const VIEWPORTS = [
  { height: 844, name: "phone-390", width: 390 },
  { height: 1024, name: "tablet-768", width: 768 },
  { height: 900, name: "desktop-1280", width: 1280 },
  { height: 1440, name: "wide-2560", width: 2560 },
] as const;

type JsonRecord = Record<string, unknown>;

function recordFrom(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

async function waitForStableBoundingBox(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
  let lastBox = await locator.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(50);
    const box = await locator.boundingBox();
    if (box && lastBox && box.x === lastBox.x && box.y === lastBox.y && box.width === lastBox.width && box.height === lastBox.height) {
      return;
    }
    lastBox = box;
  }
}

async function deploymentGate(page: Page): Promise<JsonRecord> {
  const response = await page.request.get(`${FE_BASE_URL}/deployment.json?ag_uipol_011=${Date.now()}`);
  expect(response.ok(), "deployment.json must be readable").toBe(true);
  const deployment = recordFrom(await response.json());
  const buildMode = recordFrom(deployment.buildMode);

  expect(deployment.app).toBe("execute-plans");
  expect(deployment.environment).toBe("pantheon-dev-fe");
  expect(deployment.commit).toBe(EXPECTED_FE_SHA);
  expect(deployment.sourceBranch).toBe("dev");
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(buildMode.VITE_BFF_REAL_WRITES).toBe("false");
  expect(buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES).toBe("false");
  expect(buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN).toBe("false");

  if (BFF_BASE_URL) {
    const versionResponse = await page.request.get(`${BFF_BASE_URL}/bff/version`);
    expect(versionResponse.ok(), "live BFF version must be readable").toBe(true);
    const version = recordFrom(await versionResponse.json());
    const liveBffCommit = version.commit ?? version.source_commit_sha;
    expect(deployment.bffCommit, "manifest BFF identity must match the live BFF").toBe(liveBffCommit);
  }

  return deployment;
}

async function expectContainedShell(page: Page): Promise<JsonRecord> {
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="agora-standalone-shell"]');
    const main = document.querySelector<HTMLElement>('[data-testid="trading-desk-main"]');
    if (!shell || !main) throw new Error("Agora shell containment surfaces were not rendered");
    const shellRect = shell.getBoundingClientRect();
    return {
      bodyHeight: document.body.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainOverflowX: getComputedStyle(main).overflowX,
      mainOverflowY: getComputedStyle(main).overflowY,
      shellBottom: shellRect.bottom,
      shellHeight: shellRect.height,
      shellOverflow: getComputedStyle(shell).overflow,
      shellTop: shellRect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });

  expect(Number(dimensions.bodyHeight)).toBeLessThanOrEqual(Number(dimensions.viewportHeight) + 1);
  expect(Number(dimensions.bodyWidth)).toBeLessThanOrEqual(Number(dimensions.viewportWidth) + 1);
  expect(Number(dimensions.documentWidth)).toBeLessThanOrEqual(Number(dimensions.viewportWidth) + 1);
  expect(Number(dimensions.shellHeight)).toBeLessThanOrEqual(Number(dimensions.viewportHeight) + 1);
  expect(Number(dimensions.shellTop)).toBeGreaterThanOrEqual(-1);
  expect(Number(dimensions.shellBottom)).toBeLessThanOrEqual(Number(dimensions.viewportHeight) + 1);
  expect(dimensions.shellOverflow).toBe("hidden");
  expect(dimensions.mainOverflowX).toBe("hidden");
  expect(dimensions.mainOverflowY).toBe("auto");
  return dimensions;
}

async function expectBoxInsideViewport(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, "action must have a rendered bounding box").not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function capture(page: Page, name: string): Promise<string> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = `${EVIDENCE_DIR}/ag-uipol-011-${EXPECTED_FE_SHA.slice(0, 12)}-${name}.png`;
  await page.screenshot({ fullPage: true, path });
  return path;
}

async function openAndVerifyServant(page: Page, narrow: boolean): Promise<void> {
  const trigger = page.getByRole("button", { name: /servant drawer/i });
  await trigger.focus();
  await trigger.click();
  const drawer = page.getByTestId("trading-desk-servant-drawer");
  await expect(drawer).toBeVisible();

  if (narrow) {
    await expect(drawer).toHaveAttribute("role", "dialog");
    await waitForStableBoundingBox(page, drawer);
    const box = await drawer.boundingBox();
    expect(box?.width).toBeCloseTo(page.viewportSize()?.width ?? 0, 0);
    await expect(page.getByTestId("trading-desk-main").locator("..")).toHaveAttribute("inert", "");
    const close = drawer.getByRole("button", { name: /close|關閉/i }).first();
    await expect(close).toBeVisible();
    await expectBoxInsideViewport(page, close);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  } else {
    await trigger.click();
    await expect(drawer).toBeHidden();
  }
}

async function openAndVerifyCandidate(page: Page): Promise<void> {
  const navigationToggle = page.getByRole("button", { name: "Lenses" });
  if (await navigationToggle.isVisible()) await navigationToggle.click();
  await page.getByTestId("strategy-lens-all").click();

  const review = page.locator('[data-testid^="review-mobile-btn-"]').first();
  await expect(review).toBeVisible({ timeout: 60_000 });
  await review.focus();
  await review.click();

  const drawer = page.getByTestId("candidate-review-drawer");
  await expect(drawer).toBeVisible();
  await waitForStableBoundingBox(page, drawer);
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  const box = await drawer.locator(".agora-candidate-drawer-panel").boundingBox();
  expect(box?.width).toBeCloseTo(page.viewportSize()?.width ?? 0, 0);
  await expect(page.getByTestId("trading-desk-main")).toHaveAttribute("inert", "");
  const close = page.getByTestId("drawer-close-btn");
  await expectBoxInsideViewport(page, close);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(review).toBeFocused();
}

test.describe("AG-UIPOL-011 hosted responsive parity", () => {
  test.skip(
    !FE_BASE_URL || !EXPECTED_FE_SHA,
    "Set AG_UIPOL_011_FE_BASE_URL/PANTHEON_FE_BASE_URL and AG_UIPOL_011_EXPECTED_FE_SHA.",
  );
  test.setTimeout(180_000);

  for (const viewport of VIEWPORTS) {
    test(`contains all Agora tasks at ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await installOidcDevLogin(page, {
        goto: false,
        pageBaseUrl: FE_BASE_URL,
        tenantId: TENANT_ID,
        token: AUTH_TOKEN,
      });
      const deployment = await deploymentGate(page);
      const narrow = viewport.width < 900;
      const captures: string[] = [];
      const budgets: Record<string, JsonRecord> = {};

      await test.step("Trading Room prioritizes the current task and contains drawers", async () => {
        await page.goto(`${FE_BASE_URL}/agora/trading-room`);
        await expect(page.getByTestId("trading-room-page")).toBeVisible({ timeout: 60_000 });
        if (narrow) {
          await expect(page.getByTestId("trading-room-mobile-priority")).toBeVisible();
          await expect(page.getByTestId("trading-room-navigation")).toHaveAttribute("data-mobile-collapsed", "true");
        }
        budgets.tradingRoom = await expectContainedShell(page);
        await openAndVerifyServant(page, narrow);
        if (narrow) await openAndVerifyCandidate(page);
        captures.push(await capture(page, `${viewport.name}-trading-room`));
      });

      await test.step("Strategy Workshop exposes conversation, next question, and readiness without a three-column squeeze", async () => {
        await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`);
        await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("workshop-conversation-pane")).toBeVisible();
        await expect(page.getByTestId("servant-composer")).toBeVisible();
        if (narrow) {
          await expect(page.getByTestId("workshop-mobile-priority")).toBeVisible();
          await page.getByRole("button", { name: "Next question & readiness" }).click();
          await expect(page.getByTestId("completeness-rail")).toBeVisible();
          await page.getByRole("button", { name: "Conversation" }).click();
          await expect(page.getByTestId("workshop-conversation-pane")).toBeVisible();
        } else {
          await expect(page.getByTestId("completeness-rail")).toBeVisible();
        }
        budgets.workshop = await expectContainedShell(page);
        captures.push(await capture(page, `${viewport.name}-strategy-workshop`));
      });

      await test.step("Performance foregrounds the decision and keeps outcome/list reachable", async () => {
        await page.goto(`${FE_BASE_URL}/agora/strategy-performance`);
        await expect(page.getByTestId("strategy-performance-page")).toBeVisible({ timeout: 60_000 });
        if (narrow) {
          await expect(page.getByTestId("performance-mobile-priority")).toBeVisible();
          await expect(page.getByTestId("performance-decision-pane")).toBeVisible();
          await page.getByRole("button", { name: "Selected outcome" }).click();
          await expect(page.getByTestId("performance-outcome-pane")).toBeVisible();
          await page.getByRole("button", { name: "Strategies" }).click();
          await expect(page.getByTestId("performance-strategy-pane")).toBeVisible();
          await page.getByRole("button", { name: "Decisions" }).click();
        }
        budgets.performance = await expectContainedShell(page);
        captures.push(await capture(page, `${viewport.name}-strategy-performance`));
      });

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      const readbackPath = `${EVIDENCE_DIR}/ag-uipol-011-${EXPECTED_FE_SHA.slice(0, 12)}-${viewport.name}.json`;
      writeFileSync(
        readbackPath,
        JSON.stringify({ budgets, captures, deployment, expectedFeSha: EXPECTED_FE_SHA, viewport }, null, 2),
      );
      await testInfo.attach(`ag-uipol-011-${viewport.name}-readback`, {
        contentType: "application/json",
        path: readbackPath,
      });
      for (const path of captures) {
        await testInfo.attach(path.split("/").pop() ?? "responsive-capture", { contentType: "image/png", path });
      }
    });
  }
});
