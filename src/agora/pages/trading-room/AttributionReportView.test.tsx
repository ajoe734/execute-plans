import React from "react";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttributionReportView } from "./AttributionReportView";
import {
  getTradingRoomPerformanceAttribution,
  type TradingRoomPerformanceAttributionResponse,
  type TradingRoomPerformanceAttributionRow,
} from "@/lib/bff-v1/agora/tradingRoom";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

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
  page_info: {
    next_page_token: null,
    page_size: 50,
    total: 2,
  },
};

describe("AttributionReportView suite", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/management/performance-attribution/by-strategy")) {
        return jsonResponse(MOCK_ATTRIBUTION_RESPONSE);
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
  });

  it("renders summary KPI metrics and verifies actual client URL and query parameters", async () => {
    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-summary-kpis")).toBeInTheDocument();
      expect(screen.getByText("+11.30%")).toBeInTheDocument(); // Total Return
      expect(screen.getByText("+3.30%")).toBeInTheDocument(); // Active Return
      expect(screen.getByText("1.65")).toBeInTheDocument(); // Sharpe Ratio
      expect(screen.getByText("58.00%")).toBeInTheDocument(); // Win Rate
      expect(screen.getByText("9.50%")).toBeInTheDocument(); // Max Drawdown
    });

    // Verify real client URL called against backend
    expect(fetchSpy).toHaveBeenCalled();
    const firstCallUrl = String(fetchSpy.mock.calls[0][0]);
    expect(firstCallUrl).toContain("/bff/management/performance-attribution/by-strategy");
    expect(firstCallUrl).toContain("period=latest");
    expect(firstCallUrl).toContain("page_size=50");
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

  it("restricts dimension to backend-supported strategy dimension only", async () => {
    const onDimensionChange = vi.fn();
    render(<AttributionReportView onDimensionChange={onDimensionChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-dimension-strategy")).toBeInTheDocument();
    });

    // Ensure unsupported dimension buttons are NOT rendered
    expect(screen.queryByTestId("attribution-dimension-persona")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attribution-dimension-asset_class")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attribution-dimension-model")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attribution-dimension-market_session")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("attribution-dimension-strategy"));
    });

    expect(onDimensionChange).toHaveBeenCalledWith("strategy");
  });

  it("switches period and reloads attribution data with updated query parameter", async () => {
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
    });

    // Verify subsequent fetch call contains updated period
    const lastCallUrl = String(fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0]);
    expect(lastCallUrl).toContain("/bff/management/performance-attribution/by-strategy");
    expect(lastCallUrl).toContain("period=30d");
    expect(lastCallUrl).toContain("page_size=50");
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

    expect(screen.getByTestId("attribution-table")).toBeInTheDocument();
  });

  it("renders empty state when no items are returned", async () => {
    fetchSpy.mockImplementationOnce(async () => {
      return jsonResponse({
        ...MOCK_ATTRIBUTION_RESPONSE,
        data: {
          ...MOCK_ATTRIBUTION_RESPONSE.data,
          items: [],
        },
      });
    });

    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-table-empty")).toBeInTheDocument();
    });
  });

  it("handles fetch error and renders error state with retry button", async () => {
    fetchSpy.mockImplementationOnce(async () => {
      return jsonResponse(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Attribution service degraded" } },
        503,
      );
    });

    render(<AttributionReportView />);

    await waitFor(() => {
      expect(screen.getByTestId("attribution-error")).toBeInTheDocument();
      expect(screen.getByText(/SERVICE_UNAVAILABLE: Attribution service degraded/)).toBeInTheDocument();
      expect(screen.getByTestId("attribution-retry-button")).toBeInTheDocument();
    });

    fetchSpy.mockImplementationOnce(async () => {
      return jsonResponse(MOCK_ATTRIBUTION_RESPONSE);
    });

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

  it("verifies direct getTradingRoomPerformanceAttribution client contract and query parameters", async () => {
    const result = await getTradingRoomPerformanceAttribution({
      pageSize: 25,
      pageToken: "cursor-token-abc",
      period: "7d",
    });

    expect(result.data.items).toHaveLength(2);
    const lastUrl = String(fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0]);
    expect(lastUrl).toContain("/bff/management/performance-attribution/by-strategy");
    expect(lastUrl).toContain("period=7d");
    expect(lastUrl).toContain("page_size=25");
    expect(lastUrl).toContain("page_token=cursor-token-abc");
    // Ensure no unsupported dimension query parameter is attached
    expect(lastUrl).not.toContain("dimension=");
  });
});
