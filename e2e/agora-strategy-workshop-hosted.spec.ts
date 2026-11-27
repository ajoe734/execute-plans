/**
 * AG-DYNUI-LIVE-WORKSHOP-FE-013 - hosted live Strategy Workshop tab proof.
 *
 * This spec uses the deployed FE and live BFF. It must not intercept or
 * synthesize Agora workshop responses. Supplying both targets opts in and
 * requires an explicit short-lived BFF auth token.
 */

import { expect, test, type APIRequestContext, type Page, type Request, type Route } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  devLoginSession,
  installOidcDevLogin,
  roleTokenFromEnv,
} from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE_URL = trimTrailingSlash(
  process.env.AG_DYNUI_LIVE_WORKSHOP_FE_013_BASE_URL ||
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    "",
);
const BFF_BASE_URL = trimTrailingSlash(
  process.env.AG_DYNUI_LIVE_WORKSHOP_FE_013_BFF_BASE_URL ||
    process.env.PANTHEON_BFF_BASE_URL ||
    process.env.VITE_BFF_BASE_URL ||
    "",
);
const AUTH_TOKEN = roleTokenFromEnv("operator", [
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/ag-dynui-live-tabs-013";
const HOSTED_REQUESTED = Boolean(FE_BASE_URL && BFF_BASE_URL);

if (HOSTED_REQUESTED && !AUTH_TOKEN) {
  throw new Error(
    "AG-DYNUI-LIVE-WORKSHOP-FE-013 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN",
  );
}
if (HOSTED_REQUESTED) {
  devLoginSession({
    env: {
      ...process.env,
      PANTHEON_BFF_BASE_URL: BFF_BASE_URL,
      PANTHEON_FE_BASE_URL: FE_BASE_URL,
    },
    goto: false,
    pageBaseUrl: FE_BASE_URL,
    token: AUTH_TOKEN,
  });
}
const RAW_UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const VIEWPORTS = [
  { name: "desktop", size: { width: 1440, height: 960 } },
  { name: "mobile", size: { width: 390, height: 844 } },
];

type JsonRecord = Record<string, unknown>;

type NetworkEvent = {
  auth: "absent" | "present";
  method: string;
  path: string;
  status?: number;
  url: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "X-Tenant-Id": TENANT_ID,
    "X-Request-Id": `ag-dynui-live-workshop-fe-013-${randomUUID()}`,
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
  for (const key of ["items", "cards", "events", "workshops", "results"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
    }
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

async function discoverWorkshop(request: APIRequestContext): Promise<{
  cards: JsonRecord[];
  events: JsonRecord[];
  readiness: JsonRecord;
  workshop: JsonRecord;
}> {
  const workshopsBody = await getJson(request, "/bff/agora/workshops?limit=50");
  const workshops = arrayData(workshopsBody);
  const workshop = workshops.find((item) => typeof item.workshop_id === "string");
  expect(workshop, "live BFF must return at least one workshop").toBeTruthy();
  const workshopId = String(workshop?.workshop_id);

  const [detailBody, cardsBody, readinessBody, eventsBody] = await Promise.all([
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}`),
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/cards`),
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness`),
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`),
  ]);

  return {
    cards: arrayData(cardsBody),
    events: arrayData(eventsBody),
    readiness: recordFrom(dataFrom(readinessBody)),
    workshop: recordFrom(dataFrom(detailBody)),
  };
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

function assertRequiredNetwork(events: NetworkEvent[]): void {
  const paths = events.map((event) => event.path);
  for (const required of [
    "/bff/agora/workshops",
    "/cards",
    "/events",
    "/readiness",
  ]) {
    expect(paths.some((path) => path.includes(required)), `required live BFF path was not observed: ${required}`).toBe(true);
  }

  for (const event of events.filter((item) => item.path.includes("/bff/agora/"))) {
    if (!event.path.endsWith("/stream")) {
      expect(event.auth, `Agora BFF request must carry Authorization: ${event.url}`).toBe("present");
    }
    if (event.status !== undefined) {
      expect(event.status, `Agora BFF request failed: ${event.url}`).toBeLessThan(500);
      expect(event.status, `Agora BFF request was unauthorized: ${event.url}`).not.toBe(401);
      expect(event.status, `Agora BFF request was forbidden: ${event.url}`).not.toBe(403);
    }
  }
}

test.describe("AG-DYNUI-LIVE-WORKSHOP-FE-013 hosted Strategy Workshop tab", () => {
  test.skip(
    !HOSTED_REQUESTED,
    "Set the hosted FE and BFF URLs to enable this acceptance probe.",
  );
  test.setTimeout(120_000);

  for (const viewport of VIEWPORTS) {
    test(`renders live workshop runtime without raw UUID list on ${viewport.name}`, async ({
      page,
      request,
    }, testInfo) => {
      const evidence = await discoverWorkshop(request);
      const network = collectNetwork(page);

      await page.setViewportSize(viewport.size);
      await installOidcDevLogin(page, {
        goto: false,
        pageBaseUrl: FE_BASE_URL,
        tenantId: TENANT_ID,
        token: AUTH_TOKEN,
      });

      await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`);
      await expect(page.getByTestId("strategy-workshop-live-tab")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible();
      await expect(page.getByTestId("strategy-workshop-runtime-header")).toBeVisible();
      await expect(page.getByTestId("workshop-conversation")).toBeVisible();
      await expect(page.getByTestId("servant-composer")).toBeVisible();
      if (viewport.name === "mobile") {
        await expect(page.getByTestId("workshop-mobile-priority")).toBeVisible();
        const composerOptions = page.getByTestId("workshop-composer-options");
        await expect(composerOptions).toHaveAttribute("data-mobile-collapsed", "true");
        const optionsToggle = page.getByTestId("workshop-composer-options-toggle");
        await optionsToggle.click();
        await expect(optionsToggle).toHaveAttribute("aria-expanded", "true");
        await expect(composerOptions).toHaveAttribute("data-mobile-collapsed", "false");
      } else {
        await expect(page.getByTestId("completeness-rail")).toBeVisible();
      }
      await expect(page.getByTestId("context-bar")).toBeVisible();
      await expect(page.getByTestId("servant-default-composer-badge")).toBeVisible();
      await expect(page.getByTestId("persona-consult-addon-toggle")).toBeVisible();
      await expect(page.getByTestId("mode-selector")).toBeVisible();
      await expect(page.getByTestId("participant-picker")).toBeVisible();
      await expect(page.getByTestId("eligibility-explanation")).toBeVisible();
      await expect(page.getByTestId("eligibility-explanation")).toContainText(
        /eligible|eligibility|opinion authority|unavailable|私人助理|可諮詢/i,
      );
      if (viewport.name === "mobile") {
        await page.getByRole("button", { name: "Next question & readiness" }).click();
        await expect(page.getByTestId("completeness-rail")).toBeVisible();
        await expect(page.getByTestId("completeness-overall-grade")).toBeVisible();
        await page.getByRole("button", { name: "Conversation" }).click();
        await expect(page.getByTestId("workshop-conversation")).toBeVisible();
      } else {
        await expect(page.getByTestId("completeness-rail")).toBeVisible();
        await expect(page.getByTestId("completeness-overall-grade")).toBeVisible();
      }
      await expect(page.getByTestId("workshop-card-summary")).toContainText(/Cards: \d+/);
      await expect(page.getByTestId("workshop-event-summary")).toContainText(/Events: \d+/);
      await expect(page.getByTestId("workshop-readiness-summary")).toContainText(/Readiness:/);

      const selectorTexts = await page.locator('[data-testid^="workshop-item-"]').allInnerTexts();
      expect(selectorTexts.length, "visible live workshop selector items").toBeGreaterThan(0);
      for (const text of selectorTexts) {
        expect(text, "selector text must not expose raw workshop UUID/debug output").not.toMatch(RAW_UUID_PATTERN);
      }
      assertRequiredNetwork(network);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      const screenshotPath = `${EVIDENCE_DIR}/ag-dynui-live-workshop-fe-013-${viewport.name}.png`;
      const readbackPath = `${EVIDENCE_DIR}/ag-dynui-live-workshop-fe-013-${viewport.name}.json`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      writeFileSync(
        readbackPath,
        JSON.stringify(
          {
            bffBaseUrl: BFF_BASE_URL,
            cards: evidence.cards.length,
            events: evidence.events.length,
            feBaseUrl: FE_BASE_URL,
            network,
            readiness: evidence.readiness,
            selectorTexts,
            viewport: viewport.name,
            workshop: evidence.workshop,
          },
          null,
          2,
        ),
      );
      await testInfo.attach(`ag-dynui-live-workshop-fe-013-${viewport.name}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
      await testInfo.attach(`ag-dynui-live-workshop-fe-013-${viewport.name}-readback`, {
        path: readbackPath,
        contentType: "application/json",
      });
    });
  }

  test("FE-AGORA-WORKSHOP-CONVERSATION-FIRST-20261127 hosted admintest creates a new workshop from a long zh-TW description and reaches a completed reconstruction card and evaluated 12-block rail", async ({
    page,
  }, testInfo) => {
    const longZhDescription = [
      "我想建立一套針對台股上市櫃中型電子與半導體供應鏈的「關鍵贏家分點波段策略」：",
      "1. 研究對象與市場範圍：聚焦市值前 300 大、近 20 日日均成交值大於 1.5 億新台幣之個股，排除全額交割與處置股。",
      "2. 關係人與分點映射：追蹤公司地緣券商（總部或廠區半徑 15 公里內）以及過去兩年在財報或法說會前具有顯著領先買超紀錄的關鍵分點。",
      "3. 贏家分點評分：以 60 個交易日滾動視窗計算各分點在個股的已實現波段勝率、平均持有報酬與籌碼集中度，篩選前 10% 的高分贏家分點。",
      "4. 進場與持有週期：當高分贏家分點連續 3 日淨買超占成交量達 8% 以上且股價站穩 20 日均線時於隔日進場，預計持有 10 至 20 個交易日。",
      "5. 加減碼與風控出場：若贏家分點轉為連續 2 日淨賣超、跌破 10 日均線或單筆虧損達 5% 則立即停損出場；單筆部位上限為總資金 10%，不開槓桿。",
    ].join("\n");

    await page.setViewportSize({ width: 1600, height: 960 });
    await installOidcDevLogin(page, {
      goto: false,
      operatorId: "admintest",
      pageBaseUrl: FE_BASE_URL,
      tenantId: TENANT_ID,
      token: AUTH_TOKEN,
    });

    await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`);
    await expect(page.getByTestId("create-workshop-btn")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("create-workshop-btn").click();
    await expect(page.getByTestId("create-workshop-description-input")).toBeVisible();
    await page.getByTestId("create-workshop-description-input").fill(longZhDescription);
    await expect(page.getByTestId("create-workshop-derived-title")).toBeVisible();

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const createShot = `${EVIDENCE_DIR}/fe-agora-workshop-conversation-first-20261127-hosted-01-create.png`;
    await page.screenshot({ path: createShot });
    await testInfo.attach("hosted-01-create-workshop-long-zh-description", {
      path: createShot,
      contentType: "image/png",
    });

    await page.getByTestId("create-workshop-submit").click();
    await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-card-type="strategy_reconstruction"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("completeness-rail")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("v10-twelve-blocks-section")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("servant-default-composer-badge")).toBeVisible();

    const sessionShot = `${EVIDENCE_DIR}/fe-agora-workshop-conversation-first-20261127-hosted-02-reconstructed-rail.png`;
    await page.screenshot({ path: sessionShot });
    await testInfo.attach("hosted-02-completed-reconstruction-and-twelve-block-rail", {
      path: sessionShot,
      contentType: "image/png",
    });
  });
});

const WORKSHOP_PROOF_DIR =
  "docs/deployment/evidence/FE-AGORA-WORKSHOP-CONVERSATION-FIRST-20261127/screenshots";

test.describe("FE-AGORA-WORKSHOP-CONVERSATION-FIRST-20261127 recorded-fixture Chromium proof", () => {
  test.skip(HOSTED_REQUESTED, "Local recorded-fixture Chromium proof runs when hosted URLs are not set.");
  test.use({ viewport: { width: 1600, height: 960 } });

  test("admintest creates a workshop from a long zh-TW strategy description, reaches completed reconstruction card and evaluated 12-block rail, answers high-value decision, and renders dark-theme cards", async ({
    page,
  }) => {
    const workshopId = "7eb33747-75e1-41a8-a288-a635356653cf";
    const asOf = "2026-11-27T20:30:00Z";
    const longZhDescription = [
      "我想建立一套針對台股上市櫃中型電子與半導體供應鏈的「關鍵贏家分點波段策略」：",
      "1. 研究對象與市場範圍：聚焦市值前 300 大、近 20 日日均成交值大於 1.5 億新台幣之個股，排除全額交割與處置股。",
      "2. 關係人與分點映射：追蹤公司地緣券商（總部或廠區半徑 15 公里內）以及過去兩年在財報或法說會前具有顯著領先買超紀錄的關鍵分點。",
      "3. 贏家分點評分：以 60 個交易日滾動視窗計算各分點在個股的已實現波段勝率、平均持有報酬與籌碼集中度，篩選前 10% 的高分贏家分點。",
      "4. 進場與持有週期：當高分贏家分點連續 3 日淨買超占成交量達 8% 以上且股價站穩 20 日均線時於隔日進場，預計持有 10 至 20 個交易日。",
      "5. 加減碼與風控出場：若贏家分點轉為連續 2 日淨賣超、跌破 10 日均線或單筆虧損達 5% 則立即停損出場；單筆部位上限為總資金 10%，不開槓桿。",
    ].join("\n");

    let created = false;
    let reconstructed = false;
    let decisionAnswered = false;
    let derivedTitle = "我想建立一套針對台股上市櫃中型電子與半導體供應鏈的「關鍵贏家分點波段策略…";

    const buildTwelveBlocks = (afterDecision: boolean) => [
      {
        order: 1,
        block_id: "market_scope",
        title_zh: "研究對象與市場範圍",
        state: "confirmed",
        note: "台股上市櫃市值前 300 大、20 日均成交值 > 1.5 億新台幣（排除處置股）",
      },
      {
        order: 2,
        block_id: "insider_branch_mapping",
        title_zh: "關係人與分點映射",
        state: "confirmed",
        note: "公司總部與廠區半徑 15 公里內地緣券商及財報前領先買超分點",
      },
      {
        order: 3,
        block_id: "winner_branch_scoring",
        title_zh: "贏家分點評分",
        state: "confirmed",
        note: "60 個交易日滾動波段勝率、平均持有報酬與籌碼集中度前 10%",
      },
      {
        order: 4,
        block_id: "migration_reverse_flow",
        title_zh: "分點遷移與反向流",
        state: "missing",
        note: "尚未定義跨分點匯撥與隔日沖反向倒貨過濾門檻",
      },
      {
        order: 5,
        block_id: "event_lead",
        title_zh: "事件領先關聯",
        state: "inferred",
        note: "助理推定：以法說會與月營收公布前 10 個交易日作為事件觀察窗",
      },
      {
        order: 6,
        block_id: "signal_formation",
        title_zh: "信號形成",
        state: afterDecision ? "confirmed" : "weak",
        note: afterDecision
          ? "交易員裁示（opt_a）：高分贏家分點連 3 日異常買超 ≥ 8% 且股價乖離 < 5%"
          : "已指定連 3 日買超 ≥ 8%，但尚未限制短線追高乖離率上限",
      },
      {
        order: 7,
        block_id: "entry_holding",
        title_zh: "進場與持有週期",
        state: "confirmed",
        note: "信號成立隔日開盤進場，預計波段持有 10 至 20 個交易日",
      },
      {
        order: 8,
        block_id: "add_reduce_exit",
        title_zh: "加碼、減碼與出場",
        state: "confirmed",
        note: "贏家分點連 2 日淨賣超、跌破 10 日均線或單筆虧損 5% 停損出場",
      },
      {
        order: 9,
        block_id: "sizing_leverage",
        title_zh: "部位與槓桿",
        state: "confirmed",
        note: "單筆部位上限為總資金 10%，現股操作不開槓桿",
      },
      {
        order: 10,
        block_id: "cost_liquidity_capacity",
        title_zh: "成本、流動性與容量",
        state: "inferred",
        note: "助理推定：單向滑價與手續費加計 25 bps，單日參與率上限 5%",
      },
      {
        order: 11,
        block_id: "validation_backtest_refutation",
        title_zh: "驗證、回測與反證",
        state: "conflict",
        note: "回測樣本期間與分點滾動視窗重疊，需切分樣本外驗證期避免前視偏誤",
      },
      {
        order: 12,
        block_id: "monitoring_update",
        title_zh: "監控與策略更新",
        state: "inferred",
        note: "助理推定：每季重新評分贏家分點名單並監控勝率衰退",
      },
    ];

    const buildNextDecision = (afterDecision: boolean) =>
      afterDecision
        ? {
            decision_id: "decision_migration_reverse_flow",
            question_id: "decision_migration_reverse_flow",
            question: "請裁示「分點遷移與反向流（跨分點匯撥／隔日沖出貨）」的辨識與過濾規則：",
            why_high_value: "排除隔日沖分點與跨分點左手換右手可降低假突破進場率約 28%",
            target_blocks: ["migration_reverse_flow"],
            default_option_id: "opt_d",
            options: [
              {
                option_id: "opt_m1",
                label: "A. 排除過去 20 日隔日沖占比 > 35% 之分點買超量",
                summary: "直接剔除高頻隔日沖分點對買超集中度的干擾",
              },
              {
                option_id: "opt_m2",
                label: "B. 同集團／同地緣分點雙向對敲量予以淨額抵銷",
                summary: "以 Cluster 淨流量取代單一分點毛買超",
              },
            ],
            servant_default: {
              option_id: "opt_d",
              summary: "同時啟用隔日沖分點剔除與同地緣 Cluster 淨流量抵銷（推薦預設）",
            },
          }
        : {
            decision_id: "q1",
            question_id: "q1",
            question: "請裁示「信號形成」的短線乖離過濾與合成方式：",
            why_high_value: "目前連 3 日買超 ≥ 8% 已明確，補齊乖離上限即可將「信號形成」鎖定為已確認",
            target_blocks: ["signal_formation"],
            default_option_id: "opt_d",
            options: [
              {
                option_id: "opt_a",
                label: "A. 高分贏家分點連 3 日異常買超 ≥ 8% 且股價距 20MA 乖離 < 5%",
                summary: "避免在波段末段急拉時追高進場",
              },
              {
                option_id: "opt_b",
                label: "B. 贏家分點買超 + 地緣 Cluster 淨流量為正 + 關係人申報支持",
                summary: "要求多維度籌碼共振後才觸發進場信號",
              },
              {
                option_id: "opt_c",
                label: "C. 綜合評分排名前 10% 且扣除成本後 20 日期望值（EV）> 2.5%",
                summary: "以期望值門檻動態過濾低波動標的",
              },
              {
                option_id: "opt_d",
                label: "D. 由助理同時建立直接分點信號與 Cluster 對照組（預設）",
                summary: "保留基準信號與過濾變體供回測比較",
                is_default: true,
              },
            ],
            servant_default: {
              option_id: "opt_d",
              summary: "我先以核心評分加上反向流／短期過熱過濾建立基準信號，並保留變體供回測對照。",
            },
          };

    const corsFor = (req?: Request): Record<string, string> => ({
      "Access-Control-Allow-Origin": req?.headers()?.origin || "http://127.0.0.1",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Accept, Authorization, Content-Type, Idempotency-Key, If-Match, X-Request-Id, X-Tenant-Id",
      "Access-Control-Expose-Headers": "ETag, X-Request-Id",
      Vary: "Origin",
    });

    const jsonFulfill = (
      route: Route,
      body: unknown,
      status = 200,
      extraHeaders: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          ...corsFor(route.request()),
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      });

    await page.addInitScript(() => {
      window.sessionStorage.setItem("pantheon.e2e.realWrites", "true");
    });

    await page.route(
      (url) => url.pathname === "/health" || url.pathname.startsWith("/bff/"),
      async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const path = url.pathname;
        const method = req.method();

        if (method === "OPTIONS") {
          return route.fulfill({
            status: 204,
            headers: corsFor(req),
          });
        }

        if (path.startsWith("/bff/auth/") || path === "/bff/me") {
          await route.fallback();
          return;
        }

        if (method === "GET" && path === "/health") {
          return jsonFulfill(route, { status: "ok", service: "workshop-v10-fixture" });
        }

        if (method === "GET" && path === "/bff/agora/capabilities") {
          return jsonFulfill(route, {
            data: {
              capabilities: [
                { name: "agora.workshop.v1", auth_level: "operator", route_prefixes: ["/bff/agora/workshops"] },
                { name: "agora.persona.interaction.v1", auth_level: "operator", route_prefixes: ["/bff/agora/interactions"] },
              ],
            },
          });
        }

      if (path === "/bff/agora/trader/profile") {
        return jsonFulfill(route, {
          data: {
            user_id: "admintest",
            display_name: "admintest",
            style_summary: "台股分點籌碼與波段動能交易",
            market_state: "台股收盤 · 策略建模中",
            own_servant_persona_id: "agora-servant-admintest",
          },
        });
      }

      if (path === "/bff/agora/servant/profile") {
        return jsonFulfill(route, {
          data: {
            persona_id: "agora-servant-admintest",
            display_name: "私人策略助理",
            status: "ready",
            capabilities: ["strategy_reconstruction", "completeness_evaluation", "research_plan"],
          },
        });
      }

      if (path === "/bff/agora/workshops" && method === "GET") {
        return jsonFulfill(route, {
          data: {
            items: created
              ? [
                  {
                    spec_version: "1.0",
                    workshop_id: workshopId,
                    operator_id: "admintest",
                    status: "active",
                    title: derivedTitle,
                    subject: {
                      kind: "free_form",
                      ref: workshopId,
                      title: derivedTitle,
                    },
                    metadata: {
                      strategy_name: derivedTitle,
                      description: longZhDescription,
                    },
                    participant_persona_ids: [],
                    created_at: asOf,
                    updated_at: asOf,
                  },
                ]
              : [],
          },
        });
      }

      if (path === "/bff/agora/workshops" && method === "POST") {
        const raw = req.postData();
        const body = raw ? (JSON.parse(raw) as JsonRecord) : {};
        derivedTitle = String(body.title || derivedTitle);
        created = true;
        return jsonFulfill(
          route,
          {
            data: {
              spec_version: "1.0",
              workshop_id: workshopId,
              operator_id: "admintest",
              status: "active",
              title: derivedTitle,
              subject: {
                kind: "free_form",
                ref: workshopId,
                title: derivedTitle,
              },
              metadata: {
                strategy_name: derivedTitle,
                description: String(body.initial_message || longZhDescription),
              },
              participant_persona_ids: [],
              created_at: asOf,
              updated_at: asOf,
            },
          },
          201,
          { ETag: `W/"workshop:${workshopId}:v1"` },
        );
      }

      if (path === `/bff/agora/workshops/${workshopId}` && method === "GET") {
        const currentEtag = `W/"workshop:${workshopId}:${decisionAnswered ? "v2" : "v1"}"`;
        return jsonFulfill(
          route,
          {
            data: {
              spec_version: "1.0",
              workshop_id: workshopId,
              operator_id: "admintest",
              status: "active",
              title: derivedTitle,
              subject: {
                kind: "free_form",
                ref: workshopId,
                title: derivedTitle,
              },
              metadata: {
                strategy_name: derivedTitle,
                description: longZhDescription,
              },
              participant_persona_ids: [],
              created_at: asOf,
              updated_at: asOf,
            },
            meta: {
              etag: currentEtag,
            },
          },
          200,
          { ETag: currentEtag },
        );
      }

      if (path === `/bff/agora/workshops/${workshopId}/reconstruct` && method === "POST") {
        reconstructed = true;
        return jsonFulfill(route, {
          data: {
            reconstruction_id: decisionAnswered ? "recon-e65c22925b839b0d1de6" : "recon-8a98d20031de48998f75",
            job_status: "completed",
            based_on_sequence_no: decisionAnswered ? 2 : 1,
          },
        });
      }

      if (path === `/bff/agora/workshops/${workshopId}/decisions` && method === "POST") {
        decisionAnswered = true;
        return jsonFulfill(
          route,
          {
            data: {
              event_id: "92cef85f-c11f-476f-b857-d156878c3551",
              sequence_no: 2,
              decision_id: "q1",
              question_id: "q1",
              question: "請裁示「信號形成」的短線乖離過濾與合成方式：",
              option_id: "opt_a",
              option_label: "A. 高分贏家分點連 3 日異常買超 ≥ 8% 且股價距 20MA 乖離 < 5%",
              used_servant_default: false,
              resolves: ["signal_formation"],
              target_blocks: ["signal_formation"],
            },
          },
          201,
          { ETag: `W/"workshop:${workshopId}:v2"` },
        );
      }

      if (path === `/bff/agora/workshops/${workshopId}/completeness` && method === "GET") {
        if (!reconstructed) {
          return jsonFulfill(route, { data: null });
        }
        return jsonFulfill(route, {
          data: {
            snapshot_id: decisionAnswered
              ? "snap_rjob_985f88d28b234177bb26420116576619"
              : "snap_rjob_604fafd89b9a491fb1f942a10396ae15",
            workshop_id: workshopId,
            strategy_version_id: decisionAnswered ? "wsv-2" : "wsv-1",
            strategy_family: "winner_branch",
            is_branch_strategy: true,
            overall_grade: decisionAnswered ? "workable" : "partial",
            research_ready: decisionAnswered,
            state_map_json: {},
            blocking_items_json: [],
            twelve_blocks: buildTwelveBlocks(decisionAnswered),
            next_decision: buildNextDecision(decisionAnswered),
            created_at: asOf,
          },
        });
      }

      if (path === `/bff/agora/workshops/${workshopId}/cards` && method === "GET") {
        return jsonFulfill(route, {
          data: {
            cards: [
              {
                card_id: "card-user-desc-1",
                card_type: "user_strategy_description",
                sequence_no: 1,
                status: "completed",
                emitted_by: "user",
                title: "交易員策略原始描述",
                summary: "關鍵贏家分點波段策略（台股中型電子與半導體供應鏈）",
                created_at: asOf,
                payload: {
                  strategy_title: derivedTitle,
                  raw_description: longZhDescription,
                },
              },
              ...(reconstructed
                ? [
                    {
                      card_id: "card_reconstruction_cec636a12d9f2f23412c",
                      card_type: "strategy_reconstruction",
                      sequence_no: 2,
                      status: "completed",
                      title: decisionAnswered ? "策略重建卡（已整合信號形成裁示）" : "策略重建卡（初版 12 塊建模）",
                      summary: decisionAnswered
                        ? "已將您對「信號形成」的乖離上限裁示（opt_a）寫入策略結構圖，目前已確認 7/12 塊，下一步建議裁示「分點遷移與反向流」。"
                        : "已根據您的長篇中文策略描述完成 12 塊策略重建：已確認 6 塊、助理推定 3 塊、薄弱 1 塊、尚缺 1 塊、衝突 1 塊。",
                      created_at: asOf,
                      payload: {
                        reconstruction_id: decisionAnswered
                          ? "recon-e65c22925b839b0d1de6"
                          : "recon-8a98d20031de48998f75",
                        job_id: "rjob_8a98d20031de48998f7529f4b56b9fb7",
                        job_status: "completed",
                        strategy_title: "關鍵贏家分點波段策略",
                        strategy_map: {
                          研究對象與市場範圍: "台股上市櫃市值前 300 大、20 日均成交值 > 1.5 億新台幣",
                          關係人與分點映射: "總部／廠區 15 公里內地緣券商與財報前領先買超分點",
                          贏家分點評分: "60 日滾動波段勝率與籌碼集中度前 10%",
                          信號形成: decisionAnswered
                            ? "高分贏家分點連 3 日異常買超 ≥ 8% 且距 20MA 乖離 < 5%（已確認）"
                            : "高分贏家分點連 3 日買超 ≥ 8%（乖離率上限待確認）",
                          進場與持有週期: "隔日開盤進場，持有 10 至 20 個交易日",
                          加減碼與出場: "分點連 2 日淨賣超、跌破 10MA 或虧損 5% 停損",
                        },
                        explicit_facts: [
                          "單筆部位上限為總資金 10%，現股不開槓桿",
                          "聚焦台股中型電子與半導體供應鏈，排除全額交割與處置股",
                        ],
                        inferences: [
                          {
                            statement: "單向交易成本與滑價預估為 25 bps，單日成交量參與率上限 5%",
                            confidence: 0.85,
                            needs_confirmation: true,
                          },
                          {
                            statement: "每季滾動重算贏家分點名單並監控勝率衰減",
                            confidence: 0.82,
                            needs_confirmation: false,
                          },
                        ],
                        contradictions: [
                          "回測驗證期與 60 日分點評分視窗重疊，需切分樣本外期間以避免前視偏誤",
                        ],
                        uncertainties: [
                          "尚未定義跨分點匯撥與隔日沖分點反向倒貨的過濾門檻",
                        ],
                        next_decision: buildNextDecision(decisionAnswered),
                        provider_lineage: {
                          provider: "openclaw",
                          model: "claude-sonnet-4-5",
                        },
                      },
                    },
                    {
                      card_id: "card-opinion-chip-1",
                      card_type: "persona_opinion",
                      sequence_no: 3,
                      status: "completed",
                      persona_id: "per_quant",
                      title: "量化籌碼審視意見：隔日沖過濾與候選處置指標",
                      summary: "建議加入隔日沖分點剔除率與樣本外滾動驗證窗。",
                      created_at: asOf,
                      payload: {
                        persona_name: "量化籌碼審視專家",
                        stance: "cautious_support",
                        confidence: 0.86,
                        summary: "贏家分點連買信號具顯著正期望值，但須先剔除高頻隔日沖分點造成的虛假集中度。",
                        recommended_measures: [
                          {
                            measure_id: "m-overnight-filter",
                            title: "剔除隔日沖占比 > 35% 之分點買超",
                            action_type: "filter_rule",
                            target_field: "branch_flow.overnight_ratio_max",
                            proposed_value: "0.35",
                            expected_effect: "降低假突破進場率約 28%，提升 10 日持有勝率 6.4%",
                            priority: "high",
                            rationale: "台股中型電子股常受隔日沖大戶拉抬，隔日開高走低會侵蝕波段期望值。",
                          },
                        ],
                      },
                    },
                    {
                      card_id: "card-backtest-result-1",
                      card_type: "research_result",
                      sequence_no: 4,
                      status: "completed",
                      title: "贏家分點波段策略樣本外回測結果（2024–2026）",
                      summary: "扣除 25 bps 交易成本後年化報酬 24.8%，夏普值 1.74，最大回撤 -11.2%。",
                      created_at: asOf,
                      payload: {
                        run_id: "run-winner-branch-bt-01",
                        strategy_version_id: "wsv-2",
                        outcome: "pass",
                        backend: { effective: "vectorbt", mode: "real" },
                        metrics: [
                          { category: "return", name: "年化報酬率 (CAGR)", value: 24.8, unit: "%", gate_result: "pass" },
                          { category: "risk_adjusted", name: "夏普值 (Sharpe)", value: 1.74, unit: "", gate_result: "pass" },
                          { category: "drawdown", name: "最大回撤 (Max DD)", value: -11.2, unit: "%", gate_result: "pass" },
                          { category: "win_rate", name: "波段勝率 (10-20d)", value: 63.4, unit: "%", gate_result: "pass" },
                        ],
                        findings: [
                          {
                            finding_id: "f-walk-forward",
                            severity: "info",
                            summary: "樣本外期間無前視偏誤（Walk-forward 60d/20d），扣除台股證交稅與 25 bps 滑價後期望值顯著為正。",
                          },
                        ],
                        data_cutoff: asOf,
                      },
                    },
                  ]
                : []),
            ],
          },
        });
      }

      if (path === `/bff/agora/workshops/${workshopId}/events` && method === "GET") {
        return jsonFulfill(route, {
          data: {
            events: [
              {
                event_id: "ev-1",
                workshop_id: workshopId,
                sequence_no: 1,
                event_type: "workshop.message.posted",
                occurred_at: asOf,
                payload: { role: "operator", summary: "已提交長篇中文策略描述" },
              },
            ],
          },
        });
      }

      if (path === `/bff/agora/workshops/${workshopId}/readiness` && method === "GET") {
        return jsonFulfill(route, {
          data: {
            workshop_id: workshopId,
            overall_ready: decisionAnswered,
            gates: [
              {
                gate: "preliminary_research",
                ready: true,
                status: "passed",
                blocking_reasons: [],
                requirements: [
                  { code: "state_map_present", satisfied: true, message: "12 塊策略完整度已評估" },
                ],
              },
            ],
          },
        });
      }

      if (path === `/bff/agora/workshops/${workshopId}/versions` && method === "GET") {
        return jsonFulfill(route, {
          data: {
            versions: [
              {
                version: {
                  workshop_version_id: "wsv-1",
                  workshop_id: workshopId,
                  strategy_id: "strat-winner-branch-001",
                  strategy_spec_registry_id: "reg-winner-branch-v1",
                  parent_workshop_version_id: null,
                  source_event_id: "ev-1",
                  sequence_no: 1,
                  document_sha256: "a111111111111111111111111111111111111111111111111111111111111111",
                  created_by: "admintest",
                  created_at: asOf,
                },
                strategy_spec: {
                  entry: {
                    registry_id: "reg-winner-branch-v1",
                    strategy_id: "strat-winner-branch-001",
                    version: "1",
                    metadata: {
                      strategy_spec: {
                        signal_formation: "高分贏家分點連 3 日買超 ≥ 8%",
                        stop_loss: "10d_ma_or_5pct",
                      },
                    },
                  },
                },
              },
              {
                version: {
                  workshop_version_id: "wsv-2",
                  workshop_id: workshopId,
                  strategy_id: "strat-winner-branch-001",
                  strategy_spec_registry_id: "reg-winner-branch-v2",
                  parent_workshop_version_id: "wsv-1",
                  source_event_id: "92cef85f-c11f-476f-b857-d156878c3551",
                  sequence_no: 2,
                  document_sha256: "b222222222222222222222222222222222222222222222222222222222222222",
                  created_by: "admintest",
                  created_at: asOf,
                },
                strategy_spec: {
                  entry: {
                    registry_id: "reg-winner-branch-v2",
                    strategy_id: "strat-winner-branch-001",
                    version: "2",
                    metadata: {
                      strategy_spec: {
                        signal_formation: "高分贏家分點連 3 日異常買超 ≥ 8% 且距 20MA 乖離 < 5%",
                        stop_loss: "10d_ma_or_5pct",
                      },
                    },
                  },
                },
              },
            ],
            selected_version_id: decisionAnswered ? "wsv-2" : "wsv-1",
            active_strategy_spec_registry_id: decisionAnswered
              ? "reg-winner-branch-v2"
              : "reg-winner-branch-v1",
          },
          meta: {},
        });
      }

      if (path === "/bff/agora/committee/meetings" && method === "GET") {
        return jsonFulfill(route, {
          status: "unavailable",
          reason: "no_trader_meetings",
          owner: "consultation",
          data: [],
          fallback_used: false,
        });
      }

      if (path === "/bff/agora/interactions/context:resolve" && method === "POST") {
        return jsonFulfill(route, {
          data: {
            workshop_id: workshopId,
            focused_object: { kind: "workshop", id: workshopId },
            strategy_ref: {
              strategy_id: "strat-winner-branch-001",
              version_id: decisionAnswered ? "reg-winner-branch-v2" : "reg-winner-branch-v1",
            },
            context_refs: [{ type: "workshop", id: workshopId }],
            context_digest: "digest-winner-branch-v10",
            environment: "paper",
            evidence_cutoff: asOf,
            verified: true,
            resolved_at: asOf,
          },
        });
      }

      if (path === "/bff/agora/interactions/participants:eligible" && method === "POST") {
        return jsonFulfill(route, {
          data: {
            included: [
              {
                persona_id: "per_quant",
                display_name: "量化籌碼審視專家",
                eligible: true,
                reasons: ["具備台股分點籌碼與動能因子審視能力"],
                recommended: true,
              },
            ],
            excluded: [],
          },
        });
      }

      if (path === "/bff/agora/interactions" && method === "GET") {
        const authority = {
          execution_authority: "none" as const,
          order_submitted: false as const,
          broker_called: false as const,
          capital_changed: false as const,
          runtime_bound: false as const,
          lifecycle_promoted: false as const,
          policy_mutated: false as const,
          persona_memory_mutated: false as const,
        };
        const mkParticipant = (id: string, name: string) => ({
          persona_id: id,
          persona_version: "7",
          session_persona_id: `session-${id}`,
          display_name: name,
          provider_agent_id: `agent-${id}`,
          workspace_id: `workspace-${id}`,
          environment_ceiling: "paper" as const,
          capability_snapshot: ["persona_opinion"],
          captured_at: asOf,
        });
        const pQuant = mkParticipant("per_quant", "量化籌碼審視專家");
        return jsonFulfill(route, {
          data: [
            {
              interaction_id: "int-winner-branch-01",
              workshop_id: workshopId,
              status: "running",
              human_request: {
                request_id: "req-winner-01",
                operator_id: "admintest",
                mode: "challenge",
                request_text: "審視贏家分點連 3 日買超信號在量縮盤的假突破風險",
                submitted_at: asOf,
                request_sha256: "a".repeat(64),
              },
              context_snapshot: {
                tenant_id: "pantheon-dev",
                source_route: `/agora/strategy-workshop/${workshopId}`,
                focused_object: { kind: "workshop", id: workshopId },
                context_refs: [{ kind: "workshop", id: workshopId }],
                evidence_cutoff: asOf,
                selected_persona_ids: ["per_quant"],
                initial_mode: "challenge",
                return_route: `/agora/strategy-workshop/${workshopId}`,
                captured_at: asOf,
              },
              participants: [pQuant],
              provider_invocations: [
                {
                  invocation_id: "invoke-quant-01",
                  participant: pQuant,
                  status: "succeeded",
                  request_correlation_id: "corr-req-quant-01",
                  response_correlation_id: "corr-res-quant-01",
                  started_at: asOf,
                  completed_at: asOf,
                },
              ],
              opinions: [
                {
                  opinion_id: "op-quant-01",
                  interaction_id: "int-winner-branch-01",
                  participant: pQuant,
                  provider_invocation_id: "invoke-quant-01",
                  conclusion: "conditional",
                  rationale: "贏家分點連買信號具顯著正期望值，但須先剔除高頻隔日沖分點造成的虛假集中度。",
                  confidence: 0.86,
                  uncertainty: ["量縮盤隔日沖倒貨波動"],
                  risks: ["短線急拉乖離過大追高風險"],
                  invalidation_conditions: ["分點轉為連續 2 日淨賣超"],
                  evidence_refs: [],
                  recommended_measures: [
                    {
                      measure_id: "m-overnight-filter",
                      measure_sha256: "c".repeat(64),
                      measure_type: "filter_rule",
                      target: {
                        kind: "strategy",
                        id: "strat-winner-branch-001",
                        version: "reg-winner-branch-v2",
                      },
                      proposed_value: { overnight_ratio_max: 0.35, ma20_deviation_max: 0.05 },
                      rationale: "剔除隔日沖占比 > 35% 之分點買超並限制 20MA 乖離上限 5%。",
                      expected_benefit: "降低假突破進場率約 28%，提升 10 日持有勝率 6.4%",
                      adverse_scenarios: ["強勢噴出股可能少部分錯失第一根買點"],
                      confidence: 0.86,
                      evidence_refs: [],
                      environment_ceiling: "paper",
                      validation_plan: {
                        validator: "pantheon_candidate_validation_v1",
                        required_checks: ["source_binding", "walk_forward_60d"],
                      },
                      rollback_trigger: "樣本外 20 日勝率低於 52%",
                      rollback_action: "恢復原始 8% 分點連買門檻",
                      authority,
                    },
                  ],
                  provenance: {
                    content_origin: "selected_persona_provider_response",
                    provider_kind: "openclaw",
                    provider_invocation_id: "invoke-quant-01",
                    request_correlated: true,
                    response_correlated: true,
                    canned_template: false,
                    magic_topic_trigger: false,
                    simulation: false,
                  },
                  created_at: asOf,
                  authority,
                },
              ],
              synthesis: {
                synthesis_id: "syn-winner-01",
                status: "recommendation",
                opinion_ids: ["op-quant-01"],
                summary: "所有與會專家已完成審視：建議納入隔日沖分點過濾與短線乖離上限。",
                agreements: ["剔除隔日沖占比 > 35% 之分點買超"],
                disagreements: [],
                risk_notes: ["注意財報公布當週流動性變化"],
                conditions: ["樣本外回測夏普值須維持 > 1.5"],
                evidence_refs: [],
                created_at: asOf,
                authority,
              },
              missing_participant_ids: [],
              degraded_participant_ids: [],
              candidate_proposal_links: [],
              audit_refs: ["audit-winner-01"],
              created_at: asOf,
              updated_at: asOf,
              authority,
            },
          ],
          meta: { next_page_token: null },
        });
      }

      if (path.endsWith("/stream")) {
        return route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          headers: { "Cache-Control": "no-cache" },
          body: 'id: e1\ndata: {"id":"e1","type":"workshop.connected","data":{"status":"ready"}}\n\n',
        });
      }

      return jsonFulfill(route, { data: [], items: [] });
    });

    await installOidcDevLogin(page, {
      goto: false,
      operatorId: "admintest",
      roles: ["operator", "admin"],
      tenantId: "pantheon-dev",
    });
    await installQuietEventSource(page);
    mkdirSync(WORKSHOP_PROOF_DIR, { recursive: true });

    // 1. Open Strategy Workshop list as admintest and fill a long multi-line zh-TW strategy description
    await page.goto("/agora/strategy-workshop");
    await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("create-workshop-btn").click();
    await expect(page.getByTestId("create-workshop-description-input")).toBeVisible();
    await page.getByTestId("create-workshop-description-input").fill(longZhDescription);
    await expect(page.getByTestId("create-workshop-derived-title")).toContainText(
      "自動衍生策略名稱：我想建立一套針對台股上市櫃中型電子與半導體供應鏈的「關鍵贏家分點波段策略…",
    );
    await page.screenshot({
      path: `${WORKSHOP_PROOF_DIR}/01-create-workshop-long-zh-description.png`,
    });

    // 2. Submit creation -> reaches completed reconstruction card and evaluated 12-block completeness rail
    await page.getByTestId("create-workshop-submit").click();
    await expect(page).toHaveURL(new RegExp(`/agora/strategy-workshop/${workshopId}$`));
    await expect(
      page.getByTestId("workshop-card-card_reconstruction_cec636a12d9f2f23412c"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("v10-twelve-blocks-section")).toBeVisible();
    await expect(page.getByTestId("v10-block-market_scope")).toContainText("已確認");
    await expect(page.getByTestId("v10-block-event_lead")).toContainText("助理推定");
    await expect(page.getByTestId("v10-block-migration_reverse_flow")).toContainText("尚缺");
    await expect(page.getByTestId("v10-block-signal_formation")).toContainText("薄弱");
    await expect(page.getByTestId("v10-block-validation_backtest_refutation")).toContainText("衝突");
    await expect(page.getByTestId("next-question-section")).toBeVisible();
    await expect(page.getByTestId("servant-default-composer-badge")).toBeVisible();
    await page.screenshot({
      path: `${WORKSHOP_PROOF_DIR}/02-completed-reconstruction-and-twelve-block-rail.png`,
    });

    // 3. Click high-value decision option A -> submits via POST /decisions and updates 12-block rail
    await page.getByTestId("rail-decision-option-opt_a").click();
    await expect(page.getByTestId("v10-block-signal_formation")).toContainText("已確認");
    await expect(page.getByTestId("v10-block-signal_formation")).toContainText(
      "交易員裁示（opt_a）：高分贏家分點連 3 日異常買超 ≥ 8% 且股價乖離 < 5%",
    );
    await expect(page.getByTestId("next-question-section")).toContainText(
      "請裁示「分點遷移與反向流（跨分點匯撥／隔日沖出貨）」的辨識與過濾規則",
    );
    await page.screenshot({
      path: `${WORKSHOP_PROOF_DIR}/03-decision-submitted-twelve-block-rail-updated.png`,
    });

    // 4. Verify readable candidate measures, backtest result card, version comparison, completed interaction status, and no_trader_meetings zh-TW empty state
    await expect(page.getByTestId("interaction-status-int-winner-branch-01")).toContainText(
      "completed",
    );
    await expect(page.getByTestId("measure-readable-fields-m-overnight-filter")).toContainText(
      "降低假突破進場率約 28%",
    );
    await expect(page.getByTestId("backtest-result-card-card-backtest-result-1")).toBeVisible();
    await expect(page.getByTestId("workshop-versions-panel")).toBeVisible();
    await expect(page.getByTestId("workshop-version-compare-section")).toBeVisible();
    await expect(page.getByTestId("workshop-convened-meetings-empty")).toContainText(
      "目前尚無審議會議紀錄",
    );
    await page.getByTestId("measure-readable-fields-m-overnight-filter").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${WORKSHOP_PROOF_DIR}/04-opinion-measures-backtest-version-compare-meetings-empty.png`,
    });
  });
});
