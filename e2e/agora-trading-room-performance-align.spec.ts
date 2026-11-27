/**
 * FE-AGORA-TRADING-ROOM-PERFORMANCE-ALIGN-20261127 — recorded-fixture browser proof.
 *
 * Real Chromium against the built SPA with route fixtures (no hosted session):
 *   1. Trading Room: generated workspace shows the V11 View A decision queue
 *      (entry/add/reduce/exit together) and a stream event adds a decision
 *      without reloading the page.
 *   2. Edit mode, 交代僕人 targeting, zh-TW version/rollback labels.
 *   3. 先調整版面 on the proposal preview opens the accepted workspace in edit mode.
 *   4. Strategy Performance: rule-versus-human side by side + owner shadow route.
 *
 * Screenshots are written to the task evidence directory for the reviewer.
 * The hosted run (admintest) repeats these steps after deploy.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const TASK_ID = "FE-AGORA-TRADING-ROOM-PERFORMANCE-ALIGN-20261127";
const EVIDENCE_DIR = `docs/deployment/evidence/${TASK_ID}/screenshots`;
const AS_OF = "2026-11-27T02:00:00Z";
const STRATEGY_ID = "strat-align";
const REGISTRY_ID = "registry-align";

type Json = Record<string, unknown>;

function json(route: Route, body: unknown, headers: Record<string, string> = {}, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

function chartSpec(kind: string, encodings: Json) {
  return { spec_version: "1.0", kind, encodings };
}

function widget(id: string, title: string, widgetType: string, dataSource: string, chart: Json, placement: Json) {
  return {
    id,
    widgetType,
    title,
    purpose: `${title}`,
    whyIncluded: "V11 View A",
    dataSource,
    dataAvailability: "complete",
    query: { filters: { strategy_id: STRATEGY_ID }, limit: 50 },
    chartSpec: chart,
    interactions: [{ kind: "request_widget_revision" }],
    placement: { ...placement, minWidth: 2, minHeight: 2 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 12, height: 8 },
    sensitivity: "user_private",
    visible: true,
  };
}

const VIEWS = [
  {
    id: "strategy-overview",
    title: "策略總覽",
    purpose: "決策佇列與狀態",
    order: 1,
    layoutTemplate: "overview-grid",
    widgetCount: 2,
    dataAvailability: "complete",
    widgets: [
      widget(
        "w-queue",
        "交易裁示隊列",
        "signal_decision_queue",
        "agora.trading.events",
        chartSpec("table", {
          x: { field: "event_id", type: "nominal" },
          y: { field: "instrument", type: "nominal" },
          color: { field: "status", type: "nominal" },
        }),
        { x: 0, y: 0, width: 12, height: 3 },
      ),
      widget(
        "w-status",
        "策略狀態摘要",
        "strategy_status_summary",
        "agora.strategy.summary",
        chartSpec("metric", { value: { field: "status", type: "nominal" } }),
        { x: 0, y: 3, width: 6, height: 3 },
      ),
    ],
  },
];

const WORKSPACE = {
  id: "workspace-align",
  userId: "user-align",
  strategyId: STRATEGY_ID,
  strategyVersion: REGISTRY_ID,
  dashboardVersion: 1,
  activeViewId: "strategy-overview",
  views: VIEWS,
  status: "active",
  generatedBy: "trading_servant",
  createdAt: AS_OF,
  updatedAt: AS_OF,
};

const PROPOSAL = {
  strategyId: STRATEGY_ID,
  strategyVersion: REGISTRY_ID,
  proposalId: "proposal-align",
  generatedAt: AS_OF,
  status: "preview",
  views: VIEWS,
  rationale: "V11 贏家分點操盤室提案",
  dataAvailability: { status: "complete", sources: [] },
  warnings: [],
  personalizationApplied: { status: "not_applied", items: [] },
};

function decisionEvent(id: string, kind: string, symbol: string, state = "triggered") {
  return {
    spec_version: "1.0",
    decision_event_id: id,
    event_kind: kind,
    origin: "strategy_signal",
    strategy_id: STRATEGY_ID,
    strategy_spec_registry_id: REGISTRY_ID,
    subject: { symbol },
    state,
    triggered_at: AS_OF,
    confidence: { value: 0.8, basis: "model", calibration_state: "calibrated" },
    probability: { target_outcome: "up", horizon: "5d", value: 0.6 },
    expected_value: { horizon: "5d", unit: "pct_return", gross: 0.05, cost: 0.003, net: 0.047, downside: -0.02 },
    suggested_action: kind,
    rationale: [],
    risk_notes: [],
    evidence_refs: [],
    invalidation: { conditions: [], current_state: "valid" },
    no_order_route_proof: "agora_decision_support_only",
  };
}

const BASE_EVENTS = [
  decisionEvent("evt-entry", "entry", "2330.TW"),
  decisionEvent("evt-add", "add", "2317.TW"),
  decisionEvent("evt-reduce", "reduce", "2454.TW"),
  decisionEvent("evt-exit", "exit", "2412.TW"),
];

const PERFORMANCE_PROJECTION = {
  data: {
    strategy_id: STRATEGY_ID,
    period: "latest",
    environment: "paper",
    no_order_route_proof: "agora_performance_read_only",
    freshness: { snapshot_at: AS_OF, as_of: AS_OF, projection_revision: 1, projection_generation: 1, unavailable_sources: [] },
    compliance: { availability: { status: "available", reason: null, source_ids: ["compliance"], as_of: AS_OF }, metrics: [] },
    interventions: {
      availability: { status: "available", reason: null, source_ids: ["interventions"], as_of: AS_OF },
      aggregate: { total: 2, by_status: { recorded: 2 } },
      items: [
        { intervention_id: "iv-linked", kind: "manual_override", status: "recorded", occurred_at: AS_OF, source_id: "intervention-ledger", evidence_refs: ["evt-exit"] },
        { intervention_id: "iv-unlinked", kind: "manual_override", status: "recorded", occurred_at: AS_OF, source_id: "intervention-ledger", evidence_refs: ["journey-evt-9"] },
      ],
    },
    execution_history: { availability: { status: "available", reason: null, source_ids: ["journeys"], as_of: AS_OF }, items: [] },
    warnings: { availability: { status: "available", reason: null, source_ids: ["warnings"], as_of: AS_OF }, items: [] },
    adjustment_suggestions: { availability: { status: "available", reason: null, source_ids: ["suggestions"], as_of: AS_OF }, items: [] },
  },
  meta: { snapshot_at: AS_OF },
};

const SHADOW = {
  status: "ok",
  owner: "attribution+agora",
  empty: false,
  data: {
    decision_id: "hd-exit",
    decision_event_id: "evt-exit",
    comparison_state: "settled",
    arms: [
      { arm: "human_actual", decision_detail: { available: true, decision: "defer", rationale: "財報公布前先觀望" }, settlement_source: "pantheon_paper_proxy", outcome: { pnl: 0.012 }, settled_at: AS_OF, unavailable_reason: null },
      { arm: "private_servant", decision_detail: { available: true, suggested_action: "exit" }, settlement_source: "market_data_replay", outcome: { pnl: 0.004 }, settled_at: AS_OF, unavailable_reason: null },
      { arm: "base_strategy", decision_detail: { available: true, suggested_action: "exit" }, settlement_source: "market_data_replay", outcome: { pnl: -0.008 }, settled_at: AS_OF, unavailable_reason: null },
      { arm: "committee_variant", decision_detail: { available: false, unavailable_reason: "committee_variant_arm_not_recorded" }, settlement_source: null, outcome: null, settled_at: null, unavailable_reason: "arm_not_reported_by_attribution_owner" },
    ],
  },
  meta: { snapshot_at: AS_OF, sources: { attribution: "ok", agora: "ok" } },
};

function aggregate() {
  return {
    spec_version: "1.0",
    user_scope_ref: "align-scope",
    strategies: [{
      strategy_id: STRATEGY_ID,
      strategy_spec_registry_id: REGISTRY_ID,
      title: "對齊驗證策略",
      readiness_state: "ready",
      monitoring_state: "monitoring",
      pending_event_counts: { entry: 1, add: 1, reduce: 1, exit: 1, review: 0 },
      dashboard_recipe_id: "recipe-align",
    }],
    queue_summary: { entry: 1, add: 1, reduce: 1, exit: 1, review: 0 },
    risk_summary: { state: "normal" },
    snapshot_at: AS_OF,
    data_cutoff: AS_OF,
  };
}

interface FixtureState {
  eventListCalls: number;
  streamCalls: number;
  shadowCalls: string[];
  workspaceSaved: boolean;
}

async function installFixture(page: Page, options: { savedWorkspace: boolean }): Promise<FixtureState> {
  const state: FixtureState = { eventListCalls: 0, streamCalls: 0, shadowCalls: [], workspaceSaved: options.savedWorkspace };
  await page.route((url) => url.pathname.startsWith("/bff/"), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path === "/bff/me") {
      return json(route, {
        data: {
          user: { id: "align-operator", displayName: "Align Operator", email: "align@pantheon.local" },
          tenant: { id: "tenant-a", name: "Align", tz: "UTC", locale: "zh-TW", baseCurrency: "USD" },
          roles: ["operator", "viewer"],
          capabilities: ["agora.read"],
          env: "dev",
          featureFlags: {},
          serverTime: AS_OF,
          sessionExpiresAt: "2026-11-28T02:00:00Z",
          permissionsVersion: "align-v1",
        },
      });
    }
    if (path === "/bff/agora/trading-room") return json(route, { data: aggregate() });
    if (path === "/bff/agora/trading-room/decision-events") {
      state.eventListCalls += 1;
      const items = state.streamCalls > 0 && state.eventListCalls > 1
        ? [...BASE_EVENTS, decisionEvent("evt-add-2", "add", "3008.TW")]
        : BASE_EVENTS;
      return json(route, { data: { items }, page_info: { total: items.length, page_size: items.length } }, { ETag: `"events-v${state.eventListCalls}"` });
    }
    if (path === "/bff/agora/trading-room/stream") {
      state.streamCalls += 1;
      const frames = state.streamCalls === 1
        ? 'id: e1\ndata: {"id":"e1","type":"trading_room.connected","data":{"status":"ready"}}\n\n'
          + 'id: e2\ndata: {"id":"e2","type":"trading_room.decision.recorded","data":{"decision_event_id":"evt-add-2"}}\n\n'
        : "";
      return route.fulfill({ status: 200, contentType: "text/event-stream", headers: { "Cache-Control": "no-cache" }, body: frames });
    }
    if (path === `/bff/agora/strategies/${STRATEGY_ID}/trading-room/workspace`) {
      if (!state.workspaceSaved) return json(route, { error: { code: "RESOURCE_NOT_FOUND", message: "no saved workspace" } }, {}, 404);
      return json(route, { data: WORKSPACE }, { ETag: '"ws-v1"' });
    }
    if (path === `/bff/agora/strategies/${STRATEGY_ID}/trading-room/proposals` && method === "POST") {
      return json(route, { data: PROPOSAL }, { ETag: '"proposal-v1"' }, 201);
    }
    if (path === `/bff/agora/strategies/${STRATEGY_ID}/trading-room/proposals/proposal-align/accept` && method === "POST") {
      state.workspaceSaved = true;
      return json(route, { data: { workspace: WORKSPACE, version: { id: "version-001", dashboardVersion: 1, generatedBy: "trading_servant", changeSummary: "初版", createdAt: AS_OF } } }, { ETag: '"ws-v1"' });
    }
    if (path === "/bff/agora/trading-room/workspaces/workspace-align/versions") {
      return json(route, { data: [
        { id: "version-001", workspaceId: "workspace-align", dashboardVersion: 1, generatedBy: "trading_servant", changeSummary: "初版", createdAt: AS_OF },
        { id: "version-002", workspaceId: "workspace-align", dashboardVersion: 2, generatedBy: "user_modified", changeSummary: "使用者調整", createdAt: AS_OF },
      ] });
    }
    if (path === `/bff/agora/trading-room/strategies/${STRATEGY_ID}/performance`) return json(route, PERFORMANCE_PROJECTION);
    if (path === "/bff/agora/trading-room/performance-attribution/by-strategy") {
      return json(route, {
        data: {
          dimensions: ["strategy"], id: "perf", period: "latest",
          summary: { basis: "live_telemetry", dimensions: ["strategy"], holding_count: 0, period: "latest", returned_row_count: 1, row_count: 1, runtime_count: 0, supported_dimensions: ["strategy"], telemetry_runtime_count: 0, total_trades: 0 },
          items: [{ dimension: "strategy", dimension_key: STRATEGY_ID, label: "對齊驗證策略", metrics: {}, source_refs: { strategy_ids: [STRATEGY_ID] } }],
        },
        meta: { policy: "read_only_performance_attribution", snapshot_at: AS_OF },
        page_info: { next_page_token: null, page_size: 50, total: 1 },
      });
    }
    if (path === "/bff/agora/trading-room/decision-events/evt-exit/shadow-comparison") {
      state.shadowCalls.push(path);
      return json(route, SHADOW);
    }
    if (path.startsWith("/bff/agora/trading-room/decision-events/") && path.endsWith("/shadow-comparison")) {
      state.shadowCalls.push(path);
      return json(route, { status: "empty", empty: true, owner: "agora", data: { comparison_state: "no_decision_recorded", arms: [] } });
    }
    if (path === "/bff/agora/operational-readiness") {
      return json(route, { data: { status: "healthy", source: { freshness: "fresh", source_instance_id: "src-1", snapshot_id: "snap-1" }, signal_producer: { producer_id: "producer-1", status: "healthy" }, surfaces: {} } });
    }
    return json(route, { items: [] });
  });
  // Route fixtures must be registered before the loopback login so the
  // session bootstrap (/bff/me) is answered by the fixture.
  await installOidcDevLogin(page, { goto: false, roles: ["operator", "viewer"], tenantId: "tenant-a" });
  await installQuietEventSource(page);
  return state;
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: false });
}

test.describe("FE-AGORA-TRADING-ROOM-PERFORMANCE-ALIGN-20261127 recorded-fixture proof", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("decision queue in the generated view updates from the stream; edit mode and 交代僕人 are zh-TW", async ({ page }) => {
    const state = await installFixture(page, { savedWorkspace: true });
    await page.goto(`/agora/trading-room/${STRATEGY_ID}?strategyVersion=${REGISTRY_ID}`);
    await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({ timeout: 30_000 });

    const queue = page.getByTestId("decision-queue-widget");
    await expect(queue).toBeVisible();
    for (const lane of ["entry", "add", "reduce", "exit"]) {
      await expect(page.getByTestId(`decision-queue-lane-${lane}`)).toBeVisible();
    }
    // The stream delivers a decision event; the queue grows without a reload.
    await expect(page.getByTestId("decision-queue-lane-add-count")).toHaveText("2", { timeout: 20_000 });
    await expect(page.getByTestId("decision-queue-item-evt-add-2")).toBeVisible();
    expect(state.streamCalls).toBeGreaterThan(0);
    await shot(page, "01-decision-queue-live-in-view");

    // Header 交代僕人 asks the trader to pick a widget when none is selected.
    await page.getByTestId("workspace-header-ask-servant").click();
    await expect(page.getByTestId("workspace-error")).toHaveText("請先點選要交代僕人修改的元件，再按「交代僕人」。");

    // Edit mode: zh-TW labels, no raw i18n key paths.
    await page.getByTestId("workspace-edit-mode-toggle").click();
    await expect(page.getByTestId("workspace-edit-mode-toggle")).toHaveText("完成調整");
    await page.getByTestId("workspace-widget-w-status").click();
    await expect(page.getByTestId("workspace-selected-widget")).toContainText("策略狀態摘要");
    await expect(page.getByTestId("workspace-header-version-history")).toHaveText("版本紀錄");
    await expect(page.getByTestId("workspace-rollback-version-002")).toHaveText("回滾到此版本");
    await expect(page.locator("body")).not.toContainText(/agora\.tradingRoom\./);
    await shot(page, "02-edit-mode-zh-tw");

    await page.getByTestId("workspace-edit-mode-toggle").click();
    await page.getByTestId("workspace-header-ask-servant").click();
    await expect(page.getByTestId("workspace-widget-revision-drawer")).toBeVisible();
    await shot(page, "03-ask-servant-selected-widget");
  });

  test("先調整版面 accepts the preview and opens edit mode", async ({ page }) => {
    await installFixture(page, { savedWorkspace: false });
    await page.goto(`/agora/trading-room/${STRATEGY_ID}?strategyVersion=${REGISTRY_ID}`);
    await expect(page.getByTestId("workspace-proposal-preview")).toBeVisible({ timeout: 30_000 });
    await shot(page, "04-proposal-preview");
    await page.getByTestId("workspace-proposal-adjust-layout").click();
    await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("workspace-edit-mode-toggle")).toHaveText("完成調整");
    await expect(page.getByTestId("workspace-edit-toolbar")).toBeVisible();
    await shot(page, "05-adjust-layout-opens-edit-mode");
  });

  test("Strategy Performance shows rule vs human side by side and the owner shadow comparison", async ({ page }) => {
    const state = await installFixture(page, { savedWorkspace: true });
    await page.goto("/agora/strategy-performance");
    await expect(page.getByTestId("strategy-performance-page")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("performance-tab-intv").click();
    await expect(page.getByRole("heading", { name: "照規則 vs 人工干預" })).toBeVisible();

    const linked = page.getByTestId("rule-vs-human-iv-linked");
    await expect(linked).toBeVisible();
    await expect(page.getByTestId("rule-vs-human-iv-linked-rule")).toContainText("exit");
    await expect(page.getByTestId("rule-vs-human-iv-linked-human")).toContainText("延後觀察");
    await expect(page.getByTestId("rule-vs-human-iv-linked-reason")).toContainText("財報公布前先觀望");
    await expect(page.getByTestId("rule-vs-human-iv-linked-result")).toContainText("+1.20%");
    await expect(page.getByTestId("rule-vs-human-iv-linked-shadow")).toContainText("-0.80%");
    await expect(page.getByTestId("rule-vs-human-iv-unlinked-unlinked")).toContainText("未連結裁示事件");
    await expect(page.getByTestId("rule-vs-human-iv-unlinked-rule")).toContainText("未回報");
    await expect(page.getByTestId("performance-shadow-section")).toBeVisible();
    await page.getByTestId("shadow-select-evt-exit").click();
    await expect(page.getByTestId("shadow-arm-human_actual")).toBeVisible();
    await expect(page.getByTestId("shadow-arm-committee_variant")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/not reported/i);
    expect(state.shadowCalls.every((path) => path.startsWith("/bff/agora/trading-room/decision-events/"))).toBe(true);
    await shot(page, "06-performance-rule-vs-human");
  });
});
