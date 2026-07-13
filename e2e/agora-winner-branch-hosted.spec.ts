/**
 * AG-DYNUI-FULL-006 - hosted live Winner Branch gate.
 *
 * This spec exercises the deployed/live BFF contract through the real Agora UI.
 * It does not intercept, replace, or synthesize any Agora BFF response. Set
 * AG_DYNUI_FULL_006_HOSTED=1 with an explicit short-lived BFF auth token to run.
 */

import { expect, test, type APIRequestContext, type APIResponse, type Locator, type Page, type Request } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { installOidcDevLogin, normalizeBearerToken } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE_URL =
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io";
const BFF_BASE_URL =
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";
const RAW_AUTH_TOKEN =
  process.env.BFF_AUTH_TOKEN ||
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  "";
const AUTH_TOKEN = RAW_AUTH_TOKEN ? normalizeBearerToken(RAW_AUTH_TOKEN) : "";
const HOSTED_REQUESTED =
  process.env.AG_DYNUI_FULL_006_HOSTED === "1" ||
  process.env.PANTHEON_HOSTED_E2E === "1";
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp";
const LIVE_GET_ATTEMPTS = 3;
const LIVE_GET_TIMEOUT_MS = 20_000;
const LIVE_MUTATION_TIMEOUT_MS = 90_000;
const WINNER_FLOW_TIMEOUT_MS = 420_000;

if (HOSTED_REQUESTED && !AUTH_TOKEN) {
  throw new Error(
    "AG-DYNUI-FULL-006 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN",
  );
}

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

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, attempt * 500));
}

async function getJson(request: APIRequestContext, path: string): Promise<JsonRecord> {
  let lastTransportError: unknown;
  for (let attempt = 1; attempt <= LIVE_GET_ATTEMPTS; attempt += 1) {
    let res: APIResponse;
    try {
      res = await request.get(`${BFF_BASE_URL}${path}`, {
        headers: authHeaders(),
        timeout: LIVE_GET_TIMEOUT_MS,
      });
    } catch (error) {
      lastTransportError = error;
      if (attempt === LIVE_GET_ATTEMPTS) throw error;
      await retryDelay(attempt);
      continue;
    }

    if (res.ok()) return (await res.json()) as JsonRecord;

    const status = res.status();
    const retryable = status >= 500 && status <= 599;
    await res.dispose();
    if (!retryable || attempt === LIVE_GET_ATTEMPTS) {
      throw new Error(`${path} returned ${status}`);
    }
    await retryDelay(attempt);
  }
  throw lastTransportError instanceof Error
    ? lastTransportError
    : new Error(`${path} failed without a response`);
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

async function preparePointerAction(button: Locator): Promise<void> {
  await expect(button).toBeVisible({ timeout: 20_000 });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await button.click({ timeout: 5_000, trial: true });
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
    .filter((event) => event.status !== undefined && event.status >= 200 && event.status < 300)
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
  test.skip(
    !HOSTED_REQUESTED,
    "Set AG_DYNUI_FULL_006_HOSTED=1 and an explicit short-lived BFF_AUTH_TOKEN.",
  );
  test.describe.configure({ retries: 0 });
  test.setTimeout(WINNER_FLOW_TIMEOUT_MS);

  test("live readiness cards to Trading Room workspace, widget revision, version history, and rollback", async ({
    page,
    request,
  }, testInfo) => {
    const evidenceScreenshots: string[] = [];
    const events = collectNetwork(page);

    const live = await discoverReadyWorkshop(request);

    await installQuietEventSource(page);
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
      const proposalPath = `/bff/agora/strategies/${encodeURIComponent(live.workshop.strategy_id)}/trading-room/proposals`;
      const proposalResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST" && url.pathname === proposalPath;
      }, { timeout: LIVE_MUTATION_TIMEOUT_MS });
      await addButton.click();
      await expect(page).toHaveURL(new RegExp(`/agora/trading-room/${live.workshop.strategy_id}`), { timeout: 20_000 });
      const proposalResponse = await proposalResponsePromise;
      expect(
        proposalResponse.ok(),
        `live workspace proposal returned ${proposalResponse.status()} for ${proposalPath}`,
      ).toBe(true);
    });

    await test.step("generate and accept a live workspace proposal", async () => {
      await expect(page.getByTestId("workspace-proposal-preview")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("workspace-proposal-personalization")).toBeVisible();
      await screenshot(page, testInfo, "02-live-workspace-proposal", evidenceScreenshots);
      const proposalAcceptPath = `/bff/agora/strategies/${encodeURIComponent(live.workshop.strategy_id)}/trading-room/proposals/`;
      const acceptResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        const proposalSuffix = url.pathname.startsWith(proposalAcceptPath)
          ? url.pathname.slice(proposalAcceptPath.length)
          : "";
        return response.request().method() === "POST" && /^[^/]+\/accept$/.test(proposalSuffix);
      }, { timeout: LIVE_MUTATION_TIMEOUT_MS });
      await page.getByTestId("workspace-proposal-accept").click();
      const acceptResponse = await acceptResponsePromise;
      expect(
        acceptResponse.ok(),
        `live workspace proposal accept returned ${acceptResponse.status()} for ${new URL(acceptResponse.url()).pathname}`,
      ).toBe(true);
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
      const layoutResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "PATCH"
          && /^\/bff\/agora\/trading-room\/workspaces\/[^/]+\/layout$/.test(url.pathname);
      }, { timeout: LIVE_MUTATION_TIMEOUT_MS });
      await page.getByTestId("workspace-save-layout").click();
      const layoutResponse = await layoutResponsePromise;
      expect(
        layoutResponse.ok(),
        `live workspace layout returned ${layoutResponse.status()} for ${new URL(layoutResponse.url()).pathname}`,
      ).toBe(true);
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText(/Dashboard v2/, { timeout: 30_000 });
      await screenshot(page, testInfo, "05-live-grid-saved-v2", evidenceScreenshots);
    });

    await test.step("create a live widget revision and keep original plus modified copy", async () => {
      await page.getByTestId(`workspace-widget-${widgetId}`).click();
      await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("workspace-widget-revision-input").fill("改成表格並聚焦 readiness gate、dashboard version、evidence coverage");
      const revisionProposalResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && /^\/bff\/agora\/trading-room\/workspaces\/[^/]+\/widgets\/[^/]+\/revision-proposals$/.test(url.pathname);
      }, { timeout: LIVE_MUTATION_TIMEOUT_MS });
      await page.getByTestId("workspace-widget-revision-submit").click();
      const revisionProposalResponse = await revisionProposalResponsePromise;
      expect(
        revisionProposalResponse.ok(),
        `live widget revision proposal returned ${revisionProposalResponse.status()} for ${new URL(revisionProposalResponse.url()).pathname}`,
      ).toBe(true);
      await expect(page.getByTestId("workspace-widget-before-after-diff")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("workspace-widget-revision-proposal")).toBeVisible({ timeout: 20_000 });
      await screenshot(page, testInfo, "06-live-widget-revision-preview", evidenceScreenshots);
      const revisionAcceptResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && /^\/bff\/agora\/trading-room\/widget-revision-proposals\/[^/]+\/accept$/.test(url.pathname);
      }, { timeout: LIVE_MUTATION_TIMEOUT_MS });
      await page.getByTestId("workspace-widget-revision-keep-copy").click();
      const revisionAcceptResponse = await revisionAcceptResponsePromise;
      expect(
        revisionAcceptResponse.ok(),
        `live widget revision accept returned ${revisionAcceptResponse.status()} for ${new URL(revisionAcceptResponse.url()).pathname}`,
      ).toBe(true);
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
      const rollbackTestId = await rollbackButton.getAttribute("data-testid");
      const rollbackVersionId = rollbackTestId?.replace("workspace-rollback-", "");
      expect(rollbackVersionId, "rollback target version id").toBeTruthy();
      await preparePointerAction(rollbackButton);
      const rollbackResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && url.pathname.includes("/bff/agora/trading-room/workspaces/")
          && url.pathname.endsWith(`/versions/${encodeURIComponent(rollbackVersionId as string)}/rollback`);
      }, { timeout: LIVE_MUTATION_TIMEOUT_MS });
      await rollbackButton.click({ timeout: 10_000 });
      const rollbackResponse = await rollbackResponsePromise;
      expect(
        rollbackResponse.ok(),
        `live rollback returned ${rollbackResponse.status()} for ${new URL(rollbackResponse.url()).pathname}`,
      ).toBe(true);
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText("Dashboard v4", { timeout: 30_000 });
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
