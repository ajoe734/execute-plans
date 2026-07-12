import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const snapshot = "2026-07-12T12:00:00Z";
const meta = { snapshot_at: snapshot, read_state: "degraded", warnings: ["ledger projection delayed"], freshness: { materializer_revision: 12, rebuild_status: "ready", source_watermarks: {} } };
const rows = [
  ["happy-1", "completed", "reconciliation", []],
  ["risk-1", "risk_rejected", "risk_evaluation", ["risk_reject"]],
  ["broker-1", "broker_rejected", "broker_acknowledgement", ["broker_reject"]],
  ["partial-1", "partially_filled", "fill_management", ["partial_fill"]],
  ["recon-1", "reconciliation_mismatch", "reconciliation", ["recon_mismatch"]],
].map(([journey_id, status, current_stage, flags]) => ({ journey_id, status, current_stage, flags: Object.fromEntries((flags as string[]).map(flag => [flag, true])), environment: "paper", severity: "warning", symbol: "2330", persona_id: "persona-a", updated_at: snapshot }));

async function json(route: Route, body: unknown) { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }); }
async function install(page: Page) {
  await page.route("**/bff/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/bff/management/trade-journeys") return json(route, { data: { items: rows }, page_info: { total: 5, page_size: 25 }, meta });
    if (url.pathname.includes("/timeline")) return json(route, { data: { items: [{ event_id: "event-1", stage: "reconciliation", stage_status: "mismatch", occurred_at: snapshot }] }, page_info: { total: 1, page_size: 100 }, meta });
    if (url.pathname.includes("/evidence")) return json(route, { data: { receipt_id: "receipt-1" }, meta });
    if (url.pathname.endsWith("/recon-1")) return json(route, { data: { ...rows[4], revision: 4, read_state: "partial", completeness: { missing_stages: ["ledger_booking"] }, stages: { reconciliation: { status: "mismatch" } } }, meta });
    return json(route, { items: [] });
  });
}

test("renders all five outcomes and honest degraded detail", async ({ page }) => {
    await install(page);
    await page.goto("/management/trade-journeys?tenant_id=tenant-a&environment=paper");
    await expect(page.getByRole("heading", { name: "Trade Journeys" })).toBeVisible();
    for (const row of rows) await expect(page.getByText(row.status)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "degraded data" })).toBeVisible();
    await page.getByRole("link", { name: "recon-1" }).click();
    await expect(page.getByText(/Missing ledger_booking/)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});
