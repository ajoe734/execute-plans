import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChartSpecV1 } from "@/lib/bff-v1/agora/types";

import { ChartSpecRenderer, validateChartSpecForRendering } from "./ChartSpecRenderer";

vi.mock("echarts-for-react", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ option }: { option: unknown }) =>
      ReactModule.createElement("div", { "data-option": JSON.stringify(option), "data-testid": "mock-echarts" }),
  };
});

vi.mock("recharts", async () => {
  const ReactModule = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("div", null, children);
  const Leaf = () => ReactModule.createElement("span");
  return {
    Area: Leaf,
    AreaChart: Box,
    Bar: Leaf,
    BarChart: Box,
    CartesianGrid: Leaf,
    Line: Leaf,
    LineChart: Box,
    ResponsiveContainer: Box,
    Tooltip: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
  };
});

function metricSpec(overrides: Partial<ChartSpecV1> = {}): ChartSpecV1 {
  return {
    spec_version: "1.0",
    kind: "metric",
    encodings: {
      y: { field: "value", type: "quantitative" },
      label: { field: "label", type: "nominal" },
    },
    ...overrides,
  };
}

describe("ChartSpecRenderer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders simple chart kinds through the Recharts dispatch", () => {
    render(<ChartSpecRenderer data={[{ label: "Sharpe", value: 1.42 }]} spec={metricSpec()} />);

    expect(screen.getByTestId("chart-renderer-recharts")).toBeTruthy();
    expect(screen.getByText("1.42")).toBeTruthy();
  });

  it.each([
    {
      kind: "network" as const,
      expectedSeries: "graph",
      data: [{ source: "A", target: "B", value: 10 }],
      encodings: {
        source: { field: "source", type: "nominal" as const },
        target: { field: "target", type: "nominal" as const },
        value: { field: "value", type: "quantitative" as const },
      },
    },
    {
      kind: "sankey" as const,
      expectedSeries: "sankey",
      data: [{ source: "A", target: "B", value: 10 }],
      encodings: {
        source: { field: "source", type: "nominal" as const },
        target: { field: "target", type: "nominal" as const },
        value: { field: "value", type: "quantitative" as const },
      },
    },
    {
      kind: "candlestick" as const,
      expectedSeries: "candlestick",
      data: [{ time: "2026-07-15", open: 10, high: 14, low: 8, close: 12 }],
      encodings: {
        x: { field: "time", type: "temporal" as const },
        open: { field: "open", type: "quantitative" as const },
        high: { field: "high", type: "quantitative" as const },
        low: { field: "low", type: "quantitative" as const },
        close: { field: "close", type: "quantitative" as const },
      },
    },
    {
      kind: "gauge" as const,
      expectedSeries: "gauge",
      data: [{ label: "Confidence", value: 78 }],
      encodings: {
        label: { field: "label", type: "nominal" as const },
        value: { field: "value", type: "quantitative" as const },
      },
    },
    {
      kind: "heatmap" as const,
      expectedSeries: "heatmap",
      data: [{ time: "2026-07-15", branch: "A", value: 42 }],
      encodings: {
        x: { field: "time", type: "temporal" as const },
        y: { field: "branch", type: "nominal" as const },
        value: { field: "value", type: "quantitative" as const },
      },
    },
    {
      kind: "scatter" as const,
      expectedSeries: "scatter",
      data: [{ x: 1, y: 2, size: 3 }],
      encodings: {
        x: { field: "x", type: "quantitative" as const },
        y: { field: "y", type: "quantitative" as const },
        size: { field: "size", type: "quantitative" as const },
      },
    },
  ])("renders $kind through ECharts without the vulnerable lines series", ({
    data,
    encodings,
    expectedSeries,
    kind,
  }) => {
    render(
      <ChartSpecRenderer
        data={data}
        spec={{ spec_version: "1.0", kind, encodings }}
      />,
    );

    expect(screen.getByTestId("chart-renderer-echarts")).toBeTruthy();
    const option = JSON.parse(
      screen.getByTestId("mock-echarts").getAttribute("data-option") ?? "{}",
    ) as { series?: Array<{ type?: string }> };
    const seriesTypes = option.series?.map((series) => series.type) ?? [];
    expect(seriesTypes).toEqual([expectedSeries]);
    expect(seriesTypes).not.toContain("lines");
  });

  it("renders table, timeline, and stacked_bar without external chart execution", () => {
    render(
      <ChartSpecRenderer
        data={[{ label: "Candidate A", value: 12 }]}
        spec={{
          spec_version: "1.0",
          kind: "table",
          encodings: {
            label: { field: "label", type: "nominal" },
            value: { field: "value", type: "quantitative" },
          },
        }}
      />,
    );

    expect(screen.getByTestId("chart-renderer-builtin")).toBeTruthy();
    expect(screen.getByText("Candidate A")).toBeTruthy();
  });

  it("rejects unsafe callbacks, html, scripts, and arbitrary interaction kinds", () => {
    const unsafeSpec = metricSpec({
      options: { formatter: "function () { return window.location.href }" },
    });
    expect(validateChartSpecForRendering(unsafeSpec)).toContain("renderer-unsafe");

    render(<ChartSpecRenderer data={[{ label: "Risk", value: 3 }]} spec={unsafeSpec} />);
    expect(screen.getByTestId("chart-render-notice").textContent).toContain("renderer-unsafe");

    expect(
      validateChartSpecForRendering(
        metricSpec({
          click_action: { kind: "place_order", params: { symbol: "AAPL" } } as unknown as ChartSpecV1["click_action"],
        }),
      ),
    ).toContain("Interaction is not");
  });

  it("fires only allowlisted declarative interactions", () => {
    const onInteraction = vi.fn();
    render(
      <ChartSpecRenderer
        data={[{ label: "Evidence", value: 1 }]}
        onInteraction={onInteraction}
        spec={metricSpec({ click_action: { kind: "open_evidence", params: { evidence_id: "ev-1" } } })}
      />,
    );

    fireEvent.click(screen.getByTestId("chart-spec-renderer"));
    expect(onInteraction).toHaveBeenCalledWith({ kind: "open_evidence", params: { evidence_id: "ev-1" } });
  });

  it("renders honest ChartNotice and does not fabricate fake data when data is undefined and isSampleData is false", () => {
    render(
      <ChartSpecRenderer
        spec={{
          spec_version: "1.0",
          kind: "table",
          encodings: {
            label: { field: "label", type: "nominal" },
            value: { field: "value", type: "quantitative" },
          },
        }}
        widgetType="candidate_funnel"
        isSampleData={false}
      />
    );

    expect(screen.getByTestId("chart-render-notice")).toBeTruthy();
    expect(screen.getByText("NO CANDIDATES")).toBeTruthy();
    expect(screen.getByText("Awaiting candidate monitoring telemetry from BFF.")).toBeTruthy();
    expect(screen.queryByText("SAMPLE DATA")).toBeNull();
  });

  it("renders sample/mock data and shows the SAMPLE DATA badge when isSampleData is true", () => {
    render(
      <ChartSpecRenderer
        spec={{
          spec_version: "1.0",
          kind: "table",
          encodings: {
            label: { field: "label", type: "nominal" },
            value: { field: "value", type: "quantitative" },
          },
        }}
        widgetType="candidate_funnel"
        isSampleData={true}
      />
    );

    expect(screen.queryByTestId("chart-render-notice")).toBeNull();
    expect(screen.getByTestId("chart-renderer-builtin")).toBeTruthy();
    expect(screen.getByText("SAMPLE DATA")).toBeTruthy();
  });

  it("renders correct status details for different widgetTypes when data is missing", () => {
    const { rerender } = render(
      <ChartSpecRenderer
        spec={{ spec_version: "1.0", kind: "table", encodings: {} }}
        widgetType="winner_branch_scoreboard"
        isSampleData={false}
      />
    );
    expect(screen.getByText("AWAITING DISCLOSURES")).toBeTruthy();

    rerender(
      <ChartSpecRenderer
        spec={{ spec_version: "1.0", kind: "table", encodings: {} }}
        widgetType="related_branch_network"
        isSampleData={false}
      />
    );
    expect(screen.getByText("AWAITING DISCLOSURES")).toBeTruthy();

    rerender(
      <ChartSpecRenderer
        spec={{ spec_version: "1.0", kind: "table", encodings: {} }}
        widgetType="event_lead_distribution"
        isSampleData={false}
      />
    );
    expect(screen.getByText("TIMELINE UNAVAILABLE")).toBeTruthy();

    rerender(
      <ChartSpecRenderer
        spec={{ spec_version: "1.0", kind: "table", encodings: {} }}
        widgetType="confidence_decomposition"
        isSampleData={false}
      />
    );
    expect(screen.getByText("AWAITING DISCLOSURES")).toBeTruthy();
  });
});
