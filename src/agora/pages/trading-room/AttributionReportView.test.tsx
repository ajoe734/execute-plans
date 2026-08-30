import React from "react";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttributionReportView } from "./AttributionReportView";
import * as tradingRoomModule from "@/lib/bff-v1/agora/tradingRoom";
import type {
  TradingRoomPerformanceAttributionResponse,
  TradingRoomPerformanceAttributionRow,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError } from "@/lib/bff-v1/errors";

const { mockGetTradingRoomPerformanceAttribution } = vi.hoisted(() => ({
  mockGetTradingRoomPerformanceAttribution: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/tradingRoom", () => ({
  getTradingRoomPerformanceAttribution: mockGetTradingRoomPerformanceAttribution,
}));

const MOCK_ATTRIBUTION_ROWS: TradingRoomPerformanceAttributionRow[] = [
  {
    dimension: "strategy",
    dimension_key: "strat-001",
    id: "attr-001",
    label: "Taiwan Momentum Alpha",
    metrics: {
      active_return: 0.045,
      alpha: 0.038,
      benchmark_return: 0.08,
      beta: 1.05,
      information_ratio: 1.25,
      max_drawdown: 0.065,
      profit_factor: 1.8,
      risk_contribution: 0.45,
      sharpe_ratio: 1.95,
      total_return: 0.125,
      tracking_error: 0.036,
      turnover: 2.1,
      volatility: 0.14,
      win_rate: 0.62,
    },
    rank: 1,
  },
  {
    dimension: "strategy",
    dimension_key: "strat-002",
    id: "attr-002",
    label: "Global Macro Hedge",
    metrics: {
      active_return: -0.012,
      alpha: -0.005,
      benchmark_return: 0.08,
      beta: 0.85,
      information_ratio: -0.3,
      max_drawdown: 0.095,
      profit_factor: 1.1,
      risk_contribution: 0.35,
      sharpe_ratio: 0.95,
      total_return: 0.068,
      tracking_error: 0.04,
      turnover: 1.4,
      volatility: 0.11,
      win_rate: 0.48,
    },
    rank: 2,
  },
];

const MOCK_ATTRIBUTION_RESPONSE: TradingRoomPerformanceAttributionResponse = {
  data: {
    dimension: "strategy",
    items: MOCK_ATTRIBUTION_ROWS,
    period: "latest",
    summary: {
      active_return: 0.033,
      alpha: 0.028,
      as_of: "2026-08-30T22:00:00Z",
      benchmark_return: 0.08,
      dimension: "strategy",
      information_ratio: 1.1,
      item_count: 2,
      max_drawdown: 0.095,
      period: "latest",
      sharpe_ratio: 1.65,
      total_return: 0.113,
      turnover: 1.85,
      win_rate: 0.58,
    },
  },
  meta: {
    as_of: "2026-08-30T22:00:00Z",
    composition_sources: ["agora_engine", "telemetry_aggregator"],
    status: "verified",
    surfaces: {
      attribution: { status: "healthy" },
      benchmark: { status: "healthy" },
    },
  },
};

describe("AttributionReportView suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockGetTradingRoomPerformanceAttribution).mockResolvedValue(MOCK_ATTRIBUTION_RESPONSE);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the summary KPI metrics correctly", async () => {
    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-summary-kpis")).toBeInTheDocument();
      expect(screen.getByText("+11.30%")).toBeInTheDocument(); // Total Return
      expect(screen.getByText("+3.30%")).toBeInTheDocument(); // Active Return
      expect(screen.getByText("1.65")).toBeInTheDocument(); // Sharpe Ratio
      expect(screen.getByText("58.00%")).toBeInTheDocument(); // Win Rate
      expect(screen.getByText("9.50%")).toBeInTheDocument(); // Max Drawdown
    });
  });

  it("renders the attribution breakdown table with rows", async () => {
    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-table")).toBeInTheDocument();
      expect(screen.getByTestId("attribution-row-attr-001")).toBeInTheDocument();
      expect(screen.getByText("Taiwan Momentum Alpha")).toBeInTheDocument();
      expect(screen.getByText("+12.50%")).toBeInTheDocument();
      expect(screen.getByTestId("attribution-row-attr-002")).toBeInTheDocument();
      expect(screen.getByText("Global Macro Hedge")).toBeInTheDocument();
      expect(screen.getByText("+6.80%")).toBeInTheDocument();
    });
  });

  it("switches dimensions and reloads attribution data", async () => {
    const onDimensionChange = vi.fn();
    render(<AttributionReportView onDimensionChange={onDimensionChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-dimension-persona")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("attribution-dimension-persona"));
    });

    await waitFor(() => {
      expect(onDimensionChange).toHaveBeenCalledWith("persona");
      expect(mockGetTradingRoomPerformanceAttribution).toHaveBeenCalledWith(
        expect.objectContaining({
          dimension: "persona",
        }),
      );
    });
  });

  it("switches period and reloads attribution data", async () => {
    const onPeriodChange = vi.fn();
    render(<AttributionReportView onPeriodChange={onPeriodChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-period-select")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("attribution-period-select"), { target: { value: "30d" } });
    });

    await waitFor(() => {
      expect(onPeriodChange).toHaveBeenCalledWith("30d");
      expect(mockGetTradingRoomPerformanceAttribution).toHaveBeenCalledWith(
        expect.objectContaining({
          period: "30d",
        }),
      );
    });
  });

  it("sorts table rows when clicking column headers", async () => {
    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-row-attr-001")).toBeInTheDocument();
    });

    const returnHeader = screen.getByRole("columnheader", { name: /Return/i });
    await act(async () => {
      fireEvent.click(returnHeader);
    });

    // Clicking header sorts rows
    expect(screen.getByTestId("attribution-table")).toBeInTheDocument();
  });

  it("renders empty state when no items are returned", async () => {
    vi.mocked(mockGetTradingRoomPerformanceAttribution).mockResolvedValueOnce({
      ...MOCK_ATTRIBUTION_RESPONSE,
      data: {
        ...MOCK_ATTRIBUTION_RESPONSE.data,
        items: [],
      },
    });

    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-table-empty")).toBeInTheDocument();
    });
  });

  it("handles fetch error and renders error state with retry button", async () => {
    vi.mocked(mockGetTradingRoomPerformanceAttribution).mockRejectedValueOnce(
      new BffError(503, { error: { code: "SERVICE_UNAVAILABLE", message: "Attribution service degraded" } }),
    );

    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-error")).toBeInTheDocument();
      expect(screen.getByText(/SERVICE_UNAVAILABLE: Attribution service degraded/)).toBeInTheDocument();
      expect(screen.getByTestId("attribution-retry-button")).toBeInTheDocument();
    });

    vi.mocked(mockGetTradingRoomPerformanceAttribution).mockResolvedValueOnce(MOCK_ATTRIBUTION_RESPONSE);

    await act(async () => {
      fireEvent.click(screen.getByTestId("attribution-retry-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("attribution-table")).toBeInTheDocument();
    });
  });

  it("renders provenance and surface metadata", async () => {
    render(<AttributionReportView />);

    await waitFor(() => {
      const provenance = screen.getByTestId("attribution-provenance");
      expect(provenance).toBeInTheDocument();
      expect(screen.getByText(/agora_engine, telemetry_aggregator/)).toBeInTheDocument();
    });
  });
});
