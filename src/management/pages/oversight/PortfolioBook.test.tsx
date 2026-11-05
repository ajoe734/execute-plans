import { fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(nullCurrencyCells[3]).toHaveTextContent("-4,770 (幣別未提供)");
    expect(nullCurrencyCells[3].textContent).not.toMatch(/\$|USD|TWD|NT\$/);
    expect(nullCurrencyCells[4]).toHaveTextContent("—");

    const twdCells = within(rows[1]).getAllByRole("cell");
    expect(twdCells[3]).toHaveTextContent("-NT$4,770");
    expect(twdCells[4]).toHaveTextContent("-NT$120");

    const usdCells = within(rows[2]).getAllByRole("cell");
    expect(usdCells[3]).toHaveTextContent("$1,926");
    expect(usdCells[4]).toHaveTextContent("—");
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
});
