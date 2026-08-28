import * as seed from "@/mocks/seed";
import type { ResearchExperiment } from "./dto";
import { paths } from "./paths";
import { detailPath, liveDetailOrSeedNormalized, liveListOrSeedNormalized } from "./domainReads";

export async function listResearchExperiments(): Promise<ResearchExperiment[]> {
  return liveListOrSeedNormalized("research.list", paths.researchExperiments(), seed.researchExperiments);
}

export async function getResearchExperiment(id: string): Promise<ResearchExperiment | undefined> {
  return liveDetailOrSeedNormalized("research.get", detailPath(paths.researchExperiments(), id), seed.researchExperiments.find((s) => s.id === id));
}

export const research = {
  list: listResearchExperiments,
  get: getResearchExperiment,
};
