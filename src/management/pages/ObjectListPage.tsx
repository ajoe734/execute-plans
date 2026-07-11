// Generic object list page generator for the Management Console
// VI-1 — migrated to bffV1: loader returns ListEnvelope<T>; refresh via useLiveListV1.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable, type Column } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, RefreshCw, Inbox } from "lucide-react";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";
import type { BaseObject } from "@/lib/bff/types";
import { useLiveListV1, extractDegradation, type ListEnvelope } from "@/lib/bff-v1";
import { EmptyState } from "@/components/ui/empty-state";
import type { CreateBehavior } from "@/lib/writeIntents/types";
import { withOverlay } from "@/lib/bff/writeOverlay";
import { EntityCreateDrawer } from "@/management/components/write/EntityCreateDrawer";
import { PaperPersonaBundleIncompleteError } from "@/lib/bff-v1/personas";

interface Props<T extends BaseObject> {
  title: string;
  /** VI-1: now returns a ListEnvelope. Use bffV1.lists.* or asListEnvelope(). */
  loader: () => Promise<ListEnvelope<T>>;
  basePath: string;
  extraColumns?: Column<T>[];
  /** Realtime data:{kind} events that should refresh this list. */
  liveKinds?: string[];
  /** Pack F F01 — describes the Create button behavior. */
  createBehavior?: CreateBehavior;
}

export function ObjectListPage<T extends BaseObject>({
  title, loader, basePath, extraColumns = [], liveKinds = [], createBehavior,
}: Props<T>) {
  const t = useT();
  const navigate = useNavigate();
  const shouldMergeOverlay = createBehavior?.kind === "drawer" && createBehavior.entity !== "persona";
  const wrappedLoader: () => Promise<ListEnvelope<T>> = shouldMergeOverlay
    ? (() => withOverlay<T>(createBehavior.entity, async () => (await loader()).items)().then((items) => ({
        items, cursor: {}, pageSize: items.length, estimatedTotal: items.length, totalCountExact: true,
      })))
    : loader;
  const { items: rows, pending, refresh, meta } = useLiveListV1<T>(wrappedLoader, liveKinds, { auto: false });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const degradation = extractDegradation(meta);

  const columns: Column<T>[] = [
    { key: "name", header: t("common.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
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
          <Plus className="h-4 w-4 mr-1" />{createBehavior.entity === "persona" ? "Create Paper Persona" : t("actions.create")}
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
      <PageBody>
        {pending > 0 && (
          <button
            onClick={refresh}
            className="mb-3 w-full flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("realtime.newUpdates", { count: pending, defaultValue: `${pending} new update(s) — click to refresh` })}
          </button>
        )}
        {rows.length === 0 && degradation.degraded ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title={t("common.awaitingData", { defaultValue: "No data yet" })}
            description={
              degradation.reason ||
              t("common.awaitingDataDesc", {
                defaultValue:
                  "This surface has no data yet — the backend is reachable but upstream is not producing for it.",
              })
            }
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            empty={t("common.noResults")}
            onRowClick={(r) => navigate(`${basePath}/${r.id}`)}
          />
        )}
      </PageBody>
    </>
  );
}
