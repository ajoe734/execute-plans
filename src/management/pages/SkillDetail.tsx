import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { bff } from "@/lib/bff/client";
import type { Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { Button } from "@/components/ui/button";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { Send, Archive } from "lucide-react";
import { toast } from "sonner";

export const SkillDetail = () => {
  const { id } = useParams();
  const t = useT();
  const [skill, setSkill] = useState<Skill | undefined>();
  const [pubOpen, setPubOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  useEffect(() => { if (id) bff.skills.get(id).then(setSkill); }, [id]);
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
                <Send className="h-4 w-4 mr-1" />Publish
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
            value: "overview", label: "Overview",
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Mode" value={skill.draft ? "DRAFT" : "PUBLISHED"} tone={skill.draft ? "warning" : "success"} />
                  <StatCard label="Eval Score" value={skill.evalScore?.toFixed(2) ?? "—"} tone={(skill.evalScore ?? 0) > 0.85 ? "success" : "warning"} />
                  <StatCard label="Used by Personas" value={skill.usedByPersonas} />
                  <StatCard label="Version" value={skill.version} />
                </div>
                <Section title="Description">
                  <p className="text-sm leading-relaxed">{skill.description}</p>
                </Section>
                <Section title="Metadata">
                  <Field label="Archetype" value={skill.archetype} mono />
                  <Field label="Published" value={skill.publishedAt ? new Date(skill.publishedAt).toLocaleString() : "—"} mono />
                </Section>
              </>
            ),
          },
          { value: "evals", label: "Evaluations", content: <Placeholder text="Skill evaluation suite results." /> },
          { value: "training", label: "Training Data", content: <Placeholder text="Coaching examples and memory candidates feeding this skill." /> },
          { value: "audit", label: "Audit", content: <Placeholder text="Skill lifecycle audit." /> },
        ]}
      />

      <HighRiskConfirm
        open={pubOpen}
        onOpenChange={setPubOpen}
        title={`Publish skill — ${skill.name}`}
        description="Publishes this skill so it becomes available to assigned personas. Routes through trainer-lead approval."
        confirmToken="PUBLISH"
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "Skill", id: skill!.id, action: "publish", newState: "deployed", memo }); toast.success("Publish request submitted"); }}
      />
      <HighRiskConfirm
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title={`Retire skill — ${skill.name}`}
        description="Removes this skill from active personas. Existing conversations referencing it remain in audit."
        confirmToken="RETIRE"
        destructive
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "Skill", id: skill!.id, action: "retire", newState: "retired", memo }); toast.success("Retire request submitted"); }}
      />
    </>
  );
};
