// Generic object list page generator for the Management Console
// VI-1 — migrated to bffV1: loader returns ListEnvelope<T>; refresh via useLiveListV1.
import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import type { BaseObject } from "@/lib/bff/types";
import { useLiveStatusSnapshot } from "@/lib/bff/liveTransport";
import { useLiveListV1, extractDegradation, type ListEnvelope } from "@/lib/bff-v1";
import { EmptyState } from "@/components/ui/empty-state";
import type { CreateBehavior } from "@/lib/writeIntents/types";
import { withOverlay } from "@/lib/bff/writeOverlay";
import { EntityCreateDrawer } from "@/management/components/write/EntityCreateDrawer";

interface Props<T extends BaseObject> {
  title: string;
  /** VI-1: now returns a ListEnvelope. Use bffV1.lists.* or asListEnvelope(). */
  loader: () => Promise<ListEnvelope<T>>;
  basePath: string;
  nameCell?: (row: T) => ReactNode;
  extraColumns?: Column<T>[];
  /** Realtime data:{kind} events that should refresh this list. */
  liveKinds?: string[];
  /** Pack F F01 — describes the Create button behavior. */
  createBehavior?: CreateBehavior;
  focusParam?: string;
  focusLabel?: string;
  /**
   * Optional matcher for the `focusParam` value. Defaults to strict `row.id === focusId`.
   * Surfaces that are deep-linked by a related id rather than the row id (e.g. a capital pool
   * linked from a persona's paper-ledger id) supply a matcher that also resolves those aliases,
   * so the link lands on a row instead of the "no matching row" banner.
   */
  focusMatch?: (row: T, focusId: string) => boolean;
  emptyState?: {
    title: string;
    description: string;
    icon?: ReactNode;
  };
  /** Optional aggregate summary rendered above the data grid. */
  summary?: (rows: T[]) => ReactNode;
}

export function ObjectListPage<T extends BaseObject>({
  title, loader, basePath, nameCell, extraColumns = [], liveKinds = [], createBehavior, focusParam, focusLabel, focusMatch, emptyState, summary,
}: Props<T>) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusId = focusParam ? searchParams.get(focusParam)?.trim() ?? "" : "";
  const shouldMergeOverlay = createBehavior?.kind === "drawer" && createBehavior.entity !== "persona";
  const wrappedLoader: () => Promise<ListEnvelope<T>> = shouldMergeOverlay
    ? (() => withOverlay<T>(createBehavior.entity, async () => (await loader()).items)().then((items) => ({
        items, cursor: {}, pageSize: items.length, estimatedTotal: items.length, totalCountExact: true,
      })))
    : loader;
  const { items: rows, pending, refresh, meta } = useLiveListV1<T>(wrappedLoader, liveKinds, { auto: false });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const degradation = extractDegradation(meta);
  const liveStatus = useLiveStatusSnapshot();
  const strictFallbackBlocked = degradation.strictFallbackBlocked || liveStatus.typedError;
  const degradedDescription = degradation.degraded && strictFallbackBlocked
    ? `strict typed error · ${degradation.reason || liveStatus.fallbackReason || "live BFF unavailable"} · seed fallback blocked`
    : degradation.reason;
  const focusedRows = focusId
    ? rows.filter((row) => (focusMatch ? focusMatch(row, focusId) : row.id === focusId))
    : rows;
  const focusMatched = Boolean(focusId && focusedRows.length > 0);
  const visibleRows = focusMatched ? focusedRows : rows;

  const columns: Column<T>[] = [
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
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button size="sm" disabled>
                <Plus className="h-4 w-4 mr-1" />{t("actions.create")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t(createBehavior.reasonI18nKey, { defaultValue: createBehavior.reasonI18nKey })}</TooltipContent>
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
    // drawer
    return (
      <>
        <Button size="sm" onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />{t("actions.create")}
        </Button>
        <EntityCreateDrawer
          entity={createBehavior.entity}
          open={drawerOpen}
          onOpenChange={(v) => { setDrawerOpen(v); if (!v) refresh(); }}
          onCreated={(created) => {
            if (createBehavior.entity === "persona" && created.id) {
              navigate(`${basePath}/${encodeURIComponent(String(created.id))}`);
            } else {
              refresh();
            }
          }}
        />
      </>
    );
  };

  return (
    <>
      <PageHeader title={title} actions={renderCreateAction()} />
      <PageBody>
        {summary && rows.length > 0 && <div className="mb-4">{summary(rows)}</div>}
        {pending > 0 && (
          <button
            onClick={refresh}
            className="mb-3 w-full flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("realtime.newUpdates", { count: pending, defaultValue: `${pending} new update(s) — click to refresh` })}
          </button>
        )}
        {focusId && (
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
                <Link to={basePath}>
                  {t("common.showAllObjects", {
                    label: title,
                    defaultValue: `Show all ${title}`,
                  })}
                </Link>
              </Button>
            </div>
          </Card>
        )}
        {rows.length === 0 && (degradation.degraded || emptyState) ? (
          <EmptyState
            icon={emptyState?.icon ?? <Inbox className="h-8 w-8" />}
            title={
              degradation.degraded
                ? t("common.awaitingData", { defaultValue: "No data yet" })
                : emptyState?.title ?? t("common.noResults")
            }
            description={
              degradedDescription ||
              emptyState?.description ||
              t("common.awaitingDataDesc", {
                defaultValue:
                  "This surface has no data yet — the backend is reachable but upstream is not producing for it.",
              })
            }
          />
        ) : (
          <DataTable
            rows={visibleRows}
            columns={columns}
            empty={t("common.noResults")}
            onRowClick={(r) => navigate(`${basePath}/${encodeURIComponent(r.id)}`)}
          />
        )}
      </PageBody>
    </>
  );
}
