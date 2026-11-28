import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { bffV1, mgmt, runActionSafe, BffError } from "@/lib/bff-v1";
import { DiscoverySections } from "@/management/components/discovery/DiscoveryPanels";
import { isNotFoundError, useLiveDetail } from "@/lib/bff-v1/useLiveDetail";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";
import type { AuditEvent, ResearchTask, ResearchTaskRun } from "@/lib/bff-v1";
import type { ManagementPersonaFleetRow, ManagementResearchProject } from "@/lib/bff-v1/management";
import { Package, Ban, RotateCcw, Archive, AlertTriangle, Inbox } from "lucide-react";
import { toast } from "sonner";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { statusLabel } from "@/lib/enumLabels";
import { collectorCheckStatus, isCollectorQueryPlan, isNonRealRun, researchTitle } from "./researchPresentation";
import { AuditTimeline } from "@/platform/components/AuditTimeline";

type ResearchExperimentLive = ResearchTask & {
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
  return x.taskId ?? x.task_id ?? x.experimentId ?? x.experiment_id ?? x.id;
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

/** Empty-ish values (null, blank, "nan", "None") are treated as absent so the page never prints them. */
function present(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : undefined;
  const text = String(v).trim();
  if (!text || /^(nan|none|null|undefined)$/i.test(text)) return undefined;
  return text;
}

function savedOutputReferences(run: ResearchTaskRun): string[] {
  const refs = run.artifactRefs ?? run.artifact_refs ?? [];
  const candidate = run.metadata?.candidate_id;
  if (run.metadata?.policy_learning_handoff !== true || typeof candidate !== "string") return refs;
  // Candidate intake records a lineage reference but only saves the task and run.
  return refs.filter((id) => id !== `artifact-${candidate}`);
}

function ResearchOutputFiles({ ids }: { ids: string[] }) {
  const t = useT();
  const { data, loading, isError } = useLiveDetail(
    async () => ({ checks: await Promise.allSettled(ids.map((id) => bffV1.artifacts.get(id))) }),
    ids,
    { auto: false },
  );
  const checks = data?.checks;
  const links = ids.filter((_, index) => {
    const result = checks?.[index];
    return result?.status === "fulfilled" && Boolean(result.value?.id);
  });
  const readingFailed = isError || checks?.some((result) => result.status === "rejected" && !isNotFoundError(result.reason));
  const missing = ids.length === 0 || checks?.some((result) => result.status === "fulfilled" ? !result.value?.id : isNotFoundError(result.reason));
  const someUnavailable = readingFailed || (missing && links.length > 0);
  return (
    <div className="space-y-2">
      {ids.length > 0 && loading && <p role="status" className="text-sm text-muted-foreground">{t("research.detail.checkingOutputs")}</p>}
      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((id, index) => (
            <li key={id}>
              <Link className="text-sm text-primary underline" to={"/management/artifacts/" + encodeURIComponent(id)}>
                {t("research.detail.viewOutput", { number: index + 1 })}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {missing && !someUnavailable && <p className="text-sm text-muted-foreground">{t("research.detail.noResults")}</p>}
      {someUnavailable && <p role="status" className="text-sm text-muted-foreground">{t("research.detail.outputsUnavailable")}</p>}
    </div>
  );
}

function recordedEvaluation(run?: ResearchTaskRun) {
  const summary = run?.metadata?.evaluation_summary;
  const metrics = run?.metadata?.metrics;
  const entries = ["action_match_rate", "return_gap", "kl_divergence"].flatMap((key) => {
    const from = (record: unknown) => record && typeof record === "object" ? (record as Record<string, unknown>)[key] : undefined;
    const reported = [from(summary), from(metrics)].find((value): value is number => typeof value === "number" && Number.isFinite(value));
    return reported === undefined ? [] : [{ key, value: reported }];
  });
  return entries;
}

export const ResearchDetail = () => {
  const { id } = useParams();
  const t = useT();
  const unbound = t("research.detail.unbound");
  const notReported = t("research.detail.notReported");
  const navigate = useNavigate();
  const { data: x, setData: setX, loading, isError, error } = useLiveDetail<ResearchExperimentLive>(
    id,
    (entityId) => bffV1.research.get(entityId) as Promise<ResearchExperimentLive | undefined>,
    { kinds: ["research"] },
  );
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [fleetRows, setFleetRows] = useState<ManagementPersonaFleetRow[]>([]);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [invalidateOpen, setInvalidateOpen] = useState(false);

  const isResearch = Boolean(x && !isCollectorQueryPlan(x));
  useEffect(() => {
    if (!id || !isResearch) return;
    bffV1.audit.list().then((a) => setAudit(a.filter((e) => e.target === id || e.action?.startsWith("research.")))).catch(() => {});
    mgmt.personaFleet.get().then(setFleetRows).catch(() => setFleetRows([]));
  }, [id, isResearch]);

  if (loading) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  if (!x) {
    return (
      <>
        <PageHeader title={t("nav.experiments", { defaultValue: "Experiments" })} />
        <PageBody>
          <EmptyState
            icon={isError ? <AlertTriangle className="h-8 w-8 text-status-failed" /> : <Inbox className="h-8 w-8 text-muted-foreground" />}
            title={
              isError
                ? t("detail.loadState.errorTitle", { entity: "Experiment", defaultValue: "Could Not Load Experiment" })
                : t("detail.loadState.notFoundTitle", { entity: "Experiment", defaultValue: "Experiment Not Found" })
            }
            description={
              isError
                ? t("detail.loadState.errorDescription", {
                  entity: "Experiment",
                  id: id ?? "",
                  error: error ?? "unknown error",
                  defaultValue: `Failed to load Experiment detail for ID ${id ?? ""}: ${error ?? "unknown error"}`,
                })
                : t("detail.loadState.notFoundDescription", {
                  entity: "Experiment",
                  id: id ?? "",
                  defaultValue: `Experiment detail for ID ${id ?? ""} is not available in the live contract.`,
                })
            }
            cta={{ label: t("actions.back", { defaultValue: "Back to Experiments" }), onClick: () => navigate("/management/experiments") }}
          />
        </PageBody>
      </>
    );
  }
  const title = researchTitle(x, t);
  if (isCollectorQueryPlan(x)) {
    const changes = Object.entries(x.query_plan?.changes ?? {});
    return (
      <>
        <PageHeader title={title} />
        <PageBody>
          <Link className="mb-4 inline-block text-sm text-primary underline" to="/management/experiments?view=collector_checks">
            {t("research.collector.title")}
          </Link>
          <Section title={collectorCheckStatus(x, t)}>
            {x.status === "proposed" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("research.collector.reviewRequired")}</p>
                {changes.length === 0 && <p className="text-sm">{t("research.collector.detailsUnavailable")}</p>}
                {changes.map(([source, terms]) => (
                  <div key={source} className="space-y-2">
                    <h3 className="text-sm font-medium">{t("research.collector.sources." + source, { defaultValue: source })}</h3>
                    <Field label={t("research.collector.before")} value={terms.before.join(", ")} />
                    <Field label={t("research.collector.after")} value={terms.after.join(", ")} />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </PageBody>
      </>
    );
  }

  const researchContext = researchContextFor(x, fleetRows);
  const frameworks = researchContext.frameworks.length
    ? researchContext.frameworks
    : uniq([x.framework, ...(x.frameworks ?? [])]);
  const lastRun = x.runs?.at(-1);
  const outputIds = uniq([x.artifactId, ...(x.runs ?? []).flatMap(savedOutputReferences)]);
  const evaluation = recordedEvaluation(lastRun);
  const recordedParameters = Object.entries({
    symbol: present(lastRun?.parameters?.symbol),
    sample_window: present(lastRun?.parameters?.sample_window),
    folds: present(lastRun?.parameters?.folds),
    seed: present(lastRun?.parameters?.seed),
  }).filter((entry): entry is [string, string] => Boolean(entry[1]));

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
        object={{ ...x, name: title }}
        headerOmit={{ risk: true, state: true }}
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
                  <StatCard label={t("research.table.latestRun")}
                    value={lastRun ? statusLabel(lastRun.status, t) : t("research.noRunsYet")} />
                  <StatCard
                    label={t("research.table.runCount")}
                    value={String(x.runCount ?? x.run_count ?? (x.runs ? x.runs.length : 0))}
                  />
                  <StatCard
                    label={t("research.table.createdBy")}
                    value={x.createdBy || x.created_by || x.owner || "—"}
                  />
                  <StatCard
                    label={t("research.detail.taskType")}
                    value={t("research.taskTypes." + (x.taskType ?? x.task_type ?? ""), { defaultValue: notReported })}
                  />
                </div>
                {(x.objective || x.hypothesis) && (
                  <Section title={t("research.detail.objective")}>
                    <p className="text-sm leading-relaxed">{x.objective || x.hypothesis}</p>
                  </Section>
                )}
                <Section title={t("research.detail.results")}>
                  {evaluation.length > 0 && (
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {evaluation.map(({ key, value }) => (
                        <Field key={key} label={t("research.detail.evaluation." + key)} value={new Intl.NumberFormat(undefined, {
                          style: key === "action_match_rate" ? "percent" : "decimal",
                          maximumFractionDigits: key === "action_match_rate" ? 2 : 4,
                        }).format(value)} />
                      ))}
                    </div>
                  )}
                  <ResearchOutputFiles key={JSON.stringify([x.id, outputIds])} ids={outputIds} />
                </Section>
                {recordedParameters.length > 0 && (
                  <Section title={t("research.detail.recordedParameters")}>
                    <div className="grid grid-cols-2 gap-3">
                      {recordedParameters.map(([key, value]) => (
                        <Field key={key} label={t("research.detail.parameters." + key)} value={value} />
                      ))}
                    </div>
                  </Section>
                )}
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer">{t("research.detail.technicalDetails")}</summary>
                  <span className="break-all font-mono">{x.taskId ?? x.id}</span>
                </details>
                <DiscoverySections record={x} testId="research-discovery" />
                <Section title={t("research.detail.runsTitle")}>
                  {Array.isArray(x.runs) && x.runs.length > 0 ? (
                    <div className="space-y-3" data-testid="research-task-runs">
                      {x.runs.map((run) => {
                        const runId = run.runId ?? run.run_id;
                        const adapter = run.adapter ?? "";
                        const dispatchMode = run.dispatchMode ?? run.dispatch_mode ?? "";
                        const requestedMode = run.requestedMode ?? run.requested_mode ?? "";
                        const createdBy = run.createdBy ?? run.created_by ?? "";
                        const createdAt = run.createdAt ?? run.created_at ?? "";
                        const nonReal = isNonRealRun(adapter, dispatchMode);
                        return (
                          <div
                            key={runId}
                            data-testid={`research-task-run-${runId}`}
                            className="rounded-md border p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge variant="outline">{statusLabel(run.status, t)}</Badge>
                              {nonReal && (
                                <Badge
                                  variant="outline"
                                  className="border-status-warning/40 bg-status-warning/10 text-status-warning text-xs"
                                >
                                  {t("research.detail.nonRealExecution")} ({adapter || "—"} / {dispatchMode || "—"})
                                </Badge>
                              )}
                            </div>
                            <details className="text-xs text-muted-foreground">
                              <summary className="cursor-pointer">{t("research.detail.technicalDetails")}</summary>
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                <Field label={t("research.detail.runId")} value={runId} mono />
                                <Field label={t("research.detail.adapter")} value={present(adapter) ?? notReported} mono />
                                <Field label={t("research.detail.dispatchMode")} value={present(dispatchMode) ?? notReported} mono />
                                <Field label={t("research.detail.requestedMode")} value={present(requestedMode) ?? notReported} mono />
                                <Field label={t("research.detail.createdBy")} value={present(createdBy) ?? notReported} mono />
                                <Field label={t("research.detail.createdAt")} value={createdAt ? safeDateTime(createdAt) : notReported} mono />
                              </div>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-2">
                      {t("research.detail.noRuns")}
                    </div>
                  )}
                </Section>
                {(x.cancellation_fence || x.cancellationFence || x.parent_experiment_id || x.parentExperimentId || x.is_archived || x.isArchived || x.invalidated_reason || x.invalidatedReason) && (
                  <Section title="Experiment Lineage & Governance State">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {(x.parent_experiment_id || x.parentExperimentId) && (
                        <Field
                          label="Parent attempt"
                          value={present(x.parent_experiment_id ?? x.parentExperimentId) ?? notReported}
                          mono
                        />
                      )}
                      {(x.root_experiment_id || x.rootExperimentId) && (
                        <Field
                          label="Root attempt"
                          value={present(x.root_experiment_id ?? x.rootExperimentId) ?? notReported}
                          mono
                        />
                      )}
                      {(x.cancellation_fence || x.cancellationFence) && (
                        <Field
                          label="Cancellation fence"
                          value={present(x.cancellation_fence ?? x.cancellationFence) ?? notReported}
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
                          value={present(x.invalidated_reason ?? x.invalidatedReason) ?? notReported}
                          mono
                        />
                      )}
                    </div>
                  </Section>
                )}
                <Section title="Management research context">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Field label="Persona" value={present(researchContext.persona?.personaName ?? researchContext.persona?.personaId) ?? unbound} mono />
                    <Field label="Persona ID" value={present(researchContext.persona?.personaId) ?? unbound} mono />
                    <Field label="Project" value={present(researchContext.project?.projectId) ?? unbound} mono />
                    <Field label="Frameworks" value={frameworks.length ? frameworks.join(" / ") : unbound} mono />
                    <Field label="Dataset" value={present(researchContext.datasetRef ?? x.datasetRef ?? x.dataset_ref) ?? unbound} mono />
                    <Field label="Registry admission" value={present(researchContext.registryAdmissionStatus ?? x.registryAdmissionStatus ?? x.registry_admission_status) ?? notReported} mono />
                    <Field label="Blocked by" value={researchContext.blockedByTaskIds.length ? researchContext.blockedByTaskIds.join(" / ") : unbound} mono />
                    <Field label="Deployment stage" value={present(x.deploymentStage ?? x.deployment_stage) ?? notReported} mono />
                  </div>
                </Section>
              </>
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
