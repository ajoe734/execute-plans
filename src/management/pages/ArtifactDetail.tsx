import { useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { bffV1, runActionSafe } from "@/lib/bff-v1";
import { useLiveDetail } from "@/lib/bff-v1/useLiveDetail";
import { useT } from "@/platform/hooks";
import type { Artifact, AuditEvent, Deployment } from "@/lib/bff-v1";
import { AlertTriangle, Download, Inbox, Trash2 } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import { ArtifactDiffPanel } from "@/management/components/detail/ArtifactDiffPanel";
import { ArtifactRollbackPanel } from "@/management/components/detail/ArtifactRollbackPanel";

export const ArtifactDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const { data: a, loading, isError, error } = useLiveDetail<Artifact>(
    id,
    (entityId) => bffV1.artifacts.get(entityId),
    { kinds: ["artifacts"] },
  );
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [retireOpen, setRetireOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bffV1.deployments.list().then((all) => setDeployments(all.filter((d) => d.artifactId === id))).catch(() => {});
    bffV1.audit.list().then((au) => setAudit(au.filter((x) => x.target === id || x.action?.startsWith("artifact.")))).catch(() => {});
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  if (!a) {
    return (
      <>
        <PageHeader title={t("nav.artifacts", { defaultValue: "Artifacts" })} />
        <PageBody>
          <EmptyState
            icon={isError ? <AlertTriangle className="h-8 w-8 text-status-failed" /> : <Inbox className="h-8 w-8 text-muted-foreground" />}
            title={
              isError
                ? t("detail.loadState.errorTitle", { entity: "Artifact", defaultValue: "Could Not Load Artifact" })
                : t("detail.loadState.notFoundTitle", { entity: "Artifact", defaultValue: "Artifact Not Found" })
            }
            description={
              isError
                ? t("detail.loadState.errorDescription", {
                  entity: "Artifact",
                  id: id ?? "",
                  error: error ?? "unknown error",
                  defaultValue: `Failed to load Artifact detail for ID ${id ?? ""}: ${error ?? "unknown error"}`,
                })
                : t("detail.loadState.notFoundDescription", {
                  entity: "Artifact",
                  id: id ?? "",
                  defaultValue: `Artifact detail for ID ${id ?? ""} is not available in the live contract.`,
                })
            }
            cta={{ label: t("actions.back", { defaultValue: "Back to Artifacts" }), onClick: () => navigate("/management/artifacts") }}
          />
        </PageBody>
      </>
    );
  }

  const noData = t("common.noData");
  const sourceKind =
    typeof (a.source_kind ?? a.sourceKind) === "string"
      ? String(a.source_kind ?? a.sourceKind).trim()
      : "";
  const kindText = typeof a.kind === "string" ? a.kind.trim() : "";
  const versionText = typeof a.version === "string" ? a.version.trim() : "";
  const stateText = typeof a.state === "string" ? a.state.trim() : "";
  const riskText = typeof a.risk === "string" ? a.risk.trim() : "";
  const ownerText = typeof a.owner === "string" ? a.owner.trim() : "";
  const hashText = typeof a.hash === "string" ? a.hash.trim() : "";
  const formatText = typeof a.format === "string" ? a.format.trim() : "";
  const hasSize = typeof a.sizeMb === "number" && Number.isFinite(a.sizeMb);

  const kindLabel = kindText || noData;
  const versionLabel = versionText || noData;
  const stateLabel = stateText || noData;
  const riskLabel = riskText || noData;
  const ownerLabel = ownerText || noData;
  const hashLabel = hashText || noData;
  const sizeLabel = hasSize ? `${a.sizeMb.toLocaleString()} MB` : noData;
  const formatLabel = formatText || noData;

  const storageRefObj =
    a.storage_ref && typeof a.storage_ref === "object" && !Array.isArray(a.storage_ref)
      ? a.storage_ref
      : a.saved_output?.storage_ref &&
          typeof a.saved_output.storage_ref === "object" &&
          !Array.isArray(a.saved_output.storage_ref)
        ? a.saved_output.storage_ref
        : undefined;
  const storagePath =
    (typeof a.storage_ref === "string" && a.storage_ref.trim()) ||
    (typeof storageRefObj?.path === "string" && storageRefObj.path.trim()) ||
    (typeof storageRefObj?.uri === "string" && storageRefObj.uri.trim()) ||
    (typeof a.saved_output?.storage_ref === "string" && a.saved_output.storage_ref.trim()) ||
    "";
  const storageBackend =
    (typeof storageRefObj?.backend === "string" && storageRefObj.backend.trim()) || "";

  const canDownload = Boolean(
    a.allowedActions?.canDownload || a.availableActions?.includes("download"),
  );
  const canRetire = Boolean(
    a.allowedActions?.canRetire ||
      a.availableActions?.includes("retire") ||
      a.availableActions?.includes("archive"),
  );

  const subtitleParts = [
    sourceKind || null,
    kindLabel,
    versionText ? `v${versionText}` : null,
  ].filter(Boolean);

  const upstreamExperimentOrTaskId =
    (typeof a.sourceExperimentId === "string" && a.sourceExperimentId.trim()) ||
    (typeof a.research_linkage?.task_id === "string" && a.research_linkage.task_id.trim()) ||
    (typeof a.saved_output?.task_id === "string" && a.saved_output.task_id.trim()) ||
    "";

  return (
    <>
      <ObjectDetailLayout
        object={a}
        subtitle={subtitleParts.join(" · ")}
        actions={
          <>
            {canDownload ? (
              <Button size="sm" variant="outline">
                <Download className="h-4 w-4 mr-1" />
                {t("artifact.download")}
              </Button>
            ) : (
              <NonProductionActionButton size="sm" variant="outline" status="no executing owner">
                <Download className="h-4 w-4 mr-1" />
                {t("artifact.download")}
              </NonProductionActionButton>
            )}
            {canRetire ? (
              <Button size="sm" variant="destructive" onClick={() => setRetireOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" />
                {t("actions.retire")}
              </Button>
            ) : (
              <NonProductionActionButton size="sm" variant="destructive" status="no executing owner">
                <Trash2 className="h-4 w-4 mr-1" />
                {t("actions.retire")}
              </NonProductionActionButton>
            )}
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("artifact.sourceKind", { defaultValue: "Source" })} value={sourceKind || noData} />
                  <StatCard label={t("table.kind", { defaultValue: "Kind" })} value={kindLabel} />
                  <StatCard label={t("table.version")} value={versionLabel} />
                  <StatCard label={t("common.state")} value={stateLabel} />
                  <StatCard label={t("common.risk")} value={riskLabel} />
                  <StatCard label={t("detail.label.size", { defaultValue: "Size" })} value={sizeLabel} />
                  <StatCard label={t("detail.label.format", { defaultValue: "Format" })} value={formatLabel} />
                  <StatCard label={t("table.owner")} value={ownerLabel} />
                </div>
                <Section title={t("detail.section.hash")}>
                  <pre className="text-mono text-sm bg-muted p-3 rounded-md overflow-x-auto">{hashLabel}</pre>
                </Section>
                {(sourceKind === "registry" || a.registry_id || a.strategy_id) && (
                  <Section title={t("artifact.sources.registry", { defaultValue: "Registry bundle" })}>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <Field label={t("artifact.detail.registryId", { defaultValue: "Registry ID" })} value={a.registry_id || a.id} mono />
                      <Field label={t("artifact.detail.artifactId", { defaultValue: "Artifact ID" })} value={a.artifact_id || noData} mono />
                      <Field label={t("artifact.detail.strategyId", { defaultValue: "Strategy ID" })} value={a.strategy_id || noData} mono />
                      <Field label={t("artifact.detail.producerRunId", { defaultValue: "Producer run" })} value={a.producer_run_id || noData} mono />
                      <Field label={t("artifact.detail.approvalDecisionId", { defaultValue: "Approval decision" })} value={a.approval_decision_id || noData} mono />
                      <Field label={t("artifact.detail.storagePath", { defaultValue: "Storage path" })} value={storagePath || noData} mono />
                    </div>
                  </Section>
                )}
                {(sourceKind === "research_run_output" || a.saved_output || a.research_linkage) && (
                  <Section title={t("artifact.sources.research_run_output", { defaultValue: "Research output" })}>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <Field
                        label={t("artifact.detail.runId", { defaultValue: "Run ID" })}
                        value={a.research_linkage?.run_id || a.saved_output?.run_id || noData}
                        mono
                      />
                      <Field
                        label={t("artifact.detail.taskId", { defaultValue: "Task ID" })}
                        value={a.research_linkage?.task_id || a.saved_output?.task_id || noData}
                        mono
                      />
                      <Field
                        label={t("artifact.detail.stageId", { defaultValue: "Stage" })}
                        value={a.research_linkage?.stage_id || a.saved_output?.stage_type || noData}
                        mono
                      />
                      <Field
                        label={t("artifact.detail.receiptId", { defaultValue: "Receipt ID" })}
                        value={a.saved_output?.receipt_id || noData}
                        mono
                      />
                      <Field
                        label={t("artifact.detail.runStatus", { defaultValue: "Run status" })}
                        value={a.saved_output?.run_status || noData}
                        mono
                      />
                      <Field
                        label={t("artifact.detail.storagePath", { defaultValue: "Storage path" })}
                        value={storagePath || noData}
                        mono
                      />
                    </div>
                  </Section>
                )}
              </>
            ),
          },
          {
            value: "diff", label: t("artifact.tab.diff"),
            content: <ArtifactDiffPanel artifact={a} />,
          },
          {
            value: "lineage", label: t("section.lineage"),
            content: upstreamExperimentOrTaskId ? (
              <Section>
                <div
                  className="flex items-center justify-between p-3 rounded-md bg-muted hover:bg-muted/70 cursor-pointer"
                  onClick={() => navigate(`/management/research/${upstreamExperimentOrTaskId}`)}
                >
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">{t("artifact.sourceExperiment")}</div>
                    <div className="text-mono text-sm">{upstreamExperimentOrTaskId}</div>
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
                  <Field label={t("detail.label.format", { defaultValue: "Format" })} value={formatLabel} mono />
                  <Field label={t("detail.label.size", { defaultValue: "Size" })} value={sizeLabel} mono />
                  <Field label={t("artifact.sourceKind", { defaultValue: "Source" })} value={sourceKind || noData} mono />
                  <Field label={t("artifact.detail.storageBackend", { defaultValue: "Storage backend" })} value={storageBackend || noData} mono />
                  <Field label={t("artifact.detail.storagePath", { defaultValue: "Storage path" })} value={storagePath || noData} mono />
                  <Field
                    label={t("table.created")}
                    value={a.created_at || a.updatedAt ? safeDateTime(a.created_at || a.updatedAt, "date") : noData}
                    mono
                  />
                </div>
              </Section>
            ),
          },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      {canRetire && (
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
      )}
    </>
  );
};
