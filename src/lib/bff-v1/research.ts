import type { ResearchExperiment } from "./dto";
import { paths } from "./paths";
import { detailPath, strictLiveDetailNormalized, strictLiveListNormalized } from "./domainReads";

export async function listResearchExperiments(): Promise<ResearchExperiment[]> {
  return strictLiveListNormalized("research.list", paths.researchExperiments());
}

export async function getResearchExperiment(id: string): Promise<ResearchExperiment | undefined> {
  return strictLiveDetailNormalized("research.get", detailPath(paths.researchExperiments(), id));
}

export const research = {
  list: listResearchExperiments,
  get: getResearchExperiment,
};
