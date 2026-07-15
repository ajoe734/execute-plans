import { expect, test } from "@playwright/test";
import { LOCAL_FIXTURE_AUTH_TOKEN, installOidcDevLogin } from "./helpers/auth";

// MGMT-OPS-003-GAP-001 — proves the hosted Portfolio Book renders every
// degraded/missing-binding incident, all six required filters round-trip
// through the URL and the request, and no formal/covered claim leaks through
// while the fixture is degraded. Mirrors the live BFF holdings contract
// (services/control-plane/bff/main.py `bff_management_portfolio_book_holdings`).

const holdings = Array.from({ length: 14 }, (_, index) => ({
  holding_id: `holding-${index}`,
  runtime_id: `runtime-${index}`,
  persona_id: `persona-${index}`,
  capital_pool_id: index % 4 === 2 ? `pool-${index}` : null,
  broker_id: `broker-${index % 2}`,
  symbol: `SYM${index}`,
  market_value: 1000 + index,
  unrealized_pnl: -index,
  deployment_stage: ["paper", "canary", "live", "unknown"][index % 4],
  source_status: "degraded",
  telemetry_stale: index === 0,
  risk_state: index < 10 ? "missing_binding" : "degraded_source",
  source_issues: [{
    code: index < 10 ? "MISSING_PERSONA_BINDING" : "MISSING_TELEMETRY",
    message: "Authoritative source is missing",
  }],
  capital_scope: {
    scope_kind: ["paper_ledger", "canary_sleeve", "live_capital_pool", "unclassified"][index % 4],
    scope_id: index % 4 === 3 ? null : `scope-${index}`,
  },
  links: {
    persona_fleet: `/management/persona-fleet?persona_id=persona-${index}`,
    performance_attribution: `/management/performance-attribution?persona_id=persona-${index}&runtime_id=runtime-${index}`,
    human_review: `/management/human-inbox?holding_id=holding-${index}`,
  },
}));

test("renders every degraded incident and persists all six filters through reload", async ({ page }) => {
  const requests: string[] = [];
  await installOidcDevLogin(page, {
    goto: false,
    token: LOCAL_FIXTURE_AUTH_TOKEN,
  });
  await page.route("**/bff/management/portfolio-book/holdings**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: holdings,
          summary: {
            holding_count: 14,
            incident_count: 14,
            source_coverage: {
              source_row_count: 4, runtime_count: 14, telemetry_runtime_count: 4,
              stale_row_count: 1, missing_binding_count: 10, degraded_source_count: 14,
            },
          },
        },
        meta: {
          incidents: holdings.map((row) => ({
            id: `incident-${row.holding_id}`,
            severity: "high",
            message: "Authoritative source is missing",
            risk_state: row.risk_state,
            source_status: row.source_status,
            source_issues: row.source_issues,
            identity: { portfolio_id: row.holding_id },
            links: row.links,
          })),
          surfaces: {
            portfolio_book_holdings: { status: "degraded", message: "row-level coverage incidents" },
          },
        },
      }),
    });
  });

  await page.goto(
    "/management/portfolio-book?deployment_stage=canary&broker_id=broker-1&runtime_id=runtime-1&source_status=degraded&stale_telemetry=false&risk_state=missing_binding",
  );

  await expect(page.getByTestId("portfolio-incident")).toHaveCount(14);
  await expect(page.getByTestId("portfolio-holding")).toHaveCount(14);
  await expect(page.getByText("Source: degraded").first()).toBeVisible();
  await expect(page.getByText("Unknown capital scope").first()).toBeVisible();
  for (const label of ["Stage", "Broker", "Runtime", "Source status", "Stale telemetry", "Risk state"]) {
    await expect(page.getByLabel(label)).not.toHaveValue("");
  }

  const initialRequestParams = new URL(requests.at(-1)!).searchParams;
  const initialExpected = {
    deployment_stage: "canary", broker_id: "broker-1", runtime_id: "runtime-1",
    source_status: "degraded", stale_telemetry: "false", risk_state: "missing_binding",
  };
  for (const [key, value] of Object.entries(initialExpected)) {
    expect(initialRequestParams.get(key)).toBe(value);
  }

  await page.getByLabel("Stage").selectOption("live");
  await page.getByLabel("Broker").selectOption("");
  await page.getByLabel("Runtime").selectOption("");
  await page.getByLabel("Source status").selectOption("stale");
  await page.getByLabel("Stale telemetry").selectOption("true");
  await page.getByLabel("Risk state").selectOption("stale_telemetry");

  await expect(page).toHaveURL(/deployment_stage=live/);
  await expect(page).toHaveURL(/source_status=stale/);
  await expect(page).toHaveURL(/stale_telemetry=true/);
  await expect(page).toHaveURL(/risk_state=stale_telemetry/);
  await expect(page).not.toHaveURL(/broker_id=/);
  await expect(page).not.toHaveURL(/runtime_id=/);

  await page.reload();
  for (const [label, value] of [
    ["Stage", "live"], ["Broker", ""], ["Runtime", ""],
    ["Source status", "stale"], ["Stale telemetry", "true"], ["Risk state", "stale_telemetry"],
  ]) {
    await expect(page.getByLabel(label)).toHaveValue(value);
  }

  const requestParams = new URL(requests.at(-1)!).searchParams;
  const expected = {
    deployment_stage: "live", source_status: "stale",
    stale_telemetry: "true", risk_state: "stale_telemetry",
  };
  for (const [key, value] of Object.entries(expected)) {
    expect(requestParams.get(key)).toBe(value);
  }
  expect(requestParams.has("broker_id")).toBe(false);
  expect(requestParams.has("runtime_id")).toBe(false);

  await expect(page.getByText(/formal attribution|covered/i)).toHaveCount(0);

  const humanReviewLinks = page.getByRole("link", { name: "Human Review" });
  await expect(humanReviewLinks.first()).toHaveAttribute("href", /\/management\/human-inbox\?/);
});
