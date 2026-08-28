import * as seed from "@/mocks/seed";
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
  liveDerivedListOrSeed,
  liveDetailFrom,
  liveDetailOrSeedNormalized,
  liveListOrSeedNormalized,
  type UnknownRecord,
} from "./domainReads";

export async function listRebalances(): Promise<Rebalance[]> {
  return liveListOrSeedNormalized("rebalances.list", paths.rebalances(), seed.rebalances);
}

export async function getRebalance(id: string): Promise<Rebalance | undefined> {
  return liveDetailOrSeedNormalized("rebalances.get", paths.rebalance(id), seed.rebalances.find((s) => s.id === id));
}

export async function getRebalanceWorkflow(id: string): Promise<WorkflowStep[]> {
  return liveDerivedListOrSeed(
    "rebalanceWorkflow.forRebalance",
    paths.rebalance(id),
    seed.rebalanceWorkflowSteps(id),
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
  return delaySeed("rebalanceOverrides.forRebalance", seed.rebalanceOverrides.filter((o) => o.rebalanceId === id), []);
}

export async function getAllocationSimulations(id: string): Promise<AllocationSimulation[]> {
  return delaySeed("allocationSimulations.forRebalance", seed.allocationSimulations.filter((s) => s.rebalanceId === id), []);
}

export async function getMetricFreezes(id: string): Promise<MetricFreeze[]> {
  return delaySeed("metricFreezes.forRebalance", seed.metricFreezes.filter((m) => m.rebalanceId === id), []);
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
