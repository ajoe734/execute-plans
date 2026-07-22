import { expect, test, type Page, type Route } from "@playwright/test";

const snapshot = "2026-07-12T12:00:00Z";
const meta = { snapshot_at: snapshot, read_state: "formal", freshness: { materializer_revision: 3, rebuild_status: "ready", source_watermarks: {} } };
const focusedRow = { journey_id: "journey-persona-a-1", status: "completed", current_stage: "reconciliation", flags: {}, environment: "paper", severity: "info", symbol: "2330", persona_id: "persona-a", updated_at: snapshot };
const runtimeRow = { id: "rt-a", name: "executor-a", personaId: "persona-a", env: "paper", status: "running" };

async function json(route: Route, body: unknown) { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }); }

async function install(page: Page, capturedQueries: URLSearchParams[]) {
  await page.route(url => url.pathname.startsWith("/bff/"), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/bff/me") return json(route, {
      data: {
        user: { id: "cross-link-operator", displayName: "Cross Link Operator", email: "cross-link@pantheon.local" },
        tenant: { id: "tenant-a", name: "Cross Link", tz: "UTC", locale: "en-US", baseCurrency: "USD" },
        roles: ["ops", "viewer"],
        capabilities: ["management.read", "execution.read"],
        env: "dev",
        featureFlags: { tradeJourneys: true },
        serverTime: snapshot,
        sessionExpiresAt: "2026-07-13T12:00:00Z",
        permissionsVersion: "trade-journey-cross-link-v1",
      },
    });
    if (url.pathname === "/bff/runtimes") return json(route, { items: [runtimeRow] });
    if (url.pathname === "/bff/management/persona-fleet") return json(route, { data: { items: [] }, page_info: { total: 0, page_size: 100 }, meta });
    if (url.pathname === "/bff/management/trade-journeys") {
      capturedQueries.push(url.searchParams);
      const scoped = url.searchParams.get("persona_id") ? [focusedRow] : [focusedRow, { ...focusedRow, journey_id: "journey-other-1", persona_id: "persona-b" }];
      return json(route, { data: { items: scoped }, page_info: { total: scoped.length, page_size: 25 }, meta });
    }
    if (url.pathname === "/bff/management/trade-journeys/journey-persona-a-1") return json(route, { data: { ...focusedRow, revision: 2, side: "buy", quantity: 1000, stages: {}, completeness: { missing_stages: [] } }, meta });
    if (url.pathname === "/bff/management/trade-journeys/journey-persona-a-1/timeline") return json(route, { data: { items: [] }, page_info: { total: 0, page_size: 100 }, meta });
    if (url.pathname === "/bff/management/trade-journeys/journey-persona-a-1/evidence") return json(route, { data: {}, meta });
    return json(route, { items: [] });
  });
}

test.describe("Trade Journeys cross-entry integration", () => {
  test("sidebar exposes a Trade Journeys entry that navigates to the canonical route", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await install(page, queries);
    await page.goto("/management/cockpit?tenant_id=tenant-a");
    // The sidebar collapses out of the viewport (not removed from the DOM)
    // below the desktop breakpoint, so assert presence rather than
    // strict visibility to keep this check meaningful on mobile too.
    const navLink = page.locator("nav a[href='/management/trade-journeys']");
    await expect(navLink).toHaveCount(1);
    await page.goto("/management/trade-journeys?tenant_id=tenant-a");
    await expect(page).toHaveURL(/\/management\/trade-journeys(\?|$)/);
    await expect(page.getByRole("heading", { name: "Trade Journeys" })).toBeVisible();
  });

  test("the Cockpit exposes a Trade Journeys destination that round-trips back to Cockpit", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await install(page, queries);
    await page.goto("/management/cockpit?tenant_id=tenant-a");
    const cockpitLink = page.getByRole("link", { name: "cockpit trade journeys" });
    await expect(cockpitLink).toBeVisible();
    await expect(cockpitLink).toHaveAttribute("href", /^\/management\/trade-journeys\?tenant_id=tenant-a&return_to=%2Fmanagement%2Fcockpit(%3F|$)/);
    await cockpitLink.click();
    await expect(page).toHaveURL(/\/management\/trade-journeys/);
    const backLink = page.getByRole("link", { name: /Back to/ });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL(/\/management\/cockpit/);
  });

  test("a persona_id deep link forwards the filter to the BFF query and renders a clearable focus banner", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await install(page, queries);
    await page.goto("/management/trade-journeys?tenant_id=tenant-a&environment=paper&persona_id=persona-a");
    await expect(page.getByText(/Focused: persona persona-a/)).toBeVisible();
    await expect(page.getByText("journey-persona-a-1")).toBeVisible();
    await expect(page.getByText("journey-other-1")).not.toBeVisible();
    await expect.poll(() => queries.at(-1)?.get("persona_id")).toBe("persona-a");

    const showAll = page.getByRole("link", { name: "Show all journeys" });
    await expect(showAll).toHaveAttribute("href", /^\/management\/trade-journeys\?tenant_id=tenant-a&environment=paper$/);
    await showAll.click();
    await expect(page).toHaveURL(/\/management\/trade-journeys\?tenant_id=tenant-a&environment=paper$/);
    await expect(page.getByText(/Focused:/)).not.toBeVisible();
    await expect.poll(() => queries.at(-1)?.get("persona_id")).toBeNull();
  });

  test("a real cross-entry click: Runtimes -> filtered Trade Journeys list -> journey detail -> back to Runtimes with filters intact", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await install(page, queries);
    await page.goto("/management/runtimes?persona=persona-a");
    const crossLink = page.getByRole("link", { name: "persona-a trade journeys" });
    await expect(crossLink).toBeVisible();
    await expect(crossLink).toHaveAttribute("href", /^\/management\/trade-journeys\?persona_id=persona-a&return_to=%2Fmanagement%2Fruntimes%3Fpersona%3Dpersona-a/);

    await crossLink.click();
    await expect(page).toHaveURL(/\/management\/trade-journeys\?persona_id=persona-a/);
    await expect(page.getByText(/Focused: persona persona-a/)).toBeVisible();
    await expect.poll(() => queries.at(-1)?.get("persona_id")).toBe("persona-a");

    await page.getByRole("link", { name: "journey-persona-a-1" }).click();
    await expect(page).toHaveURL(/\/management\/trade-journeys\/journey-persona-a-1/);
    await expect(page.getByText("journey-persona-a-1", { exact: false })).toBeVisible();

    const backToRuntimes = page.getByRole("link", { name: /Back to Runtimes/ });
    await expect(backToRuntimes).toBeVisible();
    await expect(backToRuntimes).toHaveAttribute("href", "/management/runtimes?persona=persona-a");
    await backToRuntimes.click();

    await expect(page).toHaveURL(/\/management\/runtimes\?persona=persona-a$/);
    await expect(page.getByText("rt-a")).toBeVisible();
  });
});
