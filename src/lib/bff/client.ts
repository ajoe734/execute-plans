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
  rankingFormulas: { list: () => delay(seed.rankingFormulas) },
  rebalances: { list: () => delay(seed.rebalances) },
  deployments: { list: () => delay(seed.deployments) },
  jobs: { list: () => delay(seed.jobs) },
  alerts: { list: () => delay(seed.alerts) },
  incidents: { list: () => delay(seed.incidents) },
  approvals: { list: () => delay(seed.approvals) },
  audit: { list: () => delay(seed.auditEvents) },
  search: (q: string) => {
    const all = seed.searchableObjects();
    if (!q) return delay(all.slice(0, 8));
    const ql = q.toLowerCase();
    return delay(all.filter((o) => o.name.toLowerCase().includes(ql) || o.type.toLowerCase().includes(ql)).slice(0, 20));
  },
};

export type BffClient = typeof bff;
