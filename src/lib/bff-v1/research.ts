import type {
  ResearchExperiment,
  ResearchTask,
  ResearchTaskLatestRun,
  ResearchTaskRun,
} from "./dto";
import { paths } from "./paths";
import {
  asRecord,
  liveDetailFrom,
  liveItemsFrom,
  normalizeBaseObjectFields,
  recordString,
  strictLiveDetail,
  strictLiveList,
} from "./domainReads";
import {
  cancelResearchExperiment,
  retryResearchExperiment,
  archiveResearchExperiment,
  invalidateResearchExperiment,
  promoteResearchExperiment,
} from "./writes";

export function normalizeResearchTask(raw: unknown): ResearchTask | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const base = normalizeBaseObjectFields(record) ?? record;
  const taskId = recordString(record, "task_id", "taskId", "id", "experiment_id", "experimentId") ?? "";
  const id = recordString(record, "id", "task_id", "taskId", "experiment_id", "experimentId") ?? taskId;
  if (!id) return undefined;
  const title = recordString(record, "title") ?? null;
  const objective = recordString(record, "objective", "hypothesis") ?? null;
  const name = recordString(record, "name", "title", "objective", "experiment_name", "experimentName") ?? id;
  const status = recordString(record, "status", "state") ?? "unknown";
  const taskType = recordString(record, "task_type", "taskType") ?? null;
  const createdBy = recordString(record, "created_by", "createdBy") ?? "";
  const createdAt = recordString(record, "created_at", "createdAt") ?? "";
  const updatedAt = recordString(record, "updated_at", "updatedAt", "created_at", "createdAt") ?? "";
  const rawSourceRefs = Array.isArray(record.source_refs)
    ? record.source_refs
    : Array.isArray(record.sourceRefs)
      ? record.sourceRefs
      : [];
  const sourceRefs = rawSourceRefs
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  const rawRuns = Array.isArray(record.runs) ? record.runs : undefined;
  const runs: ResearchTaskRun[] | undefined = rawRuns?.map((rawRun, idx) => {
    const runRec = asRecord(rawRun) ?? {};
    const runId = recordString(runRec, "run_id", "runId", "id") ?? `${id}-run-${idx + 1}`;
    const adapter = recordString(runRec, "adapter") ?? "unknown";
    const dispatchMode = recordString(runRec, "dispatch_mode", "dispatchMode") ?? "unknown";
    const requestedMode = recordString(runRec, "requested_mode", "requestedMode");
    const runStatus = recordString(runRec, "status", "state") ?? "unknown";
    const runCreatedBy = recordString(runRec, "created_by", "createdBy");
    const runCreatedAt = recordString(runRec, "created_at", "createdAt");
    return {
      ...(runRec as Partial<ResearchTaskRun>),
      id: recordString(runRec, "id", "run_id", "runId") ?? runId,
      runId,
      run_id: runId,
      taskId: recordString(runRec, "task_id", "taskId") ?? taskId,
      task_id: recordString(runRec, "task_id", "taskId") ?? taskId,
      adapter,
      dispatchMode,
      dispatch_mode: dispatchMode,
      requestedMode,
      requested_mode: requestedMode,
      status: runStatus,
      createdBy: runCreatedBy,
      created_by: runCreatedBy ?? null,
      createdAt: runCreatedAt,
      created_at: runCreatedAt ?? null,
    };
  });

  const rawLatestRun = asRecord(record.latest_run ?? record.latestRun);
  let latestRun: ResearchTaskLatestRun | null = null;
  if (rawLatestRun) {
    const runId = recordString(rawLatestRun, "run_id", "runId", "id") ?? "";
    const adapter = recordString(rawLatestRun, "adapter") ?? "unknown";
    const dispatchMode = recordString(rawLatestRun, "dispatch_mode", "dispatchMode") ?? "unknown";
    const requestedMode = recordString(rawLatestRun, "requested_mode", "requestedMode");
    const runStatus = recordString(rawLatestRun, "status", "state") ?? "unknown";
    const runCreatedAt = recordString(rawLatestRun, "created_at", "createdAt");
    latestRun = {
      runId,
      run_id: runId,
      adapter,
      dispatchMode,
      dispatch_mode: dispatchMode,
      status: runStatus,
      requestedMode,
      requested_mode: requestedMode,
      createdAt: runCreatedAt,
      created_at: runCreatedAt,
    };
  } else if (runs && runs.length > 0) {
    const last = runs[runs.length - 1];
    latestRun = {
      runId: last.runId,
      run_id: last.runId,
      adapter: last.adapter,
      dispatchMode: last.dispatchMode,
      dispatch_mode: last.dispatchMode,
      status: last.status,
      requestedMode: last.requestedMode,
      requested_mode: last.requestedMode,
      createdAt: last.createdAt,
      created_at: last.createdAt,
    };
  }

  const runCount =
    typeof record.run_count === "number" && Number.isFinite(record.run_count)
      ? record.run_count
      : typeof record.runCount === "number" && Number.isFinite(record.runCount)
        ? record.runCount
        : runs
          ? runs.length
          : latestRun
            ? 1
            : 0;

  return {
    ...(base as Partial<ResearchTask>),
    id,
    taskId,
    task_id: taskId,
    name,
    title,
    objective,
    hypothesis: objective ?? "",
    metric: recordString(record, "metric") ?? "",
    metricValue: typeof record.metricValue === "number" && Number.isFinite(record.metricValue) ? record.metricValue : 0,
    status,
    state: ((base as { state?: string }).state ?? status) as ResearchTask["state"],
    risk: ((base as { risk?: string }).risk ?? "low") as ResearchTask["risk"],
    owner: recordString(record, "owner") ?? "",
    taskType,
    task_type: taskType,
    createdBy,
    created_by: createdBy || null,
    createdAt,
    created_at: createdAt || null,
    updatedAt,
    updated_at: updatedAt || null,
    sourceRefs,
    source_refs: sourceRefs,
    runCount,
    run_count: runCount,
    latestRun,
    latest_run: latestRun,
    runs,
  };
}

export async function listResearchTasks(): Promise<ResearchTask[]> {
  return strictLiveList("research.list", paths.researchTasks(), (body) =>
    liveItemsFrom<unknown>(body)
      .map((item) => normalizeResearchTask(item))
      .filter((item): item is ResearchTask => Boolean(item)),
  );
}

export async function getResearchTask(id: string): Promise<ResearchTask | undefined> {
  return strictLiveDetail("research.get", paths.researchTask(id), (body) => {
    const detail = liveDetailFrom<unknown>(body);
    return normalizeResearchTask(detail);
  });
}

export async function listResearchExperiments(): Promise<ResearchExperiment[]> {
  return (await listResearchTasks()) as unknown as ResearchExperiment[];
}

export async function getResearchExperiment(id: string): Promise<ResearchExperiment | undefined> {
  return (await getResearchTask(id)) as unknown as ResearchExperiment | undefined;
}

export {
  cancelResearchExperiment,
  retryResearchExperiment,
  archiveResearchExperiment,
  invalidateResearchExperiment,
  promoteResearchExperiment,
};

export const research = {
  list: listResearchTasks,
  get: getResearchTask,
  cancel: cancelResearchExperiment,
  retry: retryResearchExperiment,
  archive: archiveResearchExperiment,
  invalidate: invalidateResearchExperiment,
  promote: promoteResearchExperiment,
};
