import type {
  EvolutionCandidate,
  EvolutionProgram,
  EvolutionRun,
  FitnessFormula,
  MutationRule,
  PromotionRecord,
} from "./dto";
import { paths } from "./paths";
import {
  asRecord,
  liveItemsFrom,
  recordString,
  strictLiveDetail,
  strictLiveList,
  strictLiveRead,
  type UnknownRecord,
} from "./domainReads";

export async function listEvolutionPrograms(): Promise<EvolutionProgram[]> {
  return strictLiveList("evolution.list", paths.evolutionPrograms());
}

export async function getEvolutionProgram(id: string): Promise<EvolutionProgram | undefined> {
  return strictLiveDetail("evolution.get", paths.evolutionProgram(id));
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
          liveItemsFrom<UnknownRecord>(body).map((run) => ({
            ...run,
            id: recordString(run, "id", "run_id", "runId") ?? `${programId}:run`,
            programId: recordString(run, "programId", "program_id") ?? programId,
          })),
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
        .map((candidate) => ({
          ...candidate,
          id: recordString(candidate, "id", "candidate_id", "candidateId") ?? `${runId}:candidate`,
          runId: recordString(candidate, "runId", "run_id", "evolution_run_id") ?? runId,
        })),
  ) as unknown as Promise<EvolutionCandidate[]>;
}

export async function getPromotionsForProgram(_programId: string): Promise<PromotionRecord[]> {
  return [];
}

export async function listFitnessFormulas(): Promise<FitnessFormula[]> {
  return [];
}

export async function getFitnessFormula(_id: string): Promise<FitnessFormula | undefined> {
  return undefined;
}

export async function listMutationRules(): Promise<MutationRule[]> {
  return [];
}

export const evolution = {
  list: listEvolutionPrograms,
  get: getEvolutionProgram,
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
