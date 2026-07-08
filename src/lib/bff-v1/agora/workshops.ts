// BFF client for agora.workshop.v1 capability (v1.1 + v1.3 endpoints).
// Routes: /bff/agora/workshops/*
// Live strict — pages must not call fetch() directly; use this module.
// Agora-scoped paths only; no Management routes.

import { bffFetch } from "@/lib/bff-v1/client";
import type { StrategyWorkshop, StrategyCompleteness } from "./types";

// ─── v1.3 types (not yet in auto-generated types.ts) ──────────────────────────

export type WorkshopCardType =
  | "user_strategy_description"
  | "servant_reconstruction"
  | "completeness_update"
  | "missing_definition"
  | "next_question"
  | "research_plan_proposal"
  | "research_progress"
  | "research_result"
  | "consult_result"
  | "version_patch_proposal"
  | "version_compare"
  | "readiness_gate";

export type WorkshopCardStatus =
  | "informational"
  | "action_required"
  | "running"
  | "completed"
  | "failed"
  | "stale";

export type WorkshopReadinessGate =
  | "preliminary_research"
  | "full_validation"
  | "trading_room";

export type WorkshopReadinessGateState =
  | "not_assessed"
  | "blocked"
  | "conditional"
  | "ready"
  | "stale";

export type WorkshopReadinessRequirementState =
  | "missing"
  | "partial"
  | "satisfied"
  | "waived"
  | "stale";

export interface WorkshopReadinessRequirement {
  requirement_id: string;
  title: string;
  hardness: "hard" | "soft";
  state: WorkshopReadinessRequirementState;
  summary?: string;
}

export interface WorkshopReadinessGateEntry {
  gate: WorkshopReadinessGate;
  state: WorkshopReadinessGateState;
  requirements: WorkshopReadinessRequirement[];
  blocking_requirement_ids?: string[];
  conditional_assumptions?: string[];
}

export interface WorkshopEvidenceRef {
  ref_type:
    | "evidence_bundle"
    | "evidence_item"
    | "source_record"
    | "citation"
    | "experiment_artifact"
    | "registry_entry"
    | "consult_memo"
    | "research_run"
    | "telemetry_snapshot"
    | "market_context";
  ref_id: string;
  summary?: string;
  data_cutoff?: string;
}

export type WorkshopAllowedActions = Record<string, boolean>;

export interface WorkshopCard {
  spec_version?: "1.0";
  card_id: string;
  card_type: WorkshopCardType;
  workshop_id: string;
  sequence_no: number;
  source_event_ids?: string[];
  workshop_version_id?: string;
  strategy_spec_registry_id?: string;
  status: WorkshopCardStatus;
  title: string;
  summary?: string;
  payload: Record<string, unknown>;
  evidence_refs?: WorkshopEvidenceRef[];
  allowed_actions?: WorkshopAllowedActions;
  created_at: string;
  updated_at?: string;
  // Compatibility with the pre-v1.3 AG-FE-SW-001 projection while the BFF rolls.
  sequence?: number;
  emitted_by?: "user" | "servant";
  persona_id?: string;
}

export interface WorkshopReadinessAssessment {
  spec_version?: "1.0";
  assessment_id: string;
  workshop_id: string;
  strategy_id?: string;
  workshop_version_id?: string;
  strategy_spec_registry_id?: string;
  assessment_version?: number;
  gates?: WorkshopReadinessGateEntry[];
  highest_ready_gate?: WorkshopReadinessGate | null;
  staleness_reasons?: string[];
  evidence_refs?: WorkshopEvidenceRef[];
  assessed_at: string;
  valid_until?: string;
  // Legacy single-gate compatibility while older test/projection payloads roll off.
  gate?: WorkshopReadinessGate;
  passed?: boolean;
  blockers?: string[];
  assessed_by_persona_id?: string;
}

export interface WorkshopStreamEvent {
  event_id: string;
  workshop_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

// ─── Response normalization ──────────────────────────────────────────────────

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dataFrom(value: unknown): unknown {
  const root = recordFrom(value);
  return root.data ?? value;
}

function entityFrom<T>(value: unknown): T {
  return recordFrom(dataFrom(value)) as T;
}

function itemsFrom<T>(value: unknown, aliases: string[] = []): T[] {
  const data = dataFrom(value);
  if (Array.isArray(data)) return data as T[];
  const record = recordFrom(data);
  for (const key of ["items", ...aliases]) {
    const items = record[key];
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

// ─── Workshop CRUD ─────────────────────────────────────────────────────────────

export async function listWorkshops(params?: {
  status?: StrategyWorkshop["status"];
  limit?: number;
  cursor?: string;
}): Promise<StrategyWorkshop[]> {
  const query: Record<string, string | number | undefined> = {};
  if (params?.status) query.status = params.status;
  if (params?.limit) query.limit = params.limit;
  if (params?.cursor) query.cursor = params.cursor;
  const body = await bffFetch<unknown>({
    method: "GET",
    path: "/bff/agora/workshops",
    query,
  });
  return itemsFrom<StrategyWorkshop>(body, ["workshops", "results"]);
}

export async function createWorkshop(body: {
  subject: StrategyWorkshop["subject"];
  participant_persona_ids?: string[];
  metadata?: Record<string, unknown>;
}): Promise<StrategyWorkshop> {
  const response = await bffFetch<unknown>({
    method: "POST",
    path: "/bff/agora/workshops",
    body,
  });
  return entityFrom<StrategyWorkshop>(response);
}

export async function getWorkshop(workshopId: string): Promise<StrategyWorkshop> {
  const response = await bffFetch<unknown>({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
  });
  return entityFrom<StrategyWorkshop>(response);
}

// ─── Workshop messages ─────────────────────────────────────────────────────────

export async function postWorkshopMessage(
  workshopId: string,
  body: { content: string; metadata?: Record<string, unknown> },
): Promise<{ message_id: string; workshop_id: string; created_at: string }> {
  const response = await bffFetch<unknown>({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/messages`,
    body,
  });
  return entityFrom<{ message_id: string; workshop_id: string; created_at: string }>(response);
}

// ─── Workshop events ───────────────────────────────────────────────────────────

export async function listWorkshopEvents(
  workshopId: string,
  params?: { after?: string; limit?: number },
): Promise<{ items: WorkshopStreamEvent[] }> {
  const query: Record<string, string | number | undefined> = {};
  if (params?.after) query.after = params.after;
  if (params?.limit) query.limit = params.limit;
  const body = await bffFetch<unknown>({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`,
    query,
  });
  return { items: itemsFrom<WorkshopStreamEvent>(body, ["events", "results"]) };
}

// ─── Completeness ──────────────────────────────────────────────────────────────

export async function getWorkshopCompleteness(
  workshopId: string,
): Promise<StrategyCompleteness | null> {
  try {
    const response = await bffFetch<unknown>({
      method: "GET",
      path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/completeness`,
    });
    // The BFF signals "not yet assessed" as `{ data: null }` (200 OK) as well
    // as 404. `dataFrom()`'s `root.data ?? value` falls through to the raw
    // envelope when `data` is explicitly null, which would otherwise return
    // a truthy `{ data: null, meta: {...} }` placeholder here and crash
    // StrategyCompletenessRail's `completeness.dimensions.length` on every
    // workshop that hasn't been assessed yet.
    if (recordFrom(response).data === null) return null;
    return entityFrom<StrategyCompleteness>(response);
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

// ─── Versions ─────────────────────────────────────────────────────────────────

export async function listWorkshopVersions(workshopId: string): Promise<{
  items: Array<{ version: number; strategy_ref: string; selected: boolean; created_at: string }>;
}> {
  return bffFetch({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/versions`,
  });
}

export async function createWorkshopVersion(
  workshopId: string,
  body: { strategy_ref: string; notes?: string },
): Promise<{ version: number; strategy_ref: string; created_at: string }> {
  return bffFetch({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/versions`,
    body,
  });
}

export async function selectWorkshopVersion(
  workshopId: string,
  version: number,
): Promise<{ workshop_id: string; selected_version: number }> {
  return bffFetch({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/versions/${version}/select`,
    body: {},
  });
}

// ─── Research ─────────────────────────────────────────────────────────────────

export async function dispatchWorkshopResearchRun(
  workshopId: string,
  body?: { objectives?: string[] },
): Promise<{ run_id: string; workshop_id: string; status: string }> {
  return bffFetch({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/research-run`,
    body: body ?? {},
  });
}

// ─── Consultation ─────────────────────────────────────────────────────────────

export async function openWorkshopConsultation(
  workshopId: string,
  body: { persona_ids: string[]; topic?: string },
): Promise<{ consultation_id: string; workshop_id: string }> {
  return bffFetch({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/consultation`,
    body,
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function concludeWorkshop(
  workshopId: string,
  body?: { notes?: string },
): Promise<StrategyWorkshop> {
  const response = await bffFetch<unknown>({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/conclude`,
    body: body ?? {},
  });
  return entityFrom<StrategyWorkshop>(response);
}

// ─── Streaming (SSE) ──────────────────────────────────────────────────────────

export function openWorkshopStream(
  workshopId: string,
  onEvent?: (event: WorkshopStreamEvent) => void,
): () => void {
  const source = new EventSource(
    `/bff/agora/workshops/${encodeURIComponent(workshopId)}/stream`,
    { withCredentials: true },
  );
  if (onEvent) {
    source.onmessage = (message) => {
      try {
        onEvent(entityFrom<WorkshopStreamEvent>(JSON.parse(message.data)));
      } catch {
        // Ignore malformed keepalive or compatibility messages.
      }
    };
  }
  return () => source.close();
}

// ─── v1.3: Cards ──────────────────────────────────────────────────────────────

export async function listWorkshopCards(
  workshopId: string,
  params?: { after_sequence?: number; limit?: number },
): Promise<WorkshopCard[]> {
  const query: Record<string, string | number | undefined> = {};
  if (params?.after_sequence !== undefined) query.after_sequence = params.after_sequence;
  if (params?.limit) query.limit = params.limit;
  const body = await bffFetch<unknown>({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/cards`,
    query,
  });
  return itemsFrom<WorkshopCard>(body, ["cards", "results"]);
}

// ─── v1.3: Readiness ──────────────────────────────────────────────────────────

export async function getWorkshopReadiness(
  workshopId: string,
  gate?: WorkshopReadinessGate,
): Promise<WorkshopReadinessAssessment | null> {
  const query: Record<string, string | undefined> = {};
  if (gate) query.gate = gate;
  try {
    const response = await bffFetch<unknown>({
      method: "GET",
      path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness`,
      query,
    });
    // See getWorkshopCompleteness() above: `{ data: null }` means "not yet
    // assessed" and must not be treated as a truthy placeholder assessment.
    if (recordFrom(response).data === null) return null;
    return entityFrom<WorkshopReadinessAssessment>(response);
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function reassessWorkshopReadiness(
  workshopId: string,
  body: { gate: WorkshopReadinessGate },
): Promise<WorkshopReadinessAssessment> {
  const response = await bffFetch<unknown>({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness/reassess`,
    body,
  });
  return entityFrom<WorkshopReadinessAssessment>(response);
}
