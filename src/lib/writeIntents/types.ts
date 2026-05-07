// Pack F F1 — v0 mock write-intent contracts.
// NOT final backend DTO. UI-side write intent only.
// All mutations land in src/lib/bff/writeOverlay.ts (30min TTL, never touches seed).

export type CreatableEntity =
  | "strategy"
  | "persona"
  | "capitalPool"
  | "rankingFormula"
  | "rebalance"
  | "deployment"
  | "evolutionProgram"
  | "researchExperiment"
  | "artifact";

export type RiskDefault = "low" | "medium" | "high" | "critical";

export interface BaseCreateInput {
  name: string;
  owner?: string;
  risk?: RiskDefault;
  memo?: string;
}

export interface StrategyCreateInput extends BaseCreateInput {
  alpha: string;
  capitalPoolId: string;
  personaIds: string[];
  hypothesis?: string;
  initialLifecycleStatus?: "discovered" | "scaffolded";
}

export interface PersonaCreateInput extends BaseCreateInput {
  archetype: string;
  description?: string;
  initialMode?: "shadow" | "suspended";
}

export interface CapitalPoolCreateInput extends BaseCreateInput {
  currency: "USD" | "USDT" | "TWD";
  allocated: number;
  riskBudget: number;
}

export interface RankingFormulaCreateInput extends BaseCreateInput {
  expression: string;
  scope?: "strategy" | "persona" | "capitalPool" | "portfolio";
}

export interface RebalanceCreateInput extends BaseCreateInput {
  quarter: string;
  targetPoolId: string;
  proposedDelta?: number;
  notes?: string;
}

export interface DeploymentCreateInput extends BaseCreateInput {
  strategyId: string;
  artifactId: string;
  target: "research" | "paper" | "live";
  version: string;
  previousVersion?: string;
}

export interface EvolutionProgramCreateInput extends BaseCreateInput {
  parentAlpha: string;
  population: number;
  fitnessFormulaId?: string;
}

export interface ResearchExperimentCreateInput extends BaseCreateInput {
  hypothesis: string;
  metric: string;
  strategyId?: string;
}

export interface ArtifactCreateInput extends BaseCreateInput {
  kind: "model" | "dataset" | "report" | "container";
  version: string;
  sourceExperimentId?: string;
  sizeMb?: number;
  hash?: string;
}

export type CreateInputMap = {
  strategy: StrategyCreateInput;
  persona: PersonaCreateInput;
  capitalPool: CapitalPoolCreateInput;
  rankingFormula: RankingFormulaCreateInput;
  rebalance: RebalanceCreateInput;
  deployment: DeploymentCreateInput;
  evolutionProgram: EvolutionProgramCreateInput;
  researchExperiment: ResearchExperimentCreateInput;
  artifact: ArtifactCreateInput;
};

export interface CreateIntentResult<T> {
  ok: boolean;
  entityType: CreatableEntity;
  entityId?: string;
  created?: T;
  auditEventId: string;
  message?: string;
  validationErrors?: Record<string, string>;
}

export interface EntityUpdateInput<TPatch> {
  id: string;
  expectedVersion?: number;
  patch: Partial<TPatch>;
  memo?: string;
}

// --- ObjectListPage CreateBehavior ---
export type CreateBehavior =
  | { kind: "drawer"; entity: CreatableEntity }
  | { kind: "redirect"; to: string; intent?: string }
  | { kind: "disabled"; reasonI18nKey: string };
