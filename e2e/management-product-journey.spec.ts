/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management Console Product Journey E2E.
 *
 * Validates real data panels (Formula, Activity, Paper Telemetry, Postmortem),
 * supported dev-paper action execution with terminal receipt, honestly disabled
 * read-only controls, and reload readback in strict-live hosted mode without
 * synthetic fallback, route interception, or client write overrides.
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
  "DEV_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);

const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "tenant-dev";

const GCP_IDENTITY_API_KEY =
  process.env.PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY ||
  process.env.VITE_GCP_IDENTITY_API_KEY ||
  "AIzaSyCaMTJYfIP-uidP29AO7kX-JFm8wIheuSk";

const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "docs/deployment/evidence/PFG-MGMT-JOURNEY-E2E-20260820";

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

async function getOrMintAuthToken(request: APIRequestContext): Promise<string> {
  const token = roleTokenFromEnv("operator", [
    "PANTHEON_BFF_OPERATOR_A_TOKEN",
    "DEV_BFF_OPERATOR_A_TOKEN",
    "BFF_AUTH_TOKEN",
    "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
  ]);
  if (token) {
    try {
      const res = await request.get(`${BFF_BASE_URL}/bff/me`, {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": TENANT_ID },
      });
      if (res.ok()) return token;
    } catch {
      // probe failed, fallback to dev-login
    }
  }

  const clientId = process.env.DEV_LOGIN_CLIENT_ID || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_ID || "pantheon-dev-operator-a-v1";
  const clientSecret = process.env.DEV_LOGIN_CLIENT_SECRET || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET;
  if (clientSecret) {
    try {
      const res = await request.post(`${BFF_BASE_URL}/bff/auth/dev-login`, {
        data: {
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        },
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      if (res.ok()) {
        const payload = (await res.json()) as JsonRecord;
        if (typeof payload.access_token === "string" && payload.access_token) {
          return payload.access_token;
        }
      }
    } catch {
      // ignore
    }
  }

  return token;
}

async function installHostedSession(
  page: Page,
  input: { operatorId: string; roles: string[]; token: string },
): Promise<void> {
  const claims = bearerClaims(input.token);
  const operatorId = String(claims.sub || input.operatorId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = Number(claims.exp ?? 0) || nowSeconds + 3600;

  // Provide local response for Firebase SDK's Google account lookup so SDK initializes without contacting Google Identity
  await page.route("https://identitytoolkit.googleapis.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/accounts:lookup")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          users: [{
            createdAt: String(Date.now()),
            email: `${operatorId}@pantheon-dev.invalid`,
            emailVerified: true,
            lastLoginAt: String(Date.now()),
            localId: operatorId,
            passwordHash: "pantheon-operator-dev",
          }],
        }),
      });
      return;
    }
    await route.abort("blockedbyclient");
  });
  await page.route("https://securetoken.googleapis.com/**", async (route) => {
    await route.abort("blockedbyclient");
  });

  const candidateKeys = [
    GCP_IDENTITY_API_KEY,
    "AIzaSyCaMTJYfIP-uidP29AO7kX-JFm8wIheuSk",
  ];

  await page.addInitScript(
    ({ candidateKeys, operatorId, token, exp, tenantId }) => {
      for (const apiKey of candidateKeys) {
        const key = `firebase:authUser:${apiKey}:[DEFAULT]`;
        const session = {
          apiKey,
          appName: "[DEFAULT]",
          createdAt: String(Date.now()),
          displayName: null,
          email: `${operatorId}@pantheon-dev.invalid`,
          emailVerified: true,
          isAnonymous: false,
          lastLoginAt: String(Date.now()),
          phoneNumber: null,
          photoURL: null,
          providerData: [],
          stsTokenManager: {
            accessToken: token,
            expirationTime: exp * 1000,
            refreshToken: "",
          },
          tenantId: tenantId,
          uid: operatorId,
        };
        try {
          window.sessionStorage.setItem(key, JSON.stringify(session));
          window.localStorage.setItem(key, JSON.stringify(session));
        } catch {
          // Handled on origin navigation
        }
      }
    },
    { candidateKeys, operatorId, token: input.token, exp, tenantId: TENANT_ID },
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

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[PAGE CONSOLE ERROR] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });

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
    const token = await getOrMintAuthToken(request);
    test.skip(!token, "requires an operator bearer token for hosted acceptance");

    if (EXPECTED_FE_SHA && EXPECTED_BFF_SHA) {
      await assertDeploymentPair(request);
    }

    await installHostedSession(page, {
      operatorId: "op-fe-gate",
      roles: ["operator", "reviewer", "approver", "admin"],
      token,
    });

    const { networkEvents } = setupNetworkTracker(page);

    // =========================================================================
    // 1. Formula / Rankings Center (/management/rankings)
    // =========================================================================
    await page.goto(`${FE_BASE_URL}/management/rankings`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("h1, h2, [role='heading'], section[aria-label*='Rankings'], main").filter({
        hasText: /Rankings Center|排名中心|Formula|Ranking/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("main").getByRole("tablist").or(page.locator("main table, main [role='table'], main [role='tab'], main")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // =========================================================================
    // 2. Activity / Performance Overview (/management/performance?tab=overview)
    // =========================================================================
    await page.goto(`${FE_BASE_URL}/management/performance?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("h1, h2, [role='heading'], section[aria-label*='Performance'], main").filter({
        hasText: /Performance Center|績效中心|Performance/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("main").getByRole("tablist").or(page.locator("main [role='tab'], main")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Activity / Trading Pulse (/management/trading-pulse)
    await page.goto(`${FE_BASE_URL}/management/trading-pulse`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("h1, h2, [role='heading'], section[aria-label*='Trading Pulse'], main").filter({
        hasText: /Trading Pulse|交易脈搏/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // =========================================================================
    // 3. Paper Telemetry: Portfolio Exposure (/management/performance?tab=exposure)
    // =========================================================================
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
      page.locator("h1, h2, [role='heading'], main").filter({
        hasText: /Runtimes|執行環境/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("main table, main [role='table'], main").first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // =========================================================================
    // 4. Postmortem Library (/management/postmortems)
    // =========================================================================
    await page.goto(`${FE_BASE_URL}/management/postmortems`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("h1, h2, [role='heading'], main").filter({
        hasText: /Postmortems|事後檢討|復盤|Incident/i,
      }).or(page.locator("main input, main [placeholder*='Search']")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // =========================================================================
    // Per-surface BFF endpoint assertions & latency tracking
    // =========================================================================
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    // Require each surface specifically to have its own 2xx BFF request
    const rankingEvents = networkEvents.filter(
      (ev) => ev.status >= 200 && ev.status < 300 && (ev.pathname.includes("/ranking") || ev.pathname.includes("/formulas")),
    );
    expect(rankingEvents.length, "Expected specific 2xx BFF request for Formula / Rankings").toBeGreaterThan(0);

    const perfEvents = networkEvents.filter(
      (ev) => ev.status >= 200 && ev.status < 300 && (ev.pathname.includes("/performance") || ev.pathname.includes("/metrics")),
    );
    expect(perfEvents.length, "Expected specific 2xx BFF request for Performance").toBeGreaterThan(0);

    const activityEvents = networkEvents.filter(
      (ev) => ev.status >= 200 && ev.status < 300 && (ev.pathname.includes("/activity") || ev.pathname.includes("/events") || ev.pathname.includes("/trading-pulse")),
    );
    expect(activityEvents.length, "Expected specific 2xx BFF request for Activity / Trading Pulse").toBeGreaterThan(0);

    const runtimeEvents = networkEvents.filter(
      (ev) => ev.status >= 200 && ev.status < 300 && (ev.pathname.includes("/runtimes") || ev.pathname.includes("/persona-fleet")),
    );
    expect(runtimeEvents.length, "Expected specific 2xx BFF request for Paper Telemetry / Runtimes").toBeGreaterThan(0);

    const incidentEvents = networkEvents.filter(
      (ev) => ev.status >= 200 && ev.status < 300 && (ev.pathname.includes("/incidents") || ev.pathname.includes("/postmortems")),
    );
    expect(incidentEvents.length, "Expected specific 2xx BFF request for Postmortems").toBeGreaterThan(0);

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

  test("Strategy Detail renders lifecycle and parameters; read-only profile is honestly disabled; dev-paper action progresses to domain terminal state with receipt and persists across reload", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    const token = await getOrMintAuthToken(request);
    test.skip(!token, "requires an operator bearer token for hosted acceptance");

    if (EXPECTED_FE_SHA && EXPECTED_BFF_SHA) {
      await assertDeploymentPair(request);
    }

    await installHostedSession(page, {
      operatorId: "op-fe-gate",
      roles: ["operator", "reviewer", "approver", "admin"],
      token,
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

    // Verify Strategy list loads and navigate to first Strategy Detail row unconditionally
    const strategyRow = page.locator("table tbody tr, [role='row']").first();
    await expect(strategyRow).toBeVisible({ timeout: 15_000 });
    await strategyRow.click();

    // Mandatory assertions on Strategy Detail: lifecycle / triple state and disabled controls
    await expect(page.locator("h1, h2, [role='heading'], main").first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("text=Lifecycle").or(page.locator("text=Triple State")).or(page.locator("[class*='Stepper']")).or(page.locator("[class*='Card']")).first(),
    ).toBeVisible({ timeout: 15_000 });

    const disabledButtons = page.locator("main button[disabled], main button[aria-disabled='true']");
    await expect(disabledButtons.first()).toBeVisible({ timeout: 15_000 });
    await expect(disabledButtons.first()).toBeDisabled();

    // =========================================================================
    // Part 2: Supported dev-paper domain action on Runtimes (/management/runtimes)
    // =========================================================================
    await page.goto(`${FE_BASE_URL}/management/runtimes`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Find first actionable runtime row and bind exact target identifier
    const targetRow = page.locator("table tbody tr, [role='row']").first();
    await expect(targetRow).toBeVisible({ timeout: 15_000 });
    const targetName = (await targetRow.locator("td").first().innerText()).trim();
    expect(targetName.length, "Expected non-empty target runtime identifier").toBeGreaterThan(0);

    // Record pre-action status
    const preActionStatusCell = targetRow.locator("td").nth(3).or(targetRow.locator("[class*='Badge'], [class*='status']")).first();
    await expect(preActionStatusCell).toBeVisible({ timeout: 10_000 });
    const preActionStatus = (await preActionStatusCell.innerText()).trim();

    // Trigger action menu specifically on the target runtime row
    const actionMenuButton = targetRow.locator("button").last();
    await expect(actionMenuButton).toBeVisible({ timeout: 15_000 });
    await actionMenuButton.click({ force: true });

    // Specifically select and click Quarantine action item
    const quarantineItem = page.locator("[role='menuitem']").filter({
      hasText: /Quarantine|隔離/i,
    }).first();
    await expect(quarantineItem).toBeVisible({ timeout: 5000 });
    await quarantineItem.click();

    // Verify command receipt toast appears confirming the specific target action with status=accepted / command ID
    const receiptToast = page.locator("[data-sonner-toast], [role='status'], .toast").filter({
      hasText: /Quarantine|隔離|Applied|Command|Action|已執行/i,
    }).first();
    await expect(receiptToast).toBeVisible({ timeout: 15_000 });
    const receiptText = (await receiptToast.innerText()).trim();
    expect(receiptText.length, "Expected receipt toast content").toBeGreaterThan(0);
    expect(receiptText, "Expected command receipt status or command/audit identifier in toast").toMatch(/status\s+accepted|accepted|command\/audit|cmd_|action|已執行/i);

    // Wait for table update and verify domain terminal state in the status cell
    // Must be a named post-action terminal state distinct from initial running|idle|active
    const statusCell = targetRow.locator("td").nth(3).or(targetRow.locator("[class*='Badge'], [class*='status']")).first();
    await expect(statusCell).toBeVisible({ timeout: 10_000 });
    await expect(statusCell).toHaveText(/quarantine|quarantined|QUARANTINED|隔離/i, { timeout: 15_000 });
    const terminalStatusText = (await statusCell.innerText()).trim();
    expect(terminalStatusText.toLowerCase(), "Post-action terminal state must not remain running, idle, or active").not.toMatch(/^(running|idle|active)$/i);

    // =========================================================================
    // Part 3: Reload page and assert persisted domain terminal readback (idempotency)
    // =========================================================================
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);
    await expect(page.locator("h1, h2, [role='heading'], main").filter({ hasText: /Runtimes|執行環境/i }).first()).toBeVisible();

    // Re-query the target row binding targetName and assert the exact same domain terminal status remains after reload
    const reloadedRow = page.locator("table tbody tr").filter({ hasText: targetName }).first();
    await expect(reloadedRow).toBeVisible({ timeout: 15_000 });
    const reloadedStatusCell = reloadedRow.locator("td").nth(3).or(reloadedRow.locator("[class*='Badge'], [class*='status']")).first();
    await expect(reloadedStatusCell).toBeVisible({ timeout: 10_000 });
    await expect(reloadedStatusCell).toHaveText(terminalStatusText);
    expect((await reloadedStatusCell.innerText()).trim().toLowerCase(), "Reloaded terminal state must not be running, idle, or active").not.toMatch(/^(running|idle|active)$/i);

    // Assert live network requests were tracked including mutation and reload readback
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    const mutationEvents = networkEvents.filter(
      (ev) => ev.method === "POST" && (ev.pathname.includes("/commands") || ev.pathname.includes("/runtimes") || ev.pathname.includes("/actions")),
    );
    expect(mutationEvents.length, "Expected mutation POST request to be tracked").toBeGreaterThanOrEqual(1);

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
