// Pack F F1 — Per-entity default fields when creating mock objects.
// Output objects must be compatible with src/lib/bff/types.ts shapes.
import type { CreatableEntity, CreateInputMap } from "./types";

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

type Defaulter<K extends CreatableEntity> = (input: CreateInputMap[K]) => Record<string, unknown>;

const defaulters: { [K in CreatableEntity]: Defaulter<K> } = {
  strategy: (i) => ({
    id: newId("st"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "medium",
    state: "draft",
    updatedAt: nowIso(),
    alpha: i.alpha,
    capitalPoolId: i.capitalPoolId,
    personaIds: i.personaIds,
    pnl30d: 0,
    sharpe: 0,
    drawdown: 0,
    lifecycleStatus: i.initialLifecycleStatus ?? "discovered",
    reviewStatus: "pending",
    deploymentStatus: "not_deployed",
  }),
  persona: (i) => ({
    id: newId("ps"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "low",
    state: "draft",
    updatedAt: nowIso(),
    archetype: i.archetype,
    routedStrategies: 0,
    successRate: 0,
    lifecycleStatus: i.initialMode ?? "shadow",
  }),
  capitalPool: (i) => ({
    id: newId("cp"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "medium",
    state: "draft",
    updatedAt: nowIso(),
    currency: i.currency,
    allocated: i.allocated,
    utilized: 0,
    riskBudget: i.riskBudget,
  }),
  rankingFormula: (i) => ({
    id: newId("rf"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "low",
    state: "draft",
    updatedAt: nowIso(),
    expression: i.expression,
    appliedTo: 0,
  }),
  rebalance: (i) => ({
    id: newId("rb"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "high",
    state: "draft",
    updatedAt: nowIso(),
    quarter: i.quarter,
    targetPoolId: i.targetPoolId,
    proposedDelta: i.proposedDelta ?? 0,
    notes: i.notes,
  }),
  deployment: (i) => ({
    id: newId("dp"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? (i.target === "live" ? "high" : "medium"),
    state: "draft",
    updatedAt: nowIso(),
    strategyId: i.strategyId,
    artifactId: i.artifactId,
    target: i.target,
    version: i.version,
    previousVersion: i.previousVersion,
  }),
  evolutionProgram: (i) => ({
    id: newId("ev"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "medium",
    state: "draft",
    updatedAt: nowIso(),
    parentAlpha: i.parentAlpha,
    population: i.population,
    generation: 0,
    bestFitness: 0,
    progress: 0,
  }),
  researchExperiment: (i) => ({
    id: newId("rx"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "low",
    state: "draft",
    updatedAt: nowIso(),
    hypothesis: i.hypothesis,
    metric: i.metric,
    metricValue: 0,
    status: "queued",
  }),
  artifact: (i) => ({
    id: newId("ar"),
    name: i.name,
    owner: i.owner ?? "you",
    risk: i.risk ?? "low",
    state: "draft",
    updatedAt: nowIso(),
    kind: i.kind,
    version: i.version,
    sourceExperimentId: i.sourceExperimentId,
    sizeMb: i.sizeMb ?? 0,
    hash: i.hash ?? "pending",
  }),
};

export function buildEntity<K extends CreatableEntity>(
  entity: K,
  input: CreateInputMap[K],
): Record<string, unknown> {
  return (defaulters[entity] as Defaulter<K>)(input);
}

// Map CreatableEntity → realtime data:{kind} key emitted to live lists.
export const ENTITY_TO_LIVE_KIND: Record<CreatableEntity, string> = {
  strategy: "Strategy",
  persona: "Persona",
  capitalPool: "CapitalPool",
  rankingFormula: "RankingFormula",
  rebalance: "Rebalance",
  deployment: "Deployment",
  evolutionProgram: "Evolution",
  researchExperiment: "Research",
  artifact: "Artifact",
};
