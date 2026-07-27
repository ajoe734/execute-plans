import { useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff-v1";
import { runActionSafe } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { Artifact, AuditEvent, Deployment } from "@/lib/bff/types";
import { Download, Trash2 } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { ArtifactDiffPanel } from "@/management/components/detail/ArtifactDiffPanel";
import { ArtifactRollbackPanel } from "@/management/components/detail/ArtifactRollbackPanel";

export const ArtifactDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [a, setA] = useState<Artifact | undefined>();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [retireOpen, setRetireOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.artifacts.get(id).then(setA);
    bff.deployments.list().then((all) => setDeployments(all.filter((d) => d.artifactId === id)));
    bff.audit.list().then((au) => setAudit(au.filter((x) => x.target === id || x.action?.startsWith("artifact."))));
  }, [id]);

  if (!a) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <>
      <ObjectDetailLayout
        object={a}
        subtitle={`${a.kind} · v${a.version}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />{t("artifact.download")}</Button>
            <Button size="sm" variant="destructive" onClick={() => setRetireOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Retire
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Kind" value={(a.kind ?? "").toUpperCase()} />
                  <StatCard label={t("table.version")} value={a.version} />
                  <StatCard label="Size" value={`${(a.sizeMb ?? 0).toLocaleString()} MB`} />
                  <StatCard label={t("table.owner")} value={a.owner} />
                </div>
                <Section title={t("detail.section.hash")}>
                  <pre className="text-mono text-sm bg-muted p-3 rounded-md overflow-x-auto">{a.hash}</pre>
                </Section>
              </>
            ),
          },
          {
            value: "diff", label: t("artifact.tab.diff"),
            content: <ArtifactDiffPanel artifact={a} />,
          },
          {
            value: "lineage", label: t("section.lineage"),
            content: a.sourceExperimentId ? (
              <Section>
                <div
                  className="flex items-center justify-between p-3 rounded-md bg-muted hover:bg-muted/70 cursor-pointer"
                  onClick={() => navigate(`/management/research/${a.sourceExperimentId}`)}
                >
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">{t("artifact.sourceExperiment")}</div>
                    <div className="text-mono text-sm">{a.sourceExperimentId}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">View →</span>
                </div>
              </Section>
            ) : <Section><div className="text-sm text-muted-foreground text-center py-6">{t("common.noUpstreamExperiment")}</div></Section>,
          },
          {
            value: "rollback", label: t("artifact.tab.rollback"),
            content: <ArtifactRollbackPanel artifact={a} />,
          },
          {
            value: "consumers", label: t("nav.deployments"),
            content: (
              <DataTable rows={deployments} onRowClick={(r) => navigate(`/management/deployments/${r.id}`)} columns={[
                { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                { key: "tgt", header: t("table.target"), cell: (r) => <span className="text-mono text-xs uppercase">{r.target}</span> },
                { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
                { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
              ]} empty={t("empty.none")} />
            ),
          },
          {
            value: "metadata", label: "Metadata",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Format" value={a.kind === "model" ? "ONNX" : a.kind === "dataset" ? "Parquet" : a.kind === "container" ? "OCI" : "PDF"} mono />
                  <Field label={t("table.created")} value={safeDateTime(a.updatedAt, "date")} mono />
                  <Field label="License" value="Internal" mono />
                </div>
              </Section>
            ),
          },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title={`Retire Artifact — ${a.name}`}
        description={t("detail.confirm.retireArtifact")}
        confirmToken="RETIRE"
        destructive
        onConfirm={async (memo) => {
          await runActionSafe({ kind: "Artifact", id: a.id, action: "archive", memo }, { successTitle: "Retirement requested" });
        }}
      />
    </>
  );
};
