// F13: surviving management reads after retirement of the legacy Agora clients.
import { expect, test, type Page } from "@playwright/test";
import { installContainedLoopbackAuth, installContainedLoopbackAuthAuthority } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

async function installReads(page: Page, journalFails = false) {
  await installContainedLoopbackAuth(page);
  await installQuietEventSource(page);
  const requests: string[] = [];
  await page.route(/\/(?:bff|api\/v1)\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": request.headers().origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    requests.push(path);
    let status = 200;
    let data: unknown = [];
    if (path === "/bff/strategies/stg_f13") {
      data = { id: "stg_f13", name: "F13 strategy", alpha: "alpha_f13", state: "discovered", risk: "low", owner: "operator", personaIds: [], pnl30d: 0, sharpe: 0, drawdown: 0 };
    } else if (path === "/bff/agora/journal") {
      status = journalFails ? 503 : 200;
      data = [{ entry_id: "j-f13", subjectKind: "Strategy", subjectId: "stg_f13", title: "F13 retained decision", decidedBy: "operator" }];
    } else if (path.startsWith("/api/v1/postmortems")) {
      const record = { report_id: "pm-f13", incident_id: "inc-f13", title: "F13 persisted review", root_cause: "Persisted timeout diagnosis" };
      data = path === "/api/v1/postmortems" ? [record] : record;
    }
    await route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify({ data }) });
  });
  await installContainedLoopbackAuthAuthority(page);
  return requests;
}

test.describe("F13 retained Agora journal and canonical postmortems", () => {
  test("strategy renders the retained journal through management governance", async ({ page }) => {
    await installReads(page);
    await page.goto("/management/strategies/stg_f13");
    await expect(page.getByText("F13 strategy", { exact: true })).toBeVisible();
    await expect(page.getByText("F13 retained decision", { exact: true })).toBeVisible();
    await expect(page.locator('a[href^="/agora/journal"], a[href^="/agora/memory"]')).toHaveCount(0);
  });

  test("a failed journal read leaves the strategy visible with an error", async ({ page }) => {
    await installReads(page, true);
    await page.goto("/management/strategies/stg_f13");
    await expect(page.getByText("F13 strategy", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Some strategy data could not be loaded: Decision journal" })).toBeVisible();
  });

  test("Postmortems lists API records and opens the matching detail", async ({ page }) => {
    const requests = await installReads(page);
    await page.goto("/management/postmortems");
    await page.getByText("F13 persisted review", { exact: true }).click();
    await expect(page.getByText("Persisted timeout diagnosis", { exact: true })).toBeVisible();
    expect(requests).toContain("/api/v1/postmortems");
    expect(requests).toContain("/api/v1/postmortems/pm-f13");
    expect(requests).not.toContain("/bff/agora/postmortems");
  });
});
