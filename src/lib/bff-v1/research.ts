import type { ResearchExperiment } from "./dto";
import { paths } from "./paths";
import { detailPath, strictLiveDetailNormalized, strictLiveListNormalized } from "./domainReads";
import {
  cancelResearchExperiment,
  retryResearchExperiment,
  archiveResearchExperiment,
  invalidateResearchExperiment,
  promoteResearchExperiment,
} from "./writes";

export async function listResearchExperiments(): Promise<ResearchExperiment[]> {
  return strictLiveListNormalized("research.list", paths.researchExperiments());
}

export async function getResearchExperiment(id: string): Promise<ResearchExperiment | undefined> {
  return strictLiveDetailNormalized("research.get", detailPath(paths.researchExperiments(), id));
}

export {
  cancelResearchExperiment,
  retryResearchExperiment,
  archiveResearchExperiment,
  invalidateResearchExperiment,
  promoteResearchExperiment,
};

export const research = {
  list: listResearchExperiments,
  get: getResearchExperiment,
  cancel: cancelResearchExperiment,
  retry: retryResearchExperiment,
  archive: archiveResearchExperiment,
  invalidate: invalidateResearchExperiment,
  promote: promoteResearchExperiment,
};
