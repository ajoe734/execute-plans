// Workflow Templates — Spec Part 3 §18.9.
// Reusable workflow recipes: skill assembly, rebalance run, evolution loop, etc.
import { useState } from "react";
import { managementConsoleReads, type WorkflowTemplateRecord } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { safeDateTime } from "@/lib/utils";

const catTone = (c: WorkflowTemplateRecord["category"]) =>
  c === "rebalance" ? "bg-accent/15 text-accent" :
  c === "evolution" ? "bg-status-warning/15 text-status-warning" :
  c === "training" ? "bg-status-running/15 text-status-running" :
  "bg-status-failed/15 text-status-failed";

export const WorkflowTemplatesPage = () => {
  const t = useT();
  const [active, setActive] = useState<WorkflowTemplateRecord | null>(null);
  const { data: rows } = useV5Live(
    () => managementConsoleReads.workflowTemplates().then((envelope) => envelope.items),
    [],
  );

  return (
    <>
      <PageHeader title={t("nav.workflowTemplates")} subtitle={t("workflows.subtitle")} actions={
        <Button size="sm">{t("workflows.create")}</Button>
      }/>
      <PageBody>
        <Card>
          <DataTable<WorkflowTemplateRecord> rows={rows ?? []} onRowClick={setActive} columns={[
            { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
            { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
            { key: "cat", header: t("table.category"), cell: (r) => <Badge variant="outline" className={`text-[10px] uppercase ${catTone(r.category)}`}>{r.category}</Badge> },
            { key: "steps", header: t("workflows.steps"), cell: (r) => <span className="text-mono text-xs">{r.steps.length}</span> },
            { key: "runs", header: t("workflows.runs"), cell: (r) => <span className="text-mono text-xs">{r.runs}</span> },
            { key: "last", header: t("workflows.lastRun"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.lastRun)}</span> },
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
