import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ObjectListPage, type ObjectListEmptyStateConfig } from "./ObjectListPage";
import { collectorCheckStatus, demandMeasureText, demandPersonaName, demandReasonText, isNonRealRun, isTemplateSearchTask, researchTitle } from "./researchPresentation";
import { ServerPager, freshServerPageCursor, useServerPageCursor } from "@/platform/components/ServerPager";
import {
  bffFetch,
  lists,
  mgmt,
  paths,
  LIST_CLASS_BY_KEY,
  normalizeBaseObjectFields,
  normalizeLiveListResponse,
  listResearchTasksEnvelope,
  listMeetingResearchTickets,
  EVOLUTION_QUALIFICATION_CRITERIA,
  type EvolutionQualificationReport,
  type StrategyListQueryOptions,
} from "@/lib/bff-v1";
import { normalizeEvolutionOriginKind } from "@/lib/bff-v1/evolution";
import { isRecordedTestRecord, splitReasonCode } from "./oversight/evolutionJournalFocus";
import {
  artifactKindText,
  artifactSourceText,
  normalizeRegistryListScope,
  normalizeStrategyOperationalStatus,
  normalizeStrategyRuntimeStatus,
  personaArchetypeText,
  rebalanceWorkflowLabel,
  resolveBffSubjectDisplay,
  shortOwnerText,
  strategyMetricsReasonText,
  strategyOperationalStatusClass,
  strategyRuntimeReasonText,
  strategyRuntimeStatusClass,
  type RegistryListScope,
} from "@/lib/enumLabels";
import { useT } from "@/platform/hooks";
import { formulaVersion, formulaWeightSummary } from "./RankingFormulaDetail";
import { safeDateTime } from "@/lib/utils";
import type { Strategy, Persona, CapitalPool, RankingFormula, Rebalance, Deployment, EvolutionProgram, ResearchTask, ResearchDemand, ResearchDemandsSurface, ResearchTicketsRead, Artifact, ListEnvelope, RiskLevel } from "@/lib/bff-v1";
import { StatusBadge } from "@/platform/components/StatusBadge";
import type { Column } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// `lists.*` loaders are generically typed by `strictLiveListLoader<T>` in
// src/lib/bff-v1/lists.ts; when the passed `adaptItem` is itself generic
// (e.g. `normalizeBaseObjectFields`), TS's inference collapses T to
// `unknown` at the call site inside lists.ts rather than the concrete
// entity type. The runtime shape is correct (each loader really does
// resolve to ListEnvelope<Entity>); we just re-assert the known entity
// type here at the consumption boundary instead of editing the shared,
// out-of-scope lists.ts file.
const asEntityLoader = <T,>(loader: () => Promise<ListEnvelope<unknown>>): (() => Promise<ListEnvelope<T>>) =>
  loader as unknown as () => Promise<ListEnvelope<T>>;
import {
  capitalPoolsWithFleetFallback,
  capitalPoolMatchesFocus,
  classifyCapitalPoolScope,
  type FleetCapitalPool,
} from "./capitalPoolsFleetFallback";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/platform/components/StatCard";

// Defensive numeric formatters — live BFF rows can omit numeric fields; never crash a cell.
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const fix = (v: unknown, d = 2): string => num(v).toFixed(d);
const pct = (v: unknown, d = 0): string => `${(num(v) * 100).toFixed(d)}%`;
const loc = (v: unknown): string => num(v).toLocaleString();
const hasNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isAllocatedReported(row: CapitalPool): row is CapitalPool & { allocated: number } {
  if (row.reportedFields && row.reportedFields.allocated === false) return false;
  return hasNumber(row.allocated);
}

function isUtilizedReported(row: CapitalPool): row is CapitalPool & { utilized: number } {
  if (row.reportedFields && row.reportedFields.utilized === false) return false;
  return hasNumber(row.utilized);
}

function isRiskBudgetReported(row: CapitalPool): row is CapitalPool & { riskBudget: number } {
  if (row.reportedFields && row.reportedFields.riskBudget === false) return false;
  return hasNumber(row.riskBudget);
}

function isCurrencyReported(row: CapitalPool): boolean {
  if (row.reportedFields && row.reportedFields.currency === false) return false;
  return typeof row.currency === "string" && row.currency.trim().length > 0;
}

function isActiveCapitalPool(row: CapitalPool): boolean {
  if (row.state === "deployed" || row.state === "approved") return true;
  return String(row.status ?? "").trim().toLowerCase() === "active";
}

function capitalScopeLabel(value: unknown): string {
  const scope = String(value ?? "").trim().toLowerCase();
  if (scope === "paper" || scope === "paper_ledger") return "paper";
  if (scope === "canary") return "canary";
  if (scope === "live") return "live";
  return "capital";
}

function capitalScopeClass(scope: string): string {
  if (scope === "live") return "border-status-failed/40 text-status-failed";
  if (scope === "canary") return "border-status-warning/40 text-status-warning";
  if (scope === "paper") return "border-status-success/40 text-status-success";
  return "border-muted text-muted-foreground";
}

function personaCountLabel(count?: number): string {
  if (!count) return "Unbound";
  return `${count} persona${count === 1 ? "" : "s"}`;
}

function CapitalPoolNameCell(row: FleetCapitalPool) {
  const scope = capitalScopeLabel(row.capitalScope);
  const summary = row.bindingSummary ?? (row.personaCount ? row.personaNames : "Unbound");
  return (
    <div className="min-w-0">
      <div className="font-medium text-foreground">{row.name}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={capitalScopeClass(scope)}>{scope}</Badge>
        <span className="text-xs font-medium text-foreground">{personaCountLabel(row.personaCount)}</span>
        {summary && (
          <span className="max-w-[360px] truncate text-xs text-muted-foreground" title={row.personaNames || summary}>
            {summary}
          </span>
        )}
      </div>
      {row.bindingDetail && (
        <div className="mt-1 max-w-[520px] truncate font-mono text-xs text-muted-foreground" title={row.bindingDetail}>
          {row.bindingDetail}
        </div>
      )}
    </div>
  );
}

const currencyBreakdown = (rows: CapitalPool[], pick: (row: CapitalPool) => number, mixedLabel: string) => {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency || "USD";
    totals.set(currency, (totals.get(currency) ?? 0) + pick(row));
  }
  const parts = Array.from(totals.entries()).map(([currency, value]) => `${currency} ${loc(value)}`);
  return {
    headline: parts.length === 1 ? parts[0] : mixedLabel,
    hint: parts.length > 1 ? parts.join(" · ") : undefined,
  };
};

export const STRATEGY_PAGE_SIZE = 20;

export const STRATEGY_BASE_FILTER_OPTIONS = [
  "default",
  "approved",
  "review",
  "retired",
  "draft",
  "all",
] as const;

export interface StrategyStateCounts {
  byState: Record<string, number>;
  allCount: number;
  draftCount: number | undefined;
}

/**
 * Tab numbers come only from `meta.visible_state_counts`
 * (REGISTRY-STRATEGY-LIST-OWNER-HIDE-20261125): the rows the owner did not
 * hide, which is what each tab's pager total counts. `meta.state_counts` also
 * counts hidden test/stub rows, so it is never printed; when
 * `visible_state_counts` is absent or null the tabs print no number.
 */
export function extractStrategyStateCounts(meta: unknown): StrategyStateCounts | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const rawCounts = (meta as { visible_state_counts?: unknown }).visible_state_counts;
  if (!rawCounts || typeof rawCounts !== "object" || Array.isArray(rawCounts)) return null;
  const byState: Record<string, number> = {};
  let hasNumericEntry = false;
  let allCount = 0;
  for (const [key, value] of Object.entries(rawCounts as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      hasNumericEntry = true;
      byState[key] = value;
      if (key !== "retired") {
        allCount += value;
      }
    }
  }
  if (!hasNumericEntry) return null;
  return {
    byState,
    allCount,
    draftCount: byState.draft,
  };
}

export function extractStrategyPageInfoTotal(meta: unknown): number | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const rawPageInfo = (meta as { page_info?: unknown }).page_info;
  if (!rawPageInfo || typeof rawPageInfo !== "object" || Array.isArray(rawPageInfo)) {
    return undefined;
  }
  const total = (rawPageInfo as { total?: unknown }).total;
  return typeof total === "number" && Number.isFinite(total) && total >= 0
    ? total
    : undefined;
}

export function extractHiddenRetiredPersonaCount(meta: unknown): number | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const count = (meta as { hidden_retired_persona_count?: unknown }).hidden_retired_persona_count;
  return typeof count === "number" && Number.isFinite(count) && count >= 0
    ? count
    : undefined;
}

export function extractHiddenTestPersonaStrategyCount(meta: unknown): number | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const record = meta as {
    hidden_test_persona_strategy_count?: unknown;
    hiddenTestPersonaStrategyCount?: unknown;
    hidden_test_strategy_count?: unknown;
    hiddenTestStrategyCount?: unknown;
    hidden_test_persona_count?: unknown;
    hiddenTestPersonaCount?: unknown;
    hidden_unbound_stub_strategy_count?: unknown;
  };
  const stub = record.hidden_unbound_stub_strategy_count;
  const stubCount = typeof stub === "number" && Number.isFinite(stub) && stub >= 0 ? stub : undefined;
  const count =
    record.hidden_test_persona_strategy_count ??
    record.hiddenTestPersonaStrategyCount ??
    record.hidden_test_strategy_count ??
    record.hiddenTestStrategyCount ??
    record.hidden_test_persona_count ??
    record.hiddenTestPersonaCount;
  const testCount = typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : undefined;
  if (testCount === undefined && stubCount === undefined) return undefined;
  return (testCount ?? 0) + (stubCount ?? 0);
}

/** The two parts of the hidden-test banner number, when the BFF sends both. */
export function extractHiddenTestBreakdown(
  meta: unknown,
): { testCount: number; stubCount: number } | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const record = meta as {
    hidden_test_persona_strategy_count?: unknown;
    hidden_unbound_stub_strategy_count?: unknown;
  };
  const test = record.hidden_test_persona_strategy_count;
  const stub = record.hidden_unbound_stub_strategy_count;
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!ok(test) || !ok(stub)) return undefined;
  return { testCount: test, stubCount: stub };
}

export function extractIncludeTestPersonas(meta: unknown): boolean | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const record = meta as {
    include_test_personas?: unknown;
    includeTestPersonas?: unknown;
  };
  const flag = record.include_test_personas ?? record.includeTestPersonas;
  return typeof flag === "boolean" ? flag : undefined;
}

export type ExtendedStrategyListQueryOptions = StrategyListQueryOptions & {
  include_test_personas?: boolean;
  includeTestPersonas?: boolean;
};

const baseStrategiesLoader = lists.strategies;
(lists as unknown as { strategies: (options?: ExtendedStrategyListQueryOptions) => Promise<ListEnvelope<unknown>> }).strategies =
  async (options?: ExtendedStrategyListQueryOptions) => {
    const includeTest = options?.include_test_personas ?? options?.includeTestPersonas;
    if (typeof includeTest !== "boolean") {
      return baseStrategiesLoader(options);
    }
    const query: Record<string, string | number | undefined> = {};
    const state = options?.state?.trim();
    const excludeState = (options?.exclude_state ?? options?.excludeState)?.trim();
    const hideRetiredPersonas =
      options?.hide_retired_personas ?? options?.hideRetiredPersonas;
    const personaId = (options?.persona_id ?? options?.personaId)?.trim();
    const pageSize = options?.page_size ?? options?.pageSize;
    const pageToken = (options?.page_token ?? options?.pageToken)?.trim();
    if (state) query.state = state;
    if (excludeState) query.exclude_state = excludeState;
    if (typeof hideRetiredPersonas === "boolean") {
      query.hide_retired_personas = hideRetiredPersonas ? "true" : "false";
    }
    query.include_test_personas = includeTest ? "true" : "false";
    if (personaId) query.persona_id = personaId;
    if (typeof pageSize === "number" && Number.isFinite(pageSize) && pageSize > 0) {
      query.page_size = pageSize;
    }
    if (pageToken) query.page_token = pageToken;
    const data = await bffFetch<unknown>({
      method: "GET",
      path: paths.strategies(),
      query,
    });
    const env = normalizeLiveListResponse<unknown>(data, LIST_CLASS_BY_KEY.strategies);
    const record =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    const asRec = (v: unknown) =>
      typeof v === "object" && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    const rawPageInfo =
      asRec(record?.page_info) ??
      asRec(asRec(record?.data)?.page_info) ??
      asRec(asRec(record?.meta)?.page_info);
    const envMeta = asRec(env.meta);
    const meta =
      envMeta || rawPageInfo
        ? {
            ...(envMeta ?? {}),
            ...(rawPageInfo && envMeta?.page_info === undefined
              ? { page_info: rawPageInfo }
              : {}),
          }
        : undefined;
    const adapted = env.items
      .map((item) => normalizeBaseObjectFields(item as Record<string, unknown>))
      .filter((item): item is Record<string, unknown> => Boolean(item));
    const lowerExclude = excludeState?.toLowerCase();
    const stateFiltered = lowerExclude
      ? adapted.filter((item) => String(item?.state ?? "").trim().toLowerCase() !== lowerExclude)
      : adapted;
    const items = hideRetiredPersonas
      ? stateFiltered.filter(
          (item) => String(item?.operationalStatus ?? "").trim().toLowerCase() !== "retired",
        )
      : stateFiltered;
    return {
      ...env,
      items,
      pageSize: items.length,
      ...(meta ? { meta } : {}),
    };
  };

export { normalizeStrategyOperationalStatus, strategyOperationalStatusClass };

export function normalizeStrategyFilterParam(rawStateParam: string | null | undefined): string {
  const trimmed = rawStateParam?.trim().toLowerCase() ?? "";
  if (!trimmed || trimmed === "default") return "default";
  return trimmed;
}

export function resolveStrategyListQuery(
  activeFilter: string,
  pageToken?: string,
  pageSizeOrOpts: number | { includeTestPersonas?: boolean } = STRATEGY_PAGE_SIZE,
  includeTestPersonasOrOpts?: boolean | { includeTestPersonas?: boolean },
): ExtendedStrategyListQueryOptions {
  const pageSize =
    typeof pageSizeOrOpts === "number" ? pageSizeOrOpts : STRATEGY_PAGE_SIZE;
  const includeTestPersonas =
    typeof pageSizeOrOpts === "object" && pageSizeOrOpts !== null
      ? pageSizeOrOpts.includeTestPersonas
      : typeof includeTestPersonasOrOpts === "object" && includeTestPersonasOrOpts !== null
        ? includeTestPersonasOrOpts.includeTestPersonas
        : includeTestPersonasOrOpts;
  const testOpt = includeTestPersonas === true ? { include_test_personas: true } : {};
  if (activeFilter === "default") {
    return {
      exclude_state: "draft",
      hide_retired_personas: true,
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
      ...testOpt,
    };
  }
  if (activeFilter === "all") {
    return {
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
      ...testOpt,
    };
  }
  return {
    state: activeFilter,
    page_size: pageSize,
    ...(pageToken ? { page_token: pageToken } : {}),
    ...testOpt,
  };
}

type ListT = (key: string, options?: Record<string, unknown>) => string;

/**
 * FE-REGISTRY-LISTS-CURRENT-FIRST-20261125 — the strategy table shows only
 * owner-backed values: name, state, runtime status (with its plain reason),
 * symbols, the cumulative paper result with its as-of time, drawdown, trades
 * and persona. Alpha, 30-day PnL, Sharpe (always null on this path) and the
 * raw capital-pool id are not shown. The minimum widths sum to 900 px so the
 * table fits the 1274 px window beside the 240 px navigation without
 * horizontal scrolling, and the name column keeps at least 220 px.
 */
export const STRATEGY_COLUMN_MIN_WIDTHS = {
  name: 230,
  state: 88,
  runtime: 112,
  symbols: 80,
  result: 120,
  drawdown: 92,
  trades: 76,
  persona: 100,
} as const;

/**
 * Compact cells: 8 px side padding and headers that may wrap. The table card
 * is 939 px wide in a 1274 px window (240 px navigation), so these sums stay
 * under 935 px.
 */
export const COMPACT_COLUMN_CLASS = "px-2 !whitespace-normal";

function strategyMissingValue(r: Strategy, t: ListT, noData: string): { text: string; code?: string } {
  const reason = strategyMetricsReasonText(r.metricsReason, t);
  return reason ? { text: reason.text, code: reason.code } : { text: noData };
}

function StrategyRuntimeCell({ row, t, noData }: { row: Strategy; t: ListT; noData: string }) {
  const runtime = normalizeStrategyRuntimeStatus(row.runtimeStatus);
  const operational = normalizeStrategyOperationalStatus(row.operationalStatus);
  if (!runtime) {
    // Older BFF without runtimeStatus: keep the persona-stage status it sends.
    if (!operational) {
      return <span className="text-mono text-xs text-muted-foreground">{noData}</span>;
    }
    return (
      <Badge
        variant="outline"
        data-testid="strategy-operational-status"
        data-operational-status={operational}
        className={`text-xs ${strategyOperationalStatusClass(operational)}`}
      >
        {t(`strategy.operationalStatus.${operational}`)}
      </Badge>
    );
  }
  const reason = strategyRuntimeReasonText(row.runtimeStatusReason, t);
  // With no runtime binding the persona stage is the plain reason (retired,
  // unbound, idle); "running" there only means the persona stage, so it is not
  // repeated under "Not running".
  const personaReason =
    !reason && runtime === "none" && operational && operational !== "running"
      ? t(`strategy.operationalStatus.${operational}`)
      : undefined;
  const reasonText = reason?.text ?? personaReason;
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <Badge
        variant="outline"
        data-testid="strategy-runtime-status"
        data-runtime-status={runtime}
        className={`text-xs !whitespace-normal text-left ${strategyRuntimeStatusClass(runtime)}`}
      >
        {t(`strategy.runtimeStatus.${runtime}`)}
      </Badge>
      {reasonText && (
        <span
          className="line-clamp-2 text-[11px] leading-tight text-muted-foreground"
          data-testid="strategy-runtime-reason"
          title={reason ? `${reason.text} (${reason.code})` : undefined}
        >
          {reasonText}
        </span>
      )}
    </div>
  );
}

export function buildStrategyColumns(t: ListT, noData: string): Column<Strategy>[] {
  const w = STRATEGY_COLUMN_MIN_WIDTHS;
  return [
    {
      key: "name",
      header: t("common.name"),
      minWidth: w.name,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium line-clamp-2 break-words" title={r.name || r.id}>{r.name || r.id}</div>
          {r.id && r.name && r.id !== r.name && (
            <div
              className="max-w-[200px] truncate font-mono text-xs text-muted-foreground"
              title={r.id}
              data-testid="object-secondary-id"
            >
              {r.id}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "state",
      header: t("common.state"),
      minWidth: w.state,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) => <span className="inline-flex whitespace-nowrap"><StatusBadge state={r.state} /></span>,
    },
    {
      key: "runtime",
      header: t("strategy.list.column.runtime"),
      minWidth: w.runtime,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) => <StrategyRuntimeCell row={r} t={t} noData={noData} />,
    },
    {
      key: "symbols",
      header: t("strategy.list.column.symbols"),
      minWidth: w.symbols,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) => {
        const symbols = Array.isArray(r.symbols)
          ? r.symbols.map((s) => String(s).trim()).filter(Boolean)
          : [];
        if (symbols.length === 0) {
          return (
            <span
              data-testid="strategy-symbols"
              className="text-mono text-xs whitespace-nowrap text-muted-foreground"
            >
              {noData}
            </span>
          );
        }
        return (
          <span
            data-testid="strategy-symbols"
            className="inline-flex flex-wrap gap-x-1.5 gap-y-0.5 text-mono text-xs text-foreground"
          >
            {symbols.map((symbol, index) => (
              <span
                key={`${symbol}-${index}`}
                data-testid="strategy-symbol-item"
                className="whitespace-nowrap"
              >
                {index < symbols.length - 1 ? `${symbol}, ` : symbol}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: "cumulativePnl",
      header: t("strategy.list.column.cumulativeResult"),
      minWidth: w.result,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) => {
        if (!hasNumber(r.pnl)) {
          const missing = strategyMissingValue(r, t, noData);
          return (
            <span
              className="text-xs text-muted-foreground"
              data-testid="strategy-result-missing"
              data-metrics-reason={missing.code}
              title={missing.code}
            >
              {missing.text}
            </span>
          );
        }
        const toneClass =
          r.pnl === 0 ? "text-foreground" : r.pnl > 0 ? "text-status-success" : "text-status-failed";
        const asOf = r.metricsAsOf?.trim() || "";
        return (
          <div className="flex flex-col" data-testid="strategy-result">
            <span className={`text-mono text-xs ${toneClass}`}>
              {r.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {asOf && (
              <span className="text-[11px] leading-tight text-muted-foreground" data-testid="strategy-result-as-of">
                {t("strategy.list.asOf", { asOf: safeDateTime(asOf) })}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "drawdown",
      header: t("strategy.list.column.drawdown"),
      minWidth: w.drawdown,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) => {
        if (!hasNumber(r.drawdown)) {
          const missing = strategyMissingValue(r, t, noData);
          return (
            <span className="text-mono text-xs text-muted-foreground" title={missing.text}>
              {noData}
            </span>
          );
        }
        const toneClass = r.drawdown === 0 ? "text-foreground" : "text-status-warning";
        return <span className={`text-mono text-xs ${toneClass}`}>{`${(r.drawdown * 100).toFixed(2)}%`}</span>;
      },
    },
    {
      key: "trades",
      header: t("strategy.list.column.trades"),
      minWidth: w.trades,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) =>
        hasNumber(r.totalTrades) ? (
          <span className="text-mono text-xs text-foreground" data-testid="strategy-trades">{r.totalTrades}</span>
        ) : (
          <span className="text-mono text-xs text-muted-foreground" data-testid="strategy-trades">{noData}</span>
        ),
    },
    {
      key: "persona",
      header: t("strategy.list.column.persona"),
      minWidth: w.persona,
      className: COMPACT_COLUMN_CLASS,
      cell: (r) => {
        const ids = Array.isArray(r.personaIds) ? r.personaIds.filter((id) => typeof id === "string" && id.trim()) : [];
        if (ids.length === 0) {
          return <span className="text-xs text-muted-foreground">{t("strategy.list.noPersona")}</span>;
        }
        const names = r.persona_display_names ?? {};
        const labels = ids.map((id) => {
          const name = typeof names[id] === "string" ? names[id].trim() : "";
          return name || id;
        });
        return (
          <span
            className="block text-xs text-foreground [overflow-wrap:anywhere]"
            title={t("strategy.list.personaIdsTooltip", { ids: ids.join(", ") })}
            data-testid="strategy-persona"
          >
            {labels.join(", ")}
          </span>
        );
      },
    },
  ];
}

export const StrategiesList = () => {
  const t = useT();
  const noData = t("common.noData");
  const strategyColumns = buildStrategyColumns(t, noData);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = normalizeStrategyFilterParam(searchParams.get("state"));
  const includeTestPersonas = searchParams.get("include_test_personas") === "true";
  const cursorScope = includeTestPersonas ? `${activeFilter}:include_test` : activeFilter;

  const [effectivePageCursor, setPageCursorState] = useServerPageCursor(cursorScope);

  const loadStrategiesPage = useCallback(() => {
    const query = resolveStrategyListQuery(
      activeFilter,
      effectivePageCursor.currentToken,
      STRATEGY_PAGE_SIZE,
      includeTestPersonas,
    );
    return asEntityLoader<Strategy>(() => (lists.strategies as (q?: ExtendedStrategyListQueryOptions) => Promise<ListEnvelope<unknown>>)(query))();
  }, [activeFilter, effectivePageCursor.currentToken, includeTestPersonas]);

  const reloadKey = `strategies:${cursorScope}:${effectivePageCursor.currentToken ?? ""}`;

  const selectStateFilter = (targetFilter: string) => {
    const normalized = normalizeStrategyFilterParam(targetFilter);
    const nextScope = includeTestPersonas ? `${normalized}:include_test` : normalized;
    setPageCursorState(freshServerPageCursor(nextScope));
    const nextParams = new URLSearchParams(searchParams);
    if (normalized === "default") {
      nextParams.delete("state");
    } else {
      nextParams.set("state", normalized);
    }
    setSearchParams(nextParams);
  };

  const toggleIncludeTestPersonas = () => {
    const nextInclude = !includeTestPersonas;
    const nextScope = nextInclude ? `${activeFilter}:include_test` : activeFilter;
    setPageCursorState(freshServerPageCursor(nextScope));
    const nextParams = new URLSearchParams(searchParams);
    if (nextInclude) {
      nextParams.set("include_test_personas", "true");
    } else {
      nextParams.delete("include_test_personas");
    }
    setSearchParams(nextParams);
  };

  return (
    <ObjectListPage<Strategy>
      title={t("nav.strategies")}
      loader={loadStrategiesPage}
      reloadKey={reloadKey}
      basePath="/management/strategies" liveKinds={["Strategy"]}
      createBehavior={{ kind: "drawer", entity: "strategy" }}
      topControls={(ctx) => {
        const stateCounts = extractStrategyStateCounts(ctx.meta);
        const pageInfoTotal = extractStrategyPageInfoTotal(ctx.meta);
        const hiddenRetiredCount = extractHiddenRetiredPersonaCount(ctx.meta);
        const hiddenTestPersonaStrategyCount = extractHiddenTestPersonaStrategyCount(ctx.meta);
        const hiddenTestBreakdown = extractHiddenTestBreakdown(ctx.meta);
        const hasHiddenTestPersonaStrategyCount =
          typeof hiddenTestPersonaStrategyCount === "number" &&
          Number.isFinite(hiddenTestPersonaStrategyCount);
        const baseIds: string[] = [...STRATEGY_BASE_FILTER_OPTIONS];
        if (!baseIds.includes(activeFilter)) {
          baseIds.push(activeFilter);
        }
        const filterOptions = baseIds.map((id) => {
          const label =
            id === "default"
              ? t("strategy.list.filter.default")
              : id === "all"
                ? t("common.all")
                : t(`status.${id}`, { defaultValue: id });
          // Numbers print only when the owner sent visible_state_counts. The
          // active tab prints its own pager total (page_info.total), which the
          // contract makes equal to the visible count of that filter; the
          // default tab also drops retired-persona rows, so it has a number
          // only while it is the active tab.
          const visibleCount =
            stateCounts === null || id === "default"
              ? undefined
              : id === "all"
                ? stateCounts.allCount
                : stateCounts.byState[id];
          const count =
            stateCounts === null
              ? undefined
              : id === activeFilter && typeof pageInfoTotal === "number"
                ? pageInfoTotal
                : visibleCount;
          return { id, label, count };
        });

        const draftCount = stateCounts?.draftCount;
        const hasDraftCount = typeof draftCount === "number" && Number.isFinite(draftCount);
        const hasHiddenRetiredCount =
          typeof hiddenRetiredCount === "number" && Number.isFinite(hiddenRetiredCount);

        const bannerNoticeText =
          hasDraftCount && hasHiddenRetiredCount
            ? t("strategy.list.hiddenDraftsAndRetiredPersonasWithCounts", {
                draftCount,
                retiredPersonaCount: hiddenRetiredCount,
              })
            : hasDraftCount
              ? t("strategy.list.hiddenDraftsWithCount", { count: draftCount })
              : hasHiddenRetiredCount
                ? t("strategy.list.hiddenRetiredPersonasWithCount", {
                    retiredPersonaCount: hiddenRetiredCount,
                  })
                : t("strategy.list.hiddenDraftsNoCount");

        return (
          <>
            <div
              role="group"
              aria-label={t("strategy.list.filter.groupLabel")}
              data-testid="strategy-state-filter"
              className="mb-3 flex flex-wrap items-center gap-2"
            >
              {filterOptions.map((option) => {
                const selected = activeFilter === option.id;
                const hasCount = typeof option.count === "number" && Number.isFinite(option.count);
                return (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    data-strategy-state={option.id}
                    data-state-count={hasCount ? option.count : undefined}
                    onClick={() => selectStateFilter(option.id)}
                  >
                    {hasCount ? `${option.label} (${option.count})` : option.label}
                  </Button>
                );
              })}
            </div>
            {activeFilter === "draft" && (
              <Card
                data-testid="strategy-draft-notice"
                role="note"
                className="mb-3 border-status-warning/40 bg-status-warning/10 p-3 text-sm text-foreground"
              >
                {t("strategy.list.draftNotice")}
              </Card>
            )}
            {activeFilter === "default" && !ctx.isInitialLoading && !ctx.isDegradedEmpty && (
              <Card
                data-testid="strategy-hidden-drafts-banner"
                className="mb-3 flex flex-wrap items-center justify-between gap-2 border-border/70 bg-muted/20 p-3 text-sm"
              >
                <span className="text-foreground">{bannerNoticeText}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="strategy-show-drafts-button"
                  onClick={() => selectStateFilter("draft")}
                >
                  {hasDraftCount
                    ? t("strategy.list.showDraftsWithCount", { count: draftCount })
                    : t("strategy.list.showDraftsNoCount")}
                </Button>
              </Card>
            )}
            {!ctx.isInitialLoading &&
              !ctx.isDegradedEmpty &&
              (hasHiddenTestPersonaStrategyCount || includeTestPersonas) && (
                <Card
                  data-testid="strategy-test-personas-banner"
                  className="mb-3 flex flex-wrap items-center justify-between gap-2 border-border/70 bg-muted/20 p-3 text-sm"
                >
                  <span className="text-foreground" data-testid="strategy-hidden-test-personas-text">
                    {includeTestPersonas
                      ? t("strategy.list.showingTestPersonaStrategies")
                      : hasHiddenTestPersonaStrategyCount
                        ? t("strategy.list.hiddenTestPersonaStrategiesWithCount", {
                            count: hiddenTestPersonaStrategyCount,
                          })
                        : t("strategy.list.hiddenTestPersonaStrategiesNoCount")}
                    {!includeTestPersonas && hiddenTestBreakdown && (
                      <span className="ml-1 text-muted-foreground" data-testid="strategy-hidden-test-breakdown">
                        {t("strategy.list.hiddenTestBreakdown", hiddenTestBreakdown)}
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={includeTestPersonas ? "default" : "outline"}
                    aria-pressed={includeTestPersonas}
                    data-testid="strategy-toggle-test-personas-button"
                    onClick={toggleIncludeTestPersonas}
                  >
                    {includeTestPersonas
                      ? t("strategy.list.hideTestPersonaStrategies")
                      : hasHiddenTestPersonaStrategyCount
                        ? t("strategy.list.showTestPersonaStrategiesWithCount", {
                            count: hiddenTestPersonaStrategyCount,
                          })
                        : t("strategy.list.showTestPersonaStrategiesNoCount")}
                  </Button>
                </Card>
              )}
          </>
        );
      }}
      bottomControls={(ctx) => {
        if (ctx.isInitialLoading || ctx.isDegradedEmpty) return null;
        return (
          <ServerPager
            cursor={effectivePageCursor}
            setCursor={setPageCursorState}
            pageSize={STRATEGY_PAGE_SIZE}
            total={ctx.estimatedTotal}
            visibleCount={ctx.visibleRows.length}
            nextToken={ctx.cursor?.next}
            loading={ctx.loading}
            testIdPrefix="strategy"
            ariaLabel={t("strategy.list.pagination.label")}
          />
        );
      }}
      columns={strategyColumns}
    />
  );
};

// FE-REGISTRY-LISTS-CURRENT-FIRST-20261125 — Persona and Artifact lists open
// on the current rows. The BFF row field `listScope` / `list_scope` decides the
// tab; a row without a recorded scope (older BFF, or `unknown` because the
// persona directory could not be read) stays on the default Current tab so no
// row disappears.
type CurrentFirstTab = "current" | "test" | "retired" | "research" | "unbound" | "all";

export function classifyCurrentFirstScope(
  row: unknown,
  tabs: readonly CurrentFirstTab[],
  fallback?: (row: unknown) => RegistryListScope | undefined,
): CurrentFirstTab {
  let scope: RegistryListScope = normalizeRegistryListScope(row);
  if (scope === "unknown" && fallback) scope = fallback(row) ?? "unknown";
  if (scope !== "unknown" && scope !== "current" && (tabs as readonly string[]).includes(scope)) {
    return scope as CurrentFirstTab;
  }
  return "current";
}

export function countUnknownScopeRows(rows: readonly unknown[], fallback?: (row: unknown) => RegistryListScope | undefined): number {
  let count = 0;
  for (const row of rows) {
    if (normalizeRegistryListScope(row) !== "unknown") continue;
    if (fallback && fallback(row)) continue;
    count += 1;
  }
  return count;
}

function UnknownScopeNotice({ count }: { count: number }) {
  const t = useT();
  if (count <= 0) return null;
  return (
    <p className="mb-3 text-xs text-muted-foreground" data-testid="list-unknown-scope-notice" data-unknown-scope-count={count}>
      {t("registryLists.unknownScopeNotice", { count })}
    </p>
  );
}

function currentFirstEmptyState(
  t: ListT,
  scope: string,
  counts: Record<string, number>,
  buildScopeHref: (target: string) => string,
): ObjectListEmptyStateConfig | undefined {
  if (scope !== "current") return undefined;
  const elsewhere = (counts.all ?? 0) - (counts.current ?? 0);
  if (elsewhere <= 0) return undefined;
  return {
    title: t("registryLists.emptyCurrent.title"),
    description: t("registryLists.emptyCurrent.description", { count: elsewhere }),
    actionLabel: t("registryLists.emptyCurrent.action", { count: counts.all ?? elsewhere }),
    actionTo: buildScopeHref("all"),
  };
}

export const PERSONA_SCOPE_TABS = ["current", "test", "retired", "research", "all"] as const;

export const PERSONA_COLUMN_MIN_WIDTHS = {
  name: 230,
  state: 88,
  risk: 72,
  type: 92,
  strategies: 104,
  winRate: 76,
  owner: 142,
  updated: 96,
} as const;

/** `null` / missing win rate is "no data", never 0%. */
export function personaWinRateText(value: unknown, noData: string): string {
  return hasNumber(value) ? pct(value) : noData;
}

export function hasPersonaRoutedStrategies(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const record = row as { routedStrategies?: unknown; routed_strategies?: unknown };
  const count = hasNumber(record.routedStrategies)
    ? record.routedStrategies
    : hasNumber(record.routed_strategies)
      ? record.routed_strategies
      : 0;
  return count >= 1;
}

/**
 * FE-PERSONA-LIST-PLAIN-WORDS-20261125 — Personas with one or more routed
 * strategies are listed before the others while keeping relative order
 * otherwise unchanged.
 */
export function orderPersonasByRoutedStrategies<T>(rows: readonly T[]): T[] {
  const withStrategies: T[] = [];
  const others: T[] = [];
  for (const row of rows) {
    if (hasPersonaRoutedStrategies(row)) {
      withStrategies.push(row);
    } else {
      others.push(row);
    }
  }
  return [...withStrategies, ...others];
}

function OwnerCell({ owner, noData }: { owner: unknown; noData: string }) {
  const resolved = shortOwnerText(owner);
  if (!resolved) {
    return <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>;
  }
  return (
    <span
      className="text-mono text-xs block max-w-[144px] truncate whitespace-nowrap"
      title={resolved.full}
      data-full-owner={resolved.full}
      data-testid="owner-cell"
    >
      {resolved.text}
    </span>
  );
}

export const PersonasList = () => {
  const t = useT();
  const noData = t("common.noData");
  const w = PERSONA_COLUMN_MIN_WIDTHS;
  const loadPersonas = useCallback(
    () =>
      asEntityLoader<Persona>(lists.personas)().then((env) => ({
        ...env,
        items: orderPersonasByRoutedStrategies(env.items),
      })),
    [],
  );
  return (
    <ObjectListPage<Persona>
      title={t("nav.personas")}
      loader={loadPersonas}
      basePath="/management/personas" liveKinds={["Persona"]}
      createBehavior={{ kind: "drawer", entity: "persona" }}
      scopeConfig={{
        paramName: "list_scope",
        defaultScope: "current",
        groupLabel: t("registryLists.scope.personaGroupLabel"),
        options: PERSONA_SCOPE_TABS.map((id) => ({ id, label: t(`registryLists.scope.${id}`) })),
        classify: (row) => classifyCurrentFirstScope(row, PERSONA_SCOPE_TABS),
        emptyStateForScope: (scope, counts, buildScopeHref) => currentFirstEmptyState(t, scope, counts, buildScopeHref),
      }}
      topControls={(ctx) => <UnknownScopeNotice count={countUnknownScopeRows(ctx.rows)} />}
      columns={[
        {
          key: "name",
          header: t("common.name"),
          minWidth: w.name,
          className: COMPACT_COLUMN_CLASS,
          cell: (r) => (
            <div className="min-w-0">
              <div className="font-medium line-clamp-2 break-words" title={r.name || r.id}>{r.name || r.id}</div>
              {r.id && r.name && r.id !== r.name && (
                <div className="max-w-[200px] truncate font-mono text-xs text-muted-foreground" title={r.id} data-testid="object-secondary-id">
                  {r.id}
                </div>
              )}
            </div>
          ),
        },
        { key: "state", header: t("common.state"), minWidth: w.state, className: COMPACT_COLUMN_CLASS, cell: (r) => <span className="inline-flex whitespace-nowrap"><StatusBadge state={r.state} /></span> },
        { key: "risk", header: t("common.risk"), minWidth: w.risk, className: COMPACT_COLUMN_CLASS, cell: (r) => <span className="inline-flex whitespace-nowrap"><RiskBadge level={r.risk} /></span> },
        {
          key: "arch",
          header: t("table.type"),
          minWidth: w.type,
          className: COMPACT_COLUMN_CLASS,
          cell: (r) => {
            const display = personaArchetypeText(r.archetype, t);
            if (!display) {
              return <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>;
            }
            if (display.isSentence) {
              return (
                <span
                  className="block max-w-[104px] truncate whitespace-nowrap text-xs cursor-help"
                  title={display.tooltip}
                  data-testid="persona-type"
                  data-persona-type-kind="sentence"
                >
                  {display.text}
                </span>
              );
            }
            return (
              <span
                className={`text-xs whitespace-nowrap ${display.isKnown ? "cursor-help" : ""}`}
                title={display.tooltip}
                data-testid="persona-type"
                data-persona-type-kind={display.isKnown ? "code" : "unknown"}
                data-code={display.code}
              >
                {display.text}
              </span>
            );
          },
        },
        { key: "rs", header: t("registryLists.column.routedStrategies"), minWidth: w.strategies, className: COMPACT_COLUMN_CLASS, cell: (r) => <span className="text-mono text-xs">{hasNumber(r.routedStrategies) ? r.routedStrategies : noData}</span> },
        {
          key: "sr",
          header: t("table.winRate"),
          minWidth: w.winRate,
          className: COMPACT_COLUMN_CLASS,
          cell: (r) => (
            <span
              className={`text-mono text-xs ${hasNumber(r.successRate) ? "" : "text-muted-foreground"}`}
              data-testid="persona-win-rate"
            >
              {personaWinRateText(r.successRate, noData)}
            </span>
          ),
        },
        {
          key: "owner",
          header: t("common.owner"),
          minWidth: w.owner,
          className: COMPACT_COLUMN_CLASS,
          cell: (r) => <OwnerCell owner={r.owner} noData={noData} />,
        },
        {
          key: "updated",
          header: t("common.updated"),
          minWidth: w.updated,
          className: COMPACT_COLUMN_CLASS,
          cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.updatedAt)}</span>,
        },
      ]}
    />
  );
};

export const CapitalPoolsList = () => {
  const t = useT();
  const notReported = t("governanceDecisions.capitalNotReported");
  return (
    <ObjectListPage<FleetCapitalPool>
      title={t("nav.capitalPools")}
      loader={capitalPoolsWithFleetFallback}
      basePath="/management/capital" liveKinds={["CapitalPool","AllocationLimit","PoolFreeze"]}
      listHref="/management/governance-decisions?tab=capital"
      rowHref={(row) => `/management/capital/${encodeURIComponent(row.id)}`}
      nameCell={CapitalPoolNameCell}
      focusParam={["capital_id", "pool"]}
      focusLabel={t("nav.capitalPools")}
      focusMatch={capitalPoolMatchesFocus}
      createBehavior={{ kind: "drawer", entity: "capitalPool" }}
      scopeConfig={{
        paramName: "capital_scope",
        defaultScope: "formal",
        groupLabel: t("governanceDecisions.capitalScopes.groupLabel"),
        options: [
          { id: "formal", label: t("governanceDecisions.capitalScopes.formal") },
          { id: "paper", label: t("governanceDecisions.capitalScopes.paper") },
          { id: "archived", label: t("governanceDecisions.capitalScopes.archived") },
        ],
        classify: classifyCapitalPoolScope,
        emptyStateForScope: (scope, counts, buildScopeHref) => {
          const paperCount = counts.paper ?? 0;
          const archivedCount = counts.archived ?? 0;
          if (scope === "formal") {
            if (paperCount > 0 || archivedCount > 0) {
              return {
                title: t("governanceDecisions.capitalEmptyState.paperHiddenTitle", {
                  paperCount,
                  archivedCount,
                }),
                description: t("governanceDecisions.capitalEmptyState.paperHiddenDescription", {
                  paperCount,
                  archivedCount,
                }),
                actionLabel: t("governanceDecisions.capitalEmptyState.openPaperScope", {
                  count: paperCount,
                }),
                actionTo: buildScopeHref("paper"),
              };
            }
            return {
              title: t("governanceDecisions.capitalEmptyState.title"),
              description: t("governanceDecisions.capitalEmptyState.description"),
            };
          }
          if (scope === "paper") {
            return {
              title: t("governanceDecisions.capitalEmptyState.paperEmptyTitle"),
              description: t("governanceDecisions.capitalEmptyState.paperEmptyDescription"),
            };
          }
          return {
            title: t("governanceDecisions.capitalEmptyState.archivedEmptyTitle"),
            description: t("governanceDecisions.capitalEmptyState.archivedEmptyDescription"),
          };
        },
      }}
      emptyState={{
        title: t("governanceDecisions.capitalEmptyState.title"),
        description: t("governanceDecisions.capitalEmptyState.description"),
      }}
      summary={(rows) => {
        const allocatedRows = rows.filter(isAllocatedReported);
        const utilizedRows = rows.filter(isUtilizedReported);
        const bothAllocAndUtilRows = rows.filter(
          (row): row is FleetCapitalPool & { allocated: number; utilized: number } =>
            isAllocatedReported(row) && isUtilizedReported(row),
        );
        const riskBudgetRows = rows.filter(isRiskBudgetReported);
        const weightedRiskBudgetRows = riskBudgetRows.filter(isAllocatedReported);

        const allocatedMixedCurrencyLabel = t("phase13.capital.summary.currencies", {
          count: new Set(allocatedRows.map((row) => row.currency || "USD")).size,
        });
        const utilizedMixedCurrencyLabel = t("phase13.capital.summary.currencies", {
          count: new Set(utilizedRows.map((row) => row.currency || "USD")).size,
        });

        const allocated = allocatedRows.length > 0
          ? currencyBreakdown(allocatedRows, (row) => row.allocated, allocatedMixedCurrencyLabel)
          : undefined;
        const utilized = utilizedRows.length > 0
          ? currencyBreakdown(utilizedRows, (row) => row.utilized, utilizedMixedCurrencyLabel)
          : undefined;

        const totalAllocatedForUtil = bothAllocAndUtilRows.reduce((sum, row) => sum + row.allocated, 0);
        const totalUtilizedForUtil = bothAllocAndUtilRows.reduce((sum, row) => sum + row.utilized, 0);
        const utilization = totalAllocatedForUtil > 0
          ? totalUtilizedForUtil / totalAllocatedForUtil
          : undefined;

        const totalAllocatedForRisk = weightedRiskBudgetRows.reduce((sum, row) => sum + row.allocated, 0);
        const weightedRiskBudget = riskBudgetRows.length > 0
          ? (totalAllocatedForRisk > 0
            ? weightedRiskBudgetRows.reduce((sum, row) => sum + row.allocated * row.riskBudget, 0) / totalAllocatedForRisk
            : riskBudgetRows.reduce((sum, row) => sum + row.riskBudget, 0) / riskBudgetRows.length)
          : undefined;

        const activePools = rows.filter(isActiveCapitalPool).length;
        const bindingCount = rows.reduce((sum, row) => sum + num(row.bindingCount ?? row.personaCount), 0);
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("phase13.capital.summary.pools")}
              value={rows.length}
              hint={t("phase13.capital.summary.active", { count: activePools })}
            />
            <StatCard
              label={t("phase13.capital.summary.allocated")}
              value={allocated ? allocated.headline : notReported}
              hint={allocated?.hint}
            />
            <StatCard
              label={t("phase13.capital.summary.utilized")}
              value={utilized ? utilized.headline : notReported}
              hint={utilization !== undefined
                ? t("phase13.capital.summary.utilization", { pct: (utilization * 100).toFixed(1) })
                : notReported}
              tone={utilization !== undefined && utilization >= 0.9
                ? "danger"
                : utilization !== undefined && utilization >= 0.75
                  ? "warning"
                  : "default"}
            />
            <StatCard
              label={t("phase13.capital.summary.riskBudget")}
              value={weightedRiskBudget !== undefined ? `${(weightedRiskBudget * 100).toFixed(2)}%` : notReported}
              hint={t("phase13.capital.summary.bindings", { count: bindingCount })}
              tone={weightedRiskBudget !== undefined && weightedRiskBudget >= 0.08
                ? "danger"
                : weightedRiskBudget !== undefined && weightedRiskBudget >= 0.06
                  ? "warning"
                  : "default"}
            />
          </div>
        );
      }}
      extraColumns={[
        {
          key: "summary",
          header: t("table.summary", { defaultValue: "Summary" }),
          cell: (r) => {
            const allocReported = isAllocatedReported(r);
            const utilReported = isUtilizedReported(r);
            const ccy = isCurrencyReported(r) ? r.currency : notReported;
            const utilization = allocReported && r.allocated > 0 && utilReported
              ? r.utilized / r.allocated
              : undefined;
            return (
              <div className="max-w-[26rem] text-xs text-muted-foreground">
                <span className="text-foreground">
                  {allocReported ? `${ccy} ${loc(r.allocated)}` : `${ccy} · ${notReported}`}
                </span>
                {hasNumber(utilization) && (
                  <span> · {t("phase13.capital.summary.utilization", { pct: (utilization * 100).toFixed(1) })}</span>
                )}
                {r.riskPolicyRef && <span> · {r.riskPolicyRef}</span>}
                {r.bindingSummary && <span> · {r.bindingSummary}</span>}
              </div>
            );
          },
        },
        { key: "ccy", header: t("table.value"), cell: (r) => <span className="text-mono text-xs">{isCurrencyReported(r) ? r.currency : notReported}</span> },
        { key: "alloc", header: t("section.holdings"), cell: (r) => <span className="text-mono text-xs">{isAllocatedReported(r) ? loc(r.allocated) : notReported}</span> },
        { key: "util", header: t("table.utilization"), cell: (r) => <span className="text-mono text-xs">{isUtilizedReported(r) ? loc(r.utilized) : notReported}</span> },
        { key: "rb", header: t("section.limits"), cell: (r) => <span className="text-mono text-xs">{isRiskBudgetReported(r) ? `${(r.riskBudget * 100).toFixed(1)}%` : notReported}</span> },
        { key: "personas", header: t("nav.personas"), cell: (r) => (
          <span className="text-mono text-xs" title={r.personaNames}>
            {personaCountLabel(r.personaCount)}
          </span>
        ) },
      ]}
    />
  );
};

export const RankingFormulasList = () => {
  const t = useT();
  return (
    <ObjectListPage<RankingFormula>
      title={t("nav.rankingFormulas")}
      loader={asEntityLoader<RankingFormula>(lists.rankingFormulas)}
      basePath="/management/ranking/formulas" liveKinds={["RankingFormula"]}
      listHref="/management/governance-decisions?tab=policy"
      rowHref={(row) => `/management/governance-decisions?tab=policy&formula_id=${encodeURIComponent(row.id)}`}
      createBehavior={{ kind: "redirect", to: "/management/studios/formula", intent: "create" }}
      emptyState={{
        title: t("governanceDecisions.formulaEmptyState.title"),
        description: t("governanceDecisions.formulaEmptyState.description"),
      }}
      columns={[
        { key: "name", header: t("common.name"), cell: (r) => <div className="font-medium">{r.name || r.id}</div> },
        { key: "version", header: t("rankingFormula.version"), cell: (r) => <span className="text-mono text-xs">{formulaVersion(r) ?? t("rankingFormula.noData")}</span> },
        { key: "weights", header: t("rankingFormula.weights"), cell: (r) => (
          <span className="text-mono text-xs">
            {formulaWeightSummary(r) ?? (r.expression ? r.expression : t("rankingFormula.noData"))}
          </span>
        ) },
      ]}
    />
  );
};

// Rebalance.state (LifecycleState) reused as the PPL-ALLOC-006 workflow
// vocabulary (recommendation/review/approved/applied), extended to cover
// paused/retired as blocked/superseded — the full recommendation/review/
// approval/rejection/expiry/blocked/applied/superseded vocabulary is not all
// representable by the 6-value LifecycleState, so rejection/expiry are left
// to the governance decision queue (Human Inbox) rather than fabricated here.
// Rebalance workflow label mapping is folded into src/lib/enumLabels.ts (`rebalanceWorkflowLabel`).

export const RebalancesList = () => {
  const t = useT();
  return (
    <ObjectListPage<Rebalance>
      title={t("nav.rebalances")}
      loader={asEntityLoader<Rebalance>(lists.rebalances)}
      basePath="/management/rebalance" liveKinds={["Rebalance","RebalanceOverride","MetricFreeze"]}
      listHref="/management/governance-decisions?tab=capital"
      rowHref={(row) => `/management/governance-decisions?tab=capital&rebalance_id=${encodeURIComponent(row.id)}`}
      focusParam="rebalance_id"
      focusLabel={t("nav.rebalances")}
      createBehavior={{ kind: "redirect", to: "/management/loops/optimization", intent: "create" }}
      emptyState={{
        title: t("governanceDecisions.rebalanceEmptyState.title"),
        description: t("governanceDecisions.rebalanceEmptyState.description"),
      }}
      extraColumns={[
        { key: "q", header: t("table.priority"), cell: (r) => <span className="text-mono text-xs">{r.quarter}</span> },
        { key: "delta", header: t("section.changeSummary"), cell: (r) => <span className="text-mono text-xs">{pct(r.proposedDelta, 1)}</span> },
        { key: "workflow", header: t("promotionAllocation.rebalanceWorkflow.header"), cell: (r) => <span className="text-xs font-medium">{rebalanceWorkflowLabel(r.state, t)}</span> },
      ]}
    />
  );
};

export const DeploymentsList = () => {
  const t = useT();
  const noData = t("common.noData");
  return (
    <ObjectListPage<Deployment>
      title={t("nav.deployments")}
      loader={asEntityLoader<Deployment>(lists.deployments)}
      basePath="/management/deployments" liveKinds={["Deployment","DeploymentStage"]}
      createBehavior={{ kind: "drawer", entity: "deployment" }}
      nameCell={(r) => {
        const personaId =
          r.persona_id ?? r.personaId ?? r.sponsor_persona_id ?? r.sponsorPersonaId ?? undefined;
        const personaDisplayName =
          r.persona_display_name ??
          r.personaDisplayName ??
          r.sponsor_persona_display_name ??
          r.sponsorPersonaDisplayName ??
          undefined;
        const personaNameMissing =
          r.persona_name_missing ??
          r.personaNameMissing ??
          r.sponsor_persona_name_missing ??
          r.sponsorPersonaNameMissing;
        const strategyId = r.strategy_id ?? r.strategyId ?? undefined;
        const strategyDisplayName =
          r.strategy_display_name ?? r.strategyDisplayName ?? undefined;
        const strategyNameMissing =
          r.strategy_name_missing ?? r.strategyNameMissing;

        const personaDisplay = resolveBffSubjectDisplay(
          {
            id: personaId,
            displayName: personaDisplayName,
            nameMissing: personaNameMissing,
          },
          t,
        );
        const strategyDisplay = resolveBffSubjectDisplay(
          {
            id: strategyId,
            displayName: strategyDisplayName,
            nameMissing: strategyNameMissing,
          },
          t,
        );
        const hasPersona = Boolean(personaId || personaDisplayName);
        const hasStrategy = Boolean(strategyId || strategyDisplayName);
        const planText = r.name || r.id;
        return (
          <div className="space-y-0.5">
            {hasPersona && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-foreground" data-testid="deployment-persona-display">
                  {personaDisplay.primaryText}
                </span>
                {personaDisplay.nameMissing && (
                  <Badge
                    variant="outline"
                    data-testid="deployment-persona-name-missing"
                    data-name-missing="true"
                    className="border-status-warning/40 text-[10px] text-status-warning"
                  >
                    {personaDisplay.nameMissingLabel}
                  </Badge>
                )}
              </div>
            )}
            {hasStrategy && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-foreground" data-testid="deployment-strategy-display">
                  {strategyDisplay.primaryText}
                </span>
                {strategyDisplay.nameMissing && (
                  <Badge
                    variant="outline"
                    data-testid="deployment-strategy-name-missing"
                    data-name-missing="true"
                    className="border-status-warning/40 text-[10px] text-status-warning"
                  >
                    {strategyDisplay.nameMissingLabel}
                  </Badge>
                )}
              </div>
            )}
            <div
              className={
                hasPersona || hasStrategy
                  ? "font-mono text-xs text-muted-foreground"
                  : "font-medium"
              }
            >
              {planText}
            </div>
            {r.id && r.id !== planText && (
              <div className="font-mono text-xs text-muted-foreground">{r.id}</div>
            )}
            {personaDisplay.secondaryId && (
              <div className="font-mono text-xs text-muted-foreground" data-testid="deployment-persona-id">
                {personaDisplay.secondaryId}
              </div>
            )}
            {strategyDisplay.secondaryId && (
              <div className="font-mono text-xs text-muted-foreground" data-testid="deployment-strategy-id">
                {strategyDisplay.secondaryId}
              </div>
            )}
          </div>
        );
      }}
      extraColumns={[
        { key: "tgt", header: t("table.target"), cell: (r) => <span className="text-mono text-xs uppercase">{r.target || noData}</span> },
        { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version || noData}</span> },
      ]}
    />
  );
};

type QualificationReadState = "ok" | "none" | "denied" | "unavailable";

function baselineStatusKey(status: string): string {
  return status === "approved"
    ? "statusApproved"
    : status === "no_approved_baseline"
      ? "statusNoBaseline"
      : status === "unavailable"
        ? "statusUnavailable"
        : "statusUnknown";
}

const KNOWN_BASELINE_REASON_HEADS = new Set([
  "registry_entry_missing", "registry_entry_is_not_member_artifact", "artifact_not_approved", "checksum_mismatch",
  "artifact_checksum_mismatch", "wrong_tenant", "strategy_artifact_missing", "backtest_run_missing",
  "backtest_run_not_in_lineage", "out_of_sample_metrics_missing", "baseline_computed_under_decision_close_fill",
  "validated_universe_missing", "universe_not_validated", "gate_return_basis_unknown", "order_quantity_missing",
  "gate_verdict_not_recorded", "gate_not_passed", "gate_proof_missing", "gate_proof_differs_from_summary",
  "gate_binding_not_owner_verified", "gate_binding_not_producer_verified", "gate_binding_differs_from_summary",
  "gate_round_trips_missing", "registry_entry_unreadable", "registry_read_unavailable",
]);

/** Plain sentence for an owner baseline reason; unknown codes get a generic sentence plus the raw code. */
export function baselineReasonText(
  reason: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { text: string; raw: string | null } | null {
  const code = splitReasonCode(reason);
  if (!code) return null;
  if (!KNOWN_BASELINE_REASON_HEADS.has(code.head)) {
    return { text: t("evolution.qualification.memberBaselines.reasonUnknown"), raw: code.raw };
  }
  return {
    text: t(`evolution.qualification.memberBaselines.reasons.${code.head}`),
    raw: code.raw !== code.head ? code.raw : null,
  };
}

export function MemberBaselinesSection({
  report,
  readState,
}: {
  report: EvolutionQualificationReport | null;
  readState: QualificationReadState;
}) {
  const t = useT();
  const prefix = "evolution.qualification.memberBaselines";
  const surface = report?.member_baselines_surface ?? null;
  const rows = report?.member_baselines ?? null;
  let body: JSX.Element;
  if (readState === "denied") {
    body = <div className="text-sm text-status-warning" data-testid="member-baselines-denied">{t(`${prefix}.denied`)}</div>;
  } else if (readState === "unavailable" || surface?.status === "unavailable") {
    body = (
      <div className="text-sm text-status-warning" data-testid="member-baselines-unavailable">
        {t(`${prefix}.unavailable`)}
        {surface?.reason && <span className="ml-1 font-mono text-xs">{t(`${prefix}.unavailableReason`, { reason: surface.reason })}</span>}
      </div>
    );
  } else if (!report || rows === null || rows === undefined) {
    body = <div className="text-sm text-muted-foreground" data-testid="member-baselines-not-provided">{t(`${prefix}.notProvided`)}</div>;
  } else if (rows.length === 0) {
    body = <div className="text-sm text-muted-foreground" data-testid="member-baselines-empty">{t(`${prefix}.empty`)}</div>;
  } else {
    const byPersona = new Map<string, { name: string; rows: typeof rows }>();
    for (const row of rows) {
      const group = byPersona.get(row.persona_id) ?? { name: row.persona_name || row.persona_id, rows: [] };
      group.rows.push(row);
      byPersona.set(row.persona_id, group);
    }
    body = (
      <div className="space-y-3">
        {surface && surface.approved !== null && (
          <div className="text-xs text-muted-foreground" data-testid="member-baselines-summary">
            {t(`${prefix}.summaryFmt`, {
              approved: surface.approved ?? 0,
              notApproved: surface.not_approved ?? 0,
              unavailable: surface.unavailable ?? 0,
            })}
          </div>
        )}
        {surface?.status === "degraded" && surface.reason && (
          <div className="text-xs text-status-warning" data-testid="member-baselines-degraded">
            {t(`${prefix}.unavailableReason`, { reason: surface.reason })}
          </div>
        )}
        {[...byPersona.entries()].map(([personaId, group]) => (
          <div key={personaId} data-testid={`member-baselines-persona-${personaId}`}>
            <div className="text-sm font-medium">
              <Link className="underline" to={"/management/personas/" + encodeURIComponent(personaId)}>{group.name}</Link>
            </div>
            <ul className="mt-1 space-y-1.5">
              {group.rows.map((row) => {
                const reason = baselineReasonText(row.reason, t);
                return (
                  <li key={`${row.artifact_ref}:${row.pool_version ?? ""}`} className="text-xs" data-testid="member-baseline-row">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-foreground [overflow-wrap:anywhere]">{row.artifact_ref}</span>
                      <span className="text-muted-foreground">
                        {t(`${prefix}.stageWeightFmt`, { stage: row.stage ?? "—", weight: row.risk_weight ?? "—" })}
                        {row.pool_version !== null && <> · {t(`${prefix}.poolVersionFmt`, { version: row.pool_version })}</>}
                      </span>
                      <Badge
                        variant="outline"
                        data-testid="member-baseline-status"
                        className={row.status === "approved" ? "border-status-success/30 text-status-success" : "border-status-warning/40 text-status-warning"}
                      >
                        {t(`${prefix}.${baselineStatusKey(row.status)}`)}
                      </Badge>
                    </div>
                    {row.status !== "approved" && (
                      <div className="mt-0.5 text-muted-foreground" data-testid="member-baseline-reason">
                        {reason ? reason.text : t(`${prefix}.reasonNone`)}
                        {reason?.raw && (
                          <span className="ml-1 font-mono" data-testid="member-baseline-raw">{t(`${prefix}.rawCode`, { code: reason.raw })}</span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  return (
    <section className="space-y-1.5" data-testid="member-baselines" aria-label={t(`${prefix}.title`)}>
      <h3 className="text-xs font-medium text-muted-foreground">{t(`${prefix}.title`)}</h3>
      <p className="text-xs text-muted-foreground">{t(`${prefix}.intro`)}</p>
      {body}
    </section>
  );
}

export const EvolutionList = () => {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const showTestRecords = searchParams.get("include_test") === "true";
  const [qualification, setQualification] = useState<EvolutionQualificationReport | null>(null);
  const [qualificationState, setQualificationState] = useState<QualificationReadState>("none");
  const [hiddenTestCount, setHiddenTestCount] = useState(0);

  const loadEvolutionPrograms = useCallback(async () => {
    const [envelope, qual] = await Promise.all([
      asEntityLoader<EvolutionProgram>(lists.evolution)(),
      mgmt.evolutionQualification
        .getLiveOnly()
        .then((report): { report: EvolutionQualificationReport | undefined; state: QualificationReadState } => ({
          report,
          state: report ? "ok" : "none",
        }))
        .catch((err: unknown): { report: undefined; state: QualificationReadState } => {
          const status = (err as { status?: unknown } | null)?.status;
          return { report: undefined, state: status === 401 || status === 403 ? "denied" : "unavailable" };
        }),
    ]);
    setQualification(qual.report ?? null);
    setQualificationState(qual.state);
    const testRows = envelope.items.filter((row) => isRecordedTestRecord(row));
    setHiddenTestCount(testRows.length);
    if (showTestRecords || testRows.length === 0) return envelope;
    return { ...envelope, items: envelope.items.filter((row) => !isRecordedTestRecord(row)) };
  }, [showTestRecords]);

  const toggleTestRecords = () => {
    const next = new URLSearchParams(searchParams);
    if (showTestRecords) next.delete("include_test");
    else next.set("include_test", "true");
    setSearchParams(next);
  };

  const viewerZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  })();
  const policyVersion = qualification?.policy_version || "—";
  const evaluatedAtDisplay = qualification?.evaluated_at
    ? t("evolution.qualification.evaluatedAtFmt", { date: safeDateTime(qualification.evaluated_at), zone: viewerZone || "local" })
    : t("evolution.qualification.notEvaluatedYet");
  const evaluatedCount = qualification?.evaluated ?? 0;
  const qualifiedCount = qualification?.qualified ?? 0;
  const failingCounts = qualification?.counts_by_first_failing_criterion ?? {};
  const criterionOrder = Array.from(
    new Set([
      ...EVOLUTION_QUALIFICATION_CRITERIA,
      ...Object.keys(failingCounts),
    ]),
  );

  const buildZeroProgramsExplanation = () => {
    if (evaluatedCount > 0 && qualifiedCount === 0) {
      return t("evolution.qualification.zeroProgramsQualifiedZero", {
        evaluated: evaluatedCount,
        policyVersion,
        evaluatedAt: evaluatedAtDisplay,
      });
    }
    if (!qualification || (evaluatedCount === 0 && qualification.failure_reason === "no_qualification_has_run")) {
      return t("evolution.qualification.zeroProgramsNoSweep", {
        policyVersion,
      });
    }
    return t("evolution.qualification.zeroProgramsWithQualified", {
      qualified: qualifiedCount,
      evaluated: evaluatedCount,
      policyVersion,
    });
  };

  const zeroExplanationText = buildZeroProgramsExplanation();

  return (
    <ObjectListPage<EvolutionProgram>
      title={t("nav.evolution")}
      loader={loadEvolutionPrograms}
      reloadKey={"include_test:" + showTestRecords}
      basePath="/management/evolution"
      topControls={() =>
        hiddenTestCount > 0 || showTestRecords ? (
          <div className="mb-3 flex justify-end">
            <Button type="button" size="sm" variant="outline" aria-pressed={showTestRecords}
              data-testid="evolution-toggle-test-records" onClick={toggleTestRecords}>
              {showTestRecords ? t("evolution.qualification.testRecords.hide") : t("evolution.qualification.testRecords.show", { count: hiddenTestCount })}
            </Button>
          </div>
        ) : null
      }
      liveKinds={["Evolution", "Promotion"]}
      createBehavior={{ kind: "drawer", entity: "evolutionProgram" }}
      alwaysRenderSummary
      emptyTableMessage={`${t("evolution.qualification.zeroProgramsTitle")} — ${zeroExplanationText}`}
      summary={(visibleRows) => (
        <Card className="p-4 space-y-3" data-testid="evolution-qualification-summary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("evolution.qualification.summaryTitle")}</h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span>
                {t("evolution.qualification.policyVersion")}:{" "}
                <span className="text-mono text-foreground" data-testid="qualification-policy-version">
                  {policyVersion}
                </span>
              </span>
              <span>
                {t("evolution.qualification.evaluatedAt")}:{" "}
                <span className="text-mono text-foreground" data-testid="qualification-evaluated-at">
                  {evaluatedAtDisplay}
                </span>
              </span>
            </div>
          </div>

          {qualificationState === "denied" && (
            <div className="rounded-md border border-status-warning/40 bg-status-warning/10 p-2.5 text-xs" role="alert" data-testid="qualification-denied">
              <div className="font-semibold text-foreground">{t("evolution.qualification.deniedTitle")}</div>
              <div className="text-muted-foreground">{t("evolution.qualification.deniedBody")}</div>
            </div>
          )}
          {qualificationState === "unavailable" && (
            <div className="rounded-md border border-status-warning/40 bg-status-warning/10 p-2.5 text-xs" role="alert" data-testid="qualification-unavailable">
              <div className="font-semibold text-foreground">{t("evolution.qualification.unavailableTitle")}</div>
              <div className="text-muted-foreground">{t("evolution.qualification.unavailableBody")}</div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
              <div className="text-xs text-muted-foreground">{t("evolution.qualification.evaluated")}</div>
              <div className="text-lg font-semibold text-mono" data-testid="qualification-evaluated-count">
                {evaluatedCount}
              </div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
              <div className="text-xs text-muted-foreground">{t("evolution.qualification.qualified")}</div>
              <div className="text-lg font-semibold text-mono" data-testid="qualification-qualified-count">
                {qualifiedCount}
              </div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
              <div className="text-xs text-muted-foreground">{t("evolution.qualification.drafted")}</div>
              <div className="text-lg font-semibold text-mono" data-testid="qualification-drafted-count">
                {qualification?.drafted ?? 0}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">
              {t("evolution.qualification.failingByCriterion")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" data-testid="qualification-failing-criteria">
              {criterionOrder.map((criterion) => {
                const count = failingCounts[criterion] ?? 0;
                const label = t(`evolution.qualification.criteria.${criterion}`, { defaultValue: criterion });
                return (
                  <div
                    key={criterion}
                    data-testid={`qualification-criterion-${criterion}`}
                    className="flex items-center justify-between rounded border border-border/50 px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-foreground">
                      {label}
                      <span className="block text-mono text-[10px] text-muted-foreground" data-testid={`qualification-criterion-code-${criterion}`}>
                        {t("evolution.qualification.criterionCodeFmt", { code: criterion })}
                      </span>
                    </span>
                    <span className="text-mono font-semibold" data-testid={`qualification-criterion-count-${criterion}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <MemberBaselinesSection report={qualification} readState={qualificationState} />

          {visibleRows.length === 0 && (
            <div
              data-testid="evolution-zero-programs-explanation"
              className="rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-xs space-y-1"
            >
              <div className="font-semibold text-foreground">{t("evolution.qualification.zeroProgramsTitle")}</div>
              <div className="text-muted-foreground">{zeroExplanationText}</div>
            </div>
          )}
        </Card>
      )}
      columns={[
        {
          key: "name",
          header: t("evolution.columns.name"),
          cell: (r) => (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-foreground">{r.name}</span>
              {isRecordedTestRecord(r) && (
                <Badge variant="outline" className="text-xs" data-testid={`evolution-test-record-${r.id}`}>
                  {t("evolution.qualification.testRecords.badge")}
                </Badge>
              )}
            </div>
          ),
        },
        {
          key: "status",
          header: t("evolution.columns.status"),
          cell: (r) => <StatusBadge state={r.status || r.state} />,
        },
        {
          key: "origin",
          header: t("evolution.columns.origin"),
          cell: (r) => {
            const originKind = normalizeEvolutionOriginKind(r.originKind ?? r.origin);
            const rawStatus = String(r.status || r.state || "").toLowerCase();
            const isUnderReview = rawStatus === "under_review" || rawStatus === "review";
            const isWaitingForHumanReview = originKind === "automatic" && isUnderReview;
            return (
              <div className="flex flex-wrap items-center gap-1.5" data-testid={`evolution-origin-${r.id}`}>
                <Badge variant="outline" className="text-mono text-xs">
                  {t(`evolution.origin.${originKind}`)}
                </Badge>
                {isWaitingForHumanReview && (
                  <Badge
                    variant="secondary"
                    data-testid={`evolution-waiting-review-${r.id}`}
                    className="border-status-warning/40 bg-status-warning/15 text-status-warning text-xs"
                  >
                    {t("evolution.waitingForHumanReview")}
                  </Badge>
                )}
              </div>
            );
          },
        },
        {
          key: "sourceDecisions",
          header: t("evolution.columns.sourceDecisionCount"),
          cell: (r) => {
            const count = (r.sourceDecisionIds ?? r.source_decision_ids ?? []).length;
            return (
              <span className="text-mono text-xs" data-testid={`evolution-source-decision-count-${r.id}`}>
                {count}
              </span>
            );
          },
        },
        {
          key: "runs",
          header: t("evolution.columns.runCount"),
          cell: (r) => {
            const count = (r.runIds ?? r.run_ids ?? []).length;
            return (
              <span className="text-mono text-xs" data-testid={`evolution-run-count-${r.id}`}>
                {count}
              </span>
            );
          },
        },
        {
          key: "updated",
          header: t("evolution.columns.updatedAt"),
          cell: (r) => (
            <span className="text-mono text-xs text-muted-foreground">
              {safeDateTime(r.updatedAt || r.updated_at)}
            </span>
          ),
        },
      ]}
    />
  );
};

const UNRECORDED_RUN_VALUES = new Set(["", "unknown", "none", "null", "nan"]);

function recordedRunValue(v: string | null | undefined): string {
  const text = String(v ?? "").trim();
  return UNRECORDED_RUN_VALUES.has(text.toLowerCase()) ? "" : text;
}

export function extractHiddenNonRealCount(meta: unknown): number | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const record = meta as {
    hidden_non_real_count?: unknown;
    surfaces?: { research_tasks?: { hidden_non_real_count?: unknown } | null } | null;
  };
  const count = record.hidden_non_real_count ?? record.surfaces?.research_tasks?.hidden_non_real_count;
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : undefined;
}

function ReasonText({ code, testId }: { code: string | null | undefined; testId?: string }) {
  const t = useT();
  const reason = demandReasonText(code, t);
  if (!reason) return null;
  return (
    <span data-testid={testId}>
      {reason.text}
      {reason.raw && <span className="ml-1 text-xs text-muted-foreground font-mono" data-testid="research-reason-raw">{t("research.demand.rawCode", { code: reason.raw })}</span>}
    </span>
  );
}

export function ResearchDemandsSection({ surface, rows }: { surface: ResearchDemandsSurface | null; rows: ResearchTask[] }) {
  const t = useT();
  if (!surface) return null;
  return (
    <section className="mb-4 rounded-md border p-3 space-y-2" data-testid="research-demands" aria-label={t("research.demand.title")}>
      <div>
        <h3 className="text-sm font-medium">{t("research.demand.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("research.demand.intro")}</p>
      </div>
      {surface.state === "unavailable" ? (
        <div className="text-sm text-amber-700" data-testid="research-demands-unavailable">
          {t("research.demand.unavailable")}
          {surface.reason && <span className="ml-1 text-xs font-mono">{t("research.demand.unavailableReason", { reason: surface.reason })}</span>}
        </div>
      ) : surface.demands.length === 0 ? (
        <div className="text-sm text-muted-foreground" data-testid="research-demands-empty">{t("research.demand.empty")}</div>
      ) : (
        <ul className="space-y-2">
          {surface.demands.map((d) => {
            const search = rows.find((r) => r.demand?.demand_id === d.demand_id);
            const outcome = d.last_template_search_reason ?? d.last_discovery_reason ?? search?.demand?.last_reason_code;
            return (
              <li key={d.demand_id} className="text-sm space-y-0.5" data-testid="research-demand-row">
                <div className="font-medium">
                  {demandPersonaName(d, t)} · {t("research.demand.lacking", { measure: demandMeasureText(d.short_measure, t) })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.tried_families.length > 0 ? t("research.demand.tried", { families: d.tried_families.map((f) => t(`research.demand.families.${f}`, { defaultValue: f })).join("、") }) : t("research.demand.triedNone")}
                  {d.missing_datasets.length > 0 && <> · {t("research.demand.missingData", { datasets: d.missing_datasets.join("、") })}</>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.created_at ? t("research.demand.since", { date: safeDateTime(d.created_at) }) : null}
                  {" · "}
                  {d.expires_at ? t("research.demand.expires", { date: safeDateTime(d.expires_at) }) : t("research.demand.expiresUnknown")}
                  {search?.demand?.attempt_count != null && <> · {t("research.demand.attempts", { count: search.demand.attempt_count })}</>}
                </div>
                <div className="text-xs" data-testid="research-demand-outcome">
                  {outcome
                    ? <>{t("research.demand.outcome", { reason: "" })}<ReasonText code={outcome} /></>
                    : t("research.demand.outcomeNone")}
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {d.persona_id && (
                    <Link className="underline" to={"/management/personas/" + encodeURIComponent(d.persona_id)}>{t("research.demand.persona")}</Link>
                  )}
                  {search
                    ? <Link className="underline" to={"/management/experiments/" + encodeURIComponent(search.id)}>{t("research.demand.searchTask")}</Link>
                    : <span className="text-muted-foreground">{t("research.demand.noSearchTask")}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MeetingResearchTicketsSection({ read }: { read: ResearchTicketsRead | null }) {
  const t = useT();
  if (!read) return null;
  return (
    <section className="mb-4 rounded-md border p-3 space-y-2" data-testid="research-tickets" aria-label={t("research.tickets.title")}>
      <h3 className="text-sm font-medium">{t("research.tickets.title")}</h3>
      {read.state === "denied" ? (
        <div className="text-sm text-amber-700" data-testid="research-tickets-denied">{t("research.tickets.denied")}</div>
      ) : read.state === "unavailable" ? (
        <div className="text-sm text-amber-700" data-testid="research-tickets-unavailable">{t("research.tickets.unavailable", { reason: read.reason })}</div>
      ) : read.tickets.length === 0 ? (
        <div className="text-sm text-muted-foreground" data-testid="research-tickets-empty">{t("research.tickets.empty")}</div>
      ) : (
        <ul className="space-y-1">
          {read.tickets.map((tk) => (
            <li key={tk.action_id} className="text-sm" data-testid="research-ticket-row">
              <span className="font-medium">{tk.title ?? tk.deliverable ?? tk.action_id}</span>
              <span className="text-xs text-muted-foreground">
                {" · "}{tk.owner_label ? t("research.tickets.owner", { owner: tk.owner_label }) : t("research.tickets.ownerUnknown")}
                {" · "}{tk.due_at ? t("research.tickets.due", { date: safeDateTime(tk.due_at) }) : t("research.tickets.dueUnknown")}
                {" · "}{t(`meetingsCenter.detail.followThrough.state.${tk.state}`, { defaultValue: tk.state })}
              </span>
              {tk.origin_meeting_id && (
                <Link className="ml-2 text-xs underline" to={"/management/meetings/" + encodeURIComponent(tk.origin_meeting_id) + "?action=" + encodeURIComponent(tk.action_id)}>
                  {t("research.tickets.meeting")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const ResearchList = () => {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCollectorView = searchParams.get("view") === "collector_checks";
  const view = isCollectorView ? "collector_checks" : "research";
  const includeNonReal = !isCollectorView && searchParams.get("include_non_real") === "true";
  const filterKey = view + ":" + includeNonReal;
  const [pageCursor, setPageCursor] = useServerPageCursor(filterKey);
  const pageToken = pageCursor.currentToken;
  const [demandsSurface, setDemandsSurface] = useState<ResearchDemandsSurface | null>(null);
  const [ticketsRead, setTicketsRead] = useState<ResearchTicketsRead | null>(null);
  const loader = useCallback(
    () => listResearchTasksEnvelope({ view, includeNonReal, pageToken }).then((env) => {
      const meta = env.meta as { research_demands_read?: ResearchDemandsSurface } | undefined;
      setDemandsSurface(view === "research" ? meta?.research_demands_read ?? null : null);
      return env;
    }),
    [view, includeNonReal, pageToken],
  );
  useEffect(() => {
    if (isCollectorView) { setTicketsRead(null); return; }
    let live = true;
    void listMeetingResearchTickets().then((read) => { if (live) setTicketsRead(read); });
    return () => { live = false; };
  }, [isCollectorView]);
  const demandList: ResearchDemand[] = demandsSurface?.state === "ok" ? demandsSurface.demands : [];

  const selectView = (collector: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (collector) next.set("view", "collector_checks");
    else next.delete("view");
    const nextKey = collector ? "collector_checks:false" : "research:" + (next.get("include_non_real") === "true");
    if (nextKey !== filterKey) setPageCursor(freshServerPageCursor(nextKey));
    setSearchParams(next);
  };

  const toggleIncludeNonReal = () => {
    const next = new URLSearchParams(searchParams);
    if (includeNonReal) next.delete("include_non_real");
    else next.set("include_non_real", "true");
    setPageCursor(freshServerPageCursor("research:" + !includeNonReal));
    setSearchParams(next);
  };

  return (
    <ObjectListPage<ResearchTask>
      title={t("nav.research")}
      loader={loader}
      reloadKey={filterKey + ":" + (pageToken ?? "")}
      basePath="/management/experiments"
      liveKinds={["Research"]}
      createBehavior={{ kind: "disabled", reasonI18nKey: "research.createDisabledReason" }}
      emptyState={isCollectorView ? {
        title: t("research.collector.empty"),
        description: t("research.collector.emptyDescription"),
      } : {
        title: t("research.emptyState.title"),
        description: t("research.emptyState.description"),
      }}
      topControls={(ctx) => {
        const hiddenCount = extractHiddenNonRealCount(ctx.meta) ?? 0;
        return (
          <>
          {!isCollectorView && <ResearchDemandsSection surface={demandsSurface} rows={ctx.visibleRows} />}
          {!isCollectorView && <MeetingResearchTicketsSection read={ticketsRead} />}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("research.list.views")}>
              <Button size="sm" variant={isCollectorView ? "outline" : "default"} aria-pressed={!isCollectorView} onClick={() => selectView(false)}>
                {t("research.list.research")}
              </Button>
              <Button size="sm" variant={isCollectorView ? "default" : "outline"} aria-pressed={isCollectorView} onClick={() => selectView(true)}>
                {t("research.collector.title")}
              </Button>
            </div>
            {!isCollectorView && (includeNonReal || hiddenCount > 0) && (
              <Button type="button" size="sm" variant="outline" aria-pressed={includeNonReal}
                data-testid="research-toggle-non-real-button" onClick={toggleIncludeNonReal}>
                {includeNonReal ? t("research.hideNonReal") : t("research.showNonRealWithCount", { count: hiddenCount })}
              </Button>
            )}
          </div>
          </>
        );
      }}
      bottomControls={(ctx) => {
        if (ctx.isInitialLoading || ctx.isDegradedEmpty || (!ctx.cursor?.next && !pageToken)) return null;
        return (
          <ServerPager cursor={pageCursor} setCursor={setPageCursor} pageSize={ctx.pageSize || 20}
            total={ctx.estimatedTotal} visibleCount={ctx.visibleRows.length} nextToken={ctx.cursor?.next}
            loading={ctx.loading} testIdPrefix="research" ariaLabel={t("research.list.views")} />
        );
      }}
      columns={[
        {
          key: "name",
          header: t("common.name"),
          cell: (r) => {
            const summary = r.display_summary;
            const hasSubject = typeof summary === "string" ? Boolean(summary) : Boolean(summary?.symbol || summary?.subject_ref || summary?.dataset_ref);
            const showMissingSubject = !isCollectorView && !hasSubject && (r.taskType ?? r.task_type) === "rapid_eval";
            return (
              <div data-testid="research-row-title" className="space-y-0.5">
                <div className="font-medium">{researchTitle(r, t, demandList)}</div>
                {showMissingSubject && <div className="text-xs text-muted-foreground">{t("research.list.subjectNotRecorded")}</div>}
              </div>
            );
          },
        },
        {
          key: "status",
          header: isCollectorView ? t("table.status") : t("research.table.latestRun"),
          cell: (r) => {
            if (isCollectorView) return <span>{collectorCheckStatus(r, t)}</span>;
            const latest = r.latestRun ?? r.latest_run;
            const adapter = recordedRunValue(latest?.adapter);
            const dispatchMode = recordedRunValue(latest?.dispatchMode ?? latest?.dispatch_mode);
            const runStatus = recordedRunValue(latest?.status);
            const nonReal = r.is_non_real === true || isNonRealRun(adapter, dispatchMode);
            return (
              <div className="flex flex-wrap items-center gap-2">
                {latest
                  ? (runStatus ? <StatusBadge state={runStatus} /> : <span>{t("research.list.runStatusUnknown")}</span>)
                  : <span>{t("research.noRunsYet")}</span>}
                {latest && !adapter && !dispatchMode && (
                  <span className="text-xs text-muted-foreground" data-testid="research-runner-unrecorded">{t("research.runnerUnrecorded")}</span>
                )}
                {nonReal && <Badge variant="outline">{t("research.list.testOrManualRecord")}</Badge>}
                {!isCollectorView && isTemplateSearchTask(r) && r.demand && (
                  <div className="basis-full text-xs text-muted-foreground" data-testid="research-search-outcome">
                    {r.demand.attempt_count != null && <span className="mr-2">{t("research.demand.attempts", { count: r.demand.attempt_count })} ·</span>}
                    {r.status === "failed" || r.latest_run?.status === "failed" ? <ReasonText code={r.demand.last_reason_code} /> : null}
                  </div>
                )}
              </div>
            );
          },
        },
        {
          key: "updated",
          header: t("common.updated"),
          cell: (r) => <span className="text-xs text-muted-foreground">{safeDateTime(r.updatedAt || r.updated_at)}</span>,
        },
        {
          key: "detail",
          header: t("section.overview"),
          cell: (r) => (
            <Button variant="link" size="sm" asChild>
              <Link to={"/management/experiments/" + encodeURIComponent(r.id)} onClick={(event) => event.stopPropagation()}>
                {t(isCollectorView ? "research.collector.view" : "research.list.viewResearch")}
              </Link>
            </Button>
          ),
        },
      ]}
    />
  );
};

const ARTIFACT_SCOPE_TABS = ["current", "test", "retired", "research", "unbound", "all"] as const;

/** Older BFF rows carry no `list_scope`; a research run output is still research. */
function artifactScopeFromSource(row: unknown): RegistryListScope | undefined {
  const record = (row ?? {}) as { source_kind?: unknown; sourceKind?: unknown };
  const raw = String(record.source_kind ?? record.sourceKind ?? "").trim().toLowerCase();
  return raw === "research_run_output" || raw === "research" ? "research" : undefined;
}

export const ARTIFACT_COLUMN_MIN_WIDTHS = {
  name: 230,
  source: 76,
  kind: 88,
  version: 68,
  state: 88,
  hash: 96,
  owner: 142,
  updated: 96,
} as const;

function WordWithCode({ value, testId }: { value: { text: string; code: string } | undefined; testId: string }) {
  const t = useT();
  if (!value) {
    return <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{t("common.noData")}</span>;
  }
  return (
    <span
      className="text-xs [overflow-wrap:anywhere] cursor-help"
      title={value.code}
      data-testid={testId}
      data-code={value.code}
    >
      {value.text}
    </span>
  );
}

/** Shorten `sha256:38fb8f49…2e008e`; the full value stays available via title. */
export function shortenHash(hash: string): string {
  const idx = hash.indexOf(":");
  const prefix = idx >= 0 ? hash.slice(0, idx + 1) : "";
  const digest = idx >= 0 ? hash.slice(idx + 1) : hash;
  if (digest.length <= 16) return hash;
  return `${prefix}${digest.slice(0, 8)}…${digest.slice(-6)}`;
}

export const ArtifactsList = () => {
  const t = useT();
  const noData = t("common.noData");
  const w = ARTIFACT_COLUMN_MIN_WIDTHS;
  return (
    <ObjectListPage<Artifact>
      title={t("nav.artifacts")}
      loader={asEntityLoader<Artifact>(lists.artifacts)}
      basePath="/management/artifacts"
      liveKinds={["Artifact"]}
      createBehavior={{ kind: "drawer", entity: "artifact" }}
      scopeConfig={{
        paramName: "list_scope",
        defaultScope: "current",
        groupLabel: t("registryLists.scope.artifactGroupLabel"),
        options: ARTIFACT_SCOPE_TABS.map((id) => ({
          id,
          label: t(id === "research" ? "registryLists.scope.researchOutput" : `registryLists.scope.${id}`),
        })),
        classify: (row) => classifyCurrentFirstScope(row, ARTIFACT_SCOPE_TABS, artifactScopeFromSource),
        emptyStateForScope: (scope, counts, buildScopeHref) => currentFirstEmptyState(t, scope, counts, buildScopeHref),
      }}
      topControls={(ctx) => <UnknownScopeNotice count={countUnknownScopeRows(ctx.rows, artifactScopeFromSource)} />}
      columns={[
        {
          key: "name",
          minWidth: w.name,
          className: COMPACT_COLUMN_CLASS,
          header: t("common.name"),
          cell: (r) => {
            const strategyId = r.strategy_id ?? r.strategyId ?? undefined;
            const strategyDisplayName =
              r.strategy_display_name ?? r.strategyDisplayName ?? undefined;
            const strategyNameMissing =
              r.strategy_name_missing ?? r.strategyNameMissing;
            const personaId = r.persona_id ?? r.personaId ?? undefined;
            const personaDisplayName =
              r.persona_display_name ?? r.personaDisplayName ?? undefined;
            const personaNameMissing =
              r.persona_name_missing ?? r.personaNameMissing;

            const strategyDisplay = resolveBffSubjectDisplay(
              {
                id: strategyId || r.name || r.id,
                displayName: strategyDisplayName,
                nameMissing: strategyNameMissing,
              },
              t,
            );
            const personaDisplay = resolveBffSubjectDisplay(
              {
                id: personaId,
                displayName: personaDisplayName,
                nameMissing: personaNameMissing,
              },
              t,
            );
            const hasStrategyMeta = Boolean(
              strategyDisplayName || strategyNameMissing === true,
            );
            const hasPersonaMeta = Boolean(
              personaId || personaDisplayName || personaNameMissing === true,
            );
            const primaryTitle = hasStrategyMeta
              ? strategyDisplay.primaryText
              : r.name || r.id;

            return (
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div
                    className="text-sm font-medium leading-tight line-clamp-2 break-words"
                    title={primaryTitle}
                    data-testid="artifact-primary-name"
                  >
                    {primaryTitle}
                  </div>
                  {strategyDisplay.nameMissing && (
                    <Badge
                      variant="outline"
                      data-testid="artifact-strategy-name-missing"
                      data-name-missing="true"
                      className="border-status-warning/40 text-[10px] text-status-warning"
                    >
                      {strategyDisplay.nameMissingLabel}
                    </Badge>
                  )}
                </div>
                {hasPersonaMeta && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground" data-testid="artifact-persona-display">
                      {personaDisplay.primaryText}
                    </span>
                    {personaDisplay.nameMissing && (
                      <Badge
                        variant="outline"
                        data-testid="artifact-persona-name-missing"
                        data-name-missing="true"
                        className="border-status-warning/40 text-[10px] text-status-warning"
                      >
                        {personaDisplay.nameMissingLabel}
                      </Badge>
                    )}
                  </div>
                )}
                {strategyDisplay.secondaryId && (
                  <div
                    className="font-mono text-xs text-muted-foreground"
                    data-testid="artifact-strategy-id"
                  >
                    {strategyDisplay.secondaryId}
                  </div>
                )}
                {personaDisplay.secondaryId && (
                  <div
                    className="font-mono text-xs text-muted-foreground"
                    data-testid="artifact-persona-id"
                  >
                    {personaDisplay.secondaryId}
                  </div>
                )}
                {r.id && r.id !== primaryTitle && r.id !== strategyDisplay.secondaryId && (
                  <div
                    className="font-mono text-xs text-muted-foreground"
                    data-testid="artifact-id"
                  >
                    {r.id}
                  </div>
                )}
              </div>
            );
          },
        },
        {
          key: "source",
          minWidth: w.source,
          className: COMPACT_COLUMN_CLASS,
          header: t("artifact.sourceKind", { defaultValue: t("table.source") }),
          cell: (r) => {
            const source = artifactSourceText(r.source_kind ?? r.sourceKind, t);
            return (
              <span data-source-kind={source?.code}>
                <WordWithCode value={source} testId="artifact-source" />
              </span>
            );
          },
        },
        {
          key: "kind",
          minWidth: w.kind,
          className: COMPACT_COLUMN_CLASS,
          header: t("table.kind"),
          cell: (r) => <WordWithCode value={artifactKindText(r.kind, t)} testId="artifact-kind" />,
        },
        {
          key: "ver",
          minWidth: w.version,
          className: COMPACT_COLUMN_CLASS,
          header: t("table.version"),
          cell: (r) => {
            const version = typeof r.version === "string" ? r.version.trim() : "";
            return version ? (
              <span className="text-mono text-xs [overflow-wrap:anywhere]">{version}</span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          // State and risk share one column so the table fits 1274 px.
          key: "state",
          minWidth: w.state,
          className: COMPACT_COLUMN_CLASS,
          header: `${t("common.state")} / ${t("common.risk")}`,
          cell: (r) => {
            const state = typeof r.state === "string" ? r.state.trim() : "";
            const risk = typeof r.risk === "string" ? r.risk.trim() : "";
            if (!state && !risk) {
              return <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>;
            }
            return (
              <div className="flex flex-col items-start gap-1">
                {state && <span className="inline-flex whitespace-nowrap"><StatusBadge state={state} /></span>}
                {risk && <span className="inline-flex whitespace-nowrap"><RiskBadge level={risk as RiskLevel} /></span>}
              </div>
            );
          },
        },
        {
          key: "hash",
          minWidth: w.hash,
          className: COMPACT_COLUMN_CLASS,
          header: t("detail.section.hash", { defaultValue: "Hash" }),
          cell: (r) => {
            const hash = typeof r.hash === "string" ? r.hash.trim() : "";
            return hash ? (
              <span
                className="text-mono text-xs text-muted-foreground [overflow-wrap:anywhere] cursor-help"
                title={hash}
                data-full-hash={hash}
              >
                {shortenHash(hash)}
              </span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          key: "owner",
          minWidth: w.owner,
          className: COMPACT_COLUMN_CLASS,
          header: t("common.owner"),
          cell: (r) => <OwnerCell owner={r.owner} noData={noData} />,
        },
        {
          key: "updated",
          minWidth: w.updated,
          className: COMPACT_COLUMN_CLASS,
          header: t("common.updated"),
          cell: (r) => (
            <span className="text-mono text-xs text-muted-foreground">
              {safeDateTime(r.updatedAt)}
            </span>
          ),
        },
      ]}
    />
  );
};
