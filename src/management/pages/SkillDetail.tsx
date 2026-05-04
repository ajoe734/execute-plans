import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { bff } from "@/lib/bff/client";
import type { Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { Button } from "@/components/ui/button";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { skillMachine, type SkillState } from "@/lib/stateMachines";
import { Send, Archive } from "lucide-react";
import { toast } from "sonner";

export const SkillDetail = () => {
  const { id } = useParams();
  const t = useT();
  const [skill, setSkill] = useState<Skill | undefined>();
  const [pubOpen, setPubOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  useEffect(() => { if (id) bff.skills.get(id).then(setSkill); }, [id]);

  const machineState: SkillState = useMemo(() => {
    if (!skill) return "draft";
    if (skill.draft) return "draft";
    return skill.publishedAt ? "active" : "approved";
  }, [skill]);

  if (!skill) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <>
      <ObjectDetailLayout
        object={skill}
        subtitle={`${skill.archetype} · v${skill.version}`}
        actions={
          <>
            {skill.draft ? (
              <Button size="sm" onClick={() => setPubOpen(true)}>
                <Send className="h-4 w-4 mr-1" />{t("skill.publish")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setRetireOpen(true)}>
                <Archive className="h-4 w-4 mr-1" />{t("actions.retire")}
              </Button>
            )}
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <Section>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("lifecycle.title")}</div>
                  <LifecycleStepper machine={skillMachine} current={machineState} />
                </Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("table.state")} value={skill.draft ? t("skill.state.draft") : t("skill.state.published")} tone={skill.draft ? "warning" : "success"} />
                  <StatCard label={t("section.performance")} value={skill.evalScore?.toFixed(2) ?? "—"} tone={(skill.evalScore ?? 0) > 0.85 ? "success" : "warning"} />
                  <StatCard label={t("nav.personas")} value={skill.usedByPersonas} />
                  <StatCard label={t("table.version")} value={skill.version} />
                </div>
                <Section title={t("table.description")}>
                  <p className="text-sm leading-relaxed">{skill.description}</p>
                </Section>
                <Section title={t("section.metadata")}>
                  <Field label={t("table.type")} value={skill.archetype} mono />
                  <Field label={t("table.created")} value={skill.publishedAt ? new Date(skill.publishedAt).toLocaleString() : "—"} mono />
                </Section>
              </>
            ),
          },
          { value: "evals", label: t("skill.evals"), content: <Placeholder text={t("skill.evalsHint")} /> },
          { value: "training", label: t("skill.training"), content: <Placeholder text={t("skill.trainingHint")} /> },
          { value: "consumers", label: t("nav.personas"), content: <Placeholder text="Personas currently consuming this skill." /> },
          { value: "lineage", label: t("section.lineage"), content: <Placeholder text="Upstream training runs and downstream deployments." /> },
          { value: "audit", label: t("nav.audit"), content: <Placeholder text={t("skill.auditHint")} /> },
        ]}
      />

      <HighRiskConfirm
        open={pubOpen}
        onOpenChange={setPubOpen}
        title={t("skill.publishTitle", { name: skill.name })}
        description={t("skill.publishDesc")}
        confirmToken="PUBLISH"
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "Skill", id: skill!.id, action: "publish", newState: "deployed", memo }); toast.success(t("skill.publishSubmitted")); }}
      />
      <HighRiskConfirm
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title={t("skill.retireTitle", { name: skill.name })}
        description={t("skill.retireDesc")}
        confirmToken="RETIRE"
        destructive
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "Skill", id: skill!.id, action: "retire", newState: "retired", memo }); toast.success(t("skill.retireSubmitted")); }}
      />
    </>
  );
};
