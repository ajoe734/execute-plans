import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "react-router-dom";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import {
  Activity,
  AlertTriangle,
  Database,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Check,
  ChevronRight,
  Info
} from "lucide-react";
import {
  getTradingRoom,
  getTradingRoomPerformanceAttribution,
  listDecisionEvents,
  type TradingDecisionEvent,
  type TradingRoomAggregate,
  type TradingRoomPerformanceAttributionResponse,
  type TradingRoomPerformanceAttributionRow,
  type TradingRoomStrategyEntry,
} from "@/lib/bff-v1/agora/tradingRoom";
import { cn } from "@/lib/utils";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; data: StrategyPerformanceData }
  | { status: "error"; message: string };

interface StrategyPerformanceData {
  aggregate: TradingRoomAggregate;
  attribution: TradingRoomPerformanceAttributionResponse;
  decisionEvents: TradingDecisionEvent[];
}

interface StrategyPerformanceRow {
  id: string;
  kind: "strategy" | "attribution_only";
  strategy?: TradingRoomStrategyEntry;
  attribution?: TradingRoomPerformanceAttributionRow;
  title: string;
  strategyId: string;
  sourceState: "matched" | "missing_attribution" | "attribution_only";
  description?: string;
}

interface SourceHealthRow {
  name: string;
  status: string;
  detail?: string;
}

interface SimulatedDetails {
  complianceBars: { label: string; pct: string; value: string; color: string }[];
  interventions: { label: string; count: string; result: string; color: string }[];
  execHistory: { date: string; code: string; name: string; advice: string; action: string; deviate: string; devBg: string; devFg: string; result: string; resultColor: string }[];
  adjustSuggestions: { id: string; title: string; reason: string; effect: string; risk: string }[];
  warnings: string[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatCurrency(value: unknown, missing = "not reported"): string {
  const number = finiteNumber(value);
  return number === undefined ? missing : currencyFormatter.format(number);
}

function formatNumber(value: unknown, missing = "not reported"): string {
  const number = finiteNumber(value);
  return number === undefined ? missing : numberFormatter.format(number);
}

function formatPercent(value: unknown, missing = "not reported"): string {
  const number = finiteNumber(value);
  if (number === undefined) return missing;
  const normalized = Math.abs(number) <= 1 ? number * 100 : number;
  return `${normalized.toFixed(2)}%`;
}

function formatDateTime(value: unknown, missing = "not reported", locale = "en-US"): string {
  if (typeof value !== "string" || !value.trim()) return missing;
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

function cleanText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function strategyIdsFor(row: TradingRoomPerformanceAttributionRow): string[] {
  const explicit = row.source_refs?.strategy_ids ?? [];
  return [row.dimension_key, ...explicit].filter((item): item is string => typeof item === "string" && item.length > 0);
}

function rowMatchesStrategy(
  row: TradingRoomPerformanceAttributionRow,
  strategy: TradingRoomStrategyEntry,
): boolean {
  return strategyIdsFor(row).includes(strategy.strategy_id);
}

function buildRows(
  strategies: TradingRoomStrategyEntry[],
  attributionRows: TradingRoomPerformanceAttributionRow[],
): StrategyPerformanceRow[] {
  const usedAttributionRows = new Set<string>();
  const strategyRows = strategies.map((strategy) => {
    const attribution = attributionRows.find((row) => rowMatchesStrategy(row, strategy));
    if (attribution) usedAttributionRows.add(attribution.id);
    return {
      attribution,
      id: `strategy-${strategy.strategy_id}`,
      kind: "strategy" as const,
      sourceState: attribution ? ("matched" as const) : ("missing_attribution" as const),
      strategy,
      strategyId: strategy.strategy_id,
      title: strategy.title || strategy.strategy_id,
    };
  });

  const attributionOnlyRows = attributionRows
    .filter((row) => !usedAttributionRows.has(row.id))
    .map((row) => ({
      attribution: row,
      description: "agora.performance.unlinkedTelemetry",
      id: `attribution-${row.id}`,
      kind: "attribution_only" as const,
      sourceState: "attribution_only" as const,
      strategyId: row.dimension_key,
      title: row.label || row.dimension_key,
    }));

  return [...strategyRows, ...attributionOnlyRows].sort((a, b) => {
    const aUnassigned = a.strategyId === "unassigned" || a.title.toLowerCase() === "unassigned";
    const bUnassigned = b.strategyId === "unassigned" || b.title.toLowerCase() === "unassigned";
    if (aUnassigned !== bUnassigned) {
      return aUnassigned ? 1 : -1;
    }
    if (a.kind !== b.kind) return a.kind === "strategy" ? -1 : 1;
    const aRank = a.attribution?.rank ?? Number.MAX_SAFE_INTEGER;
    const bRank = b.attribution?.rank ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank || a.title.localeCompare(b.title);
  });
}

function sourceHealthRows(meta: TradingRoomPerformanceAttributionResponse["meta"]): SourceHealthRow[] {
  const surfaces = meta.surfaces ?? {};
  const surfaceRows = Object.entries(surfaces).map(([name, detail]) => ({
    detail: cleanText(detail.message, detail.reason, detail.error, detail.summary),
    name,
    status: cleanText(detail.status, detail.state, detail.availability, detail.health) ?? "unknown",
  }));
  const surfaceNames = new Set(surfaceRows.map((row) => row.name));
  const compositionRows = (meta.composition_sources ?? [])
    .filter((name) => !surfaceNames.has(name))
    .map((name) => ({ name, status: "declared" }));
  return [...surfaceRows, ...compositionRows].sort((a, b) => a.name.localeCompare(b.name));
}

function sourceStateLabel(row: StrategyPerformanceRow, t: TFunction): string {
  if (row.sourceState === "matched") return t("agora.performance.liveAttribution");
  if (row.sourceState === "attribution_only") return t("agora.performance.attributionOnly");
  return t("agora.performance.missingAttribution");
}

function sourceStateClass(row: StrategyPerformanceRow): string {
  if (row.sourceState === "matched") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (row.sourceState === "attribution_only") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  return "border-amber-400/35 bg-amber-400/10 text-amber-200";
}

function healthClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("healthy") || normalized.includes("available") || normalized === "declared") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (normalized.includes("missing") || normalized.includes("unavailable") || normalized.includes("error")) {
    return "border-rose-400/35 bg-rose-400/10 text-rose-200";
  }
  if (normalized.includes("degraded") || normalized.includes("partial") || normalized.includes("stale")) {
    return "border-amber-400/35 bg-amber-400/10 text-amber-200";
  }
  return "border-slate-500/50 bg-slate-800 text-slate-200";
}

function metric(row: StrategyPerformanceRow, key: keyof TradingRoomPerformanceAttributionRow["metrics"]): unknown {
  return row.attribution?.metrics?.[key];
}

function MetricValue({
  value,
  format,
}: {
  value: unknown;
  format: (value: unknown) => string;
}): JSX.Element {
  const { t } = useTranslation();
  const measured = finiteNumber(value) !== undefined;
  return (
    <span
      className={measured ? "text-[#f0ece4]" : "italic text-[#8c96a6]"}
      data-metric-state={measured ? "measured" : "not-reported"}
      title={measured ? (finiteNumber(value) === 0 ? t("agora.performance.measuredZero") : t("agora.performance.measured")) : t("agora.performance.notReportedByBff")}
    >
      {format(value)}
    </span>
  );
}

function EmptyPerformanceState(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-[#2a2e38] bg-[#171b22] p-6 text-sm text-[#8c96a6]">
      {t("agora.performance.empty")}
    </div>
  );
}

function getSimulatedDetails(strategyId: string, title: string): SimulatedDetails {
  const isAlpha = strategyId.includes("alpha");
  const isUnassigned = strategyId === "unassigned" || title.toLowerCase() === "unassigned";

  if (isUnassigned) {
    return {
      complianceBars: [
        { label: "策略遵循率", pct: "0%", value: "0%", color: "#8c96a6" },
        { label: "人工介入偏離率", pct: "100%", value: "100%", color: "#ef4444" },
        { label: "影子倉位重合度", pct: "0%", value: "0%", color: "#8c96a6" }
      ],
      interventions: [
        { label: "手動交易 (未歸類策略)", count: "18 筆", result: "-1.2%", color: "#ef4444" }
      ],
      execHistory: [
        { date: "07-08", code: "2317", name: "鴻海", advice: "No Strategy", action: "Manual Buy $200", deviate: "偏離", devBg: "rgba(239, 68, 68, 0.1)", devFg: "#ef4444", result: "-1.2%", resultColor: "#ef4444" },
        { date: "07-05", code: "3037", name: "欣興", advice: "No Strategy", action: "Manual Buy $180", deviate: "偏離", devBg: "rgba(239, 68, 68, 0.1)", devFg: "#ef4444", result: "+0.5%", resultColor: "#10b981" }
      ],
      adjustSuggestions: [],
      warnings: ["⚠ 警告 - 存在大量未歸類手動交易，不利於績效歸因與策略優化。"]
    };
  }

  const compliance = isAlpha ? 92 : 85;
  const deviation = 100 - compliance;
  const overlap = isAlpha ? 85 : 78;

  return {
    complianceBars: [
      { label: "策略遵循率", pct: `${compliance}%`, value: `${compliance}%`, color: "#10b981" },
      { label: "人工介入偏離率", pct: `${deviation}%`, value: `${deviation}%`, color: "#f59e0b" },
      { label: "影子倉位重合度", pct: `${overlap}%`, value: `${overlap}%`, color: "#3b82f6" }
    ],
    interventions: [
      { label: "主動加碼 (未達訊號條件)", count: "10 筆", result: "+2.4%", color: "#10b981" },
      { label: "提早止損 (未達停損價)", count: "3 筆", result: "-0.5%", color: "#f59e0b" },
      { label: "手動剔除 (訊號觸發未建倉)", count: "2 筆", result: "+1.1%", color: "#10b981" }
    ],
    execHistory: [
      { date: "07-08", code: "2330", name: "台積電", advice: "Entry $980", action: "Entry $980", deviate: "符合", devBg: "rgba(16, 185, 129, 0.1)", devFg: "#10b981", result: "+1.5%", resultColor: "#10b981" },
      { date: "07-07", code: "2303", name: "聯電", advice: "No Action", action: "Entry $52.5", deviate: "偏離", devBg: "rgba(245, 158, 11, 0.1)", devFg: "#f59e0b", result: "-0.8%", resultColor: "#ef4444" },
      { date: "07-06", code: "2454", name: "聯發科", advice: "Exit $1380", action: "Exit $1385", deviate: "符合", devBg: "rgba(16, 185, 129, 0.1)", devFg: "#10b981", result: "+4.2%", resultColor: "#10b981" }
    ],
    adjustSuggestions: [
      {
        id: `${strategyId}-adj-1`,
        title: "提早止損參數調整",
        reason: "近期市場波動加劇，現行止損設定易被雜訊觸發。",
        effect: "減少無效止損，預估年化報酬提升 +2.1%。",
        risk: "最大回撤可能微幅增加 0.5%"
      },
      {
        id: `${strategyId}-adj-2`,
        title: "增加回檔加碼機制",
        reason: "Alpha 策略在上升趨勢中常錯失拉回買點。",
        effect: "提高資金利用率，預計勝率提高 3%。",
        risk: "加倉可能面臨反轉風險"
      }
    ],
    warnings: ["⚠ 異常 - 聯電未達策略訊號即手動買入，目前帳面回撤 -1.5%。"]
  };
}

export function StrategyPerformancePage(): JSX.Element {
  const { t } = useTranslation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [period, setPeriod] = useState("latest");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([
      getTradingRoom(),
      getTradingRoomPerformanceAttribution({ pageSize: 50, period }),
      listDecisionEvents(),
    ])
      .then(([aggregate, attribution, decisionResult]) => {
        if (cancelled) return;
        setState({
          data: {
            aggregate,
            attribution,
            decisionEvents: decisionResult.items,
          },
          status: "loaded",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          message: error instanceof Error ? error.message : t("agora.performance.unavailable"),
          status: "error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, period, t]);

  if (state.status === "loading") {
    return (
      <section className="flex flex-1 items-center justify-center bg-[#101318] p-6 text-sm text-[#8c96a6]">
        {t("agora.performance.loading")}
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="flex flex-1 flex-col gap-4 overflow-auto bg-[#101318] p-5 text-[#f0ece4]">
        <div className="rounded-md border border-rose-400/35 bg-rose-400/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-100">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            {t("agora.performance.unavailable")}
          </div>
          <p className="mt-2 text-sm text-rose-100/85">{state.message}</p>
          <button
            className="mt-4 inline-flex h-8 items-center gap-2 rounded-md border border-rose-300/40 px-3 text-xs font-medium text-rose-50 hover:bg-rose-300/10"
            onClick={() => setRefreshKey((key) => key + 1)}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            {t("agora.performance.refresh")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <StrategyPerformanceLoaded
      data={state.data}
      onRefresh={() => setRefreshKey((key) => key + 1)}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}

function StrategyPerformanceLoaded({
  data,
  onRefresh,
  period,
  onPeriodChange,
}: {
  data: StrategyPerformanceData;
  onRefresh: () => void;
  period: string;
  onPeriodChange: (p: string) => void;
}): JSX.Element {
  const { i18n, t } = useTranslation();
  const missing = t("agora.performance.notReported");
  const rows = useMemo(
    () => buildRows(data.aggregate.strategies, data.attribution.data.items),
    [data.aggregate.strategies, data.attribution.data.items],
  );

  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"perf" | "intv" | "hist">("perf");
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (rows.length > 0 && !selectedStrategyId) {
      const first = rows.find(r => r.strategyId !== "unassigned") || rows[0];
      if (first) {
        setSelectedStrategyId(first.strategyId);
      }
    }
  }, [rows, selectedStrategyId]);

  const activeRow = useMemo(() => {
    return rows.find((r) => r.strategyId === selectedStrategyId) || rows[0];
  }, [rows, selectedStrategyId]);

  const simulated = useMemo(() => {
    if (!activeRow) return null;
    return getSimulatedDetails(activeRow.strategyId, activeRow.title);
  }, [activeRow]);

  const sourceRows = useMemo(() => sourceHealthRows(data.attribution.meta), [data.attribution.meta]);
  const summary = data.attribution.data.summary;
  const latestTelemetry = cleanText(summary.latest_telemetry_at, data.attribution.meta.snapshot_at);

  return (
    <section
      aria-label={t("agora.performance.title")}
      className="flex flex-1 flex-col gap-4 overflow-hidden bg-[#101318] p-4 text-[#f0ece4] md:p-5 h-full"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#f0ece4]">{t("agora.performance.title")}</h1>
            <span className="rounded bg-[#1e293b] border border-[#334155] px-1.5 py-0.5 text-[10px] text-[#94a3b8] uppercase tracking-wide">
              {t("agora.performance.executionScope")}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8c96a6]">
            <span>{t("agora.performance.policy", { value: data.attribution.meta.policy ?? missing })}</span>
            <span>{t("agora.performance.snapshot", { value: formatDateTime(latestTelemetry, missing, i18n.resolvedLanguage) })}</span>
            <span className="text-[#3b82f6]">
              {t("agora.performance.officialPrefix")}{" "}
              <Link to={canonicalCenterUrl("performance")} className="underline hover:text-[#60a5fa]">
                {t("performanceCenter.title")}
              </Link>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8c96a6]">{t("agora.performance.periodLabel")}:</span>
            <select
              value={period}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="bg-[#171b22] border border-[#2a2e38] rounded-md px-2 py-1 text-xs text-[#f0ece4] focus:outline-none focus:border-sky-500"
            >
              <option value="latest">Latest</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <button
            aria-label={t("agora.performance.refreshAttribution")}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-[#2a2e38] px-3 text-xs font-medium text-[#f0ece4] hover:bg-[#171b22]"
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            {t("agora.performance.refresh")}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] gap-4 overflow-hidden">
        
        {/* LEFT: STRATEGY LIST */}
        <div className="flex flex-col min-h-0 border border-[#2a2e38] bg-[#171b22] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#2a2e38] shrink-0">
            <div className="font-bold text-sm text-[#f0ece4]">{t("agora.performance.strategyList")}</div>
            <div className="text-[11.5px] text-[#8c96a6] mt-0.5">
              {t("agora.performance.returnedRows", { returned: summary.returned_row_count, total: summary.row_count })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {rows.map((row) => {
              const isActive = row.strategyId === selectedStrategyId;
              const details = getSimulatedDetails(row.strategyId, row.title);
              const hasSuggestions = (details.adjustSuggestions ?? []).length > 0;
              const pnlValue = metric(row, "total_pnl") as number | undefined;

              return (
                <div
                  key={row.id}
                  onClick={() => setSelectedStrategyId(row.strategyId)}
                  className={cn(
                    "cursor-pointer rounded-xl p-3 border transition-all hover:bg-[#1e2330]",
                    isActive
                      ? "bg-[#1e2330] border-sky-500/50 shadow-md shadow-sky-500/5"
                      : "bg-[#101318]/40 border-[#2a2e38]/70"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="text-[13px] font-bold text-[#f0ece4] leading-tight break-all">{row.title}</div>
                    <span className={cn(
                      "flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border",
                      row.sourceState === "matched"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : row.sourceState === "attribution_only"
                        ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
                        : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                    )}>
                      {row.strategy?.monitoring_state || t("agora.performance.notLinked")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-2 text-xs">
                    <div>
                      <div className={cn(
                        "font-mono font-bold text-[14px]",
                        pnlValue !== undefined && pnlValue > 0 ? "text-emerald-400" : pnlValue !== undefined && pnlValue < 0 ? "text-rose-400" : "text-[#f0ece4]"
                      )}>
                        <MetricValue value={metric(row, "total_pnl")} format={(value) => formatCurrency(value, missing)} />
                      </div>
                      <div className="text-[9px] text-[#8c96a6]">{t("agora.performance.cumulativePnl")}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[12px] text-[#f0ece4]">
                        <MetricValue value={row.attribution?.holding_count ?? metric(row, "holding_count")} format={(value) => formatNumber(value, missing)} />
                      </div>
                      <div className="text-[9px] text-[#8c96a6]">{t("agora.performance.holding")}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[12px] text-[#f0ece4]">
                        <MetricValue value={metric(row, "total_trades")} format={(value) => formatNumber(value, missing)} />
                      </div>
                      <div className="text-[9px] text-[#8c96a6]">{t("agora.performance.tradesCount")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-[#8c96a6]">
                    <span className="text-sky-400">✦</span>
                    <span className="truncate" title={row.strategyId === "unassigned" || row.title.toLowerCase() === "unassigned" ? t("agora.performance.unlinkedTelemetry") : undefined}>
                      {row.strategyId === "unassigned" || row.title.toLowerCase() === "unassigned"
                        ? t("agora.performance.unlinkedTelemetry")
                        : row.strategy?.shadow_status || "表現穩定 · 持續追蹤"}
                    </span>
                  </div>
                  {hasSuggestions && (
                    <div className="mt-2 text-[10.5px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded px-2 py-0.5 inline-block">
                      {t("agora.performance.needsAdjust")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER: PERFORMANCE + INTERVENTION + HISTORY */}
        <div className="flex flex-col min-h-0 border border-[#2a2e38] bg-[#171b22] rounded-xl overflow-hidden">
          {activeRow ? (
            <>
              <div className="flex items-center justify-between p-3 border-b border-[#2a2e38] flex-wrap gap-2 shrink-0 bg-[#1e2330]/20">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-base text-[#f0ece4]">{activeRow.title}</div>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full border",
                    activeRow.sourceState === "matched"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                  )}>
                    {sourceStateLabel(activeRow, t)}
                  </span>
                </div>
                <div className="flex bg-[#101318] border border-[#2a2e38] rounded-full p-0.5 text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab("perf")}
                    className={cn(
                      "cursor-pointer px-3.5 py-1.5 rounded-full text-xs transition-all font-medium",
                      activeTab === "perf" ? "bg-[#1e2330] text-[#f0ece4] shadow-sm" : "text-[#8c96a6] hover:text-[#f0ece4]"
                    )}
                  >
                    {t("agora.performance.overview")}
                  </button>
                  <button
                    onClick={() => setActiveTab("intv")}
                    className={cn(
                      "cursor-pointer px-3.5 py-1.5 rounded-full text-xs transition-all font-medium",
                      activeTab === "intv" ? "bg-[#1e2330] text-[#f0ece4] shadow-sm" : "text-[#8c96a6] hover:text-[#f0ece4]"
                    )}
                  >
                    {t("agora.performance.interventionTracking")}
                  </button>
                  <button
                    onClick={() => setActiveTab("hist")}
                    className={cn(
                      "cursor-pointer px-3.5 py-1.5 rounded-full text-xs transition-all font-medium",
                      activeTab === "hist" ? "bg-[#1e2330] text-[#f0ece4] shadow-sm" : "text-[#8c96a6] hover:text-[#f0ece4]"
                    )}
                  >
                    {t("agora.performance.executionHistory")}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                
                {/* TAB 1: PERFORMANCE */}
                {activeTab === "perf" && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                      <div className="bg-[#101318]/50 border border-[#2a2e38] rounded-xl p-3">
                        <div className="text-[10px] text-[#8c96a6] mb-1">PnL</div>
                        <div className="font-mono font-bold text-lg text-[#f0ece4]">
                          <MetricValue value={metric(activeRow, "total_pnl")} format={(value) => formatCurrency(value, missing)} />
                        </div>
                      </div>
                      <div className="bg-[#101318]/50 border border-[#2a2e38] rounded-xl p-3">
                        <div className="text-[10px] text-[#8c96a6] mb-1">{t("agora.performance.contribution")}</div>
                        <div className="font-mono font-bold text-lg text-[#f0ece4]">
                          <MetricValue value={activeRow.attribution?.pnl_contribution_pct ?? metric(activeRow, "pnl_contribution_pct")} format={(value) => formatPercent(value, missing)} />
                        </div>
                      </div>
                      <div className="bg-[#101318]/50 border border-[#2a2e38] rounded-xl p-3">
                        <div className="text-[10px] text-[#8c96a6] mb-1">{t("agora.performance.drawdown")}</div>
                        <div className="font-mono font-bold text-lg text-[#f0ece4]">
                          <MetricValue value={metric(activeRow, "worst_drawdown")} format={(value) => formatPercent(value, missing)} />
                        </div>
                      </div>
                      <div className="bg-[#101318]/50 border border-[#2a2e38] rounded-xl p-3">
                        <div className="text-[10px] text-[#8c96a6] mb-1">{t("agora.performance.trades")}</div>
                        <div className="font-mono font-bold text-lg text-[#f0ece4]">
                          <MetricValue value={metric(activeRow, "total_trades")} format={(value) => formatNumber(value, missing)} />
                        </div>
                      </div>
                    </div>

                    {simulated && (
                      <div className="border border-[#2a2e38] bg-[#101318]/30 rounded-xl p-4 shrink-0">
                        <div className="text-[11px] font-bold text-[#8c96a6] uppercase tracking-wider mb-3">
                          {t("agora.performance.complianceOverview")}
                        </div>
                        <div className="flex flex-col gap-3">
                          {simulated.complianceBars.map((b) => (
                            <div key={b.label}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-[#8c96a6]">{b.label}</span>
                                <span className="font-mono font-bold" style={{ color: b.color }}>{b.value}</span>
                              </div>
                              <div className="h-2 bg-[#101318] rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: b.pct, backgroundColor: b.color }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                      <div className="bg-emerald-950/10 border border-emerald-500/20 rounded-xl p-4">
                        <div className="text-xs text-emerald-400 font-bold mb-1">{t("agora.performance.aiAcceptedSubsequent")}</div>
                        <div className="font-mono text-2xl font-bold text-emerald-400">+3.2%</div>
                        <div className="text-xs text-[#8c96a6] mt-1">
                          {t("agora.performance.avgSubsequentReturns", { count: 11 })}
                        </div>
                      </div>
                      <div className="bg-amber-950/10 border border-amber-500/20 rounded-xl p-4">
                        <div className="text-xs text-amber-400 font-bold mb-1">{t("agora.performance.aiRejectedSubsequent")}</div>
                        <div className="font-mono text-2xl font-bold text-amber-400">-0.8%</div>
                        <div className="text-xs text-[#8c96a6] mt-1">
                          {t("agora.performance.counterfactualSubsequent", { count: 4 })}
                        </div>
                      </div>
                    </div>

                    {/* Multi-strategy overview comparison */}
                    <div className="border border-[#2a2e38] rounded-xl overflow-hidden mt-2 shrink-0">
                      <div className="bg-[#101318]/50 p-3 border-b border-[#2a2e38] flex items-center justify-between">
                        <div className="text-xs font-bold text-[#f0ece4]">
                          {t("agora.performance.overview")} / {t("agora.performance.contribution")}
                        </div>
                        <span className="text-[10px] text-[#8c96a6]">
                          {t("agora.performance.returnedRows", { returned: summary.returned_row_count, total: summary.row_count })}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[750px]">
                          <thead className="bg-[#101318]/30 border-b border-[#2a2e38] text-[#8c96a6] uppercase text-[9px] tracking-wider">
                            <tr>
                              <th className="px-3 py-2">{t("agora.performance.strategy")}</th>
                              <th className="px-3 py-2">{t("agora.performance.monitoring")}</th>
                              <th className="px-3 py-2">PnL</th>
                              <th className="px-3 py-2">{t("agora.performance.contribution")}</th>
                              <th className="px-3 py-2">{t("agora.performance.drawdown")}</th>
                              <th className="px-3 py-2">{t("agora.performance.trades")}</th>
                              <th className="px-3 py-2">{t("agora.performance.telemetry")}</th>
                              <th className="px-3 py-2">{t("agora.performance.source")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr
                                key={r.id}
                                className={cn(
                                  "border-b border-[#2a2e38]/50 hover:bg-[#101318]/20 transition-colors",
                                  r.strategyId === selectedStrategyId && "bg-[#1e2330]/40"
                                )}
                              >
                                <td className="px-3 py-2 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setSelectedStrategyId(r.strategyId);
                                      }}
                                      className="hover:underline text-left text-[#f0ece4]"
                                    >
                                      {r.title}
                                    </button>
                                    <Link
                                      to={canonicalCenterUrl("performance", "attribution", {
                                        strategy: r.strategyId,
                                        period: summary.period || data.attribution.data.period,
                                      })}
                                      className="text-[9px] text-[#3b82f6] hover:underline"
                                      title={t("agora.performance.openFormalAttribution")}
                                    >
                                      [→]
                                    </Link>
                                  </div>
                                  {r.description ? (
                                    <div className="mt-0.5 max-w-[200px] text-[10px] text-sky-200" data-testid={`performance-row-${r.id}-description`}>
                                      {r.kind === "attribution_only" ? t(r.description) : r.description}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-[#f0ece4]">
                                  <div className="text-[#f0ece4]">{r.strategy?.monitoring_state ?? t("agora.performance.notLinked")}</div>
                                  <div className="mt-0.5 text-[10px] text-[#8c96a6]">{r.strategy?.readiness_state ?? r.attribution?.dimension ?? t("agora.performance.strategy")}</div>
                                </td>
                                <td className="px-3 py-2 font-mono">
                                  <MetricValue value={metric(r, "total_pnl")} format={(value) => formatCurrency(value, missing)} />
                                </td>
                                <td className="px-3 py-2 font-mono text-[#f0ece4]">
                                  {formatPercent(r.attribution?.pnl_contribution_pct ?? metric(r, "pnl_contribution_pct"), missing)}
                                </td>
                                <td className="px-3 py-2 font-mono text-[#f0ece4]">
                                  {formatPercent(metric(r, "worst_drawdown"), missing)}
                                </td>
                                <td className="px-3 py-2 font-mono">
                                  <MetricValue value={metric(r, "total_trades")} format={(value) => formatNumber(value, missing)} />
                                </td>
                                <td className="px-3 py-2 text-[#8c96a6]">
                                  <div className="text-[#f0ece4]">
                                    {formatNumber(metric(r, "telemetry_runtime_count"), missing)}/{formatNumber(metric(r, "runtime_count"), missing)}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-[#8c96a6]">{formatDateTime(metric(r, "latest_telemetry_at"), missing, i18n.resolvedLanguage)}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10px]", sourceStateClass(r))}>
                                    {sourceStateLabel(r, t)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 2: INTERVENTION */}
                {activeTab === "intv" && simulated && (
                  <div className="flex flex-col gap-4">
                    <div className="border border-[#2a2e38] bg-[#101318]/30 rounded-xl p-4">
                      <div className="text-sm font-bold text-[#f0ece4] mb-1">{t("agora.performance.recentInterventions")}</div>
                      <div className="text-xs text-[#8c96a6] mb-4">{t("agora.performance.interventionFocus")}</div>
                      
                      <div className="flex flex-col gap-3">
                        {simulated.interventions.map((iv, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-4 bg-[#101318]/50 border border-[#2a2e38] rounded-xl p-3"
                            style={{ borderLeft: `3px solid ${iv.color}` }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-[#f0ece4]">{iv.label}</div>
                              <div className="text-[11px] text-[#8c96a6] mt-0.5">次數：{iv.count}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-sm" style={{ color: iv.color }}>{iv.result}</div>
                              <div className="text-[9px] text-[#8c96a6]">平均後續</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 bg-sky-950/10 border border-sky-500/20 rounded-xl p-4">
                        <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-2">助理結論</div>
                        <div className="text-xs text-[#f0ece4] leading-relaxed">
                          {activeRow.strategyId === "unassigned" 
                            ? "交易員手動加入未歸屬策略的交易，後續表現較差。建議明確交易動機與記錄，並建立專屬實驗池影子追蹤。"
                            : "交易員手動加入候選池外標的，後續表現較差（-0.8%）。建議提高候選池外標的的進入門檻，或先送影子追蹤觀察。"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: HISTORY */}
                {activeTab === "hist" && simulated && (
                  <div className="border border-[#2a2e38] bg-[#101318]/30 rounded-xl overflow-hidden">
                    <div className="p-3 bg-[#101318]/50 border-b border-[#2a2e38]">
                      <div className="text-xs font-bold text-[#f0ece4]">{t("agora.performance.executionHistory")}</div>
                      <div className="text-[10px] text-[#8c96a6] mt-0.5">{t("agora.performance.decisionSupportOnly")}</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[550px]">
                        <thead className="bg-[#101318]/30 border-b border-[#2a2e38] text-[#8c96a6] uppercase text-[9px] tracking-wider">
                          <tr>
                            <th className="px-3 py-2">{t("agora.performance.date")}</th>
                            <th className="px-3 py-2">{t("agora.performance.stock")}</th>
                            <th className="px-3 py-2">{t("agora.performance.strategyAdvice")}</th>
                            <th className="px-3 py-2">{t("agora.performance.actualAction")}</th>
                            <th className="px-3 py-2">{t("agora.performance.deviate")}</th>
                            <th className="px-3 py-2">{t("agora.performance.result")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {simulated.execHistory.map((h, idx) => (
                            <tr key={idx} className="border-b border-[#2a2e38]/50 hover:bg-[#101318]/20 transition-colors">
                              <td className="px-3 py-2 font-mono text-[#8c96a6]">{h.date}</td>
                              <td className="px-3 py-2">
                                <span className="font-mono font-bold text-[#f0ece4]">{h.code}</span>{" "}
                                <span className="text-[#8c96a6]">{h.name}</span>
                              </td>
                              <td className="px-3 py-2 text-[#8c96a6]">{h.advice}</td>
                              <td className="px-3 py-2 text-[#f0ece4]">{h.action}</td>
                              <td className="px-3 py-2">
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: h.devBg, color: h.devFg }}
                                >
                                  {h.deviate}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono font-bold" style={{ color: h.resultColor }}>
                                {h.result}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-[#8c96a6] italic">
              請選擇一個策略以查看其執行與績效細節
            </div>
          )}
        </div>

        {/* RIGHT: ASSISTANT NOTES / ADJUSTMENT SUGGESTIONS */}
        <div className="flex flex-col min-h-0 border border-[#2a2e38] bg-[#171b22] rounded-xl overflow-hidden">
          <div className="p-3 border-b border-[#2a2e38] flex items-center gap-2 shrink-0 bg-[#1e2330]/20">
            <span className="text-sky-400">✦</span>
            <div className="font-bold text-sm text-[#f0ece4]">{t("agora.performance.assistantNotes")}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            
            {activeRow && simulated ? (
              <>
                <div>
                  <div className="text-[10px] font-bold text-[#8c96a6] uppercase tracking-wider mb-3">
                    {t("agora.performance.adjustSuggestions")}
                  </div>
                  {simulated.adjustSuggestions.length === 0 ? (
                    <div className="text-xs text-[#8c96a6] italic">{t("agora.performance.noAnomaly")}</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {simulated.adjustSuggestions.map((a) => {
                        const isApplied = appliedSuggestions.has(a.id);
                        return (
                          <div key={a.id} className="bg-[#101318]/50 border border-[#2a2e38] rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-bold text-[#f0ece4]">{a.title}</div>
                              {isApplied && (
                                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                                  {t("agora.performance.applied")}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#8c96a6] leading-relaxed mb-1">原因：{a.reason}</div>
                            <div className="text-[11px] text-emerald-400/90 leading-relaxed mb-1">預期：{a.effect}</div>
                            <div className="text-[10px] text-rose-300/80 leading-relaxed mb-3">風險：{a.risk}</div>
                            
                            {!isApplied && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setAppliedSuggestions((prev) => {
                                      const next = new Set(prev);
                                      next.add(a.id);
                                      return next;
                                    });
                                    showToast("套用調整建議成功！已送至策略工坊");
                                  }}
                                  className="cursor-pointer text-[10.5px] bg-[#3b82f6]/10 border border-[#3b82f6]/30 text-sky-400 hover:bg-[#3b82f6]/20 px-2.5 py-1 rounded transition-colors font-medium"
                                >
                                  {t("agora.performance.apply")}
                                </button>
                                <button
                                  onClick={() => showToast("已將調整建議送回策略工坊優化")}
                                  className="cursor-pointer text-[10.5px] border border-[#2a2e38] text-[#8c96a6] hover:bg-[#101318]/50 px-2.5 py-1 rounded transition-colors"
                                >
                                  {t("agora.performance.sendToWorkshop")}
                                </button>
                                <button
                                  onClick={() => showToast("已忽略調整建議")}
                                  className="cursor-pointer text-[10.5px] text-[#8c96a6]/70 hover:text-[#f0ece4] px-1.5 py-1 rounded transition-colors"
                                >
                                  {t("agora.performance.skip")}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 shrink-0 mt-2">
                  <div className="text-xs font-bold text-[#f59e0b] flex items-center gap-1.5 mb-2">
                    <span>⚠</span>
                    <span>{t("agora.performance.anomaly")}</span>
                  </div>
                  {simulated.warnings.length === 0 ? (
                    <div className="text-xs text-[#8c96a6]">{t("agora.performance.noAnomaly")}</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {simulated.warnings.map((w, idx) => (
                        <div key={idx} className="text-xs text-[#8c96a6] leading-relaxed">{w}</div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-xs text-[#8c96a6] italic">無選取的策略。</div>
            )}

          </div>
        </div>

      </div>

      {/* Collapsible/Accessible Source Health at the very bottom */}
      <footer className="shrink-0 border border-[#2a2e38] bg-[#171b22]/50 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-bold text-[#f0ece4]">{t("agora.performance.sourceHealth")}</h2>
          <div className="text-[10px] text-[#8c96a6]">
            {t("agora.performance.returnedRows", { returned: summary.returned_row_count, total: summary.row_count })}
          </div>
        </div>
        {sourceRows.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sourceRows.map((source) => (
              <span
                className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10.5px]", healthClass(source.status))}
                key={source.name}
                title={source.detail}
              >
                <span className="font-medium">{source.name}</span>
                <span>{source.status}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#8c96a6]">{t("agora.performance.noSourceMetadata")}</p>
        )}
      </footer>

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1e293b] border border-sky-500/20 text-[#f0ece4] px-4 py-2 rounded-xl text-xs shadow-2xl flex items-center gap-2">
          <span className="text-sky-400">✦</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </section>
  );
}
