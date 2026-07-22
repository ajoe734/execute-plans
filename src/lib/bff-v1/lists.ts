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

import * as seed from "@/mocks/seed";
import type { Alert, Incident, Runtime } from "@/lib/bff/types";
import type { ListEnvelope } from "./dto";
import { withLiveOrMock } from "./liveTransport";
import { paths } from "./paths";
import {
  normalizeAlertTimestampFields,
  normalizeIncidentTimestampFields,
} from "./eventTimestamps";
import { normalizeCapitalPool } from "./capitalPools";
import { normalizeBaseObjectFields } from "./seed";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstArray<T>(...values: unknown[]): T[] {
  for (const value of values) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function numberFrom(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringFrom(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function cursorFrom(payload: Record<string, unknown> | null): ListEnvelope<unknown>["cursor"] {
  const direct = asRecord(payload?.cursor);
  const pageInfo = asRecord(payload?.page_info ?? payload?.pageInfo);
  return {
    next: String(direct?.next ?? pageInfo?.next_page_token ?? pageInfo?.nextPageToken ?? "").trim() || undefined,
    prev: String(direct?.prev ?? pageInfo?.prev_page_token ?? pageInfo?.prevPageToken ?? "").trim() || undefined,
  };
}

export function normalizeLiveListResponse<T>(payload: unknown, cls: ListClass): ListEnvelope<T> {
  const record = asRecord(payload);
  const data = record ? record.data : undefined;
  const dataRecord = asRecord(data);
  const pageInfo = asRecord(record?.page_info ?? record?.pageInfo);
  const meta = asRecord(record?.meta);
  const items = firstArray<T>(
    payload,
    record?.items,
    data,
    dataRecord?.items,
    record?.alerts,
    dataRecord?.alerts,
    record?.incidents,
    dataRecord?.incidents,
    record?.events,
    dataRecord?.events,
    record?.jobs,
    dataRecord?.jobs,
  );
  const pageSize = numberFrom(record?.pageSize, record?.page_size, pageInfo?.page_size, pageInfo?.pageSize) ?? items.length;
  const estimatedTotal = numberFrom(record?.estimatedTotal, record?.estimated_total, record?.count, pageInfo?.total, meta?.total);

  const rule = LIST_CLASS_RULES[cls];
  const out: ListEnvelope<T> = {
    items,
    cursor: cursorFrom(record),
    pageSize,
    totalCountExact: typeof record?.totalCountExact === "boolean" ? record.totalCountExact : rule.totalCountExact,
  };
  if (meta) out.meta = meta;
  if (rule.emitEstimatedTotal) out.estimatedTotal = estimatedTotal ?? items.length;
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
  adaptItem?: (value: unknown) => T | undefined,
): () => Promise<ListEnvelope<T>> {
  const adaptItems = (items: unknown[]): T[] => adaptItem
    ? items.map((item) => adaptItem(item)).filter((item): item is T => Boolean(item))
    : items as T[];
  const mockFn = async (): Promise<ListEnvelope<T>> => envelope(adaptItems(await loader()), cls);
  return () =>
    withLiveOrMock<ListEnvelope<T>, unknown>(
      { method: "GET", path },
      mockFn,
      (data) => {
        const env = normalizeLiveListResponse<unknown>(data, cls);
        const items = adaptItems(env.items);
        return {
          ...env,
          items,
          pageSize: items.length,
        };
      },
    );
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

function liveOrMockAlertList(
  path: string,
  loader: () => Promise<Alert[]>,
  cls: ListClass,
): () => Promise<ListEnvelope<Alert>> {
  const mockFn = async (): Promise<ListEnvelope<Alert>> => envelope(await loader(), cls);
  return () =>
    withLiveOrMock<ListEnvelope<Alert>, unknown>(
      { method: "GET", path },
      mockFn,
      (data) => normalizeAlertListResponse(data, cls),
    );
}

function liveOrMockIncidentList(
  path: string,
  loader: () => Promise<Incident[]>,
  cls: ListClass,
): () => Promise<ListEnvelope<Incident>> {
  const mockFn = async (): Promise<ListEnvelope<Incident>> => envelope(await loader(), cls);
  return () =>
    withLiveOrMock<ListEnvelope<Incident>, unknown>(
      { method: "GET", path },
      mockFn,
      (data) => normalizeIncidentListResponse(data, cls),
    );
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

function liveOrMockRuntimeList(
  path: string,
  loader: () => Promise<Runtime[]>,
  cls: ListClass,
): () => Promise<ListEnvelope<RuntimeListItem>> {
  const mockFn = async (): Promise<ListEnvelope<RuntimeListItem>> => envelope(await loader(), cls);
  return () =>
    withLiveOrMock<ListEnvelope<RuntimeListItem>, unknown>(
      { method: "GET", path },
      mockFn,
      (data) => normalizeRuntimeListResponse(data, cls),
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
 *  live adapters; mock fallback is governed by liveTransport's `auto` /
 *  `strict` fallback mode (VITE_BFF_FALLBACK). */
export const lists = {
  strategies:      liveOrMockList(paths.strategies(),         async () => seed.strategies,           LIST_CLASS_BY_KEY.strategies, normalizeBaseObjectFields),
  personas:        liveOrMockList(paths.personas(),           async () => seed.personas,             LIST_CLASS_BY_KEY.personas, normalizeBaseObjectFields),
  capitalPools:    liveOrMockList(paths.capitalPools(),       async () => seed.capitalPools,         LIST_CLASS_BY_KEY.capitalPools, normalizeCapitalPool),
  rankingFormulas: liveOrMockList(paths.rankingFormulas(),    async () => seed.rankingFormulas,      LIST_CLASS_BY_KEY.rankingFormulas, normalizeBaseObjectFields),
  rebalances:      liveOrMockList(paths.rebalances(),         async () => seed.rebalances,           LIST_CLASS_BY_KEY.rebalances, normalizeBaseObjectFields),
  deployments:     liveOrMockList(paths.deployments(),        async () => seed.deployments,          LIST_CLASS_BY_KEY.deployments, normalizeBaseObjectFields),
  evolution:       liveOrMockList(paths.evolutionPrograms(),  async () => seed.evolutionPrograms,    LIST_CLASS_BY_KEY.evolution, normalizeBaseObjectFields),
  research:        liveOrMockList(paths.researchExperiments(),async () => seed.researchExperiments,  LIST_CLASS_BY_KEY.research, normalizeBaseObjectFields),
  artifacts:       liveOrMockList(paths.artifacts(),          async () => seed.artifacts,            LIST_CLASS_BY_KEY.artifacts),
  tools:           liveOrMockList(paths.tools(),              async () => seed.tools,                LIST_CLASS_BY_KEY.tools, normalizeBaseObjectFields),
  mcpServers:      liveOrMockList(paths.mcpServers(),         async () => seed.mcpServers,           LIST_CLASS_BY_KEY.mcpServers, normalizeBaseObjectFields),
  mcpTools:        liveOrMockList(paths.mcpTools(),           async () => seed.mcpTools,             LIST_CLASS_BY_KEY.mcpTools, normalizeBaseObjectFields),
  skills:          liveOrMockList(paths.skills(),             async () => seed.skills,               LIST_CLASS_BY_KEY.skills, normalizeBaseObjectFields),
  channels:        liveOrMockList(paths.channels(),           async () => seed.channels,             LIST_CLASS_BY_KEY.channels, normalizeBaseObjectFields),
  jobs:            liveOrMockList(paths.jobs(),               async () => seed.jobs,                 LIST_CLASS_BY_KEY.jobs),
  runtimes:        liveOrMockRuntimeList(paths.runtimes(),    async () => seed.runtimes,             LIST_CLASS_BY_KEY.runtimes),
  alerts:          liveOrMockAlertList(paths.alerts(),        async () => seed.alerts,               LIST_CLASS_BY_KEY.alerts),
  incidents:       liveOrMockIncidentList(paths.incidents(),  async () => seed.incidents,            LIST_CLASS_BY_KEY.incidents),
  approvals:       liveOrMockList(paths.approvals(),          async () => seed.approvals,            LIST_CLASS_BY_KEY.approvals, normalizeBaseObjectFields),
  audit:           liveOrMockList(paths.audit(),              async () => seed.auditEvents,          LIST_CLASS_BY_KEY.audit, normalizeBaseObjectFields),
} as const satisfies Record<string, () => Promise<ListEnvelope<unknown>>>;

export type ListKey = keyof typeof lists;
