import { expect, test, type APIRequestContext, type Page, type Request, type Route, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  DEFAULT_FE_OPERATOR_ID,
  DEFAULT_FE_TENANT_ID,
  installOidcDevLogin,
  roleTokenFromEnv,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE_URL = (
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://localhost:5173"
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

const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "tenant-dev";

const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "docs/deployment/evidence/SRCM-P1-MGMT-UI-20260824";

const HOSTED_REQUESTED =
  process.env.PANTHEON_HOSTED_E2E === "1" ||
  Boolean(
    process.env.PANTHEON_FE_BASE_URL &&
      (EXPECTED_FE_SHA || targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: process.env.PANTHEON_FE_BASE_URL })),
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

const MOCK_V2_DATA_SOURCE = {
  schema_version: "management_data_source.v2",
  source_instance_id: "ds-twse-market-v1",
  connector_id: "ds-twse-market-v1",
  provider: "TWSE",
  source_class: "market_daily",
  definition: {
    definition_id: "twse-openapi-daily",
    adapter_token: "TwseAdapter.records_from_payload",
    adapter_version: "1.0.0",
    provider: "TWSE",
    definition_state: "supported",
    datasets: ["tw_price_daily", "tw_dividends"],
    markets: ["TW"],
    deployment_sha: "sha256:475a3d4fcf1ba8648c7417fa2d92afe3522416bf",
  },
  instance: {
    data_source_id: "ds-twse-market-v1",
    source_kind: "data_source",
    definition_id: "twse-openapi-daily",
    connector_id: "ds-twse-market-v1",
    provider: "TWSE",
    source_class: "market_daily",
    lifecycle_state: "enabled",
    revision: 2,
    markets: ["TW"],
    datasets: ["tw_price_daily"],
    license_scope: "official_reference",
    secret_scope: "runtime_read_only",
    allowed_use: ["research_data", "backtest_data", "monitoring"],
  },
  desired: {
    source_instance_id: "ds-twse-market-v1",
    revision: 2,
    desired_lifecycle: "enabled",
    definition_id: "twse-openapi-daily",
    connector_config: {
      public: { endpoint_url: "https://openapi.twse.com.tw" },
      secret_ref_id: "vault://secret/twse-api-key",
      secret_scope: "runtime_read_only",
    },
    schedule: {
      enabled: true,
      cadence: "0 19 * * 1-5",
      timezone: "Asia/Taipei",
      jitter_seconds: 120,
    },
  },
  observed: {
    source_instance_id: "ds-twse-market-v1",
    desired_revision: 2,
    observed_revision: 2,
    reconciliation_status: "converged",
    effective_lifecycle: "enabled",
    health_state: "healthy",
    credential_state: "configured",
    validation_state: "passed",
    canary_state: "passed",
    freshness: {
      watermark: "2026-08-24T13:30:00Z",
      age_seconds: 120,
      last_success_at: "2026-08-24T13:32:00Z",
    },
    last_run: {
      ingest_run_id: "run-twse-001",
      row_count: 1500,
      rejected_count: 0,
      evidence_bundle_id: "ev-twse-20260824",
    },
    dlq_unresolved_count: 0,
    quota: {
      daily_limit: 50000,
      remaining_calls: 48500,
      used_percent: 3,
    },
    usage: {
      calls_today: 1500,
      cost_usd: 4.5,
    },
    dependent_refs: ["persona-tw-arb"],
  },
  allowed_actions: {
    canValidate: true,
    canCanary: true,
    canEnable: false,
    canDisable: true,
    canDegrade: true,
    canResume: false,
    canChangeSchedule: true,
    canReplace: true,
    canRetire: false,
    blockedReasons: ["already_enabled", "retire_requires_disabled"],
  },
  allowedActions: {
    canValidate: true,
    canCanary: true,
    canEnable: false,
    canDisable: true,
    canDegrade: true,
    canResume: false,
    canChangeSchedule: true,
    canReplace: true,
    canRetire: false,
    blockedReasons: ["already_enabled", "retire_requires_disabled"],
  },
};

const MOCK_DIVERGED_DATA_SOURCE = {
  ...MOCK_V2_DATA_SOURCE,
  source_instance_id: "ds-tpex-quote-v1",
  connector_id: "ds-tpex-quote-v1",
  provider: "TPEx",
  desired: {
    ...MOCK_V2_DATA_SOURCE.desired,
    source_instance_id: "ds-tpex-quote-v1",
    desired_lifecycle: "enabled",
    revision: 3,
  },
  observed: {
    ...MOCK_V2_DATA_SOURCE.observed,
    source_instance_id: "ds-tpex-quote-v1",
    desired_revision: 3,
    observed_revision: 2,
    effective_lifecycle: "configured_disabled",
    reconciliation_status: "diverged",
    health_state: "degraded",
  },
};

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

async function assertDeploymentPair(request: APIRequestContext): Promise<{
  deployment: JsonRecord;
  bffVersion: JsonRecord;
}> {
  const deploymentResponse = await request.get(`${FE_BASE_URL}/deployment.json?srcm_mgmt=${Date.now()}`);
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

  const bffVersionResponse = await request.get(`${BFF_BASE_URL}/bff/version`);
  expect(bffVersionResponse.ok(), `/bff/version returned ${bffVersionResponse.status()}`).toBe(true);
  const bffVersion = (await bffVersionResponse.json()) as JsonRecord;
  expect(bffVersion.source_commit_known, "BFF /bff/version source_commit_known must be true").toBe(true);
  if (EXPECTED_BFF_SHA) {
    const liveBffSha = String(bffVersion.source_commit_sha ?? bffVersion.commit ?? "").toLowerCase();
    expect(liveBffSha).toBe(EXPECTED_BFF_SHA);
  }

  return { deployment, bffVersion };
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

  const readinessResponse = await request.get(`${BFF_BASE_URL}/bff/auth/readiness`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": TENANT_ID,
    },
  });
  expect(readinessResponse.ok(), `/bff/auth/readiness returned ${readinessResponse.status()}`).toBe(true);
  const readinessBody = (await readinessResponse.json()) as JsonRecord;
  const readinessData = ((readinessBody.data ?? readinessBody) || {}) as JsonRecord;
  expect(readinessData.ready).toBe(true);
  expect(readinessData.authReady).toBe(true);

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
  console.log(`[SRCM NAV] ${JSON.stringify(diagnostic)}`);
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

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "*";
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "accept,authorization,content-type,idempotency-key,if-match,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id,x-trace-id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "x-bff-api-version,x-correlation-id,x-request-id",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    headers: corsHeaders(route),
    status,
  });
}

async function setupStandardFixtures(page: Page) {
  await page.route(/^https?:\/\/[^/]+\/bff\/management\/(?:data-sources|persona-fleet).*/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: corsHeaders(route),
      });
      return;
    }
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname.startsWith("/bff/management/persona-fleet")) {
      return fulfillJson(route, {
        data: {
          items: [
            {
              personaId: "persona-tw-arb",
              persona_id: "persona-tw-arb",
              name: "TW Arbitrage",
              displayName: "TW Arbitrage",
              status: "active",
              dataSources: ["ds-twse-market-v1"],
            },
          ],
        },
        items: [
          {
            personaId: "persona-tw-arb",
            persona_id: "persona-tw-arb",
            name: "TW Arbitrage",
            displayName: "TW Arbitrage",
            status: "active",
            dataSources: ["ds-twse-market-v1"],
          },
        ],
        meta: { status: "ok", source: "service_client" },
        page_info: { total: 1, page_size: 100 },
      });
    }

    if (pathname.endsWith("/catalog")) {
      return fulfillJson(route, {
        data: {
          definitions: [MOCK_V2_DATA_SOURCE.definition],
          count: 1,
          status: "ok",
        },
        meta: { status: "ok", source: "service_client" },
      });
    }
    if (pathname.includes("/runs")) {
      return fulfillJson(route, {
        data: {
          observations: [
            {
              source_instance_id: "ds-twse-market-v1",
              observed_revision: 2,
              reconciliation_status: "converged",
              effective_lifecycle: "enabled",
              health_state: "healthy",
              observed_at: "2026-08-24T13:32:00Z",
              watermark: "2026-08-24T13:30:00Z",
              row_count: 1500,
              rejected_count: 0,
            },
          ],
          canaries: [
            {
              canary_id: "canary-twse-001",
              source_instance_id: "ds-twse-market-v1",
              status: "passed",
              row_count: 10,
              rejected_count: 0,
              started_at: "2026-08-24T13:31:00Z",
              completed_at: "2026-08-24T13:31:05Z",
            },
          ],
        },
        meta: { status: "ok", source: "service_client" },
      });
    }
    if (pathname.includes("/receipts")) {
      return fulfillJson(route, {
        data: {
          receipts: [
            {
              receipt_id: "rcp-twse-001",
              command_id: "cmd-001",
              source_instance_id: "ds-twse-market-v1",
              command_type: "enable",
              status: "succeeded",
              before_revision: 1,
              after_revision: 2,
              created_at: "2026-08-24T13:00:00Z",
            },
          ],
        },
        meta: { status: "ok", source: "service_client" },
      });
    }

    if (pathname.endsWith("/ds-twse-market-v1") || pathname.endsWith("/ds-tpex-quote-v1")) {
      const match = pathname.endsWith("/ds-tpex-quote-v1") ? MOCK_DIVERGED_DATA_SOURCE : MOCK_V2_DATA_SOURCE;
      return fulfillJson(route, {
        data: match,
        meta: { status: "ok", source: "service_client" },
      });
    }

    return fulfillJson(route, {
      data: {
        items: [MOCK_V2_DATA_SOURCE, MOCK_DIVERGED_DATA_SOURCE],
        count: 2,
      },
      meta: { status: "ok", source: "service_client" },
    });
  });
}

test.describe("Management Data Source Control Center (SD-SRCM-04)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const isHosted =
      HOSTED_REQUESTED &&
      targetsExternalE2eEnvironment({
        ...process.env,
        PANTHEON_FE_BASE_URL: process.env.PANTHEON_FE_BASE_URL || FE_BASE_URL,
      });

    const isHostedOnlyTest = testInfo.title.includes("unmocked hosted");
    if (!isHostedOnlyTest) {
      test.skip(
        isHosted,
        "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
      );
      await installOidcDevLogin(page, {
        env: {
          ...process.env,
          VITE_GCP_IDENTITY_API_KEY:
            process.env.VITE_GCP_IDENTITY_API_KEY ||
            "AIza01234567890123456789012345678901234",
        },
      });
      await installQuietEventSource(page);
    }
  });

  test("mocked / authenticated control center proof and 9 canonical columns", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Header & Real Writes Status
    await expect(page.getByRole("heading", { name: /Data Source Management|資料源管理/i })).toBeVisible();
    await expect(page.getByText(/Real writes disabled|實體寫入已停用/i)).toBeVisible();

    // Verify Add Data Source button is disabled when real writes are off
    const addBtn = page.getByRole("button", { name: /Add Data Source|新增資料來源/i });
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeDisabled();

    // Check 9 Canonical Columns
    await expect(page.getByText(/Source \/ Provider|來源 \/ 提供者/i)).toBeVisible();
    await expect(page.getByText(/Support \/ Deployment|支援 \/ 部署版本/i)).toBeVisible();
    await expect(page.getByText(/Desired Lifecycle|目標生命週期/i)).toBeVisible();
    await expect(page.getByText(/Observed Health|觀測健康與新鮮度/i)).toBeVisible();
    await expect(page.getByText(/Credential \/ License|憑證 \/ 授權範疇/i)).toBeVisible();
    await expect(page.getByText(/Schedule \/ Watermark|排程 \/ 水位線/i)).toBeVisible();
    await expect(page.getByText(/Latest Run \/ Search|最近執行 \/ 搜尋索引/i)).toBeVisible();
    await expect(page.getByText(/Consumers \/ Cost|取用 Persona \/ 成本/i)).toBeVisible();
    await expect(page.getByText(/Actions|操作/i).first()).toBeVisible();

    // Column 8 Consumer Links & Cost rendering
    const twseRow = page.locator("tr").filter({ hasText: "ds-twse-market-v1" });
    await expect(twseRow.getByText("persona-tw-arb")).toBeVisible();
    await expect(twseRow.getByText(/Cost|成本/i)).toBeVisible();
  });

  test("unmocked hosted read-only control center proof against live BFF", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    const isHosted =
      HOSTED_REQUESTED ||
      targetsExternalE2eEnvironment({
        ...process.env,
        PANTHEON_FE_BASE_URL: process.env.PANTHEON_FE_BASE_URL || FE_BASE_URL,
      });
    test.skip(!isHosted, "Set PANTHEON_HOSTED_E2E=1 or configure hosted dev URL to run unmocked hosted proof.");
    test.setTimeout(300_000);

    const token = await getOrMintAuthToken(request);
    test.skip(!token, "requires an operator bearer token for hosted acceptance");

    if (EXPECTED_FE_SHA && EXPECTED_BFF_SHA) {
      await assertDeploymentPair(request);
    }

    const session = await assertStrictSession(request, token);
    await installHostedSession(page, { ...session, token });

    const { networkEvents } = setupNetworkTracker(page);

    await navigateWithAuth(page, `${FE_BASE_URL}/management/data-sources`);
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.getByRole("heading", { name: /Data Source Management|資料源管理/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Real writes disabled|實體寫入已停用/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('section[aria-label="Data Source Management"], section[aria-label="資料源管理"]')).toBeVisible({ timeout: 15_000 });

    // Assert that the page reached an authoritative result: table, authoritative-empty, degraded-legacy, or unavailable alert
    const authoritativeState = page.locator(
      "table[aria-label], [data-testid='data-sources-authoritative-empty'], [data-testid='data-sources-unavailable'], [data-testid='degraded-legacy-banner']",
    ).first();
    await expect(authoritativeState).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Network & surface HTTP 200 assertions
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    const dataSourceEvents = networkEvents.filter(
      (ev) => ev.status === 200 && ev.pathname.includes("/management/data-sources"),
    );
    expect(dataSourceEvents.length, "Expected specific HTTP 200 BFF request for Data Sources").toBeGreaterThan(0);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/srcm-p1-mgmt-ui-pages.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const networkEvidencePath = `${EVIDENCE_DIR}/srcm-p1-mgmt-ui-network.json`;
    writeFileSync(networkEvidencePath, JSON.stringify(networkEvents, null, 2), "utf8");

    const evidencePayload = {
      schema_version: "pantheon.srcm-p1-mgmt-ui-evidence.v1",
      task_id: "SRCM-P1-MGMT-UI-20260824",
      timestamp: new Date().toISOString(),
      fe_base_url: FE_BASE_URL,
      bff_base_url: BFF_BASE_URL,
      expected_fe_sha: EXPECTED_FE_SHA,
      expected_bff_sha: EXPECTED_BFF_SHA,
      tenant_id: TENANT_ID,
      operator_id: session.operatorId,
      roles: session.roles,
      data_sources_response_count: dataSourceEvents.length,
      network_events_count: networkEvents.length,
      server_errors_count: serverErrors.length,
    };
    const summaryEvidencePath = `${EVIDENCE_DIR}/srcm-p1-mgmt-ui-evidence.json`;
    writeFileSync(summaryEvidencePath, JSON.stringify(evidencePayload, null, 2), "utf8");

    await testInfo.attach("data-source-control-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
    await testInfo.attach("data-source-control-evidence-summary", {
      body: Buffer.from(JSON.stringify(evidencePayload, null, 2)),
      contentType: "application/json",
    });
  });

  test("renders SD-SRCM-04 V2 structures, divergence badges, and detail drawer", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Check items rendered with row scoping to avoid non-unique TWSE matches
    const twseRow = page.locator("tr").filter({ hasText: "ds-twse-market-v1" });
    await expect(twseRow).toBeVisible();
    await expect(twseRow.getByText("TWSE", { exact: true })).toBeVisible();
    await expect(twseRow.getByText("ds-twse-market-v1")).toBeVisible();

    // Check Divergence badge on diverged row
    const divergedRow = page.locator("tr").filter({ hasText: "ds-tpex-quote-v1" });
    await expect(divergedRow.getByText(/diverged|分歧/i)).toBeVisible();

    // Open Detail Drawer for TWSE source
    const viewBtn = twseRow.getByRole("button", { name: /view|檢視/i });
    await viewBtn.click();

    // Detail Drawer Assertions (scoped to dialog)
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "ds-twse-market-v1" })).toBeVisible();

    // Switch to Config Tab to assert secret reference security
    const configTab = drawer.getByRole("tab", { name: /Config|連線與設定/i });
    await configTab.click();
    await expect(drawer.getByText("vault://secret/twse-api-key")).toBeVisible();
    await expect(
      drawer.getByText(/Secrets are stored securely|以 ID 參考|金鑰保存庫/i),
    ).toBeVisible();

    // Switch to Desired vs Observed Tab
    const desiredObservedTab = drawer.getByRole("tab", { name: /Desired vs Observed|目標與觀測/i });
    await desiredObservedTab.click();
    await expect(drawer.getByText(/Desired State|設定目標意圖/i)).toBeVisible();
    await expect(drawer.getByText(/Observed State|即時觀測事實/i)).toBeVisible();
    await expect(drawer.getByText("converged")).toBeVisible();

    // Check Action Buttons in Drawer are disabled when writes are off
    const validateBtn = drawer.getByRole("button", { name: /Validate|驗證設定/i }).first();
    await expect(validateBtn).toBeVisible();
    await expect(validateBtn).toBeDisabled();
  });

  test("tabs navigation: Catalog, Runs & Health, Change History", async ({ page }) => {
    await setupStandardFixtures(page);

    // 1. Catalog Tab
    await page.goto("/management/data-sources?tab=catalog");
    await expect(page.getByText(/Phase 1 (Offline Development Intake|離線開發需求)/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Download.*Need|下載需求/i })).toBeVisible();

    // 2. Runs & Health Tab
    await page.goto("/management/data-sources?tab=runs");
    await expect(page.getByText(/Bounded Read-Only Canary Pulls|受限唯讀金絲雀拉取/i)).toBeVisible();
    await expect(page.getByText(/Observation & Ingestion History|觀測與擷取歷史記錄/i)).toBeVisible();
    await expect(page.getByTestId("runs-quota-usage-card")).toBeVisible();
    await expect(page.getByText(/Unresolved DLQ Items|未解析死信佇列/i)).toBeVisible();

    // 3. Change History Tab
    await page.goto("/management/data-sources?tab=receipts");
    await expect(page.getByRole("heading", { name: /Command Receipts Ledger|指令收據稽核帳冊/i })).toBeVisible();
  });

  test("accessibility and keyboard focus navigation", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Ensure main section has aria-label
    const section = page.locator('section[aria-label="Data Source Management"], section[aria-label="資料源管理"]');
    await expect(section).toBeVisible();

    // Keyboard Tab navigation to interactive element
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    await expect(focused).toBeFocused();

    // Open Detail Drawer and verify dialog role and escape key closes it
    const viewBtn = page.getByRole("button", { name: /view|檢視/i }).first();
    await viewBtn.click();
    const drawerDialog = page.getByRole("dialog");
    await expect(drawerDialog).toBeVisible();
    await expect(drawerDialog.getByRole("heading", { name: "ds-twse-market-v1" })).toBeVisible();

    // Test tab key inside drawer navigates to close button or tab list
    await page.keyboard.press("Tab");
    const drawerFocused = page.locator(":focus");
    await expect(drawerFocused).toBeVisible();

    // Escape closes drawer
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Desired vs Observed|目標與觀測/i)).toBeHidden();
  });

  test("envelope meta states: authoritative-empty, unavailable, degraded-legacy", async ({ page }) => {
    // 1. Authoritative Empty
    await page.route("**/bff/management/data-sources**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders(route) });
        return;
      }
      if (route.request().url().endsWith("/data-sources")) {
        return fulfillJson(route, {
          data: { items: [], count: 0 },
          items: [],
          meta: { status: "ok", source: "service_client" },
          page_info: { total_count: 0 },
        });
      }
      return route.continue();
    });

    await page.goto("/management/data-sources");
    await expect(page.getByTestId("data-sources-authoritative-empty")).toBeVisible();
    await expect(page.getByText(/No Data Sources Configured|尚未設定資料源/i)).toBeVisible();

    // 2. Unavailable
    await page.route("**/bff/management/data-sources**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders(route) });
        return;
      }
      if (route.request().url().endsWith("/data-sources")) {
        return fulfillJson(
          route,
          {
            data: [],
            meta: { status: "unavailable", source: "frontend_empty_read" },
            page_info: { total_count: 0 },
          },
          503,
        );
      }
      return route.continue();
    });

    await page.goto("/management/data-sources");
    await expect(page.getByTestId("data-sources-unavailable")).toBeVisible();
    await expect(page.getByText(/Live data sources unavailable|目前沒有 live 資料源資料/i)).toBeVisible();

    // 3. Degraded-Legacy
    await page.route("**/bff/management/data-sources**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders(route) });
        return;
      }
      if (route.request().url().endsWith("/data-sources")) {
        return fulfillJson(route, {
          data: {
            items: [MOCK_V2_DATA_SOURCE],
            count: 1,
          },
          items: [MOCK_V2_DATA_SOURCE],
          meta: { status: "degraded", source: "legacy_projection" },
          page_info: { total_count: 1 },
        });
      }
      return route.continue();
    });

    await page.goto("/management/data-sources");
    await expect(page.getByTestId("degraded-legacy-banner")).toBeVisible();
    await expect(page.getByText(/Legacy Compatibility Projection Mode|舊版相容投影模式/i)).toBeVisible();
    await expect(page.getByText(/Data source rows are projected from legacy fleet state|部分資料源紀錄來自舊版 Fleet 狀態投影/i)).toBeVisible();
  });

  test("detail drawer schedule change gating when real writes are off", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Open Drawer
    const viewBtn = page.getByRole("button", { name: /view|檢視/i }).first();
    await viewBtn.click();

    // Go to Schedule tab
    const scheduleTab = page.getByRole("tab", { name: /Schedule|排程/i });
    await scheduleTab.click();

    // Verify Change Schedule button in schedule tabpanel is disabled with read-only tooltip
    const changeScheduleBtn = page.getByRole("tabpanel").getByRole("button", { name: /Change Schedule|修改排程/i });
    await expect(changeScheduleBtn).toBeVisible();
    await expect(changeScheduleBtn).toBeDisabled();
    await expect(changeScheduleBtn).toHaveAttribute(
      "title",
      /Real writes are disabled|實體寫入已停用/,
    );
  });

  test("responsive narrow viewport adaptation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Verify header and table scroll wrapper on narrow screen
    await expect(page.getByRole("heading", { name: /Data Source Management|資料源管理/i })).toBeVisible();
    await expect(page.locator(".overflow-x-auto, [data-testid='table-scroll']").first()).toBeVisible();

    // Verify tabs still switchable
    const catalogTab = page.getByRole("tab", { name: /Catalog|連接器目錄/i });
    await catalogTab.click();
    await expect(page.getByText(/Phase 1 (Offline Development Intake|離線開發需求)/i)).toBeVisible();
  });
});
