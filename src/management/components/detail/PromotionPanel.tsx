// Phase 13.F — Evolution Promotion Panel
// Candidate vs parent comparison + Promote to Paper / Live with HighRiskConfirm.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { bff } from "@/lib/bff-v1";
import { mutations } from "@/lib/bff/mutations";
import type { EvolutionCandidate, EvolutionProgram, EvolutionRun, PromotionRecord } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { DataTable } from "@/platform/components/DataTable";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { safeDateTime } from "@/lib/utils";

type PromotionTarget = "paper" | "live";

export const PromotionPanel = ({ program }: { program: EvolutionProgram }) => {
  const t = useT();
  const [runs, setRuns] = useState<EvolutionRun[]>([]);
  const [candidates, setCandidates] = useState<EvolutionCandidate[]>([]);
  const [history, setHistory] = useState<PromotionRecord[]>([]);
  const [confirm, setConfirm] = useState<{ candidate: EvolutionCandidate; target: PromotionTarget } | null>(null);

  useEffect(() => {
    bff.evolutionRuns.forProgram(program.id).then(setRuns);
    bff.promotions.forProgram(program.id).then(setHistory);
  }, [program.id]);

  useEffect(() => {
    if (!runs.length) return;
    Promise.all(runs.map((r) => bff.evolutionCandidates.forRun(r.id))).then((all) =>
      setCandidates(all.flat().filter((c) => c.state !== "discarded")),
    );
  }, [runs]);

  const parentFitness = program.bestFitness;
  const rows = useMemo(
    () => candidates.map((c) => ({
      ...c,
      deltaFitness: c.fitness - parentFitness,
    })),
    [candidates, parentFitness],
  );

  const onConfirm = async (memo: string) => {
    if (!confirm) return;
    await mutations.promoteCandidate(program.id, confirm.candidate.id, confirm.target, memo);
    toast.success(t("phase13.evolution.promotion.queued"));
    setHistory((h) => [
      {
        id: `pr_local_${Date.now()}`,
        programId: program.id,
        candidateId: confirm.candidate.id,
        target: confirm.target,
        promotedAt: new Date().toISOString(),
        promotedBy: "you",
        deltaSharpe: confirm.candidate.fitness - parentFitness,
        deltaDrawdown: 0,
      },
      ...h,
    ]);
    setConfirm(null);
  };

  return (
    <>
      <Section title={t("evolution.promotion.title")}>
        <DataTable
          rows={rows}
          empty={t("empty.none")}
          columns={[
            { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
            { key: "fit", header: "Fitness", cell: (r) => <span className="text-mono text-xs">{r.fitness.toFixed(3)}</span> },
            { key: "delta", header: t("phase13.evolution.promotion.deltaSharpe"), cell: (r) => (
              <span className={`text-mono text-xs ${r.deltaFitness >= 0 ? "text-status-success" : "text-status-failed"}`}>
                {r.deltaFitness >= 0 ? "+" : ""}{r.deltaFitness.toFixed(3)}
              </span>
            ) },
            { key: "parents", header: "Parents", cell: (r) => <span className="text-mono text-[11px] text-muted-foreground">{r.parents.join(", ") || "—"}</span> },
            { key: "state", header: t("table.state"), cell: (r) => <Badge variant="outline" className="text-[10px] uppercase">{r.state}</Badge> },
            { key: "actions", header: "", cell: (r) => (
              <div className="flex gap-2 justify-end">
                <PermissionAwareButton requiredAction="promote_paper" size="sm" variant="outline"
                  onClick={() => setConfirm({ candidate: r, target: "paper" })}>
                  {t("phase13.evolution.promotion.promotePaper")}
                </PermissionAwareButton>
                <PermissionAwareButton requiredAction="promote_live" size="sm"
                  onClick={() => setConfirm({ candidate: r, target: "live" })}>
                  {t("phase13.evolution.promotion.promoteLive")}
                </PermissionAwareButton>
              </div>
            ) },
          ]}
        />
      </Section>

      <Section title={t("phase13.evolution.promotion.history")}>
        <Card className="p-0">
          <DataTable
            rows={history}
            empty={t("empty.none")}
            columns={[
              { key: "cand", header: "Candidate", cell: (r) => <span className="text-mono text-xs">{r.candidateId}</span> },
              { key: "target", header: t("phase13.evolution.promotion.target"), cell: (r) => (
                <Badge variant="outline" className={`text-[10px] uppercase ${r.target === "live" ? "border-status-failed/40 text-status-failed" : "border-status-warning/40 text-status-warning"}`}>{r.target}</Badge>
              ) },
              { key: "ds", header: t("phase13.evolution.promotion.deltaSharpe"), cell: (r) => <span className="text-mono text-xs">{r.deltaSharpe >= 0 ? "+" : ""}{r.deltaSharpe.toFixed(3)}</span> },
              { key: "dd", header: t("phase13.evolution.promotion.deltaDD"), cell: (r) => <span className="text-mono text-xs">{r.deltaDrawdown >= 0 ? "+" : ""}{r.deltaDrawdown.toFixed(3)}</span> },
              { key: "by", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.promotedBy}</span> },
              { key: "at", header: t("common.updated"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.promotedAt)}</span> },
            ]}
          />
        </Card>
      </Section>

      <HighRiskConfirm
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Promote ${confirm?.candidate.id ?? ""} → ${confirm?.target.toUpperCase() ?? ""}`}
        description={`Promotes this candidate to ${confirm?.target} environment. Δ fitness vs parent: ${confirm ? (confirm.candidate.fitness - parentFitness).toFixed(3) : "—"}.`}
        confirmToken={confirm?.target === "live" ? "PROMOTE-LIVE" : "PROMOTE"}
        destructive={confirm?.target === "live"}
        onConfirm={onConfirm}
      />
    </>
  );
};
