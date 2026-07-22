/**
 * AG-UIPOL-006 hosted acceptance.
 *
 * Read-only shell checks require AG_UIPOL_006_HOSTED=1. The version-mutating
 * layout check additionally requires AG_UIPOL_006_LAYOUT_WRITE=1 and never
 * retries, so a failed run cannot silently append another dashboard version.
 */

import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE_URL = (
  process.env.AG_UIPOL_006_FE_BASE_URL ||
  process.env.PANTHEON_FE_BASE_URL ||
  ""
).replace(/\/+$/, "");
const BFF_BASE_URL = (
  process.env.AG_UIPOL_006_BFF_BASE_URL ||
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io"
).replace(/\/+$/, "");
const AUTH_TOKEN =
  process.env.BFF_AUTH_TOKEN ||
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  process.env.VITE_BFF_DEV_BEARER_TOKEN ||
  "pantheon-dev-browser:operator,reviewer,approver,risk_owner,admin:mfa";
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EXPECTED_COMMIT = process.env.AG_UIPOL_006_EXPECTED_COMMIT || "";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/ag-uipol-006";
const HOSTED_ENABLED = process.env.AG_UIPOL_006_HOSTED === "1" && Boolean(
  FE_BASE_URL && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/iu.test(FE_BASE_URL),
);
const LAYOUT_WRITE_ENABLED = HOSTED_ENABLED && process.env.AG_UIPOL_006_LAYOUT_WRITE === "1";

const FORBIDDEN_PATHS = [
  /\/bff\/orders?\b/iu,
  /\/bff\/broker/iu,
  /\/bff\/capital(?:-binding|\/bind)/iu,
  /\/bff\/runtime-binding/iu,
];
const MANAGEMENT_PATH = /\/bff\/management(?:\/|$)/iu;
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type JsonRecord = Record<string, unknown>;

interface NetworkEvent {
  idempotencyKey?: string;
  ifMatch?: string;
  method: string;
  path: string;
  status?: number;
  url: string;
}

interface ReadyWorkshop {
  assessmentId: string;
  strategyId: string;
  strategyVersion: string;
  workshopId: string;
}

function recordFrom(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function dataFrom(value: unknown): unknown {
  const root = recordFrom(value);
  return root.data ?? value;
}

function itemsFrom(value: unknown): JsonRecord[] {
  const data = dataFrom(value);
  if (Array.isArray(data)) return data.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
  const record = recordFrom(data);
  for (const key of ["items", "workshops", "results"]) {
    const items = record[key];
    if (Array.isArray(items)) return items.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
  }
  return [];
}

function authHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "X-Request-Id": `ag-uipol-006-${randomUUID()}`,
    "X-Tenant-Id": TENANT_ID,
  };
}

async function getJson(request: APIRequestContext, path: string): Promise<JsonRecord> {
  const response = await request.get(`${BFF_BASE_URL}${path}`, {
    headers: authHeaders(),
    timeout: 30_000,
  });
  if (!response.ok()) throw new Error(`${path} returned ${response.status()}`);
  return await response.json() as JsonRecord;
}

async function discoverReadyWorkshop(request: APIRequestContext): Promise<ReadyWorkshop> {
  const workshops = itemsFrom(await getJson(request, "/bff/agora/workshops?limit=50"));
  for (const workshop of workshops) {
    const workshopId = String(workshop.workshop_id ?? "");
    const strategyId = String(workshop.strategy_id ?? "");
    const strategyVersion = String(workshop.active_strategy_spec_registry_id ?? "");
    if (!workshopId || !strategyId || !strategyVersion) continue;

    const readiness = recordFrom(dataFrom(await getJson(
      request,
      `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness`,
    )));
    if (readiness.highest_ready_gate !== "trading_room") continue;
    return {
      assessmentId: String(readiness.assessment_id ?? "hosted-ready"),
      strategyId,
      strategyVersion,
      workshopId,
    };
  }
  throw new Error("No live workshop currently satisfies the trading_room readiness gate.");
}

function collectNetwork(page: Page): NetworkEvent[] {
  const events: NetworkEvent[] = [];
  page.on("request", (request: Request) => {
    if (!request.url().includes("/bff/")) return;
    const headers = request.headers();
    events.push({
      idempotencyKey: headers["idempotency-key"] || headers["x-idempotency-key"],
      ifMatch: headers["if-match"],
      method: request.method(),
      path: new URL(request.url()).pathname,
      url: request.url(),
    });
  });
  page.on("response", (response) => {
    if (!response.url().includes("/bff/")) return;
    const match = [...events].reverse().find((event) => event.url === response.url() && event.status === undefined);
    if (match) match.status = response.status();
  });
  return events;
}

function assertNoExecutionRoutes(events: NetworkEvent[]): void {
  for (const event of events) {
    if (MANAGEMENT_PATH.test(event.path)) {
      expect(
        READ_ONLY_METHODS.has(event.method),
        `forbidden Management write route: ${event.method} ${event.path}`,
      ).toBe(true);
    }
    for (const forbidden of FORBIDDEN_PATHS) {
      expect(event.path, `forbidden execution route: ${event.method} ${event.path}`).not.toMatch(forbidden);
    }
  }
}

async function preparePage(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await installOidcDevLogin(page, {
    goto: false,
    pageBaseUrl: FE_BASE_URL,
    tenantId: TENANT_ID,
    token: AUTH_TOKEN,
  });
  await installQuietEventSource(page);
}

async function assertDeployment(request: APIRequestContext): Promise<JsonRecord> {
  const response = await request.get(`${FE_BASE_URL}/deployment.json`, { timeout: 20_000 });
  expect(response.ok(), "hosted deployment manifest").toBe(true);
  const manifest = await response.json() as JsonRecord;
  if (EXPECTED_COMMIT) expect(manifest.commit).toBe(EXPECTED_COMMIT);
  const buildMode = recordFrom(manifest.buildMode);
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(buildMode.VITE_BFF_REAL_WRITES).toBe("false");
  expect(buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES).toBe("false");
  return manifest;
}

async function assertOneScrollOwner(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('[data-testid="trading-desk-main"]');
    const shell = document.querySelector<HTMLElement>('[data-testid="agora-standalone-shell"]');
    const command = document.querySelector<HTMLElement>('[data-testid="trading-desk-command-bar"]');
    const tabs = document.querySelector<HTMLElement>('[data-testid="trading-desk-tab-bar"]');
    if (!main || !shell || !command || !tabs) throw new Error("Agora shell was not rendered");
    return {
      bodyHeight: document.body.scrollHeight,
      commandHeight: Math.round(command.getBoundingClientRect().height),
      mainOverflowX: getComputedStyle(main).overflowX,
      mainOverflowY: getComputedStyle(main).overflowY,
      shellOverflow: getComputedStyle(shell).overflow,
      tabsHeight: Math.round(tabs.getBoundingClientRect().height),
      viewportHeight: window.innerHeight,
    };
  });
  expect(layout.commandHeight).toBe(60);
  expect(layout.tabsHeight).toBe(52);
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.shellOverflow).toBe("hidden");
  expect(layout.mainOverflowX).toBe("hidden");
  expect(layout.mainOverflowY).toBe("auto");
}

async function saveEvidence(page: Page, name: string, payload: JsonRecord): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
  writeFileSync(`${EVIDENCE_DIR}/${name}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test.describe("AG-UIPOL-006 hosted shell and Servant", () => {
  test.skip(!HOSTED_ENABLED, "Set AG_UIPOL_006_HOSTED=1 and AG_UIPOL_006_FE_BASE_URL to the deployed FE.");
  test.setTimeout(120_000);

  for (const viewport of [
    { height: 900, name: "desktop-1280", width: 1280 },
    { height: 844, name: "mobile-390", width: 390 },
  ]) {
    test(`${viewport.name} renders the shared desk truthfully`, async ({ page, request }) => {
      const manifest = await assertDeployment(request);
      const events = collectNetwork(page);
      await preparePage(page, viewport.width, viewport.height);

      for (const path of ["/agora/trading-room", "/agora/strategy-workshop", "/agora/strategy-performance"]) {
        await page.goto(`${FE_BASE_URL}${path}`);
        await expect(page.getByTestId("trading-desk-command-bar")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("trading-desk-tab-bar")).toBeVisible();
        await assertOneScrollOwner(page);
      }

      if (viewport.width === 1280) {
        await page.goto(`${FE_BASE_URL}/agora/trading-room`);
        await page.getByTestId("trading-desk-command-input").fill("Review the current risk evidence and limits");
        const askResponsePromise = page.waitForResponse((response) => (
          response.request().method() === "POST" && new URL(response.url()).pathname === "/bff/agora/ask"
        ));
        await page.getByTestId("trading-desk-command-submit").click();
        expect((await askResponsePromise).ok()).toBe(true);
        await expect(page.getByTestId("trading-desk-command-result")).toBeVisible();
        await expect(page.getByTestId("servant-task-sections")).toBeVisible();
      }

      await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`);
      await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: /交易僕人|servant/iu }).first().click();
      await expect(page.getByTestId("servant-task-composer")).toBeVisible();
      await expect(page.getByTestId("servant-current-context")).toBeVisible();

      await page.getByRole("button", { name: /工作|jobs/iu }).click();
      await expect(page.getByTestId("trading-desk-bottom-panel-jobs")).toBeVisible();
      await page.getByRole("button", { name: /影子模式|shadow/iu }).click();
      await expect(page.getByTestId("trading-desk-bottom-panel-shadow")).toBeVisible();
      await page.getByRole("button", { name: /日誌|journal/iu }).click();
      await expect(page.getByTestId("trading-desk-bottom-panel-journal")).toBeVisible();

      assertNoExecutionRoutes(events);
      await saveEvidence(page, `ag-uipol-006-${viewport.name}`, {
        commit: manifest.commit,
        request_paths: events.map(({ method, path, status }) => ({ method, path, status })),
        task_id: "AG-UIPOL-006",
        viewport,
      });
    });
  }
});

test.describe("AG-UIPOL-006 hosted governed layout write", () => {
  test.describe.configure({ retries: 0 });
  test.skip(!LAYOUT_WRITE_ENABLED, "Set AG_UIPOL_006_LAYOUT_WRITE=1 to authorize the safe dev workspace layout write.");
  test.setTimeout(180_000);

  test("previews, rejects, then applies one versioned whole-workspace layout", async ({ page, request }) => {
    const manifest = await assertDeployment(request);
    const ready = await discoverReadyWorkshop(request);
    const events = collectNetwork(page);
    await preparePage(page, 1280, 900);

    const query = new URLSearchParams({
      readinessAssessmentId: ready.assessmentId,
      readinessGate: "trading_room",
      strategyVersion: ready.strategyVersion,
      workshopId: ready.workshopId,
    });
    await page.goto(`${FE_BASE_URL}/agora/trading-room/${encodeURIComponent(ready.strategyId)}?${query}`);
    const proposalPreview = page.getByTestId("workspace-proposal-preview");
    const workspaceShell = page.getByTestId("trading-room-workspace-shell");
    await expect(proposalPreview.or(workspaceShell).first()).toBeVisible({ timeout: 45_000 });
    const proposalFirst = await proposalPreview.isVisible();
    await expect(page.getByTestId("workspace-proposal-preview-first")).toHaveCount(0);

    if (!proposalFirst && await page.getByTestId("workspace-view-chooser").isVisible()) {
      await page.getByTestId("workspace-view-chooser").getByRole("button").first().click();
      await expect(page.getByTestId("workspace-control-strip")).toBeVisible();
    }

    const initialDashboardVersion = proposalFirst
      ? null
      : Number((await page.getByTestId("workspace-dashboard-version").textContent())?.match(/Dashboard v(\d+)/u)?.[1]);
    if (!proposalFirst) expect(initialDashboardVersion, "accepted workspace dashboard version").toBeGreaterThan(0);
    const proposalEntry = proposalFirst
      ? page.getByTestId("workspace-proposal-adjust-layout")
      : page.getByTestId("workspace-request-layout-proposal");

    const openAndGenerate = async () => {
      await proposalEntry.click();
      await expect(page.getByTestId("workspace-layout-proposal-drawer")).toBeVisible();
      await page.getByTestId("workspace-layout-proposal-chip-single_column").click();
      await page.getByTestId("workspace-layout-proposal-generate").click();
      await expect(page.getByTestId("workspace-layout-proposal-preview")).toBeVisible();
      expect(await page.locator('[data-testid$="-before"][data-testid^="workspace-layout-proposal-view-"]').count()).toBeGreaterThan(0);
      await expect(page.getByTestId("workspace-layout-proposal-apply")).toBeEnabled();
    };

    await openAndGenerate();
    await page.getByTestId("workspace-layout-proposal-reject").click();
    await expect(page.getByTestId("workspace-layout-proposal-drawer")).toBeHidden();
    expect(events.filter((event) => event.method === "PATCH" && event.path.endsWith("/layout"))).toHaveLength(0);

    await openAndGenerate();
    await page.getByTestId("workspace-layout-proposal-apply").click();
    await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({ timeout: 45_000 });
    const expectedDashboardVersion = proposalFirst ? 2 : initialDashboardVersion + 1;
    let repreviewedAcceptedWorkspace = false;

    if (proposalFirst) {
      const firstApplyOutcome = await (await page.waitForFunction((expectedVersion) => {
        const version = document.querySelector<HTMLElement>('[data-testid="workspace-dashboard-version"]');
        if (version?.textContent?.includes(expectedVersion)) return "applied";
        const drawerError = document.querySelector('[data-testid="workspace-layout-proposal-drawer"] [role="alert"]');
        return drawerError ? "repreview_required" : false;
      }, `Dashboard v${expectedDashboardVersion}`, { timeout: 45_000 })).jsonValue();

      if (firstApplyOutcome === "repreview_required") {
        repreviewedAcceptedWorkspace = true;
        expect(events.filter((event) => event.method === "POST" && event.path.endsWith("/accept"))).toHaveLength(1);
        expect(events.filter((event) => event.method === "PATCH" && event.path.endsWith("/layout"))).toHaveLength(0);
        await expect(page.getByTestId("workspace-layout-proposal-generate")).toBeEnabled();
        await page.getByTestId("workspace-layout-proposal-generate").click();
        await expect(page.getByTestId("workspace-layout-proposal-preview")).toBeVisible();
        await expect(page.getByTestId("workspace-layout-proposal-apply")).toBeEnabled();
        await page.getByTestId("workspace-layout-proposal-apply").click();
      }
    }

    await expect(page.getByTestId("workspace-dashboard-version")).toHaveText(
      new RegExp(`Dashboard v${expectedDashboardVersion}`, "u"),
      { timeout: 45_000 },
    );

    const acceptEvents = events.filter((event) => event.method === "POST" && event.path.endsWith("/accept"));
    const layoutEvents = events.filter((event) => event.method === "PATCH" && event.path.endsWith("/layout"));
    expect(acceptEvents).toHaveLength(proposalFirst ? 1 : 0);
    expect(layoutEvents).toHaveLength(1);
    if (proposalFirst) expect(acceptEvents[0].idempotencyKey).toBeTruthy();
    expect(layoutEvents[0].idempotencyKey).toBeTruthy();
    expect(layoutEvents[0].ifMatch).toBeTruthy();
    expect(layoutEvents[0].status).toBeGreaterThanOrEqual(200);
    expect(layoutEvents[0].status).toBeLessThan(300);
    if (proposalFirst) expect(events.indexOf(acceptEvents[0])).toBeLessThan(events.indexOf(layoutEvents[0]));
    assertNoExecutionRoutes(events);

    await saveEvidence(page, "ag-uipol-006-layout-applied", {
      commit: manifest.commit,
      request_paths: events.map(({ idempotencyKey, ifMatch, method, path, status }) => ({
        has_idempotency_key: Boolean(idempotencyKey),
        has_if_match: Boolean(ifMatch),
        method,
        path,
        status,
      })),
      initial_dashboard_version: initialDashboardVersion,
      proposal_first: proposalFirst,
      repreviewed_accepted_workspace: repreviewedAcceptedWorkspace,
      strategy_id: ready.strategyId,
      task_id: "AG-UIPOL-006",
      workshop_id: ready.workshopId,
    });
  });
});
