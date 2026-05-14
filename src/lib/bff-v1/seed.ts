// BFF Contract v1 — mock seed accessor (canonical mock-mode surface).
//
// `bff` is the stable name UI code imports from `@/lib/bff-v1`. In mock mode
// it reads from the in-process seed; when VITE_BFF_MODE=live the typed
// `bffV1.*` client (lists/writes/sse) takes over per-entity. Until that
// migration completes, every list/get/forSubject helper here is a public
// part of the v1 surface — adding a new accessor is a deliberate API change.
//
// Mutations route through `bff.mutations` → `runActionSafe` → `tryRunAction`
// (writes.ts) so correlationId/idempotencyKey are auto-stamped regardless of
// caller path.
//
// Mock BFF client. Returns promises with simulated latency.
// Phase P2 — every request "carries" the active locale (Accept-Language) so
// downstream services can respond in the operator's language. The mock layer
// surfaces the current value via `bff.getAcceptLanguage()` and logs locale
// changes onto the realtime bus for observability parity with a real fetch BFF.
import * as seed from "@/mocks/seed";
import { mutations } from "@/lib/bff/mutations";
import { realtime } from "@/lib/bff/realtime";
import { usePlatform } from "@/platform/store";
import { bffV5 } from "@/lib/bff/v5";
import { bffAgora } from "@/lib/bff/agora";
import {
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
  mutations,
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
  /** v3 §6.2 high-risk confirmation token issuance. */
  commands: {
    requestConfirmToken: mutations.requestConfirmToken,
  },
  strategies: {
    list: () => delay(seed.strategies),
    get: (id: string) => delay(seed.strategies.find((s) => s.id === id)),
  },
  personas: {
    list: () => delay(seed.personas),
    get: (id: string) => delay(seed.personas.find((s) => s.id === id)),
  },
  capitalPools: {
    list: () => delay(seed.capitalPools),
    get: (id: string) => delay(seed.capitalPools.find((s) => s.id === id)),
  },
  rankingFormulas: {
    list: () => delay(seed.rankingFormulas),
    get: (id: string) => delay(seed.rankingFormulas.find((s) => s.id === id)),
  },
  rebalances: {
    list: () => delay(seed.rebalances),
    get: (id: string) => delay(seed.rebalances.find((s) => s.id === id)),
  },
  deployments: {
    list: () => delay(seed.deployments),
    get: (id: string) => delay(seed.deployments.find((s) => s.id === id)),
  },
  evolution: {
    list: () => delay(seed.evolutionPrograms),
    get: (id: string) => delay(seed.evolutionPrograms.find((s) => s.id === id)),
  },
  research: {
    list: () => delay(seed.researchExperiments),
    get: (id: string) => delay(seed.researchExperiments.find((s) => s.id === id)),
  },
  artifacts: {
    list: () => delay(seed.artifacts),
    get: (id: string) => delay(seed.artifacts.find((s) => s.id === id)),
  },
  jobs: { list: () => delay(seed.jobs) },
  runtimes: {
    list: () => delay(seed.runtimes),
    get: (id: string) => delay(seed.runtimes.find((r) => r.id === id)),
  },
  alerts: {
    list: () => delay(seed.alerts),
    get: (id: string) => delay(seed.alerts.find((a) => a.id === id)),
  },
  incidents: {
    list: () => delay(seed.incidents),
    get: (id: string) => delay(seed.incidents.find((i) => i.id === id)),
  },
  approvals: {
    list: () => delay(seed.approvals),
    get: (id: string) => delay(seed.approvals.find((a) => a.id === id)),
  },
  audit: { list: () => delay(seed.auditEvents) },
  tools: {
    list: () => delay(seed.tools),
    get: (id: string) => delay(seed.tools.find((t) => t.id === id)),
  },
  mcpServers: {
    list: () => delay(seed.mcpServers),
    get: (id: string) => delay(seed.mcpServers.find((s) => s.id === id)),
  },
  mcpTools: {
    list: () => delay(seed.mcpTools),
    get: (id: string) => delay(seed.mcpTools.find((t) => t.id === id)),
  },
  skills: {
    list: () => delay(seed.skills),
    get: (id: string) => delay(seed.skills.find((s) => s.id === id)),
  },
  channels: {
    list: () => delay(seed.channels),
    get: (id: string) => delay(seed.channels.find((c) => c.id === id)),
  },
  routePolicies: {
    list: () => delaySeed("bff.routePolicies.list", seed.routePolicies, []),
    get: (id: string) => delaySeed("bff.routePolicies.get", seed.routePolicies.find((p) => p.id === id), undefined),
    forPersona: (personaId: string) => delay(seed.routePolicies.find((p) => p.personaId === personaId)),
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
    forPersona: (personaId: string) => delay(seed.memoryUpdates.filter((m) => m.personaId === personaId)),
  },
  consultRules: {
    list: () => delaySeed("bff.consultRules.list", seed.consultRules, []),
    get: (id: string) => delaySeed("bff.consultRules.get", seed.consultRules.find((c) => c.id === id), undefined),
  },
  evolutionRuns: {
    list: () => delaySeed("bff.evolutionRuns.list", seed.evolutionRuns, []),
    forProgram: (programId: string) => delay(seed.evolutionRuns.filter((r) => r.programId === programId)),
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
    forDeployment: (id: string) => delay(seed.deploymentStages.filter((s) => s.deploymentId === id)),
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
    forRebalance: (id: string) => delay(seed.rebalanceWorkflowSteps(id)),
  },
  search: (q: string) => {
    const all = seed.searchableObjects();
    if (!q) return delay(all.slice(0, 8));
    const ql = q.toLowerCase();
    return delay(all.filter((o) => o.name.toLowerCase().includes(ql) || o.type.toLowerCase().includes(ql)).slice(0, 20));
  },
};

export type BffClient = typeof bff;
