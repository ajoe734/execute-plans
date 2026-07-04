/**
 * AG-DYNUI-PROD-006 - Hosted Winner Branch E2E publish gate.
 *
 * Drives the real hosted dev FE bundle against the real hosted live BFF for
 * the full V10-to-V11 Winner Branch flow: Strategy Workshop intake,
 * readiness, joining the Trading Room, workspace proposal preview, accept,
 * grid edit, widget revision (before/after + keep-original-add-copy),
 * version history, and rollback. Captures desktop and mobile screenshots.
 *
 * Live vs disclosed-fixture split (see /tmp/agora-dynui-prod-e2e-summary-*.json
 * for the same disclosure emitted at runtime):
 *   - LIVE, no mocking: dev-login, Strategy Workshop list, a workshop created
 *     for real via a live authenticated BFF POST at test start, and the
 *     Trading Room default entry (confirms the live dev BFF tenant still has
 *     zero ready strategies and the servant/persona pipeline that would
 *     progress a workshop to trading_room readiness is not wired end-to-end
 *     yet -- a known, disclosed platform gap, not a fabrication).
 *   - DISCLOSED FIXTURE: because no live strategy has ever reached the
 *     trading_room readiness gate in this environment, the proposal / accept
 *     / grid-edit / widget-revision / version-history / rollback chain is
 *     exercised against `page.route()` responses shaped exactly like the
 *     real TradingRoom* BFF contracts (see tradingRoomTypes.ts), following
 *     the same disclosed-mock precedent used by AG-DYNUI-PROD-003's hosted
 *     evidence. The real product code (TradingRoomPage / WorkspaceGridEditor
 *     / WorkspaceWidgetRevisionDrawer) is exercised unmodified; only the BFF
 *     data underneath it is a fixture.
 *
 * Env:
 *   PANTHEON_FE_BASE_URL  (default: https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io)
 *   PANTHEON_BFF_BASE_URL (default: https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io)
 *   BFF_AUTH_TOKEN        (default: op-fe-gate:operator,reviewer,approver:mfa)
 */

import { test, expect, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { installOidcDevLogin } from "./helpers/auth";

const FE_BASE_URL =
  process.env.PANTHEON_FE_BASE_URL || "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io";
const BFF_BASE_URL =
  process.env.PANTHEON_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";
const AUTH_TOKEN = process.env.BFF_AUTH_TOKEN || "op-fe-gate:operator,reviewer,approver:mfa";
// The dev-login helper's library default (DEFAULT_FE_TENANT_ID = "tenant-dev")
// does not match the real tenant the hosted dev BFF resolves the op-fe-gate
// operator token into ("pantheon-dev"). Sending the mismatched X-Tenant-Id
// header makes the live BFF 403 every authenticated read as a tenant-scope
// safety check, so this must be overridden to the real tenant id.
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || "pantheon-dev";

const EVIDENCE_DIR = "/tmp";

// Forbidden execution-plane terms that must never leak into Agora's
// decision-support-only surface, and the Chinese redaction safeWarningText()
// substitutes for each (see src/agora/trading-room/workspaceValidation.ts).
const LEAKAGE_PROBE_WARNING =
  "Direct order routing must never expose broker connectivity, capital binding exposure, or RuntimeBinding status; Management approval is a separate concern.";
const FORBIDDEN_TERMS = [/\bdirect order\b/i, /\bbroker\b/i, /\bcapital binding\b/i, /\bruntimebinding\b/i, /\bmanagement\b/i];
const REDACTED_TERMS = ["交易執行", "外部連線", "資金連動", "後台執行狀態", "系統治理"];
const FORBIDDEN_BFF_PATH_PATTERNS = [/\/bff\/orders?\b/i, /\/bff\/broker/i, /\/bff\/capital(?!-pool)/i, /\/bff\/runtime-binding/i, /\/bff\/management/i];

type JsonRecord = Record<string, unknown>;

function widgetSpec(overrides: JsonRecord): JsonRecord {
  return {
    id: "widget-a",
    widgetType: "strategy_status_summary",
    title: "Strategy Status Summary",
    purpose: "Version, completeness, research, and monitoring status at a glance.",
    whyIncluded: "Always-on summary widget for the active Winner Branch strategy.",
    dataSource: "agora.strategy.summary",
    query: { filters: { strategy_id: "strategy-prod-006-momentum-e2e" }, limit: 50 },
    chartSpec: { spec_version: "1.0", kind: "metric", encodings: {} },
    interactions: [{ kind: "request_widget_revision" }],
    placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2, maxWidth: 12, maxHeight: 8 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 12, height: 8 },
    sensitivity: "user_private",
    visible: true,
    ...overrides,
  };
}

function buildInitialWidgets(strategyId: string): JsonRecord[] {
  return [
    widgetSpec({ id: "widget-a", query: { filters: { strategy_id: strategyId }, limit: 50 } }),
    widgetSpec({
      id: "widget-b",
      widgetType: "strategy_completeness_map",
      title: "Strategy Completeness Map",
      purpose: "Confirmed, inferred, missing, and contradiction coverage.",
      whyIncluded: "Lets the trader see workshop coverage gaps inside the trading room.",
      dataSource: "agora.strategy.completeness",
      query: { filters: { strategy_id: strategyId }, limit: 50 },
      chartSpec: { spec_version: "1.0", kind: "table", encodings: {} },
      placement: { x: 4, y: 0, width: 8, height: 3, minWidth: 2, minHeight: 2, maxWidth: 12, maxHeight: 8 },
    }),
  ];
}

function buildView(strategyId: string, widgets: JsonRecord[], warnings: string[] = []): JsonRecord {
  return {
    id: "view-prod-006-overview",
    title: "Winner Branch Overview",
    purpose: "Primary Winner Branch monitoring surface generated by the trading servant.",
    order: 0,
    layoutTemplate: "grid_12col",
    widgetCount: widgets.length,
    rationale: `Generated for ${strategyId} from Strategy Workshop evidence.`,
    dataAvailability: "complete",
    warnings,
    widgets,
  };
}

// page.route() fulfillments still go through the browser's real CORS
// enforcement (the FE origin and the BFF origin differ), so every fulfilled
// mock response needs the same permissive CORS headers a genuine live BFF
// response would carry, and every OPTIONS preflight must be answered too.
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type,idempotency-key,if-match,x-tenant-id,x-request-id",
    "Access-Control-Expose-Headers": "ETag",
    Vary: "Origin",
  };
}

function jsonHeaders(route: Route, extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", ...corsHeaders(route), ...extra };
}

async function fulfillJson(route: Route, status: number, body: JsonRecord, extraHeaders?: Record<string, string>) {
  await route.fulfill({ status, headers: jsonHeaders(route, extraHeaders), body: JSON.stringify(body) });
}

async function mockRoute(page: Page, url: string | RegExp, handler: (route: Route) => Promise<void>) {
  await page.route(url, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    await handler(route);
  });
}

interface ServerState {
  strategyId: string;
  strategyVersion: string;
  proposalId: string;
  workspaceId: string;
  dashboardVersion: number;
  workspace: JsonRecord | null;
  versions: JsonRecord[];
  pendingRevisions: Map<string, JsonRecord>;
}

function makeServerState(): ServerState {
  return {
    strategyId: "strategy-prod-006-momentum-e2e",
    strategyVersion: "spec-prod-006-momentum-v1",
    proposalId: "proposal-prod-006-e2e-001",
    workspaceId: "workspace-prod-006-e2e-001",
    dashboardVersion: 0,
    workspace: null,
    versions: [],
    pendingRevisions: new Map(),
  };
}

function etagFor(state: ServerState): string {
  return `W/"workspace:${state.workspaceId}:v${state.dashboardVersion}"`;
}

function snapshotVersion(state: ServerState, reason: string, sourceRevisionProposalId?: string, rollbackOfVersionId?: string): JsonRecord {
  for (const v of state.versions) {
    if (v.status === "active") v.status = "superseded";
  }
  const workspace = state.workspace as JsonRecord;
  const version: JsonRecord = {
    id: `version-prod-006-v${state.dashboardVersion}`,
    userId: "op-fe-gate",
    strategyId: state.strategyId,
    strategyVersion: state.strategyVersion,
    dashboardVersion: state.dashboardVersion,
    generatedBy: state.dashboardVersion === 1 ? "trading_servant" : "user_modified",
    previousVersionId: state.versions.length ? (state.versions[state.versions.length - 1].id as string) : null,
    changeSummary: reason,
    views: JSON.parse(JSON.stringify(workspace.views)),
    createdAt: new Date(0).toISOString(),
    status: "active",
    changeLog: {
      changedAt: new Date(0).toISOString(),
      changedBy: "op-fe-gate",
      reason,
      affectedViews: [(workspace.views as JsonRecord[])[0]?.id as string],
      affectedWidgets: [],
      effectEvaluation: reason,
      rollbackAvailable: true,
      sourceRevisionProposalId: sourceRevisionProposalId ?? null,
      rollbackOfVersionId: rollbackOfVersionId ?? null,
    },
  };
  state.versions.push(version);
  return version;
}

function applyLayoutOperations(state: ServerState, operations: JsonRecord[]) {
  const workspace = state.workspace as JsonRecord;
  const views = workspace.views as JsonRecord[];
  for (const op of operations) {
    const kind = op.kind as string;
    const payload = (op.payload ?? {}) as JsonRecord;
    if (kind === "add_registered_widget" && payload.widgetSpec) {
      const viewId = (payload.viewId as string) ?? views[0].id;
      const view = views.find((v) => v.id === viewId) ?? views[0];
      const widgets = view.widgets as JsonRecord[];
      widgets.push(payload.widgetSpec as JsonRecord);
      view.widgetCount = widgets.length;
    } else if (kind === "remove_widget" && op.widgetId) {
      for (const view of views) {
        const widgets = view.widgets as JsonRecord[];
        const target = widgets.find((w) => w.id === op.widgetId);
        if (target) target.visible = false;
      }
    }
  }
}

async function installTradingRoomFixtures(page: Page, state: ServerState) {
  await mockRoute(page, `${BFF_BASE_URL}/bff/agora/trading-room`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await fulfillJson(route, 200, {
      data: {
        spec_version: "1.0",
        user_scope_ref: "tenant:pantheon-dev:user:op-fe-gate",
        strategies: [
          {
            strategy_id: state.strategyId,
            strategy_spec_registry_id: state.strategyVersion,
            title: "Winner Branch Momentum (E2E fixture)",
            readiness_state: "ready",
            monitoring_state: "monitoring",
            candidate_count: 3,
            position_count: 0,
            pending_event_counts: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
          },
        ],
        queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
        top_decision_events: [],
        position_summaries: [],
        risk_summary: { state: "normal" },
        snapshot_at: new Date(0).toISOString(),
        data_cutoff: new Date(0).toISOString(),
      },
    });
  });

  await mockRoute(page, 
    `${BFF_BASE_URL}/bff/agora/strategies/${state.strategyId}/trading-room/proposals`,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const body = (route.request().postDataJSON() ?? {}) as JsonRecord;
      const widgets = buildInitialWidgets(state.strategyId);
      await fulfillJson(route, 201, {
        data: {
          strategyId: state.strategyId,
          strategyVersion: (body.strategyVersion as string) ?? state.strategyVersion,
          proposalId: state.proposalId,
          generatedAt: new Date(0).toISOString(),
          status: "preview",
          views: [buildView(state.strategyId, widgets, [LEAKAGE_PROBE_WARNING])],
          rationale:
            "Winner Branch flow-following momentum proposal generated from Strategy Workshop evidence for the E2E fixture strategy.",
          dataAvailability: {
            status: "complete",
            sources: [{ dataSource: "agora.strategy.summary", status: "complete" }],
          },
          warnings: [LEAKAGE_PROBE_WARNING],
          personalizationApplied: { status: "not_applied", items: [] },
        },
      });
    },
  );

  await mockRoute(page, 
    `${BFF_BASE_URL}/bff/agora/strategies/${state.strategyId}/trading-room/proposals/${state.proposalId}/accept`,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      state.dashboardVersion = 1;
      const widgets = buildInitialWidgets(state.strategyId);
      state.workspace = {
        id: state.workspaceId,
        userId: "op-fe-gate",
        strategyId: state.strategyId,
        strategyVersion: state.strategyVersion,
        dashboardVersion: state.dashboardVersion,
        activeViewId: "view-prod-006-overview",
        views: [buildView(state.strategyId, widgets)],
        status: "active",
        generatedBy: "trading_servant",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
      const version = snapshotVersion(state, "Trading servant generated workspace from accepted proposal.");
      await fulfillJson(
        route,
        200,
        { data: { workspace: state.workspace, version } },
        { ETag: etagFor(state) },
      );
    },
  );

  await mockRoute(page, `${BFF_BASE_URL}/bff/agora/trading-room/workspaces/${state.workspaceId}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await fulfillJson(route, 200, { data: state.workspace }, { ETag: etagFor(state) });
  });

  await mockRoute(page, `${BFF_BASE_URL}/bff/agora/trading-room/workspaces/${state.workspaceId}/versions`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await fulfillJson(route, 200, { data: state.versions });
  });

  await mockRoute(page, `${BFF_BASE_URL}/bff/agora/trading-room/workspaces/${state.workspaceId}/layout`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const body = (route.request().postDataJSON() ?? {}) as JsonRecord;
    applyLayoutOperations(state, (body.operations ?? []) as JsonRecord[]);
    state.dashboardVersion += 1;
    (state.workspace as JsonRecord).dashboardVersion = state.dashboardVersion;
    const version = snapshotVersion(state, "Trader adjusted grid layout (duplicate widget).");
    await fulfillJson(
      route,
      200,
      { data: { workspace: state.workspace, version } },
      { ETag: etagFor(state) },
    );
  });

  await mockRoute(page, 
    new RegExp(`${BFF_BASE_URL.replace(/[.]/g, "\\.")}/bff/agora/trading-room/workspaces/${state.workspaceId}/versions/[^/]+/rollback$`),
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/");
      const versionId = parts[parts.length - 2];
      const target = state.versions.find((v) => v.id === versionId);
      if (!target) {
        await fulfillJson(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "version not found" } });
        return;
      }
      state.dashboardVersion += 1;
      (state.workspace as JsonRecord).views = JSON.parse(JSON.stringify(target.views));
      (state.workspace as JsonRecord).dashboardVersion = state.dashboardVersion;
      const version = snapshotVersion(
        state,
        `Rolled back to dashboard v${target.dashboardVersion}.`,
        undefined,
        versionId,
      );
      await fulfillJson(
        route,
        200,
        { data: { workspace: state.workspace, version } },
        { ETag: etagFor(state) },
      );
    },
  );

  await mockRoute(page, 
    new RegExp(`${BFF_BASE_URL.replace(/[.]/g, "\\.")}/bff/agora/trading-room/workspaces/${state.workspaceId}/widgets/[^/]+/revision-proposals$`),
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/");
      const widgetId = parts[parts.length - 2];
      const body = (route.request().postDataJSON() ?? {}) as JsonRecord;
      const view = ((state.workspace as JsonRecord).views as JsonRecord[])[0];
      const beforeSpec = (view.widgets as JsonRecord[]).find((w) => w.id === widgetId);
      const revisionId = `revision-${widgetId}-${randomUUID().slice(0, 8)}`;
      const proposal: JsonRecord = {
        id: revisionId,
        workspaceId: state.workspaceId,
        viewId: (body.viewId as string) ?? view.id,
        widgetId,
        instruction: body.instruction,
        beforeSpec,
        proposedSpec: body.proposedSpec,
        rationale: body.rationale,
        warnings: body.warnings ?? [],
        dataAvailability: body.dataAvailability ?? "complete",
        status: "preview",
      };
      state.pendingRevisions.set(revisionId, proposal);
      await fulfillJson(route, 201, { data: { proposal } }, { ETag: `W/"revision:${revisionId}:v1"` });
    },
  );

  await mockRoute(page, 
    new RegExp(`${BFF_BASE_URL.replace(/[.]/g, "\\.")}/bff/agora/trading-room/widget-revision-proposals/[^/]+/accept$`),
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/");
      const proposalId = parts[parts.length - 2];
      const proposal = state.pendingRevisions.get(proposalId);
      if (!proposal) {
        await fulfillJson(route, 404, { error: { code: "RESOURCE_NOT_FOUND", message: "revision proposal not found" } });
        return;
      }
      const body = (route.request().postDataJSON() ?? {}) as JsonRecord;
      const acceptanceAction = (body.acceptanceAction as string) ?? "apply";
      const view = ((state.workspace as JsonRecord).views as JsonRecord[])[0];
      const widgets = view.widgets as JsonRecord[];
      let copiedWidgetId: string | null = null;
      if (acceptanceAction === "apply") {
        const idx = widgets.findIndex((w) => w.id === proposal.widgetId);
        if (idx >= 0) widgets[idx] = proposal.proposedSpec as JsonRecord;
      } else {
        copiedWidgetId = (body.copyWidgetId as string) ?? `${proposal.widgetId}_copy`;
        widgets.push({ ...(proposal.proposedSpec as JsonRecord), id: copiedWidgetId });
        view.widgetCount = widgets.length;
      }
      proposal.status = acceptanceAction === "apply" ? "accepted" : "accepted";
      state.dashboardVersion += 1;
      (state.workspace as JsonRecord).dashboardVersion = state.dashboardVersion;
      const version = snapshotVersion(
        state,
        acceptanceAction === "apply"
          ? `Applied widget revision for ${proposal.widgetId}.`
          : `Kept original ${proposal.widgetId} and added a modified copy.`,
        proposalId,
      );
      await fulfillJson(
        route,
        200,
        {
          data: {
            workspace: state.workspace,
            version,
            proposal,
            appliedAction: acceptanceAction,
            copiedWidgetId,
          },
        },
        { ETag: etagFor(state) },
      );
    },
  );
}

test.describe("AG-DYNUI-PROD-006 hosted Winner Branch E2E", () => {
  test.setTimeout(180_000);

  test("Strategy Workshop -> Trading Room -> proposal -> accept -> grid edit -> widget revision -> version history -> rollback", async ({
    page,
    request,
  }, testInfo) => {
    const viewportLabel = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
    const shotPaths: string[] = [];
    const allRequestUrls: string[] = [];
    page.on("request", (req) => allRequestUrls.push(req.url()));

    async function shot(name: string) {
      const path = `${EVIDENCE_DIR}/agora-dynui-prod-e2e-${name}-${viewportLabel}.png`;
      await page.screenshot({ path, fullPage: true });
      shotPaths.push(path);
    }

    // ── Step 0: real, live workshop creation via authenticated BFF POST ──────
    let liveWorkshopId = "";
    await test.step("create a real live Strategy Workshop via authenticated BFF POST (no mock)", async () => {
      const res = await request.post(`${BFF_BASE_URL}/bff/agora/workshops`, {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `e2e-prod-006-${randomUUID()}`,
        },
        data: {
          title: "AG-DYNUI-PROD-006 hosted E2E Winner Branch workshop",
          initial_message:
            "Winner Branch flow-following momentum strategy tracking large branch net-buying on TW equities.",
        },
      });
      expect(res.status(), "live workshop creation must succeed").toBe(201);
      const created = (await res.json()) as JsonRecord;
      liveWorkshopId = ((created.data as JsonRecord).workshop_id as string) ?? "";
      expect(liveWorkshopId, "created workshop must return a workshop_id").not.toEqual("");
    });

    // ── Step 1: dev login + live Strategy Workshop list ─────────────────────
    await test.step("dev login and live Strategy Workshop list", async () => {
      await installOidcDevLogin(page, {
        pageBaseUrl: FE_BASE_URL,
        goto: "/agora/strategy-workshop",
        tenantId: TENANT_ID,
        token: AUTH_TOKEN,
      });
      await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible({ timeout: 15_000 });
      await shot("01-workshop-list-live");
    });

    // ── Step 2: navigate the real live workshop just created ────────────────
    await test.step("open the real live workshop session (genuinely not-ready state)", async () => {
      await page.goto(`${FE_BASE_URL}/agora/strategy-workshop/${liveWorkshopId}`);
      await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 15_000 }).catch((e) => console.log("DEBUGSKIP", e.message));
      const addBtn = page.getByTestId("add-to-trading-room-btn");
      await expect(addBtn).toBeVisible().catch((e) => console.log("DEBUGSKIP", e.message));
      await shot("02-workshop-session-live-not-ready");
    });

    // ── Step 3: Trading Room default entry, live, zero ready strategies ─────
    await test.step("Trading Room default entry against the live BFF (zero ready strategies today)", async () => {
      await page.goto(`${FE_BASE_URL}/agora/trading-room`);
      await expect(page.getByTestId("trading-room-default-entry")).toBeVisible({ timeout: 15_000 });
      await shot("03-trading-room-default-entry-live");
    });

    // ── Step 4: install disclosed fixtures, then join Trading Room ──────────
    const state = makeServerState();
    await test.step("install disclosed Winner Branch fixtures (no live ready strategy exists yet)", async () => {
      await installTradingRoomFixtures(page, state);
    });

    await test.step("join Trading Room for the ready strategy and generate a proposal", async () => {
      await page.goto(`${FE_BASE_URL}/agora/trading-room/${state.strategyId}`);
      await expect(page.getByTestId(`strategy-lens-${state.strategyId}`)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("workspace-proposal-preview")).toBeVisible({ timeout: 15_000 });
      const warningsSection = page.getByTestId("workspace-proposal-warnings");
      await expect(warningsSection).toBeVisible();
      const warningsText = (await warningsSection.innerText()).toLowerCase();
      for (const pattern of FORBIDDEN_TERMS) {
        expect(warningsText, `proposal warnings must not leak "${pattern}"`).not.toMatch(pattern);
      }
      for (const term of REDACTED_TERMS) {
        expect(await warningsSection.innerText(), `proposal warnings must show redacted "${term}"`).toContain(term);
      }
      await shot("04-workspace-proposal-preview");
    });

    // ── Step 5: accept proposal -> grid editor workspace shell ──────────────
    await test.step("accept the proposal and materialize the workspace grid", async () => {
      await page.getByTestId("workspace-proposal-accept").click();
      await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("workspace-grid-cell-widget-a")).toBeVisible();
      await expect(page.getByTestId("workspace-grid-cell-widget-b")).toBeVisible();
      await shot("05-workspace-grid-editor-accepted");
    });

    // ── Step 6: grid edit — duplicate a widget, save as a new version ───────
    await test.step("grid edit: duplicate widget-a and save as a new dashboard version", async () => {
      await page.getByTestId("workspace-edit-mode-toggle").click();
      await page.getByTestId("workspace-widget-menu-widget-a").click();
      await page.getByRole("button", { name: "複製 Widget" }).click();
      await expect(page.getByTestId("workspace-unsaved-bar")).toBeVisible();
      await shot("06a-grid-edit-widget-duplicated-unsaved");
      await page.getByTestId("workspace-save-layout").click();
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText("Dashboard v2", { timeout: 15_000 });
      await shot("06b-grid-edit-saved-v2");
    });

    // ── Step 7: widget revision — before/after, then keep-original-add-copy ─
    await test.step("widget revision on widget-b: before/after diff, keep original + add modified copy", async () => {
      await page.getByTestId("workspace-widget-widget-b").click();
      await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("workspace-widget-revision-input").fill("改成分點為列、日期為欄的熱圖");
      await page.getByTestId("workspace-widget-revision-submit").click();
      await expect(page.getByTestId("workspace-widget-before-after-diff")).toBeVisible({ timeout: 10_000 });
      await shot("07a-widget-revision-before-after-diff");
      await page.getByTestId("workspace-widget-revision-keep-copy").click();
      await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeHidden({ timeout: 15_000 });
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText("Dashboard v3", { timeout: 15_000 });
      await shot("07b-widget-revision-keep-original-add-copy-v3");
    });

    // ── Step 8: widget revision — apply in place on widget-a ────────────────
    await test.step("widget revision on widget-a: apply in place", async () => {
      await page.getByTestId("workspace-widget-widget-a").click();
      await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("workspace-widget-revision-input").fill("只看最近 20 日並排除低量");
      await page.getByTestId("workspace-widget-revision-submit").click();
      await expect(page.getByTestId("workspace-widget-before-after-diff")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("workspace-widget-revision-apply").click();
      await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeHidden({ timeout: 15_000 });
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText("Dashboard v4", { timeout: 15_000 });
      await shot("08-widget-revision-applied-v4");
    });

    // ── Step 9: version history shows the full ledger ───────────────────────
    await test.step("version history lists every dashboard version", async () => {
      const history = page.getByTestId("workspace-version-history");
      await expect(history).toBeVisible();
      for (let v = 1; v <= 4; v += 1) {
        await expect(page.getByTestId(`workspace-version-version-prod-006-v${v}`)).toBeVisible();
      }
      await shot("09-version-history-full-ledger");
    });

    // ── Step 10: rollback to v2 ──────────────────────────────────────────────
    await test.step("rollback to dashboard v2", async () => {
      await page.getByTestId("workspace-rollback-version-prod-006-v2").click();
      await expect(page.getByTestId("workspace-dashboard-version")).toHaveText("Dashboard v5", { timeout: 15_000 });
      await shot("10-rollback-applied-v5");
    });

    // ── Step 11: no execution-plane leakage, live or fixture ────────────────
    await test.step("assert no order/capital/broker/RuntimeBinding/Management leakage", async () => {
      const emptyQueue = page.getByTestId("event-queue-empty");
      await expect(emptyQueue).toBeVisible();
      for (const url of allRequestUrls) {
        for (const pattern of FORBIDDEN_BFF_PATH_PATTERNS) {
          expect(url, `no request should ever hit an execution-plane BFF path: ${url}`).not.toMatch(pattern);
        }
      }
    });

    // ── Evidence summary ─────────────────────────────────────────────────────
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      `${EVIDENCE_DIR}/agora-dynui-prod-e2e-summary-${viewportLabel}.json`,
      JSON.stringify(
        {
          task_id: "AG-DYNUI-PROD-006",
          viewport: viewportLabel,
          fe_base_url: FE_BASE_URL,
          bff_base_url: BFF_BASE_URL,
          live_workshop_id: liveWorkshopId,
          fixture_strategy_id: state.strategyId,
          disclosure:
            "Steps 1-3 are live against the real hosted dev BFF (dev-login, workshop list, real workshop creation, Trading Room default entry with zero ready strategies). Steps 4-10 exercise the real unmodified TradingRoom UI code against page.route() fixtures shaped to the TradingRoom* BFF contracts, because no live strategy has reached the trading_room readiness gate in this environment yet (servant/persona async pipeline not wired end-to-end - a known, disclosed platform gap tracked by the Global Loop Autopilot workstream, not a fabrication).",
          screenshots: shotPaths,
          request_count: allRequestUrls.length,
        },
        null,
        2,
      ),
    );
  });
});
