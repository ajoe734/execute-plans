import * as seed from "@/mocks/seed";
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
  delay,
  delaySeed,
  isLiveBffModeConfigured,
  liveDetailOrSeed,
  liveItemsFrom,
  liveListOrSeed,
  recordString,
  strictLiveRead,
  type UnknownRecord,
} from "./domainReads";

export async function listEvolutionPrograms(): Promise<EvolutionProgram[]> {
  return liveListOrSeed("evolution.list", paths.evolutionPrograms(), seed.evolutionPrograms);
}

export async function getEvolutionProgram(id: string): Promise<EvolutionProgram | undefined> {
  return liveDetailOrSeed("evolution.get", paths.evolutionProgram(id), seed.evolutionPrograms.find((s) => s.id === id));
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
  return isLiveBffModeConfigured() ? fetchLiveEvolutionRuns("evolutionRuns.list") : delay(seed.evolutionRuns);
}

export async function getEvolutionRunsForProgram(programId: string): Promise<EvolutionRun[]> {
  return liveListOrSeed("evolutionRuns.forProgram", paths.evolutionProgramRuns(programId), seed.evolutionRuns.filter((r) => r.programId === programId));
}

export async function getEvolutionCandidatesForRun(runId: string): Promise<EvolutionCandidate[]> {
  if (isLiveBffModeConfigured()) {
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
  return delay(seed.evolutionCandidates.filter((c) => c.runId === runId));
}

export async function getPromotionsForProgram(programId: string): Promise<PromotionRecord[]> {
  return delaySeed("promotions.forProgram", seed.promotions.filter((p) => p.programId === programId), []);
}

export async function listFitnessFormulas(): Promise<FitnessFormula[]> {
  return delaySeed("fitnessFormulas.list", seed.fitnessFormulas, []);
}

export async function getFitnessFormula(id: string): Promise<FitnessFormula | undefined> {
  return delaySeed("fitnessFormulas.get", seed.fitnessFormulas.find((f) => f.id === id), undefined);
}

export async function listMutationRules(): Promise<MutationRule[]> {
  return delaySeed("mutationRules.list", seed.mutationRules, []);
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
