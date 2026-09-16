import { useEffect, useMemo, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { bffV1, runActionSafe } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { Alert, ApprovalRequest, AuditEvent, EvolutionProgram, ResearchExperiment } from "@/lib/bff-v1";
import { Pause, Play, GitBranch, CheckCircle } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { evolutionMachine, type EvolutionState } from "@/lib/stateMachines";
import { FitnessFormulaPanel } from "../components/detail/FitnessFormulaPanel";
import { EvolutionRunsPanel } from "../components/detail/EvolutionRunsPanel";
import { PromotionPanel } from "../components/detail/PromotionPanel";
import { MutationRuleManager } from "../components/detail/MutationRuleManager";
import { EvolutionCandidatesTab } from "../components/detail/EvolutionCandidatesTab";
import { EvolutionFreezePanel } from "../components/detail/EvolutionFreezePanel";

const mapState = (s?: string): EvolutionState => {
  const clean = (s ?? "").trim().toLowerCase();
  const m: Record<string, EvolutionState> = {
    draft: "draft",
    under_review: "under_review",
    review: "under_review",
    active: "active",
    approved: "active",
    deployed: "active",
    paused: "paused",
    stopped: "stopped",
    completed: "completed",
    retired: "retired",
  };
  return m[clean] ?? "draft";
};

export const EvolutionDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [e, setE] = useState<EvolutionProgram | undefined>();
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [stopOpen, setStopOpen] = useState(false);
  const [newConstraint, setNewConstraint] = useState("");

  const refreshProgram = async () => {
    if (!id) return;
    const refreshed = await bffV1.evolution.get(id);
    if (refreshed) setE(refreshed);
  };

  useEffect(() => {
    if (!id) return;
    bffV1.evolution.get(id).then(setE);
    bffV1.research.list().then(setExperiments);
    bffV1.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action?.startsWith("evolution."))));
    bffV1.alerts.list().then((a) => setAlerts(a.filter((x) => x.relatedTarget === id || x.source?.includes("evolution"))));
    bffV1.approvals.list().then((a) => setApprovals(a.filter((x) => x.subject?.includes(id ?? "") || x.kind?.includes("evolution"))));
  }, [id]);

  if (!e) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const rawState = e.status ?? e.state;
  const machineState = mapState(typeof rawState === "string" ? rawState : undefined);

  const handleResume = async () => {
    const receipt = await runActionSafe(
      { kind: "Evolution", id: e.id, action: "resume_program", memo: "Operator resume" },
      { successTitle: t("evolution.resumed", { defaultValue: "Program resumed" }) },
    );
    if (receipt.ok) await refreshProgram();
  };

  const handlePause = async () => {
    const receipt = await runActionSafe(
      { kind: "Evolution", id: e.id, action: "pause_program", memo: "Operator pause" },
      { successTitle: t("evolution.paused", { defaultValue: "Program paused" }) },
    );
    if (receipt.ok) await refreshProgram();
  };

  const handleSubmitReview = async () => {
    const receipt = await runActionSafe(
      { kind: "Evolution", id: e.id, action: "submit_evolution_review", memo: "Operator submit review" },
      { successTitle: t("evolution.reviewSubmitted", { defaultValue: "Review submitted" }) },
    );
    if (receipt.ok) await refreshProgram();
  };

  const handleApprove = async () => {
    const receipt = await runActionSafe(
      { kind: "Evolution", id: e.id, action: "approve_program", memo: "Operator approve" },
      { successTitle: t("evolution.approved", { defaultValue: "Program approved" }) },
    );
    if (receipt.ok) await refreshProgram();
  };

  const handleComplete = async () => {
    const receipt = await runActionSafe(
      { kind: "Evolution", id: e.id, action: "complete_program", memo: "Operator complete" },
      { successTitle: t("evolution.completed", { defaultValue: "Program completed" }) },
    );
    if (receipt.ok) await refreshProgram();
  };

  const handleRetire = async () => {
    const receipt = await runActionSafe(
      { kind: "Evolution", id: e.id, action: "retire_program", memo: "Operator retire" },
      { successTitle: t("evolution.retired", { defaultValue: "Program retired" }) },
    );
    if (receipt.ok) await refreshProgram();
  };

  const programConstraints = Array.isArray(e.constraints)
    ? e.constraints.map((c, idx) => ({
        id: c.id || `cst-${idx + 1}`,
        expr: c.expression || c.name || (typeof c.value !== "undefined" ? `${c.operator || "<="} ${c.value}` : `Constraint ${idx + 1}`),
        ts: c.created_at || e.updatedAt || new Date().toISOString(),
      }))
    : [];

  return (
    <>
      <ObjectDetailLayout
        object={e}
        subtitle={`Parent: ${e.parentAlpha}`}
        actions={
          <div className="flex items-center gap-2">
            {machineState === "draft" && (
              <Button size="sm" variant="outline" onClick={handleSubmitReview}>
                {t("evolution.submitReview", { defaultValue: "Submit Review" })}
              </Button>
            )}
            {machineState === "under_review" && (
              <Button size="sm" variant="outline" onClick={handleApprove}>
                <CheckCircle className="h-4 w-4 mr-1" />
                {t("evolution.approve", { defaultValue: "Approve Program" })}
              </Button>
            )}
            {machineState === "active" && (
              <>
                <Button size="sm" variant="outline" onClick={handlePause}>
                  <Pause className="h-4 w-4 mr-1" />
                  {t("evolution.pause", { defaultValue: "Pause Program" })}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleComplete}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t("evolution.complete", { defaultValue: "Complete Program" })}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setStopOpen(true)}>
                  <Pause className="h-4 w-4 mr-1" />Stop Program
                </Button>
              </>
            )}
            {machineState === "paused" && (
              <>
                <Button size="sm" variant="outline" onClick={handleResume}>
                  <Play className="h-4 w-4 mr-1" />
                  {t("evolution.resume", { defaultValue: "Resume Program" })}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setStopOpen(true)}>
                  <Pause className="h-4 w-4 mr-1" />Stop Program
                </Button>
              </>
            )}
            {machineState === "stopped" && (
              <>
                <Badge variant="outline" className="border-status-failed/40 text-status-failed uppercase text-xs">
                  Stopped
                </Badge>
                <Button size="sm" variant="outline" onClick={handleRetire}>
                  {t("evolution.retire", { defaultValue: "Retire Program" })}
                </Button>
              </>
            )}
            {machineState === "completed" && (
              <Button size="sm" variant="outline" onClick={handleRetire}>
                {t("evolution.retire", { defaultValue: "Retire Program" })}
              </Button>
            )}
            {machineState === "retired" && (
              <Badge variant="outline" className="text-muted-foreground uppercase text-xs">
                Retired
              </Badge>
            )}
          </div>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Generation" value={`G${e.generation}`} />
                  <StatCard label="Population" value={e.population.toString()} />
                  <StatCard label="Best Fitness" value={(e.bestFitness ?? 0).toFixed(3)} tone="success" />
                  <StatCard label="Progress" value={`${(e.progress * 100).toFixed(0)}%`} />
                </div>
                <Section title={t("detail.section.generationProgress")}>
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
          { value: "fitness", label: t("evolution.tabs.fitness"), content: <FitnessFormulaPanel mode="fitness" programId={e.id} /> },
          { value: "mutation", label: t("evolution.tabs.mutation"), content: <MutationRuleManager programId={e.id} /> },
          { value: "runs", label: t("evolution.tabs.runs"), content: <EvolutionRunsPanel programId={e.id} mode="runs" /> },
          { value: "candidates", label: t("evolution.tabs.candidates"), content: <EvolutionCandidatesTab programId={e.id} /> },
          { value: "promotion", label: t("evolution.tabs.promotion"), content: <PromotionPanel program={e} onRefresh={refreshProgram} /> },
          { value: "freeze", label: t("phase13.evolution.tabs.freeze"), content: <EvolutionFreezePanel program={e} onRefresh={refreshProgram} /> },
          {
            value: "constraints", label: t("evolution.tabs.constraints"),
            content: (
              <Section title={t("evolution.constraints.title")}>
                <ul className="space-y-1.5 text-sm mb-3">
                  {programConstraints.length === 0 && <li className="text-xs text-muted-foreground">{t("evolution.constraints.empty")}</li>}
                  {programConstraints.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 text-mono text-xs">
                      <Badge variant="outline" className="text-[10px]">{c.id}</Badge>
                      <span className="flex-1">{c.expr}</span>
                      <span className="text-muted-foreground">{safeDateTime(c.ts, "date")}</span>
                    </li>
                  ))}
                </ul>
                <Textarea value={newConstraint} onChange={(ev) => setNewConstraint(ev.target.value)} placeholder={t("evolution.constraints.placeholder")} rows={2} />
                <Button className="mt-2" size="sm" disabled={newConstraint.trim().length < 4} onClick={async () => {
                  const expr = newConstraint.trim();
                  const constraintPayload = {
                    name: expr,
                    operator: "<=",
                    value: expr,
                    expression: expr,
                    scope: "global",
                  };
                  const receipt = await runActionSafe({
                    kind: "Evolution",
                    id: e.id,
                    action: "create_constraint",
                    memo: expr,
                    params: { ...constraintPayload, payload: constraintPayload },
                    payload: constraintPayload,
                  }, {
                    successTitle: t("evolution.constraints.created"),
                  });
                  if (!receipt.ok) return;
                  await refreshProgram();
                  setNewConstraint("");
                }}>{t("evolution.constraints.add")}</Button>
              </Section>
            ),
          },
          {
            value: "alerts", label: t("evolution.tabs.alerts"),
            content: alerts.length === 0
              ? <Card className="p-6 text-xs text-muted-foreground">{t("evolution.alerts.empty")}</Card>
              : <DataTable rows={alerts} columns={[
                  { key: "title", header: t("table.title", { defaultValue: "Title" }), cell: (r) => <span className="text-sm">{r.title}</span> },
                  { key: "sev", header: t("incident.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                  { key: "src", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
                ]} empty={t("empty.noResults")} />,
          },
          {
            value: "approvals", label: t("evolution.tabs.approvals"),
            content: approvals.length === 0
              ? <Card className="p-6 text-xs text-muted-foreground">{t("evolution.approvals.empty")}</Card>
              : <DataTable rows={approvals} onRowClick={(r) => nav(`/management/governance/${r.id}`)} columns={[
                  { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                  { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
                  { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                ]} empty={t("empty.none")} />,
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
          { value: "experiments", label: t("nav.experiments"), content: (
            <DataTable rows={experiments} onRowClick={(r) => nav(`/management/experiments/${r.id}`)} columns={[
              { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "metric", header: t("table.metric"), cell: (r) => <span className="text-mono text-xs">{r.metric}: {(r.metricValue ?? 0).toFixed(3)}</span> },
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
        description={t("detail.confirm.stopEvolution")}
        confirmToken="STOP"
        destructive
        onConfirm={async (memo) => {
          const receipt = await runActionSafe(
            { kind: "Evolution", id: e.id, action: "stop", memo },
            { successTitle: t("evolution.stopped", { defaultValue: "Program stopped" }) },
          );
          if (receipt.ok) await refreshProgram();
        }}
      />
    </>
  );
};
