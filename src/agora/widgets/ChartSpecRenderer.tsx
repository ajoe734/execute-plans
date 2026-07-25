import React, { useMemo } from "react";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartSpecV1 } from "@/lib/bff-v1/agora/tradingRoomTypes";

import {
  chartRendererForKind,
  isWidgetInteractionKind,
  type ChartSpecKind,
  type WidgetInteractionKind,
  validateChartSpecGrammar,
} from "./registry";

export type ChartDataRow = Record<string, unknown>;
export type ChartInteraction = NonNullable<ChartSpecV1["click_action"]>;

export interface ChartSpecRendererProps {
  spec: ChartSpecV1;
  data?: ChartDataRow[];
  height?: number;
  onInteraction?: (interaction: ChartInteraction) => void;
}

const UNSAFE_KEY_PATTERN = /(callback|dangerouslySetInnerHTML|eval|formatter|function|html|iframe|on[A-Z]|script)/u;
const UNSAFE_STRING_PATTERN = /(<\s*script|<\s*iframe|<\s*object|<\s*embed|javascript:|data:text\/html|eval\s*\(|new\s+Function|function\s*\(|=>)/iu;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasUnsafeRenderableValue(value: unknown): boolean {
  if (typeof value === "string") {
    return UNSAFE_STRING_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasUnsafeRenderableValue(entry));
  }
  if (isPlainRecord(value)) {
    return Object.entries(value).some(([key, entry]) => UNSAFE_KEY_PATTERN.test(key) || hasUnsafeRenderableValue(entry));
  }
  return false;
}

export function validateChartSpecForRendering(spec: ChartSpecV1): string | null {
  const grammarFailure = validateChartSpecGrammar(spec);
  if (grammarFailure) {
    return grammarFailure.message;
  }
  if (hasUnsafeRenderableValue(spec.options) || hasUnsafeRenderableValue(spec.transforms) || hasUnsafeRenderableValue(spec.click_action)) {
    return "ChartSpec contains renderer-unsafe callback, HTML, script, or executable code markers.";
  }
  return null;
}

function asRows(data: ChartDataRow[] | undefined): ChartDataRow[] {
  return Array.isArray(data) ? data.filter(isPlainRecord) : [];
}

function fieldFor(spec: ChartSpecV1, channel: string, fallback?: string): string | undefined {
  const encoding = spec.encodings[channel];
  return encoding?.field || fallback;
}

function firstField(spec: ChartSpecV1, channels: string[], fallback?: string): string | undefined {
  for (const channel of channels) {
    const field = fieldFor(spec, channel);
    if (field) return field;
  }
  return fallback;
}

function valueFrom(row: ChartDataRow | undefined, field: string | undefined): unknown {
  if (!row || !field) return undefined;
  return row[field];
}

function numberFrom(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function textFrom(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return textFrom(value) || "-";
}

function chartTitle(spec: ChartSpecV1): string {
  const label = firstField(spec, ["label", "y", "value", "x"]);
  return label || spec.kind;
}

function ChartFrame({
  children,
  interaction,
  onInteraction,
  isSampleData = false,
}: {
  children: React.ReactNode;
  interaction?: ChartInteraction;
  onInteraction?: (interaction: ChartInteraction) => void;
  isSampleData?: boolean;
}) {
  const clickable = Boolean(interaction && onInteraction && isWidgetInteractionKind(interaction.kind));
  return (
    <div
      className="h-full min-h-[180px] rounded-md border border-slate-800 bg-[#171b22] p-3 text-[#f0ece4]"
      data-testid="chart-spec-renderer"
      onClick={clickable ? () => onInteraction?.(interaction as ChartInteraction) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onInteraction?.(interaction as ChartInteraction);
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{
        background: "#1e2330",
        border: "1px solid #2a2e38",
        color: "#f0ece4",
        position: "relative",
      }}
    >
      {isSampleData && (
        <div style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: "rgba(232, 183, 80, 0.15)",
          color: "#e8b750",
          border: "1px solid #e8b750",
          borderRadius: 4,
          padding: "2px 6px",
          fontSize: 10,
          fontWeight: "bold",
          pointerEvents: "none",
          zIndex: 10,
        }}>
          SAMPLE DATA
        </div>
      )}
      {children}
    </div>
  );
}

function ChartNotice({
  message,
  widgetType,
  dataSource,
}: {
  message: string;
  widgetType?: string;
  dataSource?: string;
}) {
  let statusLabel = "DATA UNAVAILABLE";
  let statusColor = "#8c96a6";
  let icon = "⚡";
  let detailedDescription = message;

  if (widgetType === "strategy_status_summary" || widgetType === "research_progress") {
    statusLabel = "AWAITING TELEMETRY";
    statusColor = "#8c96a6";
    icon = "✓";
    detailedDescription = "No status summary or progress logs have been synchronized.";
  } else if (widgetType === "candidate_funnel" || widgetType === "candidate_ranking_table") {
    statusLabel = "NO CANDIDATES";
    statusColor = "#8c96a6";
    icon = "🔍";
    detailedDescription = "Awaiting candidate monitoring telemetry from BFF.";
  } else if (widgetType?.includes("branch") || widgetType?.includes("winner") || widgetType === "confidence_decomposition") {
    statusLabel = "AWAITING DISCLOSURES";
    statusColor = "#8c96a6";
    icon = "📊";
    detailedDescription = "Winner branch scoring and relationship indicators are not available.";
  } else if (widgetType?.includes("migration") || widgetType?.includes("network")) {
    statusLabel = "MIGRATIONS UNAVAILABLE";
    statusColor = "#8c96a6";
    icon = "🔗";
    detailedDescription = "No capital migration metrics or network topology data are active.";
  } else if (widgetType?.includes("event") || widgetType === "catalyst_timeline") {
    statusLabel = "TIMELINE UNAVAILABLE";
    statusColor = "#8c96a6";
    icon = "📅";
    detailedDescription = "No event lead times or catalyst timelines have been synchronized.";
  } else if (
    widgetType === "position_action_queue" ||
    widgetType === "expected_value_distribution" ||
    widgetType?.includes("positions") ||
    widgetType?.startsWith("position") ||
    widgetType === "signal_decision_queue" ||
    widgetType === "shadow_scoreboard"
  ) {
    statusLabel = "NO ACTIVE POSITIONS";
    statusColor = "#8c96a6";
    icon = "💼";
    detailedDescription = "No active positions, sizing events, or decision queues have been loaded.";
  } else if (widgetType === "evidence_trace" || widgetType === "evidence_references" || widgetType?.includes("evidence")) {
    statusLabel = "EVIDENCE UNAVAILABLE";
    statusColor = "#8c96a6";
    icon = "🛡️";
    detailedDescription = "No validation evidence, backtest reports, or OOS indices have been synchronized.";
  }

  return (
    <div
      data-testid="chart-render-notice"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        minHeight: 120,
        background: "#121620",
        border: "1px solid #2a2e38",
        borderRadius: 6,
        padding: 12,
        textAlign: "center",
        color: "#f0ece4",
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: statusColor,
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {statusLabel}
      </div>
      <div style={{ fontSize: 11, color: "#c4ccda", maxWidth: 260, lineHeight: 1.4 }}>
        {detailedDescription}
      </div>
      {dataSource && (
        <div style={{ fontSize: 9, color: "#8c96a6", marginTop: 6 }}>
          Source: {dataSource}
        </div>
      )}
    </div>
  );
}

function MetricRenderer({ rows, spec }: { rows: ChartDataRow[]; spec: ChartSpecV1 }) {
  const valueField = firstField(spec, ["value", "y", "x"]);
  const labelField = firstField(spec, ["label", "x"]);
  const firstRow = rows[0];
  return (
    <div className="flex h-full min-h-[140px] flex-col justify-center gap-2" data-testid="chart-renderer-recharts">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{formatValue(valueFrom(firstRow, labelField) || chartTitle(spec))}</div>
      <div className="text-4xl font-semibold text-slate-900">{formatValue(valueFrom(firstRow, valueField))}</div>
    </div>
  );
}

function RechartsRenderer({ rows, spec, height }: { rows: ChartDataRow[]; spec: ChartSpecV1; height: number }) {
  if (spec.kind === "metric") {
    return <MetricRenderer rows={rows} spec={spec} />;
  }

  const xField = firstField(spec, ["x", "time", "label"], "label") ?? "label";
  const yField = firstField(spec, ["y", "value"], "value") ?? "value";
  const color = "#e8b750";
  const common = (
    <>
      <CartesianGrid stroke="#2a2e38" strokeDasharray="3 3" />
      <XAxis dataKey={xField} tick={{ fill: "#8c96a6", fontSize: 11 }} />
      <YAxis tick={{ fill: "#8c96a6", fontSize: 11 }} />
      <Tooltip contentStyle={{ background: "#171b22", borderColor: "#2a2e38", color: "#f0ece4" }} />
    </>
  );

  return (
    <div data-testid="chart-renderer-recharts" style={{ height }}>
      <ResponsiveContainer height="100%" width="100%">
        {spec.kind === "area" ? (
          <AreaChart data={rows}>
            {common}
            <Area dataKey={yField} fill="rgba(232, 183, 80, 0.12)" stroke={color} type="monotone" />
          </AreaChart>
        ) : spec.kind === "bar" ? (
          <BarChart data={rows}>
            {common}
            <Bar dataKey={yField} fill={color} />
          </BarChart>
        ) : (
          <LineChart data={rows}>
            {common}
            <Line dataKey={yField} dot={false} stroke={color} strokeWidth={2} type="monotone" />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function echartOptionFor(kind: ChartSpecKind, spec: ChartSpecV1, rows: ChartDataRow[]): EChartsOption {
  const xField = firstField(spec, ["x", "time", "label"], "x");
  const yField = firstField(spec, ["y", "value"], "y");
  const valueField = firstField(spec, ["value", "size", "y"], "value");
  const sourceField = firstField(spec, ["source"], "source");
  const targetField = firstField(spec, ["target"], "target");

  if (kind === "network" || kind === "sankey") {
    const nodes = new Map<string, { name: string }>();
    const links = rows.map((row) => {
      const source = textFrom(valueFrom(row, sourceField));
      const target = textFrom(valueFrom(row, targetField));
      if (source) nodes.set(source, { name: source });
      if (target) nodes.set(target, { name: target });
      return { source, target, value: numberFrom(valueFrom(row, valueField)) || 1 };
    }).filter((link) => link.source && link.target);
    return {
      tooltip: {},
      series: [
        kind === "sankey"
          ? { type: "sankey", data: [...nodes.values()], links }
          : { type: "graph", layout: "force", roam: false, data: [...nodes.values()], links },
      ],
    };
  }

  if (kind === "candlestick") {
    const open = firstField(spec, ["open"], "open");
    const high = firstField(spec, ["high"], "high");
    const low = firstField(spec, ["low"], "low");
    const close = firstField(spec, ["close"], "close");
    return {
      xAxis: { type: "category", data: rows.map((row) => textFrom(valueFrom(row, xField))) },
      yAxis: { scale: true },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "candlestick",
          data: rows.map((row) => [
            numberFrom(valueFrom(row, open)),
            numberFrom(valueFrom(row, close)),
            numberFrom(valueFrom(row, low)),
            numberFrom(valueFrom(row, high)),
          ]),
        },
      ],
    };
  }

  if (kind === "gauge") {
    return {
      series: [
        {
          type: "gauge",
          progress: { show: true },
          data: [{ value: numberFrom(valueFrom(rows[0], valueField)), name: chartTitle(spec) }],
        },
      ],
    };
  }

  if (kind === "heatmap") {
    return {
      xAxis: { type: "category" },
      yAxis: { type: "category" },
      visualMap: { min: 0, max: Math.max(...rows.map((row) => numberFrom(valueFrom(row, valueField))), 1) },
      tooltip: {},
      series: [
        {
          type: "heatmap",
          data: rows.map((row) => [
            textFrom(valueFrom(row, xField)),
            textFrom(valueFrom(row, yField)),
            numberFrom(valueFrom(row, valueField)),
          ]),
        },
      ],
    };
  }

  const sizeField = firstField(spec, ["size"], undefined);
  const maxSizeValue = sizeField
    ? Math.max(...rows.map((row) => numberFrom(valueFrom(row, sizeField))), 1)
    : 1;
  return {
    xAxis: { type: "value" },
    yAxis: { type: "value" },
    tooltip: { trigger: "item" },
    series: [
      {
        type: "scatter",
        symbolSize: sizeField
          ? (d: number[]) => Math.max(8, (d[2] / maxSizeValue) * 40)
          : 8,
        data: rows.map((row) => {
          const base: number[] = [numberFrom(valueFrom(row, xField)), numberFrom(valueFrom(row, yField))];
          if (sizeField) base.push(numberFrom(valueFrom(row, sizeField)));
          return base;
        }),
      },
    ],
  } as EChartsOption;
}

function EChartsRenderer({ rows, spec, height }: { rows: ChartDataRow[]; spec: ChartSpecV1; height: number }) {
  const option = useMemo(() => echartOptionFor(spec.kind, spec, rows), [rows, spec]);
  return (
    <div data-testid="chart-renderer-echarts">
      <ReactECharts lazyUpdate notMerge option={option} style={{ height }} />
    </div>
  );
}

function TableRenderer({ rows, spec }: { rows: ChartDataRow[]; spec: ChartSpecV1 }) {
  const fields = Object.values(spec.encodings)
    .map((encoding) => encoding.field)
    .filter((field, index, all): field is string => Boolean(field) && all.indexOf(field) === index);
  const columns = fields.length ? fields : Object.keys(rows[0] ?? {}).slice(0, 8);
  return (
    <div className="overflow-auto" data-testid="chart-renderer-builtin">
      <table className="w-full border-collapse text-left text-sm" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2e38" }}>
            {columns.map((column) => (
              <th className="px-2 py-1 font-semibold text-[#8c96a6]" key={column} style={{ padding: "6px 8px" }}>
                {column.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((row, rowIndex) => (
            <tr key={rowIndex} style={{ borderBottom: "1px solid #2a2e38" }}>
              {columns.map((column) => (
                <td className="px-2 py-1 text-[#f0ece4]" key={column} style={{ padding: "6px 8px" }}>
                  {formatValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineRenderer({ rows, spec }: { rows: ChartDataRow[]; spec: ChartSpecV1 }) {
  const timeField = firstField(spec, ["time", "x"], "time");
  const labelField = firstField(spec, ["label", "y"], "label");
  return (
    <ol className="space-y-2" data-testid="chart-renderer-builtin" style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {rows.slice(0, 25).map((row, index) => (
        <li className="rounded border border-[#2a2e38] bg-[#121620] px-3 py-2" key={index} style={{ marginBottom: 6 }}>
          <div className="text-xs text-[#8c96a6]">{formatValue(valueFrom(row, timeField))}</div>
          <div className="text-sm font-medium text-[#f0ece4]" style={{ marginTop: 2 }}>{formatValue(valueFrom(row, labelField))}</div>
        </li>
      ))}
    </ol>
  );
}

function StackedBarFallback({ rows, spec }: { rows: ChartDataRow[]; spec: ChartSpecV1 }) {
  const labelField = firstField(spec, ["x", "label"], "label");
  const valueField = firstField(spec, ["value", "y"], "value");
  const max = Math.max(...rows.map((row) => numberFrom(valueFrom(row, valueField))), 1);
  return (
    <div className="space-y-2" data-testid="chart-renderer-builtin">
      {rows.slice(0, 20).map((row, index) => {
        const value = numberFrom(valueFrom(row, valueField));
        return (
          <div className="grid grid-cols-[minmax(96px,1fr)_3fr_auto] items-center gap-2 text-sm" key={index} style={{ display: "grid", gridTemplateColumns: "100px 1fr 50px", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span className="truncate text-[#8c96a6]">{formatValue(valueFrom(row, labelField))}</span>
            <span className="h-2 rounded bg-[#2a2e38]" style={{ height: 8, background: "#2a2e38", borderRadius: 4, display: "block" }}>
              <span className="block h-2 rounded bg-[#e8b750]" style={{ height: 8, background: "#e8b750", borderRadius: 4, display: "block", width: `${Math.max((value / max) * 100, 2)}%` }} />
            </span>
            <span className="tabular-nums text-[#f0ece4]" style={{ textAlign: "right" }}>{formatValue(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function BuiltinChartRenderer({ rows, spec }: { rows: ChartDataRow[]; spec: ChartSpecV1 }) {
  if (spec.kind === "timeline") {
    return <TimelineRenderer rows={rows} spec={spec} />;
  }
  if (spec.kind === "stacked_bar") {
    return <StackedBarFallback rows={rows} spec={spec} />;
  }
  return <TableRenderer rows={rows} spec={spec} />;
}

function generateMockData(spec: ChartSpecV1): ChartDataRow[] {
  const kind = spec.kind;
  const xField = spec.encodings.x?.field || "x";
  const yField = spec.encodings.y?.field || "y";
  const valField = spec.encodings.value?.field || "value";
  const sourceField = spec.encodings.source?.field || "source";
  const targetField = spec.encodings.target?.field || "target";
  const openField = spec.encodings.open?.field || "open";
  const highField = spec.encodings.high?.field || "high";
  const lowField = spec.encodings.low?.field || "low";
  const closeField = spec.encodings.close?.field || "close";
  const timeField = spec.encodings.time?.field || "time";
  const labelField = spec.encodings.label?.field || "label";

  if (kind === "metric") {
    return [{ [labelField]: "Current Value", [valField]: 94 }];
  }

  if (kind === "network" || kind === "sankey") {
    return [
      { [sourceField]: "Stakeholder A", [targetField]: "Branch X", [valField]: 45 },
      { [sourceField]: "Stakeholder A", [targetField]: "Branch Y", [valField]: 20 },
      { [sourceField]: "Stakeholder B", [targetField]: "Branch X", [valField]: 30 },
      { [sourceField]: "Branch X", [targetField]: "Sleeve Alpha", [valField]: 65 },
      { [sourceField]: "Branch Y", [targetField]: "Sleeve Alpha", [valField]: 15 },
      { [sourceField]: "Branch Y", [targetField]: "Ledger 2", [valField]: 5 },
    ];
  }

  if (kind === "candlestick") {
    const data: ChartDataRow[] = [];
    let price = 150;
    for (let i = 0; i < 20; i++) {
      const change = (Math.random() - 0.48) * 4;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      price = close;
      data.push({
        [xField]: `07-${i + 1 < 10 ? "0" : ""}${i + 1}`,
        [openField]: open,
        [highField]: high,
        [lowField]: low,
        [closeField]: close,
      });
    }
    return data;
  }

  if (kind === "gauge") {
    return [{ [valField]: 78 }];
  }

  if (kind === "heatmap") {
    const branches = ["Branch A", "Branch B", "Branch C", "Branch D"];
    const dates = ["07-10", "07-11", "07-12", "07-13"];
    const data: ChartDataRow[] = [];
    branches.forEach((b) => {
      dates.forEach((d) => {
        data.push({
          [xField]: d,
          [yField]: b,
          [valField]: Math.floor(Math.random() * 100),
        });
      });
    });
    return data;
  }

  if (kind === "scatter") {
    const data: ChartDataRow[] = [];
    for (let i = 0; i < 20; i++) {
      data.push({
        [xField]: Math.random(),
        [yField]: (Math.random() - 0.2) * 5,
        size: Math.random() * 100 + 10,
        color: Math.floor(Math.random() * 4),
      });
    }
    return data;
  }

  if (kind === "timeline") {
    return [
      { [timeField]: "09:00", [labelField]: "Winner Branch V4 workspace generated by Servant" },
      { [timeField]: "09:15", [labelField]: "Insiders relationship probability network refreshed" },
      { [timeField]: "10:00", [labelField]: "Catalyst timeline checked: Earnings release on 07-28" },
      { [timeField]: "10:30", [labelField]: "Add/Reduce/Exit parameters synchronized with Paper loop" },
      { [timeField]: "10:42", [labelField]: "Latest trade event: Symbol TX approved by trader" },
    ];
  }

  const data: ChartDataRow[] = [];
  const fields = Object.values(spec.encodings).map((e) => e.field).filter(Boolean);
  const labels = ["TX", "AAPL", "MSFT", "GOOG", "TSLA", "NVDA", "AMZN", "META", "NFLX", "AMD"];
  for (let i = 0; i < 10; i++) {
    const row: ChartDataRow = {};
    fields.forEach((f) => {
      if (f === xField || f === labelField) {
        row[f] = labels[i % labels.length];
      } else if (f === yField || f === valField) {
        row[f] = Math.floor(Math.random() * 80) + 20;
      } else {
        row[f] = Math.floor(Math.random() * 100);
      }
    });
    if (!row[xField]) row[xField] = `Item ${i + 1}`;
    if (!row[yField]) row[yField] = Math.floor(Math.random() * 100);
    data.push(row);
  }
  return data;
}

export interface ChartSpecRendererProps {
  spec: ChartSpecV1;
  data?: ChartDataRow[];
  height?: number;
  onInteraction?: (interaction: ChartInteraction) => void;
  widgetType?: string;
  dataSource?: string;
  dataAvailability?: string;
  isSampleData?: boolean;
}

export function ChartSpecRenderer({
  spec,
  data,
  height = 260,
  onInteraction,
  widgetType,
  dataSource,
  dataAvailability,
  isSampleData = false,
}: ChartSpecRendererProps) {
  const validationMessage = validateChartSpecForRendering(spec);
  if (validationMessage) {
    return <ChartNotice message={validationMessage} widgetType={widgetType} dataSource={dataSource} />;
  }

  const isUnavailable = dataAvailability === "unavailable" || (dataAvailability === "partial" && data && data.length === 0);
  const rawData = data === undefined && !isUnavailable && isSampleData ? generateMockData(spec) : data;
  const rows = asRows(rawData);
  const renderer = chartRendererForKind(spec.kind);

  return (
    <ChartFrame interaction={spec.click_action} onInteraction={onInteraction} isSampleData={isSampleData}>
      {isUnavailable || rows.length === 0 ? (
        <ChartNotice
          message="No chart data is available for this WidgetSpec."
          widgetType={widgetType}
          dataSource={dataSource}
        />
      ) : renderer === "recharts" ? (
        <RechartsRenderer height={height} rows={rows} spec={spec} />
      ) : renderer === "echarts" ? (
        <EChartsRenderer height={height} rows={rows} spec={spec} />
      ) : (
        <BuiltinChartRenderer rows={rows} spec={spec} />
      )}
    </ChartFrame>
  );
}

export default ChartSpecRenderer;
