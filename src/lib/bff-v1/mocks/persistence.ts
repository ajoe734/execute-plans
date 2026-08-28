// Phase 15 — Persistence layer for the mock BFF.
// Snapshots a curated subset of the seed module to localStorage so refreshes
// preserve audit trail, lifecycle states and Phase 13 governance mutations.
//
// We deliberately replace the contents of each in-memory array (via splice)
// rather than re-assigning the export, because every consumer imports the
// array reference once at module load.

import * as seed from "@/mocks/seed";

const KEY = "pantheon.bff.persist.v1";

// Names of seed exports that we persist. Order does not matter.
const PERSISTED = [
  "strategies", "personas", "capitalPools", "rankingFormulas",
  "rebalances", "evolutionPrograms", "researchExperiments", "artifacts",
  "deployments", "alerts", "incidents", "approvals", "auditEvents",
  "tools", "mcpServers", "mcpTools", "skills", "channels",
  "routePolicies", "policyVersions", "consultRules",
  "evolutionRuns", "evolutionCandidates", "fitnessFormulas", "mutationRules",
  "policyViolations", "evaluationRuns", "objectVersions",
  "allocationLimits", "poolFreezes", "deploymentStages",
  "mcpSecrets", "promotions", "metricFreezes", "rebalanceOverrides",
] as const;

type PersistedKey = typeof PERSISTED[number];

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let suspended = false;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function rehydrate(): void {
  const ls = safeStorage();
  if (!ls) return;
  const raw = ls.getItem(KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<PersistedKey, unknown[]>>;
    suspended = true;
    for (const key of PERSISTED) {
      const target = (seed as unknown as Record<string, unknown>)[key];
      const incoming = parsed[key];
      if (!Array.isArray(target) || !Array.isArray(incoming)) continue;
      // splice in place to preserve the imported reference
      (target as unknown[]).splice(0, target.length, ...incoming);
    }
  } catch (e) {
    console.warn("[persistence] rehydrate failed; clearing", e);
    ls.removeItem(KEY);
  } finally {
    suspended = false;
  }
}

export function persistNow(): void {
  if (suspended) return;
  const ls = safeStorage();
  if (!ls) return;
  const snap: Record<string, unknown> = {};
  for (const key of PERSISTED) {
    const arr = (seed as unknown as Record<string, unknown>)[key];
    if (Array.isArray(arr)) snap[key] = arr;
  }
  try { ls.setItem(KEY, JSON.stringify(snap)); } catch (e) { console.warn("[persistence] write failed", e); }
}

/** Debounced write — call after every mutation. */
export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 200);
}

export function clearPersisted(): void {
  const ls = safeStorage();
  ls?.removeItem(KEY);
}
