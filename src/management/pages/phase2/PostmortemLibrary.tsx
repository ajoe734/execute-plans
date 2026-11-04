// Canonical Postmortem Library — durable list/detail reads keyed by postmortem_id.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  postmortemClient,
  type PostmortemPageInfo,
  type PostmortemRecord,
  type PostmortemResponseMeta,
} from "@/lib/bff-v1/postmortemClient";
import { safeDateTime } from "@/lib/utils";
import { DataTable } from "@/platform/components/DataTable";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { useT } from "@/platform/hooks";
import { Field } from "../ObjectDetailLayout";

type LoadStatus = "loading" | "ready" | "error";

const DEFAULT_PAGE_SIZE = 50;
const POSTMORTEM_STATUS_OPTIONS = ["draft", "review", "approved", "published"] as const;

function displayedAt(item: PostmortemRecord): string {
  return item.published_at || item.created_at;
}

function listSurface(meta: PostmortemResponseMeta | undefined) {
  return meta?.surfaces?.postmortems;
}

function statusLabel(t: ReturnType<typeof useT>, rawStatus: string): string {
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === "draft") {
    return t("postmortem.status.draft", { defaultValue: "Draft" });
  }
  if (normalized === "review") {
    return t("postmortem.status.review", { defaultValue: "In Review" });
  }
  if (normalized === "approved") {
    return t("postmortem.status.approved", { defaultValue: "Approved" });
  }
  if (normalized === "published") {
    return t("postmortem.status.published", { defaultValue: "Published" });
  }
  return rawStatus;
}

export const PostmortemLibraryPage = () => {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("item")?.trim() ?? "";
  const [items, setItems] = useState<PostmortemRecord[]>([]);
  const [pageInfo, setPageInfo] = useState<PostmortemPageInfo>();
  const [active, setActive] = useState<PostmortemRecord | null>(null);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status")?.trim() ?? "");
  const [pageToken, setPageToken] = useState(() => searchParams.get("page_token")?.trim() ?? "");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [listStatus, setListStatus] = useState<LoadStatus>("loading");
  const [detailStatus, setDetailStatus] = useState<"idle" | LoadStatus>("idle");
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [listMeta, setListMeta] = useState<PostmortemResponseMeta>();
  const [detailMeta, setDetailMeta] = useState<PostmortemResponseMeta>();
  const requestSeqRef = useRef(0);

  const loadList = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setListStatus("loading");
    setListError("");
    try {
      const result = await postmortemClient.list({
        page_size: DEFAULT_PAGE_SIZE,
        page_token: pageToken || undefined,
        q: q.trim() || undefined,
        status: statusFilter || undefined,
      });
      if (seq !== requestSeqRef.current) return;
      setItems(result.items);
      setPageInfo(result.page_info);
      setListMeta(result.meta);
      setListStatus("ready");
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      setItems([]);
      setPageInfo(undefined);
      setListStatus("error");
      setListError(error instanceof Error ? error.message : String(error));
    }
  }, [pageToken, q, statusFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    let current = true;
    if (!selectedId) {
      setActive(null);
      setDetailMeta(undefined);
      setDetailError("");
      setDetailStatus("idle");
      return () => { current = false; };
    }

    setActive(null);
    setDetailStatus("loading");
    setDetailError("");
    postmortemClient.get(selectedId)
      .then((result) => {
        if (!current) return;
        setActive(result.item);
        setDetailMeta(result.meta);
        setDetailStatus("ready");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setDetailStatus("error");
        setDetailError(error instanceof Error ? error.message : String(error));
      });
    return () => { current = false; };
  }, [selectedId]);

  const handleSearchChange = (value: string) => {
    setQ(value);
    setPageToken("");
    setCursorHistory([]);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPageToken("");
    setCursorHistory([]);
  };

  const goNextPage = () => {
    const nextToken = pageInfo?.next_page_token;
    if (!nextToken) return;
    setCursorHistory((prev) => [...prev, pageToken]);
    setPageToken(nextToken);
  };

  const goPreviousPage = () => {
    if (cursorHistory.length === 0) return;
    const prevToken = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, -1));
    setPageToken(prevToken);
  };

  const selectPostmortem = (item: PostmortemRecord) => {
    const next = new URLSearchParams(searchParams);
    next.set("item", item.postmortem_id);
    setSearchParams(next, { replace: true });
  };

  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("item");
    setSearchParams(next, { replace: true });
  };

  const surface = listSurface(listMeta);
  const listDegraded = Boolean(surface?.status && surface.status !== "ok");
  const surfaceUnavailable = surface?.status === "unavailable";
  const totalCount = pageInfo?.total ?? listMeta?.total ?? items.length;
  const nextPageToken = pageInfo?.next_page_token ?? null;

  return (
    <>
      <PageHeader
        title={t("nav.postmortems")}
        subtitle={t("postmortem.subtitle")}
        actions={(
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t("postmortem.search")}
              aria-label={t("postmortem.search")}
              className="w-64"
            />
            <select
              aria-label={t("postmortem.statusFilter", { defaultValue: "Filter status" })}
              value={statusFilter}
              onChange={(event) => handleStatusChange(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
            >
              <option value="">{t("postmortem.status.all", { defaultValue: "All statuses" })}</option>
              {POSTMORTEM_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(t, st)}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => void loadList()} disabled={listStatus === "loading"} aria-label="Reload canonical postmortems">
              {listStatus === "loading"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        )}
      />
      <PageBody>
        {listStatus === "error" && (
          <Card role="alert" className="p-4 mb-4 border-status-failed/40 bg-status-failed/5 text-xs text-status-failed flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Canonical postmortem transport unavailable. {listError}
          </Card>
        )}
        {listDegraded && (
          <Card role="status" data-testid="postmortem-surface-banner" className="p-4 mb-4 border-status-warning/40 bg-status-warning/5 text-xs text-status-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Postmortem surface {surface?.status}{surface?.source ? ` · ${surface.source}` : ""}{surface?.reason || surface?.message ? ` · ${surface.reason || surface.message}` : ""}
          </Card>
        )}
        {listStatus !== "error" && !surfaceUnavailable && (
          <Card>
            <DataTable<PostmortemRecord>
              rows={items}
              onRowClick={selectPostmortem}
              empty={listStatus === "loading" ? "Loading canonical postmortems..." : "No canonical postmortems recorded."}
              columns={[
                { key: "id", header: t("table.id"), cell: (row) => <span className="text-mono text-xs">{row.postmortem_id}</span> },
                { key: "status", header: t("table.status"), cell: (row) => <Badge variant="outline">{statusLabel(t, row.status)}</Badge> },
                { key: "title", header: t("table.title"), cell: (row) => <div className="font-medium">{row.title}</div> },
                { key: "inc", header: t("postmortem.incident"), cell: (row) => <span className="text-mono text-xs">{row.incident_id}</span> },
                { key: "by", header: t("postmortem.author"), cell: (row) => <span className="text-mono text-xs">{row.author_ids.join(", ") || "unassigned"}</span> },
                { key: "ts", header: t("postmortem.resolved"), cell: (row) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(displayedAt(row))}</span> },
              ]}
            />
            <footer
              aria-label={t("postmortem.pagination.label", { defaultValue: "Postmortem pagination" })}
              className="flex items-center justify-between gap-3 px-4 py-3 border-t text-xs text-muted-foreground"
            >
              <span data-testid="postmortem-total-count">
                {t("postmortem.pagination.total", {
                  total: totalCount,
                  defaultValue: `${totalCount} postmortems`,
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cursorHistory.length === 0 || listStatus === "loading"}
                  onClick={goPreviousPage}
                >
                  {t("postmortem.pagination.previous", { defaultValue: "Previous" })}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!nextPageToken || listStatus === "loading"}
                  onClick={goNextPage}
                >
                  {t("postmortem.pagination.next", { defaultValue: "Next" })}
                </Button>
              </div>
            </footer>
          </Card>
        )}
      </PageBody>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) closeDetail(); }}>
        <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{active?.title || `Postmortem ${selectedId}`}</SheetTitle>
            <SheetDescription className="sr-only">
              Canonical postmortem detail keyed by postmortem_id {selectedId}.
            </SheetDescription>
          </SheetHeader>

          {detailStatus === "loading" && (
            <div role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading canonical postmortem detail…
            </div>
          )}
          {detailStatus === "error" && (
            <Card role="alert" className="mt-6 p-4 border-status-failed/40 bg-status-failed/5 text-sm text-status-failed">
              Canonical postmortem detail unavailable for <span className="font-mono">{selectedId}</span>. {detailError}
            </Card>
          )}
          {active && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{statusLabel(t, active.status)}</Badge>
                <span className="text-mono text-xs text-muted-foreground">{active.postmortem_id}</span>
              </div>

              {detailMeta?.staleness && (
                <Card role="status" className="p-3 border-status-warning/40 bg-status-warning/5 text-xs text-status-warning">
                  Served from {detailMeta.staleness.served_from || "stale readback"}
                  {detailMeta.staleness.last_known_at ? ` · last known ${safeDateTime(detailMeta.staleness.last_known_at)}` : ""}
                </Card>
              )}

              <Card className="p-4 grid grid-cols-2 gap-4">
                <Field label={t("postmortem.incident")} value={active.incident_id || "unavailable"} mono />
                <Field label={t("postmortem.author")} value={active.author_ids.join(", ") || "unassigned"} mono />
                <Field label={t("postmortem.resolved")} value={safeDateTime(displayedAt(active))} mono />
                <Field label="Deployment stage" value={active.deployment_stage || "unavailable"} mono />
                <Field label="Artifact" value={active.artifact_id || "unavailable"} mono />
                <Field label="Runtime" value={active.runtime_id || "unavailable"} mono />
              </Card>
              <Card className="p-4 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("postmortem.rootCause")}</div>
                  <div className="text-sm mt-1">{active.root_cause || "No root cause recorded."}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Contributing factors</div>
                  {active.contributing_factors.length > 0
                    ? <ul className="mt-1 space-y-1">{active.contributing_factors.map((factor) => <li key={factor} className="text-sm">• {factor}</li>)}</ul>
                    : <div className="text-sm mt-1 text-muted-foreground">No contributing factors recorded.</div>}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("postmortem.followUps")}</div>
                {active.action_items.length > 0
                  ? <ul className="space-y-1.5">{active.action_items.map((action) => <li key={action} className="text-sm">• {action}</li>)}</ul>
                  : <p className="text-sm text-muted-foreground">No action items recorded.</p>}
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
