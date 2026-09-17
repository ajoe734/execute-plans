import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bffV1, mgmt, runActionSafe, BffError } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { AuditEvent, ResearchExperiment } from "@/lib/bff-v1";
import type { ManagementPersonaFleetRow, ManagementResearchProject } from "@/lib/bff-v1/management";
import { Beaker, Package, Ban, RotateCcw, Archive, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";

type ResearchExperimentLive = ResearchExperiment & {
  experimentId?: string;
  experiment_id?: string;
  framework?: string;
  frameworks?: string[];
  datasetRef?: string;
  dataset_ref?: string;
  datasetManifestId?: string;
  dataset_manifest_id?: string;
  registryAdmissionStatus?: string;
  registry_admission_status?: string;
  deploymentStage?: string;
  deployment_stage?: string;
};

type ResearchContext = {
  persona?: ManagementPersonaFleetRow;
  project?: ManagementResearchProject;
  frameworks: string[];
  datasetRef?: string;
  registryAdmissionStatus?: string;
  blockedByTaskIds: string[];
};

function uniq(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function experimentIdOf(x: ResearchExperimentLive): string {
  return x.experimentId ?? x.experiment_id ?? x.id;
}

function researchContextFor(experiment: ResearchExperimentLive, rows: ManagementPersonaFleetRow[]): ResearchContext {
  const experimentId = experimentIdOf(experiment);
  for (const row of rows) {
    const project = row.currentResearchProjects?.find((candidate) => candidate.experimentId === experimentId);
    if (project) {
      return {
        persona: row,
        project,
        frameworks: uniq([...(project.frameworks ?? []), ...(row.researchStatus?.frameworks ?? [])]),
        datasetRef: project.datasetRef ?? row.researchStatus?.datasetRef,
        registryAdmissionStatus: row.researchStatus?.registryAdmissionStatus,
        blockedByTaskIds: project.blockedByTaskIds ?? row.researchStatus?.pendingTaskIds ?? [],
      };
    }
    if (row.researchStatus?.experimentId === experimentId) {
      return {
        persona: row,
        frameworks: uniq(row.researchStatus.frameworks ?? []),
        datasetRef: row.researchStatus.datasetRef,
        registryAdmissionStatus: row.researchStatus.registryAdmissionStatus,
        blockedByTaskIds: row.researchStatus.pendingTaskIds ?? [],
      };
    }
  }
  return {
    frameworks: uniq([
      ...(experiment.frameworks ?? []),
      experiment.framework,
    ]),
    datasetRef: experiment.datasetRef ?? experiment.dataset_ref,
    registryAdmissionStatus: experiment.registryAdmissionStatus ?? experiment.registry_admission_status,
    blockedByTaskIds: [],
  };
}

export const ResearchDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [x, setX] = useState<ResearchExperimentLive | undefined>();
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [fleetRows, setFleetRows] = useState<ManagementPersonaFleetRow[]>([]);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [invalidateOpen, setInvalidateOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bffV1.research.get(id).then((value) => setX(value as ResearchExperimentLive | undefined));
    bffV1.audit.list().then((a) => setAudit(a.filter((e) => e.target === id || e.action?.startsWith("research."))));
    mgmt.personaFleet.get().then(setFleetRows).catch(() => setFleetRows([]));
  }, [id]);

  if (!x) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const researchContext = researchContextFor(x, fleetRows);
  const frameworks = researchContext.frameworks.length
    ? researchContext.frameworks
    : uniq([x.framework, ...(x.frameworks ?? [])]);
  const folds: { id: string; fold: number; metric: number; samples: number }[] = [];

  const statusLower = (x.status ?? "").toLowerCase();
  const canCancel =
    x.allowedActions?.canCancel ??
    (statusLower === "queued" || statusLower === "running" || statusLower === "active");
  const canRetry =
    x.allowedActions?.canRetry ??
    ["failed", "canceled", "cancelled", "concluded", "completed", "invalidated"].includes(statusLower);
  const isArchived = Boolean(x.is_archived ?? x.isArchived);
  const canArchive =
    x.allowedActions?.canArchive ??
    (!isArchived && ["failed", "canceled", "cancelled", "concluded", "completed", "invalidated"].includes(statusLower));
  const canInvalidate =
    x.allowedActions?.canInvalidate ??
    (statusLower !== "invalidated" && ["completed", "concluded", "failed"].includes(statusLower));

  const handleCancel = async (memo?: string) => {
    const experimentId = experimentIdOf(x);
    const reason = memo || "Operator halted experiment";
    try {
      const envelope = await bffV1.research.cancel(experimentId, { reason });
      const receipt = envelope.data.receipt ?? {};
      const fence = (receipt.cancellation_fence || receipt.cancellationFence || new Date().toISOString()) as string;
      toast.success("Experiment canceled");
      setX((prev) =>
        prev
          ? {
              ...prev,
              status: "canceled",
              cancellation_fence: fence,
              cancellationFence: fence,
              allowedActions: {
                ...prev.allowedActions,
                canCancel: false,
                canRetry: true,
                canArchive: true,
                canInvalidate: false,
              },
            }
          : prev,
      );
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof BffError ? err.message : "Action failed");
    }
  };

  const handleRetry = async () => {
    const experimentId = experimentIdOf(x);
    try {
      const envelope = await bffV1.research.retry(experimentId);
      const receipt = envelope.data.receipt ?? {};
      const newExpId = (receipt.new_experiment_id || receipt.newExperimentId) as string | undefined;
      if (newExpId) {
        toast.success(`Created attempt #${(x.attempt_number ?? x.attemptNumber ?? 1) + 1}: ${newExpId}`);
        navigate(`/management/experiments/${newExpId}`);
      } else {
        toast.success("New experiment attempt created");
      }
    } catch (err) {
      toast.error(err instanceof BffError ? err.message : "Action failed");
    }
  };

  const handleArchive = async () => {
    const experimentId = experimentIdOf(x);
    const result = await runActionSafe(
      { kind: "Research", id: experimentId, action: "archive" },
      { successTitle: "Experiment archived" },
    );
    if (result.ok) {
      const now = new Date().toISOString();
      setX((prev) =>
        prev
          ? {
              ...prev,
              is_archived: true,
              isArchived: true,
              archived_at: now,
              archivedAt: now,
              status: "archived",
              allowedActions: {
                ...prev.allowedActions,
                canCancel: false,
                canRetry: true,
                canArchive: false,
                canInvalidate: false,
              },
            }
          : prev,
      );
    }
  };

  const handleInvalidate = async (memo?: string) => {
    const experimentId = experimentIdOf(x);
    const reason = memo?.trim() || "Operator invalidated result";
    const result = await runActionSafe(
      { kind: "Research", id: experimentId, action: "invalidate", reason, memo: reason, params: { reason } },
      { successTitle: "Experiment invalidated" },
    );
    if (result.ok) {
      setX((prev) =>
        prev
          ? {
              ...prev,
              status: "invalidated",
              invalidated_reason: reason,
              invalidatedReason: reason,
              allowedActions: {
                ...prev.allowedActions,
                canCancel: false,
                canRetry: true,
                canArchive: true,
                canInvalidate: false,
              },
            }
          : prev,
      );
      setInvalidateOpen(false);
    }
  };

  const handlePromote = async (memo?: string) => {
    const experimentId = experimentIdOf(x);
    await runActionSafe(
      { kind: "Research", id: experimentId, action: "promote", memo },
      { successTitle: "Promotion request submitted" },
    );
    setPromoteOpen(false);
  };

  return (
    <>
      <ObjectDetailLayout
        object={x}
        subtitle={x.id}
        actions={
          <>
            {canCancel && (
              <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4 mr-1" />
                {t("common.cancel")}
              </Button>
            )}
            {canRetry && (
              <Button size="sm" variant="outline" onClick={handleRetry}>
                <RotateCcw className="h-4 w-4 mr-1" />
                {t("research.rerun")}
              </Button>
            )}
            {canArchive && (
              <Button size="sm" variant="outline" onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            )}
            {canInvalidate && (
              <Button size="sm" variant="outline" onClick={() => setInvalidateOpen(true)}>
                <AlertTriangle className="h-4 w-4 mr-1" />
                Invalidate
              </Button>
            )}
            <Button size="sm" onClick={() => setPromoteOpen(true)}>
              <Package className="h-4 w-4 mr-1" />
              Promote to Strategy
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("table.status")} value={(x.status ?? "").toUpperCase()} />
                  <StatCard label="Attempt" value={`#${x.attempt_number ?? x.attemptNumber ?? 1}`} />
                  <StatCard label={x.metric} value={(x.metricValue ?? 0).toFixed(3)} tone="success" />
                  <StatCard label={t("table.owner")} value={x.owner} />
                </div>
                <Section title={t("detail.section.hypothesis")}>
                  <p className="text-sm leading-relaxed">{x.hypothesis}</p>
                </Section>
                {(x.cancellation_fence || x.cancellationFence || x.parent_experiment_id || x.parentExperimentId || x.is_archived || x.isArchived || x.invalidated_reason || x.invalidatedReason) && (
                  <Section title="Experiment Lineage & Governance State">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {(x.parent_experiment_id || x.parentExperimentId) && (
                        <Field
                          label="Parent attempt"
                          value={x.parent_experiment_id ?? x.parentExperimentId ?? "nan"}
                          mono
                        />
                      )}
                      {(x.root_experiment_id || x.rootExperimentId) && (
                        <Field
                          label="Root attempt"
                          value={x.root_experiment_id ?? x.rootExperimentId ?? "nan"}
                          mono
                        />
                      )}
                      {(x.cancellation_fence || x.cancellationFence) && (
                        <Field
                          label="Cancellation fence"
                          value={x.cancellation_fence ?? x.cancellationFence ?? "nan"}
                          mono
                        />
                      )}
                      {(x.is_archived || x.isArchived) && (
                        <Field
                          label="Archived at"
                          value={x.archived_at ?? x.archivedAt ?? "yes"}
                          mono
                        />
                      )}
                      {(x.invalidated_reason || x.invalidatedReason) && (
                        <Field
                          label="Invalidated reason"
                          value={x.invalidated_reason ?? x.invalidatedReason ?? "nan"}
                          mono
                        />
                      )}
                    </div>
                  </Section>
                )}
                <Section title="Management research context">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Field label="Persona" value={researchContext.persona?.personaName ?? researchContext.persona?.personaId ?? "nan"} mono />
                    <Field label="Persona ID" value={researchContext.persona?.personaId ?? "nan"} mono />
                    <Field label="Project" value={researchContext.project?.projectId ?? "nan"} mono />
                    <Field label="Frameworks" value={frameworks.length ? frameworks.join(" / ") : "nan"} mono />
                    <Field label="Dataset" value={researchContext.datasetRef ?? x.datasetRef ?? x.dataset_ref ?? "nan"} mono />
                    <Field label="Registry admission" value={researchContext.registryAdmissionStatus ?? x.registryAdmissionStatus ?? x.registry_admission_status ?? "nan"} mono />
                    <Field label="Blocked by" value={researchContext.blockedByTaskIds.length ? researchContext.blockedByTaskIds.join(" / ") : "nan"} mono />
                    <Field label="Deployment stage" value={x.deploymentStage ?? x.deployment_stage ?? "nan"} mono />
                  </div>
                </Section>
              </>
            ),
          },
          {
            value: "metrics", label: t("table.metric"),
            content: (
              <DataTable rows={folds} columns={[
                { key: "fold", header: "Fold", cell: (r) => <span className="text-mono text-xs">#{r.fold}</span> },
                { key: "metric", header: x.metric, cell: (r) => <span className="text-mono text-xs">{(r.metric ?? 0).toFixed(3)}</span> },
                { key: "samples", header: "Samples", cell: (r) => <span className="text-mono text-xs">{(r.samples ?? 0).toLocaleString()}</span> },
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
            ) : <Section><div className="text-sm text-muted-foreground text-center py-6">{t("common.noArtifactsYet")}</div></Section>,
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
        description={t("detail.confirm.promoteResearch")}
        confirmToken="PROMOTE"
        destructive
        onConfirm={handlePromote}
      />

      <HighRiskConfirm
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel Experiment — ${x.name}`}
        description="Are you sure you want to cancel this experiment run? A cancellation fence will be placed to reject any late completion."
        confirmToken="CANCEL"
        destructive
        onConfirm={handleCancel}
      />

      <HighRiskConfirm
        open={invalidateOpen}
        onOpenChange={setInvalidateOpen}
        title={`Invalidate Experiment — ${x.name}`}
        description="Provide a reason to invalidate this experiment result."
        confirmToken="INVALIDATE"
        destructive
        onConfirm={handleInvalidate}
      />
    </>
  );
};
