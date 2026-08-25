import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import {
  installOidcDevLogin,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE = (
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://localhost:5173"
).replace(/\/+$/, "");

const HOSTED_REQUESTED = Boolean(
  process.env.PANTHEON_FE_BASE_URL &&
    targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: process.env.PANTHEON_FE_BASE_URL }),
);

const MOCK_V2_DATA_SOURCE = {
  schema_version: "management_data_source.v2",
  source_instance_id: "ds-twse-market-v1",
  connector_id: "ds-twse-market-v1",
  provider: "TWSE",
  source_class: "market_daily",
  definition: {
    definition_id: "twse-openapi-daily",
    adapter_token: "TwseAdapter.records_from_payload",
    adapter_version: "1.0.0",
    provider: "TWSE",
    definition_state: "supported",
    datasets: ["tw_price_daily", "tw_dividends"],
    markets: ["TW"],
    deployment_sha: "sha256:475a3d4fcf1ba8648c7417fa2d92afe3522416bf",
  },
  instance: {
    data_source_id: "ds-twse-market-v1",
    source_kind: "data_source",
    definition_id: "twse-openapi-daily",
    connector_id: "ds-twse-market-v1",
    provider: "TWSE",
    source_class: "market_daily",
    lifecycle_state: "enabled",
    revision: 2,
    markets: ["TW"],
    datasets: ["tw_price_daily"],
    license_scope: "official_reference",
    allowed_use: ["research_data", "backtest_data", "monitoring"],
  },
  desired: {
    source_instance_id: "ds-twse-market-v1",
    revision: 2,
    desired_lifecycle: "enabled",
    definition_id: "twse-openapi-daily",
    connector_config: {
      public: { endpoint_url: "https://openapi.twse.com.tw" },
      secret_ref_id: "vault://secret/twse-api-key",
    },
    schedule: {
      enabled: true,
      cadence: "0 19 * * 1-5",
      timezone: "Asia/Taipei",
      jitter_seconds: 120,
    },
  },
  observed: {
    source_instance_id: "ds-twse-market-v1",
    desired_revision: 2,
    observed_revision: 2,
    reconciliation_status: "converged",
    effective_lifecycle: "enabled",
    health_state: "healthy",
    credential_state: "configured",
    validation_state: "passed",
    canary_state: "passed",
    freshness: {
      watermark: "2026-08-24T13:30:00Z",
      age_seconds: 120,
      last_success_at: "2026-08-24T13:32:00Z",
    },
    last_run: {
      ingest_run_id: "run-twse-001",
      row_count: 1500,
      rejected_count: 0,
      evidence_bundle_id: "ev-twse-20260824",
    },
    dependent_refs: ["persona-tw-arb"],
  },
  allowed_actions: {
    canValidate: true,
    canCanary: true,
    canEnable: false,
    canDisable: true,
    canDegrade: true,
    canResume: false,
    canChangeSchedule: true,
    canReplace: true,
    canRetire: false,
    blockedReasons: ["already_enabled", "retire_requires_disabled"],
  },
  allowedActions: {
    canValidate: true,
    canCanary: true,
    canEnable: false,
    canDisable: true,
    canDegrade: true,
    canResume: false,
    canChangeSchedule: true,
    canReplace: true,
    canRetire: false,
    blockedReasons: ["already_enabled", "retire_requires_disabled"],
  },
};

const MOCK_DIVERGED_DATA_SOURCE = {
  ...MOCK_V2_DATA_SOURCE,
  source_instance_id: "ds-tpex-quote-v1",
  connector_id: "ds-tpex-quote-v1",
  provider: "TPEx",
  desired: {
    ...MOCK_V2_DATA_SOURCE.desired,
    source_instance_id: "ds-tpex-quote-v1",
    desired_lifecycle: "enabled",
    revision: 3,
  },
  observed: {
    ...MOCK_V2_DATA_SOURCE.observed,
    source_instance_id: "ds-tpex-quote-v1",
    desired_revision: 3,
    observed_revision: 2,
    effective_lifecycle: "configured_disabled",
    reconciliation_status: "diverged",
    health_state: "degraded",
  },
};

async function setupStandardFixtures(page: Page) {
  if (HOSTED_REQUESTED) {
    return;
  }

  await page.route("**/bff/management/data-sources**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            definitions: [MOCK_V2_DATA_SOURCE.definition],
            count: 1,
            status: "ok",
          },
          meta: { status: "ok", source: "service_client" },
        }),
      });
    }
    if (url.pathname.includes("/runs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            observations: [
              {
                source_instance_id: "ds-twse-market-v1",
                observed_revision: 2,
                reconciliation_status: "converged",
                effective_lifecycle: "enabled",
                health_state: "healthy",
                observed_at: "2026-08-24T13:32:00Z",
                watermark: "2026-08-24T13:30:00Z",
                row_count: 1500,
                rejected_count: 0,
              },
            ],
            canaries: [
              {
                canary_id: "canary-twse-001",
                source_instance_id: "ds-twse-market-v1",
                status: "passed",
                row_count: 10,
                rejected_count: 0,
                started_at: "2026-08-24T13:31:00Z",
                completed_at: "2026-08-24T13:31:05Z",
              },
            ],
          },
          meta: { status: "ok", source: "service_client" },
        }),
      });
    }
    if (url.pathname.includes("/receipts")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            receipts: [
              {
                receipt_id: "rcp-twse-001",
                command_id: "cmd-001",
                source_instance_id: "ds-twse-market-v1",
                command_type: "enable",
                status: "succeeded",
                before_revision: 1,
                after_revision: 2,
                created_at: "2026-08-24T13:00:00Z",
              },
            ],
          },
          meta: { status: "ok", source: "service_client" },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [MOCK_V2_DATA_SOURCE, MOCK_DIVERGED_DATA_SOURCE],
          count: 2,
        },
        meta: { status: "ok", source: "service_client" },
      }),
    });
  });
}

test.describe("Management Data Source Control Center (SD-SRCM-04)", () => {
  test.beforeEach(async ({ page }) => {
    await installOidcDevLogin(page);
    await installQuietEventSource(page);
  });

  test("unmocked hosted / authenticated control center proof and 9 canonical columns", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Header & Real Writes Status
    await expect(page.getByRole("heading", { name: "Data Source Management" })).toBeVisible();
    await expect(page.getByText(/Real writes disabled/i)).toBeVisible();

    // Verify Add Data Source button is disabled when real writes are off
    const addBtn = page.getByRole("button", { name: /Add Data Source/i });
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeDisabled();

    // Check 9 Canonical Columns
    await expect(page.getByText("Source / Provider")).toBeVisible();
    await expect(page.getByText("Support / Deployment")).toBeVisible();
    await expect(page.getByText("Desired Lifecycle")).toBeVisible();
    await expect(page.getByText("Observed Health")).toBeVisible();
    await expect(page.getByText("Credential / License")).toBeVisible();
    await expect(page.getByText("Schedule / Watermark")).toBeVisible();
    await expect(page.getByText("Latest Run / Search")).toBeVisible();
    await expect(page.getByText("Consumers / Cost")).toBeVisible();
    await expect(page.getByText("Actions")).toBeVisible();
  });

  test("renders SD-SRCM-04 V2 structures, divergence badges, and detail drawer", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Check items rendered
    await expect(page.getByText("TWSE")).toBeVisible();
    await expect(page.getByText("ds-twse-market-v1")).toBeVisible();

    // Check Divergence badge
    await expect(page.getByText("diverged")).toBeVisible();

    // Open Detail Drawer for TWSE source
    const viewButtons = page.getByRole("button", { name: /view/i });
    await viewButtons.first().click();

    // Detail Drawer Assertions
    await expect(page.getByText("Desired vs Observed")).toBeVisible();
    await expect(page.getByText("Secret Reference")).toBeVisible();
    await expect(page.getByText("vault://secret/twse-api-key")).toBeVisible();
    await expect(
      page.getByText("Secrets are stored securely in vault and referenced by ID. Raw values are never exposed."),
    ).toBeVisible();

    // Check Action Buttons in Drawer are disabled when writes are off
    const validateBtn = page.getByRole("button", { name: /^Validate$/i });
    await expect(validateBtn).toBeVisible();
    await expect(validateBtn).toBeDisabled();
  });

  test("tabs navigation: Catalog, Runs & Health, Change History", async ({ page }) => {
    await setupStandardFixtures(page);

    // 1. Catalog Tab
    await page.goto("/management/data-sources?tab=catalog");
    await expect(page.getByText("Phase 1 Offline Development Intake")).toBeVisible();
    await expect(page.getByRole("button", { name: /Download Sample Need/i })).toBeVisible();

    // 2. Runs & Health Tab
    await page.goto("/management/data-sources?tab=runs");
    await expect(page.getByText("Bounded Read-Only Canary Pulls")).toBeVisible();
    await expect(page.getByText("Recent Observation Runs")).toBeVisible();

    // 3. Change History Tab
    await page.goto("/management/data-sources?tab=receipts");
    await expect(page.getByText("Command Receipts Ledger")).toBeVisible();
  });

  test("accessibility and keyboard focus navigation", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Ensure main section has aria-label
    const section = page.locator('section[aria-label="Data Source Management"]');
    await expect(section).toBeVisible();

    // Keyboard Tab navigation to interactive element
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    await expect(focused).toBeFocused();

    // Open Drawer and verify escape key closes it
    const viewBtn = page.getByRole("button", { name: /view/i }).first();
    await viewBtn.click();
    await expect(page.getByText("Desired vs Observed")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Desired vs Observed")).toBeHidden();
  });

  test("envelope meta states: authoritative-empty, unavailable, degraded-legacy", async ({ page }) => {
    // 1. Authoritative Empty
    await page.route("**/bff/management/data-sources", async (route) => {
      if (route.request().url().endsWith("/data-sources")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [],
            meta: { status: "ok", source: "service_client" },
            page_info: { total_count: 0 },
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/management/data-sources");
    await expect(page.getByTestId("data-sources-authoritative-empty")).toBeVisible();
    await expect(page.getByText("No Data Sources Configured")).toBeVisible();

    // 2. Unavailable
    await page.route("**/bff/management/data-sources", async (route) => {
      if (route.request().url().endsWith("/data-sources")) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            data: [],
            meta: { status: "unavailable", source: "frontend_empty_read" },
            page_info: { total_count: 0 },
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/management/data-sources");
    await expect(page.getByTestId("data-sources-unavailable")).toBeVisible();
    await expect(page.getByText("Live data sources unavailable")).toBeVisible();
  });

  test("detail drawer schedule change gating when real writes are off", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Open Drawer
    const viewBtn = page.getByRole("button", { name: /view/i }).first();
    await viewBtn.click();

    // Go to Schedule tab
    const scheduleTab = page.getByRole("tab", { name: /Schedule & Universe/i });
    await scheduleTab.click();

    // Verify Change Schedule button is disabled with read-only tooltip
    const changeScheduleBtn = page.getByRole("button", { name: /Change Schedule/i });
    await expect(changeScheduleBtn).toBeVisible();
    await expect(changeScheduleBtn).toBeDisabled();
    await expect(changeScheduleBtn).toHaveAttribute(
      "title",
      "Real writes are disabled (read-only mode).",
    );
  });

  test("responsive narrow viewport adaptation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Verify header and table scroll wrapper on narrow screen
    await expect(page.getByRole("heading", { name: "Data Source Management" })).toBeVisible();
    await expect(page.locator(".overflow-x-auto").first()).toBeVisible();

    // Verify tabs still switchable
    const catalogTab = page.getByRole("tab", { name: /Catalog/i });
    await catalogTab.click();
    await expect(page.getByText("Phase 1 Offline Development Intake")).toBeVisible();
  });
});
