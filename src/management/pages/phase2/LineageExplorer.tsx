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
import { bff } from "@/lib/bff-v1";
import type { Strategy } from "@/lib/bff/types";
import { resolveEntity, decisionsHref, auditHref } from "@/lib/entityLinks";
import { GitBranch, BookMarked, ArrowUpRight } from "lucide-react";

const TYPES = ["Strategy", "Persona", "Artifact", "CapitalPool", "Experiment"] as const;

export const LineageExplorerPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialRoot = params.get("root") ?? "";
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [rootId, setRootId] = useState<string>(initialRoot);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<LineageNode | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TYPES.map((t) => [t, true])),
  );

  useEffect(() => {
    bff.strategies.list().then((s) => {
      setStrategies(s);
      if (!rootId) {
        const match = initialRoot && s.find((x) => x.id === initialRoot);
        setRootId(match ? match.id : (s[0]?.id ?? ""));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rootId) return;
    if (params.get("root") === rootId) return;
    const p = new URLSearchParams(params);
    p.set("root", rootId);
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId]);

  const { nodes, edges } = useMemo<{ nodes: LineageNode[]; edges: LineageEdge[] }>(() => {
    const root = strategies.find((s) => s.id === rootId);
    if (!root) return { nodes: [], edges: [] };
    const all: LineageNode[] = [
      { id: "exp_42", label: "Momentum Search", type: "Experiment", state: "completed", risk: "low" },
      { id: "art_88", label: "Backtest Result", type: "Artifact", state: "approved", risk: "low" },
      { id: root.id, label: root.name, type: "Strategy", state: root.state, risk: root.risk, highlight: true },
      { id: root.capitalPoolId, label: "Capital Pool", type: "CapitalPool", state: "deployed", risk: "medium" },
      ...root.personaIds.map((p) => ({ id: p, label: p, type: "Persona", state: "deployed", risk: "low" as const })),
    ];
    const e: LineageEdge[] = [
      { from: "exp_42", to: "art_88", label: "produces" },
      { from: "art_88", to: root.id, label: "scaffolds" },
      { from: root.capitalPoolId, to: root.id, label: "funds" },
      ...root.personaIds.map((p) => ({ from: p, to: root.id, label: "routes" })),
    ];
    const filtered = all.filter((n) => enabled[n.type] !== false && (!filter || n.label.toLowerCase().includes(filter.toLowerCase()) || n.id.includes(filter)));
    const ids = new Set(filtered.map((n) => n.id));
    return { nodes: filtered, edges: e.filter((edge) => ids.has(edge.from) && ids.has(edge.to)) };
  }, [strategies, rootId, filter, enabled]);

  const selectedResolved = selected ? resolveEntity(selected.id) : null;

  return (
    <>
      <PageHeader title={t("nav.lineage")} subtitle={t("lineageExplorer.subtitle")} />
      <PageBody>
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.root")}</div>
              <select className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm" value={rootId} onChange={(e) => setRootId(e.target.value)}>
                {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.filter")}</div>
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("lineageExplorer.filterPh")} />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("lineageExplorer.types")}</div>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((typ) => (
                  <button key={typ} onClick={() => setEnabled((p) => ({ ...p, [typ]: !p[typ] }))}>
                    <Badge variant={enabled[typ] ? "default" : "outline"} className="cursor-pointer">{typ}</Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-2">
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
