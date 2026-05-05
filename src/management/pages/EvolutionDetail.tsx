import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { runActionSafe } from "@/lib/bff/runAction";
import { useT } from "@/platform/hooks";
import type { AuditEvent, EvolutionProgram, ResearchExperiment } from "@/lib/bff/types";
import { Pause, Play, GitBranch } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { evolutionMachine, type EvolutionState } from "@/lib/stateMachines";
import { FitnessFormulaPanel } from "../components/detail/FitnessFormulaPanel";
import { EvolutionRunsPanel } from "../components/detail/EvolutionRunsPanel";
import { PromotionPanel } from "../components/detail/PromotionPanel";
import { MutationRuleManager } from "../components/detail/MutationRuleManager";
import { EvolutionCandidatesTab } from "../components/detail/EvolutionCandidatesTab";
import { EvolutionFreezePanel } from "../components/detail/EvolutionFreezePanel";

const mapState = (s: string): EvolutionState => {
  const m: Record<string, EvolutionState> = {
    draft: "draft", review: "under_review", approved: "active",
    deployed: "active", paused: "paused", retired: "retired",
  };
  return m[s] ?? "draft";
};

export const EvolutionDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [e, setE] = useState<EvolutionProgram | undefined>();
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [stopOpen, setStopOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.evolution.get(id).then(setE);
    bff.research.list().then(setExperiments);
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action.startsWith("evolution."))));
  }, [id]);

  if (!e) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const machineState = mapState(e.state);

  return (
    <>
      <ObjectDetailLayout
        object={e}
        subtitle={`Parent: ${e.parentAlpha}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Play className="h-4 w-4 mr-1" />{t("evolution.resume")}</Button>
            <Button size="sm" variant="destructive" onClick={() => setStopOpen(true)}>
              <Pause className="h-4 w-4 mr-1" />Stop Program
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
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
                <Section title={t("lifecycle.title")}>
                  <LifecycleStepper machine={evolutionMachine} current={machineState} i18nPrefix="lifecycle.evolution" />
                </Section>
              </>
            ),
          },
          {
            value: "direction", label: t("evolution.tabs.direction"),
            content: (
              <Section title={t("evolution.direction.title")}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label={t("evolution.direction.parent")} value={e.parentAlpha} mono />
                  <Field label={t("evolution.direction.objective")} value={t("evolution.direction.objectiveValue")} />
                  <Field label={t("evolution.direction.selection")} value="tournament(k=4)" mono />
                  <Field label={t("evolution.direction.population")} value={e.population} mono />
                </div>
              </Section>
            ),
          },
          {
            value: "lineage", label: t("section.lineage"),
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
          { value: "fitness", label: t("evolution.tabs.fitness"), content: <FitnessFormulaPanel mode="fitness" /> },
          { value: "mutation", label: t("evolution.tabs.mutation"), content: <MutationRuleManager /> },
          { value: "runs", label: t("evolution.tabs.runs"), content: <EvolutionRunsPanel programId={e.id} mode="runs" /> },
          { value: "candidates", label: t("evolution.tabs.candidates"), content: <EvolutionCandidatesTab programId={e.id} /> },
          { value: "promotion", label: t("evolution.tabs.promotion"), content: <PromotionPanel program={e} /> },
          { value: "freeze", label: t("phase13.evolution.tabs.freeze"), content: <EvolutionFreezePanel program={e} /> },
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
          { value: "experiments", label: t("nav.experiments"), content: (
            <DataTable rows={experiments} onRowClick={(r) => nav(`/management/experiments/${r.id}`)} columns={[
              { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "metric", header: t("table.metric"), cell: (r) => <span className="text-mono text-xs">{r.metric}: {r.metricValue.toFixed(3)}</span> },
              { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "concluded" ? "success" : r.status === "running" ? "running" : "pending"} /> },
            ]} empty={t("empty.noResults")} />
          ) },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={stopOpen}
        onOpenChange={setStopOpen}
        title={`Stop Evolution Program — ${e.name}`}
        description="Stopping will halt all running generations and discard in-flight candidates."
        confirmToken="STOP"
        destructive
        onConfirm={async (memo) => { await runActionSafe({ kind: "Evolution", id: e.id, action: "stop", memo }); toast.success("Stop requested"); }}
      />
    </>
  );
};
