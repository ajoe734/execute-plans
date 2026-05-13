// Pack F F1 — pure validators per Pack_F_Disposition §2.5
import { PERSONA_ARCHETYPES, PERSONA_INITIAL_MODES } from "./types";
import type {
  ArtifactCreateInput,
  CapitalPoolCreateInput,
  CreateInputMap,
  CreatableEntity,
  DeploymentCreateInput,
  EvolutionProgramCreateInput,
  PersonaCreateInput,
  RankingFormulaCreateInput,
  RebalanceCreateInput,
  ResearchExperimentCreateInput,
  StrategyCreateInput,
} from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

const requireName = (name: unknown, errs: Record<string, string>) => {
  const s = typeof name === "string" ? name.trim() : "";
  if (!s) errs.name = "required";
  else if (s.length < 3 || s.length > 120) errs.name = "name length must be 3-120";
};

const PERSONA_ARCHETYPE_SET = new Set<string>(PERSONA_ARCHETYPES);
const PERSONA_INITIAL_MODE_SET = new Set<string>(PERSONA_INITIAL_MODES);

const validators: { [K in CreatableEntity]: (input: CreateInputMap[K]) => ValidationResult } = {
  strategy: (i: StrategyCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.alpha?.trim()) errors.alpha = "required";
    else if (!/^[a-z0-9][a-z0-9_-]*$/i.test(i.alpha)) errors.alpha = "must be slug format";
    if (!i.capitalPoolId?.trim()) errors.capitalPoolId = "required";
    if (!Array.isArray(i.personaIds) || i.personaIds.length < 1) errors.personaIds = "at least 1 required";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  persona: (i: PersonaCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.archetype?.trim()) errors.archetype = "required";
    else if (!PERSONA_ARCHETYPE_SET.has(i.archetype)) errors.archetype = "invalid option";
    if (i.initialMode && !PERSONA_INITIAL_MODE_SET.has(i.initialMode)) errors.initialMode = "invalid option";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  capitalPool: (i: CapitalPoolCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.currency) errors.currency = "required";
    if (!(i.allocated > 0)) errors.allocated = "must be > 0";
    if (!(i.riskBudget > 0 && i.riskBudget <= 1)) errors.riskBudget = "must be in (0, 1]";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  rankingFormula: (i: RankingFormulaCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.expression?.trim()) errors.expression = "required";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  rebalance: (i: RebalanceCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.quarter?.trim()) errors.quarter = "required";
    else if (!/^\d{4}-Q[1-4]$/.test(i.quarter)) errors.quarter = "format YYYY-Qn";
    if (!i.targetPoolId?.trim()) errors.targetPoolId = "required";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  deployment: (i: DeploymentCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.strategyId?.trim()) errors.strategyId = "required";
    if (!i.artifactId?.trim()) errors.artifactId = "required";
    if (!i.target) errors.target = "required";
    if (!i.version?.trim()) errors.version = "required";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  evolutionProgram: (i: EvolutionProgramCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.parentAlpha?.trim()) errors.parentAlpha = "required";
    if (!(i.population > 0)) errors.population = "must be > 0";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  researchExperiment: (i: ResearchExperimentCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.hypothesis?.trim()) errors.hypothesis = "required";
    if (!i.metric?.trim()) errors.metric = "required";
    return { ok: Object.keys(errors).length === 0, errors };
  },
  artifact: (i: ArtifactCreateInput) => {
    const errors: Record<string, string> = {};
    requireName(i.name, errors);
    if (!i.kind) errors.kind = "required";
    if (!i.version?.trim()) errors.version = "required";
    return { ok: Object.keys(errors).length === 0, errors };
  },
};

export function validateCreate<K extends CreatableEntity>(
  entity: K,
  input: CreateInputMap[K],
): ValidationResult {
  return (validators[entity] as (i: CreateInputMap[K]) => ValidationResult)(input);
}
