import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BarChart3, RefreshCw, Layers, TrendingUp, ShieldAlert, ArrowUpDown } from "lucide-react";
import {
  getTradingRoomPerformanceAttribution,
  type TradingRoomPerformanceAttributionDimension,
  type TradingRoomPerformanceAttributionQuery,
  type TradingRoomPerformanceAttributionResponse,
  type TradingRoomPerformanceAttributionRow,
  type TradingRoomPerformanceAttributionSummary,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError } from "@/lib/bff-v1/errors";
import { cn } from "@/lib/utils";

export interface AttributionReportViewProps {
  strategyId?: string;
  initialDimension?: TradingRoomPerformanceAttributionDimension;
  initialPeriod?: string;
  onDimensionChange?: (dimension: TradingRoomPerformanceAttributionDimension) => void;
  onPeriodChange?: (period: string) => void;
  showControls?: boolean;
  className?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; data: TradingRoomPerformanceAttributionResponse }
  | { status: "error"; message: string };

const DIMENSIONS: { value: TradingRoomPerformanceAttributionDimension; labelKey: string; fallback: string }[] = [
  { value: "strategy", labelKey: "agora.tradingRoom.attribution.dimensions.strategy", fallback: "Strategy" },
  { value: "persona", labelKey: "agora.tradingRoom.attribution.dimensions.persona", fallback: "Persona" },
  { value: "asset_class", labelKey: "agora.tradingRoom.attribution.dimensions.assetClass", fallback: "Asset Class" },
  { value: "model", labelKey: "agora.tradingRoom.attribution.dimensions.model", fallback: "Model" },
  { value: "market_session", labelKey: "agora.tradingRoom.attribution.dimensions.marketSession", fallback: "Market Session" },
];

const PERIODS = [
  { value: "latest", labelKey: "agora.tradingRoom.attribution.periods.latest", fallback: "Latest" },
  { value: "1d", labelKey: "agora.tradingRoom.attribution.periods.1d", fallback: "1 Day" },
  { value: "7d", labelKey: "agora.tradingRoom.attribution.periods.7d", fallback: "7 Days" },
  { value: "30d", labelKey: "agora.tradingRoom.attribution.periods.30d", fallback: "30 Days" },
  { value: "90d", labelKey: "agora.tradingRoom.attribution.periods.90d", fallback: "90 Days" },
  { value: "ytd", labelKey: "agora.tradingRoom.attribution.periods.ytd", fallback: "YTD" },
  { value: "1y", labelKey: "agora.tradingRoom.attribution.periods.1y", fallback: "1 Year" },
];

function formatPercent(value: number | undefined | null, showSign = true): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  const sign = showSign && normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(2)}%`;
}

function formatRatio(value: number | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function formatTimestamp(value: string | undefined | null, locale = "en-US"): string {
  if (!value) return "not reported";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  });
}

export function AttributionReportView({
  strategyId,
  initialDimension = "strategy",
  initialPeriod = "latest",
  onDimensionChange,
  onPeriodChange,
  showControls = true,
  className,
}: AttributionReportViewProps): JSX.Element {
  const { i18n, t } = useTranslation();
  const [dimension, setDimension] = useState<TradingRoomPerformanceAttributionDimension>(initialDimension);
  const [period, setPeriod] = useState<string>(initialPeriod);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortField, setSortField] = useState<keyof TradingRoomPerformanceAttributionRow["metrics"] | "rank" | "label">("rank");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadState({ status: "loading" });

    const query: TradingRoomPerformanceAttributionQuery = {
      dimension,
      pageSize: 50,
      period,
    };

    getTradingRoomPerformanceAttribution(query)
      .then((res) => {
        if (cancelled) return;
        setLoadState({ data: res, status: "loaded" });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof BffError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "Attribution unavailable";
        setLoadState({ message: msg, status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [dimension, period, refreshKey]);

  const handleDimensionSelect = (nextDim: TradingRoomPerformanceAttributionDimension) => {
    setDimension(nextDim);
    onDimensionChange?.(nextDim);
  };

  const handlePeriodSelect = (nextPeriod: string) => {
    setPeriod(nextPeriod);
    onPeriodChange?.(nextPeriod);
  };

  const handleSort = (field: keyof TradingRoomPerformanceAttributionRow["metrics"] | "rank" | "label") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "rank" || field === "label");
    }
  };

  return (
    <div
      className={cn("flex flex-col flex-1 min-h-0 bg-[#111417] text-[#f0ece4]", className)}
      data-testid="attribution-report-view"
    >
      {showControls && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#2a2e38] bg-[#171b22]"
          data-testid="attribution-report-controls"
        >
          <div className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="w-4 h-4 text-[#e8b750]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#8c96a6]">
              {t("agora.tradingRoom.attribution.title", { defaultValue: "Performance Attribution" })}
            </span>
            {strategyId && (
              <span className="text-xs text-[#8c96a6]">
                · {t("agora.tradingRoom.attribution.strategy", { defaultValue: "Strategy" })}: <span className="text-[#f0ece4] font-medium">{strategyId}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Dimension switcher */}
            <div
              aria-label={t("agora.tradingRoom.attribution.dimensionSelect", { defaultValue: "Attribution Dimension" })}
              className="flex items-center rounded-md border border-[#2a2e38] bg-[#1a2030] p-0.5"
              data-testid="attribution-dimension-switcher"
              role="radiogroup"
            >
              {DIMENSIONS.map((dim) => {
                const selected = dimension === dim.value;
                return (
                  <button
                    aria-checked={selected}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                      selected ? "bg-[#e8b750] text-[#111417] font-bold" : "text-[#c5cad2] hover:text-[#f0ece4]",
                    )}
                    data-testid={`attribution-dimension-${dim.value}`}
                    key={dim.value}
                    onClick={() => handleDimensionSelect(dim.value)}
                    role="radio"
                    type="button"
                  >
                    {t(dim.labelKey, { defaultValue: dim.fallback })}
                  </button>
                );
              })}
            </div>

            {/* Period switcher */}
            <select
              aria-label={t("agora.tradingRoom.attribution.periodSelect", { defaultValue: "Attribution Period" })}
              className="h-7 rounded border border-[#2a2e38] bg-[#1a2030] px-2 text-xs text-[#c5cad2]"
              data-testid="attribution-period-select"
              onChange={(e) => handlePeriodSelect(e.target.value)}
              value={period}
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.labelKey, { defaultValue: p.fallback })}
                </option>
              ))}
            </select>

            {/* Refresh */}
            <button
              aria-label={t("agora.tradingRoom.attribution.refresh", { defaultValue: "Refresh attribution" })}
              className="inline-flex items-center justify-center h-7 w-7 rounded border border-[#2a2e38] bg-[#1a2030] text-[#c5cad2] hover:text-[#f0ece4]"
              data-testid="attribution-refresh-button"
              onClick={() => setRefreshKey((k) => k + 1)}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {loadState.status === "loading" && (
        <div
          className="flex flex-1 items-center justify-center text-xs text-[#8c96a6]"
          data-testid="attribution-loading"
        >
          {t("agora.tradingRoom.attribution.loading", { defaultValue: "Loading performance attribution report…" })}
        </div>
      )}

      {loadState.status === "error" && (
        <div
          className="flex flex-col items-center justify-center flex-1 p-6 text-center"
          data-testid="attribution-error"
        >
          <AlertTriangle aria-hidden="true" className="w-8 h-8 text-rose-400 mb-2" />
          <p className="text-sm font-semibold text-rose-200">
            {t("agora.tradingRoom.attribution.errorTitle", { defaultValue: "Unable to load attribution report" })}
          </p>
          <p className="text-xs text-rose-300/80 mt-1 max-w-md">{loadState.message}</p>
          <button
            className="mt-4 px-3 py-1.5 rounded border border-[#2a2e38] bg-[#171b22] text-xs font-semibold text-[#f0ece4] hover:bg-[#1a2030]"
            data-testid="attribution-retry-button"
            onClick={() => setRefreshKey((k) => k + 1)}
            type="button"
          >
            {t("agora.tradingRoom.attribution.retry", { defaultValue: "Retry" })}
          </button>
        </div>
      )}

      {loadState.status === "loaded" && (
        <AttributionReportContent
          data={loadState.data}
          dimension={dimension}
          handleSort={handleSort}
          period={period}
          sortAsc={sortAsc}
          sortField={sortField}
        />
      )}
    </div>
  );
}

interface AttributionReportContentProps {
  data: TradingRoomPerformanceAttributionResponse;
  dimension: TradingRoomPerformanceAttributionDimension;
  period: string;
  sortField: keyof TradingRoomPerformanceAttributionRow["metrics"] | "rank" | "label";
  sortAsc: boolean;
  handleSort: (field: keyof TradingRoomPerformanceAttributionRow["metrics"] | "rank" | "label") => void;
}

function AttributionReportContent({
  data,
  dimension,
  period,
  sortField,
  sortAsc,
  handleSort,
}: AttributionReportContentProps): JSX.Element {
  const { i18n, t } = useTranslation();
  const summary: TradingRoomPerformanceAttributionSummary | undefined = data.data?.summary;
  const items: TradingRoomPerformanceAttributionRow[] = data.data?.items ?? [];
  const meta = data.meta;

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let valA: unknown;
      let valB: unknown;
      if (sortField === "rank") {
        valA = a.rank ?? 999;
        valB = b.rank ?? 999;
      } else if (sortField === "label") {
        valA = a.label || a.dimension_key;
        valB = b.label || b.dimension_key;
      } else {
        valA = a.metrics?.[sortField];
        valB = b.metrics?.[sortField];
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA ?? "").localeCompare(String(valB ?? ""))
        : String(valB ?? "").localeCompare(String(valA ?? ""));
    });
  }, [items, sortField, sortAsc]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto p-4 gap-4" data-testid="attribution-content">
      {/* Summary KPI Cards */}
      {summary && (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3"
          data-testid="attribution-summary-kpis"
        >
          <div className="rounded-lg border border-[#2a2e38] bg-[#171b22] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c96a6]">
              {t("agora.tradingRoom.attribution.summary.totalReturn", { defaultValue: "Total Return" })}
            </div>
            <div className={cn("mt-1 text-lg font-bold", (summary.total_return ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {formatPercent(summary.total_return)}
            </div>
            <div className="text-[10px] text-[#8c96a6] mt-0.5">
              Bench: {formatPercent(summary.benchmark_return)}
            </div>
          </div>

          <div className="rounded-lg border border-[#2a2e38] bg-[#171b22] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c96a6]">
              {t("agora.tradingRoom.attribution.summary.activeReturn", { defaultValue: "Active Return" })}
            </div>
            <div className={cn("mt-1 text-lg font-bold", (summary.active_return ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {formatPercent(summary.active_return)}
            </div>
            <div className="text-[10px] text-[#8c96a6] mt-0.5">
              Alpha: {formatPercent(summary.alpha)}
            </div>
          </div>

          <div className="rounded-lg border border-[#2a2e38] bg-[#171b22] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c96a6]">
              {t("agora.tradingRoom.attribution.summary.sharpeRatio", { defaultValue: "Sharpe Ratio" })}
            </div>
            <div className="mt-1 text-lg font-bold text-[#f0ece4]">
              {formatRatio(summary.sharpe_ratio)}
            </div>
            <div className="text-[10px] text-[#8c96a6] mt-0.5">
              IR: {formatRatio(summary.information_ratio)}
            </div>
          </div>

          <div className="rounded-lg border border-[#2a2e38] bg-[#171b22] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c96a6]">
              {t("agora.tradingRoom.attribution.summary.winRate", { defaultValue: "Win Rate" })}
            </div>
            <div className="mt-1 text-lg font-bold text-[#f0ece4]">
              {formatPercent(summary.win_rate, false)}
            </div>
            <div className="text-[10px] text-[#8c96a6] mt-0.5">
              Items: {summary.item_count ?? items.length}
            </div>
          </div>

          <div className="rounded-lg border border-[#2a2e38] bg-[#171b22] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c96a6]">
              {t("agora.tradingRoom.attribution.summary.maxDrawdown", { defaultValue: "Max Drawdown" })}
            </div>
            <div className="mt-1 text-lg font-bold text-amber-400">
              {formatPercent(summary.max_drawdown, false)}
            </div>
            <div className="text-[10px] text-[#8c96a6] mt-0.5">
              Turnover: {formatRatio(summary.turnover)}x
            </div>
          </div>

          <div className="rounded-lg border border-[#2a2e38] bg-[#171b22] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c96a6]">
              {t("agora.tradingRoom.attribution.summary.asOf", { defaultValue: "As Of" })}
            </div>
            <div className="mt-1 text-xs font-semibold text-[#c5cad2]">
              {formatTimestamp(summary.as_of || meta?.as_of, i18n.resolvedLanguage)}
            </div>
            <div className="text-[10px] text-[#8c96a6] mt-0.5 uppercase">
              {meta?.status ?? "verified"}
            </div>
          </div>
        </div>
      )}

      {/* Attribution Table */}
      <div className="rounded-lg border border-[#2a2e38] bg-[#171b22] overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-[#2a2e38] flex items-center justify-between text-xs font-semibold">
          <span className="text-[#f0ece4]">
            {t("agora.tradingRoom.attribution.tableTitle", {
              count: items.length,
              defaultValue: "Dimension Breakdown ({{count}} items)",
            })}
          </span>
          <span className="text-[#8c96a6]">
            Dimension: <span className="text-[#e8b750] uppercase">{dimension}</span> · Period: <span className="text-[#e8b750] uppercase">{period}</span>
          </span>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#8c96a6]" data-testid="attribution-table-empty">
            {t("agora.tradingRoom.attribution.empty", { defaultValue: "No performance attribution rows are available for this dimension/period." })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" data-testid="attribution-table">
              <thead>
                <tr className="border-b border-[#2a2e38] bg-[#1a2030] text-[#8c96a6]">
                  <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => handleSort("rank")}>
                    <div className="flex items-center gap-1">
                      <span>#</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold cursor-pointer select-none" onClick={() => handleSort("label")}>
                    <div className="flex items-center gap-1">
                      <span>{t("agora.tradingRoom.attribution.columns.label", { defaultValue: "Label / Key" })}</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("total_return")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{t("agora.tradingRoom.attribution.columns.totalReturn", { defaultValue: "Return" })}</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("benchmark_return")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{t("agora.tradingRoom.attribution.columns.benchmarkReturn", { defaultValue: "Benchmark" })}</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("active_return")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{t("agora.tradingRoom.attribution.columns.activeReturn", { defaultValue: "Active" })}</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("sharpe_ratio")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Sharpe</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("win_rate")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Win Rate</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("max_drawdown")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Max DD</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("risk_contribution")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Risk Contrib</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e38]">
                {sortedItems.map((row) => {
                  const m = row.metrics ?? {};
                  const isPositiveReturn = (m.total_return ?? 0) >= 0;
                  const isActivePositive = (m.active_return ?? 0) >= 0;
                  return (
                    <tr
                      className="hover:bg-[#1a2030]/60 transition-colors"
                      data-testid={`attribution-row-${row.id}`}
                      key={row.id}
                    >
                      <td className="py-2.5 px-3 text-[#8c96a6] font-mono">{row.rank ?? "—"}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#f0ece4]">{row.label || row.dimension_key}</div>
                        <div className="text-[10px] text-[#8c96a6] font-mono">{row.dimension_key}</div>
                      </td>
                      <td className={cn("py-2.5 px-3 text-right font-semibold font-mono", isPositiveReturn ? "text-emerald-400" : "text-rose-400")}>
                        {formatPercent(m.total_return)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#8c96a6] font-mono">
                        {formatPercent(m.benchmark_return)}
                      </td>
                      <td className={cn("py-2.5 px-3 text-right font-semibold font-mono", isActivePositive ? "text-emerald-400" : "text-rose-400")}>
                        {formatPercent(m.active_return)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#f0ece4] font-mono">
                        {formatRatio(m.sharpe_ratio)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#f0ece4] font-mono">
                        {formatPercent(m.win_rate)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-400 font-mono">
                        {formatPercent(m.max_drawdown)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#8c96a6] font-mono">
                        {formatPercent(m.risk_contribution)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provenance and Surface Metadata */}
      {meta && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md border border-[#2a2e38] bg-[#171b22] text-[11px] text-[#8c96a6]"
          data-testid="attribution-provenance"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-[#e8b750]" />
            <span>
              {t("agora.tradingRoom.attribution.surfaces", { defaultValue: "Sources" })}:{" "}
              {meta.composition_sources?.join(", ") || "agora_engine, telemetry_aggregator"}
            </span>
          </div>
          <div className="text-[10px]">
            As of: {formatTimestamp(meta.as_of, i18n.resolvedLanguage)} · Status: <span className="font-semibold text-[#f0ece4] uppercase">{meta.status ?? "ready"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
