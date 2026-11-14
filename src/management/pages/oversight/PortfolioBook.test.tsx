import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { adaptPortfolioHoldingsMonitor } from "@/lib/bff-v1/management";
import { PortfolioBookPage } from "./PortfolioBook";
import type { PortfolioHoldingMonitorRow, PortfolioIncident } from "@/lib/v5/management/portfolio";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderPage(initialEntry = "/management/portfolio-book") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const scopeKinds = ["paper_ledger", "canary_sleeve", "live_capital_pool", "unclassified"] as const;

const items: PortfolioHoldingMonitorRow[] = Array.from({ length: 14 }, (_, index) => ({
  holdingId: `holding-${index}`,
  runtimeId: `runtime-${index}`,
  symbol: `SYM${index}`,
  deploymentStage: ["paper", "canary", "live", "unknown"][index % 4],
  sourceStatus: "degraded",
  telemetryStale: false,
  riskState: index < 10 ? "missing_binding" : "degraded_source",
  sourceIssues: [{ code: index < 10 ? "MISSING_PERSONA_BINDING" : "MISSING_TELEMETRY", message: "Authoritative source is missing" }],
  capitalScope: {
    stage: "unknown",
    scopeKind: scopeKinds[index % 4],
    scopeId: index % 4 === 3 ? undefined : `scope-${index}`,
  },
  links: {},
}));

const incidents: PortfolioIncident[] = items.map((row) => ({
  id: `incident-${row.holdingId}`,
  holdingId: row.holdingId,
  severity: "high",
  message: "Authoritative source is missing",
  riskState: row.riskState,
  sourceStatus: row.sourceStatus,
  sourceIssues: row.sourceIssues,
  links: { human_review: `/management/human-inbox?target_id=${row.holdingId}` },
}));

const coverage = {
  holdingCount: 14, sourceRowCount: 4, runtimeCount: 14, telemetryRuntimeCount: 4,
  staleRowCount: 0, missingBindingCount: 10, degradedSourceCount: 14, incidentCount: 14,
};

describe("PortfolioBookPage monitor", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("renders all incidents and distinct capital scope labels without an optimistic confidence claim", () => {
    mocks.useV5Live.mockReturnValue({
      loading: false,
      refresh: vi.fn(),
      data: { items, incidents, surfaceStatus: "degraded", coverage },
    });
    renderPage("/management/portfolio-book?deployment_stage=paper");

    expect(screen.getAllByTestId("portfolio-incident")).toHaveLength(14);
    expect(screen.getAllByTestId("portfolio-holding")).toHaveLength(14);
    expect(screen.getAllByText(/Paper ledger/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Canary sleeve/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Live capital pool/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unknown capital scope").length).toBeGreaterThan(0);
    expect(screen.queryByText(/formal attribution|covered/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Stage")).toHaveValue("paper");
  });

  it.each([
    ["empty", "ok", "No holdings match the current filters."],
    ["partial", "partial", "No holdings match the current filters."],
    ["stale", "stale", "No holdings match the current filters."],
    ["unavailable", "unavailable", "Portfolio holdings source is unavailable."],
  ])("renders the %s monitor state independently", (_name, surfaceStatus, emptyMessage) => {
    mocks.useV5Live.mockReturnValue({
      loading: false,
      refresh: vi.fn(),
      data: {
        items: [], incidents: [], surfaceStatus,
        surfaceMessage: `${surfaceStatus} source`,
        coverage: { ...coverage, holdingCount: 0, incidentCount: 0 },
      },
    });
    renderPage();

    expect(screen.getByText(`Source: ${surfaceStatus}`)).toBeInTheDocument();
    expect(screen.getByText(`${surfaceStatus} source`)).toBeInTheDocument();
    expect(screen.getByText(emptyMessage)).toBeInTheDocument();
    expect(screen.queryByTestId("portfolio-holding")).not.toBeInTheDocument();
  });

  it("formats explicit holding currencies in their native unit, labels null currency as 幣別未提供 without claiming USD, and keeps unavailable money as —", () => {
    const monitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 3,
          incident_count: 0,
          source_coverage: {
            source_row_count: 3,
            runtime_count: 3,
            telemetry_runtime_count: 3,
            stale_row_count: 0,
            missing_binding_count: 0,
            degraded_source_count: 0,
          },
        },
        items: [
          {
            id: "rt-eb295fe2:2330.TW",
            holding_id: "rt-eb295fe2:2330.TW",
            capital_pool_id: "hosted-all12-h12-01a11-20261023-9aeb-pool",
            broker_id: "",
            runtime_id: "rt-eb295fe2",
            persona_id: "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
            symbol: "2330.TW",
            side: "short",
            quantity: -2.0,
            mark_price: 2385.0,
            market_value: -4770.0,
            unrealized_pnl: null,
            currency: null,
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
            links: {},
          },
          {
            id: "rt-twd:2330.TW",
            holding_id: "rt-twd:2330.TW",
            runtime_id: "rt-twd",
            symbol: "2330.TW",
            quantity: -2.0,
            market_value: -4770.0,
            unrealized_pnl: -120.0,
            currency: "TWD",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
            links: {},
          },
          {
            id: "rt-usd:AAPL",
            holding_id: "rt-usd:AAPL",
            runtime_id: "rt-usd",
            symbol: "AAPL",
            quantity: 10.0,
            market_value: 1926.0,
            unrealized_pnl: null,
            currency: "USD",
            deployment_stage: "live",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "live_exposure",
            source_issues: [],
            capital_scope: { stage: "live", scope_kind: "live_capital_pool", scope_id: "pool-us" },
            links: {},
          },
        ],
      },
      meta: {
        incidents: [],
        surfaces: { portfolio_book_holdings: { status: "ok" } },
      },
    });

    mocks.useV5Live.mockReturnValue({
      loading: false,
      refresh: vi.fn(),
      data: monitor,
    });
    renderPage();

    const rows = screen.getAllByTestId("portfolio-holding");
    expect(rows).toHaveLength(3);

    const nullCurrencyCells = within(rows[0]).getAllByRole("cell");
    expect(nullCurrencyCells[1]).toHaveTextContent("-2");
    expect(nullCurrencyCells[1]).toHaveTextContent("Short position");
    expect(nullCurrencyCells[2]).toHaveTextContent("—");
    expect(nullCurrencyCells[3]).toHaveTextContent("2,385");
    expect(nullCurrencyCells[3].textContent).not.toMatch(/\$|USD|TWD|NT\$|幣別未提供/);
    expect(nullCurrencyCells[4]).toHaveTextContent("-4,770 (幣別未提供)");
    expect(nullCurrencyCells[4].textContent).not.toMatch(/\$|USD|TWD|NT\$/);
    expect(nullCurrencyCells[5]).toHaveTextContent("—");

    const twdCells = within(rows[1]).getAllByRole("cell");
    expect(twdCells[1]).toHaveTextContent("-2");
    expect(twdCells[1]).toHaveTextContent("Short position");
    expect(twdCells[4]).toHaveTextContent("-NT$4,770");
    expect(twdCells[5]).toHaveTextContent("-NT$120");

    const usdCells = within(rows[2]).getAllByRole("cell");
    expect(usdCells[1]).toHaveTextContent("10");
    expect(usdCells[4]).toHaveTextContent("$1,926");
    expect(usdCells[5]).toHaveTextContent("—");
  });

  it("renders signed quantity, stale/unavailable market value reasons, consistent source confidence, and accessible null unrealized_pnl text in en-US and zh-TW for the real 2026-11-05 BFF rows", async () => {
    const monitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 4,
          incident_count: 0,
          source_coverage: {
            source_row_count: 4,
            runtime_count: 4,
            telemetry_runtime_count: 4,
            stale_row_count: 1,
            missing_binding_count: 0,
            degraded_source_count: 0,
          },
        },
        items: [
          {
            id: "rt-482f3e28:2317.TWSE",
            symbol: "2317.TWSE",
            side: "short",
            quantity: -1,
            average_price: null,
            mark_price: null,
            market_value: null,
            notional: null,
            unrealized_pnl: null,
            realized_pnl: null,
            total_pnl: 0,
            currency: null,
            source_status: "ok",
            source_issues: [],
            telemetry_available: true,
            telemetry_stale: true,
            mark_status: "stale",
            last_mark_at: "2026-10-29T00:00:00Z",
          },
          {
            id: "rt-c98e4223:2317.TWSE",
            symbol: "2317.TWSE",
            side: "short",
            quantity: -2,
            average_price: null,
            mark_price: 240,
            market_value: -480,
            notional: 480,
            unrealized_pnl: null,
            total_pnl: 0,
            currency: null,
            source_status: "ok",
            source_issues: [],
            telemetry_stale: false,
            mark_status: "available",
            last_mark_at: "2026-11-04T00:00:00Z",
          },
          {
            id: "rt-unavail:2330.TWSE",
            symbol: "2330.TWSE",
            side: "long",
            quantity: null,
            average_price: 900,
            mark_price: null,
            market_value: null,
            notional: null,
            unrealized_pnl: 350,
            currency: "TWD",
            source_status: "unavailable",
            source_issues: [{ code: "MISSING_MARK", message: "Mark unavailable" }],
            telemetry_stale: false,
            mark_status: "unavailable",
            last_mark_at: null,
          },
          {
            id: "rt-telstale:0050.TWSE",
            symbol: "0050.TWSE",
            side: "long",
            quantity: 1,
            average_price: null,
            mark_price: 190,
            market_value: 190,
            notional: 190,
            unrealized_pnl: null,
            currency: "TWD",
            source_status: "ok",
            source_issues: [],
            telemetry_stale: true,
            mark_status: "available",
            last_mark_at: "2026-11-04T00:00:00Z",
          },
        ],
      },
      meta: {
        incidents: [],
        surfaces: { portfolio_book_holdings: { status: "partial" } },
      },
    });

    mocks.useV5Live.mockReturnValue({
      loading: false,
      refresh: vi.fn(),
      data: monitor,
    });

    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
    const view = renderPage();

    expect(screen.getByRole("columnheader", { name: "Quantity" })).toBeInTheDocument();
    const scroller = view.container.querySelector('[data-management-table-scrollbar="native"]');
    expect(scroller).toBeInTheDocument();
    const table = scroller?.querySelector("table");
    expect(table).toHaveClass("min-w-[1520px]");
    const headerCells = within(table as HTMLElement).getAllByRole("columnheader");
    expect(headerCells).toHaveLength(16);
    expect(headerCells.map((th) => th.textContent)).toEqual([
      "Holding",
      "Quantity",
      "Avg entry",
      "Last close",
      "Market value",
      "Unrealized PnL",
      "Instrument kind",
      "Contract month",
      "Multiplier",
      "Margin reserved",
      "Reason code",
      "Stage / capital scope",
      "Runtime / broker",
      "Source confidence",
      "Risk",
      "Actions",
    ]);
    for (const th of headerCells) {
      expect(th).toHaveClass("whitespace-nowrap");
    }
    const rows = screen.getAllByTestId("portfolio-holding");
    expect(rows).toHaveLength(4);

    // Row 0: real stale row rt-482f3e28:2317.TWSE
    const staleCells = within(rows[0]).getAllByRole("cell");
    expect(staleCells[1]).toHaveTextContent("-1");
    expect(staleCells[1]).toHaveTextContent("Short position");
    expect(staleCells[2]).toHaveTextContent("—");
    expect(within(staleCells[2]).getByLabelText("Source reports no average cost")).toBeInTheDocument();
    expect(staleCells[3]).toHaveTextContent("—");
    expect(staleCells[4]).toHaveTextContent("Price stale (last mark 2026-10-29)");
    expect(staleCells[4]).not.toHaveTextContent("—");
    expect(staleCells[5]).toHaveTextContent("—");
    expect(within(staleCells[5]).getByLabelText("Source reports no average cost")).toBeInTheDocument();
    expect(staleCells[6]).toHaveTextContent("—");
    expect(staleCells[7]).toHaveTextContent("—");
    expect(staleCells[8]).toHaveTextContent("—");
    expect(staleCells[9]).toHaveTextContent("—");
    expect(staleCells[10]).toHaveTextContent("—");
    expect(staleCells[13]).toHaveTextContent("stale");
    expect(staleCells[13]).toHaveTextContent("Stale telemetry");
    expect(staleCells[13]).not.toHaveTextContent("No reported source issue");
    expect(staleCells[13].querySelector(".bg-status-success\\/15")).toBeNull();
    expect(within(staleCells[13]).queryByText("ok")).not.toBeInTheDocument();

    // Row 1: real healthy row rt-c98e4223:2317.TWSE
    const healthyCells = within(rows[1]).getAllByRole("cell");
    expect(healthyCells[1]).toHaveTextContent("-2");
    expect(healthyCells[1]).toHaveTextContent("Short position");
    expect(healthyCells[2]).toHaveTextContent("—");
    expect(within(healthyCells[2]).getByLabelText("Source reports no average cost")).toBeInTheDocument();
    expect(healthyCells[3]).toHaveTextContent("240");
    expect(healthyCells[3]).toHaveTextContent("As of 2026-11-04");
    expect(healthyCells[4]).toHaveTextContent("-480 (幣別未提供)");
    expect(healthyCells[5]).toHaveTextContent("—");
    expect(within(healthyCells[5]).getByLabelText("Source reports no average cost")).toBeInTheDocument();
    expect(healthyCells[6]).toHaveTextContent("—");
    expect(healthyCells[7]).toHaveTextContent("—");
    expect(healthyCells[8]).toHaveTextContent("—");
    expect(healthyCells[9]).toHaveTextContent("—");
    expect(healthyCells[10]).toHaveTextContent("—");
    expect(within(healthyCells[13]).getByText("ok")).toHaveClass("text-status-success");
    expect(healthyCells[13]).toHaveTextContent("No reported source issue");

    // Row 2: unavailable mark and missing quantity
    const unavailCells = within(rows[2]).getAllByRole("cell");
    expect(unavailCells[1]).toHaveTextContent("—");
    expect(unavailCells[1]).not.toHaveTextContent("0");
    expect(unavailCells[2]).toHaveTextContent("NT$900");
    expect(unavailCells[3]).toHaveTextContent("—");
    expect(unavailCells[4]).toHaveTextContent("No price available");
    expect(unavailCells[4]).not.toHaveTextContent("—");
    expect(unavailCells[5]).toHaveTextContent("NT$350");

    // Row 3: telemetry_stale true with mark_status available
    const telStaleCells = within(rows[3]).getAllByRole("cell");
    expect(telStaleCells[1]).toHaveTextContent("1");
    expect(telStaleCells[3]).toHaveTextContent("NT$190");
    expect(telStaleCells[3]).toHaveTextContent("As of 2026-11-04");
    expect(telStaleCells[4]).toHaveTextContent("NT$190");
    expect(telStaleCells[13]).toHaveTextContent("stale");
    expect(telStaleCells[13]).toHaveTextContent("Stale telemetry");
    expect(telStaleCells[13]).not.toHaveTextContent("No reported source issue");
    expect(within(telStaleCells[13]).queryByText("ok")).not.toBeInTheDocument();

    // Verify zh-TW localization of all new user-visible text
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/portfolio-book"]}>
          <Routes>
            <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole("columnheader", { name: "數量" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "進場均價" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "最新收盤價" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "商品種類" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "契約月" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "乘數" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "保留保證金" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "決策原因" })).toBeInTheDocument();
    const zhRows = screen.getAllByTestId("portfolio-holding");
    const zhStaleCells = within(zhRows[0]).getAllByRole("cell");
    expect(zhStaleCells[1]).toHaveTextContent("-1");
    expect(zhStaleCells[1]).toHaveTextContent("空頭部位");
    expect(within(zhStaleCells[2]).getByLabelText("來源未提供平均成本")).toBeInTheDocument();
    expect(zhStaleCells[3]).toHaveTextContent("—");
    expect(zhStaleCells[4]).toHaveTextContent("報價過期（最後報價 2026-10-29）");
    expect(within(zhStaleCells[5]).getByLabelText("來源未提供平均成本")).toBeInTheDocument();
    expect(zhStaleCells[6]).toHaveTextContent("—");
    expect(zhStaleCells[7]).toHaveTextContent("—");
    expect(zhStaleCells[8]).toHaveTextContent("—");
    expect(zhStaleCells[9]).toHaveTextContent("—");
    expect(zhStaleCells[10]).toHaveTextContent("—");
    expect(zhStaleCells[13]).toHaveTextContent("Telemetry 過期");
    expect(zhStaleCells[13]).not.toHaveTextContent("無回報來源問題");

    const zhHealthyCells = within(zhRows[1]).getAllByRole("cell");
    expect(zhHealthyCells[3]).toHaveTextContent("240");
    expect(zhHealthyCells[3]).toHaveTextContent("截至 2026-11-04");
    expect(zhHealthyCells[13]).toHaveTextContent("無回報來源問題");

    const zhUnavailCells = within(zhRows[2]).getAllByRole("cell");
    expect(zhUnavailCells[4]).toHaveTextContent("無可用報價");

    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });

  it("renders both 2026-11-06 BFF holding shapes with 2-decimal fractional prices/money, cost-based PnL %, non-zero realized PnL line, and plain-number null-currency prices in en-US and zh-TW", async () => {
    const preTelemetryItems = [
      {
        id: "rt-535a82a3:2330.TWSE",
        holding_id: "rt-535a82a3:2330.TWSE",
        runtime_id: "rt-535a82a3",
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
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
      {
        id: "rt-8b0d8649:0050.TWSE",
        holding_id: "rt-8b0d8649:0050.TWSE",
        runtime_id: "rt-8b0d8649",
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
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
      {
        id: "rt-c98e4223:2317.TWSE",
        holding_id: "rt-c98e4223:2317.TWSE",
        runtime_id: "rt-c98e4223",
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
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
      {
        id: "rt-342d76ff:2330.TW",
        holding_id: "rt-342d76ff:2330.TW",
        runtime_id: "rt-342d76ff",
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
        mark_status: "available",
        last_mark_at: "2026-11-05T00:00:00Z",
        deployment_stage: "paper",
        source_status: "ok",
        telemetry_stale: false,
        risk_state: "paper_exposure",
        source_issues: [],
        capital_scope: { stage: "paper", scope_kind: "paper_ledger", scope_id: null },
        links: {},
      },
    ];

    const preMonitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: { holding_count: 4, incident_count: 0, source_coverage: {} },
        items: preTelemetryItems,
      },
      meta: { incidents: [], surfaces: { portfolio_book_holdings: { status: "ok" } } },
    });

    mocks.useV5Live.mockReturnValue({
      loading: false,
      refresh: vi.fn(),
      data: preMonitor,
    });

    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
    const view = renderPage();

    const preRows = screen.getAllByTestId("portfolio-holding");
    expect(preRows).toHaveLength(4);

    // Shape 1 (null currency, null average_price/unrealized_pnl/realized_pnl):
    // prices render as plain numbers, market value keeps (幣別未提供) and fractional cents (.75)
    const pre0 = within(preRows[0]).getAllByRole("cell");
    expect(pre0[1]).toHaveTextContent("-5");
    expect(pre0[1]).toHaveTextContent("Short position");
    expect(within(pre0[2]).getByLabelText("Source reports no average cost")).toBeInTheDocument();
    expect(pre0[3]).toHaveTextContent("2,240");
    expect(pre0[3]).toHaveTextContent("As of 2026-11-05");
    expect(pre0[3].textContent).not.toMatch(/\$|USD|TWD|NT\$|幣別未提供/);
    expect(pre0[4]).toHaveTextContent("-11,200 (幣別未提供)");
    expect(within(pre0[5]).getByLabelText("Source reports no average cost")).toBeInTheDocument();

    const pre1 = within(preRows[1]).getAllByRole("cell");
    expect(pre1[1]).toHaveTextContent("-5");
    expect(pre1[3]).toHaveTextContent("97.15");
    expect(pre1[3]).toHaveTextContent("As of 2026-11-05");
    expect(pre1[3].textContent).not.toMatch(/\$|USD|TWD|NT\$|幣別未提供/);
    expect(pre1[4]).toHaveTextContent("-485.75 (幣別未提供)");
    expect(pre1[5]).toHaveTextContent("—");

    const pre2 = within(preRows[2]).getAllByRole("cell");
    expect(pre2[1]).toHaveTextContent("-3");
    expect(pre2[3]).toHaveTextContent("235");
    expect(pre2[3]).toHaveTextContent("As of 2026-11-05");
    expect(pre2[4]).toHaveTextContent("-705 (幣別未提供)");

    const pre3 = within(preRows[3]).getAllByRole("cell");
    expect(pre3[1]).toHaveTextContent("-1");
    expect(pre3[3]).toHaveTextContent("2,240");
    expect(pre3[3]).toHaveTextContent("As of 2026-11-05");
    expect(pre3[4]).toHaveTextContent("-2,240 (幣別未提供)");

    // Shape 2 (after TELEMETRY-POSITION-COST-CURRENCY-20261106)
    const postTelemetryItems = [
      {
        ...preTelemetryItems[0],
        currency: "TWD",
        broker_id: "shioaji_paper",
        average_price: 2299,
        unrealized_pnl: 295,
        realized_pnl: 0,
        pnl_pct: 99.99, // ignored; cost-based percent is computed from unrealized_pnl / (|qty| * average_price)
      },
      {
        ...preTelemetryItems[1],
        currency: "TWD",
        broker_id: "shioaji_paper",
        average_price: 101.33,
        unrealized_pnl: 20.9,
        realized_pnl: 0,
      },
      {
        ...preTelemetryItems[2],
        currency: "TWD",
        broker_id: "shioaji_paper",
        average_price: 240.166667,
        unrealized_pnl: 15.5,
        realized_pnl: -5.5,
      },
      {
        ...preTelemetryItems[3],
        currency: "TWD",
        broker_id: "shioaji_paper",
        average_price: 2240,
        unrealized_pnl: 0,
        realized_pnl: 0,
      },
    ];

    const postMonitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: { holding_count: 4, incident_count: 0, source_coverage: {} },
        items: postTelemetryItems,
      },
      meta: { incidents: [], surfaces: { portfolio_book_holdings: { status: "ok" } } },
    });

    mocks.useV5Live.mockReturnValue({
      loading: false,
      refresh: vi.fn(),
      data: postMonitor,
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/portfolio-book"]}>
          <Routes>
            <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    const postRows = screen.getAllByTestId("portfolio-holding");
    expect(postRows).toHaveLength(4);

    // 2330.TWSE: avg 2299 -> NT$2,299; mark 2240 -> NT$2,240; mv -NT$11,200; uPnL 295 -> NT$295 (+2.57%); realized 0 hidden
    const post0 = within(postRows[0]).getAllByRole("cell");
    expect(post0[2]).toHaveTextContent("NT$2,299");
    expect(post0[3]).toHaveTextContent("NT$2,240");
    expect(post0[3]).toHaveTextContent("As of 2026-11-05");
    expect(post0[4]).toHaveTextContent("-NT$11,200");
    expect(post0[5]).toHaveTextContent("NT$295 (+2.57%)");
    expect(post0[5]).not.toHaveTextContent("99.99%");
    expect(post0[5]).not.toHaveTextContent("Realized");
    expect(post0[6]).toHaveTextContent("—");
    expect(post0[7]).toHaveTextContent("—");
    expect(post0[8]).toHaveTextContent("—");
    expect(post0[9]).toHaveTextContent("—");
    expect(post0[10]).toHaveTextContent("—");
    expect(post0[12]).toHaveTextContent("shioaji_paper");

    // 0050.TWSE: avg 101.33 -> NT$101.33; mark 97.15 -> NT$97.15; mv -NT$485.75; uPnL 20.9 -> NT$20.90 (+4.13%)
    const post1 = within(postRows[1]).getAllByRole("cell");
    expect(post1[2]).toHaveTextContent("NT$101.33");
    expect(post1[3]).toHaveTextContent("NT$97.15");
    expect(post1[4]).toHaveTextContent("-NT$485.75");
    expect(post1[5]).toHaveTextContent("NT$20.90 (+4.13%)");
    expect(post1[5]).not.toHaveTextContent("Realized");

    // 2317.TWSE: avg 240.166667 -> NT$240.17; mark 235 -> NT$235; mv -NT$705; uPnL 15.5 -> NT$15.50 (+2.15%); realized -5.5 -> Realized -NT$5.50
    const post2 = within(postRows[2]).getAllByRole("cell");
    expect(post2[2]).toHaveTextContent("NT$240.17");
    expect(post2[3]).toHaveTextContent("NT$235");
    expect(post2[4]).toHaveTextContent("-NT$705");
    expect(post2[5]).toHaveTextContent("NT$15.50 (+2.15%)");
    expect(post2[5]).toHaveTextContent("Realized -NT$5.50");

    // 2330.TW: avg 2240 -> NT$2,240; mark 2240 -> NT$2,240; mv -NT$2,240; uPnL 0 -> NT$0 (0.00%); realized 0 hidden
    const post3 = within(postRows[3]).getAllByRole("cell");
    expect(post3[2]).toHaveTextContent("NT$2,240");
    expect(post3[3]).toHaveTextContent("NT$2,240");
    expect(post3[4]).toHaveTextContent("-NT$2,240");
    expect(post3[5]).toHaveTextContent("NT$0 (0.00%)");
    expect(post3[5]).not.toHaveTextContent("Realized");

    // Switch to zh-TW and verify headers, 截至 YYYY-MM-DD, and 已實現 line
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/portfolio-book"]}>
          <Routes>
            <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    const zhPostRows = screen.getAllByTestId("portfolio-holding");
    const zhPost0 = within(zhPostRows[0]).getAllByRole("cell");
    expect(zhPost0[3]).toHaveTextContent("NT$2,240");
    expect(zhPost0[3]).toHaveTextContent("截至 2026-11-05");
    const zhPost2 = within(zhPostRows[2]).getAllByRole("cell");
    expect(zhPost2[5]).toHaveTextContent("NT$15.50 (+2.15%)");
    expect(zhPost2[5]).toHaveTextContent("已實現 -NT$5.50");

    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });

  it("shows a loading state while the first holdings response is pending and never renders zero coverage cards or a Source: unavailable badge", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: true,
      refreshing: false,
      error: null,
      refresh: vi.fn(),
    });
    renderPage();

    expect(screen.getByTestId("portfolio-book-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading portfolio holdings…")).toBeInTheDocument();
    expect(screen.getByText("Waiting for live BFF holdings and source coverage data.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();

    expect(screen.queryByTestId("portfolio-book-coverage")).not.toBeInTheDocument();
    expect(screen.queryByText(/Source:\s*unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Holdings")).not.toBeInTheDocument();
    expect(screen.queryByText("Source rows")).not.toBeInTheDocument();
    expect(screen.queryByText("Telemetry runtimes")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing bindings")).not.toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.queryByText("Portfolio holdings source is unavailable.")).not.toBeInTheDocument();
  });

  it("shows an error state with retry when the holdings request fails and does not render zero coverage cards", () => {
    const refresh = vi.fn();
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: false,
      refreshing: false,
      error: new Error("Holdings request timed out after 18s"),
      refresh,
    });
    renderPage();

    const errorCard = screen.getByTestId("portfolio-book-error");
    expect(errorCard).toBeInTheDocument();
    expect(within(errorCard).getByText("Live data unavailable")).toBeInTheDocument();
    expect(within(errorCard).getByText(/Holdings request timed out after 18s/)).toBeInTheDocument();

    expect(screen.queryByTestId("portfolio-book-coverage")).not.toBeInTheDocument();
    expect(screen.queryByText(/Source:\s*unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Holdings")).not.toBeInTheDocument();
    expect(screen.queryByText("Source rows")).not.toBeInTheDocument();
    expect(screen.queryByText("Telemetry runtimes")).not.toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();

    fireEvent.click(within(errorCard).getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders BFF summary coverage values and meta.surfaces.portfolio_book_holdings.status when data loads", () => {
    const monitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 14,
          incident_count: 3,
          source_coverage: {
            source_row_count: 11,
            runtime_count: 9,
            telemetry_runtime_count: 7,
            stale_row_count: 2,
            missing_binding_count: 4,
            degraded_source_count: 5,
          },
        },
        items: [],
      },
      meta: {
        incidents: [],
        surfaces: {
          portfolio_book_holdings: {
            status: "partial",
            message: "2 runtimes have delayed telemetry",
          },
        },
      },
    });

    mocks.useV5Live.mockReturnValue({
      data: monitor,
      loading: false,
      refreshing: false,
      error: null,
      refresh: vi.fn(),
    });
    renderPage();

    const coverageCard = screen.getByTestId("portfolio-book-coverage");
    expect(within(coverageCard).getByText("Source: partial")).toBeInTheDocument();
    expect(within(coverageCard).getByText("2 runtimes have delayed telemetry")).toBeInTheDocument();
    expect(within(coverageCard).getByText("Holdings").parentElement).toHaveTextContent("14");
    expect(within(coverageCard).getByText("Source rows").parentElement).toHaveTextContent("11");
    expect(within(coverageCard).getByText("Telemetry runtimes").parentElement).toHaveTextContent("7/9");
    expect(within(coverageCard).getByText("Incidents").parentElement).toHaveTextContent("3");
    expect(within(coverageCard).getByText("Missing bindings").parentElement).toHaveTextContent("4");
    expect(within(coverageCard).getByText("Degraded sources").parentElement).toHaveTextContent("5");
    expect(within(coverageCard).getByText("Stale rows").parentElement).toHaveTextContent("2");
  });

  it("keeps last loaded values visible with a refreshing indicator during manual or background refresh instead of resetting to zeros", () => {
    const refresh = vi.fn();
    const loadedMonitor = { items, incidents, surfaceStatus: "degraded", coverage };
    mocks.useV5Live.mockReturnValue({
      data: loadedMonitor,
      loading: false,
      refreshing: false,
      error: null,
      refresh,
    });

    const view = renderPage();
    expect(screen.getAllByTestId("portfolio-holding")).toHaveLength(14);
    expect(within(screen.getByTestId("portfolio-book-coverage")).getByText("Source: degraded")).toBeInTheDocument();
    expect(screen.queryByTestId("portfolio-book-refreshing")).not.toBeInTheDocument();

    // Background or manual refresh where useV5Live sets refreshing=true with previous data retained
    mocks.useV5Live.mockReturnValue({
      data: loadedMonitor,
      loading: false,
      refreshing: true,
      error: null,
      refresh,
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/portfolio-book"]}>
          <Routes>
            <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    expect(screen.getByTestId("portfolio-book-refreshing")).toHaveTextContent(
      "Refreshing live holdings; showing last loaded values.",
    );
    const coverageCard = screen.getByTestId("portfolio-book-coverage");
    expect(within(coverageCard).getByText("Source: degraded")).toBeInTheDocument();
    expect(within(coverageCard).getByText("Holdings").parentElement).toHaveTextContent("14");
    expect(within(coverageCard).getByText("Telemetry runtimes").parentElement).toHaveTextContent("4/14");
    expect(within(coverageCard).getByText("Missing bindings").parentElement).toHaveTextContent("10");
    expect(screen.getAllByTestId("portfolio-holding")).toHaveLength(14);
    expect(screen.queryByText(/Source:\s*unavailable/i)).not.toBeInTheDocument();

    // Also retains last loaded values if loading=true while data is temporarily undefined during refresh
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: true,
      refreshing: false,
      error: null,
      refresh,
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/portfolio-book"]}>
          <Routes>
            <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    expect(screen.getByTestId("portfolio-book-refreshing")).toBeInTheDocument();
    expect(within(screen.getByTestId("portfolio-book-coverage")).getByText("Holdings").parentElement).toHaveTextContent("14");
    expect(screen.getAllByTestId("portfolio-holding")).toHaveLength(14);
    expect(screen.queryByText(/Source:\s*unavailable/i)).not.toBeInTheDocument();
  });

  it("renders instrument kind, contract month, multiplier, margin reserved, and reason code columns and uses BFF market value and unrealized PnL for futures rows with multiplier 100 without recomputing from quantity times price", async () => {
    const monitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 3,
          incident_count: 0,
          source_coverage: {
            source_row_count: 3,
            runtime_count: 3,
            telemetry_runtime_count: 3,
            stale_row_count: 0,
            missing_binding_count: 0,
            degraded_source_count: 0,
          },
        },
        items: [
          {
            id: "rt-fut:ssf:QFF:202611",
            holding_id: "rt-fut:ssf:QFF:202611",
            runtime_id: "rt-fut",
            persona_id: "persona-fut",
            capital_pool_id: "pool-fut",
            broker_id: "shioaji_paper",
            symbol: "2330.TWSE",
            instrument_id: "ssf:QFF:202611",
            instrument_kind: "stock_future",
            contract_month: "202611",
            multiplier: 100,
            margin_reserved: 92000,
            reason_code: "short_via_future",
            side: "long",
            currency: "TWD",
            quantity: 2,
            average_price: 2300,
            mark_price: 2250,
            market_value: 450000,
            unrealized_pnl: -10000,
            realized_pnl: 0,
            mark_status: "available",
            last_mark_at: "2026-11-07T06:00:00Z",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-fut",
            },
            links: {},
          },
          {
            id: "rt-cash:eq:2330",
            holding_id: "rt-cash:eq:2330",
            runtime_id: "rt-cash",
            persona_id: "persona-cash",
            capital_pool_id: "pool-cash",
            broker_id: "shioaji_paper",
            symbol: "2330.TWSE",
            instrument_id: "eq:2330",
            kind: "cash_share",
            contract_month: null,
            multiplier: 1,
            margin_reserved: null,
            reason_code: "long_cash",
            side: "long",
            currency: "TWD",
            quantity: 5,
            average_price: 2299,
            mark_price: 2240,
            market_value: 11200,
            unrealized_pnl: -295,
            realized_pnl: 0,
            mark_status: "available",
            last_mark_at: "2026-11-07T06:00:00Z",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-cash",
            },
            links: {},
          },
          {
            id: "rt-legacy:2317.TWSE",
            holding_id: "rt-legacy:2317.TWSE",
            runtime_id: "rt-legacy",
            persona_id: "persona-legacy",
            capital_pool_id: "pool-legacy",
            broker_id: "shioaji_paper",
            symbol: "2317.TWSE",
            side: "short",
            currency: "TWD",
            quantity: -3,
            average_price: 240,
            mark_price: 235,
            market_value: -705,
            unrealized_pnl: 15,
            realized_pnl: 0,
            mark_status: "available",
            last_mark_at: "2026-11-07T06:00:00Z",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-legacy",
            },
            links: {},
          },
        ],
      },
      meta: {
        incidents: [],
        surfaces: { portfolio_book_holdings: { status: "ok" } },
      },
    });

    mocks.useV5Live.mockReturnValue({
      data: monitor,
      loading: false,
      refreshing: false,
      error: null,
      refresh: vi.fn(),
    });

    const view = renderPage();
    const rows = screen.getAllByTestId("portfolio-holding");
    expect(rows).toHaveLength(3);

    // Row 0: futures row with multiplier 100
    // BFF market_value is 450,000 (not quantity * mark_price = 4,500)
    // BFF unrealized_pnl is -10,000 (not quantity * (mark - avg) = -100)
    const futCells = within(rows[0]).getAllByRole("cell");
    expect(futCells[0]).toHaveTextContent("2330.TWSE");
    expect(futCells[1]).toHaveTextContent("2");
    expect(futCells[2]).toHaveTextContent("NT$2,300");
    expect(futCells[3]).toHaveTextContent("NT$2,250");
    expect(futCells[4]).toHaveTextContent("NT$450,000");
    expect(futCells[4]).not.toHaveTextContent("NT$4,500");
    expect(futCells[5]).toHaveTextContent("-NT$10,000 (-2.17%)");
    expect(futCells[5]).not.toHaveTextContent("-NT$100");
    expect(futCells[6]).toHaveTextContent("Stock future");
    expect(futCells[6]).toHaveTextContent("stock_future · ssf:QFF:202611");
    expect(futCells[7]).toHaveTextContent("202611");
    expect(futCells[8]).toHaveTextContent("100");
    expect(futCells[9]).toHaveTextContent("NT$92,000");
    expect(futCells[10]).toHaveTextContent("short_via_future");

    // Row 1: cash share row with instrument metadata
    const cashCells = within(rows[1]).getAllByRole("cell");
    expect(cashCells[4]).toHaveTextContent("NT$11,200");
    expect(cashCells[5]).toHaveTextContent("-NT$295 (-2.57%)");
    expect(cashCells[6]).toHaveTextContent("Cash share");
    expect(cashCells[6]).toHaveTextContent("cash_share · eq:2330");
    expect(cashCells[7]).toHaveTextContent("—");
    expect(cashCells[8]).toHaveTextContent("1");
    expect(cashCells[9]).toHaveTextContent("—");
    expect(cashCells[10]).toHaveTextContent("long_cash");

    // Row 2: pre-BFF cash share row with absent instrument fields
    const legacyCells = within(rows[2]).getAllByRole("cell");
    expect(legacyCells[1]).toHaveTextContent("-3");
    expect(legacyCells[1]).toHaveTextContent("Short position");
    expect(legacyCells[4]).toHaveTextContent("-NT$705");
    expect(legacyCells[5]).toHaveTextContent("NT$15 (+2.08%)");
    expect(legacyCells[6]).toHaveTextContent("—");
    expect(legacyCells[7]).toHaveTextContent("—");
    expect(legacyCells[8]).toHaveTextContent("—");
    expect(legacyCells[9]).toHaveTextContent("—");
    expect(legacyCells[10]).toHaveTextContent("—");

    // Switch to zh-TW and verify localized labels
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/portfolio-book"]}>
          <Routes>
            <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    const zhRows = screen.getAllByTestId("portfolio-holding");
    const zhFutCells = within(zhRows[0]).getAllByRole("cell");
    expect(zhFutCells[4]).toHaveTextContent("NT$450,000");
    expect(zhFutCells[6]).toHaveTextContent("股票期貨");
    expect(zhFutCells[6]).toHaveTextContent("stock_future · ssf:QFF:202611");
    expect(zhFutCells[7]).toHaveTextContent("202611");
    expect(zhFutCells[8]).toHaveTextContent("100");
    expect(zhFutCells[9]).toHaveTextContent("NT$92,000");
    expect(zhFutCells[10]).toHaveTextContent("short_via_future");

    const zhCashCells = within(zhRows[1]).getAllByRole("cell");
    expect(zhCashCells[6]).toHaveTextContent("現股");
    expect(zhCashCells[6]).toHaveTextContent("cash_share · eq:2330");

    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });

  it("renders entry price 97.10 and mark-unavailable explanation on unrealized PnL for the real 2026-11-10 0050 stock future row and uses no-average-cost only when average_price is null", async () => {
    const monitor = adaptPortfolioHoldingsMonitor({
      data: {
        summary: {
          holding_count: 3,
          incident_count: 0,
          source_coverage: {
            source_row_count: 3,
            runtime_count: 2,
            telemetry_runtime_count: 2,
            stale_row_count: 1,
            missing_binding_count: 0,
            degraded_source_count: 0,
          },
        },
        items: [
          {
            id: "rt-srf:ssf:SRF:202611",
            holding_id: "rt-srf:ssf:SRF:202611",
            runtime_id: "rt-srf",
            symbol: "0050.TWSE",
            instrument_id: "ssf:SRF:202611",
            instrument_kind: "stock_future",
            contract_month: "202611",
            multiplier: 1000,
            margin_reserved: 17400,
            side: "long",
            quantity: 2,
            average_price: 97.1,
            mark_price: null,
            market_value: null,
            unrealized_pnl: null,
            realized_pnl: 0,
            currency: "TWD",
            mark_status: "unavailable",
            last_mark_at: null,
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-srf",
            },
            links: {},
          },
          {
            id: "rt-stale-with-cost:2330.TWSE",
            holding_id: "rt-stale-with-cost:2330.TWSE",
            runtime_id: "rt-srf",
            symbol: "2330.TWSE",
            side: "long",
            quantity: 1,
            average_price: 1020.5,
            mark_price: null,
            market_value: null,
            unrealized_pnl: null,
            realized_pnl: 0,
            currency: "TWD",
            mark_status: "stale",
            last_mark_at: "2026-11-08T00:00:00Z",
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: true,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: "ledger-srf",
            },
            links: {},
          },
          {
            id: "rt-no-cost:2317.TWSE",
            holding_id: "rt-no-cost:2317.TWSE",
            runtime_id: "rt-no-cost",
            symbol: "2317.TWSE",
            side: "short",
            quantity: -1,
            average_price: null,
            mark_price: null,
            market_value: null,
            unrealized_pnl: null,
            realized_pnl: null,
            currency: "TWD",
            mark_status: "unavailable",
            last_mark_at: null,
            deployment_stage: "paper",
            source_status: "ok",
            telemetry_stale: false,
            risk_state: "paper_exposure",
            source_issues: [],
            capital_scope: {
              stage: "paper",
              scope_kind: "paper_ledger",
              scope_id: null,
            },
            links: {},
          },
        ],
      },
      meta: {
        incidents: [],
        surfaces: { portfolio_book_holdings: { status: "partial" } },
      },
    });

    mocks.useV5Live.mockReturnValue({
      data: monitor,
      loading: false,
      refreshing: false,
      error: null,
      refresh: vi.fn(),
    });

    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
    const view = renderPage();

    const rows = screen.getAllByTestId("portfolio-holding");
    expect(rows).toHaveLength(3);

    // Row 0: real 2026-11-10 stock future row (average_price 97.1, mark_status unavailable, unrealized_pnl null)
    const srfCells = within(rows[0]).getAllByRole("cell");
    expect(srfCells[2]).toHaveTextContent("NT$97.10");
    expect(within(srfCells[2]).queryByLabelText("Source reports no average cost")).not.toBeInTheDocument();
    expect(srfCells[4]).toHaveTextContent("No price available");
    expect(srfCells[5]).toHaveTextContent("—");
    expect(within(srfCells[5]).getByLabelText("No price available")).toBeInTheDocument();
    expect(within(srfCells[5]).queryByLabelText("Source reports no average cost")).not.toBeInTheDocument();

    // Row 1: average_price present (1020.5), mark_status stale, unrealized_pnl null
    const staleCostCells = within(rows[1]).getAllByRole("cell");
    expect(staleCostCells[2]).toHaveTextContent("NT$1,020.50");
    expect(within(staleCostCells[5]).getByLabelText("No price available")).toBeInTheDocument();
    expect(within(staleCostCells[5]).queryByLabelText("Source reports no average cost")).not.toBeInTheDocument();

    // Row 2: average_price is null -> both Avg entry and Unrealized PnL explain no average cost
    const noCostCells = within(rows[2]).getAllByRole("cell");
    expect(within(noCostCells[2]).getByLabelText("Source reports no average cost")).toBeInTheDocument();
    expect(within(noCostCells[5]).getByLabelText("Source reports no average cost")).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/portfolio-book"]}>
          <Routes>
            <Route path="/management/portfolio-book" element={<PortfolioBookPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    const zhRows = screen.getAllByTestId("portfolio-holding");
    const zhSrfCells = within(zhRows[0]).getAllByRole("cell");
    expect(zhSrfCells[2]).toHaveTextContent("NT$97.10");
    expect(within(zhSrfCells[2]).queryByLabelText("來源未提供平均成本")).not.toBeInTheDocument();
    expect(within(zhSrfCells[5]).getByLabelText("無可用報價")).toBeInTheDocument();
    expect(within(zhSrfCells[5]).queryByLabelText("來源未提供平均成本")).not.toBeInTheDocument();

    const zhNoCostCells = within(zhRows[2]).getAllByRole("cell");
    expect(within(zhNoCostCells[2]).getByLabelText("來源未提供平均成本")).toBeInTheDocument();
    expect(within(zhNoCostCells[5]).getByLabelText("來源未提供平均成本")).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });
});
