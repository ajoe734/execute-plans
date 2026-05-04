// Evolution Runs + candidates panel.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { toast } from "sonner";
import type { EvolutionCandidate, EvolutionRun } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { StatusBadge } from "@/platform/components/StatusBadge";

export const EvolutionRunsPanel = ({ programId }: { programId: string }) => {
  const t = useT();
  const [runs, setRuns] = useState<EvolutionRun[]>([]);
  const [active, setActive] = useState<string | undefined>();
  const [cands, setCands] = useState<EvolutionCandidate[]>([]);

  useEffect(() => {
    bff.evolutionRuns.forProgram(programId).then((rs) => {
      setRuns(rs);
      if (rs[0]) setActive(rs[0].id);
    });
  }, [programId]);

  useEffect(() => {
    if (!active) return;
    bff.evolutionCandidates.forRun(active).then(setCands);
  }, [active]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">{t("evolution.runs.title")}</div>
        {runs.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">{t("empty.none")}</div>}
        {runs.map((r) => (
          <button key={r.id} onClick={() => setActive(r.id)}
            className={`w-full text-left p-2 rounded-md border ${r.id === active ? "border-accent bg-muted/40" : "border-border"}`}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">G{r.generation} · {r.id}</span>
              <StatusBadge state={r.status} />
            </div>
            <div className="text-mono text-[10px] text-muted-foreground mt-1">
              fitness {r.bestFitness.toFixed(3)} · {r.candidates} candidates · {new Date(r.startedAt).toLocaleString()}
            </div>
          </button>
        ))}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">{t("evolution.runs.candidates")}</div>
        {cands.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">{t("empty.none")}</div>}
        {cands.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-md border border-border">
            <div className="flex-1">
              <div className="text-mono text-xs">{c.id}</div>
              <div className="text-mono text-[10px] text-muted-foreground">parents: {c.parents.join(", ") || "—"} · μ {c.mutationsApplied.length}</div>
            </div>
            <Badge variant="outline" className="text-mono text-xs">{c.fitness.toFixed(3)}</Badge>
            <Badge variant="outline" className={`text-[10px] uppercase ${
              c.state === "promoted" ? "border-status-success/40 text-status-success"
              : c.state === "discarded" ? "border-status-failed/40 text-status-failed"
              : "border-border text-muted-foreground"}`}>{c.state}</Badge>
            {c.state === "scored" && (
              <Button size="sm" variant="outline" onClick={() => toast.success(t("evolution.runs.promoted"))}>{t("evolution.runs.promote")}</Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
};
