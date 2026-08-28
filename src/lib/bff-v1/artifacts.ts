import * as seed from "@/mocks/seed";
import type { Artifact } from "./dto";
import { paths } from "./paths";
import { liveDetailOrSeedArtifact, liveListOrSeedArtifact } from "./domainReads";

export async function listArtifacts(): Promise<Artifact[]> {
  return liveListOrSeedArtifact("artifacts.list", paths.artifacts(), seed.artifacts);
}

export async function getArtifact(id: string): Promise<Artifact | undefined> {
  return liveDetailOrSeedArtifact("artifacts.get", paths.artifact(id), seed.artifacts.find((s) => s.id === id));
}

export const artifacts = {
  list: listArtifacts,
  get: getArtifact,
};
