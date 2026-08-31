// Pack F F1 — UI-side write-intent contracts.
// NOT final backend DTO. A drawer is enabled only when a typed, durable BFF
// owner is registered below; writeOverlay is never a persistence owner.

export const CREATABLE_ENTITIES = [
  "strategy",
  "persona",
  "capitalPool",
  "rankingFormula",
  "rebalance",
  "deployment",
  "evolutionProgram",
  "researchExperiment",
  "artifact",
] as const;

export type CreatableEntity = (typeof CREATABLE_ENTITIES)[number];

/**
 * Registry of generic-drawer entities that have a durable typed create owner.
 * Keep this deliberately narrow: adding an entry is an API-contract decision,
 * not a way to make a frontend-only mutation appear successful.
 */
export const DURABLE_CREATE_OWNERS = {
  persona: "POST /bff/management/personas/create-paper-bundle",
} as const satisfies Partial<Record<CreatableEntity, string>>;

export type DurableCreateEntity = keyof typeof DURABLE_CREATE_OWNERS;

export function hasDurableCreateOwner(entity: CreatableEntity): entity is DurableCreateEntity {
  return Object.prototype.hasOwnProperty.call(DURABLE_CREATE_OWNERS, entity);
}

export function durableCreateOwner(entity: CreatableEntity): string | undefined {
  return hasDurableCreateOwner(entity) ? DURABLE_CREATE_OWNERS[entity] : undefined;
}

export function isCreatableEntity(val: unknown): val is CreatableEntity {
  return typeof val === "string" && (CREATABLE_ENTITIES as readonly string[]).includes(val);
}

// Pack D D40 — 5-tier risk severity (info added in spec-conflict-G C1).
export type RiskDefault = "info" | "low" | "medium" | "high" | "critical";
export const RISK_LEVELS: readonly RiskDefault[] = ["info", "low", "medium", "high", "critical"] as const;

export const PERSONA_ARCHETYPES = [
  "trader",
  "analyst",
  "quant",
  "macro",
  "risk",
  "red_team",
  "capital",
  "generalist",
] as const;
export type PersonaArchetype = (typeof PERSONA_ARCHETYPES)[number];

export const PERSONA_INITIAL_MODES = ["paper"] as const;
export type PersonaInitialMode = (typeof PERSONA_INITIAL_MODES)[number];

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
  // Kept as the backend-facing DTO key; the UI presents it as "role type".
  archetype: PersonaArchetype;
  description?: string;
  // Initial paper execution mode, mapped to a canonical lifecycle status at build time.
  initialMode?: PersonaInitialMode;
  // Real persona identity + trading-character traits. These flow through the BFF
  // (create_persona) into the persona's OpenClaw agent SOUL so it runs as itself,
  // not a thin archetype placeholder. All optional; sparse fields are honestly
  // surfaced downstream rather than faked.
  mandate?: string;
  strategyFamily?: string;
  instruments?: string;
  riskAppetite?: string;
  decisionStyle?: string;
  timeHorizon?: string;
  hardRules?: string;
  personaVoice?: string;
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
  // ObjectListPage fail-closes drawer entries that are not in DURABLE_CREATE_OWNERS.
  // The broad entity type remains for compatibility with legacy list declarations,
  // which now render a visibly disabled action instead of an overlay-backed drawer.
  | { kind: "drawer"; entity: CreatableEntity }
  | { kind: "redirect"; to: string; intent?: string }
  | { kind: "disabled"; reasonI18nKey: string };
