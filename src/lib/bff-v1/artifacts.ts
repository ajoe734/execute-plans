import type { Artifact } from "./dto";
import { paths } from "./paths";
import { strictLiveDetailArtifact, strictLiveListArtifact } from "./domainReads";

export async function listArtifacts(): Promise<Artifact[]> {
  return strictLiveListArtifact("artifacts.list", paths.artifacts());
}

export async function getArtifact(id: string): Promise<Artifact | undefined> {
  return strictLiveDetailArtifact("artifacts.get", paths.artifact(id));
}

export const artifacts = {
  list: listArtifacts,
  get: getArtifact,
};
