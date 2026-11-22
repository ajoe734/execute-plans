import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { Link, MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  adaptTradingPulseOverview,
  adaptTradingPulseRankings,
} from "@/lib/bff-v1/management";
import {
  TRADING_PULSE_HOSTED_WIRE_SAMPLE,
  TRADING_PULSE_RANKINGS_HOSTED_WIRE_SAMPLE,
} from "@/lib/bff-v1/__tests__/fixtures/trading-pulse";
import { TradingPulsePage } from "./_core";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

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

    // 4. Notable trading event: 澄川 2317 pre-broker risk rejection (452 requested, 0 filled, insufficient cash)
    expect(within(eventsSection).getByText("澄川｜2317 台股 Paper")).toBeInTheDocument();
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
    expect(within(qingheRow).getByText("100%（該次意向 1 股、成交 1 股）")).toBeInTheDocument();
    expect(within(qingheRow).getByText(/TWD -168\.09（虧損）/)).toBeInTheDocument();
    expect(within(qingheRow).getByText("平均滑價 0 bps")).toBeInTheDocument();
    expect(within(qingheRow).getByText("最大回撤 1.2%")).toBeInTheDocument();

    const chengchuanRow = bodyRows.find((r) => r.textContent?.includes("澄川｜2317 台股 Paper")) as HTMLElement;
    expect(within(chengchuanRow).getByText("標的 2317")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("模擬交易")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("0 筆成交")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("尚未成交")).toBeInTheDocument();
    expect(within(chengchuanRow).getByText("0%（該次意向 452 股、成交 0 股）")).toBeInTheDocument();
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

    // 7. No raw technical IDs, LIVE BFF, Row health, Checks, or mixed-locale English headers in zh-TW default view
    const defaultPageTextZh = zhView.container.textContent ?? "";
    expect(defaultPageTextZh).not.toMatch(/rt-ad81501b|rt-0050paper|rt-3252fa75|rb-3823397e125e4579ba5f4174067087ed/);
    expect(defaultPageTextZh).not.toMatch(/LIVE BFF|Row health|Checks|Runtime Status|Execution Quality|Fill Rate/);
    zhView.unmount();

    // 8. Verify en-US locale consistency
    await i18n.changeLanguage("en-US");
    const enView = renderPage(<TradingPulsePage />);
    expect(screen.getByText("Operational Personas: 3")).toBeInTheDocument();
    expect(screen.getByText("Paper: 3")).toBeInTheDocument();
    expect(screen.getByText("Coverage: 2 / 3 Personas")).toBeInTheDocument();
    expect(screen.getByText("0% (Requested 452 shares, filled 0 shares)")).toBeInTheDocument();
    expect(screen.getByText("No fill P&L yet (ledger currency TWD)")).toBeInTheDocument();
    expect(screen.getByText("P&L Performance")).toBeInTheDocument();
    expect(screen.getByText("Drawdown Control")).toBeInTheDocument();
    expect(screen.getByText("Execution Quality")).toBeInTheDocument();
    expect(
      screen.getByText("All ranked values are currently net losses (negative), ordered by smaller loss rather than profit."),
    ).toBeInTheDocument();
    const defaultPageTextEn = enView.container.textContent ?? "";
    expect(defaultPageTextEn).not.toMatch(/成交率|資料診斷|模擬交易|尚未成交/);
    expect(defaultPageTextEn).not.toMatch(/LIVE BFF|Row health|Checks/);
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
      "成交筆數",
      "成交率",
      "損益",
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

    // 澄川 (row 3) null P&L cell has zero digits while Fill Rate cell has 0%, 452, 0, 股, and SHARES
    const chengchuanCells = Array.from(bodyRows[2].querySelectorAll("td")).map((td) => td.textContent ?? "");
    expect(chengchuanCells[1]).toContain("0 筆成交");
    expect(chengchuanCells[2]).toContain("0%（該次意向 452 股、成交 0 股）");
    expect(chengchuanCells[2]).toContain("0/452 SHARES");
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
    expect(within(zhEvents).getByText("尚無可計算的成交率")).toBeInTheDocument();
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
    expect(within(enEvents).getByText("Fill rate not available yet")).toBeInTheDocument();
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
});
