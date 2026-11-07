import { bffFetch, type BffRequest } from "./client";
import type { Runtime } from "./dto";
import { BffError, isAbortError, makeBffError } from "./errors";
import { normalizeAlertTimestampFields } from "./eventTimestamps";
import { liveStatus } from "./liveStatus";

export const delay = <T>(v: T, ms = 220): Promise<T> => new Promise<T>((r) => setTimeout(() => r(v), ms));

export type UnknownRecord = Record<string, unknown>;

export const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : undefined;

export const firstArray = <T>(...values: unknown[]): T[] => {
  for (const value of values) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
};

export const liveItemsFrom = <T>(body: unknown): T[] => {
  if (Array.isArray(body)) return body as T[];
  const record = asRecord(body);
  const data = asRecord(record?.data);
  return firstArray<T>(
    record?.items,
    record?.data,
    data?.items,
    record?.alerts,
    record?.approvals,
    record?.artifacts,
    record?.channels,
    record?.events,
    record?.incidents,
    record?.jobs,
    record?.mcp_servers,
    record?.mcpServers,
    record?.mcp_tools,
    record?.mcpTools,
    record?.results,
    record?.runtimes,
    record?.search_results,
    record?.skills,
    record?.tools,
  );
};

export const liveDetailFrom = <T>(body: unknown): T | undefined => {
  const record = asRecord(body);
  if (!record) return undefined;
  if (!Object.prototype.hasOwnProperty.call(record, "data")) return body as T;
  const data = record.data;
  if (data === null || data === undefined) return undefined;
  return (asRecord(data) ?? data) as T;
};

export const detailPath = (basePath: string, id: string): string => `${basePath}/${encodeURIComponent(id)}`;

export async function strictLiveRead<T>(
  helperName: string,
  req: BffRequest,
  adaptLive: (body: unknown) => T = (body) => (asRecord(body)?.data ?? body) as T,
): Promise<T> {
  try {
    const data = await bffFetch<unknown>(req);
    liveStatus.reportSuccess();
    return adaptLive(data);
  } catch (err) {
    // Caller cancellation (unmount, query cancel) is not a transport failure.
    if (isAbortError(err, req.signal)) throw err;
    if (err instanceof BffError && err.status < 500 && err.status !== 0) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : "live transport failed";
    liveStatus.reportFallback(`strict: ${reason}`);
    if (err instanceof BffError) throw err;
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: `${helperName} live transport failed (strict mode): ${reason}`,
    });
  }
}

export const strictLiveList = <T>(
  helperName: string,
  path: string,
  adaptLive?: (body: unknown) => T[],
): Promise<T[]> =>
  strictLiveRead<T[]>(helperName, { method: "GET", path }, adaptLive ?? liveItemsFrom<T>);

export const strictLiveDetail = <T>(
  helperName: string,
  path: string,
  adaptLive?: (body: unknown) => T | undefined,
): Promise<T | undefined> =>
  strictLiveRead<T | undefined>(helperName, { method: "GET", path }, adaptLive ?? liveDetailFrom<T>);

export const recordString = (record: UnknownRecord | undefined, ...keys: string[]): string | undefined => {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
};

const BASE_OBJECT_FIELD_ALIASES: Record<string, string[]> = {
  id: ["id", "plan_id", "strategy_id", "persona_id", "experiment_id", "artifact_id", "pool_id", "channel_id", "incident_id"],
  name: ["name", "display_name", "displayName", "title", "label", "experiment_name", "plan_name", "pool_name", "plan_id", "strategy_id", "persona_id"],
  owner: ["owner", "owner_id", "ownerId", "owned_by", "created_by"],
  updatedAt: ["updatedAt", "updated_at", "last_updated_at", "lastUpdatedAt", "created_at"],
  state: ["state", "status", "lifecycle_state", "lifecycleState", "lifecycle_status", "lifecycleStatus"],
  risk: ["risk", "risk_level", "riskLevel"],
};

export function normalizeBaseObjectFields<T>(raw: T | undefined): T | undefined {
  const record = asRecord(raw);
  if (!record) return raw;
  const patched: UnknownRecord = { ...record };
  for (const [canonical, aliases] of Object.entries(BASE_OBJECT_FIELD_ALIASES)) {
    const current = patched[canonical];
    if (typeof current === "string" && current.trim()) continue;
    const value = recordString(record, ...aliases);
    if (value !== undefined) patched[canonical] = value;
  }
  return patched as T;
}

const ARTIFACT_FIELD_ALIASES: Record<string, string[]> = {
  kind: ["kind", "artifact_type", "type"],
  sourceExperimentId: ["sourceExperimentId", "produced_by_experiment_id", "source_experiment_id"],
};

const recordFiniteNumber = (record: UnknownRecord | undefined, ...keys: string[]): number | undefined => {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

export function normalizeArtifactFields<T>(raw: T | undefined): T | undefined {
  const inputRecord = asRecord(raw);
  if (!inputRecord) return raw;
  const base = normalizeBaseObjectFields(raw);
  const record = asRecord(base) ?? inputRecord;
  const patched: UnknownRecord = { ...record };

  const savedOutput = asRecord(inputRecord.saved_output);
  const researchLinkage = asRecord(inputRecord.research_linkage);
  const evalSummary = asRecord(inputRecord.evaluation_summary);
  const runRecord = asRecord(inputRecord.run);

  const id = recordString(inputRecord, "id", "registry_id", "artifact_id", "plan_id", "experiment_id");
  if (id !== undefined) {
    patched.id = id;
  }

  const name = recordString(inputRecord, "name", "title", "label", "strategy_id", "artifact_id", "id");
  if (name !== undefined && !(typeof patched.name === "string" && patched.name.trim())) {
    patched.name = name;
  }

  const sourceKind = recordString(inputRecord, "source_kind", "sourceKind");
  if (sourceKind !== undefined) {
    patched.source_kind = sourceKind;
    patched.sourceKind = sourceKind;
  }

  for (const [canonical, aliases] of Object.entries(ARTIFACT_FIELD_ALIASES)) {
    const current = patched[canonical];
    if (typeof current === "string" && current.trim()) continue;
    const value = recordString(inputRecord, ...aliases);
    if (value !== undefined) patched[canonical] = value;
  }

  if (!(typeof patched.kind === "string" && patched.kind.trim())) {
    const fallbackKind = recordString(savedOutput, "artifact_family", "stage_type");
    if (fallbackKind !== undefined) patched.kind = fallbackKind;
  }

  if (!(typeof patched.sourceExperimentId === "string" && patched.sourceExperimentId.trim())) {
    const fallbackExperimentId =
      recordString(researchLinkage, "task_id", "run_id") ??
      recordString(savedOutput, "task_id", "run_id");
    if (fallbackExperimentId !== undefined) {
      patched.sourceExperimentId = fallbackExperimentId;
    }
  }

  const explicitVersion = recordString(inputRecord, "version", "artifact_version");
  if (explicitVersion !== undefined) {
    patched.version = explicitVersion;
  } else if (
    (Object.prototype.hasOwnProperty.call(inputRecord, "version") && inputRecord.version === null) ||
    sourceKind === "research_run_output"
  ) {
    patched.version = null;
  }

  const explicitState = recordString(inputRecord, "state", "artifact_state");
  if (explicitState !== undefined) {
    patched.state = explicitState;
  } else if (
    (Object.prototype.hasOwnProperty.call(inputRecord, "state") && inputRecord.state === null) ||
    sourceKind === "research_run_output"
  ) {
    patched.state = null;
  } else if (!(typeof patched.state === "string" && patched.state.trim())) {
    const fallbackState = recordString(inputRecord, "status", "lifecycle_state", "lifecycleState");
    if (fallbackState !== undefined) patched.state = fallbackState;
  }

  const explicitRisk =
    recordString(inputRecord, "risk", "risk_level", "riskLevel") ??
    recordString(evalSummary, "risk_level", "riskLevel", "risk");
  if (explicitRisk !== undefined) {
    patched.risk = explicitRisk;
  } else if (
    (Object.prototype.hasOwnProperty.call(inputRecord, "risk") && inputRecord.risk === null) ||
    sourceKind === "research_run_output"
  ) {
    patched.risk = null;
  }

  const hash =
    recordString(inputRecord, "hash", "checksum", "artifact_digest", "digest") ??
    recordString(savedOutput, "checksum", "hash", "digest") ??
    recordString(runRecord, "artifact_digest", "checksum", "hash");
  if (hash !== undefined) {
    patched.hash = hash;
  }

  const owner = recordString(
    inputRecord,
    "owner",
    "approver",
    "author",
    "created_by",
    "owner_id",
    "ownerId",
    "owned_by",
    "owner_tenant",
  );
  if (owner !== undefined) {
    patched.owner = owner;
  } else if (Object.prototype.hasOwnProperty.call(inputRecord, "owner") && inputRecord.owner === null) {
    patched.owner = null;
  }

  if (!(typeof patched.updatedAt === "string" && patched.updatedAt.trim())) {
    const updatedAt =
      recordString(
        inputRecord,
        "updatedAt",
        "updated_at",
        "approved_at",
        "created_at",
        "last_updated_at",
        "lastUpdatedAt",
      ) ?? recordString(savedOutput, "completed_at", "updated_at", "created_at");
    if (updatedAt !== undefined) {
      patched.updatedAt = updatedAt;
    }
  }

  const sizeMb = recordFiniteNumber(inputRecord, "sizeMb", "size_mb");
  if (sizeMb !== undefined) {
    patched.sizeMb = sizeMb;
  } else if (
    (Object.prototype.hasOwnProperty.call(inputRecord, "sizeMb") && inputRecord.sizeMb === null) ||
    (Object.prototype.hasOwnProperty.call(inputRecord, "size_mb") && inputRecord.size_mb === null)
  ) {
    patched.sizeMb = null;
  }

  const format = recordString(inputRecord, "format", "artifact_format");
  if (format !== undefined) {
    patched.format = format;
  } else if (
    (Object.prototype.hasOwnProperty.call(inputRecord, "format") && inputRecord.format === null) ||
    (Object.prototype.hasOwnProperty.call(inputRecord, "artifact_format") && inputRecord.artifact_format === null)
  ) {
    patched.format = null;
  }

  return patched as T;
}

export function normalizeArtifactList<T>(rows: T[]): T[] {
  return rows.map((row) => normalizeArtifactFields(row) as T);
}

export const strictLiveDetailArtifact = <T>(
  helperName: string,
  path: string,
): Promise<T | undefined> =>
  strictLiveDetail<T>(helperName, path).then(normalizeArtifactFields);

const ARTIFACT_LIST_PAGE_SIZE = 100;
export const MAX_PAGINATED_LIST_PAGES = 100;
export const PAGINATED_LIST_PAGE_SIZE = 200;

export const nextListPageToken = (body: unknown): string | undefined => {
  const record = asRecord(body);
  const data = asRecord(record?.data);
  const meta = asRecord(record?.meta);
  const cursor = asRecord(record?.cursor) ?? asRecord(data?.cursor) ?? asRecord(meta?.cursor);
  const pageInfo = asRecord(record?.page_info) ?? asRecord(data?.page_info) ?? asRecord(meta?.page_info);
  const token =
    recordString(cursor, "next", "next_cursor") ??
    recordString(pageInfo, "next_cursor", "next_page_token");
  return token?.trim() || undefined;
};

export interface PaginatedPagesOptions<T> {
  helperName: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  pageSize?: number;
  maxPages?: number;
  fetchPage?: (req: BffRequest) => Promise<unknown>;
  extractPageItems: (rawPage: unknown) => T[];
  extractNextToken?: (rawPage: unknown) => string | undefined;
  onPage?: (rawPage: unknown, pageIndex: number) => void;
}

export async function collectPaginatedListPages<T>(
  options: PaginatedPagesOptions<T>,
): Promise<T[]> {
  const {
    helperName,
    path,
    query,
    pageSize = PAGINATED_LIST_PAGE_SIZE,
    maxPages = MAX_PAGINATED_LIST_PAGES,
    fetchPage = (req) => strictLiveRead<unknown>(helperName, req, (body) => body),
    extractPageItems,
    extractNextToken = nextListPageToken,
    onPage,
  } = options;

  const allItems: T[] = [];
  const seenIds = new Set<string>();
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const rawBody = await fetchPage({
      method: "GET",
      path,
      query: {
        ...query,
        page_size: pageSize,
        ...(pageToken ? { page_token: pageToken } : {}),
      },
    });
    onPage?.(rawBody, page);
    const pageItems = extractPageItems(rawBody);
    for (const item of pageItems) {
      const itemRecord = asRecord(item);
      const itemId = recordString(itemRecord, "id")?.trim();
      if (itemId) {
        if (seenIds.has(itemId)) continue;
        seenIds.add(itemId);
      }
      allItems.push(item);
    }
    const nextToken = extractNextToken(rawBody)?.trim() || undefined;
    if (!nextToken) {
      break;
    }
    const paginationErrorMessage = seenTokens.has(nextToken)
      ? `${helperName} encountered repeated next_page_token="${nextToken}" for ${path}`
      : page + 1 >= maxPages
        ? `${helperName} reached pagination cap (${maxPages} pages) for ${path} with next_page_token="${nextToken}" still present`
        : undefined;
    if (paginationErrorMessage) {
      liveStatus.reportFallback(`strict: ${paginationErrorMessage}`);
      throw makeBffError({
        code: "BACKEND_UNAVAILABLE",
        message: paginationErrorMessage,
      });
    }
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }

  return allItems;
}

export const strictLivePaginatedList = <T>(
  helperName: string,
  path: string,
  adaptLive?: (body: unknown) => T[],
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    pageSize?: number;
    maxPages?: number;
  },
): Promise<T[]> =>
  collectPaginatedListPages<T>({
    helperName,
    path,
    query: options?.query,
    pageSize: options?.pageSize,
    maxPages: options?.maxPages,
    extractPageItems: adaptLive ?? liveItemsFrom<T>,
  });

export const strictLiveListArtifact = async <T>(
  helperName: string,
  path: string,
): Promise<T[]> =>
  strictLivePaginatedList<T>(
    helperName,
    path,
    (rawBody) => normalizeArtifactList(liveItemsFrom<T>(rawBody)),
    { pageSize: ARTIFACT_LIST_PAGE_SIZE, maxPages: MAX_PAGINATED_LIST_PAGES },
  );

export function normalizeBaseObjectList<T>(rows: T[]): T[] {
  return rows.map((row) => normalizeBaseObjectFields(row) as T);
}

const DEPLOYMENT_FIELD_ALIASES: Record<string, string[]> = {
  target: ["target", "target_stage", "current_stage"],
  artifactId: ["artifactId", "artifact_id"],
  version: ["version", "artifact_version"],
  strategyId: ["strategyId", "strategy_id"],
  planId: ["planId", "plan_id", "id"],
  sponsorPersonaId: ["sponsorPersonaId", "sponsor_persona_id"],
};

export function normalizeDeploymentFields<T>(raw: T | undefined): T | undefined {
  const inputRecord = asRecord(raw);
  if (!inputRecord) return raw;
  const base = normalizeBaseObjectFields(raw);
  const record = asRecord(base) ?? inputRecord;
  const patched: UnknownRecord = { ...record };
  const id = recordString(inputRecord, "id", "plan_id", "planId", "deployment_id");
  if (id !== undefined) {
    patched.id = id;
  }
  const name = recordString(
    inputRecord,
    "name",
    "display_name",
    "displayName",
    "title",
    "label",
    "plan_name",
    "plan_id",
    "planId",
    "id",
  );
  if (name !== undefined) {
    patched.name = name;
  }
  for (const [canonical, aliases] of Object.entries(DEPLOYMENT_FIELD_ALIASES)) {
    const current = patched[canonical];
    if (typeof current === "string" && current.trim()) continue;
    const value = recordString(inputRecord, ...aliases);
    if (value !== undefined) patched[canonical] = value;
  }
  return patched as T;
}

export function normalizeDeploymentList<T>(rows: T[]): T[] {
  return rows.map((row) => normalizeDeploymentFields(row) as T);
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

export const stringFrom = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
};

export const numberFrom = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
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

export function adaptRuntimeRow(value: unknown, index: number): RuntimeListItem | null {
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

export const strictLiveDetailNormalized = <T>(
  helperName: string,
  path: string,
): Promise<T | undefined> =>
  strictLiveDetail<T>(helperName, path).then(normalizeBaseObjectFields);

export const strictLiveListNormalized = <T>(
  helperName: string,
  path: string,
): Promise<T[]> =>
  strictLiveList<T>(helperName, path).then(normalizeBaseObjectList);

export const strictLivePaginatedListNormalized = <T>(
  helperName: string,
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    pageSize?: number;
    maxPages?: number;
  },
): Promise<T[]> =>
  strictLivePaginatedList<T>(
    helperName,
    path,
    (body) => normalizeBaseObjectList(liveItemsFrom<T>(body)),
    options,
  );

export function getAlertsTimeoutFallbackSurface(payload: unknown): UnknownRecord | undefined {
  const record = asRecord(payload);
  if (!record) return undefined;
  const meta = asRecord(record.meta) ?? record;
  const surfaces = asRecord(meta.surfaces);
  const alertsSurface = asRecord(surfaces?.alerts);
  if (!alertsSurface) return undefined;
  const source = stringFrom(alertsSurface.source)?.toLowerCase();
  return source === "timeout_fallback" ? alertsSurface : undefined;
}

export function isAlertsTimeoutFallback(payload: unknown): boolean {
  return getAlertsTimeoutFallbackSurface(payload) !== undefined;
}

export function assertAlertsNotTimeoutFallback(payload: unknown): void {
  const surface = getAlertsTimeoutFallbackSurface(payload);
  if (!surface) return;
  const message =
    stringFrom(surface.message) ??
    "Alert aggregation timed out under concurrent read fanout; degraded empty response returned.";
  throw makeBffError({
    code: "BACKEND_UNAVAILABLE",
    message,
    status: 503,
    details: surface,
  });
}

export function normalizeAlertFields<T>(raw: T | undefined): T | undefined {
  const base = normalizeAlertTimestampFields(raw);
  const record = asRecord(base);
  if (!record) return base;
  const patched: UnknownRecord = { ...record };

  const source = stringFrom(patched.source, record.category);
  if (source !== undefined) {
    patched.source = source;
  }

  if (!stringFrom(patched.openedAt)) {
    const raisedAt = stringFrom(record.raisedAt, record.raised_at);
    if (raisedAt && !Number.isNaN(Date.parse(raisedAt))) {
      patched.openedAt = raisedAt;
    }
  }

  const targetRefRecord = asRecord(record.target_ref) ?? asRecord(record.targetRef);
  const relatedTarget = stringFrom(
    patched.relatedTarget,
    record.related_target,
    targetRefRecord?.target_id,
    targetRefRecord?.targetId,
    typeof record.target_ref === "string" ? record.target_ref : undefined,
  );
  if (relatedTarget !== undefined) {
    patched.relatedTarget = relatedTarget;
  }

  if (typeof patched.acknowledged !== "boolean") {
    patched.acknowledged = false;
  }

  return patched as T;
}

export function normalizeAlertList<T>(rows: T[]): T[] {
  return rows.map((row) => normalizeAlertFields(row) as T);
}
