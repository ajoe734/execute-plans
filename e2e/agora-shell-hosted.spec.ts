/**
 * AG-UIPOL-002 - hosted standalone Agora shell scroll/header proof.
 *
 * This spec runs only when the Pantheon dev frontend URL is supplied. It does
 * not intercept Agora responses: every tab renders against the deployed BFF.
 * A hosted URL therefore requires an explicit short-lived BFF auth token.
 */

import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  installOidcDevLogin,
  roleTokenFromEnv,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE_URL = (
  process.env.AG_UIPOL_002_FE_BASE_URL ||
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  ""
).replace(/\/+$/, "");
const IS_HOSTED_FE = Boolean(
  FE_BASE_URL && targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: FE_BASE_URL }),
);
const AUTH_TOKEN = roleTokenFromEnv("operator", [
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/ag-uipol-002";

if (IS_HOSTED_FE && !AUTH_TOKEN) {
  throw new Error("AG-UIPOL-002 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN");
}

const VIEWPORTS = [
  { name: "desktop-narrow", width: 1280, height: 900 },
  { name: "desktop-wide", width: 2560, height: 1440 },
] as const;

const ORIGINAL_IA_VIEWPORTS = [
  { name: "1600px", width: 1600, height: 960 },
  { name: "720px", width: 720, height: 960 },
  { name: "390px", width: 390, height: 844 },
] as const;

const TABS = [
  { name: "trading-room", path: "/agora/trading-room" },
  { name: "strategy-workshop", path: "/agora/strategy-workshop" },
  { name: "strategy-performance", path: "/agora/strategy-performance" },
] as const;

async function expectSinglePageScrollOwner(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="agora-standalone-shell"]');
    const main = document.querySelector<HTMLElement>('[data-testid="trading-desk-main"]');
    if (!shell || !main) throw new Error("Agora shell scroll surfaces were not rendered");

    return {
      bodyHeight: document.body.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      mainOverflowX: getComputedStyle(main).overflowX,
      mainOverflowY: getComputedStyle(main).overflowY,
      shellHeight: shell.getBoundingClientRect().height,
      shellOverflow: getComputedStyle(shell).overflow,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });

  expect(dimensions.bodyHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.shellHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  expect(dimensions.shellOverflow).toBe("hidden");
  expect(dimensions.mainOverflowX).toBe("hidden");
  expect(dimensions.mainOverflowY).toBe("auto");
}

test.describe("AG-UIPOL-002 hosted standalone Agora shell", () => {
  test.skip(
    !IS_HOSTED_FE,
    "Set AG_UIPOL_002_FE_BASE_URL or PANTHEON_FE_BASE_URL to an absolute hosted frontend URL.",
  );
  test.setTimeout(120_000);

  for (const viewport of VIEWPORTS) {
    for (const tab of TABS) {
      test(`${tab.name} has one page scroll owner at ${viewport.name}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await installOidcDevLogin(page, {
          goto: false,
          pageBaseUrl: FE_BASE_URL,
          tenantId: TENANT_ID,
          token: AUTH_TOKEN,
        });

        await page.goto(`${FE_BASE_URL}${tab.path}`);
        await expect(page.getByTestId("agora-standalone-shell")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("trading-desk-main")).toBeVisible();
        await expectSinglePageScrollOwner(page);

        if (tab.name === "strategy-workshop") {
          const runtimeHeader = page.getByTestId("strategy-workshop-runtime-header");
          await expect(runtimeHeader).toBeVisible({ timeout: 30_000 });
          await expect(runtimeHeader.locator("h1, h2, h3, h4, h5, h6")).toHaveCount(0);
        }

        mkdirSync(EVIDENCE_DIR, { recursive: true });
        const screenshotPath = `${EVIDENCE_DIR}/ag-uipol-002-${tab.name}-${viewport.name}.png`;
        await page.screenshot({ path: screenshotPath });
        await testInfo.attach(`ag-uipol-002-${tab.name}-${viewport.name}`, {
          path: screenshotPath,
          contentType: "image/png",
        });
      });
    }
  }

  for (const viewport of ORIGINAL_IA_VIEWPORTS) {
    test(`FE-AGORA-SHELL-ORIGINAL-IA-20261127 header, three zh-TW tabs, command bar, and round trip at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installOidcDevLogin(page, {
        goto: false,
        pageBaseUrl: FE_BASE_URL,
        tenantId: TENANT_ID,
        token: AUTH_TOKEN,
      });

      await page.goto(`${FE_BASE_URL}/agora/trading-room`);
      await expect(page.getByTestId("agora-standalone-shell")).toBeVisible({ timeout: 30_000 });
      await expectSinglePageScrollOwner(page);

      const tabBar = page.getByTestId("trading-desk-tab-bar");
      const tabButtons = tabBar.locator("button");
      await expect(tabButtons).toHaveCount(3);
      await expect(tabButtons.nth(0)).toHaveText("交易操盤室");
      await expect(tabButtons.nth(1)).toHaveText("策略工坊");
      await expect(tabButtons.nth(2)).toHaveText("策略執行與績效");
      await expect(page.getByTestId("trading-desk-bottom-strip")).toHaveCount(0);

      const commandBar = page.getByTestId("trading-desk-command-bar");
      await expect(page.getByTestId("trader-display-name")).toBeVisible();
      await expect(page.getByTestId("trader-style")).toBeVisible();
      await expect(page.getByTestId("trading-desk-market-state")).toContainText("市場狀態：");
      await expect(commandBar).not.toContainText("Agora Servant");
      await expect(page.getByTestId("trading-desk-sign-out")).toHaveText("登出");
      await expect(page.getByTestId("trading-desk-quick-tasks").locator("button")).toHaveCount(10);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      const shellShot = `${EVIDENCE_DIR}/fe-agora-shell-original-ia-20261127-shell-${viewport.name}.png`;
      await page.screenshot({ path: shellShot });
      await testInfo.attach(`fe-agora-shell-original-ia-20261127-shell-${viewport.name}`, {
        path: shellShot,
        contentType: "image/png",
      });

      if (viewport.width === 1600) {
        const input = page.getByTestId("trading-desk-command-input");
        await expect(input).toBeEnabled({ timeout: 30_000 });
        await input.fill("檢查目前策略視角與進場條件");
        await page.getByTestId("trading-desk-command-submit").click();
        await expect(page.getByTestId("trading-desk-servant-drawer")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("servant-command-reply")).toBeVisible({ timeout: 60_000 });

        const roundTripShot = `${EVIDENCE_DIR}/fe-agora-shell-original-ia-20261127-command-roundtrip-${viewport.name}.png`;
        await page.screenshot({ path: roundTripShot });
        await testInfo.attach(`fe-agora-shell-original-ia-20261127-command-roundtrip-${viewport.name}`, {
          path: roundTripShot,
          contentType: "image/png",
        });
      }
    });
  }

  test("FE-AGORA-GLOBAL-DRAWERS-20261127 opens all six global drawers and submits & reads back a 修正助理 feedback item", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 960 });
    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE_URL,
      tenantId: TENANT_ID,
      token: AUTH_TOKEN,
    });

    await page.goto(`${FE_BASE_URL}/agora/trading-room`);
    await expect(page.getByTestId("agora-standalone-shell")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("trading-desk-global-drawers")).toBeVisible();

    mkdirSync(EVIDENCE_DIR, { recursive: true });

    const drawerSteps = [
      {
        trigger: "global-drawer-trigger-servant",
        drawer: "trading-desk-servant-drawer",
        name: "01-servant-tasks-drawer",
      },
      {
        trigger: "global-drawer-trigger-shadow",
        drawer: "trading-desk-shadow-drawer",
        name: "02-shadow-drawer",
      },
      {
        trigger: "global-drawer-trigger-journal",
        drawer: "trading-desk-journal-drawer",
        name: "03-journal-replay-drawer",
      },
      {
        trigger: "global-drawer-trigger-expert-review",
        drawer: "trading-desk-expert-review-drawer",
        name: "04-expert-review-drawer",
      },
      {
        trigger: "global-drawer-trigger-layout",
        drawer: "trading-desk-layout-drawer",
        name: "05-layout-adjustment-drawer",
      },
      {
        trigger: "global-drawer-trigger-personalization",
        drawer: "trading-desk-personalization-drawer",
        name: "06-personalization-drawer",
      },
    ] as const;

    for (const step of drawerSteps) {
      await page.getByTestId(step.trigger).click();
      await expect(page.getByTestId(step.drawer)).toBeVisible({ timeout: 20_000 });
      const shotPath = `${EVIDENCE_DIR}/fe-agora-global-drawers-20261127-${step.name}.png`;
      await page.screenshot({ path: shotPath });
      await testInfo.attach(`fe-agora-global-drawers-20261127-${step.name}`, {
        path: shotPath,
        contentType: "image/png",
      });
    }

    // Submit a 修正助理 signal-feedback item and verify readback without typing a persona ID
    await page.getByTestId("global-drawer-trigger-servant").click();
    await expect(page.getByTestId("trading-desk-servant-drawer")).toBeVisible();
    await expect(page.getByTestId("servant-correction-section")).toBeVisible();

    const feedbackText = "量縮跌破五日均量時請先提示減碼，不建議追高";
    await page.getByTestId("servant-correction-kind-signal-feedback").click();
    await page.getByTestId("servant-correction-content-input").fill(feedbackText);
    await page.getByTestId("servant-correction-submit").click();
    await expect(page.getByTestId("servant-correction-readback-summary")).toContainText(
      feedbackText,
      { timeout: 30_000 },
    );

    const feedbackShot = `${EVIDENCE_DIR}/fe-agora-global-drawers-20261127-07-correction-readback.png`;
    await page.screenshot({ path: feedbackShot });
    await testInfo.attach("fe-agora-global-drawers-20261127-07-correction-readback", {
      path: feedbackShot,
      contentType: "image/png",
    });
  });
});

const DRAWER_PROOF_DIR = "docs/deployment/evidence/FE-AGORA-GLOBAL-DRAWERS-20261127/screenshots";
const AS_OF = "2026-11-27T08:00:00Z";
const STRATEGY_ID = "strat-winner-v4";
const REGISTRY_ID = "reg-winner-v4";

function jsonFulfill(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

async function installGlobalDrawersFixture(page: Page): Promise<{ managementCalls: string[] }> {
  const managementCalls: string[] = [];
  const recordedEvidence: Array<Record<string, unknown>> = [];

  await page.route((url) => url.pathname.startsWith("/bff/"), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.startsWith("/bff/management")) {
      managementCalls.push(path);
    }

    if (path === "/bff/me") {
      return jsonFulfill(route, {
        data: {
          user: { id: "admintest", displayName: "admintest", email: "admintest@pantheon.local" },
          tenant: { id: "pantheon-dev", name: "Pantheon Dev", tz: "Asia/Taipei", locale: "zh-TW", baseCurrency: "TWD" },
          session: { authenticated: true, session_kind: "bearer" },
          environment: { name: "dev", deployment_stage: "dev" },
          roles: ["operator", "admin"],
          capabilities: [
            "agora.read",
            "agora.write",
            "agora.servant.v1",
            "agora.session.v1",
            "agora.trading.v1",
            "agora.persona.interaction.v1",
          ],
          env: "dev",
          featureFlags: {},
          serverTime: AS_OF,
          sessionExpiresAt: "2026-11-28T08:00:00Z",
          permissionsVersion: "drawers-v1",
        },
      });
    }

    if (path === "/bff/agora/me") {
      return jsonFulfill(route, {
        data: {
          scope_id: "scope-admintest",
          tenant_id: "pantheon-dev",
          user_id: "admintest",
          operator_id: "admintest",
          display_name: "admintest",
          trading_style: "分點籌碼與波段交易",
          market_state: "台股模擬盤監控中",
          roles: ["operator"],
          granted_capabilities: [
            "agora.identity.v1",
            "agora.servant.v1",
            "agora.session.v1",
            "agora.trading.v1",
            "agora.workshop.v1",
            "agora.research.v1",
            "agora.persona.interaction.v1",
          ],
        },
      });
    }

    if (path === "/bff/agora/servant") {
      return jsonFulfill(route, {
        data: {
          spec_version: "1.0",
          persona_id: "agora-servant-admintest",
          display_name: "專屬僕人",
          status: "paper_only",
          tenant_id: "pantheon-dev",
          agora_user_id: "admintest",
          persona_class: "agora_servant",
          owner_scope: "user_private",
          visibility_scope: "private",
          memory_scope: "private_user",
          capability_summary: {
            can_ask: true,
            can_research: true,
            can_workshop: true,
          },
          policy: {
            persona_class: "agora_servant",
            owner_scope: "user_private",
            visibility_scope: "private",
            memory_scope: "private_user",
            persona_registry_backed: true,
            execution_authority: "none",
            prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"],
          },
          last_active_at: AS_OF,
        },
      });
    }

    if (path === "/bff/agora/servant/sessions" && method === "POST") {
      return jsonFulfill(
        route,
        {
          data: {
            session_id: "sess-admintest-001",
            servant_persona_id: "agora-servant-admintest",
            session_type: "interactive",
            status: "active",
            state: "active",
            intent: "檢查分點籌碼異常",
            strategy_ref: STRATEGY_ID,
            metadata: {},
            created_at: AS_OF,
            updated_at: AS_OF,
          },
        },
        201,
      );
    }

    if (path === "/bff/agora/servant/sessions/sess-admintest-001" && method === "GET") {
      return jsonFulfill(route, {
        data: {
          session_id: "sess-admintest-001",
          servant_persona_id: "agora-servant-admintest",
          session_type: "interactive",
          status: "active",
          state: "active",
          metadata: {},
        },
      });
    }

    if (path === "/bff/agora/servant/sessions/sess-admintest-001/messages" && method === "POST") {
      return jsonFulfill(
        route,
        {
          status: "accepted",
          data: {
            message_id: "servant-msg-001",
            session_id: "sess-admintest-001",
            session_type: "interactive",
            servant_persona_id: "agora-servant-admintest",
            provider: {
              status: "completed",
              answer: "已完成「贏家分點」策略今日主力分點連續買超比對，共 3 檔符合條件。",
              error: null,
            },
          },
        },
        202,
      );
    }

    if (path === "/bff/agora/servant/sessions/sess-admintest-001/stream") {
      const sse = [
        "id: sess-admintest-001:created",
        "event: servant.session.created",
        'data: {"session_id":"sess-admintest-001","session_type":"interactive","servant_persona_id":"agora-servant-admintest"}',
        "",
        "id: servant-msg-u-001",
        "event: servant.message.accepted",
        'data: {"session_id":"sess-admintest-001","message_id":"servant-msg-u-001","role":"user","content":"檢查分點籌碼異常"}',
        "",
        "id: servant-msg-001",
        "event: servant.message.completed",
        'data: {"session_id":"sess-admintest-001","message_id":"servant-msg-001","turn_id":"turn-001","provider_status":"completed","answer":"已完成「贏家分點」策略今日主力分點連續買超比對，共 3 檔符合條件。"}',
        "",
        "",
      ].join("\n");
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse,
      });
    }

    if (
      (path === "/bff/agora/signal-feedback" ||
        path === "/bff/agora/notes" ||
        path === "/bff/agora/insights" ||
        path === "/bff/agora/training-examples") &&
      method === "POST"
    ) {
      const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
      const record = {
        evidence_id: String(body.evidence_id || "ev-001"),
        persona_id: String(body.persona_id || "agora-servant-admintest"),
        evidence_type: path.replace("/bff/agora/", "").replace("-", "_"),
        subject_ref: String(body.subject_ref || `strategy:${STRATEGY_ID}`),
        content: (body.content as Record<string, unknown>) || {},
        captured_at: AS_OF,
      };
      recordedEvidence.unshift(record);
      return jsonFulfill(
        route,
        {
          status: "created",
          idempotent: false,
          data: record,
        },
        201,
      );
    }

    if (path.startsWith("/bff/agora/human-evidence/") && method === "GET") {
      const evId = decodeURIComponent(path.slice("/bff/agora/human-evidence/".length));
      const found = recordedEvidence.find((item) => item.evidence_id === evId) || recordedEvidence[0];
      return jsonFulfill(route, {
        status: "ok",
        data: found || {
          evidence_id: evId,
          persona_id: "agora-servant-admintest",
          subject_ref: `strategy:${STRATEGY_ID}`,
          content: { summary: "已讀回修正項目" },
        },
      });
    }

    if (path.startsWith("/bff/agora/personas/") && path.endsWith("/human-evidence") && method === "GET") {
      if (recordedEvidence.length === 0) {
        return jsonFulfill(route, {
          status: "unavailable",
          reason: "no_new_human_evidence",
          items: [],
          total: 0,
        });
      }
      return jsonFulfill(route, {
        status: "ok",
        reason: null,
        items: recordedEvidence,
        total: recordedEvidence.length,
      });
    }

    if (path === "/bff/agora/trading-room") {
      return jsonFulfill(route, {
        data: {
          spec_version: "1.0",
          user_scope_ref: "admintest-scope",
          strategies: [
            {
              strategy_id: STRATEGY_ID,
              strategy_spec_registry_id: REGISTRY_ID,
              title: "贏家分點波段策略",
              readiness_state: "ready",
              monitoring_state: "monitoring",
              pending_event_counts: { entry: 1, add: 0, reduce: 1, exit: 0, review: 0 },
              dashboard_recipe_id: "recipe-winner",
            },
          ],
          queue_summary: { entry: 1, add: 0, reduce: 1, exit: 0, review: 0 },
          risk_summary: { state: "normal" },
          snapshot_at: AS_OF,
          data_cutoff: AS_OF,
        },
      });
    }

    if (path === "/bff/agora/trading-room/decision-events") {
      const items = [
        {
          spec_version: "1.0",
          decision_event_id: "evt-2330-entry",
          event_kind: "entry",
          origin: "strategy_signal",
          strategy_id: STRATEGY_ID,
          strategy_spec_registry_id: REGISTRY_ID,
          subject: { symbol: "2330.TW" },
          state: "decided",
          triggered_at: AS_OF,
          confidence: { value: 0.86, basis: "model", calibration_state: "calibrated" },
          probability: { target_outcome: "up", horizon: "5d", value: 0.68 },
          expected_value: { horizon: "5d", unit: "pct_return", gross: 0.042, cost: 0.002, net: 0.04, downside: -0.015 },
          suggested_action: "enter",
          rationale: [{ claim: "外資與關鍵分點同步連續三日買超", confidence: 0.86 }],
          risk_notes: [],
          evidence_refs: [],
          invalidation: { conditions: [], current_state: "valid" },
          no_order_route_proof: "agora_decision_support_only",
        },
      ];
      return jsonFulfill(route, {
        data: { items },
        page_info: { total: 1, page_size: 20 },
      });
    }

    if (path.startsWith("/bff/agora/trading-room/decision-events/") && path.endsWith("/shadow-comparison")) {
      return jsonFulfill(route, {
        status: "ok",
        owner: "attribution+agora",
        data: {
          decision_id: "evt-2330-entry",
          decision_event_id: "evt-2330-entry",
          comparison_state: "settled",
          arms: [
            {
              arm: "human_actual",
              decision_detail: {
                available: true,
                decision: "enter",
                execution_observation_kind: "pantheon_paper_proxy",
                execution_display_label: "交易員決策（紙上代理）",
              },
              settlement_source: "pantheon_paper_proxy",
              outcome: { pnl: 0.024 },
              settled_at: AS_OF,
              unavailable_reason: null,
            },
            {
              arm: "private_servant",
              decision_detail: { available: true, suggested_action: "enter" },
              settlement_source: "market_data_replay",
              outcome: { pnl: 0.026 },
              settled_at: AS_OF,
              unavailable_reason: null,
            },
            {
              arm: "base_strategy",
              decision_detail: { available: true, suggested_action: "enter" },
              settlement_source: "market_data_replay",
              outcome: { pnl: 0.021 },
              settled_at: AS_OF,
              unavailable_reason: null,
            },
            {
              arm: "committee_variant",
              decision_detail: { available: true, suggested_action: "hold" },
              settlement_source: "market_data_replay",
              outcome: { pnl: 0.011 },
              settled_at: AS_OF,
              unavailable_reason: null,
            },
          ],
        },
        meta: { snapshot_at: AS_OF, sources: { attribution: "ok", agora: "ok" } },
      });
    }

    if (path === "/bff/agora/journal") {
      return jsonFulfill(route, {
        data: [
          {
            id: "j-20261127-01",
            title: "台積電關鍵分點買超進場日誌",
            body: "關鍵贏家分點連續三日買超且量能溫和放大，依計畫建倉。",
            tags: ["entry", "chip"],
            linkedStrategyIds: [STRATEGY_ID],
            linkedPersonaIds: ["agora-servant-admintest"],
            visibility: "private",
            createdAt: "2026-11-27T06:30:00Z",
            updatedAt: "2026-11-27T06:35:00Z",
            version: 1,
          },
        ],
      });
    }

    if (path === "/bff/agora/decision-journal") {
      return jsonFulfill(route, {
        items: [
          {
            entry_id: "dj-20261127-02",
            title: "聯發科量縮減碼決策鏈紀錄",
            body: "突破後量能低於五日均量，依風控規則先行減碼 50%。",
            tags: ["reduce", "risk"],
            linked_strategy_ids: [STRATEGY_ID],
            linked_persona_ids: ["agora-servant-admintest"],
            visibility: "private",
            created_at: "2026-11-27T07:30:00Z",
            updated_at: "2026-11-27T07:45:00Z",
            version: 2,
          },
        ],
      });
    }

    if (path === "/bff/agora/interactions/participants:eligible" && method === "POST") {
      return jsonFulfill(route, {
        data: {
          included: [
            {
              persona_id: "per_quant",
              display_name: "量化因子審視專家",
              eligible: true,
              reasons: ["具備籌碼與動能因子審視能力"],
              recommended: true,
            },
            {
              persona_id: "per_risk",
              display_name: "風控與部位審視專家",
              eligible: true,
              reasons: ["具備尾端風險與流動性審視能力"],
              recommended: true,
            },
          ],
          excluded: [],
        },
      });
    }

    if (path === "/bff/agora/interactions/context:resolve" && method === "POST") {
      return jsonFulfill(route, {
        data: {
          workshop_id: "wksp-expert-review-01",
          context_refs: [{ type: "strategy", id: STRATEGY_ID, version_id: REGISTRY_ID }],
          context_digest: "digest-winner-v4",
          environment: "paper",
          verified: true,
          resolved_at: AS_OF,
        },
      });
    }

    if (path === "/bff/agora/interactions" && method === "POST") {
      return jsonFulfill(
        route,
        {
          data: {
            interaction_id: "int-expert-review-001",
            workshop_id: "wksp-expert-review-01",
            mode: "challenge",
            topic: "挑戰目前分點集中度指標在量縮盤的穩定度",
            participants: ["per_quant", "per_risk"],
            context_refs: [{ type: "strategy", id: STRATEGY_ID, version_id: REGISTRY_ID }],
            status: "queued",
            execution_authority: "none",
            no_capital_authority_proof: "agora_advisory_only",
            submitted_at: AS_OF,
          },
        },
        202,
      );
    }

    if (
      path === `/bff/agora/strategies/${STRATEGY_ID}/trading-room/workspace` ||
      path === `/bff/agora/trading-room/strategies/${STRATEGY_ID}/workspace`
    ) {
      return jsonFulfill(
        route,
        {
          data: {
            id: "ws-winner-001",
            userId: "admintest",
            strategyId: STRATEGY_ID,
            strategyVersion: REGISTRY_ID,
            dashboardVersion: 2,
            activeViewId: "view-chip",
            status: "active",
            generatedBy: "trading_servant",
            createdAt: AS_OF,
            updatedAt: AS_OF,
            views: [
              {
                id: "view-chip",
                title: "分點籌碼與裁示總覽",
                purpose: "追蹤主力分點買賣超與即時裁示",
                order: 1,
                layoutTemplate: "overview-grid",
                widgetCount: 1,
                dataAvailability: "complete",
                widgets: [
                  {
                    id: "widget-branch-heatmap",
                    widgetType: "heatmap",
                    title: "主力分點買賣超熱圖",
                    purpose: "觀察關鍵贏家分點連續買賣超分布",
                    whyIncluded: "V11 核心分點觀察元件",
                    dataSource: "agora.chip.branch_flow",
                    dataAvailability: "complete",
                    query: { filters: { strategy_id: STRATEGY_ID }, limit: 20, window: "20d" },
                    chartSpec: {
                      spec_version: "1.0",
                      kind: "heatmap",
                      encodings: {
                        x: { field: "date", type: "temporal" },
                        y: { field: "branch", type: "nominal" },
                        color: { field: "net_buy", type: "quantitative" },
                      },
                    },
                    interactions: [{ kind: "request_widget_revision" }],
                    placement: { x: 0, y: 0, width: 12, height: 4, minWidth: 4, minHeight: 2 },
                    minSize: { width: 4, height: 2 },
                    maxSize: { width: 12, height: 8 },
                    sensitivity: "user_private",
                    visible: true,
                  },
                ],
              },
            ],
          },
        },
        200,
        { ETag: '"ws-winner-v2"' },
      );
    }

    if (path === "/bff/agora/trading-room/workspaces/ws-winner-001/versions") {
      return jsonFulfill(route, {
        data: [
          {
            id: "ver-002",
            workspaceId: "ws-winner-001",
            dashboardVersion: 2,
            generatedBy: "user_modified",
            changeSummary: "將主力分點買賣超熱圖調整為全寬置頂並排除低成交量分點",
            createdAt: AS_OF,
          },
          {
            id: "ver-001",
            workspaceId: "ws-winner-001",
            dashboardVersion: 1,
            generatedBy: "trading_servant",
            changeSummary: "僕人依「贏家分點波段策略」建立初版操盤室工作區",
            createdAt: "2026-11-27T06:00:00Z",
          },
        ],
      });
    }

    if (path.startsWith("/bff/agora/persona-lab/") && path.endsWith("/change-log")) {
      return jsonFulfill(route, {
        data: {
          active_version: 3,
          entries: [
            {
              version: 3,
              patch_id: "patch-volume-filter-v3",
              status: "committed",
              evidence_refs: ["ev-signal-feedback-01", "dj-20261127-02"],
              active: true,
              actions: ["accept", "undo", "tell_why"],
            },
          ],
        },
      });
    }

    if (path === "/bff/agora/trading-room/stream") {
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: 'id: e1\ndata: {"id":"e1","type":"trading_room.connected","data":{"status":"ready"}}\n\n',
      });
    }

    if (path === "/bff/agora/operational-readiness") {
      return jsonFulfill(route, {
        data: {
          status: "healthy",
          source: { freshness: "fresh", source_instance_id: "src-1", snapshot_id: "snap-1" },
          signal_producer: { producer_id: "producer-1", status: "healthy" },
          surfaces: {},
        },
      });
    }

    return jsonFulfill(route, { data: [], items: [] });
  });

  await installOidcDevLogin(page, {
    goto: false,
    roles: ["operator", "admin"],
    tenantId: "pantheon-dev",
  });
  await installQuietEventSource(page);
  return { managementCalls };
}

test.describe("FE-AGORA-GLOBAL-DRAWERS-20261127 recorded-fixture Chromium proof", () => {
  test.skip(IS_HOSTED_FE, "Local recorded-fixture Chromium proof runs when FE_BASE_URL is not set.");
  test.use({ viewport: { width: 1600, height: 960 } });

  test("opens all six global drawers with screenshots, submits & reads back 修正助理 feedback, and verifies /agora/ask, /agora/journal, /agora/trainer without calling /bff/management", async ({
    page,
  }) => {
    const { managementCalls } = await installGlobalDrawersFixture(page);
    mkdirSync(DRAWER_PROOF_DIR, { recursive: true });

    await page.goto(`/agora/trading-room/${STRATEGY_ID}?strategyVersion=${REGISTRY_ID}`);
    await expect(page.getByTestId("agora-standalone-shell")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("trading-desk-global-drawers")).toBeVisible();

    // 1. 交易僕人任務 drawer: inspect servant profile/session controls + submit & read back 修正助理 item
    await page.getByTestId("global-drawer-trigger-servant").click();
    await expect(page.getByTestId("trading-desk-servant-drawer")).toBeVisible();
    await expect(page.getByTestId("servant-drawer-session-controls")).toBeVisible();
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/01-servant-tasks-drawer.png` });

    // Submit 修正助理 feedback item without typing a persona ID and verify readback
    const feedbackText = "量縮跌破五日均量時請先提示減碼，不建議追高";
    await page.getByTestId("servant-correction-kind-signal-feedback").click();
    await page.getByTestId("servant-correction-content-input").fill(feedbackText);
    await page.getByTestId("servant-correction-submit").click();
    await expect(page.getByTestId("servant-correction-readback-summary")).toContainText(
      feedbackText,
    );
    await expect(page.getByTestId("servant-correction-history-list")).toContainText(feedbackText);
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/02-correction-submit-readback.png` });

    // 2. Shadow drawer: four-party shadow comparison via Agora owner route
    await page.getByTestId("global-drawer-trigger-shadow").click();
    const shadowDrawer = page.getByTestId("trading-desk-shadow-drawer");
    await expect(shadowDrawer).toBeVisible();
    await expect(shadowDrawer.getByTestId("shadow-comparison-arms")).toBeVisible();
    await expect(shadowDrawer.getByTestId("shadow-arm-human_actual")).toContainText("我的做法（實際裁示）");
    await expect(shadowDrawer.getByTestId("shadow-arm-private_servant")).toContainText("助理建議（私人僕人）");
    await expect(shadowDrawer.getByTestId("shadow-arm-base_strategy")).toContainText("原策略");
    await expect(shadowDrawer.getByTestId("shadow-arm-committee_variant")).toContainText("委員會版本");
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/03-shadow-drawer.png` });

    // 3. Journal/Replay drawer: decision chain timeline from /bff/agora/journal & /bff/agora/decision-journal
    await page.getByTestId("global-drawer-trigger-journal").click();
    await expect(page.getByTestId("trading-desk-journal-drawer")).toBeVisible();
    await expect(page.getByTestId("journal-replay-selected-entry")).toContainText(
      "聯發科量縮減碼決策鏈紀錄",
    );
    await page.getByTestId("journal-replay-next").click();
    await expect(page.getByTestId("journal-replay-selected-entry")).toContainText(
      "台積電關鍵分點買超進場日誌",
    );
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/04-journal-replay-drawer.png` });

    // 4. 專家審視 drawer: Ask / Challenge / Compare / Propose / Reflect
    await page.getByTestId("global-drawer-trigger-expert-review").click();
    await expect(page.getByTestId("trading-desk-expert-review-drawer")).toBeVisible();
    await expect(page.getByTestId("expert-review-participant-per_quant")).toBeVisible();
    await page.getByTestId("expert-review-mode-challenge").click();
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/05-expert-review-drawer.png` });

    // 5. 版面調整 drawer: inside Trading Room opens widget revision flow; outside disabled with zh-TW reason
    await page.getByTestId("global-drawer-trigger-layout").click();
    await expect(page.getByTestId("trading-desk-layout-drawer")).toBeVisible();
    await expect(page.getByTestId("layout-drawer-revise-widget-widget-branch-heatmap")).toBeVisible();
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/06-layout-drawer-trading-room.png` });

    // Switch to 策略執行與績效 and verify 版面調整 is disabled with zh-TW reason
    await page.getByTestId("trading-desk-tab-strategy-performance").click();
    await expect(page.getByTestId("layout-drawer-disabled-reason")).toContainText(
      "版面調整僅適用於「交易操盤室」頁面",
    );
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/07-layout-drawer-disabled-outside.png` });

    // 6. 個人化紀錄 drawer: workspace versions + what the servant learned + 修正助理
    await page.getByTestId("global-drawer-trigger-personalization").click();
    await expect(page.getByTestId("trading-desk-personalization-drawer")).toBeVisible();
    await expect(page.getByTestId("personalization-workspace-version-2")).toContainText(
      "將主力分點買賣超熱圖調整為全寬置頂",
    );
    await expect(
      page.getByTestId("personalization-servant-learned-item-patch-volume-filter-v3"),
    ).toBeVisible();
    await page.screenshot({ path: `${DRAWER_PROOF_DIR}/08-personalization-drawer.png` });

    // Legacy drawer routes: /agora/ask, /agora/journal, /agora/trainer
    await page.goto("/agora/ask");
    await expect(page.getByTestId("trading-desk-servant-drawer")).toBeVisible();
    await page.goto("/agora/journal");
    await expect(page.getByTestId("trading-desk-journal-drawer")).toBeVisible();
    await page.goto("/agora/trainer");
    await expect(page.getByTestId("trading-desk-servant-drawer")).toBeVisible();
    await expect(page.getByTestId("servant-correction-section")).toHaveAttribute(
      "data-trainer-active",
      "true",
    );

    expect(managementCalls).toEqual([]);
  });
});
