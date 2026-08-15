import { expect, test, type Page, type Route } from "@playwright/test";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";

const QUIET_ME_RESPONSE = {
  data: {
    user: {
      id: "op-perf-ia",
      displayName: "Perf IA Operator",
      email: "perf-ia@pantheon.local",
    },
    tenant: {
      id: "tenant-perf-ia",
      name: "Perf IA",
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
    permissionsVersion: "perf-ia-v1",
  },
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

async function installQuietBffRoutes(page: Page) {
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
    await fulfillJson(route, {
      data: {},
      items: [],
      meta: {
        status: "degraded",
        source: "mgmt-perf-ia-001-fixture",
      },
    });
  });
}

test.describe("MGMT-PERF-IA-001 canonical route, menu, and redirect manifest", () => {
  test("redirects legacy performance/ranking/allocation URLs to their canonical center and tab, preserving context", async ({ page }) => {
    await installQuietBffRoutes(page);

    const cases = [
      { from: "/management/portfolio-book", pathname: "/management/performance", search: "?tab=overview" },
      {
        from: "/management/performance-attribution?dimension=persona&persona=persona-tw&period=30d",
        pathname: "/management/performance",
        search: "?tab=attribution&dimension=persona&persona=persona-tw&period=30d",
      },
      { from: "/management/capital?pool=pool-a", pathname: "/management/performance", search: "?tab=exposure&pool=pool-a" },
      { from: "/management/persona-league?persona=persona-a&sort=score", pathname: "/management/rankings", search: "?tab=rolling&persona=persona-a&sort=score" },
      {
        from: "/management/quarterly-ranking?persona=persona-a&quarter=2026Q3",
        pathname: "/management/rankings",
        search: "?tab=quarterly&persona=persona-a&quarter=2026Q3",
      },
      { from: "/management/capital-pools?capital_id=pool-a", pathname: "/management/governance-decisions", search: "?tab=capital&capital_id=pool-a" },
      { from: "/management/rebalances?rebalance_id=rb-1", pathname: "/management/governance-decisions", search: "?tab=capital&rebalance_id=rb-1" },
      { from: "/management/ranking-formulas?formula_id=rf-1", pathname: "/management/governance-decisions", search: "?tab=policy&formula_id=rf-1" },
      {
        from: "/management/promotion-allocation?tab=real-ranking&persona=persona-a",
        pathname: "/management/rankings",
        search: "?tab=rolling&persona=persona-a",
      },
      {
        from: "/management/promotion-allocation?tab=paper-candidates&persona=persona-a",
        pathname: "/management/rankings",
        search: "?tab=quarterly&persona=persona-a",
      },
      {
        from: "/management/promotion-allocation?tab=quarterly-capital&capital_id=pool-a",
        pathname: "/management/governance-decisions",
        search: "?tab=capital&capital_id=pool-a",
      },
      {
        from: "/management/promotion-allocation?tab=formula-policy&formula_id=rf-1",
        pathname: "/management/governance-decisions",
        search: "?tab=policy&formula_id=rf-1",
      },
    ];

    for (const item of cases) {
      await page.goto(frontendUrl(item.from), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect
        .poll(
          () => {
            const url = new URL(page.url());
            return { pathname: url.pathname, search: url.search };
          },
          { message: `${item.from} should redirect to ${item.pathname}${item.search}`, timeout: 10_000 },
        )
        .toEqual({ pathname: item.pathname, search: item.search });

      // A canonical destination must never itself redirect further (no loops).
      await page.waitForTimeout(150);
      const finalUrl = new URL(page.url());
      expect(finalUrl.pathname).toBe(item.pathname);
    }
  });

  test("drops unknown query keys on redirect instead of forwarding the whole legacy query string", async ({ page }) => {
    await installQuietBffRoutes(page);
    await page.goto(
      frontendUrl("/management/performance-attribution?dimension=persona&persona=persona-tw&unknown_debug_flag=1"),
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await expect
      .poll(() => new URL(page.url()).search, { timeout: 10_000 })
      .toBe("?tab=attribution&dimension=persona&persona=persona-tw");
  });

  test("sidebar renders each canonical center exactly once and drops the retired legacy entries", async ({ page }) => {
    await installQuietBffRoutes(page);
    await page.goto(frontendUrl("/management/cockpit"), { waitUntil: "domcontentloaded", timeout: 30_000 });

    const primaryNav = page.locator("nav").first();
    await primaryNav.waitFor({ state: "attached", timeout: 15_000 });
    const navHrefs = await primaryNav.locator("a").evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );

    for (const canonicalPath of ["/management/performance", "/management/rankings", "/management/governance-decisions"]) {
      expect(navHrefs.filter((href) => href === canonicalPath), `${canonicalPath} should appear exactly once`).toHaveLength(1);
    }
    for (const retiredPath of [
      "/management/portfolio-book",
      "/management/performance-attribution",
      "/management/persona-league",
      "/management/quarterly-ranking",
      "/management/promotion-allocation",
    ]) {
      expect(navHrefs, `${retiredPath} should no longer be a sidebar entry`).not.toContain(retiredPath);
    }

    // No duplicate hrefs anywhere in the primary nav.
    expect(new Set(navHrefs).size).toBe(navHrefs.length);
    await expect(page.getByTestId("management-operations-nav")).toHaveCount(0);
  });

  test("compatibility detail aliases terminate on their canonical detail pages", async ({ page }) => {
    await installQuietBffRoutes(page);
    const cases = [
      ["/management/capital-pools/cp_alpha", "/management/capital/cp_alpha"],
      ["/management/ranking-formulas/rf_001", "/management/ranking/formulas/rf_001"],
      ["/management/rebalances/rb_q2_2026", "/management/rebalance/rb_q2_2026"],
    ] as const;

    for (const [from, pathname] of cases) {
      await page.goto(frontendUrl(from), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(pathname);
      await page.waitForTimeout(150);
      expect(new URL(page.url()).pathname).toBe(pathname);
      await expect(page.getByTestId("management-operations-nav")).toHaveCount(0);
    }
  });

  test("canonical centers render real tab content on both desktop and mobile viewports", async ({ page }) => {
    await installQuietBffRoutes(page);

    // Locale-agnostic: the UI may render en-US or zh-TW labels depending on
    // session locale, so assert on structure (a heading + a tablist), not a
    // specific translated string.
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const path of [
        "/management/performance?tab=overview",
        "/management/rankings?tab=quarterly",
        "/management/governance-decisions?tab=capital",
      ]) {
        await page.goto(frontendUrl(path), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.getByRole("tablist").first()).toBeVisible();
        await expect(page.getByTestId("management-operations-nav")).toHaveCount(0);
      }
    }
  });
});
