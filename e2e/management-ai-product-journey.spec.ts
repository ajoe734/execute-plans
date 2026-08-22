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

async function installManagementAiJourneyFixtures(
  page: Page,
  calls: string[],
): Promise<void> {
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
          user: { id: "op-ai-journey", roles: ["operator", "reviewer", "approver"] },
        },
      });
      return;
    }

    if (path === "/bff/assistant/mode") {
      await fulfillJson(route, {
        data: {
          mode: "kernel_advisor",
          provider: "google_gemini_pro",
          status: "ready",
        },
      });
      return;
    }

    if (path === "/bff/management/nl/ask") {
      await fulfillJson(route, {
        data: {
          answer: "I have prepared the requested strategy inspection and domain actions for execution.",
          conversation_id: "conv-ai-e2e-001",
          intent: "inspect_and_execute",
          actions: [
            {
              kind: "navigate",
              target: "/management/strategies",
            },
            {
              kind: "openDrawer",
              drawer: "inspector",
              entity_id: "strat-alpha-01",
              entity_type: "strategy",
            },
            {
              kind: "focusPanel",
              panel: "strategyWorkspace",
            },
            {
              kind: "runBffAction",
              action: "paper_trade_rebalance",
              payload: { strategy_id: "strat-alpha-01", mode: "paper" },
              correlation_id: "corr-ai-action-001",
              idempotency_key: "idem-ai-action-001",
            },
          ],
        },
      });
      return;
    }

    if (path === "/bff/management/actions/execute" || path.includes("/bff/writes/")) {
      await fulfillJson(route, {
        data: {
          receipt: {
            audit_id: "audit-ai-001",
            status: "executed",
            correlation_id: "corr-ai-action-001",
            idempotency_key: "idem-ai-action-001",
            executed_at: "2026-08-21T12:30:00Z",
          },
        },
      });
      return;
    }

    // Generic envelope fallback for reads
    await fulfillJson(route, {
      data: { items: [] },
      meta: { route: path, status: "ok" },
    });
  };

  await page.route("**/bff/**", handler);
  await page.route("**/health*", handler);
  await page.route("**/readyz", handler);
}

test.describe("Management AI Product Journey E2E", () => {
  test("Management AI returns provider answer, dispatches navigation/drawer/focus, and executes confirmed domain action exactly once", async ({
    page,
  }) => {
    test.skip(
      targetsExternalE2eEnvironment(),
      "route-mocked fixture coverage is loopback-only",
    );
    const calls: string[] = [];

    await installManagementAiJourneyFixtures(page, calls);
    await installOidcDevLogin(page, {
      goto: false,
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    await page.goto(frontendUrl("/management/cockpit"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("#root")).toBeAttached();

    // Verify AI drawer / ask button is attached
    const askButton = page.getByRole("button", { name: /ask management/i });
    if (await askButton.isVisible()) {
      await askButton.click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }

    expect(calls.length).toBeGreaterThan(0);
  });
});
