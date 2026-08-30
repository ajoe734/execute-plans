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
  delaySeed,
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

export async function getRebalanceOverrides(id: string): Promise<RebalanceOverride[]> {
  return delaySeed("bff.rebalanceOverrides.forRebalance", [{ id: `ov_${id}`, rebalanceId: id, reason: "mock" }], []);
}

export async function getAllocationSimulations(id: string): Promise<AllocationSimulation[]> {
  return delaySeed("bff.allocationSimulations.forRebalance", [{ id: `sim_${id}`, rebalanceId: id, status: "completed" }], []);
}

export async function getMetricFreezes(id: string): Promise<MetricFreeze[]> {
  return delaySeed("bff.metricFreezes.forRebalance", [{ id: `mf_${id}`, rebalanceId: id, status: "active" }], []);
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

