import type {
  ManagementPersonaFleetRow,
  ManagementResearchProject,
  ManagementResearchStatus,
} from "@/lib/bff-v1/management";

function encoded(value: string): string {
  return encodeURIComponent(value);
}

type RawResearchStatus = ManagementResearchStatus & {
  experiment_id?: string;
  strategy_id?: string;
  strategy_spec_id?: string;
  artifact_id?: string;
  artifact_state?: string;
  deployment_stage?: string;
  dataset_ref?: string;
  registry_admission_status?: string;
  pending_task_ids?: string[];
  can_deploy?: boolean;
};

type RawResearchProject = ManagementResearchProject & {
  project_id?: string;
  dataset_ref?: string;
  artifact_id?: string;
  experiment_id?: string;
  blocked_by_task_ids?: string[];
  can_deploy?: boolean;
};

type RawPersonaFleetRow = ManagementPersonaFleetRow & {
  current_work?: string;
  research_status?: RawResearchStatus;
  current_research_projects?: RawResearchProject[];
};

export type PersonaFleetResearchItem = {
  key: string;
  title: string;
  stage?: string;
  status?: string;
  frameworks: string[];
  projectId?: string;
  experimentId?: string;
  artifactId?: string;
  datasetRef?: string;
  canDeploy?: boolean;
};

function currentWork(r: ManagementPersonaFleetRow): string | undefined {
  return r.currentWork ?? (r as RawPersonaFleetRow).current_work;
}

function researchStatus(r: ManagementPersonaFleetRow): RawResearchStatus | undefined {
  return r.researchStatus ?? (r as RawPersonaFleetRow).research_status;
}

function currentResearchProjects(r: ManagementPersonaFleetRow): RawResearchProject[] {
  return r.currentResearchProjects ?? (r as RawPersonaFleetRow).current_research_projects ?? [];
}

function firstResearchProject(r: ManagementPersonaFleetRow): RawResearchProject | undefined {
  return currentResearchProjects(r)[0];
}

function projectId(project?: RawResearchProject): string | undefined {
  return project?.projectId ?? project?.project_id;
}

function experimentId(status?: RawResearchStatus, project?: RawResearchProject): string | undefined {
  return project?.experimentId ?? project?.experiment_id ?? status?.experimentId ?? status?.experiment_id;
}

function artifactId(status?: RawResearchStatus, project?: RawResearchProject): string | undefined {
  return project?.artifactId ?? project?.artifact_id ?? status?.artifactId ?? status?.artifact_id;
}

function datasetRef(status?: RawResearchStatus, project?: RawResearchProject): string | undefined {
  return project?.datasetRef ?? project?.dataset_ref ?? status?.datasetRef ?? status?.dataset_ref;
}

function canDeploy(status?: RawResearchStatus, project?: RawResearchProject): boolean | undefined {
  return project?.canDeploy ?? project?.can_deploy ?? status?.canDeploy ?? status?.can_deploy;
}

function frameworks(status?: RawResearchStatus, project?: RawResearchProject): string[] {
  if (project?.frameworks?.length) return project.frameworks;
  if (status?.frameworks?.length) return status.frameworks;
  return status?.framework ? [status.framework] : [];
}

export function personaFleetResearchItems(r: ManagementPersonaFleetRow): PersonaFleetResearchItem[] {
  const status = researchStatus(r);
  const projects = currentResearchProjects(r);
  if (projects.length > 0) {
    return projects.map((project, index) => {
      const id = projectId(project);
      const expId = experimentId(status, project);
      const artId = artifactId(status, project);
      return {
        key: id ?? expId ?? artId ?? `${r.personaId}-research-${index}`,
        title: project.title || currentWork(r) || status?.summary || "nan",
        stage: project.stage ?? status?.stage,
        status: project.status,
        frameworks: frameworks(status, project),
        projectId: id,
        experimentId: expId,
        artifactId: artId,
        datasetRef: datasetRef(status, project),
        canDeploy: canDeploy(status, project),
      };
    });
  }

  const expId = experimentId(status);
  const artId = artifactId(status);
  const title = currentWork(r) || status?.summary;
  if (!title && !status?.stage && !expId && !artId && frameworks(status).length === 0) return [];
  return [{
    key: expId ?? artId ?? `${r.personaId}-research-status`,
    title: title ?? "nan",
    stage: status?.stage,
    frameworks: frameworks(status),
    experimentId: expId,
    artifactId: artId,
    datasetRef: datasetRef(status),
    canDeploy: canDeploy(status),
  }];
}

export function personaFleetPersonaHref(r: ManagementPersonaFleetRow): string {
  return `/management/personas/${encoded(r.personaId)}`;
}

export function personaFleetResearchHref(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): string {
  const project = firstResearchProject(r);
  const expId = item?.experimentId ?? experimentId(researchStatus(r), project);
  if (expId) return `/management/experiments/${encoded(expId)}`;
  const id = item?.projectId ?? projectId(project);
  if (id) {
    return `/management/loops/research?persona=${encoded(r.personaId)}&project=${encoded(id)}`;
  }
  return `/management/loops/research?persona=${encoded(r.personaId)}`;
}

export function personaFleetArtifactHref(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): string | null {
  const id = item?.artifactId ?? artifactId(researchStatus(r), firstResearchProject(r));
  return id ? `/management/artifacts/${encoded(id)}` : null;
}

export function personaFleetDataSourcesHref(r: ManagementPersonaFleetRow): string {
  return `/management/data-sources?persona=${encoded(r.personaId)}`;
}

export function personaFleetPerformanceHref(r: ManagementPersonaFleetRow): string {
  return `/management/performance-attribution?dimension=persona&persona=${encoded(r.personaId)}`;
}

export function personaFleetMutationHref(r: ManagementPersonaFleetRow): string {
  return `/management/evolution-journal?persona=${encoded(r.personaId)}`;
}

export function personaFleetHumanGateHref(r: ManagementPersonaFleetRow): string {
  return `/management/human-inbox?persona=${encoded(r.personaId)}`;
}

export function personaFleetOnboardingHref(r: ManagementPersonaFleetRow): string {
  return `/management/personas/${encoded(r.personaId)}/onboarding`;
}

export function personaFleetRuntimeHref(r: ManagementPersonaFleetRow): string {
  return `/management/runtimes?persona=${encoded(r.personaId)}`;
}

export function personaFleetOodaHref(
  r: ManagementPersonaFleetRow,
  item?: PersonaFleetResearchItem,
): string {
  switch (String(r.ooda ?? "").toLowerCase()) {
    case "observe":
      return personaFleetDataSourcesHref(r);
    case "orient":
      return personaFleetResearchHref(r, item);
    case "decide":
      return personaFleetHumanGateHref(r);
    case "act":
      return personaFleetRuntimeHref(r);
    case "learn":
      return personaFleetMutationHref(r);
    default:
      return personaFleetPersonaHref(r);
  }
}
