import { bffFetch, type BffRequest } from "./client";
import { BffError, makeBffError } from "./errors";
import { liveStatus } from "./liveStatus";

export function isLiveBffModeConfigured(): boolean {
  return liveStatus.get().mode === "live";
}

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
  id: ["id", "experiment_id", "artifact_id", "pool_id", "plan_id", "channel_id", "incident_id"],
  name: ["name", "title", "label", "experiment_name", "plan_name", "pool_name"],
  owner: ["owner", "owner_id", "ownerId", "owned_by"],
  updatedAt: ["updatedAt", "updated_at", "last_updated_at", "lastUpdatedAt"],
  state: ["state", "status", "lifecycle_state", "lifecycleState"],
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
  sourceExperimentId: ["sourceExperimentId", "produced_by_experiment_id"],
};

export function normalizeArtifactFields<T>(raw: T | undefined): T | undefined {
  const base = normalizeBaseObjectFields(raw);
  const record = asRecord(base);
  if (!record) return base;
  const patched: UnknownRecord = { ...record };
  for (const [canonical, aliases] of Object.entries(ARTIFACT_FIELD_ALIASES)) {
    const current = patched[canonical];
    if (typeof current === "string" && current.trim()) continue;
    const value = recordString(record, ...aliases);
    if (value !== undefined) patched[canonical] = value;
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

export const strictLiveListArtifact = <T>(
  helperName: string,
  path: string,
): Promise<T[]> =>
  strictLiveList<T>(helperName, path).then(normalizeArtifactList);

export function normalizeBaseObjectList<T>(rows: T[]): T[] {
  return rows.map((row) => normalizeBaseObjectFields(row) as T);
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

