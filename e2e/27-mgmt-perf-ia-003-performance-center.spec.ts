import { expect, test, type Page, type Route } from "@playwright/test";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";

const QUIET_ME_RESPONSE = {
  data: {
    user: {
      id: "op-perf-ia-003",
      displayName: "Perf IA 003 Operator",
      email: "perf-ia-003@pantheon.local",
    },
    tenant: {
      id: "tenant-perf-ia-003",
      name: "Perf IA 003",
      tz: "UTC",
      locale: "en-US",
      baseCurrency: "USD",
    },
    roles: ["ops", "viewer"],
    capabilities: ["management.read", "registry.read"],
    env: "dev",
    featureFlags: { perfIa: true },
    serverTime: "2026-07-11T00:00:00Z",
    sessionExpiresAt: "2026-07-11T08:00:00Z",
    permissionsVersion: "perf-ia-003-v1",
  },
};

const EXPOSURE_FIXTURE = {
  data: {
    summary: {
      exposure_count: 1,
      risk_budget_total: 100,
      current_exposure_total: 96,
      available_budget_total: 4,
      risk_budget_utilization: 0.96,
      over_budget_count: 1,
      near_limit_count: 0,
      unknown_exposure_count: 0,
      telemetry_runtime_count: 1,
      total_pnl: -8200,
      latest_telemetry_at: "2026-07-11T00:00:00Z",
    },
    items: [{
      id: "portfolio-exposure-pool-e2e",
      capital_pool_id: "pool-e2e",
      name: "E2E Capital Pool",
      status: "active",
      risk_budget: 100,
      current_exposure: 96,
      available_budget: 4,
      risk_budget_utilization: 0.96,
      risk_state: "over_budget",
      pnl: -8200,
      runtime_count: 1,
      active_runtime_count: 1,
      paper_runtime_count: 0,
      live_runtime_count: 1,
      telemetry: { total_pnl: -8200 },
      source_refs: { runtime_ids: ["rt-e2e-1"] },
    }],
  },
  meta: { surfaces: { portfolio_book_exposure: { status: "ok" } } },
};

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  const origin = route.request().headers()["origin"] ?? "*";
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "authorization,content-type,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id",
      "Access-Control-Allow-Origin": origin,
    },
    body: JSON.stringify(body),
  });
}

async function installPerfIa003Routes(page: Page) {
  await page.route(/^https?:\/\/[^/]+\/bff\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === "/bff/me") {
      await fulfillJson(route, QUIET_ME_RESPONSE);
      return;
    }
    if (path === "/bff/management/portfolio-book/exposure") {
      await fulfillJson(route, EXPOSURE_FIXTURE);
      return;
    }
    await fulfillJson(route, {
      data: {},
      items: [],
      meta: { status: "degraded", source: "mgmt-perf-ia-003-fixture" },
    });
  });
}

test.describe("MGMT-PERF-IA-003 Performance Center consolidation", () => {
  test("exposure tab renders the capital pool rollup with no nan/undefined operator-facing values", async ({ page }) => {
    await installPerfIa003Routes(page);
    await page.goto(frontendUrl("/management/performance?tab=exposure"), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(page.getByText("E2E Capital Pool")).toBeVisible();
    await expect(page.getByText("over_budget")).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/\bnan\b/i);
    expect(bodyText).not.toMatch(/\bundefined\b/i);
  });

  test("legacy /management/capital redirect lands on the exposure tab with the pool focus preserved", async ({ page }) => {
    await installPerfIa003Routes(page);
    await page.goto(frontendUrl("/management/capital?pool=pool-e2e"), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect
      .poll(() => new URL(page.url()).search, { timeout: 10_000 })
      .toBe("?tab=exposure&pool=pool-e2e");
    // Locale-agnostic: assert on the interpolated pool id via the badge's
    // stable testid, not the surrounding translated sentence (see
    // e2e/26-...spec.ts precedent) or a bare text match (ambiguous against
    // the pool row's own id cell).
    await expect(page.getByTestId("exposure-focused-pool")).toContainText("pool-e2e");
  });

  test("switching tabs preserves shared filter query params through the URL", async ({ page }) => {
    await installPerfIa003Routes(page);
    await page.goto(frontendUrl("/management/performance?tab=exposure&capital_pool_id=pool-e2e"), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.getByRole("tablist").first()).toBeVisible();

    const tabs = page.getByRole("tab");
    await expect(tabs.first()).toBeVisible();
    await tabs.first().click();
    await expect
      .poll(() => new URL(page.url()).search, { timeout: 10_000 })
      .toContain("capital_pool_id=pool-e2e");
    await expect
      .poll(() => new URL(page.url()).search, { timeout: 10_000 })
      .toContain("tab=overview");
  });
});
