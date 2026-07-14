/**
 * AG-DYNUI-FULL-006 - hosted live Winner Branch gate.
 *
 * This spec exercises the deployed/live BFF contract through the real Agora UI.
 * It does not intercept, replace, or synthesize any Agora BFF response.
 */

import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { installOidcDevLogin, roleTokenFromEnv } from "./helpers/auth";

const FE_BASE_URL =
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io";
const BFF_BASE_URL =
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";
const AUTH_TOKEN = roleTokenFromEnv("operator", [
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp";

const REQUIRED_CARD_TYPES = ["user_strategy_description", "completeness_update", "readiness_gate"];
const REQUIRED_BFF_PATHS = [
  "/bff/agora/workshops",
  "/cards",
  "/readiness",
  "/bff/agora/trading-room",
  "/trading-room/proposals",
  "/layout",
  "/revision-proposals",
  "/versions",
  "/rollback",
];
const FORBIDDEN_EXECUTION_PATHS = [
  /\/bff\/orders?\b/i,
  /\/bff\/broker/i,
  /\/bff\/capital(?!-pool)/i,
  /\/bff\/runtime-binding/i,
  /\/bff\/management/i,
];
const FORBIDDEN_EXECUTION_TEXT = [
  /\bdirect order\b/i,
  /\bbroker\b/i,
  /\bcapital binding\b/i,
  /\bruntimebinding\b/i,
];

type JsonRecord = Record<string, unknown>;

type ReadyWorkshop = {
  active_strategy_spec_registry_id: string;
  strategy_id: string;
  workshop_id: string;
};

type NetworkEvent = {
  auth: "absent" | "present";
  method: string;
  path: string;
  status?: number;
  url: string;
};

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "X-Tenant-Id": TENANT_ID,
    "X-Request-Id": `ag-dynui-full-006-${randomUUID()}`,
    ...extra,
  };
}

function recordFrom(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function dataFrom(value: unknown): unknown {
  const root = recordFrom(value);
  return root.data ?? value;
}

function arrayData(value: unknown): JsonRecord[] {
  const data = dataFrom(value);
  if (Array.isArray(data)) return data.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
  const record = recordFrom(data);
  for (const key of ["items", "cards", "workshops", "results"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
  }
  return [];
}

async function getJson(request: APIRequestContext, path: string): Promise<JsonRecord> {
  const res = await request.get(`${BFF_BASE_URL}${path}`, {
    headers: authHeaders(),
  });
  expect(res.ok(), `${path} returned ${res.status()}`).toBe(true);
  return (await res.json()) as JsonRecord;
}

async function discoverReadyWorkshop(request: APIRequestContext): Promise<{
  cards: JsonRecord[];
  readiness: JsonRecord;
  workshop: ReadyWorkshop;
}> {
  const workshopsBody = await getJson(request, "/bff/agora/workshops?limit=50");
  const workshops = arrayData(workshopsBody);
  const candidates = workshops.filter((item) =>
    typeof item.workshop_id === "string" &&
    typeof item.strategy_id === "string" &&
    typeof item.active_strategy_spec_registry_id === "string",
  );

  for (const candidate of candidates) {
    const workshopId = String(candidate.workshop_id);
    const readinessBody = await getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness`);
    const readiness = recordFrom(dataFrom(readinessBody));
    if (readiness.highest_ready_gate !== "trading_room") continue;

    const cardsBody = await getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/cards`);
    const cards = arrayData(cardsBody);
    const cardTypes = new Set(cards.map((card) => String(card.card_type)));
    if (!REQUIRED_CARD_TYPES.every((type) => cardTypes.has(type))) continue;

    return {
      cards,
      readiness,
      workshop: {
        active_strategy_spec_registry_id: String(candidate.active_strategy_spec_registry_id),
        strategy_id: String(candidate.strategy_id),
        workshop_id: workshopId,
      },
    };
  }

  throw new Error("No live workshop currently has trading_room readiness plus required cards.");
}

function collectNetwork(page: Page): NetworkEvent[] {
  const events: NetworkEvent[] = [];
  page.on("request", (req: Request) => {
    const url = req.url();
    if (!url.includes("/bff/")) return;
    const parsed = new URL(url);
    const headers = req.headers();
    events.push({
      auth: headers.authorization ? "present" : "absent",
      method: req.method(),
      path: parsed.pathname,
      url,
    });
  });
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/bff/")) return;
    const parsed = new URL(url);
    const prior = [...events].reverse().find((event) => event.url === url && event.status === undefined);
    if (prior) prior.status = res.status();
    else {
      events.push({
        auth: "absent",
        method: res.request().method(),
        path: parsed.pathname,
        status: res.status(),
        url,
      });
    }
  });
  return events;
}

async function firstWidgetId(page: Page): Promise<string> {
  const firstCell = page.locator('[data-testid^="workspace-grid-cell-"]').first();
  await expect(firstCell).toBeVisible({ timeout: 20_000 });
  const testId = await firstCell.getAttribute("data-testid");
  const widgetId = testId?.replace("workspace-grid-cell-", "");
  expect(widgetId, "first workspace widget id").toBeTruthy();
  return widgetId as string;
}

async function screenshot(page: Page, testInfo: { project: { name: string } }, name: string, paths: string[]): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const viewport = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  const path = `${EVIDENCE_DIR}/ag-dynui-full-006-${name}-${viewport}.png`;
  await page.screenshot({ path, fullPage: true });
  paths.push(path);
}

function assertNoExecutionLeakage(events: NetworkEvent[], bodyText: string): void {
  for (const event of events) {
    for (const pattern of FORBIDDEN_EXECUTION_PATHS) {
      expect(event.path, `execution-plane BFF path must not be called: ${event.url}`).not.toMatch(pattern);
    }
  }
  for (const pattern of FORBIDDEN_EXECUTION_TEXT) {
    expect(bodyText, `execution-plane copy must not leak: ${pattern}`).not.toMatch(pattern);
  }
}

function isSameOriginEventStream(event: NetworkEvent): boolean {
  const parsed = new URL(event.url);
  return event.method === "GET" && event.path.endsWith("/stream") && parsed.origin === FE_BASE_URL;
}

function assertRequiredNetwork(events: NetworkEvent[]): void {
  const successfulPaths = events
    .filter((event) => event.status === undefined || (event.status >= 200 && event.status < 300))
    .map((event) => event.path);
  for (const required of REQUIRED_BFF_PATHS) {
    expect(
      successfulPaths.some((path) => path.includes(required)),
      `required live BFF path was not observed: ${required}`,
    ).toBe(true);
  }

  const agoraRequests = events.filter((event) => event.path.includes("/bff/agora/"));
  expect(agoraRequests.length, "Agora BFF requests observed").toBeGreaterThan(0);
  for (const event of agoraRequests) {
    if (isSameOriginEventStream(event)) continue;
    expect(event.auth, `Agora BFF request must carry Authorization: ${event.url}`).toBe("present");
    if (event.status !== undefined) {
      expect(event.status, `Agora BFF request failed: ${event.url}`).toBeGreaterThanOrEqual(200);
      expect(event.status, `Agora BFF request failed: ${event.url}`).toBeLessThan(300);
    }
  }
}

test.describe("AG-DYNUI-FULL-006 hosted live Winner Branch gate", () => {
  test.skip(!AUTH_TOKEN, "Requires an explicit or RBAC-matrix operator token.");
  test.setTimeout(180_000);

  test("live readiness cards to Trading Room workspace, widget revision, version history, and rollback", async ({
    page,
    request,
  }, testInfo) => {
    const evidenceScreenshots: string[] = [];
    const events = collectNetwork(page);

    const live = await discoverReadyWorkshop(request);

    await installOidcDevLogin(page, {
      pageBaseUrl: FE_BASE_URL,
      goto: false,
      tenantId: TENANT_ID,
      token: AUTH_TOKEN,
    });

    await test.step("open the live ready workshop and use its Trading Room handoff", async () => {
      await page.goto(`${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(live.workshop.workshop_id)}`);
      await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("workshop-readiness")).toHaveText("trading_room", { timeout: 20_000 });
      const addButton = page.getByTestId("add-to-trading-room-btn");
      await expect(addButton).toBeEnabled({ timeout: 20_000 });
      await screenshot(page, testInfo, "01-live-ready-workshop", evidenceScreenshots);
      await addButton.click();
      await expect(page).toHaveURL(new RegExp(`/agora/trading-room/${live.workshop.strategy_id}`), { timeout: 20_000 });
    });

    await test.step("generate and accept a live workspace proposal", async () => {
      await expect(page.getByTestId("workspace-proposal-preview")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("workspace-proposal-personalization")).toBeVisible();
      await screenshot(page, testInfo, "02-live-workspace-proposal", evidenceScreenshots);
      await page.getByTestId("workspace-proposal-accept").click();
      await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText(/Dashboard v1/, { timeout: 20_000 });
      await screenshot(page, testInfo, "03-live-workspace-accepted", evidenceScreenshots);
    });

    const widgetId = await firstWidgetId(page);

    await test.step("edit the grid and save a new live dashboard version", async () => {
      await page.getByTestId("workspace-edit-mode-toggle").click();
      await page.getByTestId(`workspace-widget-menu-${widgetId}`).click();
      await page.getByRole("button", { name: "複製 Widget" }).click();
      await expect(page.getByTestId("workspace-unsaved-bar")).toContainText("unsaved", { timeout: 10_000 });
      await screenshot(page, testInfo, "04-live-grid-unsaved", evidenceScreenshots);
      await page.getByTestId("workspace-save-layout").click();
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText(/Dashboard v2/, { timeout: 30_000 });
      await screenshot(page, testInfo, "05-live-grid-saved-v2", evidenceScreenshots);
    });

    await test.step("create a live widget revision and keep original plus modified copy", async () => {
      await page.getByTestId(`workspace-widget-${widgetId}`).click();
      await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("workspace-widget-revision-input").fill("改成表格並聚焦 readiness gate、dashboard version、evidence coverage");
      await page.getByTestId("workspace-widget-revision-submit").click();
      await expect(page.getByTestId("workspace-widget-before-after-diff")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("workspace-widget-revision-proposal")).toBeVisible({ timeout: 20_000 });
      await screenshot(page, testInfo, "06-live-widget-revision-preview", evidenceScreenshots);
      await page.getByTestId("workspace-widget-revision-keep-copy").click();
      await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeHidden({ timeout: 30_000 });
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText(/Dashboard v3/, { timeout: 30_000 });
      await screenshot(page, testInfo, "07-live-widget-revision-v3", evidenceScreenshots);
    });

    await test.step("verify version history and roll back through the live BFF", async () => {
      await expect(page.getByTestId("workspace-version-history")).toBeVisible({ timeout: 20_000 });
      const rollbackButtons = page.locator('[data-testid^="workspace-rollback-"]');
      await expect.poll(() => rollbackButtons.count(), {
        message: "version history should expose multiple rollback rows",
        timeout: 20_000,
      }).toBeGreaterThan(1);
      const rollbackButton = page.locator('[data-testid^="workspace-rollback-"]:not(:disabled)').first();
      await expect(rollbackButton).toBeVisible({ timeout: 20_000 });
      await screenshot(page, testInfo, "08-live-version-history", evidenceScreenshots);
      await rollbackButton.click();
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText(/Dashboard v[4-9][0-9]*/, { timeout: 30_000 });
      await screenshot(page, testInfo, "09-live-rollback-applied", evidenceScreenshots);
    });

    const bodyText = await page.locator("body").innerText();
    assertRequiredNetwork(events);
    assertNoExecutionLeakage(events, bodyText);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const viewport = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
    writeFileSync(
      `${EVIDENCE_DIR}/ag-dynui-full-006-live-summary-${viewport}.json`,
      JSON.stringify(
        {
          auth_actor: AUTH_TOKEN.split(":")[0],
          bff_base_url: BFF_BASE_URL,
          card_types: live.cards.map((card) => card.card_type),
          evidence_screenshots: evidenceScreenshots,
          fe_base_url: FE_BASE_URL,
          readiness_highest_gate: live.readiness.highest_ready_gate,
          request_paths: events.map((event) => ({ method: event.method, path: event.path, status: event.status })),
          strategy_id: live.workshop.strategy_id,
          strategy_version: live.workshop.active_strategy_spec_registry_id,
          task_id: "AG-DYNUI-FULL-006",
          tenant_id: TENANT_ID,
          workflow: [
            "live workshop readiness/cards",
            "Strategy Workshop Add to Trading Room handoff",
            "workspace proposal",
            "proposal accept",
            "grid edit save",
            "widget revision keep-copy",
            "version history",
            "rollback",
          ],
          workshop_id: live.workshop.workshop_id,
        },
        null,
        2,
      ),
    );
  });
});
