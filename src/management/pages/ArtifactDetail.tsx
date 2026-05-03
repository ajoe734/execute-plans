import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Artifact } from "@/lib/bff/types";
import { Download, Trash2 } from "lucide-react";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";

export const ArtifactDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [a, setA] = useState<Artifact | undefined>();
  const [retireOpen, setRetireOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.artifacts.get(id).then(setA);
  }, [id]);

  if (!a) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <>
      <ObjectDetailLayout
        object={a}
        subtitle={`${a.kind} · v${a.version}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />Download</Button>
            <Button size="sm" variant="destructive" onClick={() => setRetireOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Retire
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Kind" value={a.kind.toUpperCase()} />
                  <StatCard label="Version" value={a.version} />
                  <StatCard label="Size" value={`${a.sizeMb.toLocaleString()} MB`} />
                  <StatCard label="Owner" value={a.owner} />
                </div>
                <Section title="Hash">
                  <pre className="text-mono text-sm bg-muted p-3 rounded-md overflow-x-auto">{a.hash}</pre>
                </Section>
              </>
            ),
          },
          {
            value: "lineage", label: "Lineage",
            content: a.sourceExperimentId ? (
              <Section>
                <div
                  className="flex items-center justify-between p-3 rounded-md bg-muted hover:bg-muted/70 cursor-pointer"
                  onClick={() => navigate(`/management/research/${a.sourceExperimentId}`)}
                >
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Source experiment</div>
                    <div className="text-mono text-sm">{a.sourceExperimentId}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">View →</span>
                </div>
              </Section>
            ) : <Placeholder text="No upstream experiment recorded." />,
          },
          {
            value: "consumers", label: "Consumers",
            content: <Placeholder text="Strategies & deployments that reference this artifact." />,
          },
          {
            value: "metadata", label: "Metadata",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Format" value={a.kind === "model" ? "ONNX" : a.kind === "dataset" ? "Parquet" : a.kind === "container" ? "OCI" : "PDF"} mono />
                  <Field label="Created" value={new Date(a.updatedAt).toLocaleDateString()} mono />
                  <Field label="License" value="Internal" mono />
                </div>
              </Section>
            ),
          },
          { value: "audit", label: "Audit", content: <Placeholder text="Artifact lifecycle events." /> },
        ]}
      />

      <HighRiskConfirm
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title={`Retire Artifact — ${a.name}`}
        description="Retiring will mark this artifact as deprecated and prevent new deployments from using it."
        confirmToken="RETIRE"
        destructive
        onConfirm={() => { toast.success("Retirement requested"); }}
      />
    </>
  );
};
