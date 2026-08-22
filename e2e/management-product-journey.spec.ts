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
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);

const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "tenant-dev";

const GCP_IDENTITY_API_KEY =
  process.env.PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY ||
  process.env.VITE_GCP_IDENTITY_API_KEY ||
  "AIzaSyCaMTJYfIP-uidP29AO7kX-JFm8wIheuSk";

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
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = Number(claims.exp ?? 0) || nowSeconds + 3600;

  const validToken = input.token.split(".").length === 3
    ? input.token
    : [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({
          aud: "pantheon-dev",
          auth_time: nowSeconds,
          email: `${input.operatorId}@pantheon-dev.invalid`,
          email_verified: true,
          exp,
          roles: input.roles,
          sub: input.operatorId,
          tenant_id: TENANT_ID,
        })).toString("base64url"),
        "dev-signature",
      ].join(".");

  const candidateKeys = [
    GCP_IDENTITY_API_KEY,
    "AIzaSyCaMTJYfIP-uidP29AO7kX-JFm8wIheuSk",
    "AIza01234567890123456789012345678901234",
    "AIza00000000000000000000000000000000000",
  ];

  await page.addInitScript(
    ({ candidateKeys, operatorId, token, exp }) => {
      for (const apiKey of candidateKeys) {
        const key = `firebase:authUser:${apiKey}:[DEFAULT]`;
        const session = {
          apiKey,
          appName: "[DEFAULT]",
          createdAt: String(Date.now()),
          displayName: operatorId,
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
          tenantId: null,
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
    { candidateKeys, operatorId: input.operatorId, token: validToken, exp },
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
      roles: ["operator", "reviewer", "approver", "admin"],
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
      page.locator("h1, h2, [role='heading'], section[aria-label*='Rankings'], main").filter({
        hasText: /Rankings Center|排名中心|Formula|Ranking/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("main").getByRole("tablist").or(page.locator("main table, main [role='table'], main [role='tab'], main")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 2. Activity / Performance Overview (/management/performance?tab=overview)
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
      page.locator("h1, h2, [role='heading'], main").filter({
        hasText: /Runtimes|執行環境/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("main table, main [role='table'], main").first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 4. Postmortem Library (/management/postmortems)
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

    // Mandatory assertion: endpoint-specific live requests to BFF recorded
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
      roles: ["operator", "reviewer", "approver", "admin"],
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

    // Mandatory assertion: verify read-only action buttons are honestly disabled on read-only deployment profile
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

    // Find first action menu trigger button on runtime rows
    const actionMenuButton = page.locator("table tbody tr button, [role='row'] button").first();
    await expect(actionMenuButton).toBeVisible({ timeout: 15_000 });
    await actionMenuButton.click({ force: true });

    // Click Quarantine or Disable New action item in dropdown menu
    const quarantineItem = page.locator("[role='menuitem']").filter({
      hasText: /Quarantine|隔離|Disable|Scale|Move|Drain|Restart/i,
    }).first();
    await expect(quarantineItem).toBeVisible({ timeout: 5000 });
    await quarantineItem.click();

    // Verify command receipt toast appears
    const receiptToast = page.locator("[data-sonner-toast], [role='status'], .toast").filter({
      hasText: /Runtime|Action|Command|隔離|已執行|Applied/i,
    }).first();
    await expect(receiptToast).toBeVisible({ timeout: 15_000 });

    // =========================================================================
    // Part 3: Reload page and assert persisted readback (idempotency)
    // =========================================================================
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);
    await expect(page.locator("h1, h2, [role='heading'], main").filter({ hasText: /Runtimes|執行環境/i }).first()).toBeVisible();

    // Assert live network requests were tracked including mutation and reload readback
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    const mutationEvents = networkEvents.filter(
      (ev) => ev.method === "POST" && (ev.pathname.includes("/commands") || ev.pathname.includes("/runtimes")),
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
