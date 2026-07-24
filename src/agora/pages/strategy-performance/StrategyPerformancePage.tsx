import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import {
  actOnPerformanceSuggestion,
  getStrategyPerformance,
  type AdjustmentSuggestion,
  type PerformanceAvailability,
  type PerformanceProjectionEnvelope,
  type SourceAvailability,
  type StrategyPerformanceProjection,
  type SuggestionAction,
  type SuggestionActionReceipt,
} from "@/lib/bff-v1/agora/performance";
import {
  getTradingRoom,
  getTradingRoomPerformanceAttribution,
  type TradingRoomAggregate,
  type TradingRoomPerformanceAttributionResponse,
  type TradingRoomPerformanceAttributionRow,
  type TradingRoomStrategyEntry,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError } from "@/lib/bff-v1/errors";
import { cn } from "@/lib/utils";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; data: StrategyPerformanceData }
  | { status: "error"; message: string };

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; envelope: PerformanceProjectionEnvelope }
  | { status: "error"; message: string };

type DetailDisplayState = "ready" | "partial" | "unavailable" | "stale" | "empty";

interface StrategyPerformanceData {
  aggregate: TradingRoomAggregate;
  attribution: TradingRoomPerformanceAttributionResponse;
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

const PERFORMANCE_ACTION_ROLES = new Set(["admin", "operator", "reviewer", "approver"]);

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

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

function structuredValue(value: Record<string, unknown> | null, missing: string): string {
  if (!value) return missing;
  const entries = Object.entries(value);
  if (entries.length === 0) return missing;
  return entries.map(([key, item]) => {
    if (item === null || item === undefined) return `${key}: ${missing}`;
    if (typeof item === "object") return `${key}: ${JSON.stringify(item)}`;
    return `${key}: ${String(item)}`;
  }).join(" · ");
}

function strategyIdsFor(row: TradingRoomPerformanceAttributionRow): string[] {
  const explicit = row.source_refs?.strategy_ids ?? [];
  return [row.dimension_key, ...explicit].filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
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
    if (aUnassigned !== bUnassigned) return aUnassigned ? 1 : -1;
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

function availabilityClass(status: PerformanceAvailability | DetailDisplayState): string {
  if (status === "ready" || status === "available") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "partial" || status === "stale") {
    return "border-amber-400/35 bg-amber-400/10 text-amber-200";
  }
  if (status === "unavailable") return "border-rose-400/35 bg-rose-400/10 text-rose-200";
  return "border-slate-500/50 bg-slate-800 text-slate-200";
}

function metric(row: StrategyPerformanceRow, key: keyof TradingRoomPerformanceAttributionRow["metrics"]): unknown {
  return row.attribution?.metrics?.[key];
}

function projectionDisplayState(envelope: PerformanceProjectionEnvelope): DetailDisplayState {
  const projection = envelope.data;
  const reasons = [
    projection.compliance.availability.reason,
    projection.interventions.availability.reason,
    projection.execution_history.availability.reason,
    projection.warnings.availability.reason,
    projection.adjustment_suggestions.availability.reason,
    cleanText(envelope.meta.status, envelope.meta.freshness),
  ].filter((value): value is string => typeof value === "string");
  if (reasons.some((reason) => /(^|\W)stale(d)?(\W|$)/i.test(reason))) return "stale";
  if (projection.availability === "unavailable" || projection.freshness.status === "unavailable") {
    return "unavailable";
  }
  const sectionStatuses = [
    projection.compliance.availability.status,
    projection.interventions.availability.status,
    projection.execution_history.availability.status,
    projection.warnings.availability.status,
    projection.adjustment_suggestions.availability.status,
  ];
  if (
    projection.availability === "partial"
    || projection.freshness.status === "partial"
    || sectionStatuses.some((status) => status === "partial" || status === "unavailable")
  ) return "partial";
  const hasItems = projection.compliance.metrics.length > 0
    || projection.interventions.items.length > 0
    || projection.execution_history.items.length > 0
    || projection.warnings.items.length > 0
    || projection.adjustment_suggestions.items.length > 0;
  return hasItems ? "ready" : "empty";
}

function formatActionError(error: unknown): string {
  if (error instanceof BffError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

function MetricValue({ value, format }: { value: unknown; format: (value: unknown) => string }): JSX.Element {
  const { t } = useTranslation();
  const measured = finiteNumber(value) !== undefined;
  return (
    <span
      className={measured ? "text-[#f0ece4]" : "italic text-[#8c96a6]"}
      data-metric-state={measured ? "measured" : "not-reported"}
      title={measured
        ? (finiteNumber(value) === 0 ? t("agora.performance.measuredZero") : t("agora.performance.measured"))
        : t("agora.performance.notReportedByBff")}
    >
      {format(value)}
    </span>
  );
}

function SourceAvailabilityHeader({
  availability,
  label,
}: {
  availability: SourceAvailability;
  label: string;
}): JSX.Element {
  const { i18n, t } = useTranslation();
  const missing = t("agora.performance.notReported");
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c96a6]">{label}</div>
        <div className="mt-1 text-[10px] text-[#8c96a6]">
          {t("agora.performance.asOf", {
            value: formatDateTime(availability.as_of, missing, i18n.resolvedLanguage),
          })}
          {availability.source_ids.length > 0
            ? ` · ${t("agora.performance.provenance", { value: availability.source_ids.join(", ") })}`
            : ""}
        </div>
      </div>
      <span className={cn("rounded border px-2 py-0.5 text-[10px]", availabilityClass(availability.status))}>
        {t(`agora.performance.states.${availability.status}`)}
      </span>
      {availability.reason ? (
        <p className="basis-full text-xs text-amber-100/85" data-testid={`${label}-availability-reason`}>
          {availability.reason}
        </p>
      ) : null}
    </div>
  );
}

function DetailStateNotice({ state }: { state: DetailState }): JSX.Element | null {
  const { t } = useTranslation();
  if (state.status === "loading") {
    return <p className="rounded border border-[#2a2e38] bg-[#101318]/50 p-3 text-xs text-[#8c96a6]" role="status">{t("agora.performance.detailLoading")}</p>;
  }
  if (state.status === "error") {
    return <p className="rounded border border-rose-400/35 bg-rose-400/10 p-3 text-xs text-rose-100" role="alert">{t("agora.performance.detailError", { message: state.message })}</p>;
  }
  return null;
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
    ])
      .then(([aggregate, attribution]) => {
        if (!cancelled) setState({ data: { aggregate, attribution }, status: "loaded" });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            message: error instanceof Error ? error.message : t("agora.performance.unavailable"),
            status: "error",
          });
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey, period, t]);

  if (state.status === "loading") {
    return <section className="flex flex-1 items-center justify-center bg-[#101318] p-6 text-sm text-[#8c96a6]" role="status">{t("agora.performance.loading")}</section>;
  }

  if (state.status === "error") {
    return (
      <section className="flex flex-1 flex-col gap-4 overflow-auto bg-[#101318] p-5 text-[#f0ece4]">
        <div className="rounded-md border border-rose-400/35 bg-rose-400/10 p-4" role="alert">
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
      onPeriodChange={setPeriod}
      onRefresh={() => setRefreshKey((key) => key + 1)}
      period={period}
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
  onPeriodChange: (period: string) => void;
}): JSX.Element {
  const { i18n, t } = useTranslation();
  const writeAccess = useAgoraWriteAccess();
  const missing = t("agora.performance.notReported");
  const rows = useMemo(
    () => buildRows(data.aggregate.strategies, data.attribution.data.items),
    [data.aggregate.strategies, data.attribution.data.items],
  );
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"perf" | "intv" | "hist">("perf");
  const [mobilePane, setMobilePane] = useState<"decision" | "outcome" | "strategies">("decision");
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [pendingAction, setPendingAction] = useState<{ suggestionId: string; action: SuggestionAction } | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
  const [receipts, setReceipts] = useState<Record<string, SuggestionActionReceipt>>({});
  const attemptKeys = useRef(new Map<string, string>());

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedStrategyId(null);
      return;
    }
    if (!selectedStrategyId || !rows.some((row) => row.strategyId === selectedStrategyId)) {
      setSelectedStrategyId((rows.find((row) => row.strategyId !== "unassigned") ?? rows[0]).strategyId);
    }
  }, [rows, selectedStrategyId]);

  const activeRow = useMemo(
    () => rows.find((row) => row.strategyId === selectedStrategyId) ?? rows[0],
    [rows, selectedStrategyId],
  );

  useEffect(() => {
    if (!activeRow) {
      setDetailState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setDetailState({ status: "loading" });
    getStrategyPerformance(activeRow.strategyId, { period: period as "latest" | "7d" | "30d" | "all" })
      .then((envelope) => {
        if (!cancelled) setDetailState({ status: "ready", envelope });
      })
      .catch((error: unknown) => {
        if (!cancelled) setDetailState({ status: "error", message: formatActionError(error) });
      });
    return () => { cancelled = true; };
  }, [activeRow, period]);

  const projection = detailState.status === "ready" ? detailState.envelope.data : null;
  const detailDisplayState = detailState.status === "ready"
    ? projectionDisplayState(detailState.envelope)
    : null;
  const sourceRows = useMemo(() => sourceHealthRows(data.attribution.meta), [data.attribution.meta]);
  const summary = data.attribution.data.summary;
  const latestTelemetry = cleanText(summary.latest_telemetry_at, data.attribution.meta.snapshot_at);
  const hasActionRole = writeAccess.roles.some((role) => PERFORMANCE_ACTION_ROLES.has(role.toLowerCase()));
  const actionDisabledReason = writeAccess.loading
    ? t("agora.performance.actionPolicyChecking")
    : !writeAccess.writeAllowed
      ? t("agora.performance.actionPolicyDisabled")
      : !hasActionRole
        ? t("agora.performance.actionRoleRequired")
        : null;

  const performAction = async (suggestion: AdjustmentSuggestion, action: SuggestionAction) => {
    const fingerprint = `${suggestion.suggestion_id}:${suggestion.version}:${action}`;
    let idempotencyKey = attemptKeys.current.get(fingerprint);
    if (!idempotencyKey) {
      if (!globalThis.crypto?.randomUUID) {
        setActionErrors((current) => ({
          ...current,
          [suggestion.suggestion_id]: t("agora.performance.actionIdentityUnavailable"),
        }));
        return;
      }
      idempotencyKey = `agperf-${globalThis.crypto.randomUUID()}`;
      attemptKeys.current.set(fingerprint, idempotencyKey);
    }
    setPendingAction({ suggestionId: suggestion.suggestion_id, action });
    setActionErrors((current) => ({ ...current, [suggestion.suggestion_id]: "" }));
    try {
      const envelope = await actOnPerformanceSuggestion({
        strategyId: suggestion.strategy_id,
        suggestionId: suggestion.suggestion_id,
        action,
        expectedVersion: suggestion.version,
        idempotencyKey,
        reason: actionReasons[suggestion.suggestion_id],
      });
      const receipt = envelope.data;
      setDetailState((current) => {
        if (current.status !== "ready") return current;
        return {
          status: "ready",
          envelope: {
            ...current.envelope,
            data: {
              ...current.envelope.data,
              adjustment_suggestions: {
                ...current.envelope.data.adjustment_suggestions,
                items: current.envelope.data.adjustment_suggestions.items.map((item) => (
                  item.suggestion_id === receipt.suggestion_id ? receipt.authoritative_readback : item
                )),
              },
            },
          },
        };
      });
      setReceipts((current) => ({ ...current, [suggestion.suggestion_id]: receipt }));
      attemptKeys.current.delete(fingerprint);
    } catch (error) {
      setActionErrors((current) => ({
        ...current,
        [suggestion.suggestion_id]: formatActionError(error),
      }));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section
      aria-label={t("agora.performance.title")}
      className="flex h-full flex-1 flex-col gap-4 overflow-hidden bg-[#101318] p-4 text-[#f0ece4] md:p-5"
      data-testid="strategy-performance-page"
    >
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#f0ece4]">{t("agora.performance.title")}</h1>
            <span className="rounded border border-[#334155] bg-[#1e293b] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#94a3b8]">
              {t("agora.performance.executionScope")}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8c96a6]">
            <span>{t("agora.performance.policy", { value: data.attribution.meta.policy ?? missing })}</span>
            <span>{t("agora.performance.snapshot", { value: formatDateTime(latestTelemetry, missing, i18n.resolvedLanguage) })}</span>
            <span className="text-[#3b82f6]">
              {t("agora.performance.officialPrefix")} {" "}
              <Link className="underline hover:text-[#60a5fa]" to={canonicalCenterUrl("performance")}>
                {t("performanceCenter.title")}
              </Link>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#8c96a6]">
            {t("agora.performance.periodLabel")}
            <select
              aria-label={t("agora.performance.periodLabel")}
              className="rounded-md border border-[#2a2e38] bg-[#171b22] px-2 py-1 text-xs text-[#f0ece4] focus:border-sky-500 focus:outline-none"
              onChange={(event) => onPeriodChange(event.target.value)}
              value={period}
            >
              <option value="latest">{t("agora.performance.periods.latest")}</option>
              <option value="7d">{t("agora.performance.periods.7d")}</option>
              <option value="30d">{t("agora.performance.periods.30d")}</option>
              <option value="all">{t("agora.performance.periods.all")}</option>
            </select>
          </label>
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

      {activeRow ? (
        <div className="agora-mobile-only shrink-0 flex-col gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3" data-testid="performance-mobile-priority">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-amber-400">{t("agora.performance.decisionFocus")}</div>
              <div className="truncate text-sm font-bold text-[#f0ece4]">{activeRow.title}</div>
            </div>
            {detailDisplayState ? (
              <span className={cn("rounded border px-2 py-0.5 text-[10px]", availabilityClass(detailDisplayState))}>
                {t(`agora.performance.states.${detailDisplayState}`)}
              </span>
            ) : null}
          </div>
          <p className="line-clamp-2 text-xs leading-relaxed text-amber-100/90">
            {projection?.warnings.items[0]?.message
              ?? projection?.warnings.items[0]?.code
              ?? t("agora.performance.noAnomaly")}
          </p>
        </div>
      ) : null}

      <div className="agora-mobile-only shrink-0 items-center gap-2 overflow-x-auto" data-testid="performance-mobile-pane-selector">
        {(["decision", "outcome", "strategies"] as const).map((pane) => (
          <button
            aria-pressed={mobilePane === pane}
            className={mobilePane === pane
              ? "shrink-0 rounded-full bg-sky-500 px-3 py-1.5 text-xs font-semibold text-[#101318]"
              : "shrink-0 rounded-full border border-[#2a2e38] px-3 py-1.5 text-xs font-semibold text-[#c5cad2]"}
            key={pane}
            onClick={() => setMobilePane(pane)}
            type="button"
          >
            {t(`agora.performance.mobilePanes.${pane}`)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-[#2a2e38] bg-[#171b22] p-6 text-sm text-[#8c96a6]">{t("agora.performance.empty")}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[300px_1fr_320px]" data-testid="performance-pane-grid">
          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#2a2e38] bg-[#171b22]"
            data-mobile-pane-hidden={mobilePane !== "strategies"}
            data-testid="performance-strategy-pane"
          >
            <div className="shrink-0 border-b border-[#2a2e38] p-4">
              <div className="text-sm font-bold text-[#f0ece4]">{t("agora.performance.strategyList")}</div>
              <div className="mt-0.5 text-[11.5px] text-[#8c96a6]">{t("agora.performance.returnedRows", { returned: summary.returned_row_count, total: summary.row_count })}</div>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
              {rows.map((row) => {
                const isActive = row.strategyId === selectedStrategyId;
                const pnlValue = metric(row, "total_pnl") as number | undefined;
                const activeHasSuggestions = isActive && Boolean(projection?.adjustment_suggestions.items.length);
                return (
                  <button
                    aria-pressed={isActive}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-all hover:bg-[#1e2330]",
                      isActive ? "border-sky-500/50 bg-[#1e2330] shadow-md shadow-sky-500/5" : "border-[#2a2e38]/70 bg-[#101318]/40",
                    )}
                    key={row.id}
                    onClick={() => setSelectedStrategyId(row.strategyId)}
                    type="button"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="break-all text-[13px] font-bold leading-tight text-[#f0ece4]">{row.title}</div>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px]", sourceStateClass(row))}>{sourceStateLabel(row, t)}</span>
                    </div>
                    <div className="mb-2 flex items-center gap-3 text-xs">
                      <div>
                        <div className={cn("font-mono text-[14px] font-bold", pnlValue !== undefined && pnlValue > 0 ? "text-emerald-400" : pnlValue !== undefined && pnlValue < 0 ? "text-rose-400" : "text-[#f0ece4]") }>
                          <MetricValue format={(value) => formatCurrency(value, missing)} value={metric(row, "total_pnl")} />
                        </div>
                        <div className="text-[9px] text-[#8c96a6]">{t("agora.performance.cumulativePnl")}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[12px] text-[#f0ece4]"><MetricValue format={(value) => formatNumber(value, missing)} value={row.attribution?.holding_count ?? metric(row, "holding_count")} /></div>
                        <div className="text-[9px] text-[#8c96a6]">{t("agora.performance.holding")}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[12px] text-[#f0ece4]"><MetricValue format={(value) => formatNumber(value, missing)} value={metric(row, "total_trades")} /></div>
                        <div className="text-[9px] text-[#8c96a6]">{t("agora.performance.tradesCount")}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[#8c96a6]">
                      <span className="text-sky-400">✦</span>
                      <span className="truncate">{row.strategy?.shadow_status ?? t("agora.performance.notReported")}</span>
                    </div>
                    {activeHasSuggestions ? <div className="mt-2 inline-block rounded border border-[#f59e0b]/20 bg-[#f59e0b]/10 px-2 py-0.5 text-[10.5px] text-[#f59e0b]">{t("agora.performance.needsAdjust")}</div> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#2a2e38] bg-[#171b22]"
            data-mobile-pane-hidden={mobilePane !== "outcome"}
            data-testid="performance-outcome-pane"
          >
            {activeRow ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2a2e38] bg-[#1e2330]/20 p-3">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-bold text-[#f0ece4]">{activeRow.title}</div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", sourceStateClass(activeRow))}>{sourceStateLabel(activeRow, t)}</span>
                  </div>
                  <div className="flex max-w-full overflow-x-auto rounded-full border border-[#2a2e38] bg-[#101318] p-0.5 text-xs font-semibold">
                    {(["perf", "intv", "hist"] as const).map((tab) => (
                      <button
                        aria-pressed={activeTab === tab}
                        className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium transition-all", activeTab === tab ? "bg-[#1e2330] text-[#f0ece4] shadow-sm" : "text-[#8c96a6] hover:text-[#f0ece4]")}
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        type="button"
                      >
                        {t(`agora.performance.tabs.${tab}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                  <DetailStateNotice state={detailState} />
                  {projection && detailDisplayState ? (
                    <div className="rounded-xl border border-[#2a2e38] bg-[#101318]/30 p-3" data-testid="performance-projection-state">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn("rounded border px-2 py-0.5 text-[10px]", availabilityClass(detailDisplayState))}>{t(`agora.performance.states.${detailDisplayState}`)}</span>
                        <span className="text-[10px] text-[#8c96a6]">{t("agora.performance.environment", { value: projection.environment })}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#8c96a6]">
                        <span>{t("agora.performance.snapshot", { value: formatDateTime(projection.freshness.snapshot_at, missing, i18n.resolvedLanguage) })}</span>
                        <span>{t("agora.performance.asOf", { value: formatDateTime(projection.freshness.as_of, missing, i18n.resolvedLanguage) })}</span>
                        <span>{t("agora.performance.projectionRevision", { value: projection.freshness.projection_revision ?? missing })}</span>
                        <span>{t("agora.performance.projectionGeneration", { value: projection.freshness.projection_generation ?? missing })}</span>
                      </div>
                      {projection.freshness.unavailable_sources.length > 0 ? <p className="mt-2 text-xs text-amber-100/85">{t("agora.performance.unavailableSources", { value: projection.freshness.unavailable_sources.join(", ") })}</p> : null}
                    </div>
                  ) : null}

                  {activeTab === "perf" ? (
                    <>
                      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                          ["PnL", metric(activeRow, "total_pnl"), formatCurrency],
                          [t("agora.performance.contribution"), activeRow.attribution?.pnl_contribution_pct ?? metric(activeRow, "pnl_contribution_pct"), formatPercent],
                          [t("agora.performance.drawdown"), metric(activeRow, "worst_drawdown"), formatPercent],
                          [t("agora.performance.trades"), metric(activeRow, "total_trades"), formatNumber],
                        ].map(([label, value, formatter]) => (
                          <div className="rounded-xl border border-[#2a2e38] bg-[#101318]/50 p-3" key={String(label)}>
                            <div className="mb-1 text-[10px] text-[#8c96a6]">{String(label)}</div>
                            <div className="font-mono text-lg font-bold text-[#f0ece4]"><MetricValue format={(item) => (formatter as (value: unknown, missing: string) => string)(item, missing)} value={value} /></div>
                          </div>
                        ))}
                      </div>
                      {projection ? (
                        <div className="shrink-0 rounded-xl border border-[#2a2e38] bg-[#101318]/30 p-4">
                          <SourceAvailabilityHeader availability={projection.compliance.availability} label={t("agora.performance.complianceOverview")} />
                          {projection.compliance.metrics.length === 0 ? <p className="text-xs italic text-[#8c96a6]">{t("agora.performance.sectionEmpty")}</p> : (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              {projection.compliance.metrics.map((item) => (
                                <article className="rounded-lg border border-[#2a2e38] bg-[#101318]/50 p-3" key={item.metric_id}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="text-xs font-bold text-[#f0ece4]">{item.label ?? item.metric_id}</div>
                                    <div className="font-mono text-sm text-emerald-300">{item.value === null ? missing : `${formatNumber(item.value, missing)}${item.unit ? ` ${item.unit}` : ""}`}</div>
                                  </div>
                                  <div className="mt-2 text-[10px] text-[#8c96a6]">{t("agora.performance.provenance", { value: item.source_id })} · {t("agora.performance.asOf", { value: formatDateTime(item.as_of, missing, i18n.resolvedLanguage) })}</div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                      <StrategyComparison rows={rows} selectedStrategyId={selectedStrategyId} onSelect={setSelectedStrategyId} summary={summary} data={data} />
                    </>
                  ) : null}

                  {activeTab === "intv" && projection ? (
                    <div className="rounded-xl border border-[#2a2e38] bg-[#101318]/30 p-4">
                      <SourceAvailabilityHeader availability={projection.interventions.availability} label={t("agora.performance.recentInterventions")} />
                      {projection.interventions.aggregate ? (
                        <div className="mb-3 rounded-lg border border-[#2a2e38] bg-[#101318]/50 p-3 text-xs text-[#8c96a6]">
                          {t("agora.performance.interventionTotal", { count: projection.interventions.aggregate.total })}
                          {Object.keys(projection.interventions.aggregate.by_status).length > 0 ? ` · ${Object.entries(projection.interventions.aggregate.by_status).map(([status, count]) => `${status}: ${count}`).join(" · ")}` : ""}
                        </div>
                      ) : null}
                      {projection.interventions.items.length === 0 ? <p className="text-xs italic text-[#8c96a6]">{t("agora.performance.sectionEmpty")}</p> : (
                        <div className="flex flex-col gap-3">
                          {projection.interventions.items.map((item) => (
                            <article className="rounded-xl border border-[#2a2e38] bg-[#101318]/50 p-3" key={item.intervention_id}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-xs font-bold text-[#f0ece4]">{item.kind}</div>
                                <span className="rounded border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-200">{item.status}</span>
                              </div>
                              <div className="mt-2 text-[10px] text-[#8c96a6]">{formatDateTime(item.occurred_at, missing, i18n.resolvedLanguage)} · {t("agora.performance.provenance", { value: item.source_id })}</div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "hist" && projection ? (
                    <div className="overflow-hidden rounded-xl border border-[#2a2e38] bg-[#101318]/30">
                      <div className="border-b border-[#2a2e38] bg-[#101318]/50 p-3">
                        <SourceAvailabilityHeader availability={projection.execution_history.availability} label={t("agora.performance.executionHistory")} />
                        <div className="text-[10px] text-[#8c96a6]">{t("agora.performance.decisionSupportOnly")}</div>
                      </div>
                      {projection.execution_history.items.length === 0 ? <p className="p-4 text-xs italic text-[#8c96a6]">{t("agora.performance.sectionEmpty")}</p> : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[600px] text-left text-xs">
                            <thead className="border-b border-[#2a2e38] bg-[#101318]/30 text-[9px] uppercase tracking-wider text-[#8c96a6]">
                              <tr><th className="px-3 py-2">{t("agora.performance.date")}</th><th className="px-3 py-2">{t("agora.performance.journey")}</th><th className="px-3 py-2">{t("agora.performance.status")}</th><th className="px-3 py-2">{t("agora.performance.lineageCounts")}</th><th className="px-3 py-2">{t("agora.performance.source")}</th></tr>
                            </thead>
                            <tbody>
                              {projection.execution_history.items.map((item) => (
                                <tr className="border-b border-[#2a2e38]/50" key={item.journey_id}>
                                  <td className="px-3 py-2 text-[#8c96a6]">{formatDateTime(item.occurred_at, missing, i18n.resolvedLanguage)}</td>
                                  <td className="px-3 py-2 font-mono text-[#f0ece4]">{item.journey_id}</td>
                                  <td className="px-3 py-2 text-[#f0ece4]">{item.status}</td>
                                  <td className="px-3 py-2 text-[#8c96a6]">{t("agora.performance.lineageCountValue", { decisions: item.decision_ids.length, orders: item.order_ids.length, fills: item.fill_ids.length, reconciliations: item.reconciliation_ids.length })}</td>
                                  <td className="px-3 py-2 text-[#8c96a6]">{item.source_id}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : <div className="flex flex-1 items-center justify-center p-6 text-sm italic text-[#8c96a6]">{t("agora.performance.selectStrategy")}</div>}
          </div>

          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#2a2e38] bg-[#171b22]"
            data-mobile-pane-hidden={mobilePane !== "decision"}
            data-testid="performance-decision-pane"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-[#2a2e38] bg-[#1e2330]/20 p-3"><span className="text-sky-400">✦</span><div className="text-sm font-bold text-[#f0ece4]">{t("agora.performance.assistantNotes")}</div></div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <DetailStateNotice state={detailState} />
              {projection ? (
                <>
                  <section aria-labelledby="adjustment-suggestions-heading">
                    <SourceAvailabilityHeader availability={projection.adjustment_suggestions.availability} label={t("agora.performance.adjustSuggestions")} />
                    <h2 className="sr-only" id="adjustment-suggestions-heading">{t("agora.performance.adjustSuggestions")}</h2>
                    {actionDisabledReason ? <p className="mb-3 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-100/85" role="note">{actionDisabledReason}</p> : null}
                    {projection.adjustment_suggestions.items.length === 0 ? <p className="text-xs italic text-[#8c96a6]">{t("agora.performance.sectionEmpty")}</p> : (
                      <div className="flex flex-col gap-3">
                        {projection.adjustment_suggestions.items.map((suggestion) => {
                          const busy = pendingAction?.suggestionId === suggestion.suggestion_id;
                          const receipt = receipts[suggestion.suggestion_id];
                          const error = actionErrors[suggestion.suggestion_id];
                          return (
                            <article className="rounded-xl border border-[#2a2e38] bg-[#101318]/50 p-3" data-testid={`performance-suggestion-${suggestion.suggestion_id}`} key={suggestion.suggestion_id}>
                              <div className="mb-2 flex items-start justify-between gap-2"><div className="text-xs font-bold text-[#f0ece4]">{suggestion.title ?? suggestion.suggestion_id}</div><span className={cn("rounded border px-1.5 py-0.5 text-[9.5px]", suggestion.status === "proposed" ? "border-sky-500/20 bg-sky-500/10 text-sky-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300")}>{t(`agora.performance.suggestionStatuses.${suggestion.status}`)}</span></div>
                              <dl className="space-y-1 text-[11px] leading-relaxed text-[#8c96a6]">
                                <div><dt className="inline font-semibold">{t("agora.performance.reason")}:</dt> <dd className="inline">{suggestion.rationale ?? missing}</dd></div>
                                <div className="text-emerald-300/90"><dt className="inline font-semibold">{t("agora.performance.expectedEffect")}:</dt> <dd className="inline">{structuredValue(suggestion.expected_effect, missing)}</dd></div>
                                <div className="text-rose-300/80"><dt className="inline font-semibold">{t("agora.performance.expectedRisk")}:</dt> <dd className="inline">{structuredValue(suggestion.expected_risk, missing)}</dd></div>
                              </dl>
                              <div className="mt-2 text-[10px] text-[#8c96a6]">{t("agora.performance.provenance", { value: `${suggestion.provenance.source_type}/${suggestion.provenance.source_id}${suggestion.provenance.source_version ? `@${suggestion.provenance.source_version}` : ""}` })} · {t("agora.performance.asOf", { value: formatDateTime(suggestion.as_of, missing, i18n.resolvedLanguage) })}</div>
                              {suggestion.status === "proposed" ? (
                                <>
                                  <label className="mt-3 block text-[10px] text-[#8c96a6]">{t("agora.performance.actionReason")}<input className="mt-1 w-full rounded border border-[#2a2e38] bg-[#171b22] px-2 py-1 text-xs text-[#f0ece4]" disabled={busy || Boolean(actionDisabledReason)} maxLength={2000} onChange={(event) => setActionReasons((current) => ({ ...current, [suggestion.suggestion_id]: event.target.value }))} value={actionReasons[suggestion.suggestion_id] ?? ""} /></label>
                                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("agora.performance.suggestionActions", { title: suggestion.title ?? suggestion.suggestion_id })}>
                                    {(["apply", "return_to_workshop", "reject"] as const).map((action) => (
                                      <button
                                        className={cn("rounded border px-2.5 py-1 text-[10.5px] font-medium", action === "apply" ? "border-sky-500/30 bg-sky-500/10 text-sky-300" : "border-[#2a2e38] text-[#c5cad2]", (busy || actionDisabledReason) && "cursor-not-allowed opacity-50")}
                                        disabled={busy || Boolean(actionDisabledReason)}
                                        key={action}
                                        onClick={() => void performAction(suggestion, action)}
                                        title={actionDisabledReason ?? undefined}
                                        type="button"
                                      >
                                        {busy && pendingAction?.action === action ? t("agora.performance.actionPending") : t(`agora.performance.actions.${action}`)}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : null}
                              {error ? <p className="mt-3 rounded border border-rose-400/35 bg-rose-400/10 p-2 text-[10px] text-rose-100" role="alert">{t("agora.performance.actionFailed", { message: error })}</p> : null}
                              {receipt ? (
                                <div className="mt-3 rounded border border-emerald-400/30 bg-emerald-400/10 p-2 text-[10px] text-emerald-100" data-testid={`performance-receipt-${receipt.receipt_id}`} role="status">
                                  <div className="font-semibold">{t("agora.performance.receiptConfirmed", { status: receipt.status })}</div>
                                  <div className="mt-1 break-all">{t("agora.performance.receiptReference", { receipt: receipt.receipt_id, audit: receipt.audit_event_id })}</div>
                                  <div>{t("agora.performance.receiptReadback", { version: receipt.authoritative_readback.version, value: formatDateTime(receipt.recorded_at, missing, i18n.resolvedLanguage) })}</div>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="mt-2 shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4" aria-labelledby="performance-warnings-heading">
                    <SourceAvailabilityHeader availability={projection.warnings.availability} label={t("agora.performance.anomaly")} />
                    <h2 className="sr-only" id="performance-warnings-heading">{t("agora.performance.anomaly")}</h2>
                    {projection.warnings.items.length === 0 ? <p className="text-xs text-[#8c96a6]">{t("agora.performance.noAnomaly")}</p> : (
                      <div className="flex flex-col gap-2">
                        {projection.warnings.items.map((warning) => (
                          <article className="rounded border border-amber-500/20 bg-[#101318]/40 p-2 text-xs text-[#c5cad2]" key={warning.warning_id}>
                            <div className="flex items-start justify-between gap-2"><span>{warning.message ?? warning.code}</span><span className="shrink-0 text-[9px] uppercase text-amber-300">{warning.severity}</span></div>
                            <div className="mt-1 text-[10px] text-[#8c96a6]">{warning.code} · {t("agora.performance.provenance", { value: warning.source_id })} · {formatDateTime(warning.occurred_at, missing, i18n.resolvedLanguage)}</div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <footer className="flex shrink-0 flex-col gap-2 rounded-xl border border-[#2a2e38] bg-[#171b22]/50 p-3" data-testid="performance-source-health">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xs font-bold text-[#f0ece4]">{t("agora.performance.sourceHealth")}</h2><div className="text-[10px] text-[#8c96a6]">{t("agora.performance.returnedRows", { returned: summary.returned_row_count, total: summary.row_count })}</div></div>
        {sourceRows.length > 0 ? <div className="flex flex-wrap gap-2">{sourceRows.map((source) => <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10.5px]", healthClass(source.status))} key={source.name} title={source.detail}><span className="font-medium">{source.name}</span><span>{source.status}</span></span>)}</div> : <p className="text-[11px] text-[#8c96a6]">{t("agora.performance.noSourceMetadata")}</p>}
      </footer>
    </section>
  );
}

function StrategyComparison({
  rows,
  selectedStrategyId,
  onSelect,
  summary,
  data,
}: {
  rows: StrategyPerformanceRow[];
  selectedStrategyId: string | null;
  onSelect: (strategyId: string) => void;
  summary: TradingRoomPerformanceAttributionResponse["data"]["summary"];
  data: StrategyPerformanceData;
}): JSX.Element {
  const { i18n, t } = useTranslation();
  const missing = t("agora.performance.notReported");
  return (
    <div className="mt-2 shrink-0 overflow-hidden rounded-xl border border-[#2a2e38]">
      <div className="flex items-center justify-between border-b border-[#2a2e38] bg-[#101318]/50 p-3"><div className="text-xs font-bold text-[#f0ece4]">{t("agora.performance.overview")} / {t("agora.performance.contribution")}</div><span className="text-[10px] text-[#8c96a6]">{t("agora.performance.returnedRows", { returned: summary.returned_row_count, total: summary.row_count })}</span></div>
      <div className="agora-mobile-only flex-col gap-2 p-3" data-testid="performance-narrow-comparison">
        {rows.map((row) => <button aria-pressed={row.strategyId === selectedStrategyId} className={cn("rounded-lg border p-3 text-left", row.strategyId === selectedStrategyId ? "border-sky-500/60 bg-sky-500/10" : "border-[#2a2e38] bg-[#101318]/50")} data-testid={`performance-narrow-row-${row.id}`} key={row.id} onClick={() => onSelect(row.strategyId)} type="button"><div className="flex items-start justify-between gap-3"><span className="min-w-0 truncate text-xs font-bold text-[#f0ece4]">{row.title}</span><span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px]", sourceStateClass(row))}>{sourceStateLabel(row, t)}</span></div><dl className="mt-3 grid grid-cols-3 gap-2"><div><dt className="text-[9px] text-[#8c96a6]">PnL</dt><dd className="font-mono text-xs text-[#f0ece4]">{formatCurrency(metric(row, "total_pnl"), missing)}</dd></div><div><dt className="text-[9px] text-[#8c96a6]">{t("agora.performance.drawdown")}</dt><dd className="font-mono text-xs text-rose-300">{formatPercent(metric(row, "worst_drawdown"), missing)}</dd></div><div><dt className="text-[9px] text-[#8c96a6]">{t("agora.performance.trades")}</dt><dd className="font-mono text-xs text-[#f0ece4]">{formatNumber(metric(row, "total_trades"), missing)}</dd></div></dl></button>)}
      </div>
      <div className="agora-desktop-only overflow-x-auto">
        <table className="w-full min-w-[750px] text-left text-xs">
          <thead className="border-b border-[#2a2e38] bg-[#101318]/30 text-[9px] uppercase tracking-wider text-[#8c96a6]"><tr><th className="px-3 py-2">{t("agora.performance.strategy")}</th><th className="px-3 py-2">{t("agora.performance.monitoring")}</th><th className="px-3 py-2">PnL</th><th className="px-3 py-2">{t("agora.performance.contribution")}</th><th className="px-3 py-2">{t("agora.performance.drawdown")}</th><th className="px-3 py-2">{t("agora.performance.trades")}</th><th className="px-3 py-2">{t("agora.performance.telemetry")}</th><th className="px-3 py-2">{t("agora.performance.source")}</th></tr></thead>
          <tbody>{rows.map((row) => <tr className={cn("border-b border-[#2a2e38]/50 transition-colors hover:bg-[#101318]/20", row.strategyId === selectedStrategyId && "bg-[#1e2330]/40")} key={row.id}><td className="px-3 py-2 font-medium"><div className="flex items-center gap-1.5"><button className="text-left text-[#f0ece4] hover:underline" onClick={() => onSelect(row.strategyId)} type="button">{row.title}</button><Link className="text-[9px] text-[#3b82f6] hover:underline" title={t("agora.performance.openFormalAttribution")} to={canonicalCenterUrl("performance", "attribution", { strategy: row.strategyId, period: summary.period || data.attribution.data.period })}>[→]</Link></div>{row.description ? <div className="mt-0.5 max-w-[200px] text-[10px] text-sky-200" data-testid={`performance-row-${row.id}-description`}>{row.kind === "attribution_only" ? t(row.description) : row.description}</div> : null}</td><td className="px-3 py-2 text-[#f0ece4]"><div>{row.strategy?.monitoring_state ?? t("agora.performance.notLinked")}</div><div className="mt-0.5 text-[10px] text-[#8c96a6]">{row.strategy?.readiness_state ?? row.attribution?.dimension ?? t("agora.performance.strategy")}</div></td><td className="px-3 py-2 font-mono"><MetricValue format={(value) => formatCurrency(value, missing)} value={metric(row, "total_pnl")} /></td><td className="px-3 py-2 font-mono text-[#f0ece4]">{formatPercent(row.attribution?.pnl_contribution_pct ?? metric(row, "pnl_contribution_pct"), missing)}</td><td className="px-3 py-2 font-mono text-[#f0ece4]">{formatPercent(metric(row, "worst_drawdown"), missing)}</td><td className="px-3 py-2 font-mono"><MetricValue format={(value) => formatNumber(value, missing)} value={metric(row, "total_trades")} /></td><td className="px-3 py-2 text-[#8c96a6]"><div className="text-[#f0ece4]">{formatNumber(metric(row, "telemetry_runtime_count"), missing)}/{formatNumber(metric(row, "runtime_count"), missing)}</div><div className="mt-0.5 text-[10px]">{formatDateTime(metric(row, "latest_telemetry_at"), missing, i18n.resolvedLanguage)}</div></td><td className="px-3 py-2"><span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10px]", sourceStateClass(row))}>{sourceStateLabel(row, t)}</span></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
