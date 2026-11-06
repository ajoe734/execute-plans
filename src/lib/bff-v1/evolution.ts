import type {
  EvolutionCandidate,
  EvolutionProgram,
  EvolutionProgramQualification,
  EvolutionProgramRejection,
  EvolutionProgramReview,
  EvolutionProgramRunLink,
  EvolutionQualificationCriterionRow,
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

export function normalizeEvolutionOriginKind(rawOrigin: unknown): "automatic" | "manual" {
  const value = typeof rawOrigin === "string" ? rawOrigin.trim().toLowerCase() : "";
  return value === "auto_qualified" || value === "automatic" ? "automatic" : "manual";
}

function stringListFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeQualification(raw: unknown): EvolutionProgramQualification | null {
  const record = asRecord(raw);
  if (!record) return null;
  const rawCriteria = Array.isArray(record.criteria) ? record.criteria : [];
  const criteria: EvolutionQualificationCriterionRow[] = rawCriteria
    .map((item): EvolutionQualificationCriterionRow | null => {
      const row = asRecord(item);
      if (!row) return null;
      const criterion = recordString(row, "criterion") ?? "";
      if (!criterion) return null;
      return {
        criterion,
        result: recordString(row, "result") ?? "not_evaluated",
        observed: row.observed ?? null,
        threshold: row.threshold ?? null,
        reason: recordString(row, "reason") ?? null,
      };
    })
    .filter((row): row is EvolutionQualificationCriterionRow => row !== null);
  const policyVersion = recordString(record, "policy_version", "policyVersion") ?? null;
  const evaluatedAt = recordString(record, "evaluated_at", "evaluatedAt") ?? null;
  const decisionId = recordString(record, "decision_id", "decisionId") ?? null;
  const targetId = recordString(record, "target_id", "targetId") ?? null;
  const metricName = recordString(record, "metric_name", "metricName") ?? null;
  return {
    ...record,
    policy_version: policyVersion,
    policyVersion,
    evaluated_at: evaluatedAt,
    evaluatedAt,
    decision_id: decisionId,
    decisionId,
    target_id: targetId,
    targetId,
    metric_name: metricName,
    metricName,
    qualified: typeof record.qualified === "boolean" ? record.qualified : undefined,
    first_failing_criterion: recordString(record, "first_failing_criterion", "firstFailingCriterion") ?? null,
    failure_reason: recordString(record, "failure_reason", "failureReason") ?? null,
    criteria,
  };
}

function normalizeReview(raw: unknown): EvolutionProgramReview | null {
  const record = asRecord(raw);
  if (!record) return null;
  const approvalId = recordString(record, "approval_id", "approvalId") ?? null;
  const approvalRevision =
    typeof (record.approval_revision ?? record.approvalRevision) === "number"
      ? Number(record.approval_revision ?? record.approvalRevision)
      : null;
  const submittedBy = recordString(record, "submitted_by", "submittedBy") ?? null;
  const submittedAt = recordString(record, "submitted_at", "submittedAt") ?? null;
  return {
    ...record,
    approval_id: approvalId,
    approvalId,
    approval_revision: approvalRevision,
    approvalRevision,
    submitted_by: submittedBy,
    submittedBy,
    submitted_at: submittedAt,
    submittedAt,
  };
}

function normalizeRejection(raw: unknown): EvolutionProgramRejection | null {
  const record = asRecord(raw);
  if (!record) return null;
  const reason = recordString(record, "reason") ?? null;
  const rejectedBy = recordString(record, "rejected_by", "rejectedBy") ?? null;
  const rejectedAt = recordString(record, "rejected_at", "rejectedAt") ?? null;
  return {
    ...record,
    reason,
    rejected_by: rejectedBy,
    rejectedBy,
    rejected_at: rejectedAt,
    rejectedAt,
  };
}

export function normalizeEvolutionProgram(raw: unknown): EvolutionProgram | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const base = normalizeBaseObjectFields(record) ?? record;
  const id = recordString(record, "id", "program_id", "programId", "evolution_program_id") ?? "";
  if (!id) return undefined;
  const name = recordString(record, "name", "title") ?? id;
  const rawStatus = recordString(record, "status", "state", "lifecycle_state", "lifecycleState") ?? "draft";
  const state: EvolutionProgram["state"] =
    rawStatus === "deployed" || rawStatus === "active" || rawStatus === "running"
      ? "deployed"
      : rawStatus === "review" || rawStatus === "under_review"
        ? "review"
        : rawStatus === "approved" || rawStatus === "completed"
          ? "approved"
          : rawStatus === "paused"
            ? "paused"
            : rawStatus === "retired" || rawStatus === "archived"
              ? "retired"
              : "draft";
  const rawRisk = recordString(record, "risk", "risk_level", "riskLevel");
  const risk: EvolutionProgram["risk"] =
    rawRisk === "low" || rawRisk === "medium" || rawRisk === "high" || rawRisk === "critical"
      ? rawRisk
      : "low";
  const owner = recordString(record, "owner", "created_by", "createdBy", "owner_id", "tenant_id") ?? "";
  const updatedAt = recordString(record, "updatedAt", "updated_at", "createdAt", "created_at") ?? "";
  const createdAt = recordString(record, "createdAt", "created_at") ?? undefined;
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
  const rawOrigin = recordString(record, "origin") ?? "manual";
  const originKind = normalizeEvolutionOriginKind(record.originKind ?? rawOrigin);
  const sourceDecisionIds = stringListFrom(record.source_decision_ids ?? record.sourceDecisionIds);
  const runIds = stringListFrom(record.run_ids ?? record.runIds);
  const runLinks = Array.isArray(record.run_links ?? record.runLinks)
    ? ((record.run_links ?? record.runLinks) as EvolutionProgramRunLink[])
    : [];
  const hasExplicitAllowedActions =
    Array.isArray(record.allowedActions) ||
    Array.isArray(record.allowed_actions) ||
    Array.isArray(record.availableActions) ||
    Array.isArray(record.available_actions);
  const allowedActions = hasExplicitAllowedActions
    ? stringListFrom(
        record.allowedActions ??
          record.allowed_actions ??
          record.availableActions ??
          record.available_actions,
      )
    : undefined;
  const qualification = normalizeQualification(record.qualification);
  const review = normalizeReview(record.review);
  const approval = asRecord(record.approval) ?? null;
  const rejection = normalizeRejection(record.rejection);

  return {
    ...(base as Partial<EvolutionProgram>),
    id,
    program_id: recordString(record, "program_id", "programId") ?? id,
    programId: id,
    name,
    status: rawStatus,
    state,
    risk,
    owner,
    updatedAt,
    updated_at: recordString(record, "updated_at", "updatedAt") ?? updatedAt,
    ...(createdAt ? { createdAt, created_at: createdAt } : {}),
    parentAlpha,
    generation,
    population,
    bestFitness,
    progress,
    origin: rawOrigin,
    originKind,
    source_decision_ids: sourceDecisionIds,
    sourceDecisionIds,
    run_ids: runIds,
    runIds,
    run_links: runLinks,
    runLinks,
    qualification,
    review,
    approval,
    rejection,
    ...(allowedActions !== undefined
      ? {
          allowedActions,
          allowed_actions: allowedActions,
          availableActions: allowedActions,
        }
      : {}),
  };
}

export function normalizeEvolutionRun(raw: unknown, fallbackProgramId = ""): EvolutionRun | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const id = recordString(record, "id", "run_id", "runId") ?? "";
  if (!id) return undefined;
  const programId = recordString(record, "programId", "program_id") ?? fallbackProgramId;
  const decisionId = recordString(record, "decisionId", "decision_id") ?? null;
  const status = (recordString(record, "status", "state") ?? "unknown") as EvolutionRun["status"];
  const downstreamStatus = recordString(record, "downstreamStatus", "downstream_status") ?? null;
  const linkedAt = recordString(record, "linkedAt", "linked_at") ?? undefined;
  const startedAt =
    recordString(record, "startedAt", "started_at", "linked_at", "linkedAt", "created_at", "createdAt") ?? "";
  const finishedAt = recordString(record, "finishedAt", "finished_at", "completed_at", "completedAt") ?? undefined;
  const generation = typeof record.generation === "number" && Number.isFinite(record.generation) ? record.generation : 0;
  const bestFitness =
    typeof record.bestFitness === "number" && Number.isFinite(record.bestFitness)
      ? record.bestFitness
      : typeof record.best_fitness === "number" && Number.isFinite(record.best_fitness)
        ? record.best_fitness
        : 0;
  const candidates = typeof record.candidates === "number" && Number.isFinite(record.candidates) ? record.candidates : 0;
  const detail =
    asRecord(record.detail) ??
    (typeof record.detail === "string" ? record.detail : null);
  const source = recordString(record, "source") ?? null;
  const baselineMetrics = asRecord(record.baseline_metrics) as EvolutionRun["baseline_metrics"] | undefined;
  const candidateMetrics = asRecord(record.candidate_metrics) as EvolutionRun["candidate_metrics"] | undefined;

  return {
    ...(record as Partial<EvolutionRun>),
    outcome: recordString(record, "outcome") ?? null,
    outcome_reason: recordString(record, "outcome_reason") ?? null,
    candidate_artifact_id: recordString(record, "candidate_artifact_id") ?? null,
    baseline_metrics: baselineMetrics ?? null,
    candidate_metrics: candidateMetrics ?? null,
    session_id: recordString(record, "session_id") ?? null,
    id,
    run_id: recordString(record, "run_id", "runId", "id") ?? id,
    runId: id,
    programId,
    program_id: recordString(record, "program_id", "programId") ?? programId,
    decisionId,
    decision_id: decisionId,
    status,
    downstreamStatus,
    downstream_status: downstreamStatus,
    detail,
    source,
    linkedAt,
    linked_at: linkedAt,
    startedAt,
    ...(finishedAt ? { finishedAt } : {}),
    generation,
    bestFitness,
    candidates,
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
      strictLiveRead<EvolutionRun[]>(
        helperName,
        { method: "GET", path: paths.evolutionProgramRuns(programId) },
        (body) =>
          liveItemsFrom<unknown>(body)
            .map((run) => normalizeEvolutionRun(run, programId))
            .filter((run): run is EvolutionRun => Boolean(run)),
      ),
    ),
  );
  return batches.flat();
}

export async function listEvolutionRuns(): Promise<EvolutionRun[]> {
  return fetchLiveEvolutionRuns("evolutionRuns.list");
}

export async function getEvolutionRunsForProgram(programId: string): Promise<EvolutionRun[]> {
  return strictLiveList("evolutionRuns.forProgram", paths.evolutionProgramRuns(programId), (body) =>
    liveItemsFrom<unknown>(body)
      .map((item) => normalizeEvolutionRun(item, programId))
      .filter((item): item is EvolutionRun => Boolean(item)),
  );
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
