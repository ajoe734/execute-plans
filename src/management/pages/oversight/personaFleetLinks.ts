import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function firstResearchProject(r: ManagementPersonaFleetRow) {
  return r.currentResearchProjects?.[0];
}

export function personaFleetPersonaHref(r: ManagementPersonaFleetRow): string {
  return `/management/personas/${encoded(r.personaId)}`;
}

export function personaFleetResearchHref(r: ManagementPersonaFleetRow): string | null {
  const project = firstResearchProject(r);
  const experimentId = project?.experimentId || r.researchStatus?.experimentId;
  if (experimentId) return `/management/experiments/${encoded(experimentId)}`;
  if (project?.projectId) {
    return `/management/loops/research?persona=${encoded(r.personaId)}&project=${encoded(project.projectId)}`;
  }
  return null;
}

export function personaFleetArtifactHref(r: ManagementPersonaFleetRow): string | null {
  const project = firstResearchProject(r);
  const artifactId = project?.artifactId || r.researchStatus?.artifactId;
  return artifactId ? `/management/artifacts/${encoded(artifactId)}` : null;
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
