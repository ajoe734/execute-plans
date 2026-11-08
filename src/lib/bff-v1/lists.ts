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

import type { Alert, Incident } from "./dto";
import type { ListEnvelope } from "./dto";
import { bffFetch } from "./client";
import { paths } from "./paths";
import {
  normalizeAlertTimestampFields,
  normalizeIncidentTimestampFields,
} from "./eventTimestamps";
import { normalizeCapitalPool } from "./capitalPools";
import {
  adaptRuntimeRow,
  collectPaginatedListPages,
  MAX_PAGINATED_LIST_PAGES,
  normalizeArtifactFields,
  normalizeBaseObjectFields,
  normalizeDeploymentFields,
  numberFrom,
  PAGINATED_LIST_PAGE_SIZE,
  stringFrom,
  type RuntimeListItem,
} from "./domainReads";
import { normalizeEvolutionProgram } from "./evolution";
import { normalizeJobFields } from "./operations";
import { normalizeResearchTask } from "./research";

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
  if (rule.emitEstimatedTotal) {
    out.estimatedTotal = items.length;
  }
  return out;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function normalizeLiveListResponse<T>(payload: unknown, cls: ListClass): ListEnvelope<T> {
  const rule = LIST_CLASS_RULES[cls];
  if (Array.isArray(payload)) {
    return envelope(payload as T[], cls);
  }

  const record = asRecord(payload);
  const data = asRecord(record?.data);
  const meta = asRecord(record?.meta);
  const rawItems = (
    (Array.isArray(record?.items) && record.items) ||
    (Array.isArray(record?.data) && record.data) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(record?.tasks) && record.tasks) ||
    (Array.isArray(record?.alerts) && record.alerts) ||
    (Array.isArray(record?.incidents) && record.incidents) ||
    (Array.isArray(record?.approvals) && record.approvals) ||
    (Array.isArray(record?.jobs) && record.jobs) ||
    (Array.isArray(record?.runtimes) && record.runtimes) ||
    (Array.isArray(record?.events) && record.events) ||
    (Array.isArray(record?.mcp_tools) && record.mcp_tools) ||
    (Array.isArray(record?.mcpTools) && record.mcpTools) ||
    (Array.isArray(record?.results) && record.results) ||
    (Array.isArray(record?.search_results) && record.search_results) ||
    []
  ) as T[];

  const rawCursor = asRecord(record?.cursor) ?? asRecord(data?.cursor) ?? asRecord(meta?.cursor) ?? {};
  const rawPageInfo = asRecord(record?.page_info) ?? asRecord(data?.page_info) ?? asRecord(meta?.page_info) ?? {};

  const totalCandidates = [
    record?.total,
    record?.totalCount,
    record?.total_count,
    data?.total,
    data?.totalCount,
    data?.total_count,
    meta?.total,
    meta?.totalCount,
    meta?.total_count,
    rawPageInfo.total,
    rawPageInfo.totalCount,
    rawPageInfo.total_count,
  ];

  const estimatedCandidates = [
    record?.estimatedTotal,
    record?.estimated_total,
    data?.estimatedTotal,
    data?.estimated_total,
    meta?.estimatedTotal,
    meta?.estimated_total,
  ];

  const explicitTotal = numberFrom(...totalCandidates);
  const explicitEstimated = numberFrom(...estimatedCandidates);

  const exactFlag = [
    record?.totalCountExact,
    record?.total_count_exact,
    record?.total_complete,
    data?.totalCountExact,
    data?.total_count_exact,
    data?.total_complete,
    meta?.totalCountExact,
    meta?.total_count_exact,
    meta?.total_complete,
  ].find((v) => typeof v === "boolean");

  const totalCountExact = typeof exactFlag === "boolean" ? exactFlag : rule.totalCountExact;

  const out: ListEnvelope<T> = {
    items: rawItems,
    cursor: {
      next: stringFrom(rawCursor.next, rawCursor.next_cursor, rawPageInfo.next_cursor, rawPageInfo.next_page_token),
      prev: stringFrom(rawCursor.prev, rawCursor.prev_cursor, rawPageInfo.prev_cursor),
    },
    pageSize: numberFrom(record?.pageSize, record?.page_size, data?.pageSize, data?.page_size, rawPageInfo.page_size) ?? rawItems.length,
    totalCountExact,
  };

  // Note: every list class with totalCountExact=true also has emitEstimatedTotal=true
  // (see LIST_CLASS_RULES), so the exact total is always surfaced via estimatedTotal below —
  // ListEnvelope has no separate exact-total field.
  if (rule.emitEstimatedTotal) {
    if (explicitEstimated !== undefined) {
      out.estimatedTotal = explicitEstimated;
    } else if (explicitTotal !== undefined) {
      out.estimatedTotal = explicitTotal;
    } else {
      out.estimatedTotal = rawItems.length;
    }
  }

  if (record && typeof record.meta === "object" && record.meta !== null && !Array.isArray(record.meta)) {
    out.meta = record.meta as Record<string, unknown>;
  }

  return out;
}

export function asListEnvelope<T>(
  loader: () => Promise<T[]>,
  cls: ListClass = "entityRegistry",
): () => Promise<ListEnvelope<T>> {
  return () => loader().then((xs) => envelope(xs, cls));
}

export interface StrategyListQueryOptions {
  state?: string;
  excludeState?: string;
  exclude_state?: string;
  personaId?: string;
  persona_id?: string;
  pageSize?: number;
  page_size?: number;
  pageToken?: string | null;
  page_token?: string | null;
}

function buildStrategyListQuery(
  options?: StrategyListQueryOptions,
): Record<string, string | number | undefined> | undefined {
  if (!options) return undefined;
  const query: Record<string, string | number | undefined> = {};
  const state = options.state?.trim();
  const excludeState = (options.exclude_state ?? options.excludeState)?.trim();
  const personaId = (options.persona_id ?? options.personaId)?.trim();
  const pageSize = options.page_size ?? options.pageSize;
  const pageToken = (options.page_token ?? options.pageToken)?.trim();
  if (state) query.state = state;
  if (excludeState) query.exclude_state = excludeState;
  if (personaId) query.persona_id = personaId;
  if (typeof pageSize === "number" && Number.isFinite(pageSize) && pageSize > 0) {
    query.page_size = pageSize;
  }
  if (pageToken) query.page_token = pageToken;
  return Object.keys(query).length > 0 ? query : undefined;
}

function strictLiveStrategyListLoader<T extends { state?: unknown }>(
  cls: ListClass,
  adaptItem?: (value: unknown) => T | undefined,
): (options?: StrategyListQueryOptions) => Promise<ListEnvelope<T>> {
  const adaptItems = (items: unknown[]): T[] => adaptItem
    ? items.map((item) => adaptItem(item)).filter((item): item is T => Boolean(item))
    : items as T[];
  return async (options?: StrategyListQueryOptions) => {
    const query = buildStrategyListQuery(options);
    const excludeState = (options?.exclude_state ?? options?.excludeState)?.trim().toLowerCase();
    const data = await bffFetch<unknown>({
      method: "GET",
      path: paths.strategies(),
      ...(query ? { query } : {}),
    });
    const env = normalizeLiveListResponse<unknown>(data, cls);
    const adapted = adaptItems(env.items);
    const items = excludeState
      ? adapted.filter((item) => String(item?.state ?? "").trim().toLowerCase() !== excludeState)
      : adapted;
    return {
      ...env,
      items,
      pageSize: items.length,
    };
  };
}

export type PagedListQueryOptions = Pick<
  StrategyListQueryOptions,
  "pageSize" | "page_size" | "pageToken" | "page_token"
>;

/** Like strictLiveListLoader, but forwards page_size/page_token when supplied.
 *  Called with no options (or a non-options argument such as an AbortSignal) it
 *  issues the same unparameterised request as before, so existing callers are
 *  unchanged. */
function strictLivePagedQueryListLoader<T>(
  path: string,
  cls: ListClass,
  adaptItem?: (value: unknown) => T | undefined,
  normalizeEnvelope?: (payload: unknown, cls: ListClass) => ListEnvelope<T>,
): (options?: PagedListQueryOptions) => Promise<ListEnvelope<T>> {
  const adaptItems = (items: unknown[]): T[] => adaptItem
    ? items.map((item) => adaptItem(item)).filter((item): item is T => Boolean(item))
    : items as T[];
  return async (options?: PagedListQueryOptions) => {
    const query = buildStrategyListQuery(options);
    const data = await bffFetch<unknown>({ method: "GET", path, ...(query ? { query } : {}) });
    if (normalizeEnvelope) return normalizeEnvelope(data, cls);
    const env = normalizeLiveListResponse<unknown>(data, cls);
    const items = adaptItems(env.items);
    return { ...env, items, pageSize: items.length };
  };
}

function strictLiveListLoader<T>(
  path: string,
  cls: ListClass,
  adaptItem?: (value: unknown) => T | undefined,
): () => Promise<ListEnvelope<T>> {
  const adaptItems = (items: unknown[]): T[] => adaptItem
    ? items.map((item) => adaptItem(item)).filter((item): item is T => Boolean(item))
    : items as T[];
  return async () => {
    const data = await bffFetch<unknown>({ method: "GET", path });
    const env = normalizeLiveListResponse<unknown>(data, cls);
    const items = adaptItems(env.items);
    return {
      ...env,
      items,
      pageSize: items.length,
    };
  };
}

const ARTIFACT_PAGINATED_LIST_PAGE_SIZE = 100;

function strictLivePaginatedListLoader<T extends { id?: string }>(
  path: string,
  cls: ListClass,
  adaptItem?: (value: unknown, index: number) => T | undefined,
  pageSize: number = PAGINATED_LIST_PAGE_SIZE,
): () => Promise<ListEnvelope<T>> {
  const adaptItems = (items: unknown[]): T[] => adaptItem
    ? items.map((item, index) => adaptItem(item, index)).filter((item): item is T => Boolean(item))
    : items as T[];
  return async () => {
    let firstEnv: ListEnvelope<unknown> | undefined;
    let lastEnv: ListEnvelope<unknown> | undefined;

    const allItems = await collectPaginatedListPages<T>({
      helperName: `lists:${path}`,
      path,
      pageSize,
      maxPages: MAX_PAGINATED_LIST_PAGES,
      fetchPage: (req) => bffFetch<unknown>(req),
      extractPageItems: (data) => {
        const env = normalizeLiveListResponse<unknown>(data, cls);
        if (!firstEnv) firstEnv = env;
        lastEnv = env;
        return adaptItems(env.items);
      },
      extractNextToken: () => lastEnv?.cursor.next?.trim() || undefined,
    });

    const baseEnv = lastEnv ?? firstEnv ?? normalizeLiveListResponse<unknown>([], cls);
    return {
      ...baseEnv,
      cursor: {},
      items: allItems,
      pageSize: allItems.length,
      totalCountExact:
        firstEnv?.totalCountExact === false || lastEnv?.totalCountExact === false
          ? false
          : baseEnv.totalCountExact,
      estimatedTotal:
        typeof baseEnv.estimatedTotal === "number"
          ? Math.max(baseEnv.estimatedTotal, allItems.length)
          : allItems.length,
      meta: lastEnv?.meta ?? firstEnv?.meta,
    };
  };
}

export function normalizeAlertListResponse(payload: unknown, cls: ListClass = "realtimeFeed"): ListEnvelope<Alert> {
  const env = normalizeLiveListResponse<Alert>(payload, cls);
  return {
    ...env,
    items: env.items.map((row) => normalizeAlertTimestampFields(row) as Alert),
  };
}

export function normalizeIncidentListResponse(payload: unknown, cls: ListClass = "governanceQueue"): ListEnvelope<Incident> {
  const env = normalizeLiveListResponse<Incident>(payload, cls);
  return {
    ...env,
    items: env.items.map((row) => normalizeIncidentTimestampFields(row) as Incident),
  };
}

function strictLiveAlertListLoader(
  path: string,
  cls: ListClass = "realtimeFeed",
): () => Promise<ListEnvelope<Alert>> {
  return async () => {
    const data = await bffFetch<unknown>({ method: "GET", path });
    return normalizeAlertListResponse(data, cls);
  };
}

export function normalizeRuntimeListResponse(payload: unknown, cls: ListClass = "entityRegistry"): ListEnvelope<RuntimeListItem> {
  const env = normalizeLiveListResponse<unknown>(payload, cls);
  return {
    ...env,
    items: env.items
      .map(adaptRuntimeRow)
      .filter((row): row is RuntimeListItem => row !== null),
  };
}

function strictLiveRuntimeListLoader(
  path: string,
  cls: ListClass = "entityRegistry",
): () => Promise<ListEnvelope<RuntimeListItem>> {
  return strictLivePaginatedListLoader<RuntimeListItem>(
    path,
    cls,
    (item, index) => adaptRuntimeRow(item, index) ?? undefined,
  );
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
 *  live adapters. */
export const lists = {
  strategies:      strictLiveStrategyListLoader(LIST_CLASS_BY_KEY.strategies, normalizeBaseObjectFields),
  personas:        strictLivePaginatedListLoader(paths.personas(),    LIST_CLASS_BY_KEY.personas, normalizeBaseObjectFields),
  capitalPools:    strictLivePaginatedListLoader(paths.capitalPools(), LIST_CLASS_BY_KEY.capitalPools, normalizeCapitalPool),
  rankingFormulas: strictLiveListLoader(paths.rankingFormulas(),    LIST_CLASS_BY_KEY.rankingFormulas, normalizeBaseObjectFields),
  rebalances:      strictLiveListLoader(paths.rebalances(),         LIST_CLASS_BY_KEY.rebalances, normalizeBaseObjectFields),
  deployments:     strictLivePaginatedListLoader(paths.deployments(), LIST_CLASS_BY_KEY.deployments, normalizeDeploymentFields),
  evolution:       strictLiveListLoader(paths.evolutionPrograms(),  LIST_CLASS_BY_KEY.evolution, normalizeEvolutionProgram),
  research:        strictLiveListLoader(paths.researchTasks(),      LIST_CLASS_BY_KEY.research, normalizeResearchTask),
  artifacts:       strictLivePaginatedListLoader(
    paths.artifacts(),
    LIST_CLASS_BY_KEY.artifacts,
    normalizeArtifactFields,
    ARTIFACT_PAGINATED_LIST_PAGE_SIZE,
  ),
  tools:           strictLiveListLoader(paths.tools(),              LIST_CLASS_BY_KEY.tools, normalizeBaseObjectFields),
  mcpServers:      strictLiveListLoader(paths.mcpServers(),         LIST_CLASS_BY_KEY.mcpServers, normalizeBaseObjectFields),
  mcpTools:        strictLiveListLoader(paths.mcpTools(),           LIST_CLASS_BY_KEY.mcpTools, normalizeBaseObjectFields),
  skills:          strictLiveListLoader(paths.skills(),             LIST_CLASS_BY_KEY.skills, normalizeBaseObjectFields),
  channels:        strictLiveListLoader(paths.channels(),           LIST_CLASS_BY_KEY.channels, normalizeBaseObjectFields),
  jobs:            strictLivePagedQueryListLoader(paths.jobs(),     LIST_CLASS_BY_KEY.jobs, normalizeJobFields),
  runtimes:        strictLiveRuntimeListLoader(paths.runtimes(),    LIST_CLASS_BY_KEY.runtimes),
  alerts:          strictLiveAlertListLoader(paths.alerts(),        LIST_CLASS_BY_KEY.alerts),
  incidents:       strictLivePagedQueryListLoader<Incident>(paths.incidents(), LIST_CLASS_BY_KEY.incidents, undefined, normalizeIncidentListResponse),
  approvals:       strictLiveListLoader(paths.approvals(),          LIST_CLASS_BY_KEY.approvals, normalizeBaseObjectFields),
  audit:           strictLiveListLoader(paths.audit(),              LIST_CLASS_BY_KEY.audit, normalizeBaseObjectFields),
} as const satisfies Record<string, () => Promise<ListEnvelope<unknown>>>;

export type ListKey = keyof typeof lists;
