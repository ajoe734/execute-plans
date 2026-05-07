// BFF Contract v1 — list endpoint façade.
// Wraps existing src/lib/bff/* mock readers into ListEnvelope<T> per
// .lovable/feedback/2026-05-07-final/Pantheon_BFF_DTO_Catalog.md §2.1
// + Pack D D22 (per-list totalCountExact rules).
//
// VI-1 scope: read-side migration. Mutations / detail / studios remain on
// legacy `bff.*` until VI-2 / VI-3.
// C6 (spec-conflict-G): totalCountExact rules now follow D22 matrix per entity.

import { bff } from "@/lib/bff/client";
import type { ListEnvelope } from "./dto";
import type { BaseObject } from "@/lib/bff/types";

/**
 * Pack D D22 list-class taxonomy. Drives `totalCountExact` + whether
 * `estimatedTotal` should be omitted (estimated feeds).
 */
export type ListClass =
  | "entityRegistry"   // exact count, finite
  | "governanceQueue"  // exact count
  | "loopRun"          // mock exact, backend may switch
  | "auditFeed"        // estimated
  | "realtimeFeed"     // estimated
  | "notificationFeed";// estimated

const LIST_CLASS_RULES: Readonly<Record<ListClass, { totalCountExact: boolean; emitEstimatedTotal: boolean }>> = {
  entityRegistry:   { totalCountExact: true,  emitEstimatedTotal: true  },
  governanceQueue:  { totalCountExact: true,  emitEstimatedTotal: true  },
  loopRun:          { totalCountExact: true,  emitEstimatedTotal: true  },
  auditFeed:        { totalCountExact: false, emitEstimatedTotal: true  },
  realtimeFeed:     { totalCountExact: false, emitEstimatedTotal: false },
  notificationFeed: { totalCountExact: false, emitEstimatedTotal: false },
};

function envelope<T>(items: T[], cls: ListClass): ListEnvelope<T> {
  const rule = LIST_CLASS_RULES[cls];
  const out: ListEnvelope<T> = {
    items,
    cursor: {},
    pageSize: items.length,
    totalCountExact: rule.totalCountExact,
  };
  if (rule.emitEstimatedTotal) out.estimatedTotal = items.length;
  return out;
}

/** Adapt a legacy `() => Promise<T[]>` reader into a v1 envelope reader. */
export function asListEnvelope<T>(
  loader: () => Promise<T[]>,
  cls: ListClass = "entityRegistry",
): () => Promise<ListEnvelope<T>> {
  return () => loader().then((xs) => envelope(xs, cls));
}

/** Per-entity list-class map (Pack D D22). */
export const LIST_CLASS_BY_KEY = {
  strategies: "entityRegistry",
  personas: "entityRegistry",
  capitalPools: "entityRegistry",
  rankingFormulas: "entityRegistry",
  rebalances: "governanceQueue",
  deployments: "governanceQueue",
  evolution: "entityRegistry",
  research: "entityRegistry",
  artifacts: "entityRegistry",
  tools: "entityRegistry",
  mcpServers: "entityRegistry",
  skills: "entityRegistry",
  channels: "entityRegistry",
} as const satisfies Record<string, ListClass>;

/** Canonical entity → loader map for the 13 list pages migrated in VI-1. */
export const lists = {
  strategies: asListEnvelope(() => bff.strategies.list(), LIST_CLASS_BY_KEY.strategies),
  personas: asListEnvelope(() => bff.personas.list(), LIST_CLASS_BY_KEY.personas),
  capitalPools: asListEnvelope(() => bff.capitalPools.list(), LIST_CLASS_BY_KEY.capitalPools),
  rankingFormulas: asListEnvelope(() => bff.rankingFormulas.list(), LIST_CLASS_BY_KEY.rankingFormulas),
  rebalances: asListEnvelope(() => bff.rebalances.list(), LIST_CLASS_BY_KEY.rebalances),
  deployments: asListEnvelope(() => bff.deployments.list(), LIST_CLASS_BY_KEY.deployments),
  evolution: asListEnvelope(() => bff.evolution.list(), LIST_CLASS_BY_KEY.evolution),
  research: asListEnvelope(() => bff.research.list(), LIST_CLASS_BY_KEY.research),
  artifacts: asListEnvelope(() => bff.artifacts.list(), LIST_CLASS_BY_KEY.artifacts),
  tools: asListEnvelope(() => bff.tools.list(), LIST_CLASS_BY_KEY.tools),
  mcpServers: asListEnvelope(() => bff.mcpServers.list(), LIST_CLASS_BY_KEY.mcpServers),
  skills: asListEnvelope(() => bff.skills.list(), LIST_CLASS_BY_KEY.skills),
  channels: asListEnvelope(() => bff.channels.list(), LIST_CLASS_BY_KEY.channels),
} as const satisfies Record<string, () => Promise<ListEnvelope<BaseObject>>>;

export type ListKey = keyof typeof lists;
