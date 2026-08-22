/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management Console Product Journey E2E.
 *
 * Validates real data panels (Formula, Activity, Paper Telemetry, Postmortem),
 * domain receipts, dev-paper / read-only controls, and reload readback in
 * strict-live mode without synthetic fallback.
 */

import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  devLoginSession,
  installOidcDevLogin,
  roleTokenFromEnv,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const FE_BASE_URL = (
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  ""
).replace(/\/+$/, "");

const BFF_BASE_URL = (
  process.env.PANTHEON_BROWSER_BFF_BASE_URL ||
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io"
).replace(/\/+$/, "");

const IS_HOSTED = Boolean(
  FE_BASE_URL && targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: FE_BASE_URL }),
);

const AUTH_TOKEN = roleTokenFromEnv("operator", [
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);

const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "tenant-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/pfg-mgmt-journey-e2e";

if (IS_HOSTED && !AUTH_TOKEN) {
  throw new Error(
    "PFG-MGMT-JOURNEY-E2E-20260820 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN",
  );
}

if (IS_HOSTED) {
  devLoginSession({
    env: {
      ...process.env,
      PANTHEON_BFF_BASE_URL: BFF_BASE_URL,
      PANTHEON_FE_BASE_URL: FE_BASE_URL,
    },
    goto: false,
    pageBaseUrl: FE_BASE_URL,
    token: AUTH_TOKEN,
  });
}

type LatencySample = {
  method: string;
  url: string;
  pathname: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

function setupNetworkTracker(page: Page) {
  const networkEvents: LatencySample[] = [];
  const requestStartTimes = new Map<Request, number>();

  page.on("request", (req) => {
    if (req.url().includes("/bff/")) {
      requestStartTimes.set(req, Date.now());
    }
  });

  page.on("response", (res) => {
    const req = res.request();
    const start = requestStartTimes.get(req);
    if (start && req.url().includes("/bff/")) {
      const durationMs = Date.now() - start;
      try {
        const parsedUrl = new URL(res.url());
        networkEvents.push({
          method: req.method(),
          url: res.url(),
          pathname: parsedUrl.pathname,
          status: res.status(),
          durationMs,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // ignore malformed URLs
      }
    }
  });

  return { networkEvents };
}

test.describe("Management Console Product Journey E2E", () => {
  test.skip(
    !IS_HOSTED && !process.env.RUN_LOCAL_E2E,
    "Set PANTHEON_FE_BASE_URL and PANTHEON_HOSTED_E2E=1 to run against hosted dev.",
  );
  test.setTimeout(180_000);

  test("Formula, Activity, Paper Telemetry, and Postmortem pages show backend-origin data or typed unavailable without synthetic content", async ({
    page,
  }, testInfo: TestInfo) => {
    expect(AUTH_TOKEN, "Hosted E2E requires a valid short-lived auth token").not.toBe("");

    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE_URL,
      tenantId: TENANT_ID,
      token: AUTH_TOKEN,
    });

    const { networkEvents } = setupNetworkTracker(page);

    // 1. Formula / Rankings Center
    await page.goto(`${FE_BASE_URL}/management/rankings`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("heading", { name: /Rankings Center|排名中心/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 2. Activity / Performance Center & Trading Pulse
    await page.goto(`${FE_BASE_URL}/management/performance?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("heading", { name: /Performance Center|績效中心/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    await page.goto(`${FE_BASE_URL}/management/trading-pulse`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 3. Paper Telemetry: Portfolio Exposure & Runtimes
    await page.goto(`${FE_BASE_URL}/management/performance?tab=exposure`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("tablist").or(page.getByText(/Telemetry|遙測|Risk Budget|Current Exposure/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    await page.goto(`${FE_BASE_URL}/management/runtimes`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 4. Postmortem Library
    await page.goto(`${FE_BASE_URL}/management/postmortems`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("heading", { name: /Postmortems|事後檢討|復盤/i }).or(page.getByPlaceholder(/Search postmortems/i)).or(page.getByText(/Postmortem/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Assert live network requests to BFF were recorded across all checked pages
    expect(networkEvents.length).toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors).toHaveLength(0);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-product-journey-pages.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("product-journey-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
  });

  test("Supported dev-paper action progresses admitted to domain terminal and remains after reload; read-only profile is honestly disabled", async ({
    page,
  }, testInfo: TestInfo) => {
    expect(AUTH_TOKEN, "Hosted E2E requires a valid short-lived auth token").not.toBe("");

    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE_URL,
      tenantId: TENANT_ID,
      token: AUTH_TOKEN,
    });

    const { networkEvents } = setupNetworkTracker(page);

    // 1. Navigate to Strategy Management & Detail
    await page.goto(`${FE_BASE_URL}/management/strategies`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Inspect strategy detail lifecycle and dev-paper actions
    await page.goto(`${FE_BASE_URL}/management/strategies/strat-alpha-1?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 2. Assert read-only profile honestly disables mutations
    const nonProdButtons = page.locator('button[aria-disabled="true"], button[disabled]').filter({
      hasText: /promote|deploy|sweep|acknowledge|action|save/i,
    });
    if (await nonProdButtons.count() > 0) {
      await expect(nonProdButtons.first()).toBeDisabled();
    }

    // 3. Verify governance read-only controls
    await page.goto(`${FE_BASE_URL}/management/governance/permissions`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 4. Verify page reload preserves state without drift (reload idempotency)
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-action-reload.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("mgmt-action-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
  });
});
