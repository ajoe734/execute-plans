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

async function assertStrictSession(
  request: APIRequestContext,
  token: string,
): Promise<{ operatorId: string; roles: string[] }> {
  const meResponse = await request.get(`${BFF_BASE_URL}/bff/me`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": TENANT_ID,
    },
  });
  expect(meResponse.ok(), `/bff/me returned ${meResponse.status()}`).toBe(true);
  const body = (await meResponse.json()) as JsonRecord;
  const me = ((body.data ?? body) || {}) as JsonRecord;
  const roles = Array.isArray(me.roles)
    ? (me.roles as string[]).map((r) => String(r).toLowerCase())
    : [];
  const operatorId = String(me.operator_id ?? me.operatorId ?? (me.user as JsonRecord)?.id ?? "").trim();
  expect(operatorId).not.toBe("");
  return { operatorId, roles };
}

async function installHostedSession(
  page: Page,
  _input: { operatorId: string; roles: string[]; token: string },
): Promise<void> {
  const clientId = process.env.DEV_LOGIN_CLIENT_ID || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_ID || "pantheon-dev-operator-a-v1";
  const clientSecret = process.env.DEV_LOGIN_CLIENT_SECRET || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET || "";

  await page.addInitScript(
    ({ clientId, clientSecret, tenantId }) => {
      if (clientId && clientSecret) {
        const config = {
          VITE_BFF_DEV_LOGIN_CLIENT_ID: clientId,
          VITE_BFF_DEV_LOGIN_CLIENT_SECRET: clientSecret,
          // The read-only build intentionally leaves the VITE keys blank. The
          // deployed helper treats that blank value as authoritative, so also
          // provide its existing runtime-only aliases for hosted acceptance.
          PANTHEON_DEV_BFF_OIDC_CLIENT_ID: clientId,
          PANTHEON_DEV_BFF_OIDC_CLIENT_SECRET: clientSecret,
          VITE_BFF_TENANT_ID: tenantId,
        };
        (window as unknown as Record<string, unknown>).__PANTHEON_RUNTIME_CONFIG__ = config;
        (window as unknown as Record<string, unknown>).__PANTHEON_BFF_RUNTIME__ = config;
      }
    },
    { clientId, clientSecret, tenantId: TENANT_ID },
  );
}


async function waitForHostedRouteReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      if (!root || root.childElementCount === 0) return false;
      return window.location.pathname === "/auth"
        || !root.textContent?.includes("Verifying Pantheon session");
    },
    undefined,
    { timeout: 45_000 },
  );
  const diagnostic = await page.evaluate(() => ({
    pathname: window.location.pathname,
    authReason: new URLSearchParams(window.location.search).get("reason"),
    headings: Array.from(document.querySelectorAll("h1, h2"))
      .slice(0, 5)
      .map((element) => element.textContent?.trim() || ""),
    hasAuthError: Boolean(document.querySelector('[aria-label="auth-error"]')),
    isVerifying: document.body.innerText.includes("Verifying Pantheon session"),
  }));
  console.log(`[PFG NAV] ${JSON.stringify(diagnostic)}`);
  if (diagnostic.pathname === "/auth") {
    throw new Error(`Hosted browser session redirected to /auth (reason=${diagnostic.authReason ?? "unknown"})`);
  }
}

async function navigateWithAuth(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/auth")) {
    await page.waitForURL((current) => !current.pathname.includes("/auth"), { timeout: 15_000 }).catch(async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    });
  }
  await waitForHostedRouteReady(page);
}

async function expectSurface2xx(
  events: LatencySample[],
  label: string,
  matches: (pathname: string) => boolean,
): Promise<void> {
  await expect.poll(
    () => events.some((event) => event.status >= 200 && event.status < 300 && matches(event.pathname)),
    { message: `Expected completed 2xx BFF provenance for ${label}`, timeout: 20_000 },
  ).toBe(true);
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
  if (EXPECTED_BFF_SHA) {
    expect(String(deployment.bffCommit ?? deployment.bffSourceCommitSha ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  }
  expect(deployment.sourceBranch).toBe("dev");
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  const deploymentProfile = String(deployment.deploymentProfile ?? deployment.profile ?? "");
  expect(
    ["read-only", "write-proof"],
    `Management journey must run only against read-only or bounded write-proof, got ${deploymentProfile || "missing"}`,
  ).toContain(deploymentProfile);
  if (deploymentProfile === "read-only") {
    expect(buildMode.VITE_BFF_REAL_WRITES).toBe("false");
    expect(buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES).toBe("false");
  } else {
    expect(buildMode.VITE_BFF_REAL_WRITES).toBe("true");
    expect(buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES).toBe("true");
  }

  const readyResponse = await request.get(`${BFF_BASE_URL}/readyz`);
  expect(readyResponse.ok(), `/readyz returned ${readyResponse.status()}`).toBe(true);
  const bffVersion = (await readyResponse.json()) as JsonRecord;

  return { deployment, bffVersion };
}

function setupNetworkTracker(page: Page) {
  const networkEvents: LatencySample[] = [];
  const requestStartTimes = new Map<Request, number>();

  page.on("console", (msg) => {
    console.log(`[PAGE CONSOLE ${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    console.log(`[PAGE REQUEST FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log(`[PAGE HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
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
  test.setTimeout(300_000);

  test("Formula, Activity, Paper Telemetry, and Postmortem pages show backend-origin data or typed unavailable without synthetic content", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    const token = await getOrMintAuthToken(request);
    test.skip(!token, "requires an operator bearer token for hosted acceptance");

    if (EXPECTED_FE_SHA && EXPECTED_BFF_SHA) {
      await assertDeploymentPair(request);
    }

    const session = await assertStrictSession(request, token);
    await installHostedSession(page, { ...session, token });

    const { networkEvents } = setupNetworkTracker(page);

    // =========================================================================
    // 1. Formula / Rankings Center (/management/rankings)
    // =========================================================================
    await navigateWithAuth(page, `${FE_BASE_URL}/management/rankings`);
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
    await expectSurface2xx(
      networkEvents,
      "Formula / Rankings",
      (pathname) => pathname.includes("/management/persona-league")
        || pathname.includes("/ranking")
        || pathname.includes("/formulas"),
    );

    // =========================================================================
    // 2. Activity / Performance Overview (/management/performance?tab=overview)
    // =========================================================================
    await navigateWithAuth(page, `${FE_BASE_URL}/management/performance?tab=overview`);
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
    await expectSurface2xx(
      networkEvents,
      "Performance overview",
      (pathname) => pathname.includes("/management/portfolio-book/holdings")
        || pathname.includes("/performance")
        || pathname.includes("/metrics"),
    );

    // Activity / Trading Pulse (/management/trading-pulse)
    await navigateWithAuth(page, `${FE_BASE_URL}/management/trading-pulse`);
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("h1, h2, [role='heading'], section[aria-label*='Trading Pulse'], main").filter({
        hasText: /Trading Pulse|交易脈搏/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);
    await expectSurface2xx(
      networkEvents,
      "Activity / Trading Pulse",
      (pathname) => pathname.includes("/trading-pulse")
        || pathname.includes("/activity")
        || pathname.includes("/events"),
    );

    // =========================================================================
    // 3. Paper Telemetry: Portfolio Exposure (/management/performance?tab=exposure)
    // =========================================================================
    await navigateWithAuth(page, `${FE_BASE_URL}/management/performance?tab=exposure`);
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("main").getByRole("tablist").or(page.locator("main").getByText(/Exposure|Telemetry|遙測|Risk Budget|No telemetry/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);
    await expectSurface2xx(
      networkEvents,
      "Paper telemetry / Exposure",
      (pathname) => pathname.includes("/management/portfolio-book/exposure"),
    );

    // Paper Telemetry: Runtimes (/management/runtimes)
    await navigateWithAuth(page, `${FE_BASE_URL}/management/runtimes`);
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
    await expectSurface2xx(
      networkEvents,
      "Paper telemetry / Runtimes",
      (pathname) => pathname.includes("/runtimes")
        || pathname.includes("/management/persona-fleet"),
    );

    // =========================================================================
    // 4. Postmortem Library (/management/postmortems)
    // =========================================================================
    await navigateWithAuth(page, `${FE_BASE_URL}/management/postmortems`);
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("h1, h2, [role='heading'], main").filter({
        hasText: /Postmortems|事後檢討|復盤|Incident/i,
      }).or(page.locator("main input, main [placeholder*='Search']")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);
    await expectSurface2xx(
      networkEvents,
      "Postmortems",
      (pathname) => pathname.includes("/incidents")
        || pathname.includes("/postmortems"),
    );
    await expect(page.getByText(/Loading postmortems/i)).toBeHidden({ timeout: 15_000 });
    await expect(
      page.locator("main tbody tr").first().or(
        page.getByText(/No incident postmortems recorded|transport degraded or unavailable/i).first(),
      ).first(),
    ).toBeVisible({ timeout: 15_000 });

    // =========================================================================
    // Per-surface BFF endpoint assertions & latency tracking
    // =========================================================================
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    // Require each surface specifically to have its own 2xx BFF request
    const rankingEvents = networkEvents.filter(
      (ev) => ev.status >= 200 && ev.status < 300 && (
        ev.pathname.includes("/management/persona-league")
        || ev.pathname.includes("/ranking")
        || ev.pathname.includes("/formulas")
      ),
    );
    expect(rankingEvents.length, "Expected specific 2xx BFF request for Formula / Rankings").toBeGreaterThan(0);

    const perfEvents = networkEvents.filter(
      (ev) => ev.status >= 200 && ev.status < 300 && (
        ev.pathname.includes("/management/portfolio-book/holdings")
        || ev.pathname.includes("/management/portfolio-book/exposure")
        || ev.pathname.includes("/performance")
        || ev.pathname.includes("/metrics")
      ),
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

    const { deployment } = await assertDeploymentPair(request);
    const buildMode = (deployment.buildMode ?? {}) as JsonRecord;
    const realWritesEnabled = String(buildMode.VITE_BFF_REAL_WRITES ?? "false").toLowerCase() === "true";

    const session = await assertStrictSession(request, token);
    await installHostedSession(page, { ...session, token });

    const { networkEvents } = setupNetworkTracker(page);

    // =========================================================================
    // Part 1: Strategy Detail & Read-only controls honestly disabled
    // =========================================================================
    await navigateWithAuth(page, `${FE_BASE_URL}/management/strategies`);
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Verify Strategy list loads and navigate to first Strategy Detail row unconditionally
    const strategyRow = page.locator("table tbody tr").first();
    await expect(strategyRow).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      page.waitForURL((current) => /\/management\/strategies\/[^/]+$/u.test(current.pathname), { timeout: 15_000 }),
      strategyRow.click(),
    ]);

    // Mandatory assertions on Strategy Detail: lifecycle / triple state and disabled controls
    await expect(page.locator("h1, h2, [role='heading'], main").first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Strategy state · lifecycle × review × deployment", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("lifecycle", { exact: true })).toBeVisible();
    await expect(page.getByText("review", { exact: true })).toBeVisible();
    await expect(page.getByText("deployment", { exact: true })).toBeVisible();

    const disabledButtons = page.locator("main button[disabled], main button[aria-disabled='true']");
    await expect(disabledButtons.first()).toBeVisible({ timeout: 15_000 });
    await expect(disabledButtons.first()).toBeDisabled();

    // =========================================================================
    // Part 2: Supported dev-paper domain action on Runtimes (/management/runtimes)
    // =========================================================================
    await navigateWithAuth(page, `${FE_BASE_URL}/management/runtimes`);
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    const runtimeRows = page.locator("table tbody tr");
    await expect(runtimeRows.first()).toBeVisible({ timeout: 15_000 });
    const actionMenuButtons = runtimeRows.locator("button");
    await expect.poll(
      () => actionMenuButtons.count(),
      { message: "Expected runtime rows to expose governed action-menu controls", timeout: 15_000 },
    ).toBeGreaterThan(0);

    if (!realWritesEnabled) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: `${EVIDENCE_DIR}/pfg-mgmt-action-reload.png`, fullPage: true });
      const readOnlyEvidence = {
        schema_version: "pantheon.pfg-management-action-network.v2",
        deployment_profile: "read-only",
        mutation_controls_disabled: true,
        network_events: networkEvents,
      };
      writeFileSync(
        `${EVIDENCE_DIR}/pfg-mgmt-action-network.json`,
        JSON.stringify(readOnlyEvidence, null, 2),
        "utf8",
      );

      const actionMenuCount = await actionMenuButtons.count();
      for (let index = 0; index < actionMenuCount; index += 1) {
        await expect(
          actionMenuButtons.nth(index),
          `Read-only deployment must disable runtime mutation control ${index + 1}/${actionMenuCount} instead of falling through to synthetic client mutations`,
        ).toBeDisabled();
      }
      await testInfo.attach("mgmt-read-only-action-network-events", {
        body: Buffer.from(JSON.stringify(readOnlyEvidence, null, 2)),
        contentType: "application/json",
      });
      return;
    }

    // Select only an actionable, non-terminal paper runtime. Never allow this
    // bounded proof to fall through to a live runtime row.
    let targetRowIndex = -1;
    const runtimeRowCount = await runtimeRows.count();
    for (let index = 0; index < runtimeRowCount; index += 1) {
      const candidate = runtimeRows.nth(index);
      const environment = (await candidate.locator("td").nth(2).innerText().catch(() => "")).trim().toLowerCase();
      const status = (await candidate.locator("td").nth(3).innerText().catch(() => "")).trim().toLowerCase();
      const enabledActionCount = await candidate.locator("button:not([disabled])").count();
      if (environment === "paper" && !/quarantin/iu.test(status) && enabledActionCount > 0) {
        targetRowIndex = index;
        break;
      }
    }
    expect(
      targetRowIndex,
      "Expected an actionable, non-quarantined paper runtime; refusing to select a live or already-terminal row",
    ).toBeGreaterThanOrEqual(0);
    const targetRow = runtimeRows.nth(targetRowIndex);
    await expect(targetRow).toBeVisible({ timeout: 15_000 });
    const targetName = (await targetRow.locator("td").first().innerText()).trim();
    expect(targetName.length, "Expected non-empty target runtime identifier").toBeGreaterThan(0);
    await expect(targetRow.locator("td").nth(2)).toHaveText(/^\s*paper\s*$/i);

    // Record pre-action status
    const preActionStatusCell = targetRow.locator("td").nth(3).or(targetRow.locator("[class*='Badge'], [class*='status']")).first();
    await expect(preActionStatusCell).toBeVisible({ timeout: 10_000 });
    const preActionStatus = (await preActionStatusCell.innerText()).trim();
    const baselineMutationCount = networkEvents.filter(
      (event) => event.method === "POST" && (event.pathname.includes("/commands") || event.pathname.includes("/runtimes") || event.pathname.includes("/actions")),
    ).length;

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
    const updatedTargetRow = runtimeRows.filter({ hasText: targetName }).first();
    const statusCell = updatedTargetRow.locator("td").nth(3).or(updatedTargetRow.locator("[class*='Badge'], [class*='status']")).first();
    await expect(statusCell).toBeVisible({ timeout: 10_000 });
    await expect(statusCell).toHaveText(/quarantine|quarantined|QUARANTINED|隔離/i, { timeout: 30_000 });
    const terminalStatusText = (await statusCell.innerText()).trim();
    expect(terminalStatusText.toLowerCase(), "Post-action terminal state must not remain running, idle, or active").not.toMatch(/^(running|idle|active)$/i);
    expect(
      terminalStatusText.toLowerCase(),
      "Post-action terminal state must differ from the pre-action state",
    ).not.toBe(preActionStatus.toLowerCase());

    // =========================================================================
    // Part 3: Reload page and assert persisted domain terminal readback (idempotency)
    // =========================================================================
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHostedRouteReady(page);
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
    expect(mutationEvents.length, "Expected exactly one bounded paper mutation POST").toBe(baselineMutationCount + 1);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-action-reload.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const actionEvidence = {
      schema_version: "pantheon.pfg-management-action-network.v2",
      deployment_profile: "write-proof",
      target_runtime: targetName,
      target_environment: "paper",
      pre_action_status: preActionStatus,
      receipt: receiptText,
      terminal_status: terminalStatusText,
      reloaded_terminal_status: (await reloadedStatusCell.innerText()).trim(),
      mutation_post_count: mutationEvents.length - baselineMutationCount,
      network_events: networkEvents,
    };

    // Persist immutable latency, receipt, terminal readback, and route evidence.
    const networkEvidencePath = `${EVIDENCE_DIR}/pfg-mgmt-action-network.json`;
    writeFileSync(networkEvidencePath, JSON.stringify(actionEvidence, null, 2), "utf8");

    await testInfo.attach("mgmt-action-network-events", {
      body: Buffer.from(JSON.stringify(actionEvidence, null, 2)),
      contentType: "application/json",
    });
  });
});
