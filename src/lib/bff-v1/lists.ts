// BFF Contract v1 — list endpoint façade.
// Wraps existing src/lib/bff/* mock readers into ListEnvelope<T> per
// .lovable/feedback/2026-05-07-final/Pantheon_BFF_DTO_Catalog.md §2.1.
//
// VI-1 scope: read-side migration. Mutations / detail / studios remain on
// legacy `bff.*` until VI-2 / VI-3.

import { bff } from "@/lib/bff/client";
import type { ListEnvelope } from "./dto";
import type { BaseObject } from "@/lib/bff/types";

function envelope<T>(items: T[]): ListEnvelope<T> {
  return {
    items,
    cursor: {},
    pageSize: items.length,
    estimatedTotal: items.length,
    totalCountExact: true,
  };
}

/** Adapt a legacy `() => Promise<T[]>` reader into a v1 envelope reader. */
export function asListEnvelope<T>(loader: () => Promise<T[]>): () => Promise<ListEnvelope<T>> {
  return () => loader().then(envelope);
}

/** Canonical entity → loader map for the 13 list pages migrated in VI-1. */
export const lists = {
  strategies: asListEnvelope(() => bff.strategies.list()),
  personas: asListEnvelope(() => bff.personas.list()),
  capitalPools: asListEnvelope(() => bff.capitalPools.list()),
  rankingFormulas: asListEnvelope(() => bff.rankingFormulas.list()),
  rebalances: asListEnvelope(() => bff.rebalances.list()),
  deployments: asListEnvelope(() => bff.deployments.list()),
  evolution: asListEnvelope(() => bff.evolution.list()),
  research: asListEnvelope(() => bff.research.list()),
  artifacts: asListEnvelope(() => bff.artifacts.list()),
  tools: asListEnvelope(() => bff.tools.list()),
  mcpServers: asListEnvelope(() => bff.mcpServers.list()),
  skills: asListEnvelope(() => bff.skills.list()),
  channels: asListEnvelope(() => bff.channels.list()),
} as const satisfies Record<string, () => Promise<ListEnvelope<BaseObject>>>;

export type ListKey = keyof typeof lists;
