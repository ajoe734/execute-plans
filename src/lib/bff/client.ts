/**
 * @deprecated Batch VII — Use `bffV1` from `@/lib/bff-v1` for typed v1 contract access.
 * This module remains as the mock seed-accessor backing for legacy call sites
 * (see `.lovable/audits/batch-vii-migration.md`). New code MUST NOT import
 * directly from here. If you genuinely need the seed accessor during migration,
 * import `legacyBff` from `@/lib/bff-v1/legacy`.
 */
// Mock BFF client. Returns promises with simulated latency.
// Phase P2 — every request "carries" the active locale (Accept-Language) so
// downstream services can respond in the operator's language. The mock layer
// surfaces the current value via `bff.getAcceptLanguage()` and logs locale
// changes onto the realtime bus for observability parity with a real fetch BFF.
import * as seed from "@/mocks/seed";
import { mutations } from "./mutations";
import { realtime } from "./realtime";
import { usePlatform } from "@/platform/store";
import { bffV5 } from "./v5";
import { fetchMe, invalidateMe, type MeResponse } from "@/lib/v4/session/me";

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

export const bff = {
  /** Locale header the BFF sends on every call. UI/tests can read this to verify wiring. */
  getAcceptLanguage: acceptLanguage,
  mutations,
  /** Pack E — v5 closed-loop OS facade (Q3). View-model layer; does not replace v4 normative DTOs. */
  v5: bffV5,
  /** Pack D D51/D59 (Batch III) — single source of session/user/tenant. */
  me: {
    get: (force = false): Promise<MeResponse> => fetchMe(force),
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
    list: () => delay(seed.routePolicies),
    get: (id: string) => delay(seed.routePolicies.find((p) => p.id === id)),
    forPersona: (personaId: string) => delay(seed.routePolicies.find((p) => p.personaId === personaId)),
  },
  policyVersions: {
    list: (policyId: string) => delay(seed.policyVersions.filter((v) => v.policyId === policyId)),
  },
  permissionMatrix: {
    get: (instance: string) => delay(seed.permissionMatrices.find((m) => m.instance === instance)),
  },
  permissionMatrices: {
    list: () => delay(seed.permissionMatrices),
  },
  memoryUpdates: {
    list: () => delay(seed.memoryUpdates),
    forPersona: (personaId: string) => delay(seed.memoryUpdates.filter((m) => m.personaId === personaId)),
  },
  consultRules: {
    list: () => delay(seed.consultRules),
    get: (id: string) => delay(seed.consultRules.find((c) => c.id === id)),
  },
  evolutionRuns: {
    list: () => delay(seed.evolutionRuns),
    forProgram: (programId: string) => delay(seed.evolutionRuns.filter((r) => r.programId === programId)),
  },
  evolutionCandidates: {
    forRun: (runId: string) => delay(seed.evolutionCandidates.filter((c) => c.runId === runId)),
  },
  fitnessFormulas: {
    list: () => delay(seed.fitnessFormulas),
    get: (id: string) => delay(seed.fitnessFormulas.find((f) => f.id === id)),
  },
  mutationRules: {
    list: () => delay(seed.mutationRules),
  },
  allocationSimulations: {
    forRebalance: (rebalanceId: string) => delay(seed.allocationSimulations.filter((s) => s.rebalanceId === rebalanceId)),
  },
  // ----- Phase 13 -----
  policyViolations: {
    list: () => delay(seed.policyViolations),
    forSubject: (kind: string, id: string) => delay(seed.policyViolations.filter((v) => v.subjectKind === kind && v.subjectId === id)),
  },
  evaluationRuns: {
    list: () => delay(seed.evaluationRuns),
    forSubject: (kind: string, id: string) => delay(seed.evaluationRuns.filter((e) => e.subjectKind === kind && e.subjectId === id)),
  },
  objectVersions: {
    forSubject: (kind: string, id: string) => delay(seed.objectVersions.filter((v) => v.subjectKind === kind && v.subjectId === id)),
  },
  featureSets: {
    forStrategy: (id: string) => delay(seed.featureSets.filter((f) => f.strategyId === id)),
  },
  performanceSeries: {
    forStrategy: (id: string, granularity: "day" | "week" | "month") =>
      delay(seed.performanceSeries.find((s) => s.strategyId === id && s.granularity === granularity)),
  },
  watchers: {
    forSubject: (kind: string, id: string) => delay(seed.watchers.filter((w) => w.subjectKind === kind && w.subjectId === id)),
  },
  decisionJournal: {
    list: () => delay(seed.decisionJournal),
    forSubject: (kind: string, id: string) => delay(seed.decisionJournal.filter((d) => d.subjectKind === kind && d.subjectId === id)),
  },
  allocationLimits: {
    forPool: (id: string) => delay(seed.allocationLimits.filter((l) => l.poolId === id)),
  },
  poolFreezes: {
    forPool: (id: string) => delay(seed.poolFreezes.filter((f) => f.poolId === id)),
  },
  deploymentStages: {
    forDeployment: (id: string) => delay(seed.deploymentStages.filter((s) => s.deploymentId === id)),
  },
  mcpSecrets: {
    forServer: (id: string) => delay(seed.mcpSecrets.filter((s) => s.serverId === id)),
  },
  promotions: {
    forProgram: (id: string) => delay(seed.promotions.filter((p) => p.programId === id)),
  },
  metricFreezes: {
    forRebalance: (id: string) => delay(seed.metricFreezes.filter((m) => m.rebalanceId === id)),
  },
  rebalanceOverrides: {
    forRebalance: (id: string) => delay(seed.rebalanceOverrides.filter((o) => o.rebalanceId === id)),
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
