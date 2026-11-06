import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  LOCAL_FIXTURE_AUTH_TOKEN,
  installOidcDevLogin,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    "http://127.0.0.1:5173";
  return `${base.replace(/\/$/, "")}${path}`;
}

// MGMT-OPS-003-GAP-001 — proves the hosted Portfolio Book renders every
// degraded/missing-binding incident, all six required filters round-trip
// through the URL and the request, and no formal/covered claim leaks through
// while the fixture is degraded. Mirrors the live BFF holdings contract
// (services/control-plane/bff/main.py `bff_management_portfolio_book_holdings`).

const holdings = Array.from({ length: 14 }, (_, index) => ({
  holding_id: `holding-${index}`,
  runtime_id: `runtime-${index}`,
  persona_id: `persona-${index}`,
  capital_pool_id: index % 4 === 2 ? `pool-${index}` : null,
  broker_id: `broker-${index % 2}`,
  symbol: `SYM${index}`,
  market_value: 1000 + index,
  unrealized_pnl: -index,
  deployment_stage: ["paper", "canary", "live", "unknown"][index % 4],
  source_status: "degraded",
  telemetry_stale: index === 0,
  risk_state: index < 10 ? "missing_binding" : "degraded_source",
  source_issues: [{
    code: index < 10 ? "MISSING_PERSONA_BINDING" : "MISSING_TELEMETRY",
    message: "Authoritative source is missing",
  }],
  capital_scope: {
    scope_kind: ["paper_ledger", "canary_sleeve", "live_capital_pool", "unclassified"][index % 4],
    scope_id: index % 4 === 3 ? null : `scope-${index}`,
  },
  links: {
    persona_fleet: `/management/persona-fleet?persona_id=persona-${index}`,
    performance_attribution: `/management/performance-attribution?persona_id=persona-${index}&runtime_id=runtime-${index}`,
    human_review: `/management/human-inbox?holding_id=holding-${index}`,
  },
}));

test("renders every degraded incident and persists all six filters through reload", async ({ page }) => {
  test.skip(
    targetsExternalE2eEnvironment(),
    "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
  );
  const requests: string[] = [];
  await installOidcDevLogin(page, {
    goto: false,
    token: LOCAL_FIXTURE_AUTH_TOKEN,
  });
  await page.route("**/bff/management/portfolio-book/holdings**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: holdings,
          summary: {
            holding_count: 14,
            incident_count: 14,
            source_coverage: {
              source_row_count: 4, runtime_count: 14, telemetry_runtime_count: 4,
              stale_row_count: 1, missing_binding_count: 10, degraded_source_count: 14,
            },
          },
        },
        meta: {
          incidents: holdings.map((row) => ({
            id: `incident-${row.holding_id}`,
            severity: "high",
            message: "Authoritative source is missing",
            risk_state: row.risk_state,
            source_status: row.source_status,
            source_issues: row.source_issues,
            identity: { portfolio_id: row.holding_id },
            links: row.links,
          })),
          surfaces: {
            portfolio_book_holdings: { status: "degraded", message: "row-level coverage incidents" },
          },
        },
      }),
    });
  });

  await page.goto(
    "/management/portfolio-book?deployment_stage=canary&broker_id=broker-1&runtime_id=runtime-1&source_status=degraded&stale_telemetry=false&risk_state=missing_binding",
  );

  await expect(page.getByTestId("portfolio-incident")).toHaveCount(14);
  await expect(page.getByTestId("portfolio-holding")).toHaveCount(14);
  await expect(page.getByText("Source: degraded").first()).toBeVisible();
  await expect(page.getByText("Unknown capital scope").first()).toBeVisible();
  for (const label of ["Stage", "Broker", "Runtime", "Source status", "Stale telemetry", "Risk state"]) {
    await expect(page.getByLabel(label)).not.toHaveValue("");
  }

  const initialRequestParams = new URL(requests.at(-1)!).searchParams;
  const initialExpected = {
    deployment_stage: "canary", broker_id: "broker-1", runtime_id: "runtime-1",
    source_status: "degraded", stale_telemetry: "false", risk_state: "missing_binding",
  };
  for (const [key, value] of Object.entries(initialExpected)) {
    expect(initialRequestParams.get(key)).toBe(value);
  }

  await page.getByLabel("Stage").selectOption("live");
  await page.getByLabel("Broker").selectOption("");
  await page.getByLabel("Runtime").selectOption("");
  await page.getByLabel("Source status").selectOption("stale");
  await page.getByLabel("Stale telemetry").selectOption("true");
  await page.getByLabel("Risk state").selectOption("stale_telemetry");

  await expect(page).toHaveURL(/deployment_stage=live/);
  await expect(page).toHaveURL(/source_status=stale/);
  await expect(page).toHaveURL(/stale_telemetry=true/);
  await expect(page).toHaveURL(/risk_state=stale_telemetry/);
  await expect(page).not.toHaveURL(/broker_id=/);
  await expect(page).not.toHaveURL(/runtime_id=/);

  await page.reload();
  for (const [label, value] of [
    ["Stage", "live"], ["Broker", ""], ["Runtime", ""],
    ["Source status", "stale"], ["Stale telemetry", "true"], ["Risk state", "stale_telemetry"],
  ]) {
    await expect(page.getByLabel(label)).toHaveValue(value);
  }

  const requestParams = new URL(requests.at(-1)!).searchParams;
  const expected = {
    deployment_stage: "live", source_status: "stale",
    stale_telemetry: "true", risk_state: "stale_telemetry",
  };
  for (const [key, value] of Object.entries(expected)) {
    expect(requestParams.get(key)).toBe(value);
  }
  expect(requestParams.has("broker_id")).toBe(false);
  expect(requestParams.has("runtime_id")).toBe(false);

  await expect(page.getByText(/formal attribution|covered/i)).toHaveCount(0);

  const humanReviewLinks = page.getByRole("link", { name: "Human Review" });
  await expect(humanReviewLinks.first()).toHaveAttribute("href", /\/management\/human-inbox\?/);
});

const REAL_BFF_HOLDINGS_PRE_TELEMETRY_20261106 = [
  {
    holding_id: "rt-535a82a3:2330.TWSE",
    runtime_id: "rt-535a82a3",
    persona_id: "persona-tw-alpha",
    broker_id: "",
    symbol: "2330.TWSE",
    side: "short",
    quantity: -5,
    average_price: null,
    mark_price: 2240,
    market_value: -11200,
    unrealized_pnl: null,
    realized_pnl: null,
    currency: null,
    deployment_stage: "paper",
    source_status: "ok",
    telemetry_stale: false,
    risk_state: "paper_exposure",
    mark_status: "available",
    last_mark_at: "2026-11-05T00:00:00Z",
    source_issues: [],
    capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: "pool-tw" },
    links: {
      persona_fleet: "/management/persona-fleet?persona_id=persona-tw-alpha",
      performance_attribution: "/management/performance?tab=attribution&persona_id=persona-tw-alpha&runtime_id=rt-535a82a3",
      human_review: "/management/human-inbox?target_id=rt-535a82a3%3A2330.TWSE",
    },
  },
  {
    holding_id: "rt-8b0d8649:0050.TWSE",
    runtime_id: "rt-8b0d8649",
    persona_id: "persona-tw-beta",
    broker_id: "",
    symbol: "0050.TWSE",
    side: "short",
    quantity: -5,
    average_price: null,
    mark_price: 97.15,
    market_value: -485.75,
    unrealized_pnl: null,
    realized_pnl: null,
    currency: null,
    deployment_stage: "paper",
    source_status: "ok",
    telemetry_stale: false,
    risk_state: "paper_exposure",
    mark_status: "available",
    last_mark_at: "2026-11-05T00:00:00Z",
    source_issues: [],
    capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: "pool-tw" },
    links: {},
  },
  {
    holding_id: "rt-c98e4223:2317.TWSE",
    runtime_id: "rt-c98e4223",
    persona_id: "persona-tw-gamma",
    broker_id: "",
    symbol: "2317.TWSE",
    side: "short",
    quantity: -3,
    average_price: null,
    mark_price: 235,
    market_value: -705,
    unrealized_pnl: null,
    realized_pnl: null,
    currency: null,
    deployment_stage: "paper",
    source_status: "ok",
    telemetry_stale: false,
    risk_state: "paper_exposure",
    mark_status: "available",
    last_mark_at: "2026-11-05T00:00:00Z",
    source_issues: [],
    capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: "pool-tw" },
    links: {},
  },
  {
    holding_id: "rt-342d76ff:2330.TW",
    runtime_id: "rt-342d76ff",
    persona_id: "persona-tw-delta",
    broker_id: "",
    symbol: "2330.TW",
    side: "short",
    quantity: -1,
    average_price: null,
    mark_price: 2240,
    market_value: -2240,
    unrealized_pnl: null,
    realized_pnl: null,
    currency: null,
    deployment_stage: "paper",
    source_status: "ok",
    telemetry_stale: false,
    risk_state: "paper_exposure",
    mark_status: "available",
    last_mark_at: "2026-11-05T00:00:00Z",
    source_issues: [],
    capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: "pool-tw" },
    links: {},
  },
];

const REAL_BFF_HOLDINGS_POST_TELEMETRY_20261106 = [
  {
    ...REAL_BFF_HOLDINGS_PRE_TELEMETRY_20261106[0],
    currency: "TWD",
    broker_id: "shioaji_paper",
    average_price: 2299,
    unrealized_pnl: 295,
    realized_pnl: 0,
    pnl_pct: -0.99,
  },
  {
    ...REAL_BFF_HOLDINGS_PRE_TELEMETRY_20261106[1],
    currency: "TWD",
    broker_id: "shioaji_paper",
    average_price: 101.33,
    unrealized_pnl: 20.9,
    realized_pnl: 0,
  },
  {
    ...REAL_BFF_HOLDINGS_PRE_TELEMETRY_20261106[2],
    currency: "TWD",
    broker_id: "shioaji_paper",
    average_price: 240.166667,
    unrealized_pnl: 15.5,
    realized_pnl: -5.5,
  },
  {
    ...REAL_BFF_HOLDINGS_PRE_TELEMETRY_20261106[3],
    currency: "TWD",
    broker_id: "shioaji_paper",
    average_price: 2240,
    unrealized_pnl: 0,
    realized_pnl: 0,
  },
];

test("renders 2026-11-06 BFF holdings shapes with Holding..Unrealized PnL visible at 1440px and real scrollbars shown", async ({
  browser,
}, testInfo) => {
  test.skip(
    targetsExternalE2eEnvironment(),
    "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
  );

  const realScrollbarBrowser = await browser.browserType().launch({
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });

  try {
    let activeItems = REAL_BFF_HOLDINGS_PRE_TELEMETRY_20261106;
    const context = await realScrollbarBrowser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await installOidcDevLogin(page, {
      goto: false,
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    await page.route("**/bff/management/portfolio-book/holdings**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            items: activeItems,
            summary: {
              holding_count: activeItems.length,
              incident_count: 0,
              source_coverage: {
                source_row_count: activeItems.length,
                runtime_count: activeItems.length,
                telemetry_runtime_count: activeItems.length,
                stale_row_count: 0,
                missing_binding_count: 0,
                degraded_source_count: 0,
              },
            },
          },
          meta: {
            incidents: [],
            surfaces: {
              portfolio_book_holdings: { status: "ok", message: "ok" },
            },
          },
        }),
      });
    });

    // 1. Pre-telemetry shape (zh-TW): null currency, null average_price, null PnL
    await page.addInitScript(() => {
      if (!window.localStorage.getItem("pantheon.locale")) {
        window.localStorage.setItem("pantheon.locale", "zh-TW");
      }
    });
    await page.goto(frontendUrl("/management/performance?tab=overview"));
    await expect(page.getByTestId("portfolio-holding")).toHaveCount(4);

    const preRow0050 = page.getByTestId("portfolio-holding").filter({ hasText: "rt-8b0d8649:0050.TWSE" });
    await expect(preRow0050.locator("td").nth(1)).toContainText("-5");
    await expect(preRow0050.locator("td").nth(1)).toContainText("空頭部位");
    await expect(preRow0050.locator("td").nth(2)).toHaveText("— 來源未提供平均成本");
    await expect(preRow0050.locator("td").nth(3)).toContainText("97.15");
    await expect(preRow0050.locator("td").nth(3)).toContainText("截至 2026-11-05");
    await expect(preRow0050.locator("td").nth(4)).toHaveText("-485.75 (幣別未提供)");
    await expect(preRow0050.locator("td").nth(5)).toHaveText("— 來源未提供平均成本");

    // 2. Post-telemetry shape (zh-TW and en-US) + 1440px column visibility + scrollbar screenshot
    activeItems = REAL_BFF_HOLDINGS_POST_TELEMETRY_20261106;
    const evidenceByLocale: Record<string, unknown> = {};

    for (const locale of ["zh-TW", "en-US"] as const) {
      await page.evaluate((lang) => {
        window.localStorage.setItem("pantheon.locale", lang);
      }, locale);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("portfolio-holding")).toHaveCount(4);

      const row2330 = page.getByTestId("portfolio-holding").filter({ hasText: "rt-535a82a3:2330.TWSE" });
      const row0050 = page.getByTestId("portfolio-holding").filter({ hasText: "rt-8b0d8649:0050.TWSE" });
      const row2317 = page.getByTestId("portfolio-holding").filter({ hasText: "rt-c98e4223:2317.TWSE" });
      const row2330Tw = page.getByTestId("portfolio-holding").filter({ hasText: "rt-342d76ff:2330.TW" });

      if (locale === "zh-TW") {
        await expect(row2330.locator("td").nth(2)).toHaveText("NT$2,299");
        await expect(row2330.locator("td").nth(3)).toContainText("NT$2,240");
        await expect(row2330.locator("td").nth(3)).toContainText("截至 2026-11-05");
        await expect(row2330.locator("td").nth(4)).toHaveText("-NT$11,200");
        await expect(row2330.locator("td").nth(5)).toHaveText("NT$295 (+2.57%)");

        await expect(row0050.locator("td").nth(2)).toHaveText("NT$101.33");
        await expect(row0050.locator("td").nth(3)).toContainText("NT$97.15");
        await expect(row0050.locator("td").nth(4)).toHaveText("-NT$485.75");
        await expect(row0050.locator("td").nth(5)).toHaveText("NT$20.90 (+4.13%)");

        await expect(row2317.locator("td").nth(2)).toHaveText("NT$240.17");
        await expect(row2317.locator("td").nth(3)).toContainText("NT$235");
        await expect(row2317.locator("td").nth(4)).toHaveText("-NT$705");
        await expect(row2317.locator("td").nth(5)).toContainText("NT$15.50 (+2.15%)");
        await expect(row2317.locator("td").nth(5)).toContainText("已實現 -NT$5.50");

        await expect(row2330Tw.locator("td").nth(2)).toHaveText("NT$2,240");
        await expect(row2330Tw.locator("td").nth(5)).toHaveText("NT$0 (0.00%)");
      } else {
        await expect(row2330.locator("td").nth(2)).toHaveText("NT$2,299");
        await expect(row2330.locator("td").nth(3)).toContainText("NT$2,240");
        await expect(row2330.locator("td").nth(3)).toContainText("As of 2026-11-05");
        await expect(row2317.locator("td").nth(5)).toContainText("NT$15.50 (+2.15%)");
        await expect(row2317.locator("td").nth(5)).toContainText("Realized -NT$5.50");
      }

      const metrics = await page.evaluate(() => {
        const sidebar = document.querySelector<HTMLElement>("nav");
        const sidebarRect = sidebar?.getBoundingClientRect();
        const scroller = document.querySelector<HTMLElement>('[data-management-table-scrollbar="native"]');
        const pinned = document.querySelector<HTMLElement>('[data-management-table-scrollbar="pinned"]');
        const table = scroller?.querySelector("table");
        if (!scroller || !table) {
          throw new Error("missing holdings table scroller");
        }

        scroller.scrollLeft = 0;
        const scrollerRect = scroller.getBoundingClientRect();
        const ths = Array.from(table.querySelectorAll("thead th"));
        const columnsAtZero = ths.map((th, idx) => {
          const r = th.getBoundingClientRect();
          return {
            index: idx,
            header: (th.textContent ?? "").trim(),
            left: Number(r.left.toFixed(2)),
            right: Number(r.right.toFixed(2)),
            width: Number(r.width.toFixed(2)),
            fullyVisible: r.left >= scrollerRect.left - 0.5 && r.right <= scrollerRect.right + 0.5,
          };
        });

        const firstSixHeadersVisible = columnsAtZero.slice(0, 6).every((col) => col.fullyVisible);
        const firstSixCellsVisible = Array.from(table.querySelectorAll("tbody tr")).every((tr) =>
          Array.from(tr.querySelectorAll("td"))
            .slice(0, 6)
            .every((td) => {
              const r = td.getBoundingClientRect();
              return r.left >= scrollerRect.left - 0.5 && r.right <= scrollerRect.right + 0.5;
            }),
        );

        let overlapsAtZero = 0;
        for (let i = 1; i < ths.length; i += 1) {
          if (ths[i - 1]!.getBoundingClientRect().right > ths[i]!.getBoundingClientRect().left + 0.5) {
            overlapsAtZero += 1;
          }
        }

        scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
        const maxScrollLeft = scroller.scrollLeft;
        const columnsAtMaxScroll = ths.map((th, idx) => {
          const r = th.getBoundingClientRect();
          return {
            index: idx,
            header: (th.textContent ?? "").trim(),
            left: Number(r.left.toFixed(2)),
            right: Number(r.right.toFixed(2)),
            width: Number(r.width.toFixed(2)),
            fullyVisible: r.left >= scrollerRect.left - 0.5 && r.right <= scrollerRect.right + 0.5,
          };
        });

        let overlapsAtMax = 0;
        for (let i = 1; i < ths.length; i += 1) {
          if (ths[i - 1]!.getBoundingClientRect().right > ths[i]!.getBoundingClientRect().left + 0.5) {
            overlapsAtMax += 1;
          }
        }

        // Return to scrollLeft = 0 for the primary 1440px screenshot showing Holding..Unrealized PnL
        scroller.scrollLeft = 0;
        if (pinned) pinned.scrollLeft = 0;

        const pinnedRect = pinned?.getBoundingClientRect();
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          sidebar: sidebarRect
            ? {
                left: Number(sidebarRect.left.toFixed(2)),
                right: Number(sidebarRect.right.toFixed(2)),
                width: Number(sidebarRect.width.toFixed(2)),
              }
            : null,
          scroller: {
            left: Number(scrollerRect.left.toFixed(2)),
            right: Number(scrollerRect.right.toFixed(2)),
            clientWidth: scroller.clientWidth,
            offsetWidth: scroller.offsetWidth,
            scrollWidth: scroller.scrollWidth,
            maxScrollLeft: Number(maxScrollLeft.toFixed(2)),
          },
          pinnedScrollbar: pinned
            ? {
                height: Number((pinnedRect?.height ?? 0).toFixed(2)),
                clientHeight: pinned.clientHeight,
                offsetHeight: pinned.offsetHeight,
                scrollWidth: pinned.scrollWidth,
              }
            : null,
          firstSixVisibleAtZero: firstSixHeadersVisible && firstSixCellsVisible,
          remainingReachableAtMaxScroll: columnsAtMaxScroll.slice(6).every((col) => col.fullyVisible),
          overlapsAtZero,
          overlapsAtMax,
          columnsAtZero,
          columnsAtMaxScroll,
        };
      });

      expect(metrics.sidebar).not.toBeNull();
      expect(metrics.sidebar!.width).toBeGreaterThan(200);
      expect(metrics.firstSixVisibleAtZero).toBe(true);
      expect(metrics.remainingReachableAtMaxScroll).toBe(true);
      expect(metrics.overlapsAtZero).toBe(0);
      expect(metrics.overlapsAtMax).toBe(0);

      const screenshotPath = testInfo.outputPath(`holdings-cost-price-1440-${locale}.png`);
      const buffer = await page.screenshot({ path: screenshotPath, fullPage: false });
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      await testInfo.attach(`holdings-cost-price-1440-${locale}`, {
        body: buffer,
        contentType: "image/png",
      });

      evidenceByLocale[locale] = {
        ...metrics,
        screenshot: {
          file: `holdings-cost-price-1440-${locale}.png`,
          sha256,
          bytes: buffer.byteLength,
          viewport: { width: 1440, height: 900 },
          scrollbarsShown: true,
          ignoreDefaultArgs: ["--hide-scrollbars"],
        },
      };
    }

    console.log("HOLDINGS_1440_EVIDENCE:", JSON.stringify(evidenceByLocale));
    await context.close();
  } finally {
    await realScrollbarBrowser.close();
  }
});
