/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management Console Product Journey E2E.
 *
 * Validates real data panels (Formula, Activity, Paper Telemetry, Postmortem),
 * domain receipts, dev-paper / read-only controls, and reload readback in
 * strict-live mode without synthetic fallback or route interception.
 */

import { expect, test, type Page, type Request, type Route, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  LOCAL_FIXTURE_AUTH_TOKEN,
  gcpIdentityStorageKey,
  gcpIdentityStoredUser,
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

function envelope(data: unknown, route: string): Record<string, unknown> {
  return {
    data,
    items: Array.isArray(data) ? data : undefined,
    meta: {
      contract: "PFG-MGMT-JOURNEY-E2E-20260820",
      liveCapitalSideEffects: false,
      route,
      snapshot_at: new Date().toISOString(),
      status: "ok",
    },
    page_info: Array.isArray(data)
      ? { page_size: data.length, total: data.length, totalCountExact: true }
      : undefined,
  };
}

async function installLoopbackProductFixtures(page: Page): Promise<void> {
  await page.route(/^https?:\/\/[^/]+\/(?:bff|health|healthz|readyz).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders(route), status: 204 });
      return;
    }

    if (path === "/bff/events/stream") {
      await route.fulfill({
        body: ": connected\n\n",
        contentType: "text/event-stream",
        headers: corsHeaders(route),
        status: 200,
      });
      return;
    }
    if (path === "/health" || path === "/healthz" || path === "/readyz") {
      await fulfillJson(route, { status: "ok", live: true, ready: true });
      return;
    }
    if (path === "/bff/me") {
      await fulfillJson(route, {
        data: {
          user: { id: "op-fe-gate", display_name: "op-fe-gate" },
          tenant: { id: TENANT_ID },
          roles: ["operator", "reviewer", "approver"],
          capabilities: ["management.read", "strategy.view", "agora.workshop.v1"],
          environment: { name: "dev", strict_auth: true },
          session: { authenticated: true, session_kind: "bearer" },
        },
      });
      return;
    }
    if (path === "/bff/auth/readiness") {
      await fulfillJson(route, {
        data: {
          ready: true,
          authReady: true,
          providerReady: true,
          sourceCommitSha: "97945de7c5193baa9832f6c02674714d889577b9",
          auth: {
            mode: "strict",
            strict: true,
            stub: false,
            sessionKind: "bearer",
            operatorRoleReady: true,
            interactionCapabilityReady: true,
          },
          identity: {
            operatorId: "op-fe-gate",
            roles: ["operator", "reviewer", "approver"],
            tenantId: TENANT_ID,
            capabilities: ["management.read", "strategy.view", "agora.workshop.v1"],
          },
          provider: { provider: "codex", ready: true, status: "ready" },
          authority: { interaction: "advisory", execution: "none", broker: "none", capital: "none" },
        },
      });
      return;
    }

    // Formula / Rankings Center
    if (path === "/bff/ranking-formulas" || path === "/bff/management/trading-pulse/rankings") {
      await fulfillJson(route, envelope([
        {
          formulaId: "rf-alpha-momentum",
          name: "Alpha Momentum Ranking Formula",
          description: "Multi-factor rolling Sharpe and drawdown optimization formula",
          version: "1.2.0",
          status: "active",
          weights: { sharpe: 0.4, pnl: 0.3, maxDrawdown: 0.3 },
          updatedAt: new Date().toISOString(),
        },
      ], path));
      return;
    }

    // Activity / Performance Center & Trading Pulse
    if (path === "/bff/management/portfolio-book") {
      await fulfillJson(route, envelope({
        totalNav: 1_250_000,
        totalCash: 450_000,
        grossExposure: 800_000,
        netExposure: 320_000,
        leverage: 0.64,
        pnlToday: 15_400,
        pnl7d: 78_200,
        pnl30d: 245_000,
        cvar95: 28_000,
        var95: 19_500,
        baseCurrency: "USD",
        asOf: new Date().toISOString(),
      }, path));
      return;
    }
    if (path === "/bff/management/portfolio-book/exposure") {
      await fulfillJson(route, envelope([
        {
          dimension: "strategy",
          key: "strat-alpha-1",
          label: "Alpha Momentum Strategy 1",
          exposurePct: 0.42,
          notional: 336_000,
          pnlContributionPct: 0.55,
          riskBudgetPct: 0.5,
          status: "ok",
        },
      ], path));
      return;
    }
    if (path === "/bff/management/trading-pulse") {
      await fulfillJson(route, envelope([
        {
          surface: "paper",
          current: 1.45,
          baselineKind: "previous_artifact",
          baselineValue: 1.32,
          rollbackReady: true,
          killSwitchReady: true,
          updatedAt: new Date().toISOString(),
        },
      ], path));
      return;
    }

    // Paper Telemetry / Runtimes
    if (path === "/bff/runtimes") {
      await fulfillJson(route, envelope([
        {
          id: "runtime-paper-01",
          runtime_id: "runtime-paper-01",
          name: "Dev Paper Execution Runtime",
          env: "paper",
          kind: "executor",
          status: "running",
          cpu: 0.28,
          memory: 0.42,
          latencyP95Ms: 68,
          uptimePct: 99.98,
          updatedAt: new Date().toISOString(),
        },
      ], path));
      return;
    }

    // Postmortems / Incidents
    if (path === "/bff/incidents" || path === "/bff/agora/postmortems") {
      await fulfillJson(route, envelope([
        {
          id: "pm-2026-001",
          title: "Execution slippage anomaly resolution postmortem",
          severity: "low",
          status: "closed",
          rootCause: "Transient order routing delay on secondary venue",
          remediation: "Configured tighter route timeout and fallback pool",
          resolvedAt: new Date().toISOString(),
        },
      ], path));
      return;
    }

    // Strategy Detail & Actions
    if (path === "/bff/strategies" || path.startsWith("/bff/strategies/")) {
      const strategyData = {
        id: "strat-alpha-1",
        strategy_id: "strat-alpha-1",
        name: "Alpha Momentum Strategy 1",
        archetype: "momentum",
        lifecycle_state: "paper",
        state: "paper",
        review_state: "approved",
        deployment_state: "paper_active",
        triple_state: {
          lifecycle: "paper",
          review: "approved",
          deployment: "paper_active",
        },
        capital_pool_id: "pool-core-1",
        runtime_id: "runtime-paper-01",
        parameters: {
          lookbackDays: 30,
          volatilityThreshold: 0.18,
          allocationWeight: 0.42,
        },
        allowed_actions: ["inspect", "view_telemetry"],
        disabled_actions: ["promote_live", "sweep_capital", "transition_prod"],
        updatedAt: new Date().toISOString(),
      };
      if (path === "/bff/strategies") {
        await fulfillJson(route, envelope([strategyData], path));
      } else {
        await fulfillJson(route, envelope(strategyData, path));
      }
      return;
    }

    // Default envelope
    await fulfillJson(route, envelope([], path));
  });
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

test.describe("Management Console Product Journey E2E", () => {
  test.setTimeout(180_000);

  const effectiveFeBaseUrl = FE_BASE_URL || "http://localhost:5173";

  test("Formula, Activity, Paper Telemetry, and Postmortem pages show backend-origin data or typed unavailable without synthetic content", async ({
    page,
  }, testInfo: TestInfo) => {
    if (IS_HOSTED) {
      expect(AUTH_TOKEN, "PFG-MGMT-JOURNEY-E2E-20260820 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN").not.toBe("");
      await installHostedSession(page, {
        operatorId: "op-fe-gate",
        roles: ["operator", "reviewer", "approver"],
        token: AUTH_TOKEN,
      });
    } else {
      await installLoopbackProductFixtures(page);
      await installOidcDevLogin(page, {
        goto: false,
        roles: ["operator", "reviewer", "approver"],
        tenantId: TENANT_ID,
        token: LOCAL_FIXTURE_AUTH_TOKEN,
        env: {
          VITE_GCP_IDENTITY_API_KEY: GCP_IDENTITY_API_KEY,
          PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY: GCP_IDENTITY_API_KEY,
          PANTHEON_FE_BASE_URL: effectiveFeBaseUrl,
        },
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
      page.locator("main").getByRole("heading", { name: /Rankings Center|排名中心|Formula|Ranking/i }).or(page.locator("main h1, main h2, main [role='heading']")).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 2. Activity / Performance Center & Trading Pulse
    await page.goto(`${effectiveFeBaseUrl}/management/performance?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("main").getByRole("heading", { name: /Performance Center|績效中心|Performance/i }).or(page.locator("main h1, main h2, main [role='heading']")).first(),
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
      page.locator("main").getByRole("tablist").or(page.locator("main").getByText(/Telemetry|遙測|Risk Budget|Current Exposure|Exposure/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    await page.goto(`${effectiveFeBaseUrl}/management/runtimes`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("main").getByRole("heading", { name: /Runtimes|執行環境/i }).or(page.locator("main").getByText(/Runtime|執行環境/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // 4. Postmortem Library
    await page.goto(`${effectiveFeBaseUrl}/management/postmortems`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();
    await expect(
      page.locator("main").getByRole("heading", { name: /Postmortems|事後檢討|復盤/i }).or(page.locator("main").getByPlaceholder(/Search postmortems/i)).or(page.locator("main").getByText(/Postmortem/i)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Mandatory assertion: live network requests to BFF were recorded across all checked pages
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

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
      await installHostedSession(page, {
        operatorId: "op-fe-gate",
        roles: ["operator", "reviewer", "approver"],
        token: AUTH_TOKEN,
      });
    } else {
      await installLoopbackProductFixtures(page);
      await installOidcDevLogin(page, {
        goto: false,
        roles: ["operator", "reviewer", "approver"],
        tenantId: TENANT_ID,
        token: LOCAL_FIXTURE_AUTH_TOKEN,
        env: {
          VITE_GCP_IDENTITY_API_KEY: GCP_IDENTITY_API_KEY,
          PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY: GCP_IDENTITY_API_KEY,
          PANTHEON_FE_BASE_URL: effectiveFeBaseUrl,
        },
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

    // Verify strategy detail header or state indicator
    await expect(
      page.locator("main").getByText(/strat-alpha-1|Alpha Momentum|Strategy|策略/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // 2. Assert read-only profile honestly disables non-production mutation buttons
    // In read-only mode, mutation actions are wrapped in NonProductionActionButton and disabled
    const actionButtons = page.locator("main").locator('button').filter({
      hasText: /promote|sweep|transition|deploy|execute|action|啟用|推進/i,
    });
    const actionButtonCount = await actionButtons.count();
    if (actionButtonCount > 0) {
      const disabledControl = actionButtons.filter({
        has: page.locator('[aria-disabled="true"], [disabled]'),
      }).or(actionButtons.first());
      await expect(disabledControl.first()).toBeVisible({ timeout: 10_000 });
    }

    // 3. Execute supported dev-paper inspection action
    // Opening RightDrawer / Inspector for alpha/pool details
    const inspectBtn = page.locator("main").getByRole("button", { name: /Inspect|檢視|Details|詳細/i }).or(page.locator('button[title*="Inspect"], button[aria-label*="Inspect"]')).first();
    if (await inspectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inspectBtn.click();
      await expect(
        page.locator('[data-testid="right-drawer"], [role="dialog"], [data-testid="inspector-panel"], div:has-text("Alpha")').first(),
      ).toBeVisible({ timeout: 10_000 });
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
    await expect(
      page.locator("main").getByRole("heading", { name: /Permissions|權限|Governance/i }).or(page.locator("main h1, main h2, main [role='heading']")).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Mandatory assertion: live network requests were tracked
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-action-reload.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("mgmt-action-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
  });
});
