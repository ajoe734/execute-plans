import * as seed from "@/mocks/seed";
import type { Deployment, DeploymentStage } from "./dto";
import { paths } from "./paths";
import {
  asRecord,
  firstArray,
  liveDerivedListOrSeed,
  liveDetailFrom,
  liveDetailOrSeedNormalized,
  liveListOrSeedNormalized,
  type UnknownRecord,
} from "./domainReads";

export async function listDeployments(): Promise<Deployment[]> {
  return liveListOrSeedNormalized("deployments.list", paths.deployments(), seed.deployments);
}

export async function getDeployment(id: string): Promise<Deployment | undefined> {
  return liveDetailOrSeedNormalized("deployments.get", paths.deployment(id), seed.deployments.find((s) => s.id === id));
}

export async function getDeploymentStages(id: string): Promise<DeploymentStage[]> {
  return liveDerivedListOrSeed(
    "deploymentStages.forDeployment",
    paths.deployment(id),
    seed.deploymentStages.filter((s) => s.deploymentId === id),
    (body) => {
      const detail = asRecord(liveDetailFrom<UnknownRecord>(body));
      return firstArray(
        detail?.stages,
        detail?.deploymentStages,
        detail?.deployment_stages,
        detail?.stage_history,
      );
    },
  );
}

export const deployments = {
  list: listDeployments,
  get: getDeployment,
};

export const deploymentStages = {
  forDeployment: getDeploymentStages,
};
