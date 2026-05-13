// BFF Contract v1 — mock seed accessor (canonical mock-mode surface).
//
// `bff` is the stable name UI code imports from `@/lib/bff-v1`. In mock mode
// it reads from the in-process seed; when VITE_BFF_MODE=live the typed
// `bffV1.*` client (lists/writes/sse) takes over per-entity. Until that
// migration completes, every list/get/forSubject helper here is a public
// part of the v1 surface — adding a new accessor is a deliberate API change.
//
// Writes route through `runActionSafe` / `bffWrites` instead of this mock seed
// accessor so correlationId/idempotencyKey are auto-stamped regardless of
// caller path.
//
// Mock BFF client. Returns promises with simulated latency.
// Phase P2 — every request "carries" the active locale (Accept-Language) so
// downstream services can respond in the operator's language. The mock layer
// surfaces the current value via `bff.getAcceptLanguage()` and logs locale
// changes onto the realtime bus for observability parity with a real fetch BFF.
import * as seed from "@/mocks/seed";
import { realtime } from "@/lib/bff/realtime";
import { usePlatform } from "@/platform/store";
import { bffV5 } from "@/lib/bff/v5";
import { bffAgora } from "@/lib/bff/agora";
import { bffFetch, type BffRequest } from "@/lib/bff-v1/client";
import { BffError, makeBffError } from "@/lib/bff-v1/errors";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { paths } from "@/lib/bff-v1/paths";
import {
  isLiveBffModeConfigured,
  seedHelperMustReturnEmptyInLive,
  seedHelperEmptyReason,
} from "@/lib/bff-v1/seedTaxonomy";
import {
  fetchMe,
  invalidateMe,
  logoutSession,
  refreshSession,
  type MeResponse,
} from "@/lib/v4/session/me";

const acceptLanguage = (): string => {
  const l = usePlatform.getState().locale;
  return l === "zh-TW" ? "zh-TW,zh;q=0.9,en;q=0.5" : "en-US,en;q=0.9";
};

let lastLocale = usePlatform.getState().locale;
usePlatform.subscribe((s) => {
  if (s.locale !== lastLocale) {
    lastLocale = s.locale;
    realtime.emit("data", { kind: "locale", value: s.locale, accept: acceptLanguage() });
  }
});

const delay = <T>(v: T, ms = 220) => new Promise<T>((r) => setTimeout(() => r(v), ms));

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : undefined;

const firstArray = <T>(...values: unknown[]): T[] => {
  for (const value of values) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
};

const liveItemsFrom = <T>(body: unknown): T[] => {
  if (Array.isArray(body)) return body as T[];
  const record = asRecord(body);
  const data = asRecord(record?.data);
  return firstArray<T>(
    record?.items,
    record?.data,
    data?.items,
    record?.alerts,
    record?.approvals,
    record?.artifacts,
    record?.channels,
    record?.events,
    record?.incidents,
    record?.jobs,
    record?.mcp_servers,
    record?.mcpServers,
    record?.mcp_tools,
    record?.mcpTools,
    record?.results,
    record?.runtimes,
    record?.search_results,
    record?.skills,
    record?.tools,
  );
};

const liveDetailFrom = <T>(body: unknown): T | undefined => {
  const record = asRecord(body);
  if (!record) return undefined;
  if (!Object.prototype.hasOwnProperty.call(record, "data")) return body as T;
  const data = record.data;
  if (data === null || data === undefined) return undefined;
  return (asRecord(data) ?? data) as T;
};

const detailPath = (basePath: string, id: string) => `${basePath}/${encodeURIComponent(id)}`;

async function strictLiveRead<T>(
  helperName: string,
  req: BffRequest,
  adaptLive: (body: unknown) => T,
): Promise<T> {
  try {
    const data = await bffFetch<unknown>({ ...req, mode: "live" });
    liveStatus.reportSuccess();
    return adaptLive(data);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "live transport failed";
    liveStatus.reportFallback(`strict: ${reason}`);
    if (err instanceof BffError) throw err;
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: `${helperName} live transport failed (strict mode): ${reason}`,
    });
  }
}

const liveListOrSeed = <T>(
  helperName: string,
  path: string,
  seedValue: T[],
): Promise<T[]> =>
  isLiveBffModeConfigured()
    ? strictLiveRead<T[]>(helperName, { method: "GET", path }, liveItemsFrom<T>)
    : delay(seedValue);

const liveDetailOrSeed = <T>(
  helperName: string,
  path: string,
  seedValue: T | undefined,
): Promise<T | undefined> =>
  isLiveBffModeConfigured()
    ? strictLiveRead<T | undefined>(helperName, { method: "GET", path }, liveDetailFrom<T>)
    : delay(seedValue);

const liveDerivedListOrSeed = <T>(
  helperName: string,
  path: string,
  seedValue: T[],
  adaptLive: (body: unknown) => T[],
): Promise<T[]> =>
  isLiveBffModeConfigured()
    ? strictLiveRead<T[]>(helperName, { method: "GET", path }, adaptLive)
    : delay(seedValue);

const liveEmpty = <T>(helperName: string, emptyValue: T): Promise<T> | undefined => {
  if (seedHelperMustReturnEmptyInLive(helperName)) {
    return delay(emptyValue, 0);
  }
  return undefined;
};

const delaySeed = <T>(helperName: string, value: T, emptyValue: T): Promise<T> =>
  liveEmpty(helperName, emptyValue) ?? delay(value);

export function getSeedHelperUnavailableReason(helperName: string): string | undefined {
  return seedHelperMustReturnEmptyInLive(helperName) ? seedHelperEmptyReason(helperName) : undefined;
}

export const bff = {
  /** Locale header the BFF sends on every call. UI/tests can read this to verify wiring. */
  getAcceptLanguage: () => seedHelperMustReturnEmptyInLive("bff.getAcceptLanguage") ? null : acceptLanguage(),
  /** Agora read surfaces. Strict in live mode: no seeded fallback after live transport failure. */
  agora: bffAgora,
  /** Pack E — v5 closed-loop OS facade (Q3). View-model layer; does not replace v4 normative DTOs. */
  v5: bffV5,
  /** Pack D D51/D59 (Batch III) — single source of session/user/tenant. */
  me: {
    get: (force = false): Promise<MeResponse> => fetchMe(force),
    refresh: (): Promise<MeResponse> => refreshSession(),
    logout: (): Promise<{ ok: true }> => logoutSession(),
    invalidate: (): void => invalidateMe(),
  },
  strategies: {
    list: () => liveListOrSeed("bff.strategies.list", paths.strategies(), seed.strategies),
    get: (id: string) => liveDetailOrSeed("bff.strategies.get", paths.strategy(id), seed.strategies.find((s) => s.id === id)),
  },
  personas: {
    list: () => liveListOrSeed("bff.personas.list", paths.personas(), seed.personas),
    get: (id: string) => liveDetailOrSeed("bff.personas.get", paths.persona(id), seed.personas.find((s) => s.id === id)),
  },
  capitalPools: {
    list: () => liveListOrSeed("bff.capitalPools.list", paths.capitalPools(), seed.capitalPools),
    get: (id: string) => liveDetailOrSeed("bff.capitalPools.get", paths.capitalPool(id), seed.capitalPools.find((s) => s.id === id)),
  },
  rankingFormulas: {
    list: () => liveListOrSeed("bff.rankingFormulas.list", paths.rankingFormulas(), seed.rankingFormulas),
    get: (id: string) => liveDetailOrSeed("bff.rankingFormulas.get", detailPath(paths.rankingFormulas(), id), seed.rankingFormulas.find((s) => s.id === id)),
  },
  rebalances: {
    list: () => liveListOrSeed("bff.rebalances.list", paths.rebalances(), seed.rebalances),
    get: (id: string) => liveDetailOrSeed("bff.rebalances.get", paths.rebalance(id), seed.rebalances.find((s) => s.id === id)),
  },
  deployments: {
    list: () => liveListOrSeed("bff.deployments.list", paths.deployments(), seed.deployments),
    get: (id: string) => liveDetailOrSeed("bff.deployments.get", paths.deployment(id), seed.deployments.find((s) => s.id === id)),
  },
  evolution: {
    list: () => liveListOrSeed("bff.evolution.list", paths.evolutionPrograms(), seed.evolutionPrograms),
    get: (id: string) => liveDetailOrSeed("bff.evolution.get", paths.evolutionProgram(id), seed.evolutionPrograms.find((s) => s.id === id)),
  },
  research: {
    list: () => liveListOrSeed("bff.research.list", paths.researchExperiments(), seed.researchExperiments),
    get: (id: string) => liveDetailOrSeed("bff.research.get", detailPath(paths.researchExperiments(), id), seed.researchExperiments.find((s) => s.id === id)),
  },
  artifacts: {
    list: () => liveListOrSeed("bff.artifacts.list", paths.artifacts(), seed.artifacts),
    get: (id: string) => liveDetailOrSeed("bff.artifacts.get", paths.artifact(id), seed.artifacts.find((s) => s.id === id)),
  },
  jobs: { list: () => liveListOrSeed("bff.jobs.list", paths.jobs(), seed.jobs) },
  runtimes: {
    list: () => liveListOrSeed("bff.runtimes.list", paths.runtimes(), seed.runtimes),
    get: (id: string) => liveDetailOrSeed("bff.runtimes.get", detailPath(paths.runtimes(), id), seed.runtimes.find((r) => r.id === id)),
  },
  alerts: {
    list: () => liveListOrSeed("bff.alerts.list", paths.alerts(), seed.alerts),
    get: (id: string) => liveDetailOrSeed("bff.alerts.get", detailPath(paths.alerts(), id), seed.alerts.find((a) => a.id === id)),
  },
  incidents: {
    list: () => liveListOrSeed("bff.incidents.list", paths.incidents(), seed.incidents),
    get: (id: string) => liveDetailOrSeed("bff.incidents.get", paths.incident(id), seed.incidents.find((i) => i.id === id)),
  },
  approvals: {
    list: () => liveListOrSeed("bff.approvals.list", paths.approvals(), seed.approvals),
    get: (id: string) => liveDetailOrSeed("bff.approvals.get", paths.approval(id), seed.approvals.find((a) => a.id === id)),
  },
  audit: { list: () => liveListOrSeed("bff.audit.list", paths.audit(), seed.auditEvents) },
  tools: {
    list: () => liveListOrSeed("bff.tools.list", paths.tools(), seed.tools),
    get: (id: string) => liveDetailOrSeed("bff.tools.get", detailPath(paths.tools(), id), seed.tools.find((t) => t.id === id)),
  },
  mcpServers: {
    list: () => liveListOrSeed("bff.mcpServers.list", paths.mcpServers(), seed.mcpServers),
    get: (id: string) => liveDetailOrSeed("bff.mcpServers.get", detailPath(paths.mcpServers(), id), seed.mcpServers.find((s) => s.id === id)),
  },
  mcpTools: {
    list: () => liveListOrSeed("bff.mcpTools.list", paths.mcpTools(), seed.mcpTools),
    get: (id: string) => liveDetailOrSeed("bff.mcpTools.get", detailPath(paths.mcpTools(), id), seed.mcpTools.find((t) => t.id === id)),
  },
  skills: {
    list: () => liveListOrSeed("bff.skills.list", paths.skills(), seed.skills),
    get: (id: string) => liveDetailOrSeed("bff.skills.get", detailPath(paths.skills(), id), seed.skills.find((s) => s.id === id)),
  },
  channels: {
    list: () => liveListOrSeed("bff.channels.list", paths.channels(), seed.channels),
    get: (id: string) => liveDetailOrSeed("bff.channels.get", detailPath(paths.channels(), id), seed.channels.find((c) => c.id === id)),
  },
  routePolicies: {
    list: () => delaySeed("bff.routePolicies.list", seed.routePolicies, []),
    get: (id: string) => delaySeed("bff.routePolicies.get", seed.routePolicies.find((p) => p.id === id), undefined),
    forPersona: (personaId: string) =>
      liveDetailOrSeed("bff.routePolicies.forPersona", `${paths.persona(personaId)}/route-policy`, seed.routePolicies.find((p) => p.personaId === personaId)),
  },
  policyVersions: {
    list: (policyId: string) =>
      delaySeed("bff.policyVersions.list", seed.policyVersions.filter((v) => v.policyId === policyId), []),
  },
  permissionMatrix: {
    get: (instance: string) =>
      delaySeed("bff.permissionMatrix.get", seed.permissionMatrices.find((m) => m.instance === instance), undefined),
  },
  permissionMatrices: {
    list: () => delaySeed("bff.permissionMatrices.list", seed.permissionMatrices, []),
  },
  memoryUpdates: {
    list: () => delaySeed("bff.memoryUpdates.list", seed.memoryUpdates, []),
    forPersona: (personaId: string) =>
      liveListOrSeed("bff.memoryUpdates.forPersona", `${paths.persona(personaId)}/memory`, seed.memoryUpdates.filter((m) => m.personaId === personaId)),
  },
  consultRules: {
    list: () => delaySeed("bff.consultRules.list", seed.consultRules, []),
    get: (id: string) => delaySeed("bff.consultRules.get", seed.consultRules.find((c) => c.id === id), undefined),
  },
  evolutionRuns: {
    list: () => delaySeed("bff.evolutionRuns.list", seed.evolutionRuns, []),
    forProgram: (programId: string) =>
      liveListOrSeed("bff.evolutionRuns.forProgram", `${paths.evolutionProgram(programId)}/runs`, seed.evolutionRuns.filter((r) => r.programId === programId)),
  },
  evolutionCandidates: {
    forRun: (runId: string) =>
      delaySeed("bff.evolutionCandidates.forRun", seed.evolutionCandidates.filter((c) => c.runId === runId), []),
  },
  fitnessFormulas: {
    list: () => delaySeed("bff.fitnessFormulas.list", seed.fitnessFormulas, []),
    get: (id: string) => delaySeed("bff.fitnessFormulas.get", seed.fitnessFormulas.find((f) => f.id === id), undefined),
  },
  mutationRules: {
    list: () => delaySeed("bff.mutationRules.list", seed.mutationRules, []),
  },
  allocationSimulations: {
    forRebalance: (rebalanceId: string) =>
      delaySeed("bff.allocationSimulations.forRebalance", seed.allocationSimulations.filter((s) => s.rebalanceId === rebalanceId), []),
  },
  // ----- Phase 13 -----
  policyViolations: {
    list: () => delaySeed("bff.policyViolations.list", seed.policyViolations, []),
    forSubject: (kind: string, id: string) =>
      delaySeed("bff.policyViolations.forSubject", seed.policyViolations.filter((v) => v.subjectKind === kind && v.subjectId === id), []),
  },
  evaluationRuns: {
    list: () => delaySeed("bff.evaluationRuns.list", seed.evaluationRuns, []),
    forSubject: (kind: string, id: string) =>
      delaySeed("bff.evaluationRuns.forSubject", seed.evaluationRuns.filter((e) => e.subjectKind === kind && e.subjectId === id), []),
  },
  objectVersions: {
    forSubject: (kind: string, id: string) =>
      delaySeed("bff.objectVersions.forSubject", seed.objectVersions.filter((v) => v.subjectKind === kind && v.subjectId === id), []),
  },
  featureSets: {
    forStrategy: (id: string) =>
      delaySeed("bff.featureSets.forStrategy", seed.featureSets.filter((f) => f.strategyId === id), []),
  },
  performanceSeries: {
    forStrategy: (id: string, granularity: "day" | "week" | "month") =>
      delaySeed(
        "bff.performanceSeries.forStrategy",
        seed.performanceSeries.find((s) => s.strategyId === id && s.granularity === granularity),
        undefined,
      ),
  },
  watchers: {
    forSubject: (kind: string, id: string) =>
      delaySeed("bff.watchers.forSubject", seed.watchers.filter((w) => w.subjectKind === kind && w.subjectId === id), []),
  },
  decisionJournal: {
    list: () => bffAgora.journal.list(),
    forSubject: (kind: string, id: string) =>
      bffAgora.journal.list().then((items) => items.filter((d) => d.subjectKind === kind && d.subjectId === id)),
  },
  allocationLimits: {
    forPool: (id: string) =>
      delaySeed("bff.allocationLimits.forPool", seed.allocationLimits.filter((l) => l.poolId === id), []),
  },
  poolFreezes: {
    forPool: (id: string) =>
      delaySeed("bff.poolFreezes.forPool", seed.poolFreezes.filter((f) => f.poolId === id), []),
  },
  deploymentStages: {
    forDeployment: (id: string) =>
      liveDerivedListOrSeed(
        "bff.deploymentStages.forDeployment",
        paths.deployment(id),
        seed.deploymentStages.filter((s) => s.deploymentId === id),
        (body) => {
          const detail = asRecord(liveDetailFrom<UnknownRecord>(body));
          return firstArray(
            detail?.stages,
            detail?.deploymentStages,
            detail?.deployment_stages,
            detail?.stage_history,
          );
        },
      ),
  },
  mcpSecrets: {
    forServer: (id: string) =>
      delaySeed("bff.mcpSecrets.forServer", seed.mcpSecrets.filter((s) => s.serverId === id), []),
  },
  promotions: {
    forProgram: (id: string) =>
      delaySeed("bff.promotions.forProgram", seed.promotions.filter((p) => p.programId === id), []),
  },
  metricFreezes: {
    forRebalance: (id: string) =>
      delaySeed("bff.metricFreezes.forRebalance", seed.metricFreezes.filter((m) => m.rebalanceId === id), []),
  },
  rebalanceOverrides: {
    forRebalance: (id: string) =>
      delaySeed("bff.rebalanceOverrides.forRebalance", seed.rebalanceOverrides.filter((o) => o.rebalanceId === id), []),
  },
  rebalanceWorkflow: {
    forRebalance: (id: string) =>
      liveDerivedListOrSeed(
        "bff.rebalanceWorkflow.forRebalance",
        paths.rebalance(id),
        seed.rebalanceWorkflowSteps(id),
        (body) => {
          const detail = asRecord(liveDetailFrom<UnknownRecord>(body));
          const commandAudit = asRecord(detail?.command_audit ?? detail?.commandAudit);
          return firstArray(
            detail?.workflow,
            detail?.workflowSteps,
            detail?.workflow_steps,
            detail?.steps,
            commandAudit?.workflow_steps,
          );
        },
      ),
  },
  search: (q: string) => {
    if (isLiveBffModeConfigured()) {
      return strictLiveRead("bff.search", { method: "GET", path: paths.search(), query: { q } }, (body) => liveItemsFrom(body).slice(0, 20));
    }
    const all = seed.searchableObjects();
    if (!q) return delay(all.slice(0, 8));
    const ql = q.toLowerCase();
    return delay(all.filter((o) => o.name.toLowerCase().includes(ql) || o.type.toLowerCase().includes(ql)).slice(0, 20));
  },
};

export type BffClient = typeof bff;
