import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installContainedLoopbackAuth,
  installContainedLoopbackAuthAuthority,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";

const ARTIFACT_RECORDS = JSON.parse(
  readFileSync(new URL("./fixtures/artifact-hosted-273.json", import.meta.url), "utf8"),
) as Array<Record<string, unknown>>;

const HOSTED_PERSONAS_FIXTURE = JSON.parse(
  readFileSync(
    new URL("../src/lib/bff-v1/__tests__/fixtures/hosted-20261020/personas.json", import.meta.url),
    "utf8",
  ),
) as { data: Array<Record<string, unknown>>; meta: Record<string, unknown> };

const HOSTED_DEPLOYMENTS_FIXTURE = JSON.parse(
  readFileSync(
    new URL("../src/lib/bff-v1/__tests__/fixtures/hosted-20261020/deployments.json", import.meta.url),
    "utf8",
  ),
) as { data: Array<Record<string, unknown>>; meta: Record<string, unknown> };

const BASE_PERSONA = HOSTED_PERSONAS_FIXTURE.data[0];

const PERSONA_RECORDS: Array<Record<string, unknown>> = [
  {
    ...BASE_PERSONA,
    id: "persona-ee7112a829d38b9135ac",
    name: "衡岳｜2330 台股 Paper 學習 R2",
    state: "approved",
    risk: "low",
    archetype: "momentum",
    routedStrategies: 1,
    successRate: 0.0,
    lifecycleStatus: "paper_running",
    ownerLifecycleState: "paper_owner",
    paperLedgerId: "paper-ledger-a81b4fd15944698341aa",
    legacyPaperCapitalPoolId: "pool-persona-paper-a81b4fd15944698341aa",
    deploymentPlanId: "plan-persona-paper-a81b4fd15944698341aa",
    updatedAt: "2026-11-23T23:34:52Z",
  },
  {
    ...BASE_PERSONA,
    id: "persona-2448c7053e33ea48da47",
    name: "青禾｜2330 台股 Paper 學習 R2",
    state: "approved",
    risk: "low",
    archetype: "momentum",
    routedStrategies: 1,
    successRate: 0.0,
    lifecycleStatus: "paper_running",
    ownerLifecycleState: "paper_owner",
    paperLedgerId: "paper-ledger-06d4775a9b6a8f63b311",
    legacyPaperCapitalPoolId: "pool-persona-paper-06d4775a9b6a8f63b311",
    deploymentPlanId: "plan-persona-paper-06d4775a9b6a8f63b311",
    updatedAt: "2026-11-23T10:05:12Z",
  },
  {
    ...BASE_PERSONA,
    id: "persona-6507750312870d03a241",
    name: "澄川｜2330 台股 Paper 學習 R2",
    state: "approved",
    risk: "low",
    archetype: "momentum",
    routedStrategies: 1,
    successRate: 0.0,
    lifecycleStatus: "paper_running",
    ownerLifecycleState: "paper_owner",
    paperLedgerId: "paper-ledger-039ad01f8bcd2b4aa466",
    legacyPaperCapitalPoolId: "pool-persona-paper-039ad01f8bcd2b4aa466",
    deploymentPlanId: "plan-persona-paper-039ad01f8bcd2b4aa466",
    updatedAt: "2026-11-23T10:04:18Z",
  },
  ...HOSTED_PERSONAS_FIXTURE.data,
  {
    ...BASE_PERSONA,
    id: "persona-98e2f843d829665c2cd0",
    name: "Pantheon Dev Paper Release 3623d82dbfb3 Attempt 1",
    state: "retired",
    lifecycleStatus: "retired",
    paperLedgerId: "paper-ledger-3623d82dbfb3d31f75d8",
    legacyPaperCapitalPoolId: "pool-persona-paper-3623d82dbfb3d31f75d8",
    deploymentPlanId: "plan-persona-paper-3623d82dbfb3d31f75d8",
    updatedAt: "2026-10-20T04:11:24Z",
  },
  {
    ...BASE_PERSONA,
    id: "persona-b74d2d121d01589eb9c8",
    name: "Pantheon Dev Paper Release 52b322fff22e Attempt 1",
    state: "retired",
    lifecycleStatus: "retired",
    paperLedgerId: "paper-ledger-52b322fff22ec21d3219",
    legacyPaperCapitalPoolId: "pool-persona-paper-52b322fff22ec21d3219",
    deploymentPlanId: "plan-persona-paper-52b322fff22ec21d3219",
    updatedAt: "2026-10-19T21:33:11Z",
  },
  {
    ...BASE_PERSONA,
    id: "persona-59b2143dcecf205acbf1",
    name: "Pantheon Dev Paper Release 42123862167 Attempt 1",
    state: "approved",
    lifecycleStatus: "paper_running",
    paperLedgerId: "paper-ledger-59b2143dcecf205acbf1",
    legacyPaperCapitalPoolId: "pool-persona-paper-59b2143dcecf205acbf1",
    deploymentPlanId: "plan-persona-paper-59b2143dcecf205acbf1",
    updatedAt: "2026-11-06T01:00:00Z",
  },
];

const STRATEGY_RECORDS: Array<Record<string, unknown>> = [
  {
    id: "strategy-persona-a81b4fd15944698341aa",
    strategy_id: "strategy-persona-a81b4fd15944698341aa",
    name: "衡岳｜2330 台股 Paper 學習 R2",
    state: "approved",
    risk: "low",
    operationalStatus: "running",
    operational_status: "running",
    symbols: ["2330.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-a81b4fd15944698341aa",
    capital_pool_id: "pool-persona-paper-a81b4fd15944698341aa",
    owner: "persona-ee7112a829d38b9135ac",
    personaIds: ["persona-ee7112a829d38b9135ac"],
    persona_ids: ["persona-ee7112a829d38b9135ac"],
    pnl: -9.988691250022384,
    pnl30d: null,
    sharpe: null,
    drawdown: 0.00009988691250022385,
    totalTrades: 2,
    metricsAsOf: "2026-11-23T23:34:52Z",
    metricsResolution: "fresh",
    updatedAt: "2026-11-23T23:34:52Z",
    updated_at: "2026-11-23T23:34:52Z",
  },
  {
    id: "strategy-persona-06d4775a9b6a8f63b311",
    strategy_id: "strategy-persona-06d4775a9b6a8f63b311",
    name: "青禾｜2330 台股 Paper 學習 R2",
    state: "approved",
    risk: "low",
    operationalStatus: "running",
    operational_status: "running",
    symbols: ["2330.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-06d4775a9b6a8f63b311",
    capital_pool_id: "pool-persona-paper-06d4775a9b6a8f63b311",
    owner: "persona-2448c7053e33ea48da47",
    personaIds: ["persona-2448c7053e33ea48da47"],
    persona_ids: ["persona-2448c7053e33ea48da47"],
    pnl: -186.89087499999732,
    pnl30d: null,
    sharpe: null,
    drawdown: 0.0018689087499999732,
    totalTrades: 2,
    metricsAsOf: "2026-11-23T10:05:12Z",
    metricsResolution: "fresh",
    updatedAt: "2026-11-23T10:05:12Z",
    updated_at: "2026-11-23T10:05:12Z",
  },
  {
    id: "strategy-persona-039ad01f8bcd2b4aa466",
    strategy_id: "strategy-persona-039ad01f8bcd2b4aa466",
    name: "澄川｜2330 台股 Paper 學習 R2",
    state: "approved",
    risk: "low",
    operationalStatus: "idle",
    operational_status: "idle",
    symbols: ["2317.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-039ad01f8bcd2b4aa466",
    capital_pool_id: "pool-persona-paper-039ad01f8bcd2b4aa466",
    owner: "persona-6507750312870d03a241",
    personaIds: ["persona-6507750312870d03a241"],
    persona_ids: ["persona-6507750312870d03a241"],
    pnl: null,
    pnl30d: null,
    sharpe: null,
    drawdown: null,
    totalTrades: 0,
    metricsAsOf: null,
    metricsResolution: "missing",
    updatedAt: "2026-11-23T10:04:18Z",
    updated_at: "2026-11-23T10:04:18Z",
  },
  {
    id: "strategy-persona-59b2143dcecf205acbf1",
    strategy_id: "strategy-persona-59b2143dcecf205acbf1",
    name: "Pantheon Dev Paper Release 42123862167 Attempt 1",
    state: "approved",
    risk: "low",
    operationalStatus: "running",
    operational_status: "running",
    symbols: ["2330.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-59b2143dcecf205acbf1",
    capital_pool_id: "pool-persona-paper-59b2143dcecf205acbf1",
    owner: "persona-59b2143dcecf205acbf1",
    personaIds: ["persona-59b2143dcecf205acbf1"],
    persona_ids: ["persona-59b2143dcecf205acbf1"],
    pnl: null,
    pnl30d: null,
    sharpe: null,
    drawdown: null,
    totalTrades: 0,
    metricsAsOf: null,
    metricsResolution: "missing",
    updatedAt: "2026-11-06T01:00:00Z",
    updated_at: "2026-11-06T01:00:00Z",
  },
  {
    id: "strategy-persona-3623d82dbfb3d31f75d8",
    strategy_id: "strategy-persona-3623d82dbfb3d31f75d8",
    name: "Pantheon Dev Paper Release 3623d82dbfb3 Attempt 1",
    state: "approved",
    risk: "low",
    operationalStatus: "idle",
    operational_status: "idle",
    symbols: ["2330.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-3623d82dbfb3d31f75d8",
    capital_pool_id: "pool-persona-paper-3623d82dbfb3d31f75d8",
    owner: "persona-98e2f843d829665c2cd0",
    personaIds: ["persona-98e2f843d829665c2cd0"],
    persona_ids: ["persona-98e2f843d829665c2cd0"],
    pnl: null,
    pnl30d: null,
    sharpe: null,
    drawdown: null,
    totalTrades: 0,
    metricsAsOf: null,
    metricsResolution: "missing",
    updatedAt: "2026-10-20T04:11:24Z",
    updated_at: "2026-10-20T04:11:24Z",
  },
  {
    id: "strategy-persona-52b322fff22ec21d3219",
    strategy_id: "strategy-persona-52b322fff22ec21d3219",
    name: "Pantheon Dev Paper Release 52b322fff22e Attempt 1",
    state: "approved",
    risk: "low",
    operationalStatus: "idle",
    operational_status: "idle",
    symbols: ["2330.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-52b322fff22ec21d3219",
    capital_pool_id: "pool-persona-paper-52b322fff22ec21d3219",
    owner: "persona-b74d2d121d01589eb9c8",
    personaIds: ["persona-b74d2d121d01589eb9c8"],
    persona_ids: ["persona-b74d2d121d01589eb9c8"],
    pnl: null,
    pnl30d: null,
    sharpe: null,
    drawdown: null,
    totalTrades: 0,
    metricsAsOf: null,
    metricsResolution: "missing",
    updatedAt: "2026-10-19T21:33:11Z",
    updated_at: "2026-10-19T21:33:11Z",
  },
  {
    id: "strategy-persona-9d4ee0847468a04a6146",
    strategy_id: "strategy-persona-9d4ee0847468a04a6146",
    name: "Pantheon Dev Paper Release 9d4ee0847468 Attempt 1",
    state: "approved",
    risk: "low",
    operationalStatus: "idle",
    operational_status: "idle",
    symbols: ["2330.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-9d4ee0847468a04a6146",
    capital_pool_id: "pool-persona-paper-9d4ee0847468a04a6146",
    owner: "pantheon-dev-paper-provisioner",
    personaIds: ["persona-9d4ee0847468a04a6146"],
    persona_ids: ["persona-9d4ee0847468a04a6146"],
    pnl: null,
    pnl30d: null,
    sharpe: null,
    drawdown: null,
    totalTrades: 0,
    metricsAsOf: null,
    metricsResolution: "missing",
    updatedAt: "2026-09-17T14:52:13Z",
    updated_at: "2026-09-17T14:52:13Z",
  },
  {
    id: "strategy-persona-ba58ac9dcc83b246d235",
    strategy_id: "strategy-persona-ba58ac9dcc83b246d235",
    name: "Pantheon Dev Paper Release ba58ac9dcc83 Attempt 1",
    state: "approved",
    risk: "low",
    operationalStatus: "idle",
    operational_status: "idle",
    symbols: ["2330.TW"],
    alpha: "tw_session_momentum",
    capitalPoolId: "pool-persona-paper-ba58ac9dcc83b246d235",
    capital_pool_id: "pool-persona-paper-ba58ac9dcc83b246d235",
    owner: "pantheon-dev-paper-provisioner",
    personaIds: ["persona-ba58ac9dcc83b246d235"],
    persona_ids: ["persona-ba58ac9dcc83b246d235"],
    pnl: null,
    pnl30d: null,
    sharpe: null,
    drawdown: null,
    totalTrades: 0,
    metricsAsOf: null,
    metricsResolution: "missing",
    updatedAt: "2026-09-15T04:03:30Z",
    updated_at: "2026-09-15T04:03:30Z",
  },
];

const BASE_DEPLOYMENT = HOSTED_DEPLOYMENTS_FIXTURE.data[0];

const DEPLOYMENT_RECORDS: Array<Record<string, unknown>> = [
  ...HOSTED_DEPLOYMENTS_FIXTURE.data,
  {
    ...BASE_DEPLOYMENT,
    plan_id: "plan-persona-paper-a81b4fd15944698341aa",
    approval_decision_id: "apv-persona-paper-artifact-a81b4fd15944698341aa",
    artifact_id: "artifact-persona-paper-a81b4fd15944698341aa",
    strategy_id: "strategy-persona-a81b4fd15944698341aa",
    capital_pool_id: "pool-persona-paper-a81b4fd15944698341aa",
    sponsor_persona_id: "persona-ee7112a829d38b9135ac",
    binding_id: "rb-2b0df30559154a93902c209b0318d95c",
    created_at: "2026-11-23T23:34:52Z",
  },
  {
    ...BASE_DEPLOYMENT,
    plan_id: "plan-persona-paper-06d4775a9b6a8f63b311",
    approval_decision_id: "apv-persona-paper-artifact-06d4775a9b6a8f63b311",
    artifact_id: "artifact-persona-paper-06d4775a9b6a8f63b311",
    strategy_id: "strategy-persona-06d4775a9b6a8f63b311",
    capital_pool_id: "pool-persona-paper-06d4775a9b6a8f63b311",
    sponsor_persona_id: "persona-2448c7053e33ea48da47",
    binding_id: "rb-eb74118dd3ca4b169496b1c239087512",
    created_at: "2026-11-23T10:05:12Z",
  },
  {
    ...BASE_DEPLOYMENT,
    plan_id: "plan-persona-paper-039ad01f8bcd2b4aa466",
    approval_decision_id: "apv-persona-paper-artifact-039ad01f8bcd2b4aa466",
    artifact_id: "artifact-persona-paper-039ad01f8bcd2b4aa466",
    strategy_id: "strategy-persona-039ad01f8bcd2b4aa466",
    capital_pool_id: "pool-persona-paper-039ad01f8bcd2b4aa466",
    sponsor_persona_id: "persona-6507750312870d03a241",
    binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
    created_at: "2026-11-23T10:04:18Z",
  },
  {
    ...BASE_DEPLOYMENT,
    plan_id: "plan-persona-paper-4d67c6a4c01a5b9cadc1",
    approval_decision_id: "apv-persona-paper-artifact-4d67c6a4c01a5b9cadc1",
    artifact_id: "artifact-persona-paper-4d67c6a4c01a5b9cadc1",
    strategy_id: "strategy-persona-4d67c6a4c01a5b9cadc1",
    capital_pool_id: "pool-persona-paper-4d67c6a4c01a5b9cadc1",
    sponsor_persona_id: "persona-d57f6d76254c20418a9e",
    binding_id: "rb-4d67c6a4c01a5b9cadc1",
    created_at: "2026-10-20T08:40:59Z",
  },
  {
    ...BASE_DEPLOYMENT,
    plan_id: "plan-persona-paper-21fa44966461eb254ffc",
    approval_decision_id: "apv-persona-paper-artifact-21fa44966461eb254ffc",
    artifact_id: "artifact-persona-paper-21fa44966461eb254ffc",
    strategy_id: "strategy-persona-21fa44966461eb254ffc",
    capital_pool_id: "pool-persona-paper-21fa44966461eb254ffc",
    sponsor_persona_id: "persona-21cdbed183c80cf371df",
    binding_id: "rb-21fa44966461eb254ffc",
    created_at: "2026-10-20T04:05:19Z",
  },
  {
    ...BASE_DEPLOYMENT,
    plan_id: "plan-persona-paper-9d4ee0847468a04a6146",
    approval_decision_id: "apv-persona-paper-artifact-9d4ee0847468a04a6146",
    artifact_id: "artifact-persona-paper-9d4ee0847468a04a6146",
    strategy_id: "strategy-persona-9d4ee0847468a04a6146",
    capital_pool_id: "pool-persona-paper-9d4ee0847468a04a6146",
    sponsor_persona_id: "persona-9d4ee0847468a04a6146",
    binding_id: "rb-9d4ee0847468a04a6146",
    created_at: "2026-09-17T14:52:13Z",
  },
];

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      "accept,authorization,content-type,idempotency-key,if-match,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id,x-trace-id",
    vary: "Origin",
  };
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

function envelope(items: unknown[], total = items.length, next?: string, extraMeta?: Record<string, unknown>): Record<string, unknown> {
  return {
    data: items,
    items,
    cursor: next ? { next } : {},
    page_info: {
      page_size: items.length,
      total,
      has_more: Boolean(next),
      next_page_token: next ?? null,
    },
    pageSize: items.length,
    totalCountExact: true,
    estimatedTotal: total,
    meta: {
      snapshot_at: "2026-11-25T07:00:00Z",
      source: "fe-mgmt-list-short-window-fixture",
      status: "ok",
      ...(extraMeta ?? {}),
    },
  };
}

interface FixtureOverrides {
  personas?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  strategies?: Array<Record<string, unknown>>;
  strategyMeta?: Record<string, unknown>;
}

async function installFixtureBff(page: Page, overrides: FixtureOverrides = {}): Promise<void> {
  await installContainedLoopbackAuth(page);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    if (path === "/health" || path === "/healthz" || path === "/readyz") {
      return fulfillJson(route, { status: "ok", live: true, ready: true, checked_at: "2026-11-25T07:00:00Z" });
    }
    if (path === "/bff/events/stream") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: corsHeaders(route),
        body: ": connected\n\n",
      });
      return;
    }
    if (path === "/bff/strategies") {
      return fulfillJson(
        route,
        envelope(overrides.strategies ?? STRATEGY_RECORDS, 25, "20", {
          ...(overrides.strategyMeta ?? {}),
          state_counts: {
            draft: 4764,
            review: 1,
            approved: 133,
            paper_running: 0,
            canary_running: 0,
            live_running: 0,
            deployed: 0,
            paused: 0,
            retired: 2,
          },
          operational_counts: {
            running: 3,
            idle: 5,
            retired: 134,
            unbound: 2,
            unknown: 0,
          },
          hidden_retired_persona_count: 134,
          hidden_test_persona_strategy_count: 153,
          page_info: { page_size: 20, total: 25, next_page_token: "20" },
        }),
      );
    }
    if (path === "/bff/personas") {
      return fulfillJson(
        route,
        envelope(
          overrides.personas ?? PERSONA_RECORDS,
          (overrides.personas ?? PERSONA_RECORDS).length,
          undefined,
          HOSTED_PERSONAS_FIXTURE.meta,
        ),
      );
    }
    if (path === "/bff/artifacts") {
      const artifactRows = overrides.artifacts ?? ARTIFACT_RECORDS;
      const start = Number(url.searchParams.get("page_token") || 0);
      const size = Number(url.searchParams.get("page_size") || 100);
      const slice = artifactRows.slice(start, start + size);
      const next = start + size < artifactRows.length ? String(start + size) : undefined;
      return fulfillJson(route, envelope(slice, artifactRows.length, next));
    }
    if (path === "/bff/deployments") {
      return fulfillJson(
        route,
        envelope(DEPLOYMENT_RECORDS, DEPLOYMENT_RECORDS.length, undefined, HOSTED_DEPLOYMENTS_FIXTURE.meta),
      );
    }
    if (path.startsWith("/bff/") || path.startsWith("/api/")) {
      return fulfillJson(route, envelope([]));
    }
    await route.continue();
  });
  await installContainedLoopbackAuthAuthority(page);
}

const VIEWPORTS = [
  { width: 1274, height: 627 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1000 },
] as const;

const ROUTES = [
  { key: "strategies", path: "/management/strategies", hasPager: true },
  { key: "personas", path: "/management/personas", hasPager: false },
  { key: "artifacts", path: "/management/artifacts", hasPager: false },
  { key: "deployments", path: "/management/deployments", hasPager: false },
] as const;

test.describe("FE-MGMT-LIST-SHORT-WINDOW-20261125 short-window list readability", () => {
  test.setTimeout(180_000);
  test.skip(targetsExternalE2eEnvironment(), "fixture BFF layout regression runs on loopback");

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.key} at ${vp.width}x${vp.height} keeps table >= 320px, >= 4 full rows visible, sticky header, and pager clearance`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: vp });
        const page = await context.newPage();
        await installFixtureBff(page);
        await page.goto(frontendUrl(route.path), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page.locator('[data-testid="data-table-loading"]')).toHaveCount(0, { timeout: 30_000 });
        await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
        if (route.key === "artifacts") {
          // FE-REGISTRY-LISTS-CURRENT-FIRST-20261125: the default view is Current. This genuine capture has no
          // list_scope (older BFF) so its 271 Registry rows stay visible; the 2 research run outputs sit under
          // their own tab (All still counts 273).
          await expect.poll(() => page.locator("tbody tr").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(271);
        }

        const measurement = await page.evaluate(() => {
          const pageBody = document.querySelector<HTMLElement>('[data-page-body-mode="fill"]')!;
          const card = document.querySelector<HTMLElement>('[data-data-table-layout="fill"]')!;
          const scroller = document.querySelector<HTMLElement>('[data-management-table-scrollbar="native"]')!;
          const thead = scroller.querySelector<HTMLElement>("thead")!;
          const rows = Array.from(scroller.querySelectorAll<HTMLElement>("tbody tr"));

          const countFullyVisibleRows = () => {
            const pageBodyRect = pageBody.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            const theadRect = thead.getBoundingClientRect();
            const visibleTop = Math.max(pageBodyRect.top, scrollerRect.top, theadRect.bottom, 0);
            const visibleBottom = Math.min(
              pageBodyRect.bottom,
              scrollerRect.top + scroller.clientHeight,
              window.innerHeight,
            );
            let fullCount = 0;
            for (const row of rows) {
              const r = row.getBoundingClientRect();
              if (r.top >= visibleTop - 1 && r.bottom <= visibleBottom + 1) {
                fullCount += 1;
              }
            }
            return {
              fullCount,
              visibleTop: Math.round(visibleTop),
              visibleBottom: Math.round(visibleBottom),
              rowHeights: rows.slice(0, 6).map((r) => Math.round(r.getBoundingClientRect().height)),
            };
          };

          const initialVisibility = countFullyVisibleRows();

          // Perform at most one page scroll so the table card is aligned in view inside pageBody
          const cardRectBefore = card.getBoundingClientRect();
          const pageBodyRect = pageBody.getBoundingClientRect();
          if (cardRectBefore.top > pageBodyRect.top + 8 || cardRectBefore.bottom > pageBodyRect.bottom) {
            const delta = Math.min(pageBody.scrollHeight - pageBody.clientHeight, Math.max(0, card.offsetTop - pageBody.offsetTop - 8));
            pageBody.scrollTop = delta;
          }
          const afterOneScrollVisibility = countFullyVisibleRows();

          // Check sticky header when table scrolls internally
          const theadTopBeforeTableScroll = thead.getBoundingClientRect().top;
          const maxTableScroll = scroller.scrollHeight - scroller.clientHeight;
          if (maxTableScroll > 0) {
            scroller.scrollTop = Math.min(120, maxTableScroll);
          }
          const theadTopAfterTableScroll = thead.getBoundingClientRect().top;
          scroller.scrollTop = 0;

          // Scroll pageBody to bottom and check pager vs AI assistant button overlap
          pageBody.scrollTop = pageBody.scrollHeight;
          const pager = document.querySelector<HTMLElement>('[data-testid$="-list-pagination"]');
          const aiButton = document.querySelector<HTMLElement>('button[aria-label="開啟 Management AI"], button[title*="Management AI"]');
          const pagerRect = pager ? pager.getBoundingClientRect() : null;
          const aiRect = aiButton ? aiButton.getBoundingClientRect() : null;
          const overlaps =
            pagerRect && aiRect
              ? !(
                  pagerRect.right <= aiRect.left ||
                  pagerRect.left >= aiRect.right ||
                  pagerRect.bottom <= aiRect.top ||
                  pagerRect.top >= aiRect.bottom
                )
              : false;

          return {
            totalRows: rows.length,
            cardHeight: Math.round(card.getBoundingClientRect().height),
            scrollerHeight: Math.round(scroller.getBoundingClientRect().height),
            scrollerClientHeight: scroller.clientHeight,
            scrollerScrollHeight: scroller.scrollHeight,
            theadHeight: Math.round(thead.getBoundingClientRect().height),
            pageBodyClientHeight: pageBody.clientHeight,
            pageBodyScrollHeight: pageBody.scrollHeight,
            initialVisibility,
            afterOneScrollVisibility,
            theadStickyDelta: Math.abs(theadTopAfterTableScroll - theadTopBeforeTableScroll),
            pagerBottom: pagerRect ? Math.round(pagerRect.bottom) : null,
            aiButtonTop: aiRect ? Math.round(aiRect.top) : null,
            overlaps,
          };
        });

        console.log(`MEASUREMENT ${route.key}@${vp.width}x${vp.height} ${JSON.stringify(measurement)}`);

        expect(measurement.cardHeight).toBeGreaterThanOrEqual(320);
        expect(measurement.scrollerHeight).toBeGreaterThanOrEqual(320);
        expect(measurement.scrollerClientHeight).toBeGreaterThanOrEqual(320);
        const maxVisible = Math.max(
          measurement.initialVisibility.fullCount,
          measurement.afterOneScrollVisibility.fullCount,
        );
        expect(maxVisible).toBeGreaterThanOrEqual(Math.min(4, measurement.totalRows));
        expect(measurement.theadStickyDelta).toBeLessThanOrEqual(1);
        expect(measurement.overlaps).toBe(false);
        if (route.hasPager) {
          expect(measurement.pagerBottom).not.toBeNull();
          expect(measurement.aiButtonTop).not.toBeNull();
          expect(measurement.pagerBottom!).toBeLessThanOrEqual(measurement.aiButtonTop!);
        }
        if (vp.width === 1920 && vp.height === 1000) {
          expect(measurement.pageBodyScrollHeight).toBe(measurement.pageBodyClientHeight);
        }

        await context.close();
      });
    }
  }

  test("mouse wheel over a table at its end continues to scroll the page and preserves AI button clearance", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1274, height: 627 } });
    const page = await context.newPage();
    await installFixtureBff(page);
    await page.goto(frontendUrl("/management/strategies"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator('[data-testid="data-table-loading"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });

    const scroller = page.locator('[data-management-table-scrollbar="native"]');
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();

    // Move mouse over the center of the table viewport and scroll the table to its vertical bottom end
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.evaluate(() => {
      const pageBody = document.querySelector<HTMLElement>('[data-page-body-mode="fill"]')!;
      const tableScroller = document.querySelector<HTMLElement>('[data-management-table-scrollbar="native"]')!;
      pageBody.scrollTop = 0;
      tableScroller.scrollTop = tableScroller.scrollHeight;
    });

    const beforeWheelDown = await page.evaluate(() => {
      const pageBody = document.querySelector<HTMLElement>('[data-page-body-mode="fill"]')!;
      const tableScroller = document.querySelector<HTMLElement>('[data-management-table-scrollbar="native"]')!;
      return {
        pageBodyScrollTop: pageBody.scrollTop,
        tableScrollTop: tableScroller.scrollTop,
        tableAtBottom: tableScroller.scrollTop + tableScroller.clientHeight >= tableScroller.scrollHeight - 1,
      };
    });
    expect(beforeWheelDown.pageBodyScrollTop).toBe(0);
    expect(beforeWheelDown.tableAtBottom).toBe(true);

    // Wheel down over the table while the table is already at its bottom end -> pageBody scrolls down
    await page.mouse.wheel(0, 360);
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector<HTMLElement>('[data-page-body-mode="fill"]')!.scrollTop),
      )
      .toBeGreaterThan(0);

    // Scroll table to its top end and wheel up over the table -> pageBody scrolls back up
    await page.evaluate(() => {
      const tableScroller = document.querySelector<HTMLElement>('[data-management-table-scrollbar="native"]')!;
      tableScroller.scrollTop = 0;
    });
    await page.mouse.wheel(0, -360);
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector<HTMLElement>('[data-page-body-mode="fill"]')!.scrollTop),
      )
      .toBe(0);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// FE-REGISTRY-LISTS-CURRENT-FIRST-20261125
// Hosted shapes of 2026-11-25 06:35Z-07:16Z: 177 personas (153 test, the live ones at 152/154/155),
// 344 artifacts (304 test), and the three recorded live strategies with the BFF runtime fields.
// ---------------------------------------------------------------------------
const LIVE_PERSONAS = PERSONA_RECORDS.slice(0, 3).map((row) => ({ ...row, listScope: "current", successRate: null }));

function buildHostedPersonas(): Array<Record<string, unknown>> {
  const test = new Set<number>([...Array.from({ length: 151 }, (_, k) => k + 1), 153, 156]);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= 177; i += 1) {
    const clone = (extra: Record<string, unknown>) => ({
      ...BASE_PERSONA,
      id: `persona-clone-${String(i).padStart(4, "0")}`,
      name: `Pantheon Dev Paper Baseline ${i}`,
      successRate: null,
      ...extra,
    });
    if (i === 152) rows.push(LIVE_PERSONAS[0]);
    else if (i === 154) rows.push(LIVE_PERSONAS[1]);
    else if (i === 155) rows.push(LIVE_PERSONAS[2]);
    else if (test.has(i)) rows.push(clone({ listScope: "test" }));
    else if (i >= 157 && i <= 160) rows.push(clone({ listScope: "research", state: "approved", lifecycleStatus: "research_only" }));
    else rows.push(clone({ listScope: "retired", state: "retired", lifecycleStatus: "retired" }));
  }
  return rows;
}

function buildHostedArtifacts(): Array<Record<string, unknown>> {
  const liveIds = [
    "strategy-persona-a81b4fd15944698341aa",
    "strategy-persona-06d4775a9b6a8f63b311",
    "strategy-persona-039ad01f8bcd2b4aa466",
  ];
  const all: Array<Record<string, unknown>> = [...ARTIFACT_RECORDS];
  const registryBase = ARTIFACT_RECORDS.filter((r) => r.source_kind !== "research_run_output");
  for (let i = 0; all.length < 344; i += 1) {
    const base = registryBase[i % registryBase.length];
    all.push({ ...base, id: `${String(base.id)}-clone-${i}`, name: `${String(base.name)}-clone-${i}` });
  }
  const registryIdx = all.map((r, i) => (r.source_kind === "research_run_output" ? -1 : i)).filter((i) => i >= 0);
  const scope = new Map<number, string>();
  registryIdx.slice(0, 5).forEach((i) => scope.set(i, "current"));
  registryIdx.slice(5, 25).forEach((i) => scope.set(i, "retired"));
  registryIdx.slice(25, 38).forEach((i) => scope.set(i, "unbound"));
  return all.map((row, i) => {
    if (row.source_kind === "research_run_output") return { ...row, list_scope: "research" };
    const s = scope.get(i) ?? "test";
    const idx = registryIdx.indexOf(i);
    return {
      ...row,
      list_scope: s,
      ...(idx >= 0 && idx < 3 ? { name: liveIds[idx], strategy_id: liveIds[idx] } : {}),
    };
  });
}

const RUNTIME_STRATEGIES = STRATEGY_RECORDS.map((row, i) => ({
  ...row,
  persona_display_names: { [String((row.personaIds as string[])[0])]: String(row.name) },
  metricsReason: row.pnl === null ? "no_fills" : null,
  runtimeStatus: i === 1 ? "paused_market_input" : "running",
  runtimeStatusReason: i === 1 ? "market_input_stale" : null,
}));

const STRATEGY_VISIBLE_META = {
  state_counts: { draft: 7421, review: 1, approved: 170, paper_running: 0, canary_running: 0, live_running: 0, deployed: 0, paused: 0, retired: 1556 },
  visible_state_counts: { draft: 4205, review: 0, approved: 14, paper_running: 0, canary_running: 0, live_running: 0, deployed: 0, paused: 0, retired: 2 },
  hidden_unbound_stub_strategy_count: 4,
};

const CURRENT_FIRST_VIEWPORTS = [
  { width: 1274, height: 627 },
  { width: 1920, height: 1000 },
] as const;
const CURRENT_FIRST_ROUTES = [
  { key: "strategies", path: "/management/strategies" },
  { key: "personas", path: "/management/personas" },
  { key: "artifacts", path: "/management/artifacts" },
] as const;

test.describe("FE-REGISTRY-LISTS-CURRENT-FIRST-20261125 current-first lists fit the window", () => {
  test.setTimeout(180_000);
  test.skip(targetsExternalE2eEnvironment(), "fixture BFF layout regression runs on loopback");

  for (const vp of CURRENT_FIRST_VIEWPORTS) {
    for (const route of CURRENT_FIRST_ROUTES) {
      test(`${route.key} at ${vp.width}x${vp.height} needs no horizontal scroll and keeps the name column >= 220px`, async ({ browser }) => {
        const personas = buildHostedPersonas();
        const artifacts = buildHostedArtifacts();
        expect(personas).toHaveLength(177);
        expect(artifacts).toHaveLength(344);
        const context = await browser.newContext({ viewport: vp });
        await context.addInitScript(() => window.localStorage.setItem("pantheon.locale", "en-US"));
        const page = await context.newPage();
        await installFixtureBff(page, {
          personas,
          artifacts,
          strategies: RUNTIME_STRATEGIES,
          strategyMeta: STRATEGY_VISIBLE_META,
        });
        await page.goto(frontendUrl(route.path), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page.locator('[data-testid="data-table-loading"]')).toHaveCount(0, { timeout: 30_000 });
        await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
        if (route.key === "artifacts") {
          await expect(page.getByRole("button", { name: /^All \(344\)$/ })).toBeVisible({ timeout: 30_000 });
        }
        if (route.key === "personas") {
          await expect(page.getByRole("button", { name: /^All \(177\)$/ })).toBeVisible({ timeout: 30_000 });
        }

        const m = await page.evaluate(() => {
          const scroller = document.querySelector<HTMLElement>("[data-management-table-scrollbar='native']")!;
          const ths = Array.from(scroller.querySelectorAll("thead th"));
          const rows = Array.from(scroller.querySelectorAll<HTMLElement>("tbody tr"));
          return {
            rowCount: rows.length,
            viewportWidth: window.innerWidth,
            clientWidth: scroller.clientWidth,
            scrollWidth: scroller.scrollWidth,
            docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            headers: ths.map((th) => (th.textContent || "").trim()),
            colWidths: ths.map((th) => Math.round(th.getBoundingClientRect().width)),
            nameWidth: Math.round(ths[0].getBoundingClientRect().width),
            lastRight: Math.round(ths[ths.length - 1].getBoundingClientRect().right),
            maxRowHeight: Math.max(...rows.map((r) => Math.round(r.getBoundingClientRect().height))),
            scopeButtons: Array.from(document.querySelectorAll<HTMLElement>("[data-scope]")).map((b) => (b.textContent || "").trim()),
            stateButtons: Array.from(document.querySelectorAll<HTMLElement>("[data-strategy-state]")).map((b) => (b.textContent || "").trim()),
          };
        });
        console.log(`CURRENT_FIRST_WIDTH ${route.key}@${vp.width}x${vp.height} ${JSON.stringify(m)}`);

        const evidenceDir = process.env.E2E_EVIDENCE_DIR;
        if (evidenceDir) {
          const { mkdirSync, writeFileSync } = await import("node:fs");
          mkdirSync(`${evidenceDir}/screenshots`, { recursive: true });
          await page.screenshot({ path: `${evidenceDir}/screenshots/${route.key}-${vp.width}x${vp.height}.png` });
          writeFileSync(`${evidenceDir}/screenshots/${route.key}-${vp.width}x${vp.height}.json`, JSON.stringify(m, null, 2));
        }
        expect(m.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(m.clientWidth + 1);
        expect(m.docOverflow).toBeLessThanOrEqual(0);
        expect(m.nameWidth).toBeGreaterThanOrEqual(220);
        expect(m.headers).not.toContain("Alpha");
        expect(m.headers.join("|")).not.toMatch(/size|大小|Sharpe|30d/i);
        if (route.key === "personas") {
          // current-first: the three live personas, none of the 153 test rows.
          expect(m.rowCount).toBe(3);
          expect(m.scopeButtons).toEqual(["Current (3)", "Test (153)", "Retired (17)", "Research (4)", "All (177)"]);
        }
        if (route.key === "artifacts") {
          expect(m.rowCount).toBe(5);
          expect(m.scopeButtons).toEqual(["Current (5)", "Test (304)", "Retired (20)", "Research output (2)", "Unbound (13)", "All (344)"]);
        }
        if (route.key === "strategies") {
          expect(m.headers).toHaveLength(8);
        }

        await context.close();
      });
    }
  }
});

// ---------------------------------------------------------------------------
// FE-PERSONA-LIST-PLAIN-WORDS-20261125
// Recorded current rows 2026-11-25 20:38Z on BFF b3f93d448:
// Agora Servant (operator-a, 0), Agora Servant (operator-b, 0), the three trading personas
// (momentum, pantheon-dev-admin-test, 1 each), Risk Officer (sentence, operator-bff, 0),
// Red Team (sentence, operator-bff, 0); strategy symbols with 2330.TWSE.
// ---------------------------------------------------------------------------
const RISK_OFFICER_ARCHETYPE_SENTENCE =
  "Independent risk reviewer. Never trades. Reviews trial admission, envelope publication and every harness patch; may veto.";
const RED_TEAM_ARCHETYPE_SENTENCE =
  "Adversarial reviewer. Never trades. Attacks patches that touch guardrails or the consult policy.";

const RECORDED_SEVEN_CURRENT_PERSONAS: Array<Record<string, unknown>> = [
  {
    ...BASE_PERSONA,
    id: "persona-agora-servant-operator-a",
    name: "Agora Servant",
    owner: "pantheon-dev-operator-a",
    state: "approved",
    risk: "low",
    archetype: "agora_servant",
    routedStrategies: 0,
    successRate: null,
    listScope: "current",
    updatedAt: "2026-11-25T20:38:00Z",
  },
  {
    ...BASE_PERSONA,
    id: "persona-agora-servant-operator-b",
    name: "Agora Servant",
    owner: "pantheon-dev-operator-b",
    state: "approved",
    risk: "low",
    archetype: "agora_servant",
    routedStrategies: 0,
    successRate: null,
    listScope: "current",
    updatedAt: "2026-11-25T20:38:00Z",
  },
  ...LIVE_PERSONAS.map((row) => ({
    ...row,
    owner: "pantheon-dev-admin-test",
    archetype: "momentum",
    routedStrategies: 1,
    listScope: "current",
  })),
  {
    ...BASE_PERSONA,
    id: "persona-risk-officer",
    name: "Risk Officer",
    owner: "operator-bff",
    state: "draft",
    risk: "low",
    archetype: RISK_OFFICER_ARCHETYPE_SENTENCE,
    routedStrategies: 0,
    successRate: null,
    listScope: "current",
    updatedAt: "2026-11-25T20:38:00Z",
  },
  {
    ...BASE_PERSONA,
    id: "persona-red-team",
    name: "Red Team",
    owner: "operator-bff",
    state: "draft",
    risk: "low",
    archetype: RED_TEAM_ARCHETYPE_SENTENCE,
    routedStrategies: 0,
    successRate: null,
    listScope: "current",
    updatedAt: "2026-11-25T20:38:00Z",
  },
];

function buildRecordedSevenCurrentPersonasCatalog(): Array<Record<string, unknown>> {
  const nonCurrent = buildHostedPersonas().filter((r) => r.listScope !== "current");
  return [...RECORDED_SEVEN_CURRENT_PERSONAS, ...nonCurrent];
}

const PLAIN_WORDS_STRATEGIES = RUNTIME_STRATEGIES.map((row, idx) => ({
  ...row,
  symbols:
    idx === 0
      ? ["2330.TWSE"]
      : idx === 1
        ? ["2330.TWSE", "2317.TWSE"]
        : row.symbols,
}));

test.describe("FE-PERSONA-LIST-PLAIN-WORDS-20261125 recorded 7 current personas, short owner, one-line sentence type and unsplit symbols", () => {
  test.setTimeout(180_000);
  test.skip(targetsExternalE2eEnvironment(), "fixture BFF layout regression runs on loopback");

  for (const vp of CURRENT_FIRST_VIEWPORTS) {
    for (const route of CURRENT_FIRST_ROUTES) {
      test(`${route.key} at ${vp.width}x${vp.height} renders recorded rows with no horizontal scroll and name column >= 220px`, async ({ browser }) => {
        const personas = buildRecordedSevenCurrentPersonasCatalog();
        const artifacts = buildHostedArtifacts();
        expect(personas).toHaveLength(181);
        expect(artifacts).toHaveLength(344);
        const context = await browser.newContext({ viewport: vp });
        await context.addInitScript(() => window.localStorage.setItem("pantheon.locale", "en-US"));
        const page = await context.newPage();
        await installFixtureBff(page, {
          personas,
          artifacts,
          strategies: PLAIN_WORDS_STRATEGIES,
          strategyMeta: STRATEGY_VISIBLE_META,
        });
        await page.goto(frontendUrl(route.path), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page.locator('[data-testid="data-table-loading"]')).toHaveCount(0, { timeout: 30_000 });
        await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
        if (route.key === "artifacts") {
          await expect(page.getByRole("button", { name: /^All \(344\)$/ })).toBeVisible({ timeout: 30_000 });
        }
        if (route.key === "personas") {
          await expect(page.getByRole("button", { name: /^All \(181\)$/ })).toBeVisible({ timeout: 30_000 });
        }

        const m = await page.evaluate(() => {
          const scroller = document.querySelector<HTMLElement>("[data-management-table-scrollbar='native']")!;
          const ths = Array.from(scroller.querySelectorAll("thead th"));
          const rows = Array.from(scroller.querySelectorAll<HTMLElement>("tbody tr"));
          const typeEls = Array.from(scroller.querySelectorAll<HTMLElement>('[data-testid="persona-type"]'));
          const ownerEls = Array.from(scroller.querySelectorAll<HTMLElement>('[data-testid="owner-cell"]'));
          const symbolItems = Array.from(scroller.querySelectorAll<HTMLElement>('[data-testid="strategy-symbol-item"]'));
          return {
            rowCount: rows.length,
            viewportWidth: window.innerWidth,
            clientWidth: scroller.clientWidth,
            scrollWidth: scroller.scrollWidth,
            docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            headers: ths.map((th) => (th.textContent || "").trim()),
            colWidths: ths.map((th) => Math.round(th.getBoundingClientRect().width)),
            nameWidth: Math.round(ths[0].getBoundingClientRect().width),
            lastRight: Math.round(ths[ths.length - 1].getBoundingClientRect().right),
            rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
            maxRowHeight: Math.max(...rows.map((r) => Math.round(r.getBoundingClientRect().height))),
            rowNames: rows.map((r) => (r.querySelector("td")?.textContent || "").trim()),
            types: typeEls.map((el) => ({
              text: (el.textContent || "").trim(),
              title: el.getAttribute("title"),
              kind: el.getAttribute("data-persona-type-kind"),
              height: Math.round(el.getBoundingClientRect().height),
              clientRectCount: el.getClientRects().length,
            })),
            owners: ownerEls.map((el) => ({
              text: (el.textContent || "").trim(),
              title: el.getAttribute("title"),
              full: el.getAttribute("data-full-owner"),
            })),
            symbolItems: symbolItems.map((el) => ({
              text: (el.textContent || "").trim(),
              height: Math.round(el.getBoundingClientRect().height),
              clientRectCount: el.getClientRects().length,
              top: Math.round(el.getBoundingClientRect().top),
            })),
            scopeButtons: Array.from(document.querySelectorAll<HTMLElement>("[data-scope]")).map((b) => (b.textContent || "").trim()),
            stateButtons: Array.from(document.querySelectorAll<HTMLElement>("[data-strategy-state]")).map((b) => (b.textContent || "").trim()),
          };
        });
        console.log(`PLAIN_WORDS_WIDTH ${route.key}@${vp.width}x${vp.height} ${JSON.stringify(m)}`);

        const evidenceDir = process.env.E2E_EVIDENCE_DIR;
        if (evidenceDir) {
          const { mkdirSync, writeFileSync } = await import("node:fs");
          mkdirSync(`${evidenceDir}/screenshots`, { recursive: true });
          await page.screenshot({ path: `${evidenceDir}/screenshots/${route.key}-${vp.width}x${vp.height}.png` });
          writeFileSync(`${evidenceDir}/screenshots/${route.key}-${vp.width}x${vp.height}.json`, JSON.stringify(m, null, 2));
        }

        expect(m.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(m.clientWidth + 1);
        expect(m.docOverflow).toBeLessThanOrEqual(0);
        expect(m.nameWidth).toBeGreaterThanOrEqual(220);

        if (route.key === "personas") {
          expect(m.rowCount).toBe(7);
          expect(m.scopeButtons).toEqual(["Current (7)", "Test (153)", "Retired (17)", "Research (4)", "All (181)"]);
          // AC1: Trading personas first, then Agora Servant (operator-a, operator-b), Risk Officer, Red Team.
          expect(m.rowNames[0]).toContain("衡岳｜2330 台股 Paper 學習 R2");
          expect(m.rowNames[1]).toContain("青禾｜2330 台股 Paper 學習 R2");
          expect(m.rowNames[2]).toContain("澄川｜2330 台股 Paper 學習 R2");
          expect(m.rowNames[3]).toContain("persona-agora-servant-operator-a");
          expect(m.rowNames[4]).toContain("persona-agora-servant-operator-b");
          expect(m.rowNames[5]).toContain("Risk Officer");
          expect(m.rowNames[6]).toContain("Red Team");
          // AC2: Type words + one-line truncated sentence so sentence rows are never taller.
          expect(m.types.slice(0, 3).map((t) => ({ text: t.text, title: t.title }))).toEqual([
            { text: "Momentum", title: "momentum" },
            { text: "Momentum", title: "momentum" },
            { text: "Momentum", title: "momentum" },
          ]);
          expect(m.types.slice(3, 5).map((t) => ({ text: t.text, title: t.title }))).toEqual([
            { text: "Agora servant", title: "agora_servant" },
            { text: "Agora servant", title: "agora_servant" },
          ]);
          expect(m.types[5].kind).toBe("sentence");
          expect(m.types[5].title).toBe(RISK_OFFICER_ARCHETYPE_SENTENCE);
          expect(m.types[5].height).toBeLessThanOrEqual(20);
          expect(m.types[6].kind).toBe("sentence");
          expect(m.types[6].title).toBe(RED_TEAM_ARCHETYPE_SENTENCE);
          expect(m.types[6].height).toBeLessThanOrEqual(20);
          expect(m.rowHeights[5]).toBeLessThanOrEqual(m.rowHeights[3]);
          expect(m.rowHeights[6]).toBeLessThanOrEqual(m.rowHeights[3]);
          // AC3: Distinguishing owner text + full owner tooltip.
          expect(m.owners.map((o) => o.text)).toEqual([
            "admin-test",
            "admin-test",
            "admin-test",
            "operator-a",
            "operator-b",
            "operator-bff",
            "operator-bff",
          ]);
          expect(m.owners[0].title).toBe("pantheon-dev-admin-test");
          expect(m.owners[3].title).toBe("pantheon-dev-operator-a");
          expect(m.owners[4].title).toBe("pantheon-dev-operator-b");
          expect(m.owners[5].title).toBe("operator-bff");
        }

        if (route.key === "artifacts") {
          expect(m.rowCount).toBe(5);
          expect(m.owners[0].text).toBe("paper-provisioner");
          expect(m.owners[0].title).toBe("pantheon-dev-paper-provisioner");
        }

        if (route.key === "strategies") {
          expect(m.headers).toHaveLength(8);
          // AC4: 2330.TWSE is never broken across two lines.
          const twseItems = m.symbolItems.filter((s) => s.text.startsWith("2330.TWSE"));
          expect(twseItems.length).toBeGreaterThanOrEqual(2);
          for (const item of m.symbolItems) {
            expect(item.clientRectCount).toBe(1);
            expect(item.height).toBeLessThanOrEqual(20);
          }
        }

        await context.close();
      });
    }
  }
});
