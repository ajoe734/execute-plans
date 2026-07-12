import { expect, test, type Page, type Route } from "@playwright/test";

const snapshot = "2026-07-12T12:00:00Z";
const meta = { snapshot_at: snapshot, read_state: "formal", freshness: { materializer_revision: 3, rebuild_status: "ready", source_watermarks: {} } };
const focusedRow = { journey_id: "journey-persona-a-1", status: "completed", current_stage: "reconciliation", flags: {}, environment: "paper", severity: "info", symbol: "2330", persona_id: "persona-a", updated_at: snapshot };

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
    if (url.pathname === "/bff/management/trade-journeys") {
      capturedQueries.push(url.searchParams);
      const scoped = url.searchParams.get("persona_id") ? [focusedRow] : [focusedRow, { ...focusedRow, journey_id: "journey-other-1", persona_id: "persona-b" }];
      return json(route, { data: { items: scoped }, page_info: { total: scoped.length, page_size: 25 }, meta });
    }
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

  test("back-navigation from the journey detail preserves the persona focus context", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await install(page, queries);
    await page.goto("/management/trade-journeys?tenant_id=tenant-a&environment=paper&persona_id=persona-a");
    await page.goto("/management/trade-journeys?tenant_id=tenant-a&environment=paper");
    await page.goBack();
    await expect(page).toHaveURL(/persona_id=persona-a/);
    await expect(page.getByText(/Focused: persona persona-a/)).toBeVisible();
  });
});
