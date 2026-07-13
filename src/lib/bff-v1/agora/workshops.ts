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
  | "readiness_gate"
  | "persona_opinion"
  | "opinion"
  | "debate";

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
  assessment_id: string;
  workshop_id: string;
  gate: WorkshopReadinessGate;
  passed: boolean;
  blockers: string[];
  assessed_at: string;
  assessed_by_persona_id?: string;
}

export interface WorkshopStreamEvent {
  event_id: string;
  workshop_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

// ─── Workshop CRUD ─────────────────────────────────────────────────────────────

export async function listWorkshops(params?: {
  status?: StrategyWorkshop["status"];
  limit?: number;
  cursor?: string;
}): Promise<{ items: StrategyWorkshop[]; cursor?: string }> {
  const query: Record<string, string | number | undefined> = {};
  if (params?.status) query.status = params.status;
  if (params?.limit) query.limit = params.limit;
  if (params?.cursor) query.cursor = params.cursor;
  return bffFetch<{ items: StrategyWorkshop[]; cursor?: string }>({
    method: "GET",
    path: "/bff/agora/workshops",
    query,
  });
}

export async function createWorkshop(body: {
  subject: StrategyWorkshop["subject"];
  participant_persona_ids?: string[];
  metadata?: Record<string, unknown>;
}): Promise<StrategyWorkshop> {
  return bffFetch<StrategyWorkshop>({
    method: "POST",
    path: "/bff/agora/workshops",
    body,
  });
}

export async function getWorkshop(workshopId: string): Promise<StrategyWorkshop> {
  return bffFetch<StrategyWorkshop>({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
  });
}

// ─── Workshop messages ─────────────────────────────────────────────────────────

export async function postWorkshopMessage(
  workshopId: string,
  body: { content: string; metadata?: Record<string, unknown> },
): Promise<{ message_id: string; workshop_id: string; created_at: string }> {
  return bffFetch({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/messages`,
    body,
  });
}

// ─── Workshop events ───────────────────────────────────────────────────────────

export async function listWorkshopEvents(
  workshopId: string,
  params?: { after?: string; limit?: number },
): Promise<{ items: WorkshopStreamEvent[] }> {
  const query: Record<string, string | number | undefined> = {};
  if (params?.after) query.after = params.after;
  if (params?.limit) query.limit = params.limit;
  return bffFetch<{ items: WorkshopStreamEvent[] }>({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`,
    query,
  });
}

// ─── Completeness ──────────────────────────────────────────────────────────────

export async function getWorkshopCompleteness(
  workshopId: string,
): Promise<StrategyCompleteness | null> {
  try {
    return await bffFetch<StrategyCompleteness>({
      method: "GET",
      path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/completeness`,
    });
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
  return bffFetch<StrategyWorkshop>({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/conclude`,
    body: body ?? {},
  });
}

// ─── Streaming (SSE) ──────────────────────────────────────────────────────────

export function openWorkshopStream(workshopId: string): EventSource {
  return new EventSource(
    `/bff/agora/workshops/${encodeURIComponent(workshopId)}/stream`,
    { withCredentials: true },
  );
}

// ─── v1.3: Cards ──────────────────────────────────────────────────────────────

export async function listWorkshopCards(
  workshopId: string,
  params?: { after_sequence?: number; limit?: number },
): Promise<{ items: WorkshopCard[] }> {
  const query: Record<string, string | number | undefined> = {};
  if (params?.after_sequence !== undefined) query.after_sequence = params.after_sequence;
  if (params?.limit) query.limit = params.limit;
  return bffFetch<{ items: WorkshopCard[] }>({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/cards`,
    query,
  });
}

// ─── v1.3: Readiness ──────────────────────────────────────────────────────────

export async function getWorkshopReadiness(
  workshopId: string,
  gate?: WorkshopReadinessGate,
): Promise<WorkshopReadinessAssessment | null> {
  const query: Record<string, string | undefined> = {};
  if (gate) query.gate = gate;
  try {
    return await bffFetch<WorkshopReadinessAssessment>({
      method: "GET",
      path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness`,
      query,
    });
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
  return bffFetch<WorkshopReadinessAssessment>({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness/reassess`,
    body,
  });
}
