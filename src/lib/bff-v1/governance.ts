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
  firstArray,
  liveDetailFrom,
  liveItemsFrom,
  recordString,
  strictLiveDetail,
  strictLiveList,
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
  return liveRoutePolicies("routePolicies.list");
}

export async function getRoutePolicy(id: string): Promise<RoutePolicy | undefined> {
  const policies = await liveRoutePolicies("routePolicies.get");
  return policies.find((policy) => routePolicyIdentifier(asRecord(policy)) === id);
}

export async function getRoutePolicyForPersona(personaId: string): Promise<RoutePolicy | undefined> {
  return strictLiveDetail("routePolicies.forPersona", paths.personaRoutePolicy(personaId));
}

export async function listPolicyVersions(_policyId: string): Promise<PolicyVersion[]> {
  return [];
}

export async function getPermissionMatrix(_instance: string): Promise<PermissionMatrix | undefined> {
  return undefined;
}

export async function listPermissionMatrices(): Promise<PermissionMatrix[]> {
  return [];
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
  return liveMemoryUpdates("memoryUpdates.list");
}

export async function getMemoryUpdatesForPersona(personaId: string): Promise<MemoryUpdate[]> {
  return strictLiveList("memoryUpdates.forPersona", paths.personaMemory(personaId));
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
        personaId,
        fromPersonaId: personaId,
        trigger: recordString(rule, "trigger", "condition", "name") ?? "risk.high",
        condition: recordString(rule, "condition", "name") ?? "risk.high",
        mode: recordString(rule, "mode", "decision_mode") === "blocking" ? "blocking" as const : "advisory" as const,
        description: recordString(rule, "description", "summary"),
        envScope: envScope.filter((s): s is "live" | "paper" | "backtest" =>
          s === "live" || s === "paper" || s === "backtest"),
        toPersonaId: recordString(rule, "toPersonaId", "to_persona_id", "target_persona_id"),
      };
    });
  });
  return rules as ConsultRule[];
}

export async function listConsultRules(): Promise<ConsultRule[]> {
  return liveConsultRules("consultRules.list");
}

export async function getConsultRule(id: string): Promise<ConsultRule | undefined> {
  const rules = await liveConsultRules("consultRules.get");
  return rules.find((rule) => rule.id === id);
}

export async function listPolicyViolations(): Promise<PolicyViolation[]> {
  return [];
}

export async function getPolicyViolationsForSubject(_kind: string, _id: string): Promise<PolicyViolation[]> {
  return [];
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
  return liveEvaluationRuns("evaluationRuns.list");
}

export async function getEvaluationRunsForSubject(kind: string, id: string): Promise<EvaluationRun[]> {
  if (!isPersonaKind(kind)) return [];
  const evaluations = await strictLiveRead<UnknownRecord[]>(
    "evaluationRuns.forSubject",
    { method: "GET", path: paths.personaEvaluations(id) },
    (body) => adaptPersonaEvaluations(body, id),
  );
  return evaluations as unknown as EvaluationRun[];
}

export async function getObjectVersionsForSubject(kind: string, id: string): Promise<ObjectVersion[]> {
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

export async function getFeatureSetsForStrategy(_id: string): Promise<FeatureSet[]> {
  return [];
}

export async function getPerformanceSeriesForStrategy(
  _id: string,
  _granularity: "day" | "week" | "month",
): Promise<PerformanceSeries | undefined> {
  return undefined;
}

export async function getWatchersForSubject(_kind: string, _id: string): Promise<Watcher[]> {
  return [];
}

export async function listDecisionJournal(): Promise<DecisionJournalEntry[]> {
  return bffAgora.journal.list();
}

export async function getDecisionJournalForSubject(kind: string, id: string): Promise<DecisionJournalEntry[]> {
  const items = await bffAgora.journal.list();
  return items.filter((d) => d.subjectKind === kind && d.subjectId === id);
}

export async function getAllocationLimitsForPool(_id: string): Promise<AllocationLimit[]> {
  return [];
}

export async function getPoolFreezesForPool(_id: string): Promise<PoolFreeze[]> {
  return [];
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
