import { bffFetch } from "./client";

type UnknownRecord = Record<string, unknown>;

export type PostmortemStatus = "draft" | "review" | "approved" | "published" | string;

export interface PostmortemRecord {
  /** DataTable identity, projected from the canonical postmortem_id (or legacy report_id). */
  id: string;
  postmortem_id: string;
  incident_id: string;
  title: string;
  status: PostmortemStatus;
  created_at: string;
  published_at?: string;
  binding_id?: string;
  deployment_stage?: string;
  deployment_plan_id?: string;
  capital_pool_id?: string;
  persona_capital_binding_id?: string;
  artifact_id?: string;
  artifact_version?: string;
  runtime_id?: string;
  trace_id?: string;
  telemetry_event_ids?: string[];
  incident_evidence_summary?: string;
  lineage_ref?: string;
  incident_cluster_id?: string | null;
  root_cause: string;
  contributing_factors: string[];
  timeline?: Array<Record<string, unknown>>;
  action_items: string[];
  author_ids: string[];
  linked_evolution_decision_id?: string;
}

export interface PostmortemPageInfo {
  total: number;
  page_size: number;
  next_page_token: string | null;
}

export interface PostmortemListQuery {
  page_size?: number;
  page_token?: string;
  status?: string;
  q?: string;
  time_range?: string;
}

export interface PostmortemSurfaceState {
  status?: string;
  source?: string;
  message?: string;
  reason?: string;
}

export interface PostmortemResponseMeta {
  total?: number;
  snapshot_at?: string;
  staleness?: {
    served_from?: string;
    last_known_at?: string;
    max_age_minutes?: number;
  } | null;
  surfaces?: Record<string, PostmortemSurfaceState>;
}

export interface PostmortemListResult {
  items: PostmortemRecord[];
  page_info?: PostmortemPageInfo;
  meta: PostmortemResponseMeta;
}

export interface PostmortemDetailResult {
  item: PostmortemRecord;
  meta: PostmortemResponseMeta;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

function normalizeMeta(value: unknown): PostmortemResponseMeta {
  const meta = asRecord(value);
  const surfaces = asRecord(meta.surfaces);
  const normalizedSurfaces: Record<string, PostmortemSurfaceState> = {};
  for (const [key, raw] of Object.entries(surfaces)) {
    const state = asRecord(raw);
    normalizedSurfaces[key] = {
      status: asString(state.status) || undefined,
      source: asString(state.source) || undefined,
      message: asString(state.message) || undefined,
      reason: asString(state.reason) || undefined,
    };
  }
  const staleness = asRecord(meta.staleness);
  return {
    total: typeof meta.total === "number" ? meta.total : undefined,
    snapshot_at: asString(meta.snapshot_at) || undefined,
    staleness: Object.keys(staleness).length > 0 ? {
      served_from: asString(staleness.served_from) || undefined,
      last_known_at: asString(staleness.last_known_at) || undefined,
      max_age_minutes: typeof staleness.max_age_minutes === "number"
        ? staleness.max_age_minutes
        : undefined,
    } : null,
    surfaces: normalizedSurfaces,
  };
}

function normalizePageInfo(
  envelope: UnknownRecord,
  itemCount: number,
  requestedPageSize?: number,
): PostmortemPageInfo {
  const pageInfo = asRecord(envelope.page_info);
  const meta = asRecord(envelope.meta);
  const total = typeof pageInfo.total === "number"
    ? pageInfo.total
    : typeof meta.total === "number"
      ? meta.total
      : typeof envelope.total === "number"
        ? envelope.total
        : itemCount;
  const pageSize = typeof pageInfo.page_size === "number"
    ? pageInfo.page_size
    : requestedPageSize ?? Math.max(itemCount, 50);
  const nextPageToken = asString(pageInfo.next_page_token) || null;
  return {
    total,
    page_size: pageSize,
    next_page_token: nextPageToken,
  };
}

function normalizePostmortem(value: unknown, context: string): PostmortemRecord {
  const item = asRecord(value);
  const postmortemId = asString(item.postmortem_id) || asString(item.report_id);
  if (!postmortemId) {
    throw new Error(`${context} is missing canonical postmortem_id or report_id.`);
  }

  return {
    id: postmortemId,
    postmortem_id: postmortemId,
    incident_id: asString(item.incident_id),
    title: asString(item.title) || postmortemId,
    status: asString(item.status) || "unknown",
    created_at: asString(item.created_at),
    published_at: asString(item.published_at) || undefined,
    binding_id: asString(item.binding_id) || undefined,
    deployment_stage: asString(item.deployment_stage) || undefined,
    deployment_plan_id: asString(item.deployment_plan_id) || undefined,
    capital_pool_id: asString(item.capital_pool_id) || undefined,
    persona_capital_binding_id: asString(item.persona_capital_binding_id) || undefined,
    artifact_id: asString(item.artifact_id) || undefined,
    artifact_version: asString(item.artifact_version) || undefined,
    runtime_id: asString(item.runtime_id) || undefined,
    trace_id: asString(item.trace_id) || undefined,
    telemetry_event_ids: Array.isArray(item.telemetry_event_ids)
      ? asStringArray(item.telemetry_event_ids)
      : undefined,
    incident_evidence_summary: asString(item.incident_evidence_summary) || undefined,
    lineage_ref: asString(item.lineage_ref) || undefined,
    incident_cluster_id: item.incident_cluster_id === null
      ? null
      : (asString(item.incident_cluster_id) || undefined),
    root_cause: asString(item.root_cause),
    contributing_factors: asStringArray(item.contributing_factors),
    timeline: Array.isArray(item.timeline)
      ? item.timeline.map(asRecord)
      : undefined,
    action_items: asStringArray(item.action_items),
    author_ids: asStringArray(item.author_ids),
    linked_evolution_decision_id: asString(item.linked_evolution_decision_id) || undefined,
  };
}

function listItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const envelope = asRecord(payload);
  if (Array.isArray(envelope.items)) return envelope.items;
  if (Array.isArray(envelope.data)) return envelope.data;
  throw new Error("Postmortem list response did not contain items or data.");
}

function buildListQuery(
  query?: PostmortemListQuery,
): Record<string, string | number> | undefined {
  if (!query) return undefined;
  const out: Record<string, string | number> = {};
  if (typeof query.page_size === "number" && Number.isFinite(query.page_size)) {
    out.page_size = query.page_size;
  }
  const pageToken = asString(query.page_token);
  if (pageToken) {
    out.page_token = pageToken;
  }
  const status = asString(query.status);
  if (status && status !== "all") {
    out.status = status;
  }
  const q = asString(query.q);
  if (q) {
    out.q = q;
  }
  const timeRange = asString(query.time_range);
  if (timeRange) {
    out.time_range = timeRange;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function listPostmortems(query?: PostmortemListQuery): Promise<PostmortemListResult> {
  const normalizedQuery = buildListQuery(query);
  const response = await bffFetch<unknown>({
    method: "GET",
    path: "/api/v1/postmortems",
    ...(normalizedQuery ? { query: normalizedQuery } : {}),
  });
  const envelope = asRecord(response);
  const items = listItems(response).map((item, index) => normalizePostmortem(item, `Postmortem list item ${index}`));
  return {
    items,
    page_info: normalizePageInfo(envelope, items.length, query?.page_size),
    meta: normalizeMeta(envelope.meta),
  };
}

export async function getPostmortem(postmortemId: string): Promise<PostmortemDetailResult> {
  const requestedId = postmortemId.trim();
  if (!requestedId) throw new Error("postmortem_id is required.");

  const response = await bffFetch<unknown>({
    method: "GET",
    path: `/api/v1/postmortems/${encodeURIComponent(requestedId)}`,
  });
  const envelope = asRecord(response);
  const item = normalizePostmortem(envelope.data ?? response, "Postmortem detail");
  if (item.postmortem_id !== requestedId) {
    throw new Error(
      `Postmortem detail id mismatch: requested ${requestedId}, received ${item.postmortem_id}.`,
    );
  }
  return { item, meta: normalizeMeta(envelope.meta) };
}

export const postmortemClient = {
  list: listPostmortems,
  get: getPostmortem,
};
