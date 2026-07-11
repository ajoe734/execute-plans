import { expect, test } from "@playwright/test";
import { installOidcDevLogin } from "./helpers/auth";

const holdings = Array.from({ length: 14 }, (_, index) => ({
  holding_id: `holding-${index}`, runtime_id: `runtime-${index}`, persona_id: `persona-${index}`,
  capital_pool_id: index % 4 === 2 ? `pool-${index}` : null, broker_id: `broker-${index % 2}`,
  symbol: `SYM${index}`, market_value: 1000 + index, unrealized_pnl: -index,
  deployment_stage: ["paper", "canary", "live", "unknown"][index % 4], source_status: "degraded",
  telemetry_stale: index === 0, risk_state: index < 10 ? "missing_binding" : "degraded_source",
  source_issues: [{ code: index < 10 ? "MISSING_PERSONA_BINDING" : "MISSING_TELEMETRY", message: "Authoritative source is missing" }],
  capital_scope: { scope_kind: ["paper_ledger", "canary_sleeve", "live_capital_pool", "unclassified"][index % 4], scope_id: index % 4 === 3 ? null : `scope-${index}` },
  links: { persona_fleet: `/management/persona-fleet?persona_id=persona-${index}`, performance_attribution: `/management/performance-attribution?persona_id=persona-${index}&runtime_id=runtime-${index}`, human_review: `/management/human-inbox?holding_id=holding-${index}` },
}));

test("renders every degraded incident and persists all six filters", async ({ page }) => {
  const requests: string[] = [];
  await installOidcDevLogin(page, { goto: false });
  await page.route("**/bff/management/portfolio-book/holdings**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      data: { items: holdings, summary: { holding_count: 14, incident_count: 14, source_coverage: { source_row_count: 4, runtime_count: 14, telemetry_runtime_count: 4, stale_row_count: 1, missing_binding_count: 10, degraded_source_count: 14 } } },
      meta: { incidents: holdings.map((row) => ({ id: `incident-${row.holding_id}`, severity: "high", message: "Authoritative source is missing", risk_state: row.risk_state, source_status: row.source_status, source_issues: row.source_issues, identity: { portfolio_id: row.holding_id }, links: row.links })), surfaces: { portfolio_book_holdings: { status: "degraded", message: "row-level coverage incidents" } } },
    }) });
  });
  await page.goto("/management/portfolio-book?deployment_stage=canary&broker_id=broker-1&runtime_id=runtime-1&source_status=degraded&stale_telemetry=false&risk_state=missing_binding");
  await expect(page.getByTestId("portfolio-incident")).toHaveCount(14);
  await expect(page.getByText("Source: degraded").first()).toBeVisible();
  await expect(page.getByText("Unknown capital scope").first()).toBeVisible();
  for (const label of ["Stage", "Broker", "Runtime", "Source status", "Stale telemetry", "Risk state"]) await expect(page.getByLabel(label)).not.toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("Stage")).toHaveValue("canary");
  expect(requests.at(-1)).toContain("deployment_stage=canary");
  expect(requests.at(-1)).toContain("risk_state=missing_binding");
  await expect(page.getByText(/formal attribution|covered/i)).toHaveCount(0);
});
