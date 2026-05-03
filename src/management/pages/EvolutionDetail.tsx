import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { EvolutionProgram } from "@/lib/bff/types";
import { Pause, Play, GitBranch } from "lucide-react";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";

export const EvolutionDetail = () => {
  const { id } = useParams();
  const t = useT();
  const [e, setE] = useState<EvolutionProgram | undefined>();
  const [stopOpen, setStopOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.evolution.get(id).then(setE);
  }, [id]);

  if (!e) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <>
      <ObjectDetailLayout
        object={e}
        subtitle={`Parent: ${e.parentAlpha}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Play className="h-4 w-4 mr-1" />Resume</Button>
            <Button size="sm" variant="destructive" onClick={() => setStopOpen(true)}>
              <Pause className="h-4 w-4 mr-1" />Stop Program
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Generation" value={`G${e.generation}`} />
                  <StatCard label="Population" value={e.population.toString()} />
                  <StatCard label="Best Fitness" value={e.bestFitness.toFixed(3)} tone="success" />
                  <StatCard label="Progress" value={`${(e.progress * 100).toFixed(0)}%`} />
                </div>
                <Section title="Generation Progress">
                  <Progress value={e.progress * 100} className="h-2" />
                </Section>
              </>
            ),
          },
          {
            value: "lineage", label: "Lineage",
            content: (
              <Section>
                <div className="flex items-center gap-3 text-sm">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <span className="text-mono">{e.parentAlpha}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-mono">G{e.generation} candidates ({e.population})</span>
                </div>
              </Section>
            ),
          },
          {
            value: "population", label: "Top Candidates",
            content: <Placeholder text="Top-N candidates and their fitness will appear here." />,
          },
          {
            value: "config", label: "Config",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Mutation rate" value="0.12" mono />
                  <Field label="Crossover" value="single-point" mono />
                  <Field label="Selection" value="tournament(k=4)" mono />
                </div>
              </Section>
            ),
          },
          { value: "audit", label: "Audit", content: <Placeholder text="Lifecycle events for this program." /> },
        ]}
      />

      <HighRiskConfirm
        open={stopOpen}
        onOpenChange={setStopOpen}
        title={`Stop Evolution Program — ${e.name}`}
        description="Stopping will halt all running generations and discard in-flight candidates."
        confirmToken="STOP"
        destructive
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "Evolution", id: ev.id, action: "stop", memo }); toast.success("Stop requested"); }}
      />
    </>
  );
};
