import * as seed from "@/mocks/seed";
import type {
  AllocationLimit,
  ConsultRule,
  DecisionJournalEntry,
  EvaluationRun,
  FeatureSet,
  MemoryUpdate,
  ObjectVersion,
  PerformanceSeries,
  PermissionMatrix,
  PolicyVersion,
  PolicyViolation,
  PoolFreeze,
  RoutePolicy,
  Watcher,
} from "./dto";
import { paths } from "./paths";
import {
  asRecord,
  delay,
  delaySeed,
  firstArray,
  isLiveBffModeConfigured,
  liveDetailFrom,
  liveDetailOrSeed,
  liveItemsFrom,
  liveListOrSeed,
  recordString,
  strictLiveRead,
  type UnknownRecord,
} from "./domainReads";
import { bffAgora } from "./agora/agoraReads";

const normalizedKind = (kind: string) => kind.replace(/[^a-z0-9]/gi, "").toLowerCase();
const isPersonaKind = (kind: string) => normalizedKind(kind) === "persona";
const isStrategyKind = (kind: string) => normalizedKind(kind) === "strategy";

async function livePersonaIds(helperName: string): Promise<string[]> {
  const personas = await strictLiveRead<UnknownRecord[]>(
    helperName,
    { method: "GET", path: paths.personas() },
    liveItemsFrom<UnknownRecord>,
  );
  return Array.from(
    new Set(
      personas
        .map((persona) => recordString(persona, "id", "persona_id", "personaId"))
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

async function livePersonaScopedItems(
  helperName: string,
  pathForPersona: (personaId: string) => string,
  adaptLive: (body: unknown, personaId: string) => UnknownRecord[],
): Promise<UnknownRecord[]> {
  const personaIds = await livePersonaIds(helperName);
  const batches = await Promise.all(
    personaIds.map((personaId) =>
      strictLiveRead<UnknownRecord[]>(
        helperName,
        { method: "GET", path: pathForPersona(personaId) },
        (body) => adaptLive(body, personaId),
      ),
    ),
  );
  return batches.flat();
}

const routePolicyIdentifier = (policy: UnknownRecord | undefined): string | undefined => {
  const direct = recordString(policy, "id", "policy_id", "policyId");
  if (direct) return direct;
  const personaId = recordString(policy, "personaId", "persona_id");
  const version = recordString(policy, "version", "policy_version", "policyVersion");
  return personaId ? `persona:${personaId}:${version ?? "current"}` : undefined;
};

async function liveRoutePolicies(helperName: string): Promise<RoutePolicy[]> {
  const policies = await livePersonaScopedItems(
    helperName,
    paths.personaRoutePolicy,
    (body, personaId) => {
      const detail = asRecord(liveDetailFrom<UnknownRecord>(body));
      if (!detail) return [];
      const policy = { ...detail };
      if (policy.personaId === undefined && policy.persona_id === undefined) {
        policy.personaId = personaId;
      }
      if (policy.id === undefined) {
        policy.id = routePolicyIdentifier(policy) ?? `persona:${personaId}:current`;
      }
      return [policy];
    },
  );
  return policies as unknown as RoutePolicy[];
}

export async function listRoutePolicies(): Promise<RoutePolicy[]> {
  return isLiveBffModeConfigured() ? liveRoutePolicies("routePolicies.list") : delay(seed.routePolicies as unknown as RoutePolicy[]);
}

export async function getRoutePolicy(id: string): Promise<RoutePolicy | undefined> {
  if (isLiveBffModeConfigured()) {
    const policies = await liveRoutePolicies("routePolicies.get");
    return policies.find((policy) => routePolicyIdentifier(asRecord(policy)) === id);
  }
  return delay(seed.routePolicies.find((p) => p.id === id) as unknown as RoutePolicy | undefined);
}

export async function getRoutePolicyForPersona(personaId: string): Promise<RoutePolicy | undefined> {
  return liveDetailOrSeed("routePolicies.forPersona", paths.personaRoutePolicy(personaId), seed.routePolicies.find((p) => p.personaId === personaId) as unknown as RoutePolicy | undefined);
}

export async function listPolicyVersions(policyId: string): Promise<PolicyVersion[]> {
  return delaySeed("policyVersions.list", seed.policyVersions.filter((v) => v.policyId === policyId), []);
}

export async function getPermissionMatrix(instance: string): Promise<PermissionMatrix | undefined> {
  return delaySeed("permissionMatrix.get", seed.permissionMatrices.find((m) => m.instance === instance), undefined);
}

export async function listPermissionMatrices(): Promise<PermissionMatrix[]> {
  return delaySeed("permissionMatrices.list", seed.permissionMatrices, []);
}

async function liveMemoryUpdates(helperName: string): Promise<MemoryUpdate[]> {
  const updates = await livePersonaScopedItems(
    helperName,
    paths.personaMemory,
    (body, personaId) =>
      liveItemsFrom<UnknownRecord>(body).map((update, index) => ({
        ...update,
        id: recordString(update, "id", "memory_id", "memoryId") ?? `${personaId}:memory:${index + 1}`,
        personaId: recordString(update, "personaId", "persona_id") ?? personaId,
      })),
  );
  return updates as unknown as MemoryUpdate[];
}

export async function listMemoryUpdates(): Promise<MemoryUpdate[]> {
  return isLiveBffModeConfigured() ? liveMemoryUpdates("memoryUpdates.list") : delay(seed.memoryUpdates as MemoryUpdate[]);
}

export async function getMemoryUpdatesForPersona(personaId: string): Promise<MemoryUpdate[]> {
  return liveListOrSeed("memoryUpdates.forPersona", paths.personaMemory(personaId), (seed.memoryUpdates as MemoryUpdate[]).filter((m) => m.personaId === personaId));
}

async function liveConsultRules(helperName: string): Promise<ConsultRule[]> {
  const policies = await liveRoutePolicies(helperName);
  const rules = policies.flatMap((policy, policyIndex) => {
    const policyRecord = asRecord(policy) ?? {};
    const personaId = recordString(policyRecord, "personaId", "persona_id") ?? `persona-${policyIndex + 1}`;
    const consultPolicy = asRecord(policyRecord.consult_policy ?? policyRecord.consultPolicy);
    const triggerRules = firstArray<UnknownRecord>(
      consultPolicy?.trigger_rules,
      consultPolicy?.triggerRules,
      policyRecord.consult_rules,
      policyRecord.consultRules,
    );
    return triggerRules.map((rule, ruleIndex) => {
      const id = recordString(rule, "id", "rule_id", "ruleId") ?? `${personaId}:consult:${ruleIndex + 1}`;
      const envScope = firstArray<string>(rule.envScope, rule.env_scope);
      return {
        id,
        name: recordString(rule, "name", "description", "condition") ?? id,
        fromPersonaId: personaId,
        toPersonaId: recordString(
          rule,
          "toPersonaId",
          "to_persona_id",
          "responder_persona_id",
          "reviewer_persona_id",
        ) ?? "",
        trigger: recordString(rule, "trigger", "condition", "route") ?? "",
        mode: (recordString(rule, "mode", "decision_mode") ?? "advisory") as ConsultRule["mode"],
        envScope: (envScope.length ? envScope : ["paper", "live"]) as ConsultRule["envScope"],
        enabled: typeof rule.enabled === "boolean" ? rule.enabled : true,
        owner: recordString(rule, "owner", "updated_by") ?? recordString(consultPolicy, "owner") ?? "pantheon-bff",
        updatedAt: recordString(rule, "updatedAt", "updated_at") ?? recordString(consultPolicy, "updatedAt", "updated_at") ?? "",
      };
    });
  });
  return rules as ConsultRule[];
}

export async function listConsultRules(): Promise<ConsultRule[]> {
  return isLiveBffModeConfigured() ? liveConsultRules("consultRules.list") : delay(seed.consultRules as ConsultRule[]);
}

export async function getConsultRule(id: string): Promise<ConsultRule | undefined> {
  if (isLiveBffModeConfigured()) {
    const rules = await liveConsultRules("consultRules.get");
    return rules.find((rule) => rule.id === id);
  }
  return delay((seed.consultRules as ConsultRule[]).find((c) => c.id === id));
}

export async function listPolicyViolations(): Promise<PolicyViolation[]> {
  return delaySeed("policyViolations.list", seed.policyViolations as PolicyViolation[], []);
}

export async function getPolicyViolationsForSubject(kind: string, id: string): Promise<PolicyViolation[]> {
  return delaySeed("policyViolations.forSubject", (seed.policyViolations as PolicyViolation[]).filter((v) => v.subjectKind === kind && v.subjectId === id), []);
}

const adaptPersonaEvaluations = (body: unknown, personaId: string): UnknownRecord[] =>
  liveItemsFrom<UnknownRecord>(body).map((evaluation, index) => ({
    ...evaluation,
    id: recordString(evaluation, "id", "evaluation_id", "session_id", "run_id") ?? `${personaId}:evaluation:${index + 1}`,
    subjectKind: "Persona",
    subjectId: personaId,
  }));

async function liveEvaluationRuns(helperName: string): Promise<EvaluationRun[]> {
  const evaluations = await livePersonaScopedItems(
    helperName,
    paths.personaEvaluations,
    adaptPersonaEvaluations,
  );
  return evaluations as unknown as EvaluationRun[];
}

export async function listEvaluationRuns(): Promise<EvaluationRun[]> {
  return isLiveBffModeConfigured() ? liveEvaluationRuns("evaluationRuns.list") : delay(seed.evaluationRuns as EvaluationRun[]);
}

export async function getEvaluationRunsForSubject(kind: string, id: string): Promise<EvaluationRun[]> {
  if (isLiveBffModeConfigured()) {
    if (!isPersonaKind(kind)) return [];
    const evaluations = await strictLiveRead<UnknownRecord[]>(
      "evaluationRuns.forSubject",
      { method: "GET", path: paths.personaEvaluations(id) },
      (body) => adaptPersonaEvaluations(body, id),
    );
    return evaluations as unknown as EvaluationRun[];
  }
  return delay((seed.evaluationRuns as EvaluationRun[]).filter((e) => e.subjectKind === kind && e.subjectId === id));
}

export async function getObjectVersionsForSubject(kind: string, id: string): Promise<ObjectVersion[]> {
  if (isLiveBffModeConfigured()) {
    if (!isStrategyKind(kind)) return [];
    const versions = await strictLiveRead<UnknownRecord[]>(
      "objectVersions.forSubject",
      { method: "GET", path: paths.strategySpecs(id) },
      (body) =>
        liveItemsFrom<UnknownRecord>(body).map((version, index) => ({
          id: recordString(version, "id", "spec_version_id", "version_id") ?? `${id}:version:${index + 1}`,
          subjectKind: "Strategy" as const,
          subjectId: id,
          version: recordString(version, "version", "spec_version", "spec_version_id") ?? String(index + 1),
          author: recordString(version, "author", "created_by", "updated_by") ?? "pantheon-bff",
          createdAt: recordString(version, "createdAt", "created_at", "updated_at") ?? "",
          note: recordString(version, "note", "lifecycle_state", "state") ?? "",
          spec: (asRecord(version) ?? {}) as Record<string, unknown>,
        })),
    );
    return versions as unknown as ObjectVersion[];
  }
  return delay((seed.objectVersions as ObjectVersion[]).filter((v) => v.subjectKind === kind && v.subjectId === id));
}

export async function getFeatureSetsForStrategy(id: string): Promise<FeatureSet[]> {
  return delaySeed("featureSets.forStrategy", seed.featureSets.filter((f) => f.strategyId === id), []);
}

export async function getPerformanceSeriesForStrategy(
  id: string,
  granularity: "day" | "week" | "month",
): Promise<PerformanceSeries | undefined> {
  return delaySeed(
    "performanceSeries.forStrategy",
    seed.performanceSeries.find((s) => s.strategyId === id && s.granularity === granularity),
    undefined,
  );
}

export async function getWatchersForSubject(kind: string, id: string): Promise<Watcher[]> {
  return delaySeed("watchers.forSubject", (seed.watchers as Watcher[]).filter((w) => w.subjectKind === kind && w.subjectId === id), []);
}

export async function listDecisionJournal(): Promise<DecisionJournalEntry[]> {
  return bffAgora.journal.list();
}

export async function getDecisionJournalForSubject(kind: string, id: string): Promise<DecisionJournalEntry[]> {
  const items = await bffAgora.journal.list();
  return items.filter((d) => d.subjectKind === kind && d.subjectId === id);
}

export async function getAllocationLimitsForPool(id: string): Promise<AllocationLimit[]> {
  return delaySeed("allocationLimits.forPool", seed.allocationLimits.filter((l) => l.poolId === id), []);
}

export async function getPoolFreezesForPool(id: string): Promise<PoolFreeze[]> {
  return delaySeed("poolFreezes.forPool", seed.poolFreezes.filter((f) => f.poolId === id), []);
}

export const routePolicies = {
  list: listRoutePolicies,
  get: getRoutePolicy,
  forPersona: getRoutePolicyForPersona,
};

export const policyVersions = {
  list: listPolicyVersions,
};

export const permissionMatrix = {
  get: getPermissionMatrix,
};

export const permissionMatrices = {
  list: listPermissionMatrices,
};

export const memoryUpdates = {
  list: listMemoryUpdates,
  forPersona: getMemoryUpdatesForPersona,
};

export const consultRules = {
  list: listConsultRules,
  get: getConsultRule,
};

export const policyViolations = {
  list: listPolicyViolations,
  forSubject: getPolicyViolationsForSubject,
};

export const evaluationRuns = {
  list: listEvaluationRuns,
  forSubject: getEvaluationRunsForSubject,
};

export const objectVersions = {
  forSubject: getObjectVersionsForSubject,
};

export const featureSets = {
  forStrategy: getFeatureSetsForStrategy,
};

export const performanceSeries = {
  forStrategy: getPerformanceSeriesForStrategy,
};

export const watchers = {
  forSubject: getWatchersForSubject,
};

export const decisionJournal = {
  list: listDecisionJournal,
  forSubject: getDecisionJournalForSubject,
};

export const allocationLimits = {
  forPool: getAllocationLimitsForPool,
};

export const poolFreezes = {
  forPool: getPoolFreezesForPool,
};
