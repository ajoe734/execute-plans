import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "react-router-dom";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import { Activity, AlertTriangle, Database, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
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

function StrategyKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: string;
}): JSX.Element {
  return (
    <div className="rounded-md border border-[#2a2e38] bg-[#171b22] p-3">
      <div className="flex items-center gap-2 text-xs uppercase text-[#8c96a6]">
        <Icon aria-hidden="true" className={cn("h-4 w-4", tone)} />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-[#f0ece4]">{value}</div>
    </div>
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

export function StrategyPerformancePage(): JSX.Element {
  const { t } = useTranslation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([
      getTradingRoom(),
      getTradingRoomPerformanceAttribution({ pageSize: 50, period: "latest" }),
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
  }, [refreshKey, t]);

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

  return <StrategyPerformanceLoaded data={state.data} onRefresh={() => setRefreshKey((key) => key + 1)} />;
}

function StrategyPerformanceLoaded({
  data,
  onRefresh,
}: {
  data: StrategyPerformanceData;
  onRefresh: () => void;
}): JSX.Element {
  const { i18n, t } = useTranslation();
  const missing = t("agora.performance.notReported");
  const rows = useMemo(
    () => buildRows(data.aggregate.strategies, data.attribution.data.items),
    [data.aggregate.strategies, data.attribution.data.items],
  );
  const sourceRows = useMemo(() => sourceHealthRows(data.attribution.meta), [data.attribution.meta]);
  const summary = data.attribution.data.summary;
  const telemetryCoverage =
    summary.runtime_count > 0
      ? `${summary.telemetry_runtime_count}/${summary.runtime_count}`
      : missing;
  const latestTelemetry = cleanText(summary.latest_telemetry_at, data.attribution.meta.snapshot_at);

  return (
    <section
      aria-label={t("agora.performance.title")}
      className="flex flex-1 flex-col gap-4 overflow-auto bg-[#101318] p-4 text-[#f0ece4] md:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#f0ece4]">{t("agora.performance.title")}</h1>
            <span className="rounded bg-[#1e293b] border border-[#334155] px-1.5 py-0.5 text-[10px] text-[#94a3b8] uppercase tracking-wide">
              {t("agora.performance.executionScope")}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8c96a6]">
            <span>{t("agora.performance.period", { value: summary.period || data.attribution.data.period })}</span>
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
        <button
          aria-label={t("agora.performance.refreshAttribution")}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[#2a2e38] px-3 text-xs font-medium text-[#f0ece4] hover:bg-[#171b22]"
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          {t("agora.performance.refresh")}
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StrategyKpi
          icon={Activity}
          label={t("agora.performance.strategies")}
          tone="text-[#e8b750]"
          value={String(data.aggregate.strategies.length)}
        />
        <StrategyKpi
          icon={TrendingUp}
          label={t("agora.performance.totalPnl")}
          tone="text-emerald-300"
          value={formatCurrency(summary.total_pnl, missing)}
        />
        <StrategyKpi
          icon={TrendingDown}
          label={t("agora.performance.worstDrawdown")}
          tone="text-rose-300"
          value={formatPercent(summary.worst_drawdown, missing)}
        />
        <StrategyKpi
          icon={Database}
          label={t("agora.performance.telemetryCoverage")}
          tone="text-sky-300"
          value={telemetryCoverage}
        />
        <StrategyKpi
          icon={Activity}
          label={t("agora.performance.decisionEvents")}
          tone="text-violet-300"
          value={String(data.decisionEvents.length)}
        />
      </div>

      <section className="rounded-md border border-[#2a2e38] bg-[#171b22] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#f0ece4]">{t("agora.performance.sourceHealth")}</h2>
          <div className="text-xs text-[#8c96a6]">
            {t("agora.performance.returnedRows", { returned: summary.returned_row_count, total: summary.row_count })}
          </div>
        </div>
        {sourceRows.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {sourceRows.map((source) => (
              <span
                className={cn("inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs", healthClass(source.status))}
                key={source.name}
                title={source.detail}
              >
                <span className="font-medium">{source.name}</span>
                <span>{source.status}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#8c96a6]">{t("agora.performance.noSourceMetadata")}</p>
        )}
      </section>

      {rows.length === 0 ? (
        <EmptyPerformanceState />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#2a2e38] bg-[#171b22]">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-[#2a2e38] text-xs uppercase text-[#8c96a6]">
              <tr>
                <th className="px-3 py-2 font-medium">{t("agora.performance.strategy")}</th>
                <th className="px-3 py-2 font-medium">{t("agora.performance.monitoring")}</th>
                <th className="px-3 py-2 font-medium">PnL</th>
                <th className="px-3 py-2 font-medium">{t("agora.performance.contribution")}</th>
                <th className="px-3 py-2 font-medium">{t("agora.performance.drawdown")}</th>
                <th className="px-3 py-2 font-medium">{t("agora.performance.trades")}</th>
                <th className="px-3 py-2 font-medium">{t("agora.performance.telemetry")}</th>
                <th className="px-3 py-2 font-medium">{t("agora.performance.source")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b border-[#2a2e38]/70 last:border-0" key={row.id}>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-[#f0ece4] flex items-center gap-2">
                      {row.title}
                      <Link
                        to={canonicalCenterUrl("performance", "attribution", {
                          strategy: row.strategyId,
                          period: summary.period || data.attribution.data.period,
                        })}
                        className="text-[10px] text-[#3b82f6] hover:underline animate-pulse-subtle"
                        title={t("agora.performance.openFormalAttribution")}
                      >
                        [{t("agora.performance.attribution")} →]
                      </Link>
                    </div>
                    <div className="mt-1 max-w-[260px] truncate text-xs text-[#8c96a6]">{row.strategyId}</div>
                    {row.description ? (
                      <div className="mt-1 max-w-[300px] text-xs leading-4 text-sky-200" data-testid={`performance-row-${row.id}-description`}>
                        {row.kind === "attribution_only" ? t(row.description) : row.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="text-[#f0ece4]">{row.strategy?.monitoring_state ?? t("agora.performance.notLinked")}</div>
                    <div className="mt-1 text-xs text-[#8c96a6]">{row.strategy?.readiness_state ?? row.attribution?.dimension ?? t("agora.performance.strategy")}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <MetricValue value={metric(row, "total_pnl")} format={(value) => formatCurrency(value, missing)} />
                  </td>
                  <td className="px-3 py-3 align-top text-[#f0ece4]">
                    {formatPercent(row.attribution?.pnl_contribution_pct ?? metric(row, "pnl_contribution_pct"), missing)}
                  </td>
                  <td className="px-3 py-3 align-top text-[#f0ece4]">{formatPercent(metric(row, "worst_drawdown"), missing)}</td>
                  <td className="px-3 py-3 align-top">
                    <MetricValue value={metric(row, "total_trades")} format={(value) => formatNumber(value, missing)} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="text-[#f0ece4]">
                      {formatNumber(metric(row, "telemetry_runtime_count"), missing)}/{formatNumber(metric(row, "runtime_count"), missing)}
                    </div>
                    <div className="mt-1 text-xs text-[#8c96a6]">{formatDateTime(metric(row, "latest_telemetry_at"), missing, i18n.resolvedLanguage)}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs", sourceStateClass(row))}>
                      {sourceStateLabel(row, t)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
