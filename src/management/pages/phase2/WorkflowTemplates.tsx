// Workflow Templates — Spec Part 3 §18.9.
// Reusable workflow recipes: skill assembly, rebalance run, evolution loop, etc.
import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  category: "rebalance" | "evolution" | "training" | "incident";
  steps: string[];
  inputs: string[];
  lastRun: string;
  runs: number;
  owner: string;
}

const SEED: Template[] = [
  { id: "wf_quart_rebal", name: "Quarterly rebalance", category: "rebalance", steps: ["Freeze metrics", "Calculate ranking", "Simulate", "Submit for approval", "Apply"], inputs: ["pool_id", "quarter"], lastRun: "2026-04-01T10:00:00Z", runs: 12, owner: "rebalance-lead" },
  { id: "wf_evo_loop", name: "Evolution discovery loop", category: "evolution", steps: ["Sample direction", "Mutate", "Backtest", "Score", "Promote"], inputs: ["direction_id", "budget"], lastRun: "2026-04-28T14:00:00Z", runs: 84, owner: "alpha-lead" },
  { id: "wf_persona_retrain", name: "Persona retraining", category: "training", steps: ["Collect memory", "Filter", "Eval baseline", "Retrain", "Eval candidate", "Promote"], inputs: ["persona_id"], lastRun: "2026-04-30T08:00:00Z", runs: 23, owner: "trainer-lead" },
  { id: "wf_incident_drill", name: "Incident response drill", category: "incident", steps: ["Trigger synthetic alert", "Auto-page", "Assemble committee", "Postmortem"], inputs: ["scenario"], lastRun: "2026-04-12T09:00:00Z", runs: 4, owner: "ops-commander" },
];

const catTone = (c: Template["category"]) =>
  c === "rebalance" ? "bg-accent/15 text-accent" :
  c === "evolution" ? "bg-status-warning/15 text-status-warning" :
  c === "training" ? "bg-status-running/15 text-status-running" :
  "bg-status-failed/15 text-status-failed";

export const WorkflowTemplatesPage = () => {
  const t = useT();
  const [active, setActive] = useState<Template | null>(null);

  return (
    <>
      <PageHeader title={t("nav.workflowTemplates")} subtitle={t("workflows.subtitle")} actions={
        <Button size="sm">{t("workflows.create")}</Button>
      }/>
      <PageBody>
        <Card>
          <DataTable rows={SEED} onRowClick={setActive} columns={[
            { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
            { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
            { key: "cat", header: t("table.category"), cell: (r) => <Badge variant="outline" className={`text-[10px] uppercase ${catTone(r.category)}`}>{r.category}</Badge> },
            { key: "steps", header: t("workflows.steps"), cell: (r) => <span className="text-mono text-xs">{r.steps.length}</span> },
            { key: "runs", header: t("workflows.runs"), cell: (r) => <span className="text-mono text-xs">{r.runs}</span> },
            { key: "last", header: t("workflows.lastRun"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.lastRun).toLocaleString()}</span> },
            { key: "own", header: t("table.owner"), cell: (r) => <span className="text-mono text-xs">{r.owner}</span> },
          ]} />
        </Card>
      </PageBody>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px]">
          {active && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-2"><Badge variant="outline" className={catTone(active.category)}>{active.category}</Badge><span className="text-mono text-xs text-muted-foreground">{active.id}</span></div>
                <SheetTitle>{active.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("workflows.steps")}</div>
                  <ol className="space-y-2">
                    {active.steps.map((s, i) => (
                      <li key={i} className="flex gap-3 items-center text-sm">
                        <span className="text-mono text-xs w-6 h-6 rounded-full bg-muted inline-flex items-center justify-center">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("workflows.inputs")}</div>
                  <div className="flex flex-wrap gap-2">{active.inputs.map((i) => <code key={i} className="text-mono text-xs bg-muted px-1.5 py-0.5 rounded">{i}</code>)}</div>
                </Card>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => toast.success(t("workflows.queued", { id: active.id }))}>{t("workflows.run")}</Button>
                  <Button size="sm" variant="outline">{t("workflows.edit")}</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
