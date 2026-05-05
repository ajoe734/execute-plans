import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { runActionSafe } from "@/lib/bff/runAction";
import { useT } from "@/platform/hooks";
import type { AuditEvent, ResearchExperiment } from "@/lib/bff/types";
import { Beaker, Package } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";

export const ResearchDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [x, setX] = useState<ResearchExperiment | undefined>();
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [promoteOpen, setPromoteOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.research.get(id).then(setX);
    bff.audit.list().then((a) => setAudit(a.filter((e) => e.target === id || e.action.startsWith("research."))));
  }, [id]);

  if (!x) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const folds = Array.from({ length: 5 }).map((_, i) => ({
    id: `fold_${i + 1}`,
    fold: i + 1,
    metric: x.metricValue + (Math.random() - 0.5) * 0.08,
    samples: 800 + i * 120,
  }));

  return (
    <>
      <ObjectDetailLayout
        object={x}
        subtitle={x.id}
        actions={
          <>
            <Button size="sm" variant="outline"><Beaker className="h-4 w-4 mr-1" />{t("research.rerun")}</Button>
            <Button size="sm" onClick={() => setPromoteOpen(true)}>
              <Package className="h-4 w-4 mr-1" />Promote to Strategy
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("table.status")} value={x.status.toUpperCase()} />
                  <StatCard label={x.metric} value={x.metricValue.toFixed(3)} tone="success" />
                  <StatCard label={t("table.owner")} value={x.owner} />
                  <StatCard label="Artifact" value={x.artifactId ?? "—"} />
                </div>
                <Section title="Hypothesis">
                  <p className="text-sm leading-relaxed">{x.hypothesis}</p>
                </Section>
              </>
            ),
          },
          {
            value: "metrics", label: t("table.metric"),
            content: (
              <DataTable rows={folds} columns={[
                { key: "fold", header: "Fold", cell: (r) => <span className="text-mono text-xs">#{r.fold}</span> },
                { key: "metric", header: x.metric, cell: (r) => <span className="text-mono text-xs">{r.metric.toFixed(3)}</span> },
                { key: "samples", header: "Samples", cell: (r) => <span className="text-mono text-xs">{r.samples.toLocaleString()}</span> },
              ]} />
            ),
          },
          {
            value: "artifacts", label: "Artifacts",
            content: x.artifactId ? (
              <Section>
                <div
                  className="flex items-center justify-between p-3 rounded-md bg-muted hover:bg-muted/70 cursor-pointer"
                  onClick={() => navigate(`/management/artifacts/${x.artifactId}`)}
                >
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-mono text-sm">{x.artifactId}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">View →</span>
                </div>
              </Section>
            ) : <Section><div className="text-sm text-muted-foreground text-center py-6">No artifacts produced yet.</div></Section>,
          },
          {
            value: "params", label: t("section.parameters"),
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Sample window" value="2018-2025" mono />
                  <Field label="Folds" value="5" mono />
                  <Field label="Seed" value="42" mono />
                </div>
              </Section>
            ),
          },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        title={`Promote Experiment — ${x.name}`}
        description="Promoting will scaffold a new strategy from this experiment's artifact and route it for review."
        confirmToken="PROMOTE"
        destructive
        onConfirm={async (memo) => { await runActionSafe({ kind: "Research", id: x.id, action: "promote_artifact", memo }); toast.success("Promotion request submitted"); }}
      />
    </>
  );
};
