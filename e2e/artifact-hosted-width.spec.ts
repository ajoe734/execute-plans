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
      await expect.poll(() => page.locator("tbody tr").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(273);

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
          ownerFullAttr: ownerCell.getAttribute("data-full-owner"),
          ownerTitle: ownerCell.getAttribute("title"),
          ownerCellHeight: oc.height,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      }, OWNER);
      console.log(`GEOMETRY@${width} ${JSON.stringify(m)}`);

      expect(m.rowCount).toBe(273);
      expect(m.headers.length).toBeGreaterThanOrEqual(10);
      expect(m.ownerFullAttr).toBe(OWNER);
      expect(m.ownerTitle).toBe(OWNER);
      expect(m.maxRowHeight).toBeLessThanOrEqual(72);
      if (width === 1600) {
        expect(m.lastRight).toBeLessThanOrEqual(m.viewportWidth);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1);
      }
      await context.close();
    });
  }

  test("strategy owner cell stays readable at 1600 (shared DataTable regression)", async ({ browser }) => {
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
      const ownerIdx = ths.findIndex((th) => /owner|負責|擁有/i.test(th.textContent || ""));
      const ownerTd = ownerIdx >= 0 ? rows[0].children[ownerIdx] as HTMLElement : null;
      return {
        rows: rows.length,
        headers: ths.map((th) => (th.textContent || "").trim()),
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        lastRight: ths[ths.length - 1].getBoundingClientRect().right,
        viewportWidth: window.innerWidth,
        maxRowHeight: Math.max(...rows.map((r) => r.getBoundingClientRect().height)),
        ownerText: ownerTd?.textContent?.trim() ?? null,
        ownerWidth: ownerTd ? Math.round(ownerTd.getBoundingClientRect().width) : null,
        ownerHeight: ownerTd ? Math.round(ownerTd.getBoundingClientRect().height) : null,
      };
    });
    console.log(`STRATEGY_GEOMETRY@1600 ${JSON.stringify(m)}`);
    expect(m.rows).toBeGreaterThan(0);
    expect(m.ownerText).toBe("pantheon-bff");
    // Shared-column regression: the Strategies table already scrolls horizontally at 1600 (11 columns, unchanged by this task);
    // assert only that the owner cell stays unstacked/readable and rows stay within 72px.
    expect(m.ownerHeight).toBeLessThanOrEqual(72);
    expect(m.ownerWidth).toBeGreaterThanOrEqual(110);
    expect(m.maxRowHeight).toBeLessThanOrEqual(72);
    await context.close();
  });
});
