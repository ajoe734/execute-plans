import { render, screen, within } from "@testing-library/react";
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
});
