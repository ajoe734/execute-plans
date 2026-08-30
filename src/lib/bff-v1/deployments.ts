import type { Deployment, DeploymentStage } from "./dto";
import { paths } from "./paths";
import {
  asRecord,
  firstArray,
  liveDetailFrom,
  strictLiveDetailNormalized,
  strictLiveListNormalized,
  strictLiveRead,
  type UnknownRecord,
} from "./domainReads";

export async function listDeployments(): Promise<Deployment[]> {
  return strictLiveListNormalized("deployments.list", paths.deployments());
}

export async function getDeployment(id: string): Promise<Deployment | undefined> {
  return strictLiveDetailNormalized("deployments.get", paths.deployment(id));
}

export async function getDeploymentStages(id: string): Promise<DeploymentStage[]> {
  return strictLiveRead(
    "deploymentStages.forDeployment",
    { method: "GET", path: paths.deployment(id) },
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

