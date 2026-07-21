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
  persona: (i) => {
    const initialMode = i.initialMode ?? "paper";
    const lifecycleStatus = "paper_running";
    // Assemble the persona's trading-character traits from the flat form inputs.
    // Only carry non-empty values so the BFF stores real data and the OpenClaw
    // SOUL can honestly mark whatever is still unset.
    const traitEntries: Array<[string, string | undefined]> = [
      ["instruments", i.instruments],
      ["risk_appetite", i.riskAppetite],
      ["decision_style", i.decisionStyle],
      ["time_horizon", i.timeHorizon],
      ["hard_rules", i.hardRules],
      ["persona_voice", i.personaVoice],
    ];
    const traits: Record<string, string> = {};
    for (const [key, value] of traitEntries) {
      const v = (value ?? "").trim();
      if (v) traits[key] = v;
    }
    return {
      id: newId("ps"),
      name: i.name,
      owner: i.owner ?? "you",
      risk: i.risk ?? "low",
      state: "paper_running",
      updatedAt: nowIso(),
      archetype: i.archetype,
      routedStrategies: 0,
      successRate: 0,
      lifecycleStatus,
      executionMode: initialMode,
      capitalMode: "paper",
      deploymentStage: "paper",
      liveCapitalEnabled: false,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      mandate: (i.mandate ?? "").trim() || undefined,
      strategyFamily: (i.strategyFamily ?? "").trim() || undefined,
      traits: Object.keys(traits).length ? traits : undefined,
    };
  },
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

// G06 — bind CreatableEntity → SSE channel (must exist in SSE_CHANNELS).
// Derived map kept alongside ENTITY_TO_LIVE_KIND so live overlay events publish
// to a real channel rather than a free-form string. Verified at runtime by
// importing isSseChannel from "@/lib/bff-v1/sse/channels" in the consumer.
export const ENTITY_TO_SSE_CHANNEL: Record<CreatableEntity, string> = {
  strategy: "strategy",
  persona: "persona",
  capitalPool: "capital",
  rankingFormula: "ranking",
  rebalance: "rebalance",
  deployment: "deployment",
  evolutionProgram: "evolution",
  researchExperiment: "research",
  artifact: "artifact",
};
