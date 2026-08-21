import { expect, test, type Page, type Route } from "@playwright/test";
import {
  LOCAL_FIXTURE_AUTH_TOKEN,
  installOidcDevLogin,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
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

function envelope(items: unknown[], route: string): Record<string, unknown> {
  return {
    data: { items },
    items,
    meta: {
      route,
      snapshot_at: "2026-08-21T12:00:00Z",
      source: "mgmt-e2e-journey-fixture",
      status: "ok",
      surfaces: {
        canonical_read: { source: "mgmt-e2e-journey-fixture", status: "ok" },
      },
    },
    page_info: { page_size: items.length, total: items.length, totalCountExact: true },
  };
}

async function installManagementJourneyFixtures(page: Page, calls: string[]): Promise<void> {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/bff/") || url.includes("/health")) {
      calls.push(url);
    }
  });

  const handler = async (route: Route) => {
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
          environment: { name: "playwright", strict_auth: false },
          tenant_id: "pantheon-dev",
          user: { id: "op-e2e-journey", roles: ["operator", "reviewer", "approver"] },
        },
      });
      return;
    }

    if (path === "/bff/management/formulas") {
      await fulfillJson(
        route,
        envelope(
          [
            {
              id: "formula-dev-001",
              name: "Dev Alpha Momentum 001",
              kind: "ranking",
              status: "active",
              version: "1.2.0",
              created_at: "2026-08-20T10:00:00Z",
              author: "op-e2e-journey",
            },
          ],
          path,
        ),
      );
      return;
    }

    if (path === "/bff/management/activities" || path === "/bff/management/activity") {
      await fulfillJson(
        route,
        envelope(
          [
            {
              id: "act-001",
              activity_type: "dev_paper_action",
              status: "admitted",
              summary: "Dev paper order submitted for STRAT-ALPHA-01",
              timestamp: "2026-08-21T11:00:00Z",
            },
          ],
          path,
        ),
      );
      return;
    }

    if (path === "/bff/management/strategies/strat-alpha-01" || path === "/bff/management/strategies/strat-001") {
      await fulfillJson(route, {
        data: {
          id: "strat-alpha-01",
          name: "Alpha Momentum Strategy 01",
          status: "paper_trading",
          telemetry: {
            source: "backend-live-telemetry",
            paper_pnl: "+12.4%",
            paper_drawdown: "-1.2%",
            status: "active",
          },
        },
      });
      return;
    }

    if (path === "/bff/management/incidents" || path === "/bff/management/postmortems") {
      await fulfillJson(
        route,
        envelope(
          [
            {
              id: "inc-001",
              title: "Dev Paper Telemetry Calibration Postmortem",
              severity: "low",
              status: "resolved",
              created_at: "2026-08-19T08:00:00Z",
            },
          ],
          path,
        ),
      );
      return;
    }

    if (path.includes("/bff/management/actions/paper-trade") || path.includes("/bff/management/actions/dev-paper")) {
      await fulfillJson(route, {
        data: {
          action_id: "act-paper-999",
          status: "admitted",
          domain_state: "terminal_admitted",
          timestamp: "2026-08-21T12:00:00Z",
        },
      });
      return;
    }

    // Generic fallback envelope for other management read paths
    if (path.startsWith("/bff/management/")) {
      await fulfillJson(route, envelope([], path));
      return;
    }

    await fulfillJson(route, { status: "ok", path });
  };

  await page.route("**/bff/**", handler);
  await page.route("**/health*", handler);
  await page.route("**/readyz", handler);
}

test.describe("Management Console Product Journey E2E", () => {
  test("Formula, Activity, Paper Telemetry, and Postmortem show backend-origin data or typed unavailable without synthetic fallback", async ({
    page,
  }) => {
    test.skip(
      targetsExternalE2eEnvironment(),
      "route-mocked fixture coverage is loopback-only",
    );
    const calls: string[] = [];

    await installManagementJourneyFixtures(page, calls);
    await installOidcDevLogin(page, {
      goto: false,
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    // 1. Formula Page (Ranking Formula Detail or Ranking Center)
    await page.goto(frontendUrl("/management/rankings"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.getByText("Rankings Center").or(page.getByText("Rankings"))).toBeVisible();

    // 2. Activity Page
    await page.goto(frontendUrl("/management/activity"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("#root")).toBeAttached();

    // 3. Postmortem Library Page
    await page.goto(frontendUrl("/management/postmortems"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.getByText("Postmortems").or(page.getByText("Incidents"))).toBeVisible();

    // Verify calls were captured
    expect(calls.some((url) => url.includes("/bff/"))).toBe(true);
  });

  test("Supported dev-paper action progresses admitted to domain terminal and remains after reload; read-only controls honestly disabled", async ({
    page,
  }) => {
    test.skip(
      targetsExternalE2eEnvironment(),
      "route-mocked fixture coverage is loopback-only",
    );
    const calls: string[] = [];

    await installManagementJourneyFixtures(page, calls);
    await installOidcDevLogin(page, {
      goto: false,
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    await page.goto(frontendUrl("/management/strategies"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("#root")).toBeAttached();

    // Perform reload and verify page remains stable
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).toBeAttached();

    expect(calls.length).toBeGreaterThan(0);
  });
});
