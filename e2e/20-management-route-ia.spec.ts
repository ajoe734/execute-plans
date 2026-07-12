import { expect, test, type Page, type Route } from "@playwright/test";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";

const QUIET_ME_RESPONSE = {
  data: {
    user: {
      id: "op-route-ia",
      displayName: "Route IA Operator",
      email: "route-ia@pantheon.local",
    },
    tenant: {
      id: "tenant-route-ia",
      name: "Route IA",
      tz: "UTC",
      locale: "zh-TW",
      baseCurrency: "USD",
    },
    roles: ["ops", "viewer"],
    capabilities: ["management.read", "registry.read"],
    env: "dev",
    featureFlags: { routeIa: true },
    serverTime: "2026-05-13T14:10:00Z",
    sessionExpiresAt: "2026-05-13T22:10:00Z",
    permissionsVersion: "route-ia-v1",
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
        source: "mgmt-gap-001-route-ia-fixture",
      },
    });
  });
}

test.describe("MGMT-GAP-001 management route and IA cleanup", () => {
  test("redirects hidden legacy management aliases to canonical routes", async ({ page }) => {
    await installQuietBffRoutes(page);

    const cases = [
      {
        from: "/management/control-room-legacy",
        pathname: "/management/cockpit",
        search: "",
      },
      {
        from: "/management/deployment",
        pathname: "/management/deployments",
        search: "",
      },
      {
        from: "/management/deployment/dep-9?tab=events",
        pathname: "/management/deployments/dep-9",
        search: "?tab=events",
      },
      // MGMT-GAP-008 — these detail aliases used to mount the canonical
      // detail component a second time instead of redirecting.
      {
        from: "/management/capital-pools/pool-9?tab=risk",
        pathname: "/management/capital/pool-9",
        search: "?tab=risk",
      },
      {
        from: "/management/ranking-formulas/rf-9",
        pathname: "/management/ranking-formula/rf-9",
        search: "",
      },
      {
        from: "/management/rebalances/rb-9?tab=lines",
        pathname: "/management/rebalance/rb-9",
        search: "?tab=lines",
      },
      {
        from: "/management/research/exp-9",
        pathname: "/management/experiments/exp-9",
        search: "",
      },
    ];

    for (const item of cases) {
      await page.goto(frontendUrl(item.from), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await expect
        .poll(
          () => {
            const url = new URL(page.url());
            return { pathname: url.pathname, search: url.search };
          },
          { message: `${item.from} should redirect to ${item.pathname}`, timeout: 10_000 },
        )
        .toEqual({ pathname: item.pathname, search: item.search });
    }
  });

  test("keeps downgraded studios and loop subpages out of primary management nav", async ({ page }) => {
    await installQuietBffRoutes(page);

    await page.goto(frontendUrl("/management/cockpit"), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const primaryNav = page.locator("nav").first();
    await primaryNav.waitFor({ state: "attached", timeout: 15_000 });

    const navHrefs = await primaryNav.locator("a").evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );

    expect(navHrefs).toContain("/management/loops");
    for (const demotedPath of [
      "/management/studios/formula",
      "/management/studios/skill-sandbox",
      "/management/loops/research",
      "/management/loops/execution",
      "/management/loops/optimization",
    ]) {
      expect(navHrefs, `${demotedPath} should not be a first-level nav item`).not.toContain(demotedPath);
    }
  });
});
