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
});
