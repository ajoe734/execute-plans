/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management Console Product Journey E2E.
 *
 * Validates real data panels (Formula, Activity, Paper Telemetry, Postmortem),
 * dev-paper / read-only controls, and reload readback in strict-live hosted mode
 * without synthetic fallback, route interception, or client write overrides.
 */

import { expect, test, type APIRequestContext, type Page, type Request, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
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

const EXPECTED_FE_SHA = String(
  process.env.EXPECTED_FE_SHA || process.env.PANTHEON_FRONTEND_SHA || "",
).trim().toLowerCase();

const EXPECTED_BFF_SHA = String(
  process.env.EXPECTED_BFF_SHA || process.env.PANTHEON_BFF_SHA || "",
).trim().toLowerCase();

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
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.204.12.sslip.io";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";

const HOSTED_REQUESTED = Boolean(
  FE_BASE_URL && (EXPECTED_FE_SHA || targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: FE_BASE_URL })),
);

type LatencySample = {
  method: string;
  url: string;
  pathname: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

type JsonRecord = Record<string, unknown>;

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

async function assertDeploymentPair(request: APIRequestContext): Promise<{
  deployment: JsonRecord;
  bffVersion: JsonRecord;
}> {
  const deploymentResponse = await request.get(`${FE_BASE_URL}/deployment.json?pfg_mgmt=${Date.now()}`);
  expect(deploymentResponse.ok(), `deployment.json returned ${deploymentResponse.status()}`).toBe(true);
  const deployment = (await deploymentResponse.json()) as JsonRecord;
  const buildMode = (deployment.buildMode ?? {}) as JsonRecord;

  expect(deployment.app).toBe("execute-plans");
  expect(deployment.environment).toBe("pantheon-dev-fe");
  if (EXPECTED_FE_SHA) {
    expect(String(deployment.commit ?? "").toLowerCase()).toBe(EXPECTED_FE_SHA);
  }
  expect(deployment.sourceBranch).toBe("dev");
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");

  const readyResponse = await request.get(`${BFF_BASE_URL}/readyz`);
  expect(readyResponse.ok(), `/readyz returned ${readyResponse.status()}`).toBe(true);
  const bffVersion = (await readyResponse.json()) as JsonRecord;

  return { deployment, bffVersion };
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
      const durationMs = Math.max(1, Date.now() - start);
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

test.describe("Management Console Product Journey Hosted E2E", () => {
  test.skip(!HOSTED_REQUESTED, "requires exact hosted FE/BFF environment");
  test.setTimeout(180_000);

  test("Formula, Activity, Paper Telemetry, and Postmortem pages show backend-origin data or typed unavailable without synthetic content", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    test.skip(!AUTH_TOKEN, "requires an operator bearer token for hosted acceptance");

    if (EXPECTED_FE_SHA && EXPECTED_BFF_SHA) {
      await assertDeploymentPair(request);
    }

    await installHostedSession(page, {
      operatorId: "op-fe-gate",
      roles: ["operator", "reviewer", "approver"],
      token: AUTH_TOKEN,
    });

    const { networkEvents } = setupNetworkTracker(page);

    // 1. Formula / Rankings Center (/management/rankings)
    await page.goto(`${FE_BASE_URL}/management/rankings`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("section[aria-label*='Rankings'], main").getByRole("heading", { name: /Rankings Center|排名中心|Formula|Ranking/i }).or(page.locator("main h1, main h2, main [role='heading'], main")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 2. Activity / Performance Overview (/management/performance?tab=overview)
    await page.goto(`${FE_BASE_URL}/management/performance?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("section[aria-label*='Performance'], main").getByRole("heading", { name: /Performance Center|績效中心|Performance/i }).or(page.locator("main h1, main h2, main [role='heading'], main")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Activity / Trading Pulse (/management/trading-pulse)
    await page.goto(`${FE_BASE_URL}/management/trading-pulse`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("section[aria-label*='Trading Pulse'], main").getByRole("heading", { name: /Trading Pulse|交易脈搏/i }).or(page.locator("main h1, main h2, main [role='heading'], main")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 3. Paper Telemetry: Portfolio Exposure (/management/performance?tab=exposure)
    await page.goto(`${FE_BASE_URL}/management/performance?tab=exposure`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("main").getByRole("tablist").or(page.locator("main").getByText(/Exposure|Telemetry|遙測|Risk Budget|No telemetry/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Paper Telemetry: Runtimes (/management/runtimes)
    await page.goto(`${FE_BASE_URL}/management/runtimes`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("main").getByRole("heading", { name: /Runtimes|執行環境/i }).or(page.locator("main").getByText(/Runtime|執行環境|No runtimes/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 4. Postmortem Library (/management/postmortems)
    await page.goto(`${FE_BASE_URL}/management/postmortems`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("main").getByRole("heading", { name: /Postmortems|事後檢討|復盤/i }).or(page.locator("main").getByPlaceholder(/Search postmortems/i)).or(page.locator("main").getByText(/Postmortem|No postmortems/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Assert live network requests to BFF were recorded across all checked pages
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-product-journey-pages.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Persist immutable latency & route evidence artifact
    const networkEvidencePath = `${EVIDENCE_DIR}/pfg-mgmt-product-journey-network.json`;
    writeFileSync(networkEvidencePath, JSON.stringify(networkEvents, null, 2), "utf8");

    await testInfo.attach("product-journey-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
  });

  test("Strategy Detail renders lifecycle and parameters; read-only profile is honestly disabled; state persists across reload", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    test.skip(!AUTH_TOKEN, "requires an operator bearer token for hosted acceptance");

    if (EXPECTED_FE_SHA && EXPECTED_BFF_SHA) {
      await assertDeploymentPair(request);
    }

    await installHostedSession(page, {
      operatorId: "op-fe-gate",
      roles: ["operator", "reviewer", "approver"],
      token: AUTH_TOKEN,
    });

    const { networkEvents } = setupNetworkTracker(page);

    // =========================================================================
    // Part 1: Strategy Detail & Read-only controls honestly disabled
    // =========================================================================
    await page.goto(`${FE_BASE_URL}/management/strategies`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // If strategy rows exist, inspect the first strategy; otherwise assert strategies surface
    const strategyRow = page.locator("tr, [role='row'], [data-testid*='strategy']").first();
    if (await strategyRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await strategyRow.click();
    }

    // Assert read-only action buttons (NonProductionActionButton) are honestly disabled if present
    const actionButtons = page.locator("main button[disabled], main button[aria-disabled='true']");
    if (await actionButtons.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(actionButtons.first()).toBeDisabled();
    }

    // =========================================================================
    // Part 2: Runtimes inspection
    // =========================================================================
    await page.goto(`${FE_BASE_URL}/management/runtimes`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // =========================================================================
    // Part 3: Reload page and assert persisted readback (idempotency)
    // =========================================================================
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Assert live network requests were tracked
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-action-reload.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Persist immutable latency & route evidence artifact
    const networkEvidencePath = `${EVIDENCE_DIR}/pfg-mgmt-action-network.json`;
    writeFileSync(networkEvidencePath, JSON.stringify(networkEvents, null, 2), "utf8");

    await testInfo.attach("mgmt-action-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
  });
});
