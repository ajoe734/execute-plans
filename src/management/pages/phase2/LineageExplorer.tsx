// Lineage Explorer — Spec Part 3 §19.6.
// Cross-entity lineage graph with entity selector + filter.
import { useEffect, useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { useT } from "@/platform/hooks";
import { bff } from "@/lib/bff/client";
import type { Strategy } from "@/lib/bff/types";

const TYPES = ["Strategy", "Persona", "Artifact", "CapitalPool", "Experiment"] as const;

export const LineageExplorerPage = () => {
  const t = useT();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [rootId, setRootId] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TYPES.map((t) => [t, true])),
  );

  useEffect(() => {
    bff.strategies.list().then((s) => { setStrategies(s); if (s[0]) setRootId(s[0].id); });
  }, []);

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
          <LineageGraph nodes={nodes} edges={edges} height={420} />
        </Card>
      </PageBody>
    </>
  );
};
