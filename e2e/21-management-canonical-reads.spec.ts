import { expect, test, type Page, type Route } from "@playwright/test";
import { LOCAL_FIXTURE_AUTH_TOKEN, installOidcDevLogin } from "./helpers/auth";

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
      snapshot_at: "2026-07-01T00:00:00Z",
      source: "mgmt-gap-002-fixture",
      status: "ok",
      surfaces: {
        canonical_read: { source: "mgmt-gap-002-fixture", status: "ok" },
      },
    },
    page_info: { page_size: items.length, total: items.length, totalCountExact: true },
  };
}

async function installCanonicalReadFixture(page: Page, calls: string[]): Promise<void> {
  await page.route(/^https?:\/\/[^/]+\/(?:bff|health|healthz|readyz).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders(route), status: 204 });
      return;
    }
    calls.push(path);

    if (path === "/bff/events/stream") {
      await route.fulfill({ body: ": connected\n\n", contentType: "text/event-stream", headers: corsHeaders(route), status: 200 });
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
          user: { id: "op-gap-002", roles: ["operator", "reviewer", "approver"] },
        },
      });
      return;
    }

    if (path === "/bff/management/data-sources") {
      await fulfillJson(route, envelope([{
        connector_id: "canonical_ibkr",
        provider: "Canonical IBKR",
        kind: "broker_execution",
        health: "read_ok",
        universe: ["US"],
        consumer_persona_ids: ["persona-canonical"],
        consumer_persona_names: ["Canonical Persona"],
        credential_state: "configured",
      }], path));
      return;
    }
    if (path === "/bff/management/permissions") {
      await fulfillJson(route, envelope([{
        instance: "persona-tool",
        rows: [{ id: "persona-canonical", label: "Canonical Persona" }],
        cols: [{ id: "tool-canonical", label: "Canonical Tool", risk: "medium" }],
        cells: [{ rowId: "persona-canonical", colId: "tool-canonical", grant: "use" }],
      }], path));
      return;
    }
    if (path === "/bff/management/memory-governance") {
      await fulfillJson(route, envelope([{
        id: "memory-canonical",
        persona_id: "persona-canonical",
        kind: "fact",
        source: "operator",
        proposed_by: "ops",
        proposed_at: "2026-07-01T00:00:00Z",
        status: "queued",
        after: "Canonical memory change",
      }], path));
      return;
    }
    if (path === "/bff/management/consult-rules") {
      await fulfillJson(route, envelope([{
        id: "consult-canonical",
        name: "Canonical consult rule",
        from_persona_id: "persona-a",
        to_persona_id: "persona-b",
        trigger: "risk=high",
        mode: "blocking",
        env_scope: ["paper"],
        enabled: true,
        owner: "ops",
        updated_at: "2026-07-01T00:00:00Z",
      }], path));
      return;
    }
    if (path === "/bff/lineage") {
      await fulfillJson(route, {
        data: {
          nodes: [
            { id: "artifact-canonical", label: "Canonical Artifact", type: "Artifact", state: "approved", risk: "low" },
            { id: "strategy-canonical", label: "Canonical Strategy", type: "Strategy", state: "paper", risk: "medium" },
          ],
          edges: [{ from: "artifact-canonical", to: "strategy-canonical", label: "scaffolds" }],
        },
        meta: { status: "ok", source: "mgmt-gap-002-fixture" },
      });
      return;
    }
    if (path === "/bff/workflows") {
      await fulfillJson(route, envelope([{
        id: "workflow-canonical",
        name: "Canonical Workflow",
        category: "rebalance",
        steps: ["Capture evidence"],
        inputs: ["persona_id"],
        last_run: "2026-07-01T00:00:00Z",
        runs: 1,
        owner: "ops",
      }], path));
      return;
    }
    if (path === "/bff/hooks") {
      await fulfillJson(route, {
        data: {
          crons: [{
            id: "cron-canonical",
            name: "Canonical Cron",
            schedule: "0 0 * * *",
            target: "workflow-canonical",
            enabled: true,
            last_run: "2026-07-01T00:00:00Z",
            next_run: "2026-07-02T00:00:00Z",
          }],
          hooks: [{
            id: "hook-canonical",
            name: "Canonical Hook",
            event: "canonical.event",
            target: "workflow-canonical",
            filters: "*",
            enabled: true,
            fired_today: 1,
          }],
        },
        meta: { status: "ok", source: "mgmt-gap-002-fixture" },
      });
      return;
    }
    if (path === "/bff/knowledge") {
      await fulfillJson(route, envelope([{
        id: "knowledge-canonical",
        title: "Canonical Insight",
        source: "Canonical Source",
        kind: "research_note",
        risk: "medium",
        ts: "2026-07-01T00:00:00Z",
        body: "Canonical insight body",
      }], path));
      return;
    }

    await fulfillJson(route, envelope([], path));
  });
}

test.describe("MGMT-GAP-002 canonical management reads", () => {
  test("routes management pages to canonical BFF read surfaces without seed fallback", async ({ page }) => {
    const calls: string[] = [];
    await installCanonicalReadFixture(page, calls);
    await installOidcDevLogin(page, {
      goto: false,
      roles: ["operator", "reviewer", "approver"],
      tenantId: "pantheon-dev",
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    const cases = [
      { path: "/management/data-sources", endpoint: "/bff/management/data-sources", text: "Canonical IBKR", absent: "persona-fleet" },
      { path: "/management/governance/permissions", endpoint: "/bff/management/permissions", text: "Canonical Tool" },
      { path: "/management/governance/memory", endpoint: "/bff/management/memory-governance", text: "Canonical memory change" },
      { path: "/management/governance/consult", endpoint: "/bff/management/consult-rules", value: "Canonical consult rule" },
      { path: "/management/lineage", endpoint: "/bff/lineage", text: "Canonical Artifact" },
      { path: "/management/workflows", endpoint: "/bff/workflows", text: "Canonical Workflow", absent: "Quarterly rebalance" },
      { path: "/management/hooks", endpoint: "/bff/hooks", text: "Canonical Cron", absent: "Daily brief generator" },
      { path: "/management/knowledge", endpoint: "/bff/knowledge", text: "Canonical Insight", absent: "Cross-asset momentum divergence" },
    ];

    for (const item of cases) {
      calls.length = 0;
      await page.goto(frontendUrl(item.path), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect.poll(() => calls.includes(item.endpoint), {
        message: `${item.path} should call ${item.endpoint}`,
      }).toBe(true);
      if ("value" in item) {
        await expect.poll(async () =>
          page.locator("input, textarea").evaluateAll((fields, expected) =>
            fields.some((field) => {
              const control = field as HTMLInputElement | HTMLTextAreaElement;
              const rect = control.getBoundingClientRect();
              return control.value === expected && rect.width > 0 && rect.height > 0;
            }),
          item.value),
        ).toBe(true);
      } else {
        await expect(page.getByText(item.text).first()).toBeVisible();
      }
      if (item.absent) {
        await expect(page.getByText(item.absent)).toHaveCount(0);
      }
    }
  });
});
