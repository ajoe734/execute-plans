import type {
  AllocationSimulation,
  MetricFreeze,
  Rebalance,
  RebalanceOverride,
  WorkflowStep,
} from "./dto";
import { paths } from "./paths";
import {
  asRecord,
  firstArray,
  liveDetailFrom,
  liveItemsFrom,
  strictLiveDetailNormalized,
  strictLiveListNormalized,
  strictLiveRead,
  type UnknownRecord,
} from "./domainReads";

export async function listRebalances(): Promise<Rebalance[]> {
  return strictLiveListNormalized("rebalances.list", paths.rebalances());
}

export async function getRebalance(id: string): Promise<Rebalance | undefined> {
  return strictLiveDetailNormalized("rebalances.get", paths.rebalance(id));
}

export async function getRebalanceWorkflow(id: string): Promise<WorkflowStep[]> {
  return strictLiveRead(
    "rebalanceWorkflow.forRebalance",
    { method: "GET", path: paths.rebalance(id) },
    (body) => {
      const detail = asRecord(liveDetailFrom<UnknownRecord>(body));
      const commandAudit = asRecord(detail?.command_audit ?? detail?.commandAudit);
      return firstArray(
        detail?.workflow,
        detail?.workflowSteps,
        detail?.workflow_steps,
        detail?.steps,
        commandAudit?.workflow_steps,
      );
    },
  );
}

export async function getRebalanceOverrides(_id: string): Promise<RebalanceOverride[]> {
  return [];
}

export async function getAllocationSimulations(_id: string): Promise<AllocationSimulation[]> {
  return [];
}

export async function getMetricFreezes(_id: string): Promise<MetricFreeze[]> {
  return [];
}

export const rebalances = {
  list: listRebalances,
  get: getRebalance,
};

export const rebalanceWorkflow = {
  forRebalance: getRebalanceWorkflow,
};

export const rebalanceOverrides = {
  forRebalance: getRebalanceOverrides,
};

export const allocationSimulations = {
  forRebalance: getAllocationSimulations,
};

export const metricFreezes = {
  forRebalance: getMetricFreezes,
};

