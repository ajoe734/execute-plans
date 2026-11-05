// Lineage Explorer — Spec Part 3 §19.6.
// Cross-entity lineage graph with entity selector + filter.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { useInspector } from "@/platform/components/RightDrawer";
import { useT } from "@/platform/hooks";
import { managementConsoleReads } from "@/lib/bff-v1";
import { resolveEntity, decisionsHref, auditHref } from "@/lib/entityLinks";
import { GitBranch, BookMarked, ArrowUpRight } from "lucide-react";
import { useV5Live } from "@/management/pages/v5/useV5Live";

const TYPES = ["Strategy", "Persona", "Artifact", "CapitalPool", "Experiment", "Dataset"] as const;

export const LineageExplorerPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialRoot = params.get("root") ?? "";
  const [rootId, setRootId] = useState<string>(initialRoot);
  const trimmedRootId = rootId.trim();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<LineageNode | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TYPES.map((typ) => [typ, true])),
  );
  const { data, loading, error } = useV5Live(
    (signal) => managementConsoleReads.lineage(trimmedRootId || undefined, { signal }),
    [trimmedRootId],
    { cacheKey: `phase2.lineage.${trimmedRootId || "root"}` },
  );

  useEffect(() => {
    const currentRoot = params.get("root") ?? "";
    if (currentRoot === trimmedRootId) return;
    const p = new URLSearchParams(params);
    if (trimmedRootId) {
      p.set("root", trimmedRootId);
    } else {
      p.delete("root");
    }
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedRootId]);

  const metaStatus = (
    data?.meta?.status ??
    data?.meta?.surfaces?.lineage?.status ??
    ""
  ).toLowerCase();
  const isUnavailable =
    !loading &&
    (Boolean(error) || !data || metaStatus === "unavailable" || metaStatus === "error" || metaStatus === "failed");
  const hasMore = Boolean(!isUnavailable && (data?.has_more ?? data?.page_info?.has_more));

  const { nodes, edges } = useMemo<{ nodes: LineageNode[]; edges: LineageEdge[] }>(() => {
    const all: LineageNode[] = (data?.nodes ?? []).map((node) => ({
      ...node,
      highlight: node.highlight || (!!trimmedRootId && node.id === trimmedRootId),
    }));
    const e: LineageEdge[] = data?.edges ?? [];
    const filtered = all.filter(
      (n) =>
        enabled[n.type] !== false &&
        (!filter ||
          n.label.toLowerCase().includes(filter.toLowerCase()) ||
          n.id.toLowerCase().includes(filter.toLowerCase())),
    );
    const ids = new Set(filtered.map((n) => n.id));
    return { nodes: filtered, edges: e.filter((edge) => ids.has(edge.from) && ids.has(edge.to)) };
  }, [data, trimmedRootId, filter, enabled]);

  const selectedResolved = selected ? resolveEntity(selected.id) : null;

  return (
    <>
      <PageHeader title={t("nav.lineage")} subtitle={t("lineageExplorer.subtitle")} />
      <PageBody>
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.root")}</div>
              <Input
                aria-label={t("lineageExplorer.root")}
                value={rootId}
                onChange={(e) => setRootId(e.target.value)}
                placeholder={t("lineageExplorer.root")}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.filter")}</div>
              <Input
                aria-label={t("lineageExplorer.filter")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("lineageExplorer.filterPh")}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.types")}</div>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((typ) => (
                  <button
                    key={typ}
                    type="button"
                    aria-pressed={enabled[typ] !== false}
                    onClick={() => setEnabled((p) => ({ ...p, [typ]: !p[typ] }))}
                  >
                    <Badge variant={enabled[typ] ? "default" : "outline"} className="cursor-pointer">{typ}</Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {hasMore && (
            <div
              role="status"
              data-testid="lineage-has-more"
              className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning"
            >
              {t("lineageExplorer.hasMore")}
            </div>
          )}
        </Card>
        <Card className="p-2">
          {!loading && isUnavailable ? (
            <div
              role="alert"
              data-testid="lineage-unavailable"
              className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
            >
              {t("lineageExplorer.unavailable")}
            </div>
          ) : (
            <LineageGraph nodes={nodes} edges={edges} height={420} onSelect={(n) => {
              setSelected(n);
              const r = resolveEntity(n.id);
              useInspector.getState().open({
                id: n.id, type: n.type, name: n.label, state: n.state, risk: n.risk,
                href: r?.route,
                meta: [
                  ...(n.state ? [{ label: "State", value: n.state }] : []),
                  ...(n.risk ? [{ label: "Risk", value: n.risk }] : []),
                ],
                lineage: {
                  upstream: edges.filter((e) => e.to === n.id).map((e) => e.from),
                  downstream: edges.filter((e) => e.from === n.id).map((e) => e.to),
                },
              });
            }} />
          )}
        </Card>
        {selected && (
          <Card className="p-4">
            <div className="flex flex-wrap items-baseline gap-3 mb-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("audit.crossLinks")}</span>
              <span className="font-medium">{selected.label}</span>
              <span className="text-mono text-xs text-muted-foreground">{selected.id}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedResolved ? (
                <>
                  <Link to={selectedResolved.route}>
                    <Button size="sm" variant="outline"><ArrowUpRight className="h-3.5 w-3.5 mr-1" />{selectedResolved.label}</Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => navigate(decisionsHref(selectedResolved.kind, selectedResolved.id))}>
                    <BookMarked className="h-3.5 w-3.5 mr-1" />{t("audit.openDecisions")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(auditHref(selectedResolved.id))}>
                    <GitBranch className="h-3.5 w-3.5 mr-1" />{t("audit.openAudit")}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("common.noDetailRoute")}</span>
              )}
            </div>
          </Card>
        )}
      </PageBody>
    </>
  );
};
