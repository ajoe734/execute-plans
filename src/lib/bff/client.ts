// Mock BFF client. Returns promises with simulated latency.
import * as seed from "@/mocks/seed";

const delay = <T>(v: T, ms = 220) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const bff = {
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
  search: (q: string) => {
    const all = seed.searchableObjects();
    if (!q) return delay(all.slice(0, 8));
    const ql = q.toLowerCase();
    return delay(all.filter((o) => o.name.toLowerCase().includes(ql) || o.type.toLowerCase().includes(ql)).slice(0, 20));
  },
};

export type BffClient = typeof bff;
