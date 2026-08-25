import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import {
  DEFAULT_FE_OPERATOR_ID,
  DEFAULT_FE_TENANT_ID,
  gcpIdentityStorageKey,
  gcpIdentityStoredUser,
  installOidcDevLogin,
  roleTokenFromEnv,
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
    secret_scope: "runtime_read_only",
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
      secret_scope: "runtime_read_only",
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
    dlq_unresolved_count: 0,
    quota: {
      daily_limit: 50000,
      remaining_calls: 48500,
      used_percent: 3,
    },
    usage: {
      calls_today: 1500,
      cost_usd: 4.5,
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

async function installHostedAuthSession(
  page: Page,
  options: { token: string; operatorId?: string; tenantId?: string },
) {
  const apiKey =
    process.env.VITE_GCP_IDENTITY_API_KEY ||
    process.env.PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY ||
    "AIza01234567890123456789012345678901234";
  const storageKey = gcpIdentityStorageKey(apiKey);
  const operatorId = options.operatorId || DEFAULT_FE_OPERATOR_ID;
  const storedUser = gcpIdentityStoredUser({
    apiKey,
    email: `${operatorId}@pantheon-dev.invalid`,
    tenantId: options.tenantId || DEFAULT_FE_TENANT_ID,
    token: options.token,
    uid: operatorId,
  });

  await page.addInitScript(
    ({ key, storedSession }) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(storedSession));
      } catch {
        // Init script fallback
      }
    },
    { key: storageKey, storedSession: storedUser },
  );

  await page
    .evaluate(
      ({ key, storedSession }) => {
        window.sessionStorage.setItem(key, JSON.stringify(storedSession));
      },
      { key: storageKey, storedSession: storedUser },
    )
    .catch(() => undefined);
}

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

    if (url.pathname.endsWith("/ds-twse-market-v1") || url.pathname.endsWith("/ds-tpex-quote-v1")) {
      const match = url.pathname.endsWith("/ds-tpex-quote-v1") ? MOCK_DIVERGED_DATA_SOURCE : MOCK_V2_DATA_SOURCE;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: match,
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
    const isHosted =
      HOSTED_REQUESTED ||
      targetsExternalE2eEnvironment({
        ...process.env,
        PANTHEON_FE_BASE_URL: process.env.PANTHEON_FE_BASE_URL || FE_BASE,
      });

    if (isHosted) {
      const explicitToken =
        process.env.BFF_AUTH_TOKEN ||
        process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
        roleTokenFromEnv("operator", [
          "PANTHEON_BFF_OPERATOR_A_TOKEN",
          "DEV_BFF_OPERATOR_A_TOKEN",
          "BFF_AUTH_TOKEN",
          "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
        ]);

      if (!explicitToken) {
        throw new Error(
          "Hosted E2E test requires an explicit validated short-lived external credential/session (e.g. BFF_AUTH_TOKEN or PANTHEON_BFF_SMOKE_BEARER_TOKEN). Failing closed instead of injecting placeholder.",
        );
      }

      await installHostedAuthSession(page, {
        token: explicitToken,
        operatorId: DEFAULT_FE_OPERATOR_ID,
        tenantId: process.env.PANTHEON_BFF_TENANT_ID || DEFAULT_FE_TENANT_ID,
      });
    } else {
      await installOidcDevLogin(page, {
        env: {
          ...process.env,
          VITE_GCP_IDENTITY_API_KEY:
            process.env.VITE_GCP_IDENTITY_API_KEY ||
            "AIza01234567890123456789012345678901234",
        },
      });
    }
    await installQuietEventSource(page);
  });

  test("mocked / authenticated control center proof and 9 canonical columns", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Header & Real Writes Status
    await expect(page.getByRole("heading", { name: /Data Source Management|資料源管理/i })).toBeVisible();
    await expect(page.getByText(/Real writes disabled|實體寫入已停用/i)).toBeVisible();

    // Verify Add Data Source button is disabled when real writes are off
    const addBtn = page.getByRole("button", { name: /Add Data Source|新增資料來源/i });
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeDisabled();

    // Check 9 Canonical Columns
    await expect(page.getByText(/Source \/ Provider|來源 \/ 提供者/i)).toBeVisible();
    await expect(page.getByText(/Support \/ Deployment|支援 \/ 部署版本/i)).toBeVisible();
    await expect(page.getByText(/Desired Lifecycle|目標生命週期/i)).toBeVisible();
    await expect(page.getByText(/Observed Health|觀測健康與新鮮度/i)).toBeVisible();
    await expect(page.getByText(/Credential \/ License|憑證 \/ 授權範疇/i)).toBeVisible();
    await expect(page.getByText(/Schedule \/ Watermark|排程 \/ 水位線/i)).toBeVisible();
    await expect(page.getByText(/Latest Run \/ Search|最近執行 \/ 搜尋索引/i)).toBeVisible();
    await expect(page.getByText(/Consumers \/ Cost|取用 Persona \/ 成本/i)).toBeVisible();
    await expect(page.getByText(/Actions|操作/i).first()).toBeVisible();

    // Column 8 Consumer Links & Cost rendering
    const twseRow = page.locator("tr").filter({ hasText: "ds-twse-market-v1" });
    await expect(twseRow.getByText("persona-tw-arb")).toBeVisible();
    await expect(twseRow.getByText(/Cost|成本/i)).toBeVisible();
  });

  test("unmocked hosted read-only control center proof against live BFF", async ({ page }) => {
    const isHosted =
      HOSTED_REQUESTED ||
      targetsExternalE2eEnvironment({
        ...process.env,
        PANTHEON_FE_BASE_URL: process.env.PANTHEON_FE_BASE_URL || FE_BASE,
      });
    test.skip(!isHosted, "Set PANTHEON_HOSTED_E2E=1 or configure hosted dev URL to run unmocked hosted proof.");

    // Genuinely unmocked - listen for the live BFF data-sources request
    const bffResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/bff/management/data-sources") &&
        (resp.status() === 200 || resp.status() === 503 || resp.status() === 401),
      { timeout: 15000 },
    ).catch(() => null);

    await page.goto("/management/data-sources");
    await expect(page.getByRole("heading", { name: /Data Source Management|資料源管理/i })).toBeVisible();
    await expect(page.getByText(/Real writes disabled|實體寫入已停用/i)).toBeVisible();
    await expect(page.locator('section[aria-label="Data Source Management"], section[aria-label="資料源管理"]')).toBeVisible();

    const bffResponse = await bffResponsePromise;
    expect(bffResponse).not.toBeNull();

    // Assert that the page reached an authoritative result: table, authoritative-empty, degraded-legacy, or unavailable alert
    const authoritativeState = page.locator(
      "table[aria-label], [data-testid='data-sources-authoritative-empty'], [data-testid='data-sources-unavailable'], [data-testid='degraded-legacy-banner']",
    ).first();
    await expect(authoritativeState).toBeVisible({ timeout: 10000 });
  });

  test("renders SD-SRCM-04 V2 structures, divergence badges, and detail drawer", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Check items rendered with row scoping to avoid non-unique TWSE matches
    const twseRow = page.locator("tr").filter({ hasText: "ds-twse-market-v1" });
    await expect(twseRow).toBeVisible();
    await expect(twseRow.getByText("TWSE", { exact: true })).toBeVisible();
    await expect(twseRow.getByText("ds-twse-market-v1")).toBeVisible();

    // Check Divergence badge on diverged row
    const divergedRow = page.locator("tr").filter({ hasText: "ds-tpex-quote-v1" });
    await expect(divergedRow.getByText(/diverged|分歧/i)).toBeVisible();

    // Open Detail Drawer for TWSE source
    const viewBtn = twseRow.getByRole("button", { name: /view|檢視/i });
    await viewBtn.click();

    // Detail Drawer Assertions (scoped to dialog)
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "ds-twse-market-v1" })).toBeVisible();

    // Switch to Config Tab to assert secret reference security
    const configTab = drawer.getByRole("tab", { name: /Config|連線與設定/i });
    await configTab.click();
    await expect(drawer.getByText("vault://secret/twse-api-key")).toBeVisible();
    await expect(
      drawer.getByText(/Secrets are stored securely|以 ID 參考|金鑰保存庫/i),
    ).toBeVisible();

    // Switch to Desired vs Observed Tab
    const desiredObservedTab = drawer.getByRole("tab", { name: /Desired vs Observed|目標與觀測/i });
    await desiredObservedTab.click();
    await expect(drawer.getByText(/Desired State|設定目標意圖/i)).toBeVisible();
    await expect(drawer.getByText(/Observed State|即時觀測事實/i)).toBeVisible();
    await expect(drawer.getByText("converged")).toBeVisible();

    // Check Action Buttons in Drawer are disabled when writes are off
    const validateBtn = drawer.getByRole("button", { name: /Validate|驗證設定/i }).first();
    await expect(validateBtn).toBeVisible();
    await expect(validateBtn).toBeDisabled();
  });

  test("tabs navigation: Catalog, Runs & Health, Change History", async ({ page }) => {
    await setupStandardFixtures(page);

    // 1. Catalog Tab
    await page.goto("/management/data-sources?tab=catalog");
    await expect(page.getByText(/Phase 1 (Offline Development Intake|離線開發需求)/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Download.*Need|下載需求/i })).toBeVisible();

    // 2. Runs & Health Tab
    await page.goto("/management/data-sources?tab=runs");
    await expect(page.getByText(/Bounded Read-Only Canary Pulls|受限唯讀金絲雀拉取/i)).toBeVisible();
    await expect(page.getByText(/Observation & Ingestion History|觀測與擷取歷史記錄/i)).toBeVisible();
    await expect(page.getByTestId("runs-quota-usage-card")).toBeVisible();
    await expect(page.getByText(/Unresolved DLQ Items|未解析死信佇列/i)).toBeVisible();

    // 3. Change History Tab
    await page.goto("/management/data-sources?tab=receipts");
    await expect(page.getByRole("heading", { name: /Command Receipts Ledger|指令收據稽核帳冊/i })).toBeVisible();
  });

  test("accessibility and keyboard focus navigation", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Ensure main section has aria-label
    const section = page.locator('section[aria-label="Data Source Management"], section[aria-label="資料源管理"]');
    await expect(section).toBeVisible();

    // Keyboard Tab navigation to interactive element
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    await expect(focused).toBeFocused();

    // Open Detail Drawer and verify dialog role and escape key closes it
    const viewBtn = page.getByRole("button", { name: /view|檢視/i }).first();
    await viewBtn.click();
    const drawerDialog = page.getByRole("dialog");
    await expect(drawerDialog).toBeVisible();
    await expect(drawerDialog.getByRole("heading", { name: "ds-twse-market-v1" })).toBeVisible();

    // Test tab key inside drawer navigates to close button or tab list
    await page.keyboard.press("Tab");
    const drawerFocused = page.locator(":focus");
    await expect(drawerFocused).toBeVisible();

    // Escape closes drawer
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Desired vs Observed|目標與觀測/i)).toBeHidden();
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
    await expect(page.getByText(/No Data Sources Configured|尚未設定資料源/i)).toBeVisible();

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
    await expect(page.getByText(/Live data sources unavailable|目前沒有 live 資料源資料/i)).toBeVisible();

    // 3. Degraded-Legacy
    await page.route("**/bff/management/data-sources", async (route) => {
      if (route.request().url().endsWith("/data-sources")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              items: [MOCK_V2_DATA_SOURCE],
              count: 1,
            },
            meta: { status: "degraded", source: "legacy_projection" },
            page_info: { total_count: 1 },
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/management/data-sources");
    await expect(page.getByTestId("degraded-legacy-banner")).toBeVisible();
    await expect(page.getByText(/Legacy Compatibility Projection Mode|舊版相容投影模式/i)).toBeVisible();
    await expect(page.getByText(/Data source rows are projected from legacy fleet state|部分資料源紀錄來自舊版 Fleet 狀態投影/i)).toBeVisible();
  });

  test("detail drawer schedule change gating when real writes are off", async ({ page }) => {
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Open Drawer
    const viewBtn = page.getByRole("button", { name: /view|檢視/i }).first();
    await viewBtn.click();

    // Go to Schedule tab
    const scheduleTab = page.getByRole("tab", { name: /Schedule|排程/i });
    await scheduleTab.click();

    // Verify Change Schedule button in schedule tabpanel is disabled with read-only tooltip
    const changeScheduleBtn = page.getByRole("tabpanel").getByRole("button", { name: /Change Schedule|修改排程/i });
    await expect(changeScheduleBtn).toBeVisible();
    await expect(changeScheduleBtn).toBeDisabled();
    await expect(changeScheduleBtn).toHaveAttribute(
      "title",
      /Real writes are disabled|實體寫入已停用/,
    );
  });

  test("responsive narrow viewport adaptation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupStandardFixtures(page);
    await page.goto("/management/data-sources");

    // Verify header and table scroll wrapper on narrow screen
    await expect(page.getByRole("heading", { name: /Data Source Management|資料源管理/i })).toBeVisible();
    await expect(page.locator(".overflow-x-auto, [data-testid='table-scroll']").first()).toBeVisible();

    // Verify tabs still switchable
    const catalogTab = page.getByRole("tab", { name: /Catalog|連接器目錄/i });
    await catalogTab.click();
    await expect(page.getByText(/Phase 1 (Offline Development Intake|離線開發需求)/i)).toBeVisible();
  });
});
