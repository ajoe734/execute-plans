import type { ChartSpecV1 } from "@/lib/bff-v1/agora/tradingRoomTypes";
import type { ChartSpecKind } from "@/agora/widgets/registry";

export function chartSpecForKind(kind: ChartSpecKind): ChartSpecV1 {
  const encodingsByKind: Partial<Record<ChartSpecKind, ChartSpecV1["encodings"]>> = {
    bar: {
      x: { field: "label", type: "nominal" },
      y: { field: "value", type: "quantitative" },
    },
    gauge: {
      label: { field: "metric", type: "nominal" },
      value: { field: "value", type: "quantitative" },
    },
    heatmap: {
      row: { field: "branch_cluster", type: "nominal" },
      column: { field: "trade_date", type: "temporal" },
      value: { field: "net_flow", type: "quantitative" },
    },
    line: {
      x: { field: "trade_date", type: "temporal" },
      y: { field: "value", type: "quantitative" },
    },
    metric: {
      label: { field: "metric", type: "nominal" },
      value: { field: "value", type: "quantitative" },
    },
    network: {
      source: { field: "source", type: "nominal" },
      target: { field: "target", type: "nominal" },
      value: { field: "weight", type: "quantitative" },
    },
    sankey: {
      source: { field: "source", type: "nominal" },
      target: { field: "target", type: "nominal" },
      value: { field: "flow", type: "quantitative" },
    },
    scatter: {
      x: { field: "probability", type: "quantitative" },
      y: { field: "expected_value", type: "quantitative" },
      size: { field: "liquidity", type: "quantitative" },
      color: { field: "confidence", type: "quantitative" },
    },
    table: {
      label: { field: "label", type: "nominal" },
      value: { field: "value", type: "quantitative" },
    },
    timeline: {
      time: { field: "event_time", type: "temporal" },
      label: { field: "event_label", type: "nominal" },
    },
  };
  return {
    spec_version: "1.0",
    kind,
    encodings: encodingsByKind[kind] ?? {},
    transforms: [],
    tooltip_fields: [],
    thresholds: [],
    click_action: { kind: "request_widget_revision" },
    options: {},
  };
}

export function chartSpecSummary(spec: ChartSpecV1): string {
  const channels = Object.entries(spec.encodings ?? {})
    .map(([channel, encoding]) => `${channel}:${encoding.field}`)
    .join(" · ");
  return channels ? `${spec.kind} · ${channels}` : spec.kind;
}
