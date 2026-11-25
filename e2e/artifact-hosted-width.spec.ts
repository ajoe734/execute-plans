import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installContainedLoopbackAuth,
  installContainedLoopbackAuthAuthority,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const OWNER = "pantheon-dev-paper-provisioner";
// Genuine 273 Artifact records captured from the hosted owner API (pages 100/100/73).
const RECORDS = JSON.parse(
  readFileSync(new URL("./fixtures/artifact-hosted-273.json", import.meta.url), "utf8"),
) as Array<Record<string, unknown>>;

// Genuine strategies capture (reads[1].body of management-candidate-reads-1793964736780.json).
// Not a repo fixture (only the Artifact fixture is admitted); the strategy test skips when absent.
const STRATEGY_CAPTURE =
  process.env.STRATEGY_CAPTURE_PATH ||
  "/tmp/pantheon-dev-operable-20261104/management-candidate-reads-1793964736780.json";
function loadStrategies(): Record<string, unknown> | null {
  if (!existsSync(STRATEGY_CAPTURE)) return null;
  const body = (JSON.parse(readFileSync(STRATEGY_CAPTURE, "utf8")) as { reads: Array<{ body: unknown }> }).reads[1].body;
  return (typeof body === "string" ? JSON.parse(body) : body) as Record<string, unknown>;
}

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      "accept,authorization,content-type,idempotency-key,if-match,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id,x-trace-id",
    vary: "Origin",
  };
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders(route), body: JSON.stringify(body) });
}

function envelope(items: unknown[], total = items.length, next?: string): Record<string, unknown> {
  return {
    items,
    cursor: next ? { next } : {},
    pageSize: items.length,
    totalCountExact: true,
    estimatedTotal: total,
    meta: { snapshot_at: "2026-11-06T01:00:00Z", source: "fe-artifact-width-fixture", status: "ok" },
  };
}

async function installRoutes(page: Page, strategies?: Record<string, unknown> | null): Promise<void> {
  await installContainedLoopbackAuth(page);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    if (path === "/health" || path === "/healthz" || path === "/readyz") {
      return fulfillJson(route, { status: "ok", live: true, ready: true, checked_at: "2026-11-06T01:00:00Z" });
    }
    if (path === "/bff/events/stream") {
      await route.fulfill({ status: 200, contentType: "text/event-stream", headers: corsHeaders(route), body: ": connected\n\n" });
      return;
    }
    if (strategies && path === "/bff/strategies") {
      return fulfillJson(route, strategies);
    }
    if (path === "/bff/artifacts") {
      const url = new URL(request.url());
      const start = Number(url.searchParams.get("page_token") || 0);
      const size = Number(url.searchParams.get("page_size") || 100);
      const slice = RECORDS.slice(start, start + size);
      const next = start + size < RECORDS.length ? String(start + size) : undefined;
      return fulfillJson(route, envelope(slice, RECORDS.length, next));
    }
    if (path.startsWith("/bff/") || path.startsWith("/api/")) {
      return fulfillJson(route, envelope([]));
    }
    await route.continue();
  });
  await installContainedLoopbackAuthAuthority(page);
}

test.describe("FE-ARTIFACT-HOSTED-WIDTH-20261106 Artifact list width", () => {
  test.setTimeout(120_000);
  test.skip(targetsExternalE2eEnvironment(), "route-mocked layout regression runs on loopback");

  for (const width of [1600, 1366] as const) {
    test(`Artifact table fits and keeps owner readable at ${width}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      await installRoutes(page);
      await page.goto(frontendUrl("/management/artifacts"), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
      // FE-REGISTRY-LISTS-CURRENT-FIRST-20261125: the default view is Current. This genuine capture has
      // no list_scope (older BFF), so its 271 Registry rows stay visible and the 2 research run outputs
      // sit under their own tab; "All" still counts all 273.
      await expect.poll(() => page.locator("tbody tr").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(271);
      await expect(page.getByRole("button", { name: /\(273\)$/ })).toBeVisible();

      const m = await page.evaluate((owner) => {
        const scroller = document.querySelector<HTMLElement>("[data-management-table-scrollbar='native']")!;
        const ths = Array.from(document.querySelectorAll("thead th"));
        const last = ths[ths.length - 1].getBoundingClientRect();
        const rows = Array.from(document.querySelectorAll<HTMLElement>("tbody tr"));
        const ownerCell = document.querySelector<HTMLElement>(`[data-full-owner='${owner}']`)!;
        const oc = ownerCell.closest("td")!.getBoundingClientRect();
        return {
          rowCount: rows.length,
          viewportWidth: window.innerWidth,
          clientWidth: scroller.clientWidth,
          scrollWidth: scroller.scrollWidth,
          headers: ths.map((th) => (th.textContent || "").trim()),
          colWidths: ths.map((th) => Math.round(th.getBoundingClientRect().width)),
          lastRight: last.right,
          maxRowHeight: Math.max(...rows.map((r) => r.getBoundingClientRect().height)),
          ownerText: (ownerCell.textContent || "").trim(),
          ownerFullAttr: ownerCell.getAttribute("data-full-owner"),
          ownerTitle: ownerCell.getAttribute("title"),
          ownerCellHeight: oc.height,
          ownerClientWidth: ownerCell.clientWidth,
          ownerScrollWidth: ownerCell.scrollWidth,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      }, OWNER);
      console.log(`GEOMETRY@${width} ${JSON.stringify(m)}`);

      expect(m.rowCount).toBe(271);
      // Size column removed and state/risk share one column: 8 columns (was 10).
      expect(m.headers).toHaveLength(8);
      expect(m.colWidths[0]).toBeGreaterThanOrEqual(220);
      expect(m.ownerText).toBe("paper-provisioner");
      expect(m.ownerFullAttr).toBe(OWNER);
      expect(m.ownerTitle).toBe(OWNER);
      expect(m.ownerScrollWidth).toBeLessThanOrEqual(m.ownerClientWidth);
      expect(m.maxRowHeight).toBeLessThanOrEqual(72);
      // The table now fits both widths without horizontal scrolling (it only did at 1600 before).
      expect(m.lastRight).toBeLessThanOrEqual(m.viewportWidth);
      expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1);
      await context.close();
    });
  }

  test("strategy table fits at 1600 with a readable name column (shared DataTable regression)", async ({ browser }) => {
    const strategies = loadStrategies();
    test.skip(!strategies, "genuine strategies capture not available");
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    await installRoutes(page, strategies);
    await page.goto(frontendUrl("/management/strategies"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
    const m = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>("[data-management-table-scrollbar='native']")!;
      const ths = Array.from(document.querySelectorAll("thead th"));
      const rows = Array.from(document.querySelectorAll<HTMLElement>("tbody tr"));
      const nameTd = rows[0].children[0] as HTMLElement;
      return {
        rows: rows.length,
        headers: ths.map((th) => (th.textContent || "").trim()),
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        lastRight: ths[ths.length - 1].getBoundingClientRect().right,
        viewportWidth: window.innerWidth,
        maxRowHeight: Math.max(...rows.map((r) => r.getBoundingClientRect().height)),
        nameWidth: Math.round(nameTd.getBoundingClientRect().width),
        nameHeight: Math.round(nameTd.getBoundingClientRect().height),
      };
    });
    console.log(`STRATEGY_GEOMETRY@1600 ${JSON.stringify(m)}`);
    expect(m.rows).toBeGreaterThan(0);
    // FE-REGISTRY-LISTS-CURRENT-FIRST-20261125: the owner column is gone (the strategy table now shows
    // name, state, runtime, symbols, cumulative result, drawdown, trades, persona), the table fits the
    // window without horizontal scrolling, and the name column keeps at least 220px.
    expect(m.headers).toHaveLength(8);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1);
    expect(m.nameWidth).toBeGreaterThanOrEqual(220);
    expect(m.maxRowHeight).toBeLessThanOrEqual(96);
    await context.close();
  });
});
