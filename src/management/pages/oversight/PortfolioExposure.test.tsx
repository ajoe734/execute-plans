import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { PortfolioExposurePage } from "./PortfolioExposure";
import type { ManagementPortfolioExposureMonitor } from "@/lib/bff-v1/management";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderPage(initialEntry = "/management/performance?tab=exposure") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/performance" element={<PortfolioExposurePage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const monitor: ManagementPortfolioExposureMonitor = {
  summary: {
    exposureCount: 2,
    riskBudgetTotal: 100,
    currentExposureTotal: 92,
    availableBudgetTotal: 8,
    riskBudgetUtilization: 0.92,
    overBudgetCount: 1,
    nearLimitCount: 1,
    unknownExposureCount: 0,
    telemetryRuntimeCount: 2,
    totalPnl: -18000,
    latestTelemetryAt: "2026-07-11T00:00:00Z",
  },
  items: [
    {
      id: "portfolio-exposure-pool-alpha", capitalPoolId: "pool-alpha", name: "Alpha Pool",
      status: "active", currency: "USD", riskBudget: 60, currentExposure: 58,
      availableBudget: 2, riskBudgetUtilization: 0.967, riskState: "over_budget", pnl: -12000,
      runtimeIds: ["rt-1"], runtimeCount: 1, activeRuntimeCount: 1, paperRuntimeCount: 0,
      liveRuntimeCount: 1, telemetryAvailable: true,
    },
    {
      id: "portfolio-exposure-pool-beta", capitalPoolId: "pool-beta", name: "Beta Pool",
      status: "active", currency: "USD", riskBudget: 40, currentExposure: 34,
      availableBudget: 6, riskBudgetUtilization: 0.85, riskState: "near_limit", pnl: -6000,
      runtimeIds: [], runtimeCount: 0, activeRuntimeCount: 0, paperRuntimeCount: 0,
      liveRuntimeCount: 0, telemetryAvailable: false,
    },
  ],
  dataConfidence: "formal",
  sourceIssues: [],
};

describe("PortfolioExposurePage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("renders the capital pool rollup without nan or undefined metrics", () => {
    mocks.useV5Live
      .mockReturnValueOnce({ loading: false, refresh: vi.fn(), data: monitor })
      .mockReturnValueOnce({ loading: false, refresh: vi.fn(), data: undefined });

    renderPage();

    expect(screen.getAllByTestId("exposure-pool-row")).toHaveLength(2);
    expect(screen.getByText("Formal attribution")).toBeInTheDocument();
    expect(screen.getByText("92.0%")).toBeInTheDocument();
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("shows the pool focus badge and links holdings back to overview when a pool is focused", () => {
    mocks.useV5Live
      .mockReturnValueOnce({ loading: false, refresh: vi.fn(), data: monitor })
      .mockReturnValueOnce({
        loading: false,
        refresh: vi.fn(),
        data: {
          items: [],
          incidents: [],
          surfaceStatus: "ok",
          coverage: {
            holdingCount: 0, sourceRowCount: 0, runtimeCount: 0, telemetryRuntimeCount: 0,
            staleRowCount: 0, missingBindingCount: 0, degradedSourceCount: 0, incidentCount: 0,
          },
        },
      });

    renderPage("/management/performance?tab=exposure&capital_pool_id=pool-alpha");

    expect(screen.getByText("Focused capital pool: pool-alpha")).toBeInTheDocument();
    expect(screen.getByText("Show all pools")).toBeInTheDocument();
    expect(screen.getAllByText("View holdings")[0]).toHaveAttribute(
      "href",
      expect.stringContaining("tab=overview"),
    );
  });

  it("renders an honest unavailable state instead of a false empty table", () => {
    mocks.useV5Live
      .mockReturnValueOnce({ loading: false, refresh: vi.fn(), data: undefined })
      .mockReturnValueOnce({ loading: false, refresh: vi.fn(), data: undefined });

    renderPage();

    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(screen.getByText("Exposure source is unavailable.")).toBeInTheDocument();
    expect(screen.queryByTestId("exposure-pool-row")).not.toBeInTheDocument();
  });

  it("renders focused pool holdings with instrument columns, em-dash fallbacks, and BFF market value for futures rows", () => {
    mocks.useV5Live
      .mockReturnValueOnce({ loading: false, refresh: vi.fn(), data: monitor })
      .mockReturnValueOnce({
        loading: false,
        refresh: vi.fn(),
        data: {
          items: [
            {
              holdingId: "rt-fut:ssf:QFF:202611",
              symbol: "2330.TWSE",
              instrumentId: "ssf:QFF:202611",
              instrumentKind: "stock_future",
              contractMonth: "202611",
              multiplier: 100,
              marginReserved: 92000,
              reasonCode: "short_via_future",
              currency: "TWD",
              quantity: 2,
              averagePrice: 2300,
              markPrice: 2250,
              marketValue: 450000,
              unrealizedPnl: -10000,
              deploymentStage: "paper",
              sourceStatus: "ok",
              telemetryStale: false,
              riskState: "paper_exposure",
              sourceIssues: [],
              capitalScope: { stage: "paper", scopeKind: "paper_ledger", scopeId: "ledger-fut" },
              links: {},
            },
            {
              holdingId: "rt-cash:2317.TWSE",
              symbol: "2317.TWSE",
              currency: "TWD",
              quantity: 1,
              marketValue: 235,
              unrealizedPnl: 5,
              deploymentStage: "paper",
              sourceStatus: "ok",
              telemetryStale: false,
              riskState: "paper_exposure",
              sourceIssues: [],
              capitalScope: { stage: "paper", scopeKind: "paper_ledger", scopeId: "ledger-cash" },
              links: {},
            },
          ],
          incidents: [],
          surfaceStatus: "ok",
          coverage: {
            holdingCount: 2,
            sourceRowCount: 2,
            runtimeCount: 2,
            telemetryRuntimeCount: 2,
            staleRowCount: 0,
            missingBindingCount: 0,
            degradedSourceCount: 0,
            incidentCount: 0,
          },
        },
      });

    renderPage("/management/performance?tab=exposure&capital_pool_id=pool-alpha");

    const rows = screen.getAllByTestId("exposure-holding-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("2330.TWSE");
    expect(rows[0]).toHaveTextContent("NT$450,000");
    expect(rows[0]).toHaveTextContent("-NT$10,000");
    expect(rows[0]).toHaveTextContent("Stock future");
    expect(rows[0]).toHaveTextContent("stock_future · ssf:QFF:202611");
    expect(rows[0]).toHaveTextContent("202611");
    expect(rows[0]).toHaveTextContent("100");
    expect(rows[0]).toHaveTextContent("NT$92,000");
    expect(rows[0]).toHaveTextContent("short_via_future");
    expect(rows[1]).toHaveTextContent("2317.TWSE");
    expect(rows[1]).toHaveTextContent("NT$235");
    expect(rows[1]).toHaveTextContent("—");
  });
});
