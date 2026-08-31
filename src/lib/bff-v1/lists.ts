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

import type { Alert, Incident, Runtime } from "./dto";
import type { ListEnvelope } from "./dto";
import { bffFetch } from "./client";
import { paths } from "./paths";
import {
  normalizeAlertTimestampFields,
  normalizeIncidentTimestampFields,
} from "./eventTimestamps";
import { normalizeCapitalPool } from "./capitalPools";
import { normalizeBaseObjectFields } from "./domainReads";

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

const stringFrom = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
};

const numberFrom = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

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
    data?.totalCountExact,
    data?.total_count_exact,
    meta?.totalCountExact,
    meta?.total_count_exact,
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

  if (totalCountExact) {
    if (explicitTotal !== undefined) {
      out.total = explicitTotal;
    }
  }

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

function strictLiveIncidentListLoader(
  path: string,
  cls: ListClass = "governanceQueue",
): () => Promise<ListEnvelope<Incident>> {
  return async () => {
    const data = await bffFetch<unknown>({ method: "GET", path });
    return normalizeIncidentListResponse(data, cls);
  };
}

export type RuntimeListItem = Runtime & {
  runtimeId?: string;
  runtime_id?: string;
  runtimeBindingId?: string;
  runtime_binding_id?: string;
  personaId?: string;
  persona_id?: string;
  artifactId?: string;
  artifact_id?: string;
  planId?: string;
  plan_id?: string;
  runtimeKind?: string;
  runtime_kind?: string;
  deploymentStage?: string;
  deployment_stage?: string;
};

const runtimeRatioFrom = (...values: unknown[]): number => {
  const value = numberFrom(...values);
  if (value === undefined) return Number.NaN;
  return value > 1 && value <= 100 ? value / 100 : value;
};

const runtimePercentFrom = (...values: unknown[]): number => {
  const value = numberFrom(...values);
  if (value === undefined) return Number.NaN;
  return value >= 0 && value <= 1 ? value * 100 : value;
};

function normalizeRuntimeEnv(value: unknown): Runtime["env"] {
  const raw = stringFrom(value)?.toLowerCase();
  if (raw === "live" || raw === "paper" || raw === "research") return raw;
  return "" as Runtime["env"];
}

function normalizeRuntimeKind(value: unknown): Runtime["kind"] {
  const raw = stringFrom(value)?.toLowerCase();
  if (raw === "executor" || raw === "mcp" || raw === "scheduler" || raw === "ingest") return raw;
  return (raw ?? "") as Runtime["kind"];
}

function adaptRuntimeRow(value: unknown, index: number): RuntimeListItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const metadata = asRecord(row.metadata);
  const runtimeId = stringFrom(row.runtimeId, row.runtime_id, row.runtime, row.runtime_name);
  const runtimeBindingId = stringFrom(row.runtimeBindingId, row.runtime_binding_id, row.bindingId, row.binding_id, row.id);
  const id = runtimeId ?? runtimeBindingId ?? stringFrom(row.id) ?? `runtime-${index + 1}`;
  const name = stringFrom(row.name, row.displayName, row.display_name, runtimeId, runtimeBindingId) ?? id;
  const personaId = stringFrom(row.personaId, row.persona_id, metadata?.personaId, metadata?.persona_id);
  const artifactId = stringFrom(row.artifactId, row.artifact_id);
  const planId = stringFrom(row.planId, row.plan_id, row.deploymentPlanId, row.deployment_plan_id);
  const runtimeKind = stringFrom(row.kind, row.runtimeKind, row.runtime_kind, row.deploymentMode, row.deployment_mode);
  const env = normalizeRuntimeEnv(row.env ?? row.executionMode ?? row.execution_mode ?? row.deploymentStage ?? row.deployment_stage ?? row.deploymentMode ?? row.deployment_mode);

  return {
    ...(row as Partial<RuntimeListItem>),
    id,
    name,
    kind: normalizeRuntimeKind(runtimeKind),
    env,
    status: (stringFrom(row.status, row.state) ?? "") as Runtime["status"],
    cpu: runtimeRatioFrom(row.cpu, row.cpuPct, row.cpu_pct, row.cpuUtilization, row.cpu_utilization),
    memory: runtimeRatioFrom(row.memory, row.mem, row.memoryPct, row.memory_pct, row.memoryUtilization, row.memory_utilization),
    latencyP95Ms: numberFrom(row.latencyP95Ms, row.latency_p95_ms, row.p95LatencyMs, row.p95_latency_ms) ?? Number.NaN,
    uptimePct: runtimePercentFrom(row.uptimePct, row.uptime_pct, row.uptimePercent, row.uptime_percent),
    region: stringFrom(row.region, row.zone, row.cluster, row.tenantId, row.tenant_id) ?? "",
    updatedAt: stringFrom(row.updatedAt, row.updated_at, row.effectiveAt, row.effective_at, row.createdAt, row.created_at) ?? "",
    runtimeId,
    runtime_id: runtimeId,
    runtimeBindingId,
    runtime_binding_id: runtimeBindingId,
    personaId,
    persona_id: personaId,
    artifactId,
    artifact_id: artifactId,
    planId,
    plan_id: planId,
    runtimeKind,
    runtime_kind: runtimeKind,
    deploymentStage: stringFrom(row.deploymentStage, row.deployment_stage),
    deployment_stage: stringFrom(row.deploymentStage, row.deployment_stage),
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
  return async () => {
    const data = await bffFetch<unknown>({ method: "GET", path });
    return normalizeRuntimeListResponse(data, cls);
  };
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
  strategies:      strictLiveListLoader(paths.strategies(),         LIST_CLASS_BY_KEY.strategies, normalizeBaseObjectFields),
  personas:        strictLiveListLoader(paths.personas(),           LIST_CLASS_BY_KEY.personas, normalizeBaseObjectFields),
  capitalPools:    strictLiveListLoader(paths.capitalPools(),       LIST_CLASS_BY_KEY.capitalPools, normalizeCapitalPool),
  rankingFormulas: strictLiveListLoader(paths.rankingFormulas(),    LIST_CLASS_BY_KEY.rankingFormulas, normalizeBaseObjectFields),
  rebalances:      strictLiveListLoader(paths.rebalances(),         LIST_CLASS_BY_KEY.rebalances, normalizeBaseObjectFields),
  deployments:     strictLiveListLoader(paths.deployments(),        LIST_CLASS_BY_KEY.deployments, normalizeBaseObjectFields),
  evolution:       strictLiveListLoader(paths.evolutionPrograms(),  LIST_CLASS_BY_KEY.evolution, normalizeBaseObjectFields),
  research:        strictLiveListLoader(paths.researchExperiments(),LIST_CLASS_BY_KEY.research, normalizeBaseObjectFields),
  artifacts:       strictLiveListLoader(paths.artifacts(),          LIST_CLASS_BY_KEY.artifacts),
  tools:           strictLiveListLoader(paths.tools(),              LIST_CLASS_BY_KEY.tools, normalizeBaseObjectFields),
  mcpServers:      strictLiveListLoader(paths.mcpServers(),         LIST_CLASS_BY_KEY.mcpServers, normalizeBaseObjectFields),
  mcpTools:        strictLiveListLoader(paths.mcpTools(),           LIST_CLASS_BY_KEY.mcpTools, normalizeBaseObjectFields),
  skills:          strictLiveListLoader(paths.skills(),             LIST_CLASS_BY_KEY.skills, normalizeBaseObjectFields),
  channels:        strictLiveListLoader(paths.channels(),           LIST_CLASS_BY_KEY.channels, normalizeBaseObjectFields),
  jobs:            strictLiveListLoader(paths.jobs(),               LIST_CLASS_BY_KEY.jobs),
  runtimes:        strictLiveRuntimeListLoader(paths.runtimes(),    LIST_CLASS_BY_KEY.runtimes),
  alerts:          strictLiveAlertListLoader(paths.alerts(),        LIST_CLASS_BY_KEY.alerts),
  incidents:       strictLiveIncidentListLoader(paths.incidents(),  LIST_CLASS_BY_KEY.incidents),
  approvals:       strictLiveListLoader(paths.approvals(),          LIST_CLASS_BY_KEY.approvals, normalizeBaseObjectFields),
  audit:           strictLiveListLoader(paths.audit(),              LIST_CLASS_BY_KEY.audit, normalizeBaseObjectFields),
} as const satisfies Record<string, () => Promise<ListEnvelope<unknown>>>;

export type ListKey = keyof typeof lists;
