// Generic object list page generator for the Management Console
// VI-1 — migrated to bffV1: loader returns ListEnvelope<T>; refresh via useLiveListV1.
import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable, type Column } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, RefreshCw, Inbox } from "lucide-react";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";
import type { BaseObject } from "@/lib/bff-v1";
import { realWritesEnabled, useLiveStatusSnapshot } from "@/lib/bff-v1/liveTransport";
import { useLiveListV1, extractDegradation, type ListEnvelope } from "@/lib/bff-v1";
import { EmptyState } from "@/components/ui/empty-state";
import { hasDurableCreateOwner, type CreateBehavior } from "@/lib/writeIntents/types";
import { EntityCreateDrawer } from "@/management/components/write/EntityCreateDrawer";
import { PaperPersonaBundleIncompleteError } from "@/lib/bff-v1/personas";

export function hasValidObjectRowId(row: { id?: unknown } | null | undefined): row is { id: string } {
  if (!row || typeof row.id !== "string") return false;
  const trimmed = row.id.trim();
  return trimmed.length > 0 && trimmed !== "undefined" && trimmed !== "null";
}

export function resolveObjectRowHref<T extends BaseObject>(
  row: T | null | undefined,
  basePath: string,
  rowHref?: (row: T) => string,
): string | undefined {
  if (!hasValidObjectRowId(row)) return undefined;
  const normalizedRow = { ...row, id: row.id.trim() };
  const candidate = rowHref
    ? rowHref(normalizedRow)
    : `${basePath}/${encodeURIComponent(normalizedRow.id)}`;
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  if (!trimmed || /(?:^|[/?#&=])undefined(?:$|[/?#&])/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export interface ObjectListEmptyStateConfig {
  title: string;
  description: string;
  icon?: ReactNode;
  actionLabel?: string;
  actionTo?: string;
}

export interface ObjectListScopeOption<S extends string = string> {
  id: S;
  label: string;
}

export interface ObjectListScopeConfig<T, S extends string = string> {
  paramName: string;
  defaultScope: S;
  groupLabel: string;
  options: readonly ObjectListScopeOption<S>[];
  classify: (row: T) => S;
  emptyStateForScope?: (
    scope: S,
    counts: Record<S, number>,
    buildScopeHref: (targetScope: S) => string,
  ) => ObjectListEmptyStateConfig | undefined;
}

interface Props<T extends BaseObject> {
  title: string;
  /** VI-1: now returns a ListEnvelope. Use bffV1.lists.* or asListEnvelope(). */
  loader: () => Promise<ListEnvelope<T>>;
  basePath: string;
  listHref?: string;
  rowHref?: (row: T) => string;
  nameCell?: (row: T) => ReactNode;
  columns?: Column<T>[];
  extraColumns?: Column<T>[];
  /** Realtime data:{kind} events that should refresh this list. */
  liveKinds?: string[];
  /** Pack F F01 — describes the Create button behavior. */
  createBehavior?: CreateBehavior;
  focusParam?: string | readonly string[];
  focusLabel?: string;
  /**
   * Optional matcher for the `focusParam` value. Defaults to strict `row.id === focusId`.
   * Surfaces that are deep-linked by a related id rather than the row id (e.g. a capital pool
   * linked from a persona's paper-ledger id) supply a matcher that also resolves those aliases,
   * so the link lands on a row instead of the "no matching row" banner.
   */
  focusMatch?: (row: T, focusId: string) => boolean;
  emptyState?: ObjectListEmptyStateConfig;
  scopeConfig?: ObjectListScopeConfig<T>;
  /** Optional aggregate summary rendered above the data grid. */
  summary?: (rows: T[]) => ReactNode;
  /** Render summary even when visibleRows is empty. */
  alwaysRenderSummary?: boolean;
  /** Optional custom empty message rendered inside DataTable when visibleRows is empty. */
  emptyTableMessage?: string;
}

interface PartialDataSurfaceInfo {
  surfaceKey: string;
  status: string;
  source?: string;
  failedSources: string[];
  message?: string;
}

function extractPartialDataSurface(meta: unknown): PartialDataSurfaceInfo | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const surfaces = (meta as { surfaces?: unknown }).surfaces;
  if (!surfaces || typeof surfaces !== "object" || Array.isArray(surfaces)) return undefined;
  for (const [surfaceKey, rawSurface] of Object.entries(surfaces as Record<string, unknown>)) {
    if (!rawSurface || typeof rawSurface !== "object" || Array.isArray(rawSurface)) continue;
    const s = rawSurface as Record<string, unknown>;
    const status = typeof s.status === "string" ? s.status.trim().toLowerCase() : "";
    if (status !== "degraded" && status !== "partial") continue;
    const failedSet = new Set<string>();
    if (typeof s.failed_source === "string" && s.failed_source.trim()) {
      failedSet.add(s.failed_source.trim());
    }
    for (const listKey of ["failed_sources", "degraded_sources"] as const) {
      const arr = s[listKey];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string" && item.trim()) failedSet.add(item.trim());
        }
      }
    }
    const message =
      typeof s.message === "string" && s.message.trim()
        ? s.message.trim()
        : typeof s.reason === "string" && s.reason.trim()
          ? s.reason.trim()
          : undefined;
    const source = typeof s.source === "string" && s.source.trim() ? s.source.trim() : undefined;
    if (failedSet.size > 0 || surfaceKey === "artifact_list") {
      return {
        surfaceKey,
        status,
        source,
        failedSources: Array.from(failedSet),
        message,
      };
    }
  }
  return undefined;
}

function extractSurfaceMessage(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const surfaces = (meta as { surfaces?: unknown }).surfaces;
  if (!surfaces || typeof surfaces !== "object" || Array.isArray(surfaces)) return undefined;
  for (const surface of Object.values(surfaces as Record<string, unknown>)) {
    if (!surface || typeof surface !== "object" || Array.isArray(surface)) continue;
    const s = surface as Record<string, unknown>;
    if (s.status === "unavailable" || s.status === "degraded") {
      if (typeof s.message === "string" && s.message.trim()) return s.message.trim();
      if (typeof s.reason === "string" && s.reason.trim()) return s.reason.trim();
    }
  }
  return undefined;
}

function cleanUnavailableReason(
  rawReason: string | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | undefined {
  if (!rawReason) return undefined;
  const cleaned = rawReason
    .replace(/^strict\s*typed\s*error\s*[·:-]?\s*/i, "")
    .replace(/\s*[·:-]?\s*seed\s*fallback\s*(?:blocked|armed|disabled)?$/i, "")
    .replace(/^strict:\s*/i, "")
    .trim();
  if (!cleaned) return undefined;
  if (/^(failed to fetch|networkerror.*|live read failed|live bff unavailable)$/i.test(cleaned)) {
    return t("common.networkFailureReason", { defaultValue: "Network connection failed" });
  }
  return cleaned;
}

export function ObjectListPage<T extends BaseObject>({
  title, loader, basePath, listHref, rowHref, nameCell, columns: customColumns, extraColumns = [], liveKinds = [], createBehavior, focusParam, focusLabel, focusMatch, emptyState, scopeConfig, summary, alwaysRenderSummary = false, emptyTableMessage,
}: Props<T>) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusParamList = Array.isArray(focusParam)
    ? focusParam
    : typeof focusParam === "string" && focusParam
      ? [focusParam]
      : [];
  const focusId = focusParamList
    .map((param) => searchParams.get(param)?.trim() ?? "")
    .find((val) => val.length > 0) ?? "";
  const { items: rows, pending, refresh, meta, loading } = useLiveListV1<T>(loader, liveKinds, { auto: false });
  const isInitialLoading = Boolean(loading) && rows.length === 0;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const degradation = extractDegradation(meta);
  const partialDataSurface = extractPartialDataSurface(meta);
  const liveStatus = useLiveStatusSnapshot();
  const strictFallbackBlocked = degradation.strictFallbackBlocked || liveStatus.typedError;
  const rawDegradationReason =
    degradation.reason ||
    extractSurfaceMessage(meta) ||
    (degradation.degraded && strictFallbackBlocked ? liveStatus.fallbackReason : undefined);
  const cleanedDegradationReason = cleanUnavailableReason(rawDegradationReason, t);
  const degradedDescription = cleanedDegradationReason
    ? t("common.listUnavailableWithReason", {
        reason: cleanedDegradationReason,
        defaultValue: `Unable to load data from the server (${cleanedDegradationReason}). Please retry.`,
      })
    : t("common.listUnavailableDesc", {
        defaultValue: "Unable to load data from the server. Please retry.",
      });

  const matchesFocus = (row: T, targetFocusId: string): boolean =>
    focusMatch ? focusMatch(row, targetFocusId) : row.id === targetFocusId;

  const allFocusedRows = focusId
    ? rows.filter((row) => matchesFocus(row, focusId))
    : [];

  const scopeCounts: Record<string, number> = {};
  if (scopeConfig) {
    for (const option of scopeConfig.options) {
      scopeCounts[option.id] = 0;
    }
    for (const row of rows) {
      const scope = scopeConfig.classify(row);
      scopeCounts[scope] = (scopeCounts[scope] ?? 0) + 1;
    }
    if (Object.prototype.hasOwnProperty.call(scopeCounts, "all")) {
      scopeCounts.all = rows.length;
    }
  }

  const rawScopeParam = scopeConfig
    ? searchParams.get(scopeConfig.paramName)?.trim().toLowerCase() ?? ""
    : "";
  const explicitScope = scopeConfig?.options.find((opt) => opt.id.toLowerCase() === rawScopeParam)?.id;
  const focusedScope = scopeConfig && allFocusedRows.length > 0
    ? scopeConfig.classify(allFocusedRows[0])
    : undefined;
  const activeScope = scopeConfig
    ? (explicitScope && (explicitScope === "all" || !focusedScope || allFocusedRows.some((row) => scopeConfig.classify(row) === explicitScope))
      ? explicitScope
      : (focusedScope ?? explicitScope ?? scopeConfig.defaultScope))
    : undefined;

  const scopedRows = scopeConfig && activeScope && activeScope !== "all"
    ? rows.filter((row) => scopeConfig.classify(row) === activeScope)
    : rows;

  const focusedRows = focusId
    ? scopedRows.filter((row) => matchesFocus(row, focusId))
    : scopedRows;
  const focusMatched = Boolean(focusId && focusedRows.length > 0);
  const visibleRows = focusMatched ? focusedRows : scopedRows;
  const hasClickableRows = visibleRows.some((r) => Boolean(resolveObjectRowHref(r, basePath, rowHref)));

  const buildScopeHref = (targetScope: string): string => {
    const nextParams = new URLSearchParams(searchParams);
    if (scopeConfig) {
      nextParams.set(scopeConfig.paramName, targetScope);
      if (focusId && focusedScope && focusedScope !== targetScope) {
        for (const param of focusParamList) {
          nextParams.delete(param);
        }
      }
    }
    const qs = nextParams.toString();
    return `${location.pathname}${qs ? `?${qs}` : ""}`;
  };

  const selectScope = (targetScope: string) => {
    if (!scopeConfig) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(scopeConfig.paramName, targetScope);
    if (focusId && focusedScope && focusedScope !== targetScope) {
      for (const param of focusParamList) {
        nextParams.delete(param);
      }
    }
    setSearchParams(nextParams);
  };

  const isDegradedEmpty = !isInitialLoading && rows.length === 0 && degradation.degraded;
  const resolvedEmptyState = !isInitialLoading && !isDegradedEmpty && scopeConfig && activeScope && scopeConfig.emptyStateForScope
    ? (scopeConfig.emptyStateForScope(activeScope, scopeCounts, buildScopeHref) ?? emptyState)
    : (!isInitialLoading && !isDegradedEmpty ? emptyState : undefined);

  const defaultColumns: Column<T>[] = [
    {
      key: "name",
      header: t("common.name"),
      className: nameCell ? "min-w-[320px]" : undefined,
      cell: (r) => nameCell ? nameCell(r) : <div className="font-medium">{r.name}</div>,
    },
    { key: "state", header: t("common.state"), cell: (r) => <StatusBadge state={r.state} /> },
    { key: "risk", header: t("common.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
    ...extraColumns,
    { key: "owner", header: t("common.owner"), cell: (r) => <span className="text-mono text-xs">{r.owner}</span> },
    { key: "updated", header: t("common.updated"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.updatedAt)}</span> },
  ];
  const columns = customColumns ?? defaultColumns;

  const renderCreateAction = () => {
    if (!createBehavior) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button size="sm" disabled>
                <Plus className="h-4 w-4 mr-1" />{t("actions.create")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("common.createNotConfigured")}</TooltipContent>
        </Tooltip>
      );
    }
    if (createBehavior.kind === "disabled") {
      const reason = t(createBehavior.reasonI18nKey, { defaultValue: createBehavior.reasonI18nKey });
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} title={reason}>
              <Button size="sm" disabled title={reason}>
                <Plus className="h-4 w-4 mr-1" />{t("actions.create")}
              </Button>
              <span className="sr-only">{reason}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      );
    }
    if (createBehavior.kind === "redirect") {
      const { to, intent } = createBehavior;
      const url = intent ? `${to}${to.includes("?") ? "&" : "?"}intent=${encodeURIComponent(intent)}` : to;
      return (
        <Button size="sm" onClick={() => navigate(url)}>
          <Plus className="h-4 w-4 mr-1" />{t("actions.create")}
        </Button>
      );
    }
    if (!hasDurableCreateOwner(createBehavior.entity)) {
      const reason = `Create disabled: ${createBehavior.entity} has no typed durable BFF owner.`;
      return (
        <span tabIndex={0} title={reason}>
          <Button size="sm" disabled aria-label={reason}>
            <Plus className="h-4 w-4 mr-1" />{t("actions.create")}
          </Button>
        </span>
      );
    }
    const buttonLabel = createBehavior.entity === "persona" ? "Create Paper Persona" : t("actions.create");
    if (!realWritesEnabled()) {
      const reason = t("mgmt.dataSources.realWritesRequired");
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} title={reason}>
              <Button size="sm" disabled title={reason}>
                <Plus className="h-4 w-4 mr-1" />{buttonLabel}
              </Button>
              <span className="sr-only">{reason}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      );
    }
    // drawer
    return (
      <>
        <Button size="sm" onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />{buttonLabel}
        </Button>
        <EntityCreateDrawer
          entity={createBehavior.entity}
          open={drawerOpen}
          onOpenChange={(v) => { setDrawerOpen(v); if (!v) refresh(); }}
          onCreated={(created) => {
            if (createBehavior.entity === "persona" && hasValidObjectRowId(created)) {
              navigate(`${basePath}/${encodeURIComponent(created.id.trim())}`);
            } else {
              refresh();
            }
          }}
          onCreateFailed={(error) => {
            if (createBehavior.entity !== "persona") return;
            const incomplete = error instanceof PaperPersonaBundleIncompleteError ? error : undefined;
            const details = error && typeof error === "object" && "details" in error
              ? (error as { details?: Record<string, unknown> }).details
              : undefined;
            const personaId = incomplete?.personaId ?? String(details?.persona_id ?? details?.personaId ?? "");
            const failedStep = incomplete?.failedStep ?? String(details?.failed_step ?? details?.failedStep ?? "create");
            if (personaId) {
              navigate(`${basePath}/${encodeURIComponent(personaId)}/onboarding?repair=1&failed_step=${encodeURIComponent(failedStep)}`);
              setDrawerOpen(false);
            }
          }}
        />
      </>
    );
  };

  return (
    <>
      <PageHeader title={title} actions={renderCreateAction()} />
      <PageBody fill>
        {scopeConfig && (
          <div
            role="group"
            aria-label={scopeConfig.groupLabel}
            className="mb-3 flex flex-wrap items-center gap-2"
          >
            {scopeConfig.options.map((option) => {
              const count = scopeCounts[option.id] ?? 0;
              const selected = activeScope === option.id;
              return (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  data-capital-scope={option.id}
                  data-scope={option.id}
                  data-scope-count={count}
                  onClick={() => selectScope(option.id)}
                >
                  {option.label} ({count})
                </Button>
              );
            })}
          </div>
        )}
        {partialDataSurface && (
          <Card
            role="status"
            data-testid="partial-data-banner"
            data-surface={partialDataSurface.surfaceKey}
            data-failed-source={partialDataSurface.failedSources.join(",")}
            className="mb-3 border-status-warning/40 bg-status-warning/10 p-3 text-sm"
          >
            <div className="flex flex-col gap-1">
              <div className="font-medium text-foreground">
                {t("artifact.degradedBanner.title", {
                  failedSources:
                    partialDataSurface.failedSources.length > 0
                      ? partialDataSurface.failedSources.join(", ")
                      : t("common.unavailable", { defaultValue: "unknown" }),
                  defaultValue: `Partial artifact catalog — failed source: ${
                    partialDataSurface.failedSources.join(", ") || "unknown"
                  }`,
                })}
              </div>
              {partialDataSurface.message && (
                <div className="text-xs text-muted-foreground">{partialDataSurface.message}</div>
              )}
            </div>
          </Card>
        )}
        {summary && ((!isInitialLoading && !isDegradedEmpty && alwaysRenderSummary) || visibleRows.length > 0) && <div className="mb-4">{summary(visibleRows)}</div>}
        {pending > 0 && (
          <button
            onClick={refresh}
            className="mb-3 w-full flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("realtime.newUpdates", { count: pending, defaultValue: `${pending} new update(s) — click to refresh` })}
          </button>
        )}
        {focusId && !isInitialLoading && !isDegradedEmpty && (
          <Card className={"mb-3 p-3 text-sm " + (focusMatched
            ? "border-primary/30 bg-primary/5"
            : "border-status-warning/30 bg-status-warning/10")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-foreground">
                {focusMatched
                  ? t("common.focusedObjectFmt", {
                    label: focusLabel ?? title,
                    id: focusId,
                    count: focusedRows.length,
                    defaultValue: `Focused ${focusLabel ?? title}: ${focusId} · ${focusedRows.length} matching row(s)`,
                  })
                  : t("common.focusMissingObjectFmt", {
                    label: focusLabel ?? title,
                    id: focusId,
                    defaultValue: `No ${focusLabel ?? title} row found for ${focusId}. Showing all rows.`,
                  })}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to={listHref ?? basePath}>
                  {t("common.showAllObjects", {
                    label: title,
                    defaultValue: `Show all ${title}`,
                  })}
                </Link>
              </Button>
            </div>
          </Card>
        )}
        {!isInitialLoading && visibleRows.length === 0 && (isDegradedEmpty || resolvedEmptyState) ? (
          <div
            onClick={(event) => {
              if (isDegradedEmpty || !resolvedEmptyState?.actionTo) return;
              const target = event.target as HTMLElement | null;
              if (target?.closest?.("a")) {
                event.preventDefault();
                navigate(resolvedEmptyState.actionTo);
              }
            }}
          >
            <EmptyState
              icon={resolvedEmptyState?.icon ?? <Inbox className="h-8 w-8" />}
              title={
                isDegradedEmpty
                  ? t("common.listUnavailableTitle", {
                      label: title,
                      defaultValue: `${title} is temporarily unavailable`,
                    })
                  : resolvedEmptyState?.title ?? t("common.noResults")
              }
              description={
                isDegradedEmpty
                  ? degradedDescription
                  : resolvedEmptyState?.description ||
                    t("common.awaitingDataDesc", {
                      defaultValue:
                        "This surface has no data yet — the backend is reachable but upstream is not producing for it.",
                    })
              }
              cta={
                isDegradedEmpty
                  ? {
                      label: t("common.retry", { defaultValue: "Retry" }),
                      onClick: refresh,
                    }
                  : resolvedEmptyState?.actionLabel && resolvedEmptyState?.actionTo
                    ? {
                        label: resolvedEmptyState.actionLabel,
                        href: resolvedEmptyState.actionTo,
                      }
                    : undefined
              }
            />
          </div>
        ) : (
          <DataTable
            rows={visibleRows}
            columns={columns}
            loading={isInitialLoading}
            loadingText={t("common.loading")}
            empty={emptyTableMessage ?? t("common.noResults")}
            onRowClick={hasClickableRows
              ? (r) => {
                const href = resolveObjectRowHref(r, basePath, rowHref);
                if (href) navigate(href);
              }
              : undefined}
            fillViewport
          />
        )}
      </PageBody>
    </>
  );
}
