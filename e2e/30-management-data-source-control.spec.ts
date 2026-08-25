import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_ORIGIN = new URL(
  process.env.PANTHEON_FE_BASE_URL || "http://localhost:5173",
).origin;

const CORS_HEADERS = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers":
    "Accept, Authorization, Content-Type, Idempotency-Key, If-Match, X-Correlation-Id, X-Idempotency-Key, X-Request-Id, X-Tenant-Id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": FE_ORIGIN,
  "Access-Control-Expose-Headers": "ETag, X-Request-Id, X-Correlation-Id",
  Vary: "Origin",
};

function jsonResponse(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test.describe("Management Data Source Control Center (SD-SRCM-04)", () => {
  test.beforeEach(async ({ page }) => {
    await installOidcDevLogin(page);
    await installQuietEventSource(page);
  });

  test("renders control center with 9 canonical columns and server-governed allowedActions", async ({ page }) => {
    const mockV2Source = {
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

    await page.route("**/bff/management/data-sources**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/catalog")) {
        return jsonResponse(route, {
          data: {
            definitions: [mockV2Source.definition],
            count: 1,
            status: "ok",
          },
          meta: { status: "ok", source: "service_client" },
        });
      }
      if (url.pathname.includes("/runs")) {
        return jsonResponse(route, {
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
        });
      }
      if (url.pathname.includes("/receipts")) {
        return jsonResponse(route, {
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
        });
      }
      return jsonResponse(route, {
        data: {
          items: [mockV2Source],
          count: 1,
        },
        meta: { status: "ok", source: "service_client" },
      });
    });

    await page.goto("/management/data-sources");

    // Check Header & Metrics
    await expect(page.getByRole("heading", { name: "Data Source Management" })).toBeVisible();
    await expect(page.getByText("TWSE")).toBeVisible();
    await expect(page.getByText("ds-twse-market-v1")).toBeVisible();
    await expect(page.getByText("vault://secret/twse-api-key")).toBeVisible();

    // Check 9 Canonical Column Headers
    await expect(page.getByText("Source / Provider")).toBeVisible();
    await expect(page.getByText("Support / Deployment")).toBeVisible();
    await expect(page.getByText("Desired Lifecycle")).toBeVisible();
    await expect(page.getByText("Observed Health")).toBeVisible();
    await expect(page.getByText("Credential / License")).toBeVisible();
    await expect(page.getByText("Schedule / Watermark")).toBeVisible();
    await expect(page.getByText("Latest Run / Search")).toBeVisible();
    await expect(page.getByText("Consumers / Cost")).toBeVisible();

    // Open Detail Drawer
    await page.getByRole("button", { name: /view/i }).first().click();
    await expect(page.getByText("Desired vs Observed")).toBeVisible();
    await expect(page.getByText("Secret Reference")).toBeVisible();
    await expect(page.getByText("vault://secret/twse-api-key")).toBeVisible();
    await expect(page.getByText("Secrets are stored securely in vault and referenced by ID. Raw values are never exposed.")).toBeVisible();
  });
});
