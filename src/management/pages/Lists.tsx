import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ObjectListPage } from "./ObjectListPage";
import { ServerPager, freshServerPageCursor, useServerPageCursor } from "@/platform/components/ServerPager";
import {
  lists,
  mgmt,
  EVOLUTION_QUALIFICATION_CRITERIA,
  type EvolutionQualificationReport,
  type StrategyListQueryOptions,
} from "@/lib/bff-v1";
import { normalizeEvolutionOriginKind } from "@/lib/bff-v1/evolution";
import { useT } from "@/platform/hooks";
import { formulaVersion, formulaWeightSummary } from "./RankingFormulaDetail";
import { safeDateTime } from "@/lib/utils";
import type { Strategy, Persona, CapitalPool, RankingFormula, Rebalance, Deployment, EvolutionProgram, ResearchTask, Artifact, ListEnvelope, RiskLevel } from "@/lib/bff-v1";
import { StatusBadge } from "@/platform/components/StatusBadge";
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

export function extractStrategyStateCounts(meta: unknown): StrategyStateCounts | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const rawCounts = (meta as { state_counts?: unknown }).state_counts;
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

export function normalizeStrategyOperationalStatus(
  value: unknown,
): "running" | "idle" | "retired" | "unbound" | "unknown" | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (
    trimmed === "running" ||
    trimmed === "idle" ||
    trimmed === "retired" ||
    trimmed === "unbound" ||
    trimmed === "unknown"
  ) {
    return trimmed;
  }
  return "unknown";
}

function strategyOperationalStatusClass(
  status: "running" | "idle" | "retired" | "unbound" | "unknown",
): string {
  if (status === "running") return "border-status-success/40 text-status-success";
  if (status === "unknown") return "border-status-warning/40 text-status-warning";
  if (status === "idle") return "border-border text-foreground";
  return "border-muted text-muted-foreground";
}

export function normalizeStrategyFilterParam(rawStateParam: string | null | undefined): string {
  const trimmed = rawStateParam?.trim().toLowerCase() ?? "";
  if (!trimmed || trimmed === "default") return "default";
  return trimmed;
}

export function resolveStrategyListQuery(
  activeFilter: string,
  pageToken?: string,
  pageSize: number = STRATEGY_PAGE_SIZE,
): StrategyListQueryOptions {
  if (activeFilter === "default") {
    return {
      exclude_state: "draft",
      hide_retired_personas: true,
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
    };
  }
  if (activeFilter === "all") {
    return {
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
    };
  }
  return {
    state: activeFilter,
    page_size: pageSize,
    ...(pageToken ? { page_token: pageToken } : {}),
  };
}

export const StrategiesList = () => {
  const t = useT();
  const noData = t("common.noData");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = normalizeStrategyFilterParam(searchParams.get("state"));

  const [effectivePageCursor, setPageCursorState] = useServerPageCursor(activeFilter);

  const loadStrategiesPage = useCallback(() => {
    const query = resolveStrategyListQuery(activeFilter, effectivePageCursor.currentToken, STRATEGY_PAGE_SIZE);
    return asEntityLoader<Strategy>(() => lists.strategies(query))();
  }, [activeFilter, effectivePageCursor.currentToken]);

  const reloadKey = `strategies:${activeFilter}:${effectivePageCursor.currentToken ?? ""}`;

  const selectStateFilter = (targetFilter: string) => {
    const normalized = normalizeStrategyFilterParam(targetFilter);
    setPageCursorState(freshServerPageCursor(normalized));
    const nextParams = new URLSearchParams(searchParams);
    if (normalized === "default") {
      nextParams.delete("state");
    } else {
      nextParams.set("state", normalized);
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
          const count =
            id === "default"
              ? activeFilter === "default"
                ? pageInfoTotal
                : undefined
              : stateCounts === null
                ? undefined
                : id === "all"
                  ? stateCounts.allCount
                  : stateCounts.byState[id];
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
      extraColumns={[
        {
          key: "operationalStatus",
          header: t("strategy.list.column.operationalStatus"),
          cell: (r) => {
            const status = normalizeStrategyOperationalStatus(r.operationalStatus);
            if (!status) {
              return <span className="text-mono text-xs text-muted-foreground">{noData}</span>;
            }
            return (
              <Badge
                variant="outline"
                data-testid="strategy-operational-status"
                data-operational-status={status}
                className={`text-xs ${strategyOperationalStatusClass(status)}`}
              >
                {t(`strategy.operationalStatus.${status}`)}
              </Badge>
            );
          },
        },
        {
          key: "symbols",
          header: t("strategy.list.column.symbols"),
          cell: (r) => {
            const symbols = Array.isArray(r.symbols)
              ? r.symbols.map((s) => String(s).trim()).filter(Boolean)
              : [];
            const symbolsText = symbols.join(", ");
            return (
              <span
                data-testid="strategy-symbols"
                className={`text-mono text-xs ${symbolsText ? "text-foreground" : "text-muted-foreground"}`}
              >
                {symbolsText || noData}
              </span>
            );
          },
        },
        {
          key: "alpha",
          header: "Alpha",
          cell: (r) => {
            const alphaText = r.alpha?.trim() || "";
            return (
              <span className={`text-mono text-xs ${alphaText ? "text-foreground" : "text-muted-foreground"}`}>
                {alphaText || noData}
              </span>
            );
          },
        },
        {
          key: "capitalPool",
          header: t("nav.capital"),
          cell: (r) => {
            const poolText = r.capitalPoolId?.trim() || "";
            return (
              <span className={`text-mono text-xs ${poolText ? "text-foreground" : "text-muted-foreground"}`}>
                {poolText || noData}
              </span>
            );
          },
        },
        {
          key: "cumulativePnl",
          header: t("strategyDetail.cumulativePaperPnl"),
          cell: (r) => {
            if (!hasNumber(r.pnl)) {
              return <span className="text-mono text-xs text-muted-foreground">{noData}</span>;
            }
            const toneClass =
              r.pnl === 0 ? "text-foreground" : r.pnl > 0 ? "text-status-success" : "text-status-failed";
            const asOf = r.metricsAsOf?.trim() || "";
            return (
              <div className="flex flex-col">
                <span className={`text-mono text-xs ${toneClass}`}>{r.pnl.toFixed(2)}</span>
                {asOf && (
                  <span className="text-[11px] text-muted-foreground">
                    {t("strategyDetail.metricsAsOf", { asOf })}
                  </span>
                )}
              </div>
            );
          },
        },
        {
          key: "pnl",
          header: "PnL 30d",
          cell: (r) => {
            if (!hasNumber(r.pnl30d)) {
              return <span className="text-mono text-xs text-muted-foreground">{noData}</span>;
            }
            const toneClass =
              r.pnl30d === 0 ? "text-foreground" : r.pnl30d > 0 ? "text-status-success" : "text-status-failed";
            return <span className={`text-mono text-xs ${toneClass}`}>{`${(r.pnl30d * 100).toFixed(2)}%`}</span>;
          },
        },
        {
          key: "sharpe",
          header: t("table.sharpe"),
          cell: (r) =>
            hasNumber(r.sharpe) ? (
              <span className="text-mono text-xs text-foreground">{r.sharpe.toFixed(2)}</span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground">{noData}</span>
            ),
        },
        {
          key: "drawdown",
          header: t("table.drawdown"),
          cell: (r) => {
            if (!hasNumber(r.drawdown)) {
              return <span className="text-mono text-xs text-muted-foreground">{noData}</span>;
            }
            const toneClass = r.drawdown === 0 ? "text-foreground" : "text-status-warning";
            return <span className={`text-mono text-xs ${toneClass}`}>{`${(r.drawdown * 100).toFixed(2)}%`}</span>;
          },
        },
      ]}
    />
  );
};

export const PersonasList = () => {
  const t = useT();
  return (
    <ObjectListPage<Persona>
      title={t("nav.personas")}
      loader={asEntityLoader<Persona>(lists.personas)}
      basePath="/management/personas" liveKinds={["Persona"]}
      createBehavior={{ kind: "drawer", entity: "persona" }}
      extraColumns={[
        { key: "arch", header: t("table.type"), cell: (r) => r.archetype },
        { key: "rs", header: t("nav.strategies"), cell: (r) => <span className="text-mono text-xs">{r.routedStrategies}</span> },
        { key: "sr", header: t("table.winRate"), cell: (r) => <span className="text-mono text-xs">{pct(r.successRate)}</span> },
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
function rebalanceWorkflowLabel(state: Rebalance["state"], t: (key: string, opts?: Record<string, unknown>) => string): string {
  const key = state === "draft" ? "recommendation"
    : state === "review" ? "review"
    : state === "approved" ? "approved"
    : state === "deployed" ? "applied"
    : state === "paused" ? "blocked"
    : state === "retired" ? "superseded"
    : state ?? "unknown";
  return t(`promotionAllocation.rebalanceWorkflow.${key}`, { defaultValue: key });
}

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
      extraColumns={[
        { key: "tgt", header: t("table.target"), cell: (r) => <span className="text-mono text-xs uppercase">{r.target || noData}</span> },
        { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version || noData}</span> },
      ]}
    />
  );
};

export const EvolutionList = () => {
  const t = useT();
  const [qualification, setQualification] = useState<EvolutionQualificationReport | null>(null);

  const loadEvolutionPrograms = useCallback(async () => {
    const [envelope, qualReport] = await Promise.all([
      asEntityLoader<EvolutionProgram>(lists.evolution)(),
      mgmt.evolutionQualification.getLiveOnly().catch(() => undefined),
    ]);
    setQualification(qualReport ?? null);
    return envelope;
  }, []);

  const policyVersion = qualification?.policy_version || "—";
  const evaluatedAtDisplay = qualification?.evaluated_at || t("evolution.qualification.notEvaluatedYet");
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
      basePath="/management/evolution"
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
                      {label} <span className="text-mono text-muted-foreground">({criterion})</span>
                    </span>
                    <span className="text-mono font-semibold" data-testid={`qualification-criterion-count-${criterion}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

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
          cell: (r) => <div className="font-medium text-foreground">{r.name}</div>,
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

function isNonRealRun(adapter?: string, dispatchMode?: string): boolean {
  const a = String(adapter ?? "").trim().toLowerCase();
  const d = String(dispatchMode ?? "").trim().toLowerCase();
  return a === "stub" || a === "manual" || d === "stub" || d === "manual";
}

export const ResearchList = () => {
  const t = useT();
  return (
    <ObjectListPage<ResearchTask>
      title={t("nav.research")}
      loader={asEntityLoader<ResearchTask>(lists.research)}
      basePath="/management/experiments"
      liveKinds={["Research"]}
      createBehavior={{ kind: "disabled", reasonI18nKey: "research.createDisabledReason" }}
      emptyState={{
        title: t("research.emptyState.title"),
        description: t("research.emptyState.description"),
      }}
      columns={[
        {
          key: "name",
          header: t("common.name"),
          cell: (r) => <div className="font-medium">{r.name}</div>,
        },
        {
          key: "status",
          header: t("table.status"),
          cell: (r) => <span className="text-mono text-xs uppercase">{r.status || r.state}</span>,
        },
        {
          key: "latestRun",
          header: t("research.table.latestRun"),
          cell: (r) => {
            const latest = r.latestRun ?? r.latest_run;
            const runId = latest?.runId ?? latest?.run_id ?? "";
            const runStatus = latest?.status ?? "";
            const adapter = latest?.adapter ?? "";
            const dispatchMode = latest?.dispatchMode ?? latest?.dispatch_mode ?? "";
            if (!runId && !runStatus && !adapter && !dispatchMode) {
              return <span className="text-xs text-muted-foreground">{t("research.noRunsYet")}</span>;
            }
            const nonReal = isNonRealRun(adapter, dispatchMode);
            return (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {runId && <span className="text-mono">{runId}</span>}
                {runStatus && <span className="text-mono uppercase text-muted-foreground">{runStatus}</span>}
                {(adapter || dispatchMode) && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {[adapter, dispatchMode].filter(Boolean).join(" / ")}
                  </Badge>
                )}
                {nonReal && (
                  <Badge
                    variant="outline"
                    className="border-status-warning/40 bg-status-warning/10 text-status-warning text-[11px]"
                  >
                    {t("research.nonRealRunBadge", {
                      adapter: adapter || "—",
                      dispatchMode: dispatchMode || "—",
                    })}
                  </Badge>
                )}
              </div>
            );
          },
        },
        {
          key: "runCount",
          header: t("research.table.runCount"),
          cell: (r) => <span className="text-mono text-xs">{r.runCount ?? r.run_count ?? 0}</span>,
        },
        {
          key: "createdBy",
          header: t("research.table.createdBy"),
          cell: (r) => <span className="text-mono text-xs">{r.createdBy || r.created_by || "—"}</span>,
        },
        {
          key: "updated",
          header: t("common.updated"),
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

type ArtifactScopeTab = "all" | "registry" | "research_run_output";

function classifyArtifactSourceScope(row: Artifact): ArtifactScopeTab {
  const raw = String(row.source_kind ?? row.sourceKind ?? "").trim().toLowerCase();
  if (raw === "research_run_output" || raw === "research") return "research_run_output";
  return "registry";
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
  return (
    <ObjectListPage<Artifact>
      title={t("nav.artifacts")}
      loader={asEntityLoader<Artifact>(lists.artifacts)}
      basePath="/management/artifacts"
      liveKinds={["Artifact"]}
      createBehavior={{ kind: "drawer", entity: "artifact" }}
      scopeConfig={{
        paramName: "source_kind",
        defaultScope: "all",
        groupLabel: t("artifact.sources.groupLabel", { defaultValue: "Artifact source filter" }),
        options: [
          { id: "all", label: t("artifact.sources.all", { defaultValue: "All sources" }) },
          { id: "registry", label: t("artifact.sources.registry", { defaultValue: "Registry bundle" }) },
          { id: "research_run_output", label: t("artifact.sources.research_run_output", { defaultValue: "Research output" }) },
        ],
        classify: classifyArtifactSourceScope,
      }}
      columns={[
        {
          key: "name",
          minWidth: 170,
          className: "px-3",
          header: t("common.name"),
          cell: (r) => <div className="font-medium line-clamp-2 break-words" title={r.name || r.id}>{r.name || r.id}</div>,
        },
        {
          key: "source",
          minWidth: 130,
          className: "px-3",
          header: t("artifact.sourceKind", { defaultValue: t("table.source") }),
          cell: (r) => {
            const sourceKind = typeof (r.source_kind ?? r.sourceKind) === "string"
              ? String(r.source_kind ?? r.sourceKind).trim()
              : "";
            return sourceKind ? (
              <Badge variant="outline" data-source-kind={sourceKind} className="font-mono text-[11px] whitespace-normal text-left [overflow-wrap:anywhere]">
                {sourceKind}
              </Badge>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          key: "kind",
          minWidth: 120,
          className: "px-3",
          header: t("table.kind"),
          cell: (r) => {
            const kind = typeof r.kind === "string" ? r.kind.trim() : "";
            return kind ? (
              <span className="text-mono text-xs [overflow-wrap:anywhere]" title={kind}>{kind}</span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          key: "ver",
          minWidth: 70,
          className: "px-3",
          header: t("table.version"),
          cell: (r) => {
            const version = typeof r.version === "string" ? r.version.trim() : "";
            return version ? (
              <span className="text-mono text-xs">{version}</span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          key: "state",
          minWidth: 90,
          className: "px-3",
          header: t("common.state"),
          cell: (r) => {
            const state = typeof r.state === "string" ? r.state.trim() : "";
            return state ? (
              <span className="inline-flex whitespace-nowrap"><StatusBadge state={state} /></span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          key: "risk",
          minWidth: 80,
          className: "px-3",
          header: t("common.risk"),
          cell: (r) => {
            const risk = typeof r.risk === "string" ? r.risk.trim() : "";
            return risk ? (
              <span className="inline-flex whitespace-nowrap"><RiskBadge level={risk as RiskLevel} /></span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          key: "size",
          minWidth: 90,
          className: "px-3",
          header: t("detail.label.size", { defaultValue: "Size" }),
          cell: (r) =>
            hasNumber(r.sizeMb) ? (
              <span className="text-mono text-xs whitespace-nowrap">{`${loc(r.sizeMb)} MB`}</span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            ),
        },
        {
          key: "hash",
          minWidth: 150,
          className: "px-3",
          header: t("detail.section.hash", { defaultValue: "Hash" }),
          cell: (r) => {
            const hash = typeof r.hash === "string" ? r.hash.trim() : "";
            return hash ? (
              <span
                className="text-mono text-xs text-muted-foreground whitespace-nowrap cursor-help"
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
          minWidth: 120,
          className: "px-3",
          header: t("common.owner"),
          cell: (r) => {
            const owner = typeof r.owner === "string" ? r.owner.trim() : "";
            return owner ? (
              <span className="text-mono text-xs block max-w-[120px] truncate whitespace-nowrap" title={owner} data-full-owner={owner}>{owner}</span>
            ) : (
              <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{noData}</span>
            );
          },
        },
        {
          key: "updated",
          minWidth: 150,
          className: "px-3",
          header: t("common.updated"),
          cell: (r) => (
            <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">
              {safeDateTime(r.updatedAt)}
            </span>
          ),
        },
      ]}
    />
  );
};
