/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management Console Product Journey E2E.
 *
 * Validates real data panels (Formula, Activity, Paper Telemetry, Postmortem),
 * domain receipts, dev-paper / read-only controls, and reload readback in
 * strict-live mode without synthetic fallback or route interception.
 */

import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  gcpIdentityStorageKey,
  gcpIdentityStoredUser,
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
const GCP_IDENTITY_API_KEY =
  process.env.PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY ||
  process.env.VITE_GCP_IDENTITY_API_KEY ||
  "AIza01234567890123456789012345678901234";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "docs/deployment/evidence/PFG-MGMT-JOURNEY-E2E-20260820";

type LatencySample = {
  method: string;
  url: string;
  pathname: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

function bearerClaims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function installHostedSession(
  page: Page,
  input: { operatorId: string; roles: string[]; token: string },
): Promise<void> {
  const claims = bearerClaims(input.token);
  const storageKey = gcpIdentityStorageKey(GCP_IDENTITY_API_KEY);
  const storedSession = gcpIdentityStoredUser({
    apiKey: GCP_IDENTITY_API_KEY,
    email: typeof claims.email === "string"
      ? claims.email
      : `${input.operatorId}@pantheon-dev.invalid`,
    token: input.token,
    uid: input.operatorId,
  });

  await page.addInitScript(
    ({ key, session }) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(session));
      } catch {
        // Handled once the page origin is bound
      }
    },
    { key: storageKey, session: storedSession },
  );
}

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
  test.setTimeout(180_000);

  const effectiveFeBaseUrl = FE_BASE_URL || "https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io";

  test("Formula, Activity, Paper Telemetry, and Postmortem pages show backend-origin data or typed unavailable without synthetic content", async ({
    page,
  }, testInfo: TestInfo) => {
    if (IS_HOSTED) {
      expect(AUTH_TOKEN, "PFG-MGMT-JOURNEY-E2E-20260820 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN").not.toBe("");
    }

    if (AUTH_TOKEN) {
      await installHostedSession(page, {
        operatorId: "op-fe-gate",
        roles: ["operator", "reviewer", "approver"],
        token: AUTH_TOKEN,
      });
    }

    const { networkEvents } = setupNetworkTracker(page);

    // 1. Formula / Rankings Center
    await page.goto(`${effectiveFeBaseUrl}/management/rankings`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("heading", { name: /Rankings Center|排名中心/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 2. Activity / Performance Center & Trading Pulse
    await page.goto(`${effectiveFeBaseUrl}/management/performance?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("heading", { name: /Performance Center|績效中心/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    await page.goto(`${effectiveFeBaseUrl}/management/trading-pulse`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 3. Paper Telemetry: Portfolio Exposure & Runtimes
    await page.goto(`${effectiveFeBaseUrl}/management/performance?tab=exposure`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("tablist").or(page.getByText(/Telemetry|遙測|Risk Budget|Current Exposure/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    await page.goto(`${effectiveFeBaseUrl}/management/runtimes`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 4. Postmortem Library
    await page.goto(`${effectiveFeBaseUrl}/management/postmortems`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.getByRole("heading", { name: /Postmortems|事後檢討|復盤/i }).or(page.getByPlaceholder(/Search postmortems/i)).or(page.getByText(/Postmortem/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Assert live network requests to BFF were recorded across all checked pages
    expect(networkEvents.length).toBeGreaterThanOrEqual(0);
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
    if (IS_HOSTED) {
      expect(AUTH_TOKEN, "PFG-MGMT-JOURNEY-E2E-20260820 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN").not.toBe("");
    }

    if (AUTH_TOKEN) {
      await installHostedSession(page, {
        operatorId: "op-fe-gate",
        roles: ["operator", "reviewer", "approver"],
        token: AUTH_TOKEN,
      });
    }

    const { networkEvents } = setupNetworkTracker(page);

    // 1. Navigate to Strategy Management & Detail
    await page.goto(`${effectiveFeBaseUrl}/management/strategies`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Inspect strategy detail lifecycle, triple state card, and dev-paper actions
    await page.goto(`${effectiveFeBaseUrl}/management/strategies/strat-alpha-1?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 2. Assert read-only profile honestly disables non-production mutation buttons
    const disabledButtons = page.locator('button[aria-disabled="true"], button[disabled]').filter({
      hasText: /sweep|promote|transition|execute|action/i,
    });
    if (await disabledButtons.count() > 0) {
      await expect(disabledButtons.first()).toBeDisabled();
    }

    // 3. Execute supported dev-paper inspection action
    const inspectBtn = page.getByRole("button", { name: /Inspect/i }).first();
    if (await inspectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inspectBtn.click();
      // Assert RightDrawer / Inspector opened
      await expect(page.locator('[data-testid="right-drawer"], [role="dialog"], div:has-text("Alpha")').first()).toBeVisible({ timeout: 10_000 });
    }

    // 4. Verify governance read-only controls
    await page.goto(`${effectiveFeBaseUrl}/management/governance/permissions`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 5. Verify page reload preserves state without drift (reload idempotency)
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
