import { bffFetch } from "./client";
import { paths } from "./paths";

type UnknownRecord = Record<string, unknown>;

export type PostmortemStatus = "draft" | "review" | "approved" | "published" | string;

export interface PostmortemRecord {
  /** DataTable identity, always projected from canonical postmortem_id. */
  id: string;
  postmortem_id: string;
  incident_id: string;
  title: string;
  status: PostmortemStatus;
  created_at: string;
  published_at?: string;
  deployment_stage?: string;
  artifact_id?: string;
  artifact_version?: string;
  runtime_id?: string;
  trace_id?: string;
  root_cause: string;
  contributing_factors: string[];
  action_items: string[];
  author_ids: string[];
  linked_evolution_decision_id?: string;
}

export interface PostmortemSurfaceState {
  status?: string;
  source?: string;
  message?: string;
  reason?: string;
}

export interface PostmortemResponseMeta {
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

function normalizePostmortem(value: unknown, context: string): PostmortemRecord {
  const item = asRecord(value);
  const postmortemId = asString(item.postmortem_id);
  if (!postmortemId) {
    throw new Error(`${context} is missing canonical postmortem_id.`);
  }

  return {
    id: postmortemId,
    postmortem_id: postmortemId,
    incident_id: asString(item.incident_id),
    title: asString(item.title) || postmortemId,
    status: asString(item.status) || "unknown",
    created_at: asString(item.created_at),
    published_at: asString(item.published_at) || undefined,
    deployment_stage: asString(item.deployment_stage) || undefined,
    artifact_id: asString(item.artifact_id) || undefined,
    artifact_version: asString(item.artifact_version) || undefined,
    runtime_id: asString(item.runtime_id) || undefined,
    trace_id: asString(item.trace_id) || undefined,
    root_cause: asString(item.root_cause),
    contributing_factors: asStringArray(item.contributing_factors),
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

export async function listPostmortems(): Promise<PostmortemListResult> {
  const response = await bffFetch<unknown>({
    method: "GET",
    path: paths.agoraPostmortems(),
  });
  const envelope = asRecord(response);
  return {
    items: listItems(response).map((item, index) => normalizePostmortem(item, `Postmortem list item ${index}`)),
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
