import type {
  EvolutionCandidate,
  EvolutionProgram,
  EvolutionRun,
  FitnessFormula,
  MutationRule,
  PromotionRecord,
} from "./dto";
import { bffFetch } from "./client";
import { paths } from "./paths";
import {
  asRecord,
  liveDetailFrom,
  liveItemsFrom,
  normalizeBaseObjectFields,
  recordString,
  strictLiveDetail,
  strictLiveList,
  strictLiveRead,
  type UnknownRecord,
} from "./domainReads";

export interface EvolutionProgramCreatePayload {
  name: string;
}

export interface EvolutionProgramWriteOptions {
  idempotencyKey?: string;
  correlationId?: string;
}

export function normalizeEvolutionProgram(raw: unknown): EvolutionProgram | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const base = normalizeBaseObjectFields(record) ?? record;
  const id = recordString(record, "id", "program_id", "programId", "evolution_program_id") ?? "";
  if (!id) return undefined;
  const name = recordString(record, "name", "title") ?? id;
  const rawState = recordString(record, "state", "status", "lifecycle_state", "lifecycleState") ?? "draft";
  const state: EvolutionProgram["state"] =
    rawState === "deployed" || rawState === "active" || rawState === "running"
      ? "deployed"
      : rawState === "review" || rawState === "under_review"
        ? "review"
        : rawState === "approved" || rawState === "completed"
          ? "approved"
          : rawState === "paused"
            ? "paused"
            : rawState === "retired" || rawState === "archived"
              ? "retired"
              : "draft";
  const rawRisk = recordString(record, "risk", "risk_level", "riskLevel");
  const risk: EvolutionProgram["risk"] =
    rawRisk === "low" || rawRisk === "medium" || rawRisk === "high" || rawRisk === "critical"
      ? rawRisk
      : "low";
  const owner = recordString(record, "owner", "created_by", "createdBy", "owner_id", "tenant_id") ?? "";
  const updatedAt = recordString(record, "updatedAt", "updated_at", "createdAt", "created_at") ?? "";
  const parentAlpha = recordString(record, "parentAlpha", "parent_alpha", "strategy_id", "strategyId") ?? "";
  const generation = typeof record.generation === "number" && Number.isFinite(record.generation) ? record.generation : 0;
  const population = typeof record.population === "number" && Number.isFinite(record.population) ? record.population : 0;
  const bestFitness =
    typeof record.bestFitness === "number" && Number.isFinite(record.bestFitness)
      ? record.bestFitness
      : typeof record.best_fitness === "number" && Number.isFinite(record.best_fitness)
        ? record.best_fitness
        : 0;
  const progress = typeof record.progress === "number" && Number.isFinite(record.progress) ? record.progress : 0;

  return {
    ...(base as Partial<EvolutionProgram>),
    id,
    name,
    state,
    risk,
    owner,
    updatedAt,
    parentAlpha,
    generation,
    population,
    bestFitness,
    progress,
  };
}

export async function listEvolutionPrograms(): Promise<EvolutionProgram[]> {
  return strictLiveList("evolution.list", paths.evolutionPrograms(), (body) =>
    liveItemsFrom<unknown>(body)
      .map((item) => normalizeEvolutionProgram(item))
      .filter((item): item is EvolutionProgram => Boolean(item)),
  );
}

export async function getEvolutionProgram(id: string): Promise<EvolutionProgram | undefined> {
  return strictLiveDetail("evolution.get", paths.evolutionProgram(id), (body) =>
    normalizeEvolutionProgram(liveDetailFrom<unknown>(body)),
  );
}

export async function createEvolutionProgram(
  payload: EvolutionProgramCreatePayload,
  opts: EvolutionProgramWriteOptions = {},
): Promise<EvolutionProgram> {
  const trimmedName = payload.name.trim();
  const raw = await bffFetch<unknown>({
    method: "POST",
    path: paths.evolutionPrograms(),
    body: { name: trimmedName },
    idempotencyKey: opts.idempotencyKey,
    correlationId: opts.correlationId,
  });
  const detail = liveDetailFrom<unknown>(raw) ?? raw;
  const normalized = normalizeEvolutionProgram(detail);
  if (normalized) return normalized;
  return {
    id: "",
    name: trimmedName,
    state: "draft",
    risk: "low",
    owner: "",
    updatedAt: "",
    parentAlpha: "",
    generation: 0,
    population: 0,
    bestFitness: 0,
    progress: 0,
  };
}

async function fetchLiveEvolutionRuns(helperName: string): Promise<EvolutionRun[]> {
  const programs = await strictLiveRead<UnknownRecord[]>(
    helperName,
    { method: "GET", path: paths.evolutionPrograms() },
    liveItemsFrom<UnknownRecord>,
  );
  const programIds = Array.from(
    new Set(
      programs
        .map((program) => recordString(program, "id", "program_id", "programId"))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const batches = await Promise.all(
    programIds.map((programId) =>
      strictLiveRead<UnknownRecord[]>(
        helperName,
        { method: "GET", path: paths.evolutionProgramRuns(programId) },
        (body) =>
          liveItemsFrom<UnknownRecord>(body)
            .map((run) => {
              const runId = recordString(run, "id", "run_id", "runId");
              if (!runId) return null;
              return {
                ...run,
                id: runId,
                programId: recordString(run, "programId", "program_id") ?? programId,
              };
            })
            .filter((run) => run !== null),
      ),
    ),
  );
  return batches.flat() as unknown as EvolutionRun[];
}

export async function listEvolutionRuns(): Promise<EvolutionRun[]> {
  return fetchLiveEvolutionRuns("evolutionRuns.list");
}

export async function getEvolutionRunsForProgram(programId: string): Promise<EvolutionRun[]> {
  return strictLiveList("evolutionRuns.forProgram", paths.evolutionProgramRuns(programId));
}

export async function getEvolutionCandidatesForRun(runId: string): Promise<EvolutionCandidate[]> {
  const runs = await fetchLiveEvolutionRuns("evolutionCandidates.forRun");
  const run = runs.find((candidateRun) => {
    const record = asRecord(candidateRun);
    return recordString(record, "id", "run_id", "runId") === runId;
  });
  const runRecord = asRecord(run);
  const programId = recordString(runRecord, "programId", "program_id");
  if (!programId) return [];
  return strictLiveRead<UnknownRecord[]>(
    "evolutionCandidates.forRun",
    { method: "GET", path: paths.evolutionProgramCandidates(programId) },
    (body) =>
      liveItemsFrom<UnknownRecord>(body)
        .filter((candidate) => {
          const candidateRunId = recordString(candidate, "runId", "run_id", "evolution_run_id");
          return !candidateRunId || candidateRunId === runId;
        })
        .map((candidate) => {
          const candidateId = recordString(candidate, "id", "candidate_id", "candidateId");
          if (!candidateId) return null;
          return {
            ...candidate,
            id: candidateId,
            runId: recordString(candidate, "runId", "run_id", "evolution_run_id") ?? runId,
          };
        })
        .filter((candidate) => candidate !== null),
  ) as unknown as Promise<EvolutionCandidate[]>;
}

export async function getPromotionsForProgram(programId: string): Promise<PromotionRecord[]> {
  try {
    const program = await getEvolutionProgram(programId);
    if (!program) return [];
    const record = asRecord(program);
    const promotions = Array.isArray(record.promotions) ? record.promotions : [];
    return promotions
      .map((p, idx) => {
        const pr = asRecord(p);
        const candidateId = recordString(pr, "candidate_id", "candidateId");
        if (!candidateId) return null;
        const target = (recordString(pr, "stage", "target") ?? "paper") as "paper" | "live";
        return {
          id: recordString(pr, "promotion_id", "promotionId", "id") ?? `prm_${candidateId}_${idx}`,
          programId,
          candidateId,
          target,
          promotedAt: recordString(pr, "promoted_at", "promotedAt") ?? (program.updatedAt || new Date().toISOString()),
          promotedBy: recordString(pr, "promoted_by", "promotedBy") ?? "operator",
          deltaSharpe: typeof pr.delta_sharpe === "number" ? pr.delta_sharpe : (typeof pr.deltaSharpe === "number" ? pr.deltaSharpe : 0),
          deltaDrawdown: typeof pr.delta_drawdown === "number" ? pr.delta_drawdown : (typeof pr.deltaDrawdown === "number" ? pr.deltaDrawdown : 0),
          runId: recordString(pr, "run_id", "runId"),
          artifactId: recordString(pr, "artifact_id", "artifactId"),
        };
      })
      .filter((p) => p !== null);
  } catch {
    return [];
  }
}

export async function listFitnessFormulas(programId?: string): Promise<FitnessFormula[]> {
  try {
    const programs = programId
      ? [await getEvolutionProgram(programId)].filter((p): p is EvolutionProgram => Boolean(p))
      : await listEvolutionPrograms();
    const formulas: FitnessFormula[] = [];
    for (const p of programs) {
      const rec = asRecord(p);
      const raw = Array.isArray(rec.fitness_formulas)
        ? rec.fitness_formulas
        : (Array.isArray(rec.fitnessFormulas) ? rec.fitnessFormulas : []);
      for (const f of raw) {
        const fr = asRecord(f);
        const id = recordString(fr, "id", "formula_id", "formulaId");
        if (!id) continue;
        formulas.push({
          id,
          name: recordString(fr, "name") ?? `Formula ${id}`,
          owner: recordString(fr, "owner") ?? p.owner ?? "operator",
          updatedAt: recordString(fr, "created_at", "createdAt", "updatedAt") ?? p.updatedAt ?? new Date().toISOString(),
          state: "deployed",
          risk: "low",
          expression: recordString(fr, "expression") ?? "",
          metrics: Array.isArray(fr.metrics) ? (fr.metrics as string[]) : [],
          appliedTo: typeof fr.applied_to === "number" ? fr.applied_to : (typeof fr.appliedTo === "number" ? fr.appliedTo : 1),
        });
      }
    }
    return formulas;
  } catch {
    return [];
  }
}

export async function getFitnessFormula(id: string): Promise<FitnessFormula | undefined> {
  try {
    const formulas = await listFitnessFormulas();
    return formulas.find((f) => f.id === id);
  } catch {
    return undefined;
  }
}

export async function listMutationRules(programId?: string): Promise<MutationRule[]> {
  try {
    const programs = programId
      ? [await getEvolutionProgram(programId)].filter((p): p is EvolutionProgram => Boolean(p))
      : await listEvolutionPrograms();
    const rules: MutationRule[] = [];
    for (const p of programs) {
      const rec = asRecord(p);
      const raw = Array.isArray(rec.mutation_rules)
        ? rec.mutation_rules
        : (Array.isArray(rec.mutationRules) ? rec.mutationRules : []);
      for (const r of raw) {
        const rr = asRecord(r);
        const id = recordString(rr, "id", "rule_id", "ruleId");
        if (!id) continue;
        const rawScope = recordString(rr, "scope") ?? "param";
        const scope: MutationRule["scope"] = (rawScope === "structure" || rawScope === "feature") ? rawScope : "param";
        const rate = typeof rr.rate === "number" ? rr.rate : 0.05;
        const rateBps = typeof rr.rateBps === "number" ? rr.rateBps : Math.round(rate * 10000);
        rules.push({
          id,
          name: recordString(rr, "name") ?? `Rule ${id}`,
          owner: recordString(rr, "owner") ?? p.owner ?? "operator",
          updatedAt: recordString(rr, "created_at", "createdAt", "updatedAt") ?? p.updatedAt ?? new Date().toISOString(),
          state: "deployed",
          risk: (recordString(rr, "risk") as any) ?? "low",
          scope,
          expression: recordString(rr, "expression") ?? "",
          rateBps,
          enabled: typeof rr.enabled === "boolean" ? rr.enabled : true,
        });
      }
    }
    return rules;
  } catch {
    return [];
  }
}

export async function getEvolutionConstraintsForProgram(programId: string): Promise<Array<{
  id: string;
  name?: string;
  scope?: string;
  operator?: string;
  value?: unknown;
  penalty_weight?: number;
  enabled?: boolean;
  created_at?: string;
  expression?: string;
}>> {
  try {
    const program = await getEvolutionProgram(programId);
    if (!program) return [];
    const rec = asRecord(program);
    return Array.isArray(rec.constraints) ? (rec.constraints as any[]) : [];
  } catch {
    return [];
  }
}

export const evolution = {
  list: listEvolutionPrograms,
  get: getEvolutionProgram,
  create: createEvolutionProgram,
};

export const evolutionRuns = {
  list: listEvolutionRuns,
  forProgram: getEvolutionRunsForProgram,
};

export const evolutionCandidates = {
  forRun: getEvolutionCandidatesForRun,
};

export const promotions = {
  forProgram: getPromotionsForProgram,
};

export const fitnessFormulas = {
  list: listFitnessFormulas,
  get: getFitnessFormula,
};

export const mutationRules = {
  list: listMutationRules,
};

export const evolutionConstraints = {
  forProgram: getEvolutionConstraintsForProgram,
};
