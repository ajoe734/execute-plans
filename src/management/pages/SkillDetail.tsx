import { useEffect, useMemo, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { bff } from "@/lib/bff-v1";
import type { AuditEvent, Persona, Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { StatCard } from "@/platform/components/StatCard";
import { Button } from "@/components/ui/button";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { skillMachine, type SkillState } from "@/lib/stateMachines";
import { Send, Archive } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { SkillPromptEditor } from "@/management/components/detail/SkillPromptEditor";
import { SkillRiskPanel } from "@/management/components/detail/SkillRiskPanel";
import { Card } from "@/components/ui/card";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import { CapabilityDetailEmptyState } from "@/management/components/CapabilityDetailEmptyState";

export const SkillDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [skill, setSkill] = useState<Skill | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  useEffect(() => {
    if (!id) return;
    setLoaded(false);
    bff.skills.get(id).then((row) => { setSkill(row); setLoaded(true); });
    bff.personas.list().then(setPersonas);
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action?.startsWith("skill."))));
  }, [id]);

  const machineState: SkillState = useMemo(() => {
    if (!skill) return "draft";
    if (skill.draft) return "draft";
    return skill.publishedAt ? "active" : "approved";
  }, [skill]);

  if (!skill) {
    return loaded
      ? <CapabilityDetailEmptyState kind="skill" id={id} />
      : <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <>
      <ObjectDetailLayout
        object={skill}
        subtitle={`${skill.archetype} · v${skill.version}`}
        actions={
          <>
            {skill.draft ? (
              <NonProductionActionButton size="sm">
                <Send className="h-4 w-4 mr-1" />{t("skill.publish")}
              </NonProductionActionButton>
            ) : (
              <NonProductionActionButton size="sm" variant="outline">
                <Archive className="h-4 w-4 mr-1" />{t("actions.retire")}
              </NonProductionActionButton>
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
                  <Field label={t("table.created")} value={skill.publishedAt ? safeDateTime(skill.publishedAt) : "—"} mono />
                </Section>
              </>
            ),
          },
          { value: "prompt", label: t("skill.tab.prompt"), content: <SkillPromptEditor skill={skill} /> },
          { value: "sandbox", label: t("phase13.skill.tabs.sandbox"), content: (
            <Card className="p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold">{t("phase13.skill.tabs.sandbox")}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Open the dedicated Skill Sandbox input surface. Execution stays disabled until a governed skill-runner trace/readback endpoint exists.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => nav(`/management/studios/skill-sandbox?id=${skill.id}`)}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />Open Sandbox Studio
              </Button>
            </Card>
          ) },
          { value: "risk", label: t("phase13.skill.tabs.risk"), content: <SkillRiskPanel skill={skill} /> },
          { value: "evals", label: t("skill.evals"), content: (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label={t("section.performance")} value={skill.evalScore?.toFixed(2) ?? "—"} tone={(skill.evalScore ?? 0) > 0.85 ? "success" : "warning"} />
                <StatCard label="Pass rate" value={`${Math.round((skill.evalScore ?? 0) * 100)}%`} />
                <StatCard label="Suites" value={3} />
                <StatCard label="Last run" value={skill.publishedAt ? safeDateTime(skill.publishedAt, "date") : "—"} />
              </div>
              <DataTable
                rows={[
                  { id: "ev_correctness", suite: "correctness", score: (skill.evalScore ?? 0.8), passed: 42, failed: 3 },
                  { id: "ev_grounding", suite: "grounding", score: Math.max(0, (skill.evalScore ?? 0.8) - 0.05), passed: 38, failed: 7 },
                  { id: "ev_safety", suite: "safety", score: Math.min(1, (skill.evalScore ?? 0.8) + 0.04), passed: 50, failed: 0 },
                ]}
                columns={[
                  { key: "suite", header: "Suite", cell: (r) => <span className="text-mono text-xs">{r.suite}</span> },
                  { key: "score", header: t("section.performance"), cell: (r) => <span className="text-mono text-xs">{(r.score ?? 0).toFixed(2)}</span> },
                  { key: "passed", header: "Passed", cell: (r) => <span className="text-mono text-xs text-status-success">{r.passed}</span> },
                  { key: "failed", header: "Failed", cell: (r) => <span className={`text-mono text-xs ${r.failed > 0 ? "text-risk-high" : "text-muted-foreground"}`}>{r.failed}</span> },
                ]}
              />
            </>
          ) },
          { value: "training", label: t("skill.training"), content: (
            <Section title={t("skill.training")}>
              <p className="text-xs text-muted-foreground mb-3">{t("skill.trainingHint")}</p>
              <DataTable
                rows={[
                  { id: "ex_001", source: "memory_review", kind: "positive", excerpt: "Capture macro regime shift commentary inline.", ts: skill.updatedAt },
                  { id: "ex_002", source: "trainer_studio", kind: "correction", excerpt: "Cite source URL when citing macro data.", ts: skill.updatedAt },
                  { id: "ex_003", source: "skill_coaching", kind: "positive", excerpt: "Concise structured output preferred.", ts: skill.updatedAt },
                ]}
                columns={[
                  { key: "src", header: t("table.source"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
                  { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                  { key: "ex", header: t("table.description"), cell: (r) => <span className="text-sm">{r.excerpt}</span> },
                  { key: "ts", header: t("common.updated"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.ts, "date")}</span> },
                ]}
              />
            </Section>
          ) },
          { value: "consumers", label: t("nav.personas"), content: (
            <DataTable rows={personas.slice(0, skill.usedByPersonas || personas.length)} onRowClick={(r) => nav(`/management/personas/${r.id}`)} columns={[
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "arch", header: t("table.type"), cell: (r) => <span className="text-mono text-xs">{r.archetype}</span> },
              { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
            ]} empty={t("empty.none")} />
          ) },
          { value: "lineage", label: t("section.lineage"), content: (
            <Section>
              <div className="text-sm space-y-2">
                <div><span className="text-mono text-xs text-muted-foreground">upstream:</span> <span className="text-mono text-xs text-accent">trainer/{skill.archetype.toLowerCase()}_examples</span> → <span className="text-mono text-xs">memory_review</span></div>
                <div><span className="text-mono text-xs text-muted-foreground">downstream:</span> <span className="text-mono text-xs text-accent">{personas.slice(0, skill.usedByPersonas).map((p) => p.id).join(", ") || "—"}</span></div>
              </div>
            </Section>
          ) },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />
    </>
  );
};
