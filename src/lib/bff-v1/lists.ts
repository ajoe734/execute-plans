// BFF Contract v1 — list endpoint façade.
// Wraps existing src/lib/bff/* mock readers into ListEnvelope<T> per
// .lovable/feedback/2026-05-07-final/Pantheon_BFF_DTO_Catalog.md §2.1
// + Pack D D22 (per-list totalCountExact rules).
//
// VI-1 scope: read-side migration. Mutations / detail / studios remain on
// legacy `bff.*` until VI-2 / VI-3.
// C6 (spec-conflict-G): totalCountExact rules now follow D22 matrix per entity.
// BFF-LUV-FE-002: extended to cover the remaining Management Console families
// (jobs, runtimes, alerts, incidents, approvals, audit, mcpTools) so all
// canonical Management read surfaces have a real adapter when live mode is on.

import { bff } from "./seed";
import type { ListEnvelope } from "./dto";
import { withLiveOrMock } from "./liveTransport";
import { paths } from "./paths";

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

/**
 * Build a list reader that prefers live BFF (when VITE_BFF_MODE=live and the
 * runtime hasn't fallen back), and otherwise serves the in-process mock.
 * Live response is expected to already be a `ListEnvelope<T>`; mock returns
 * the locally wrapped envelope.
 */
function liveOrMockList<T>(
  path: string,
  loader: () => Promise<T[]>,
  cls: ListClass,
): () => Promise<ListEnvelope<T>> {
  const mockFn = async (): Promise<ListEnvelope<T>> => envelope(await loader(), cls);
  return () =>
    withLiveOrMock<ListEnvelope<T>>({ method: "GET", path }, mockFn);
}

/** Per-entity list-class map (Pack D D22).
 *  BFF-LUV-FE-002 extends this with the remaining Management Console families. */
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
  mcpTools: "entityRegistry",
  skills: "entityRegistry",
  channels: "entityRegistry",
  jobs: "loopRun",
  runtimes: "entityRegistry",
  alerts: "realtimeFeed",
  incidents: "governanceQueue",
  approvals: "governanceQueue",
  audit: "auditFeed",
} as const satisfies Record<string, ListClass>;

/** Canonical entity → loader map.
 *  BFF-LUV-FE-002 covers all Management Console route families with real
 *  live adapters; mock fallback is governed by liveTransport's `auto` /
 *  `strict` fallback mode (VITE_BFF_FALLBACK). */
export const lists = {
  strategies:      liveOrMockList(paths.strategies(),         () => bff.strategies.list(),       LIST_CLASS_BY_KEY.strategies),
  personas:        liveOrMockList(paths.personas(),           () => bff.personas.list(),         LIST_CLASS_BY_KEY.personas),
  capitalPools:    liveOrMockList(paths.capitalPools(),       () => bff.capitalPools.list(),     LIST_CLASS_BY_KEY.capitalPools),
  rankingFormulas: liveOrMockList(paths.rankingFormulas(),    () => bff.rankingFormulas.list(),  LIST_CLASS_BY_KEY.rankingFormulas),
  rebalances:      liveOrMockList(paths.rebalances(),         () => bff.rebalances.list(),       LIST_CLASS_BY_KEY.rebalances),
  deployments:     liveOrMockList(paths.deployments(),        () => bff.deployments.list(),      LIST_CLASS_BY_KEY.deployments),
  evolution:       liveOrMockList(paths.evolutionPrograms(),  () => bff.evolution.list(),        LIST_CLASS_BY_KEY.evolution),
  research:        liveOrMockList(paths.researchExperiments(),() => bff.research.list(),         LIST_CLASS_BY_KEY.research),
  artifacts:       liveOrMockList(paths.artifacts(),          () => bff.artifacts.list(),        LIST_CLASS_BY_KEY.artifacts),
  tools:           liveOrMockList(paths.tools(),              () => bff.tools.list(),            LIST_CLASS_BY_KEY.tools),
  mcpServers:      liveOrMockList(paths.mcpServers(),         () => bff.mcpServers.list(),       LIST_CLASS_BY_KEY.mcpServers),
  mcpTools:        liveOrMockList(paths.mcpTools(),           () => bff.mcpTools.list(),         LIST_CLASS_BY_KEY.mcpTools),
  skills:          liveOrMockList(paths.skills(),             () => bff.skills.list(),           LIST_CLASS_BY_KEY.skills),
  channels:        liveOrMockList(paths.channels(),           () => bff.channels.list(),         LIST_CLASS_BY_KEY.channels),
  jobs:            liveOrMockList(paths.jobs(),               () => bff.jobs.list(),             LIST_CLASS_BY_KEY.jobs),
  runtimes:        liveOrMockList(paths.runtimes(),           () => bff.runtimes.list(),         LIST_CLASS_BY_KEY.runtimes),
  alerts:          liveOrMockList(paths.alerts(),             () => bff.alerts.list(),           LIST_CLASS_BY_KEY.alerts),
  incidents:       liveOrMockList(paths.incidents(),          () => bff.incidents.list(),        LIST_CLASS_BY_KEY.incidents),
  approvals:       liveOrMockList(paths.approvals(),          () => bff.approvals.list(),        LIST_CLASS_BY_KEY.approvals),
  audit:           liveOrMockList(paths.audit(),              () => bff.audit.list(),            LIST_CLASS_BY_KEY.audit),
} as const satisfies Record<string, () => Promise<ListEnvelope<unknown>>>;

export type ListKey = keyof typeof lists;
