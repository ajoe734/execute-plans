import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { Link, MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { bffV1, type Persona } from "@/lib/bff-v1";
import {
  adaptTradingPulseOverview,
  adaptTradingPulseRankings,
} from "@/lib/bff-v1/management";
import { getPersona, getPersonaManagement } from "@/lib/bff-v1/personas";
import {
  TRADING_PULSE_HOSTED_WIRE_SAMPLE,
  TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE,
} from "@/lib/bff-v1/__tests__/fixtures/trading-pulse";
import * as journeysApi from "@/lib/bff-v1/tradeJourneys";
import { TradeJourneysPage, TradeJourneyDetailPage } from "../trade-journeys/TradeJourneysPage";
import { fixtureMeta, rejectedRow, rejectedDetailStages, rejectedTimeline } from "../trade-journeys/__fixtures__/readableJourneys";
import { PersonaDetail } from "../PersonaDetail";
import { TradingPulsePage } from "./_core";

// Reproduces the latest hosted projection described in the task packet. Journey
// IDs are synthetic fixture IDs; period telemetry remains the original sample.
function latestHoldOverview() {
  return {
    ...TRADING_PULSE_HOSTED_WIRE_SAMPLE,
    data: {
      ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data,
      runtime_rows: TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows.map((row, index) => ({
        ...row,
        underlying_symbol: ["2330.TWSE", "0050.TWSE", "2317.TWSE"][index],
        latest_outcome: {
          status: "available", kind: "no_trade", reason_code: "hold_signal",
          occurred_at: index === 0 ? "2026-11-22T23:34:51Z" : "2026-11-22T23:34:52Z",
          requested_quantity: 1, filled_quantity: null, submitted_to_broker: null,
          side: null, order_id: null, broker_order_id: null, required: null, available: null,
          journey_id: `tj_fixture-latest-hold-${index}`,
        } as Record<string, unknown>,
        links: { ...row.links, journey: `/management/trade-journeys/tj_fixture-latest-hold-${index}?tenant_id=tenant-dev&environment=paper` },
      })),
    },
  };
}

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      strategies: { ...actual.bffV1.strategies, listForPersona: vi.fn().mockResolvedValue([]) },
      audit: { ...actual.bffV1.audit, list: vi.fn().mockResolvedValue([]) },
    },
  };
});

vi.mock("@/lib/bff-v1/personas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1/personas")>();
  return {
    ...actual,
    getPersona: vi.fn(),
    getPersonaManagement: vi.fn().mockResolvedValue(undefined),
  };
});

function renderPage(element: ReactElement, initialEntry = "/management/trading-pulse") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>
    </I18nextProvider>,
  );
}

function mockTradingPulseLive(
  rawOverviewPayload: unknown = TRADING_PULSE_HOSTED_WIRE_SAMPLE,
  rawRankingsPayload: unknown = TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE,
  opts?: {
    overviewLoading?: boolean;
    overviewError?: Error | null;
    rankingsLoading?: boolean;
    rankingsError?: Error | null;
  },
) {
  const adaptedOverview =
    rawOverviewPayload !== undefined && rawOverviewPayload !== null
      ? adaptTradingPulseOverview(rawOverviewPayload)
      : undefined;
  const adaptedRankings =
    rawRankingsPayload !== undefined && rawRankingsPayload !== null
      ? adaptTradingPulseRankings(rawRankingsPayload)
      : undefined;

  mocks.useV5Live.mockImplementation((_loader, _deps, liveOpts?: { cacheKey?: string }) => {
    if (liveOpts?.cacheKey === "oversight.tradingPulse.rankings") {
      return {
        data: adaptedRankings ?? undefined,
        loading: opts?.rankingsLoading ?? false,
        error: opts?.rankingsError ?? null,
        refresh: vi.fn(),
      };
    }
    return {
      data: adaptedOverview ?? undefined,
      loading: opts?.overviewLoading ?? false,
      error: opts?.overviewError ?? null,
      refresh: vi.fn(),
    };
  });

  return { adaptedOverview, adaptedRankings };
}

describe("TradingPulsePage operator-readable overview, Persona details, and rankings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-TW");
    mocks.useV5Live.mockReset();
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en-US");
  });

  it("renders sections in required top-to-bottom order with verified names, symbols, comparable P&L subtotal, 澄川 2317 rejection case, and concise rankings in zh-TW and en-US", async () => {
    mockTradingPulseLive();
    const zhView = renderPage(<TradingPulsePage />);

    // 1. Top-to-bottom section ordering
    const scopeSection = screen.getByTestId("trading-pulse-operator-scope");
    const pnlSection = screen.getByTestId("trading-pulse-pnl-groups");
    const eventsSection = screen.getByTestId("trading-pulse-notable-events");
    const personaSection = screen.getByTestId("trading-pulse-persona-details");
    const rankingsSection = screen.getByTestId("trading-pulse-rankings");
    const diagnosticsSection = screen.getByTestId("trading-pulse-diagnostics");

    expect(scopeSection.compareDocumentPosition(pnlSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pnlSection.compareDocumentPosition(eventsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(eventsSection.compareDocumentPosition(personaSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(personaSection.compareDocumentPosition(rankingsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rankingsSection.compareDocumentPosition(diagnosticsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 2. Operator scope summary: 3 operational Personas in paper trading, paper baseline summarized once
    expect(within(scopeSection).getByText("參與營運 Persona：3 人")).toBeInTheDocument();
    expect(within(scopeSection).getByText("模擬交易 3 人")).toBeInTheDocument();
    expect(within(scopeSection).getByText("名單已核實")).toBeInTheDocument();
    expect(
      within(scopeSection).getByText("目前皆為模擬交易，無須進行實盤基準比較。"),
    ).toBeInTheDocument();

    // 3. Comparable P&L group: TWD -177.82, combined realized+unrealized, 2 / 3 Persona coverage
    expect(within(pnlSection).getByText(/TWD -177\.82（虧損）/)).toBeInTheDocument();
    expect(within(pnlSection).getByText("已實現＋未實現合計損益")).toBeInTheDocument();
    expect(within(pnlSection).getByText("涵蓋 2 / 3 位 Persona")).toBeInTheDocument();
    expect(
      within(pnlSection).getByText("其餘 1 位尚無成交損益或未達可比較條件"),
    ).toBeInTheDocument();

    // 4. Keep the known rejection and the latest execution without event fill
    // evidence. The period's 1/1 cannot establish a full fill for that event.
    expect(within(eventsSection).getByText("澄川｜2317 台股 Paper")).toBeInTheDocument();
    expect(within(eventsSection).getByText("青禾｜2330 台股 Paper 學習 R3")).toBeInTheDocument();
    expect(within(eventsSection).getByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toBeInTheDocument();
    expect(within(eventsSection).queryByText("衡岳｜0050 台股 ETF Paper")).not.toBeInTheDocument();
    expect(within(eventsSection).getByText("送券商前風控拒單（未送出委託）")).toBeInTheDocument();
    expect(within(eventsSection).getByText("資金不足")).toBeInTheDocument();
    expect(
      within(eventsSection).getByText("該次意向 452 股、成交 0 股（成交率 0%）"),
    ).toBeInTheDocument();
    expect(
      within(eventsSection).getByText("所需 TWD 100,034.35 ／ 可用 TWD 100,000.00"),
    ).toBeInTheDocument();

    // 5. Persona details table: 3 named rows with symbols, fill counts, fill rates, verifiable P&L, and latest outcome
    const table = within(personaSection).getByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(3);

    const qingheRow = bodyRows.find((r) => r.textContent?.includes("青禾｜2330 台股 Paper 學習 R3")) as HTMLElement;
    expect(within(qingheRow).getByText("標的 2330")).toBeInTheDocument();
    expect(within(qingheRow).getByText("模擬交易")).toBeInTheDocument();
    expect(within(qingheRow).getByText("運行中")).toBeInTheDocument();
    expect(within(qingheRow).getByText("1 筆成交")).toBeInTheDocument();
    expect(within(qingheRow).getByText("100%（區間意向 1 股、成交 1 股）")).toBeInTheDocument();
    expect(within(qingheRow).getByText(/TWD -168\.09（虧損）/)).toBeInTheDocument();
    expect(within(qingheRow).getByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toBeInTheDocument();
    expect(within(qingheRow).getByText("平均滑價 0 bps")).toBeInTheDocument();
    expect(within(qingheRow).getByText("最大回撤 1.2%")).toBeInTheDocument();
    expect(
      within(qingheRow).getByRole("link", { name: "查看交易旅程" }).getAttribute("href"),
    ).toContain("tj_29473e86-63ff-5384-bda1-23eef61cebb2");

    const chengchuanRow = bodyRows.find((r) => r.textContent?.includes("澄川｜2317 台股 Paper")) as HTMLElement;
    expect(within(chengchuanRow).getByText("標的 2317")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("模擬交易")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("0 筆成交")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("尚未成交")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("0%（區間意向 452 股、成交 0 股）")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("尚無成交損益（帳本幣別 TWD）")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("資金不足")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("送券商前風控拒單（未送出委託）")).toBeInTheDocument();

    // 6. Rankings: localized titles, negative P&L explicitly labeled as loss (not profit), and empty Sharpe block explained in omitted metrics note
    expect(within(rankingsSection).getByText("損益表現排行")).toBeInTheDocument();
    expect(within(rankingsSection).getByText("回撤控制排行")).toBeInTheDocument();
    expect(within(rankingsSection).getByText("成交品質排行")).toBeInTheDocument();
    expect(
      within(rankingsSection).getByText("目前入列數值皆為虧損（負值），依虧損幅度較小排序，非獲利。"),
    ).toBeInTheDocument();
    expect(
      within(rankingsSection).getAllByText("未列入排行（1 位）：澄川｜2317 台股 Paper（尚無成交）").length,
    ).toBeGreaterThanOrEqual(2);
    const omittedNote = screen.getByTestId("trading-pulse-rankings-omitted");
    expect(within(omittedNote).getByText(/夏普比率排行（3 位未達可比較條件）/)).toBeInTheDocument();
    expect(
      within(omittedNote).getByText(/青禾｜2330 台股 Paper 學習 R3（樣本累積中：至少需要 10 個交易日的日報酬）/),
    ).toBeInTheDocument();
    expect(
      within(omittedNote).getByText(/衡岳｜0050 台股 ETF Paper（報酬變異為 0（不適用夏普比率））/),
    ).toBeInTheDocument();

    // 7. No raw technical IDs, LIVE BFF, Row health, Checks, raw unit codes, or mixed-locale English headers in zh-TW default view
    const defaultPageTextZh = zhView.container.textContent ?? "";
    expect(defaultPageTextZh).not.toMatch(/rt-ad81501b|rt-0050paper|rt-3252fa75|rb-3823397e125e4579ba5f4174067087ed/);
    expect(defaultPageTextZh).not.toMatch(/LIVE BFF|Row health|Checks|Runtime Status|Execution Quality|Fill Rate/);
    expect(defaultPageTextZh).not.toMatch(/absolute_order_quantity|1\/1 SHARES|0\/452 SHARES/);
    zhView.unmount();

    // 8. Verify en-US locale consistency
    await i18n.changeLanguage("en-US");
    const enView = renderPage(<TradingPulsePage />);
    expect(screen.getByText("Operational Personas: 3")).toBeInTheDocument();
    expect(screen.getByText("Paper: 3")).toBeInTheDocument();
    expect(screen.getByText("Coverage: 2 / 3 Personas")).toBeInTheDocument();
    expect(screen.getByText("0% (Period intent 452 shares, filled 0 shares)")).toBeInTheDocument();
    expect(screen.getByText("No fill P&L yet (ledger currency TWD)")).toBeInTheDocument();
    expect(screen.getByText("P&L Performance")).toBeInTheDocument();
    expect(screen.getByText("Drawdown Control")).toBeInTheDocument();
    expect(screen.getByText("Execution Quality")).toBeInTheDocument();
    expect(
      screen.getByText("All ranked values are currently net losses (negative), ordered by smaller loss rather than profit."),
    ).toBeInTheDocument();
    const defaultPageTextEn = enView.container.textContent ?? "";
    expect(defaultPageTextEn).not.toMatch(/成交率|資料診斷|模擬交易|尚未成交/);
    expect(defaultPageTextEn).not.toMatch(/LIVE BFF|Row health|Checks|absolute_order_quantity|1\/1 SHARES|0\/452 SHARES/);
  });

  it("keeps Data Diagnostics collapsed by default and reveals sources, effective timestamps, and runtime IDs when expanded", () => {
    mockTradingPulseLive();
    renderPage(<TradingPulsePage />);

    const diagButton = screen.getByRole("button", { name: "資料診斷" });
    expect(diagButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("trading-pulse-diagnostics-panel")).not.toBeInTheDocument();
    expect(screen.queryByText(/rt-ad81501b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/rt-3252fa75/)).not.toBeInTheDocument();

    // Expand diagnostics
    fireEvent.click(diagButton);
    expect(diagButton).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByTestId("trading-pulse-diagnostics-panel");
    expect(within(panel).getByText("management_trading_pulse")).toBeInTheDocument();
    expect(within(panel).getByText("telemetry_summary")).toBeInTheDocument();
    expect(within(panel).getByText(/rt-ad81501b/)).toBeInTheDocument();
    expect(within(panel).getByText(/rt-0050paper/)).toBeInTheDocument();
    expect(within(panel).getByText(/rt-3252fa75/)).toBeInTheDocument();

    // Collapse diagnostics hides technical IDs again
    fireEvent.click(diagButton);
    expect(diagButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("trading-pulse-diagnostics-panel")).not.toBeInTheDocument();
    expect(screen.queryByText(/rt-ad81501b/)).not.toBeInTheDocument();
  });

  it("distinguishes 0/0 no orders, 0/452 source failure, stale telemetry, true 0 P&L, and missing links without synthesizing values or links", async () => {
    await i18n.changeLanguage("zh-TW");
    mockTradingPulseLive(
      {
        data: {
          id: "management-trading-pulse",
          summary: {
            operator_scope: {
              status: "partial",
              tenant_id: "tenant-dev",
              persona_count: 3,
              runtime_count: 3,
              by_stage: {
                paper: { persona_count: 2, runtime_count: 2 },
                canary: { persona_count: 1, runtime_count: 1 },
              },
            },
            pnl_groups: [],
            runtime_count: 3,
          },
          runtime_rows: [
            {
              // Row 1: 0/0 no submitted orders, true 0 PnL, 0% drawdown, 0 bps slippage, no valid links
              runtime_id: "rt-no-orders",
              runtime_binding_id: "rb-no-orders",
              persona_name: "無委託測試 Persona",
              underlying_symbol: "2303",
              deployment_stage: "canary",
              status: "active",
              metrics: {
                pnl: 0,
                drawdown: 0,
                fill_rate: 0,
                avg_slippage_bps: 0,
              },
              performance_context: {
                ledger_fill_count: 0,
                pnl_currency: "TWD",
                pnl_period_start_at: "2026-11-20T00:00:00Z",
                pnl_at: "2026-11-22T12:00:00Z",
                pnl_definition: "realized_plus_unrealized",
                fill_rate_details: {
                  status: "unknown",
                  reason: "no_submitted_orders",
                  numerator: 0,
                  denominator: 0,
                  unit: "SHARES",
                },
                source_status: "available",
              },
              links: {
                persona: "#",
                journey: "/management/trade-journeys",
              },
            },
            {
              // Row 2: 0/452 positive denominator but source_unavailable -> must NOT render 0% fill rate
              runtime_id: "rt-source-down",
              runtime_binding_id: "rb-source-down",
              persona_name: "來源故障 Persona",
              underlying_symbol: "2454",
              deployment_stage: "paper",
              status: "degraded",
              metrics: {
                pnl: null,
                fill_rate: null,
              },
              performance_context: {
                ledger_fill_count: null,
                pnl_currency: "TWD",
                fill_rate_details: {
                  status: "unknown",
                  reason: "source_unavailable",
                  numerator: 0,
                  denominator: 452,
                  unit: "SHARES",
                },
                metric_reasons: {
                  pnl: "source_unavailable",
                  fill_rate: "source_unavailable",
                  total_trades: "source_unavailable",
                },
                source_status: "unavailable",
              },
            },
            {
              // Row 3: Stale telemetry data
              runtime_id: "rt-stale",
              runtime_binding_id: "rb-stale",
              persona_id: "persona-stale-1",
              persona_name: "資料過期 Persona",
              underlying_symbol: "2881",
              deployment_stage: "paper",
              status: "active",
              telemetry_summary: {
                collected_at: "2026-11-20T01:00:00Z",
                staleness: {
                  is_stale: true,
                  status: "stale",
                },
                metrics: {
                  pnl: null,
                },
              },
            },
          ],
        },
        meta: {
          snapshot_at: "2026-11-22T12:00:00Z",
          surfaces: {
            management_trading_pulse: { status: "degraded", source: "bff_composed" },
          },
        },
      },
      { data: { items: [] } },
    );

    renderPage(<TradingPulsePage />);

    // Partial scope & source issue reminder in summary; mixed Canary/Paper scope must NOT claim all Personas are paper
    expect(screen.getByTestId("trading-pulse-scope-partial")).toBeInTheDocument();
    expect(screen.getByTestId("trading-pulse-source-issue-reminder")).toBeInTheDocument();
    expect(
      screen.queryByText("目前皆為模擬交易，無須進行實盤基準比較。"),
    ).not.toBeInTheDocument();
    // Uncomparable P&L explanation when rows have P&L but pnl_groups is empty
    expect(
      screen.getByText(
        "各 Persona 的損益幣別、期間或定義尚未由來源證實可比較，故不跨列加總；請見下方個別 Persona 明細。",
      ),
    ).toBeInTheDocument();

    const rows = screen.getAllByRole("row").slice(1);
    const noOrdersRow = rows.find((r) => r.textContent?.includes("無委託測試 Persona")) as HTMLElement;
    expect(within(noOrdersRow).getByText("金絲雀 (Canary)")).toBeInTheDocument();
    expect(within(noOrdersRow).getByText("尚未有委託（尚無可計算的成交率）")).toBeInTheDocument();
    expect(within(noOrdersRow).getByText("TWD 0.00（持平）")).toBeInTheDocument();
    expect(within(noOrdersRow).getByText("平均滑價 0 bps")).toBeInTheDocument();
    expect(within(noOrdersRow).getByText("最大回撤 0%")).toBeInTheDocument();
    expect(within(noOrdersRow).getByText("無明細連結")).toBeInTheDocument();
    expect(within(noOrdersRow).getByText("尚無交易旅程連結")).toBeInTheDocument();
    expect(within(noOrdersRow).queryByRole("link")).not.toBeInTheDocument();

    const sourceDownRow = rows.find((r) => r.textContent?.includes("來源故障 Persona")) as HTMLElement;
    expect(
      within(sourceDownRow).getByText("資料暫時無法取得（無法計算成交率）"),
    ).toBeInTheDocument();
    expect(within(sourceDownRow).queryByText(/0%/)).not.toBeInTheDocument();

    // Notable events section must also preserve unavailable semantics and NOT select or divide unverified 0/452 counters
    const eventsSection = screen.getByTestId("trading-pulse-notable-events");
    expect(within(eventsSection).queryByText(/來源故障 Persona/)).not.toBeInTheDocument();
    expect(within(eventsSection).queryByText(/452/)).not.toBeInTheDocument();
    expect(within(eventsSection).queryByText(/0%/)).not.toBeInTheDocument();
    expect(within(eventsSection).getByText("目前無風控拒單或異常交易事件。")).toBeInTheDocument();

    const staleRow = rows.find((r) => r.textContent?.includes("資料過期 Persona")) as HTMLElement;
    expect(within(staleRow).getAllByText(/上次資料已過期/).length).toBeGreaterThanOrEqual(1);
    expect(within(staleRow).getByText("上次資料已過期，損益未知")).toBeInTheDocument();
  });

  it("preserves unknown/unavailable fill-rate semantics in notable event display and does not infer 10-day sample thresholds for empty ranking blocks or generic insufficient_samples reasons", async () => {
    await i18n.changeLanguage("zh-TW");
    mockTradingPulseLive(
      {
        data: {
          id: "management-trading-pulse",
          summary: {
            operator_scope: {
              status: "verified",
              tenant_id: "tenant-dev",
              persona_count: 1,
              runtime_count: 1,
              by_stage: {
                paper: { persona_count: 1, runtime_count: 1 },
              },
            },
            pnl_groups: [],
            runtime_count: 1,
          },
          runtime_rows: [
            {
              runtime_id: "rt-reject-source-down",
              runtime_binding_id: "rb-reject-source-down",
              persona_name: "拒單且統計故障 Persona",
              underlying_symbol: "2317",
              deployment_stage: "paper",
              status: "degraded",
              metrics: {
                pnl: null,
                fill_rate: null,
              },
              performance_context: {
                ledger_fill_count: null,
                pnl_currency: "TWD",
                fill_rate_details: {
                  status: "unknown",
                  reason: "source_unavailable",
                  numerator: 0,
                  denominator: 452,
                  unit: "SHARES",
                },
                metric_reasons: {
                  fill_rate: "source_unavailable",
                },
                source_status: "unavailable",
              },
              latest_outcome: {
                status: "available",
                submitted_to_broker: false,
                reason_code: "insufficient_cash",
                occurred_at: "2026-11-22T10:00:00Z",
              },
            },
          ],
        },
        meta: {
          snapshot_at: "2026-11-22T12:00:00Z",
          surfaces: {},
        },
      },
      {
        data: {
          items: [
            {
              block_id: "pnl-leaders",
              metric: "pnl",
              items: [],
              missing_metric_count: 0,
            },
            {
              block_id: "drawdown-control",
              metric: "drawdown",
              items: [],
              missing_metric_count: 1,
              metric_reasons: {
                "rt-reject-source-down": "insufficient_samples",
              },
            },
            {
              block_id: "sharpe-leaders",
              metric: "sharpe_ratio",
              items: [],
              missing_metric_count: 1,
            },
          ],
        },
      },
    );

    const zhView = renderPage(<TradingPulsePage />);
    const eventsSection = screen.getByTestId("trading-pulse-notable-events");
    expect(within(eventsSection).getByText("拒單且統計故障 Persona")).toBeInTheDocument();
    expect(within(eventsSection).getByText("資金不足")).toBeInTheDocument();
    expect(
      within(eventsSection).getByText("資料暫時無法取得（無法計算成交率）"),
    ).toBeInTheDocument();
    expect(within(eventsSection).queryByText(/452/)).not.toBeInTheDocument();
    expect(within(eventsSection).queryByText(/0%/)).not.toBeInTheDocument();

    const omittedSection = screen.getByTestId("trading-pulse-rankings-omitted");
    expect(
      within(omittedSection).getByText(
        "損益表現排行（0 位未達可比較條件）：尚無可比較觀測值（未記錄原因）",
      ),
    ).toBeInTheDocument();
    expect(
      within(omittedSection).getByText(
        "回撤控制排行（1 位未達可比較條件）：拒單且統計故障 Persona（樣本資料不足）",
      ),
    ).toBeInTheDocument();
    expect(
      within(omittedSection).getByText(
        "夏普比率排行（1 位未達可比較條件）：尚無可比較觀測值（未記錄原因）",
      ),
    ).toBeInTheDocument();
    expect(within(omittedSection).queryByText(/10 個交易日/)).not.toBeInTheDocument();
    zhView.unmount();

    await i18n.changeLanguage("en-US");
    renderPage(<TradingPulsePage />);
    const enEvents = screen.getByTestId("trading-pulse-notable-events");
    expect(
      within(enEvents).getByText("Data temporarily unavailable (fill rate cannot be calculated)"),
    ).toBeInTheDocument();
    expect(within(enEvents).queryByText(/452/)).not.toBeInTheDocument();
    expect(within(enEvents).queryByText(/0%/)).not.toBeInTheDocument();

    const enOmitted = screen.getByTestId("trading-pulse-rankings-omitted");
    expect(
      within(enOmitted).getByText(
        "P&L Performance (0 not yet eligible): No comparable observation (no reason recorded)",
      ),
    ).toBeInTheDocument();
    expect(
      within(enOmitted).getByText(
        "Drawdown Control (1 not yet eligible): 拒單且統計故障 Persona（Insufficient sample data）",
      ),
    ).toBeInTheDocument();
    expect(within(enOmitted).queryByText(/10 daily returns/i)).not.toBeInTheDocument();
  });

  it("handles normal empty roster, all-probe roster exclusion, legacy unverified scope, full source failure, and rankings failure independently", async () => {
    await i18n.changeLanguage("zh-TW");

    // 1. Normal verified empty roster
    mockTradingPulseLive(
      {
        data: {
          id: "management-trading-pulse",
          summary: {
            operator_scope: {
              status: "verified",
              tenant_id: "tenant-dev",
              persona_count: 0,
              runtime_count: 0,
              by_stage: {},
            },
            pnl_groups: [],
            runtime_count: 0,
          },
          runtime_rows: [],
        },
        meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
      },
      { data: { items: [] } },
    );
    const emptyView = renderPage(<TradingPulsePage />);
    expect(screen.getByText("參與營運 Persona：0 人")).toBeInTheDocument();
    expect(
      screen.getAllByText("目前無參與營運的交易 Persona（部署驗證探針已排除）。").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("目前無可排行的營運 Persona。")).toBeInTheDocument();
    emptyView.unmount();

    // 2. All-probes roster (BFF excludes probe personas and reports excluded_probe_count / reason in operator_scope)
    mockTradingPulseLive(
      {
        data: {
          id: "management-trading-pulse",
          summary: {
            operator_scope: {
              status: "verified",
              tenant_id: "tenant-dev",
              persona_count: 0,
              runtime_count: 0,
              excluded_probe_count: 1,
              reason: "all_personas_excluded_as_probes",
              by_stage: {},
            },
            pnl_groups: [],
            runtime_count: 0,
          },
          runtime_rows: [],
        },
        meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
      },
      {
        data: {
          summary: {
            operator_scope: {
              status: "verified",
              tenant_id: "tenant-dev",
              persona_count: 0,
              runtime_count: 0,
              excluded_probe_count: 1,
              reason: "all_personas_excluded_as_probes",
              by_stage: {},
            },
          },
          items: [],
        },
      },
    );
    const probeView = renderPage(<TradingPulsePage />);
    expect(screen.queryByText(/Pantheon Dev Paper Release Probe/)).not.toBeInTheDocument();
    expect(
      screen.getAllByText("目前僅有部署驗證探針並已排除於營運範圍外，無參與營運的交易 Persona。").length,
    ).toBeGreaterThanOrEqual(1);
    probeView.unmount();

    // 3. Legacy API without operator_scope -> explicitly warns that operational scope is unverified
    mockTradingPulseLive(
      {
        data: {
          id: "management-trading-pulse",
          summary: {
            runtime_count: 1,
            by_status: { active: 1 },
            by_stage: { paper: 1 },
          },
          runtime_rows: [
            {
              runtime_id: "rt-legacy-01",
              deployment_stage: "paper",
              status: "active",
              metrics: { pnl: 25.5 },
            },
          ],
        },
        meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
      },
      { data: { items: [] } },
    );
    const legacyView = renderPage(<TradingPulsePage />);
    expect(screen.getByText("營運範圍未核實")).toBeInTheDocument();
    expect(screen.getByTestId("trading-pulse-scope-unverified")).toHaveTextContent(
      "舊版 API 回應未包含已核實的營運名冊範圍，無法確認是否已排除部署驗證或測試個體。",
    );
    // Raw runtime ID is replaced by unnamed Persona label in default view
    expect(screen.getByText("未具名 Persona")).toBeInTheDocument();
    expect(screen.queryByText("rt-legacy-01")).not.toBeInTheDocument();
    legacyView.unmount();

    // 4. Roster unavailable (summary.operator_scope.status === "unavailable") + Rankings endpoint failure
    mockTradingPulseLive(
      {
        data: {
          id: "management-trading-pulse",
          summary: {
            operator_scope: {
              status: "unavailable",
              tenant_id: "tenant-dev",
              persona_count: null,
              runtime_count: null,
              reason: "persona_directory_unavailable",
              by_stage: {},
            },
            pnl_groups: [],
            runtime_count: null,
          },
          runtime_rows: [],
        },
        meta: {
          snapshot_at: "2026-11-22T12:00:00Z",
          surfaces: {
            runtime_roster: { status: "unavailable", source: "canonical" },
          },
        },
      },
      null,
      { rankingsError: new Error("503 rankings unavailable") },
    );
    const unavailableScopeView = renderPage(<TradingPulsePage />);
    expect(screen.getByText("參與營運 Persona 人數無法確認")).toBeInTheDocument();
    expect(screen.getByTestId("trading-pulse-scope-unavailable")).toHaveTextContent(
      "目前無法讀取 Persona 營運名冊服務，無法確認參與營運人數；這不代表目前為 0 人。",
    );
    expect(screen.getByTestId("trading-pulse-rankings-unavailable")).toHaveTextContent(
      "目前無法讀取排行端點；上方營運總覽與 Persona 明細仍可正常檢視。",
    );
    unavailableScopeView.unmount();

    // 5. Top-level live-only loading and unavailable fallback states
    await i18n.changeLanguage("en-US");
    mockTradingPulseLive(null, null, { overviewLoading: true });
    const loadingView = renderPage(<TradingPulsePage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.getByText("Waiting for live BFF data.")).toBeInTheDocument();
    loadingView.unmount();

    mockTradingPulseLive(null, null, { overviewLoading: false });
    renderPage(<TradingPulsePage />);
    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("This page does not render seed, demo, or non-production fallback data."),
    ).toBeInTheDocument();
  });

  it("supports clicking Persona detail and Trade Journey links from rows or rankings and returning to Trading Pulse, and shows short-sample caption when Sharpe rankings have rows", async () => {
    await i18n.changeLanguage("zh-TW");
    const rankingsWithSharpeRows = {
      ...TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE,
      data: {
        ...TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE.data,
        items: TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE.data.items.map((block) =>
          block.block_id === "sharpe-leaders"
            ? {
                ...block,
                eligible_item_count: 1,
                missing_metric_count: 2,
                items: [
                  {
                    rank: 1,
                    ranking_block_id: "sharpe-leaders",
                    ranking_metric: "sharpe_ratio",
                    ranking_metric_value: 1.84,
                    ranking_unit: "ratio",
                    ranking_eligible: true,
                    runtime_id: "rt-ad81501b",
                    runtime_binding_id: "rb-3823397e125e4579ba5f4174067087ed",
                    persona_id: "persona-2448c7053e33ea48da47",
                    persona_name: "青禾｜2330 台股 Paper 學習 R3",
                    underlying_symbol: "2330",
                    deployment_stage: "paper",
                    status: "active",
                    sharpe_ratio: 1.84,
                    links: {
                      persona: "/management/personas/persona-2448c7053e33ea48da47",
                    },
                  },
                ],
              }
            : block,
        ),
      },
    };

    mockTradingPulseLive(TRADING_PULSE_HOSTED_WIRE_SAMPLE, rankingsWithSharpeRows);

    function PersonaStub() {
      const { id } = useParams();
      return (
        <div>
          <h1>Persona Stub {id}</h1>
          <Link to="/management/trading-pulse">返回交易脈動</Link>
        </div>
      );
    }

    function JourneyStub() {
      const { journeyId } = useParams();
      const location = useLocation();
      const params = new URLSearchParams(location.search);
      const returnTo = params.get("return_to") ?? "/management/trading-pulse";
      return (
        <div>
          <h1>Journey Stub {journeyId}</h1>
          <p>
            tenant={params.get("tenant_id")} env={params.get("environment")}
          </p>
          <Link to={returnTo}>返回 {params.get("return_label")}</Link>
        </div>
      );
    }

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/trading-pulse"]}>
          <Routes>
            <Route path="/management/trading-pulse" element={<TradingPulsePage />} />
            <Route path="/management/personas/:id" element={<PersonaStub />} />
            <Route path="/management/trade-journeys/:journeyId" element={<JourneyStub />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    // Sharpe block with rows renders in rankings grid with short-sample caption
    const sharpeBlock = screen.getByTestId("trading-pulse-ranking-block-sharpe-leaders");
    expect(within(sharpeBlock).getByText("1.84")).toBeInTheDocument();
    expect(within(sharpeBlock).getByText("20 日滾動、樣本短，僅供參考")).toBeInTheDocument();

    // Click Persona link from Persona details table and return
    const personaSection = screen.getByTestId("trading-pulse-persona-details");
    const qingheLink = within(personaSection).getByRole("link", {
      name: "青禾｜2330 台股 Paper 學習 R3",
    });
    expect(qingheLink).toHaveAttribute("href", "/management/personas/persona-2448c7053e33ea48da47");
    fireEvent.click(qingheLink);
    expect(screen.getByText("Persona Stub persona-2448c7053e33ea48da47")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "返回交易脈動" }));
    expect(screen.getByRole("heading", { name: "交易脈動" })).toBeInTheDocument();

    // Click 澄川 rejected Trade Journey link and verify tenant_id, environment, and return_to roundtrip
    const eventsSection = screen.getByTestId("trading-pulse-notable-events");
    const journeyLinks = within(eventsSection).getAllByRole("link", { name: "查看交易旅程" });
    const rejectedJourneyLink = journeyLinks.find((l) =>
      l.getAttribute("href")?.includes("tj_79726064-4cc2-5510-8e11-7f5e59ff89bd"),
    ) as HTMLElement;
    expect(rejectedJourneyLink).toBeTruthy();
    fireEvent.click(rejectedJourneyLink);

    expect(
      screen.getByText("Journey Stub tj_79726064-4cc2-5510-8e11-7f5e59ff89bd"),
    ).toBeInTheDocument();
    expect(screen.getByText("tenant=tenant-dev env=paper")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "返回 交易脈動" }));
    expect(screen.getByRole("heading", { name: "交易脈動" })).toBeInTheDocument();
  });

  it("renders a real PersonaDetail header return link from both the Persona Details table and Rankings without a sidebar (390px and desktop) in zh-TW and en-US while omitting it on direct open", async () => {
    const qinghePersona: Persona = {
      id: "persona-2448c7053e33ea48da47",
      name: "青禾｜2330 台股 Paper 學習 R3",
      owner: "operator",
      updatedAt: "2026-11-22T12:00:00Z",
      state: "approved",
      lifecycleStatus: "paper_running",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.56,
    };
    vi.mocked(getPersona).mockResolvedValue(qinghePersona);
    vi.mocked(getPersonaManagement).mockResolvedValue(undefined);
    vi.mocked(bffV1.strategies.listForPersona).mockResolvedValue([]);
    vi.mocked(bffV1.audit.list).mockResolvedValue([]);

    mockTradingPulseLive();

    await i18n.changeLanguage("zh-TW");
    const app = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/trading-pulse"]}>
          <Routes>
            <Route path="/management/trading-pulse" element={<TradingPulsePage />} />
            <Route path="/management/personas/:id" element={<PersonaDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    // 1. From Persona Details table -> real PersonaDetail -> header return link -> Trading Pulse (zh-TW)
    const personaSection = screen.getByTestId("trading-pulse-persona-details");
    const tablePersonaLink = within(personaSection).getByRole("link", {
      name: "青禾｜2330 台股 Paper 學習 R3",
    });
    expect(tablePersonaLink).toHaveAttribute("href", "/management/personas/persona-2448c7053e33ea48da47");
    fireEvent.click(tablePersonaLink);

    expect(
      await screen.findByRole("heading", { level: 1, name: "青禾｜2330 台股 Paper 學習 R3" }),
    ).toBeInTheDocument();
    expect(getPersona).toHaveBeenCalledWith("persona-2448c7053e33ea48da47");
    const zhReturnFromTable = screen.getByRole("link", { name: "返回交易脈動" });
    expect(zhReturnFromTable).toHaveAttribute("href", "/management/trading-pulse");
    fireEvent.click(zhReturnFromTable);
    expect(await screen.findByRole("heading", { level: 1, name: "交易脈動" })).toBeInTheDocument();

    // 2. From Rankings section -> real PersonaDetail -> header return link -> Trading Pulse (en-US)
    await i18n.changeLanguage("en-US");
    const rankingsSection = screen.getByTestId("trading-pulse-rankings");
    const rankingPersonaLinks = within(rankingsSection).getAllByRole("link", {
      name: "青禾｜2330 台股 Paper 學習 R3",
    });
    expect(rankingPersonaLinks.length).toBeGreaterThanOrEqual(1);
    expect(rankingPersonaLinks[0]).toHaveAttribute("href", "/management/personas/persona-2448c7053e33ea48da47");
    fireEvent.click(rankingPersonaLinks[0]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "青禾｜2330 台股 Paper 學習 R3" }),
    ).toBeInTheDocument();
    const enReturnFromRankings = screen.getByRole("link", { name: "Back to Trading Pulse" });
    expect(enReturnFromRankings).toHaveAttribute("href", "/management/trading-pulse");
    fireEvent.click(enReturnFromRankings);
    expect(await screen.findByRole("heading", { level: 1, name: "Trading Pulse" })).toBeInTheDocument();
    app.unmount();

    // 3. Direct entry to PersonaDetail without Trading Pulse origin does not show the return link
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/personas/persona-2448c7053e33ea48da47"]}>
          <Routes>
            <Route path="/management/personas/:id" element={<PersonaDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "青禾｜2330 台股 Paper 學習 R3" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /返回交易脈動|Back to Trading Pulse/i })).not.toBeInTheDocument();
  });

  it("satisfies semantic DOM structure for narrow 390px viewports, keyboard navigation, and field-label extraction without source IDs in aria-label", async () => {
    await i18n.changeLanguage("zh-TW");
    mockTradingPulseLive();
    const { container } = renderPage(<TradingPulsePage />);

    const root = container.querySelector("section") as HTMLElement;
    expect(root).toBeTruthy();

    // 1. Every P&L group is an accessible [role=group] with stage, currency, period, value, and coverage
    const groups = Array.from(root.querySelectorAll("[role=group]")).map((el) => el.textContent ?? "");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatch(/模擬交易/);
    expect(groups[0]).toContain("TWD");
    expect(groups[0]).toContain("2026-11-16T00:00:00Z");
    expect(groups[0]).toContain("-177.82");
    expect(groups[0]).toMatch(/涵蓋 2 \/ 3 位 Persona/);

    // 2. Table headers and cells map cleanly to fills, fill rate, and P&L without leaking digits into null P&L
    const table = root.querySelector("table") as HTMLTableElement;
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent ?? "");
    expect(headers).toEqual([
      "Persona ／ 標的",
      "帳本成交筆數",
      "區間成交率",
      "區間損益",
      "近期事件與資料時間",
    ]);

    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    expect(bodyRows).toHaveLength(3);

    for (const tr of bodyRows) {
      const cells = Array.from(tr.querySelectorAll("td"));
      expect(cells).toHaveLength(5);
      // First cell constrained for 390px narrow viewports and contains all row navigation links
      expect(cells[0]).toHaveClass("w-[180px]", "max-w-[180px]");
      const rowLinks = Array.from(tr.querySelectorAll("a"));
      const firstCellLinks = Array.from(cells[0].querySelectorAll("a"));
      expect(rowLinks.length).toBeGreaterThanOrEqual(2);
      expect(firstCellLinks.length).toBe(rowLinks.length);
      for (const link of rowLinks) {
        expect(link.getAttribute("aria-label") ?? "").not.toMatch(/persona-|rt-|rb-/i);
      }
    }

    // 澄川 (row 3) null P&L cell has zero digits while Fill Rate cell renders once in human language without duplicate raw unit code
    const chengchuanCells = Array.from(bodyRows[2].querySelectorAll("td")).map((td) => td.textContent ?? "");
    expect(chengchuanCells[1]).toContain("0 筆成交");
    expect(chengchuanCells[2]).toContain("0%（區間意向 452 股、成交 0 股）");
    expect(chengchuanCells[2]).toContain("計算期間：");
    expect(chengchuanCells[2]).not.toMatch(/SHARES|absolute_order_quantity/);
    expect(chengchuanCells[3]).toBe("尚無成交損益（帳本幣別 TWD）");
    expect(chengchuanCells[3]).not.toMatch(/\d/);
  });

  it("prioritizes unavailable, stale, and unknown fill-rate truth over zero-denominator no-orders inference in zh-TW and en-US", async () => {
    const zeroDenominatorPayload = {
      data: {
        id: "management-trading-pulse",
        summary: {
          operator_scope: {
            status: "verified",
            tenant_id: "tenant-dev",
            persona_count: 4,
            runtime_count: 4,
            by_stage: {
              paper: { persona_count: 4, runtime_count: 4 },
            },
          },
          pnl_groups: [],
          runtime_count: 4,
        },
        runtime_rows: [
          {
            // 1. Zero-denominator unavailable (source_status=unavailable, denominator=0)
            runtime_id: "rt-zero-unavailable",
            runtime_binding_id: "rb-zero-unavailable",
            persona_name: "零分母來源故障 Persona",
            underlying_symbol: "2330",
            deployment_stage: "paper",
            status: "degraded",
            metrics: { pnl: null, fill_rate: null },
            performance_context: {
              ledger_fill_count: null,
              pnl_currency: "TWD",
              fill_rate_details: {
                status: "unknown",
                reason: "source_unavailable",
                numerator: 0,
                denominator: 0,
                unit: "SHARES",
              },
              metric_reasons: {
                fill_rate: "source_unavailable",
              },
              source_status: "unavailable",
            },
            latest_outcome: {
              status: "available",
              submitted_to_broker: false,
              reason_code: "insufficient_cash",
              occurred_at: "2026-11-22T10:00:00Z",
            },
          },
          {
            // 2. Zero-denominator stale (source_status=stale, denominator=0)
            runtime_id: "rt-zero-stale",
            runtime_binding_id: "rb-zero-stale",
            persona_name: "零分母資料過期 Persona",
            underlying_symbol: "2317",
            deployment_stage: "paper",
            status: "active",
            metrics: { pnl: null, fill_rate: null },
            performance_context: {
              ledger_fill_count: null,
              pnl_currency: "TWD",
              fill_rate_details: {
                status: "stale",
                reason: null,
                numerator: 0,
                denominator: 0,
                unit: "SHARES",
              },
              source_status: "stale",
            },
            latest_outcome: {
              status: "available",
              submitted_to_broker: false,
              reason_code: "risk_limit_exceeded",
              occurred_at: "2026-11-22T10:05:00Z",
            },
          },
          {
            // 3. Zero-denominator unknown (status=unknown, reason=null, denominator=0)
            runtime_id: "rt-zero-unknown",
            runtime_binding_id: "rb-zero-unknown",
            persona_name: "零分母狀態未知 Persona",
            underlying_symbol: "2454",
            deployment_stage: "paper",
            status: "active",
            metrics: { pnl: null, fill_rate: null },
            performance_context: {
              ledger_fill_count: null,
              pnl_currency: "TWD",
              fill_rate_details: {
                status: "unknown",
                reason: null,
                numerator: 0,
                denominator: 0,
                unit: "SHARES",
              },
              source_status: "available",
            },
            latest_outcome: {
              status: "available",
              submitted_to_broker: false,
              reason_code: "insufficient_cash",
              occurred_at: "2026-11-22T10:10:00Z",
            },
          },
          {
            // 4. Zero-denominator verified no-orders (status=known, reason=null, denominator=0, source_status=available)
            runtime_id: "rt-zero-verified-no-orders",
            runtime_binding_id: "rb-zero-verified-no-orders",
            persona_name: "零分母已核實無委託 Persona",
            underlying_symbol: "2881",
            deployment_stage: "paper",
            status: "active",
            metrics: { pnl: 0, fill_rate: null },
            performance_context: {
              ledger_fill_count: 0,
              pnl_currency: "TWD",
              fill_rate_details: {
                status: "known",
                reason: null,
                numerator: 0,
                denominator: 0,
                unit: "SHARES",
              },
              source_status: "available",
            },
          },
        ],
      },
      meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
    };

    await i18n.changeLanguage("zh-TW");
    mockTradingPulseLive(zeroDenominatorPayload, { data: { items: [] } });
    const zhView = renderPage(<TradingPulsePage />);

    const zhRows = screen.getAllByRole("row").slice(1);
    const zhUnavailableRow = zhRows.find((r) => r.textContent?.includes("零分母來源故障 Persona")) as HTMLElement;
    const zhStaleRow = zhRows.find((r) => r.textContent?.includes("零分母資料過期 Persona")) as HTMLElement;
    const zhUnknownRow = zhRows.find((r) => r.textContent?.includes("零分母狀態未知 Persona")) as HTMLElement;
    const zhNoOrdersRow = zhRows.find((r) => r.textContent?.includes("零分母已核實無委託 Persona")) as HTMLElement;

    expect(within(zhUnavailableRow).getByText("資料暫時無法取得（無法計算成交率）")).toBeInTheDocument();
    expect(within(zhUnavailableRow).queryByText("尚未有委託（尚無可計算的成交率）")).not.toBeInTheDocument();

    expect(within(zhStaleRow).getByText("上次資料已過期（無法確認當期成交率）")).toBeInTheDocument();
    expect(within(zhStaleRow).queryByText("尚未有委託（尚無可計算的成交率）")).not.toBeInTheDocument();

    expect(within(zhUnknownRow).getByText("尚無可計算的成交率")).toBeInTheDocument();
    expect(within(zhUnknownRow).queryByText("尚未有委託（尚無可計算的成交率）")).not.toBeInTheDocument();

    expect(within(zhNoOrdersRow).getByText("尚未有委託（尚無可計算的成交率）")).toBeInTheDocument();

    const zhEvents = screen.getByTestId("trading-pulse-notable-events");
    expect(within(zhEvents).getByText("資料暫時無法取得（無法計算成交率）")).toBeInTheDocument();
    expect(within(zhEvents).getByText("上次資料已過期（無法確認當期成交率）")).toBeInTheDocument();
    expect(within(zhEvents).getByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toBeInTheDocument();
    expect(within(zhEvents).queryByText("尚未有委託（尚無可計算的成交率）")).not.toBeInTheDocument();
    zhView.unmount();

    await i18n.changeLanguage("en-US");
    mockTradingPulseLive(zeroDenominatorPayload, { data: { items: [] } });
    renderPage(<TradingPulsePage />);

    const enRows = screen.getAllByRole("row").slice(1);
    const enUnavailableRow = enRows.find((r) => r.textContent?.includes("零分母來源故障 Persona")) as HTMLElement;
    const enStaleRow = enRows.find((r) => r.textContent?.includes("零分母資料過期 Persona")) as HTMLElement;
    const enUnknownRow = enRows.find((r) => r.textContent?.includes("零分母狀態未知 Persona")) as HTMLElement;
    const enNoOrdersRow = enRows.find((r) => r.textContent?.includes("零分母已核實無委託 Persona")) as HTMLElement;

    expect(
      within(enUnavailableRow).getByText("Data temporarily unavailable (fill rate cannot be calculated)"),
    ).toBeInTheDocument();
    expect(
      within(enUnavailableRow).queryByText("No orders submitted yet (fill rate not available)"),
    ).not.toBeInTheDocument();

    expect(
      within(enStaleRow).getByText("Last data is stale (current fill rate unavailable)"),
    ).toBeInTheDocument();
    expect(
      within(enStaleRow).queryByText("No orders submitted yet (fill rate not available)"),
    ).not.toBeInTheDocument();

    expect(within(enUnknownRow).getByText("Fill rate not available yet")).toBeInTheDocument();
    expect(
      within(enUnknownRow).queryByText("No orders submitted yet (fill rate not available)"),
    ).not.toBeInTheDocument();

    expect(
      within(enNoOrdersRow).getByText("No orders submitted yet (fill rate not available)"),
    ).toBeInTheDocument();

    const enEvents = screen.getByTestId("trading-pulse-notable-events");
    expect(
      within(enEvents).getByText("Data temporarily unavailable (fill rate cannot be calculated)"),
    ).toBeInTheDocument();
    expect(
      within(enEvents).getByText("Last data is stale (current fill rate unavailable)"),
    ).toBeInTheDocument();
    expect(within(enEvents).getByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toBeInTheDocument();
    expect(
      within(enEvents).queryByText("No orders submitted yet (fill rate not available)"),
    ).not.toBeInTheDocument();
  });

  it("renders scopePaperBaselineSummary only for source-verified all-paper scope with confirmed not_required baseline and suppresses it for mixed, live, unknown-stage, or missing-baseline cases", async () => {
    const cases: Array<{ name: string; payload: unknown }> = [
      {
        name: "mixed paper and canary stages even with baseline_required_count=0",
        payload: {
          data: {
            id: "management-trading-pulse",
            summary: {
              operator_scope: {
                status: "verified",
                tenant_id: "tenant-dev",
                persona_count: 2,
                runtime_count: 2,
                by_stage: {
                  paper: { persona_count: 1, runtime_count: 1 },
                  canary: { persona_count: 1, runtime_count: 1 },
                },
              },
              baseline_required_count: 0,
              by_baseline_status: { not_required: 2 },
              by_stage: { paper: 1, canary: 1 },
              runtime_count: 2,
            },
            runtime_rows: [
              {
                runtime_id: "rt-paper-1",
                persona_name: "Paper Persona",
                deployment_stage: "paper",
                status: "active",
                baseline_comparison: { status: "not_required" },
              },
              {
                runtime_id: "rt-canary-1",
                persona_name: "Canary Persona",
                deployment_stage: "canary",
                status: "active",
                baseline_comparison: { status: "not_required" },
              },
            ],
          },
          meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
        },
      },
      {
        name: "live stage with baseline_required_count=0",
        payload: {
          data: {
            id: "management-trading-pulse",
            summary: {
              operator_scope: {
                status: "verified",
                tenant_id: "tenant-dev",
                persona_count: 1,
                runtime_count: 1,
                by_stage: {
                  live: { persona_count: 1, runtime_count: 1 },
                },
              },
              baseline_required_count: 0,
              by_baseline_status: { not_required: 1 },
              by_stage: { live: 1 },
              runtime_count: 1,
            },
            runtime_rows: [
              {
                runtime_id: "rt-live-1",
                persona_name: "Live Persona",
                deployment_stage: "live",
                status: "active",
                baseline_comparison: { status: "not_required" },
              },
            ],
          },
          meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
        },
      },
      {
        name: "unknown deployment stage on row or stage breakdown mismatch",
        payload: {
          data: {
            id: "management-trading-pulse",
            summary: {
              operator_scope: {
                status: "verified",
                tenant_id: "tenant-dev",
                persona_count: 2,
                runtime_count: 2,
                by_stage: {
                  paper: { persona_count: 1, runtime_count: 1 },
                  unknown: { persona_count: 1, runtime_count: 1 },
                },
              },
              baseline_required_count: 0,
              by_baseline_status: { not_required: 2 },
              runtime_count: 2,
            },
            runtime_rows: [
              {
                runtime_id: "rt-paper-2",
                persona_name: "Paper Persona 2",
                deployment_stage: "paper",
                status: "active",
                baseline_comparison: { status: "not_required" },
              },
              {
                runtime_id: "rt-unknown-stage",
                persona_name: "Unknown Stage Persona",
                deployment_stage: "unknown",
                status: "active",
                baseline_comparison: { status: "not_required" },
              },
            ],
          },
          meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
        },
      },
      {
        name: "all-paper rows with missing baseline data (no baseline_required_count and no row baseline_comparison)",
        payload: {
          data: {
            id: "management-trading-pulse",
            summary: {
              operator_scope: {
                status: "verified",
                tenant_id: "tenant-dev",
                persona_count: 1,
                runtime_count: 1,
                by_stage: {
                  paper: { persona_count: 1, runtime_count: 1 },
                },
              },
              by_stage: { paper: 1 },
              runtime_count: 1,
            },
            runtime_rows: [
              {
                runtime_id: "rt-paper-no-baseline",
                persona_name: "Paper No Baseline Data",
                deployment_stage: "paper",
                status: "active",
              },
            ],
          },
          meta: { snapshot_at: "2026-11-22T12:00:00Z", surfaces: {} },
        },
      },
    ];

    for (const testCase of cases) {
      await i18n.changeLanguage("zh-TW");
      mockTradingPulseLive(testCase.payload, { data: { items: [] } });
      const zhView = renderPage(<TradingPulsePage />);
      expect(
        screen.queryByText("目前皆為模擬交易，無須進行實盤基準比較。"),
        `zh-TW should not show all-paper baseline summary for: ${testCase.name}`,
      ).not.toBeInTheDocument();
      zhView.unmount();

      await i18n.changeLanguage("en-US");
      mockTradingPulseLive(testCase.payload, { data: { items: [] } });
      const enView = renderPage(<TradingPulsePage />);
      expect(
        screen.queryByText("All current Personas are in paper trading; live baseline comparison is not required."),
        `en-US should not show all-paper baseline summary for: ${testCase.name}`,
      ).not.toBeInTheDocument();
      enView.unmount();
    }
  });

  it("handles real hosted 1/1 absolute_order_quantity wire shape with period full fills, unconfirmed latest executions and one pre-broker rejection without raw machine units in zh-TW and en-US", async () => {
    const hostedRealShapeOverview = {
      ...TRADING_PULSE_HOSTED_WIRE_SAMPLE,
      data: {
        ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data,
        summary: {
          ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.summary,
          pnl_groups: [],
          row_health_degraded_count: 3,
          row_health_status_counts: { degraded: 3 },
          monitoring_coverage_count: 0,
          missing_monitoring_runtime_ids: ["rt-ad81501b", "rt-0050paper", "rt-3252fa75"],
        },
        runtime_rows: [
          {
            ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[0],
            underlying_symbol: "2330.TWSE",
            performance_context: {
              ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[0].performance_context,
              pnl_currency: null,
              pnl_definition: null,
              fill_rate_details: {
                ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[0].performance_context.fill_rate_details,
                unit: "absolute_order_quantity",
                numerator: 1,
                denominator: 1,
              },
            },
            latest_outcome: {
              status: "available",
              occurred_at: "2026-11-19T15:50:03Z",
              reason_code: null,
              submitted_to_broker: null,
              requested_quantity: 1,
              required: null,
              available: null,
              currency: null,
              journey_id: "tj_29473e86-63ff-5384-bda1-23eef61cebb2",
              source_event_id: "b7744687-f4e3-507d-8ae5-526b7c18003a",
              focus_stage: "reconciliation",
            },
            row_health: {
              status: "degraded",
              degraded_checks: ["paper_runtime_monitoring"],
            },
          },
          {
            ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[1],
            underlying_symbol: "0050.TWSE",
            performance_context: {
              ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[1].performance_context,
              pnl_currency: null,
              pnl_definition: null,
              fill_rate_details: {
                ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[1].performance_context.fill_rate_details,
                unit: "absolute_order_quantity",
                numerator: 1,
                denominator: 1,
              },
            },
            latest_outcome: {
              status: "available",
              occurred_at: "2026-11-19T15:50:03Z",
              reason_code: "reason_not_recorded",
              submitted_to_broker: true,
              requested_quantity: 1,
              required: null,
              available: null,
              currency: null,
              journey_id: "tj_0050-normal-fill",
              source_event_id: "evt-0050-normal-fill",
              focus_stage: "reconciliation",
            },
            links: {
              persona: "/management/personas/persona-hengyue-0050",
              strategy: "/management/strategies/strategy-persona-0050",
              journey: "/management/trade-journeys/tj_0050-normal-fill?tenant_id=tenant-dev&environment=paper",
            },
            row_health: {
              status: "degraded",
              degraded_checks: ["paper_runtime_monitoring"],
            },
          },
          {
            ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[2],
            underlying_symbol: "2317.TWSE",
            performance_context: {
              ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[2].performance_context,
              pnl_currency: null,
              fill_rate_details: {
                ...TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[2].performance_context.fill_rate_details,
                unit: "absolute_order_quantity",
                numerator: 0,
                denominator: 452,
              },
            },
            row_health: {
              status: "degraded",
              degraded_checks: ["paper_runtime_monitoring"],
            },
          },
        ],
      },
      meta: {
        snapshot_at: "2026-11-22T22:24:35Z",
        surfaces: {
          management_trading_pulse: {
            status: "degraded",
            source: "bff_composed",
            message: "Trading pulse aggregate is available, but runtime, telemetry, monitoring, row health, or baseline coverage is degraded.",
          },
          runtime_roster: { status: "ok", source: "service_store" },
          telemetry_summary: { status: "ok", source: "service_store" },
          paper_runtime_monitoring: {
            status: "degraded",
            source: "service_store",
            message: "Paper runtime monitoring session missing for one or more paper runtimes.",
          },
          paper_live_drift: { status: "ok", source: "service_store" },
          baseline_comparison: { status: "ok", source: "bff_composed" },
          runtime_row_health: {
            status: "degraded",
            source: "bff_composed",
            message: "Trading pulse row health is degraded for 3 runtime(s).",
          },
        },
      },
    };

    await i18n.changeLanguage("zh-TW");
    mockTradingPulseLive(hostedRealShapeOverview, TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE);
    const zhView = renderPage(<TradingPulsePage />);

    // 1. Summary reminder specifically identifies paper runtime monitoring when trading sources are verified available
    const zhReminder = screen.getByTestId("trading-pulse-source-issue-reminder");
    expect(zhReminder).toHaveTextContent(
      "僅模擬執行監控工作階段未完整建立；下方顯示目前已讀取的交易明細（詳見底部資料診斷）。",
    );

    // 2. The pre-broker rejection stays first; missing per-event fills stay traceable.
    const zhEvents = screen.getByTestId("trading-pulse-notable-events");
    const zhEventItems = within(zhEvents).getAllByRole("listitem");
    expect(zhEventItems).toHaveLength(3);
    expect(within(zhEvents).getByText("澄川｜2317 台股 Paper")).toBeInTheDocument();
    expect(within(zhEvents).getByText("標的 2317.TWSE")).toBeInTheDocument();
    expect(within(zhEvents).getByText("送券商前風控拒單（未送出委託）")).toBeInTheDocument();
    expect(within(zhEvents).getByText("資金不足")).toBeInTheDocument();
    expect(
      within(zhEvents).getByText("該次意向 452 股、成交 0 股（成交率 0%）"),
    ).toBeInTheDocument();
    expect(within(zhEvents).getAllByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toHaveLength(2);
    expect(within(zhEvents).queryByText("該次意向 1 股、成交 1 股（成交率 100%）")).not.toBeInTheDocument();

    // 3. Persona details table keeps all 3 Personas, their fill rates once in human language, and their journey links
    const zhPersonaSection = screen.getByTestId("trading-pulse-persona-details");
    const zhRows = within(zhPersonaSection).getAllByRole("row").slice(1);
    expect(zhRows).toHaveLength(3);

    const zhQingheRow = zhRows.find((r) => r.textContent?.includes("青禾｜2330 台股 Paper 學習 R3")) as HTMLElement;
    const zhHengyueRow = zhRows.find((r) => r.textContent?.includes("衡岳｜0050 台股 ETF Paper")) as HTMLElement;
    const zhChengchuanRow = zhRows.find((r) => r.textContent?.includes("澄川｜2317 台股 Paper")) as HTMLElement;

    expect(within(zhQingheRow).getByText("100%（區間意向 1 股、成交 1 股）")).toBeInTheDocument();
    expect(within(zhQingheRow).getByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toBeInTheDocument();
    expect(
      within(zhQingheRow).getByRole("link", { name: "查看交易旅程" }).getAttribute("href"),
    ).toContain("tj_29473e86-63ff-5384-bda1-23eef61cebb2");

    expect(within(zhHengyueRow).getByText("100%（區間意向 1 股、成交 1 股）")).toBeInTheDocument();
    expect(within(zhHengyueRow).getByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toBeInTheDocument();
    expect(
      within(zhHengyueRow).getByRole("link", { name: "查看交易旅程" }).getAttribute("href"),
    ).toContain("tj_0050-normal-fill");

    expect(within(zhChengchuanRow).getByText("0%（區間意向 452 股、成交 0 股）")).toBeInTheDocument();
    expect(within(zhChengchuanRow).getByText("資金不足")).toBeInTheDocument();

    // 4. Never leaks raw absolute_order_quantity
    const zhFullText = zhView.container.textContent ?? "";
    expect(zhFullText).not.toContain("absolute_order_quantity");
    zhView.unmount();

    // 5. Verify en-US rendering of the same hosted shape
    await i18n.changeLanguage("en-US");
    mockTradingPulseLive(hostedRealShapeOverview, TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE);
    const enView = renderPage(<TradingPulsePage />);

    expect(screen.getByTestId("trading-pulse-source-issue-reminder")).toHaveTextContent(
      "Only paper runtime monitoring sessions are incomplete; currently available trading details are shown below (see Data Diagnostics).",
    );

    const enEvents = screen.getByTestId("trading-pulse-notable-events");
    expect(within(enEvents).getAllByRole("listitem")).toHaveLength(3);
    expect(within(enEvents).getByText("澄川｜2317 台股 Paper")).toBeInTheDocument();
    expect(
      within(enEvents).getByText("Requested 452 shares, filled 0 shares (0% fill rate)"),
    ).toBeInTheDocument();
    expect(within(enEvents).getAllByText(i18n.t("mgmt.pulse.eventFillUnknown"))).toHaveLength(2);
    expect(within(enEvents).queryByText("Requested 1 shares, filled 1 shares (100% fill rate)")).not.toBeInTheDocument();

    const enPersonaSection = screen.getByTestId("trading-pulse-persona-details");
    expect(
      within(enPersonaSection).getAllByText("100% (Period intent 1 shares, filled 1 shares)"),
    ).toHaveLength(2);
    expect(
      within(enPersonaSection).getByText("0% (Period intent 452 shares, filled 0 shares)"),
    ).toBeInTheDocument();
    expect(
      within(enPersonaSection).getAllByText(i18n.t("mgmt.pulse.eventFillUnknown")),
    ).toHaveLength(2);

    const enFullText = enView.container.textContent ?? "";
    expect(enFullText).not.toContain("absolute_order_quantity");
    enView.unmount();
  });

  it("preserves neutral units when symbol does not establish TWSE/TPEX shares, keeps overfills and unverified available outcomes visible, and requires verified trading sources plus normalized row health for monitoring-only notice", async () => {
    const copyOverview = () => JSON.parse(JSON.stringify(TRADING_PULSE_HOSTED_WIRE_SAMPLE));

    // 1. Verified TWSE/TPEX symbols use shares/股 for absolute_order_quantity, while truly unknown symbol/unit uses neutral 單位/units
    await i18n.changeLanguage("zh-TW");
    const rawUnits = copyOverview();
    rawUnits.data.runtime_rows[0].underlying_symbol = "6488.TPEX";
    rawUnits.data.runtime_rows[0].performance_context.fill_rate_details.unit = "absolute_order_quantity";
    rawUnits.data.runtime_rows[2].underlying_symbol = "BTC-USD";
    rawUnits.data.runtime_rows[2].performance_context.fill_rate_details.unit = "absolute_order_quantity";
    mockTradingPulseLive(rawUnits);
    const unitsZh = renderPage(<TradingPulsePage />);
    expect(
      within(screen.getByTestId("trading-pulse-persona-details")).getAllByText("100%（區間意向 1 股、成交 1 股）"),
    ).toHaveLength(2);
    expect(
      within(screen.getByTestId("trading-pulse-persona-details")).getByText("0%（區間意向 452 單位、成交 0 單位）"),
    ).toBeInTheDocument();
    unitsZh.unmount();

    // 2. Overfill (rate=2, numerator=2/denominator=1, filled_quantity=2) remains visible in notable events
    const rawOverfill = copyOverview();
    rawOverfill.data.runtime_rows[0].telemetry_summary.metrics.fill_rate = 2;
    rawOverfill.data.runtime_rows[0].performance_context.fill_rate_details.numerator = 2;
    rawOverfill.data.runtime_rows[0].latest_outcome.filled_quantity = 2;
    mockTradingPulseLive(rawOverfill);
    const overfillView = renderPage(<TradingPulsePage />);
    expect(
      within(screen.getByTestId("trading-pulse-notable-events")).getByText(rawOverfill.data.runtime_rows[0].persona_name),
    ).toBeInTheDocument();
    overfillView.unmount();

    // 3. Available outcome with unknown fill evidence remains visible in notable events
    const rawUnknownFill = copyOverview();
    rawUnknownFill.data.runtime_rows[0].performance_context.fill_rate_details.status = "unknown";
    mockTradingPulseLive(rawUnknownFill);
    const unknownFillView = renderPage(<TradingPulsePage />);
    expect(
      within(screen.getByTestId("trading-pulse-notable-events")).getByText(rawUnknownFill.data.runtime_rows[0].persona_name),
    ).toBeInTheDocument();
    unknownFillView.unmount();

    // 4. Does not claim monitoring-only notice when trading source evidence is absent or row source_status is unknown
    const rawNoSourceEvidence = copyOverview();
    rawNoSourceEvidence.meta.surfaces = {
      paper_runtime_monitoring: { status: "degraded", source: "service_store" },
    };
    for (const row of rawNoSourceEvidence.data.runtime_rows) {
      row.performance_context.source_status = "unknown";
      row.row_health = { status: "degraded", degraded_checks: ["paper_runtime_monitoring"] };
    }
    mockTradingPulseLive(rawNoSourceEvidence);
    const noSourceView = renderPage(<TradingPulsePage />);
    expect(screen.getByTestId("trading-pulse-source-issue-reminder")).toHaveTextContent(
      i18n.t("mgmt.pulse.sourceIssueSummaryAlert"),
    );
    noSourceView.unmount();

    // 5. Honors normalized top-level rowHealthDegradedChecks containing non-monitoring degradation
    const rawNormRowHealth = copyOverview();
    rawNormRowHealth.meta.surfaces.paper_runtime_monitoring = { status: "degraded", source: "service_store" };
    delete rawNormRowHealth.data.runtime_rows[0].row_health;
    rawNormRowHealth.data.runtime_rows[0].rowHealthDegradedChecks = ["telemetry_summary"];
    mockTradingPulseLive(rawNormRowHealth);
    const normRowHealthView = renderPage(<TradingPulsePage />);
    expect(screen.getByTestId("trading-pulse-source-issue-reminder")).toHaveTextContent(
      i18n.t("mgmt.pulse.sourceIssueSummaryAlert"),
    );
    normRowHealthView.unmount();
  });
  it("renders three latest no_trade / hold_signal decisions independently of older 1/1 and 0/452 period telemetry in both languages", async () => {
    for (const language of ["zh-TW", "en-US"]) {
      await i18n.changeLanguage(language);
      mockTradingPulseLive(latestHoldOverview());
      const view = renderPage(<TradingPulsePage />);
      const events = screen.getByTestId("trading-pulse-notable-events");
      expect(within(events).queryAllByRole("listitem")).toHaveLength(0);
      expect(events).toHaveTextContent(i18n.t("mgmt.pulse.eventsEmpty"));
      const rows = within(screen.getByTestId("trading-pulse-persona-details")).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(3);
      rows.forEach((row, index) => {
        const cells = within(row).getAllByRole("cell");
        const source = TRADING_PULSE_HOSTED_WIRE_SAMPLE.data.runtime_rows[index];
        expect(cells[0]).toHaveTextContent(source.persona_name);
        expect(cells[2]).toHaveTextContent(i18n.t("mgmt.pulse.fillRateKnownWithBasisFmt", {
          rate: index === 2 ? "0%" : "100%", requested: index === 2 ? "452" : "1", filled: index === 2 ? "0" : "1",
          unit: i18n.t("mgmt.pulse.unitShares"),
        }));
        expect(cells[4]).toHaveTextContent(i18n.t("tradeJourneys.reasons.hold_signal"));
        expect(cells[4]).not.toHaveTextContent(i18n.t("mgmt.pulse.eventPreBrokerRejected"));
        expect(cells[4]).not.toHaveTextContent(language === "zh-TW" ? "該次意向" : "Requested");
        expect(cells[4]).not.toHaveTextContent("452");
        expect(within(cells[4]).getByText(i18n.t("mgmt.pulse.eventOccurredAtFmt", {
          time: new Date(index === 0 ? "2026-11-22T23:34:51Z" : "2026-11-22T23:34:52Z").toLocaleString(),
        }))).toBeInTheDocument();
        const latest = within(row).getByRole("link", { name: i18n.t("mgmt.pulse.openLatestJourney") });
        const url = new URL(latest.getAttribute("href")!, "https://fixture.test");
        expect(url.pathname).toBe(`/management/trade-journeys/tj_fixture-latest-hold-${index}`);
        expect(url.searchParams.get("tenant_id")).toBe("tenant-dev");
        expect(url.searchParams.get("environment")).toBe("paper");
        expect(url.searchParams.get("return_to")).toBe("/management/trading-pulse");
      });
      const rateCell = within(rows[0]).getAllByRole("cell")[2];
      expect(rateCell).toHaveTextContent(i18n.t("mgmt.pulse.pnlPeriodRangeFmt", {
        start: new Date("2026-11-16T00:00:00Z").toLocaleString(),
        end: new Date("2026-11-22T12:00:00Z").toLocaleString(),
      }));
      expect(rateCell).not.toHaveTextContent("23:34:51");
      expect(view.container.textContent).not.toContain("absolute_order_quantity");
      view.unmount();
    }
  });

  it("uses only event evidence for partial/over/full fills and keeps contradictory holds, missing quantities and uncertain outcomes traceable in both languages", async () => {
    const cases = [
      { patch: { submitted_to_broker: false }, notable: false },
      { patch: { submitted_to_broker: true }, notable: true },
      { patch: { order_id: "order-contradiction" }, notable: true },
      { patch: { broker_order_id: "broker-contradiction" }, notable: true },
      { patch: { side: "buy" }, notable: true },
      { patch: { filled_quantity: 1 }, notable: true },
      { patch: { required: 101, available: 100 }, notable: true },
      { patch: { kind: "rejected" }, notable: true },
      { patch: { status: "unavailable" }, notable: true },
      { patch: { reason_code: null }, notable: true },
      { patch: { reason_code: null, status: "not_observed", submitted_to_broker: true }, notable: true },
      { patch: { reason_code: null, status: "unavailable", requested_quantity: 10, filled_quantity: 3 }, notable: true },
      { patch: { reason_code: "reason_not_recorded", requested_quantity: 10, filled_quantity: 4, submitted_to_broker: true }, notable: true, rate: "40%", filled: "4" },
      { patch: { reason_code: null, requested_quantity: 10, filled_quantity: 12, submitted_to_broker: true }, notable: true, rate: "120%", filled: "12" },
      { patch: { reason_code: "insufficient_cash", requested_quantity: 452, submitted_to_broker: false }, notable: true, rate: "0%", filled: "0" },
      { patch: { kind: "normal", reason_code: null, requested_quantity: 10, filled_quantity: 10, submitted_to_broker: true }, notable: false },
      { patch: { kind: "no_trade", reason_code: null, requested_quantity: 10, filled_quantity: 10, submitted_to_broker: true }, notable: true },
      { patch: { kind: "variance", reason_code: null, requested_quantity: 10, filled_quantity: 10, submitted_to_broker: true }, notable: true },
      // Same requested quantity as period denominator still does not prove this event filled.
      { patch: { reason_code: "reason_not_recorded", requested_quantity: 1, filled_quantity: null }, notable: true },
    ];
    for (const language of ["zh-TW", "en-US"]) {
      await i18n.changeLanguage(language);
      for (const { patch, notable, rate, filled } of cases) {
        const payload = latestHoldOverview();
        payload.data.runtime_rows = [{ ...payload.data.runtime_rows[0], latest_outcome: { ...payload.data.runtime_rows[0].latest_outcome, ...patch } }];
        mockTradingPulseLive(payload);
        const view = renderPage(<TradingPulsePage />);
        const events = screen.getByTestId("trading-pulse-notable-events");
        expect(within(events).queryAllByRole("listitem"), JSON.stringify(patch)).toHaveLength(notable ? 1 : 0);
        if (rate) {
          expect(events).toHaveTextContent(i18n.t("mgmt.pulse.eventOrderFillQtyFmt", {
            requested: String(patch.requested_quantity), filled, rate, unit: i18n.t("mgmt.pulse.unitShares"),
          }));
          expect(events).not.toHaveTextContent(language === "zh-TW" ? "區間意向" : "Period intent");
        } else if (notable && patch.filled_quantity == null) {
          expect(events).not.toHaveTextContent(language === "zh-TW" ? "成交率 100%" : "100% fill rate");
        }
        view.unmount();
      }
    }
  });

  it("requires positive pre-broker rejection evidence before inferring zero event fills in both languages", async () => {
    const cases = [
      { patch: { reason_code: null }, rejected: false },
      { patch: { reason_code: "reason_not_recorded" }, rejected: false },
      { patch: { reason_code: "  " }, rejected: false },
      { patch: { reason_code: null, focus_stage: "risk_evaluation" }, rejected: false },
      { patch: { reason_code: null, required: 100, available: 100 }, rejected: false },
      { patch: { reason_code: null, kind: "rejected" }, rejected: true },
      { patch: { reason_code: null, focus_stage: "pre_broker_rejected" }, rejected: true },
      { patch: { reason_code: "reason_not_recorded", required: 101, available: 100 }, rejected: true },
      { patch: { reason_code: "insufficient_cash" }, rejected: true },
      { patch: { reason_code: "risk_limit_exceeded" }, rejected: true },
      { patch: { status: "unavailable", reason_code: "insufficient_cash" }, rejected: false },
    ];
    for (const language of ["zh-TW", "en-US"]) {
      await i18n.changeLanguage(language);
      for (const { patch, rejected } of cases) {
        const payload = latestHoldOverview();
        const row = payload.data.runtime_rows[0];
        payload.data.runtime_rows = [{ ...row, latest_outcome: {
          ...row.latest_outcome, requested_quantity: 452, submitted_to_broker: false, ...patch,
        } }];
        mockTradingPulseLive(payload);
        const view = renderPage(<TradingPulsePage />);
        const events = screen.getByTestId("trading-pulse-notable-events");
        expect(within(events).getAllByRole("listitem")).toHaveLength(1);
        const detail = within(screen.getByTestId("trading-pulse-persona-details")).getAllByRole("row")[1];
        const outcomeCell = within(detail).getAllByRole("cell")[4];
        const rejectionLabel = i18n.t("mgmt.pulse.eventPreBrokerRejected");
        const unknownLabel = i18n.t("mgmt.pulse.eventFillUnknown");
        const zeroFill = i18n.t("mgmt.pulse.eventOrderFillQtyFmt", {
          requested: "452", filled: "0", rate: "0%", unit: i18n.t("mgmt.pulse.unitShares"),
        });
        if (rejected) {
          expect(events, JSON.stringify(patch)).toHaveTextContent(rejectionLabel);
          expect(events).toHaveTextContent(zeroFill);
          expect(outcomeCell).toHaveTextContent(rejectionLabel);
          expect(outcomeCell).not.toHaveTextContent(unknownLabel);
        } else {
          for (const surface of [events, outcomeCell]) {
            expect(surface, JSON.stringify(patch)).not.toHaveTextContent(rejectionLabel);
            expect(surface).toHaveTextContent(unknownLabel);
            expect(surface).not.toHaveTextContent(zeroFill);
          }
        }
        expect(within(events).getByRole("link").getAttribute("href")).toContain("tj_fixture-latest-hold-0");
        view.unmount();
      }
    }
  });

  it("renders complete fill-rate windows and falls back to complete metric periods without borrowing decision dates in both languages", async () => {
    const start = "2026-11-16T00:00:00Z";
    const end = "2026-11-22T12:00:00Z";
    const fallbackStart = "2026-11-15T00:00:00Z";
    const fallbackEnd = "2026-11-21T12:00:00Z";
    for (const language of ["zh-TW", "en-US"]) {
      await i18n.changeLanguage(language);
      for (const endKey of ["endAt", "end_at", "endExclusiveAt", "end_exclusive_at", "asOf", "as_of"]) {
        for (const useFallback of [false, true]) {
          const payload = latestHoldOverview();
          const row = payload.data.runtime_rows[0];
          const window = { start_at: start, as_of: null, ...(!useFallback ? { [endKey]: end } : {}) };
          const performance_context = {
            ...row.performance_context,
            fill_rate_details: { ...row.performance_context.fill_rate_details, window },
            metric_periods: { ...row.performance_context.metric_periods, fill_rate: {
              startAt: fallbackStart, asOf: null, [endKey]: fallbackEnd,
            } },
          };
          mockTradingPulseLive({ ...payload, data: { ...payload.data, runtime_rows: [{ ...row, performance_context }] } });
          const view = renderPage(<TradingPulsePage />);
          const detail = within(screen.getByTestId("trading-pulse-persona-details")).getAllByRole("row")[1];
          const rateCell = within(detail).getAllByRole("cell")[2];
          expect(rateCell, `${endKey}, fallback=${useFallback}`).toHaveTextContent(i18n.t("mgmt.pulse.pnlPeriodRangeFmt", {
            start: new Date(useFallback ? fallbackStart : start).toLocaleString(),
            end: new Date(useFallback ? fallbackEnd : end).toLocaleString(),
          }));
          expect(rateCell).not.toHaveTextContent(i18n.t("mgmt.pulse.pnlPeriodUnverified"));
          expect(rateCell).not.toHaveTextContent("23:34:51");
          view.unmount();
        }
      }
    }
    // Neither partial source establishes a range; do not mix their bounds.
    for (const language of ["zh-TW", "en-US"]) {
      await i18n.changeLanguage(language);
      const payload = latestHoldOverview();
      const row = payload.data.runtime_rows[0];
      mockTradingPulseLive({ ...payload, data: { ...payload.data, runtime_rows: [{ ...row, performance_context: {
        ...row.performance_context,
        fill_rate_details: { ...row.performance_context.fill_rate_details, window: { startAt: start, asOf: null } },
        metric_periods: { fill_rate: { startAt: null, endExclusiveAt: end } },
      } }] } });
      const view = renderPage(<TradingPulsePage />);
      const detail = within(screen.getByTestId("trading-pulse-persona-details")).getAllByRole("row")[1];
      expect(within(detail).getAllByRole("cell")[2]).toHaveTextContent(i18n.t("mgmt.pulse.pnlPeriodUnverified"));
      view.unmount();
    }
  });

  it("preserves real Persona-scoped history navigation to the 2317 rejection and the origin return through the existing journey pages at 390px in both languages", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const listMock = vi.spyOn(journeysApi, "listTradeJourneys").mockResolvedValue({
      data: { items: [rejectedRow] }, page_info: { total: 1, page_size: 25, next_page_token: null }, meta: fixtureMeta,
    });
    vi.spyOn(journeysApi, "subscribeTradeJourneys").mockReturnValue({ close() {} });
    vi.spyOn(journeysApi, "getTradeJourney").mockResolvedValue({ data: { ...rejectedRow, stages: rejectedDetailStages }, meta: fixtureMeta });
    vi.spyOn(journeysApi, "getTradeJourneyTimeline").mockResolvedValue({ data: { items: rejectedTimeline }, page_info: { total: rejectedTimeline.length, page_size: 100 }, meta: fixtureMeta });
    vi.spyOn(journeysApi, "getTradeJourneyEvidence").mockResolvedValue({ data: {}, meta: fixtureMeta });
    try {
      for (const language of ["zh-TW", "en-US"]) {
        await i18n.changeLanguage(language);
        mockTradingPulseLive(latestHoldOverview());
        const view = render(
          <I18nextProvider i18n={i18n}>
            <MemoryRouter initialEntries={["/management/trading-pulse"]}>
              <Routes>
                <Route path="/management/trading-pulse" element={<TradingPulsePage />} />
                <Route path="/management/trade-journeys" element={<TradeJourneysPage />} />
                <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
              </Routes>
            </MemoryRouter>
          </I18nextProvider>,
        );
        const row = within(screen.getByTestId("trading-pulse-persona-details")).getAllByRole("row")[3];
        const history = within(row).getByRole("link", { name: i18n.t("mgmt.pulse.openPersonaJourneys") });
        const url = new URL(history.getAttribute("href")!, "https://fixture.test");
        expect(url.searchParams.get("persona_id")).toBe(rejectedRow.persona_id);
        fireEvent.click(history);
        const historicalLink = await waitFor(() => {
          const link = document.querySelector(`a[href^="/management/trade-journeys/${rejectedRow.journey_id}?"]`);
          expect(link).toBeInTheDocument();
          return link!;
        });
        expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ tenant_id: "tenant-dev", environment: "paper", persona_id: rejectedRow.persona_id }), expect.any(AbortSignal));
        fireEvent.click(historicalLink);
        await screen.findByLabelText(i18n.t("tradeJourneys.stages.risk_evaluation") + ": " + i18n.t("tradeJourneys.stageStatuses.riskRejected"));
        expect(document.body).toHaveTextContent("452");
        expect(document.body).toHaveTextContent(i18n.t("tradeJourneys.reasons.insufficient_cash"));
        expect(journeysApi.getTradeJourney).toHaveBeenLastCalledWith(rejectedRow.journey_id, expect.objectContaining({ tenant_id: "tenant-dev", environment: "paper" }), expect.any(AbortSignal));
        fireEvent.click(screen.getByRole("link", { name: i18n.t("tradeJourneys.backTo", { label: i18n.t("mgmt.pulse.title") }) }));
        expect(screen.getByTestId("trading-pulse-notable-events")).toHaveTextContent(i18n.t("mgmt.pulse.eventsEmpty"));
        view.unmount();
      }
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      vi.restoreAllMocks();
    }
  });

});
