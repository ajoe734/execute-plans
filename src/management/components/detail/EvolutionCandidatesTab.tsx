// Phase 13.F — Candidates with state/fitness filter + batch actions + inspect drawer.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { bff } from "@/lib/bff-v1";
import type { EvolutionCandidate, EvolutionRun } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

type StateFilter = "all" | EvolutionCandidate["state"];

export const EvolutionCandidatesTab = ({ programId }: { programId: string }) => {
  const t = useT();
  const [runs, setRuns] = useState<EvolutionRun[]>([]);
  const [all, setAll] = useState<EvolutionCandidate[]>([]);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [minFit, setMinFit] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspect, setInspect] = useState<EvolutionCandidate | null>(null);

  useEffect(() => { bff.evolutionRuns.forProgram(programId).then(setRuns); }, [programId]);
  useEffect(() => {
    if (!runs.length) return;
    Promise.all(runs.map((r) => bff.evolutionCandidates.forRun(r.id))).then((res) => setAll(res.flat()));
  }, [runs]);

  const filtered = useMemo(() => all.filter((c) => {
    if (stateFilter !== "all" && c.state !== stateFilter) return false;
    if (minFit && c.fitness < parseFloat(minFit)) return false;
    return true;
  }), [all, stateFilter, minFit]);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const batch = (kind: "promote" | "discard") => {
    if (!selected.size) return toast.error(t("empty.none"));
    toast.success(t("phase13.evolution.candidates.queued"));
    setAll((cs) => cs.map((c) => selected.has(c.id) ? { ...c, state: kind === "promote" ? "promoted" : "discarded" } : c));
    setSelected(new Set());
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground">{t("phase13.evolution.candidates.filterState")}</div>
          <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as StateFilter)}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="scored">scored</SelectItem>
              <SelectItem value="promoted">promoted</SelectItem>
              <SelectItem value="discarded">discarded</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground">{t("phase13.evolution.candidates.filterFitness")}</div>
          <Input value={minFit} onChange={(e) => setMinFit(e.target.value)} placeholder="e.g. 1.5" className="w-[120px] h-8 text-xs" />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase">{selected.size} selected</Badge>
          <Button size="sm" variant="outline" onClick={() => batch("promote")} disabled={!selected.size}>
            {t("phase13.evolution.candidates.batchPromote")}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => batch("discard")} disabled={!selected.size}>
            {t("phase13.evolution.candidates.batchDiscard")}
          </Button>
        </div>
      </Card>

      <Card className="p-0 divide-y divide-border">
        {filtered.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">{t("empty.none")}</div>}
        {filtered.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
            <div className="flex-1 min-w-0">
              <div className="text-mono text-xs">{c.id}</div>
              <div className="text-mono text-[10px] text-muted-foreground">parents: {c.parents.join(", ") || "—"} · μ {c.mutationsApplied.length}</div>
            </div>
            <Badge variant="outline" className="text-mono text-xs">{c.fitness.toFixed(3)}</Badge>
            <Badge variant="outline" className={`text-[10px] uppercase ${
              c.state === "promoted" ? "border-status-success/40 text-status-success"
              : c.state === "discarded" ? "border-status-failed/40 text-status-failed"
              : "border-border text-muted-foreground"}`}>{c.state}</Badge>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setInspect(c)}>
              {t("evolution.candidate.inspect")}
            </Button>
          </div>
        ))}
      </Card>

      <Sheet open={!!inspect} onOpenChange={(o) => !o && setInspect(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          {inspect && (
            <>
              <SheetHeader>
                <SheetTitle>{t("evolution.candidate.drawerTitle")}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("evolution.candidate.fitness")}</div>
                  <div className="text-mono text-2xl">{inspect.fitness.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("evolution.candidate.lineage")}</div>
                  <div className="text-mono text-xs">{inspect.parents.join(" + ") || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("evolution.candidate.genome")}</div>
                  <ul className="text-mono text-xs space-y-1">
                    {inspect.mutationsApplied.map((m, i) => <li key={i}>· {m}</li>)}
                    {inspect.mutationsApplied.length === 0 && <li className="text-muted-foreground">—</li>}
                  </ul>
                </div>
                <Button size="sm" disabled={inspect.state === "promoted"} onClick={() => {
                  setAll((cs) => cs.map((c) => c.id === inspect.id ? { ...c, state: "promoted" } : c));
                  toast.success(t("evolution.runs.promoted"));
                  setInspect(null);
                }}>{t("evolution.candidate.promote")}</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
