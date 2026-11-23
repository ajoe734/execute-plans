// Management & Agora deliberative persona meetings client (FE-MANAGEMENT-MEETINGS-20261115).
// Thin typed client over the BFF meetings routes (/bff/management/meetings*).
// The BFF keeps no meeting store and forwards reads and operator convening to
// the consultation service. Unavailable owner data is surfaced explicitly as
// `unavailable` with the recorded reason; unknown meeting IDs surface as `not_found`.
// Private memory is stripped everywhere as defense-in-depth.

import { QueryClient } from "@tanstack/react-query";
import { bffFetch, detectMode, getMockResolver } from "./client";
import { BffError } from "./errors";
import { idempotencyKey as mintIdempotencyKey } from "./headers";
import { paths } from "./paths";
import { getSharedQueryClient } from "./queryKeys";
import { readBffEnv } from "./runtimeEnv";
import { emitV5Event } from "./sse/bridge";
import { liveWriteGated } from "./writeGate";

const knownQueryClients = new Set<QueryClient>();
const QUERY_CLIENT_TRACKED = Symbol.for("pantheon.meetings.queryClientTracked");

export function registerMeetingQueryClient(client: QueryClient | null | undefined): void {
  if (
    client &&
    typeof client.invalidateQueries === "function" &&
    typeof client.removeQueries === "function"
  ) {
    if (knownQueryClients.has(client)) {
      knownQueryClients.delete(client);
    } else if (knownQueryClients.size >= 32) {
      const oldest = knownQueryClients.values().next().value;
      if (oldest) knownQueryClients.delete(oldest);
    }
    knownQueryClients.add(client);
  }
}

function installQueryClientTracker(): void {
  const proto = QueryClient?.prototype as
    | (QueryClient & { [QUERY_CLIENT_TRACKED]?: boolean })
    | undefined;
  if (!proto || proto[QUERY_CLIENT_TRACKED]) return;
  Object.defineProperty(proto, QUERY_CLIENT_TRACKED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  const origMount = proto.mount;
  if (typeof origMount === "function") {
    proto.mount = function (this: QueryClient, ...args: Parameters<QueryClient["mount"]>) {
      registerMeetingQueryClient(this);
      return origMount.apply(this, args);
    };
  }

  const origDefaultQueryOptions = proto.defaultQueryOptions;
  if (typeof origDefaultQueryOptions === "function") {
    proto.defaultQueryOptions = function (
      this: QueryClient,
      options: Parameters<QueryClient["defaultQueryOptions"]>[0],
    ) {
      registerMeetingQueryClient(this);
      return (origDefaultQueryOptions as (opts: unknown) => unknown).call(
        this,
        options,
      ) as ReturnType<QueryClient["defaultQueryOptions"]>;
    } as QueryClient["defaultQueryOptions"];
  }
}

installQueryClientTracker();

export type MeetingsRead<T> =
  | { state: "ok"; data: T; owner?: string; meta?: Record<string, unknown> }
  | { state: "not_found"; reason: string; owner?: string }
  | { state: "unavailable"; reason: string; owner?: string };

export const MEETINGS_REASON_UNKNOWN = "consultation_owner_unavailable";
export const MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS = 2000;

export function countMeetingReviewNoteChars(note: string): number {
  return Array.from(note).length;
}

const PRIVATE_SCOPES = new Set([
  "persona_private",
  "private",
  "private_user",
  "user_private",
]);

const PRIVATE_FIELD_KEYS = new Set([
  "private_memory",
  "private_memories",
  "private_memory_text",
  "private_text",
  "private_content",
  "private_interpretation",
]);

const WRITEBACK_ALLOWED_KEYS = new Set([
  "persona_id",
  "persona_display_name",
  "persona_name_missing",
  "entry_id",
  "status",
  "written_at",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPrivateMemoryItem(item: Record<string, unknown>): boolean {
  for (const key of ["relevance_scope", "memory_layer", "scope", "visibility_scope", "memory_scope"]) {
    const val = String(item[key] ?? "").trim().toLowerCase();
    if (PRIVATE_SCOPES.has(val)) return true;
  }
  if (item.is_private === true || item.private === true) return true;
  for (const key of ["kind", "memory_type", "type"]) {
    const val = String(item[key] ?? "").trim().toLowerCase();
    if (val === "private_memory" || val === "persona_private" || val === "persona_private_memory") {
      return true;
    }
  }
  return false;
}

function collectWithheldPrivateRefIds(node: unknown, out = new Set<string>()): Set<string> {
  const addRefValue = (val: unknown) => {
    if (typeof val === "string" && val.trim()) {
      out.add(val.trim());
    } else if (isRecord(val)) {
      for (const k of ["item_id", "id", "ref", "ref_id", "evidence_ref", "source_id", "record_id"]) {
        const s = typeof val[k] === "string" ? val[k].trim() : "";
        if (s) out.add(s);
      }
    }
  };
  const collectFromPrivateRecord = (rec: Record<string, unknown>) => {
    addRefValue(rec);
    if (Array.isArray(rec.citations)) {
      for (const c of rec.citations) addRefValue(c);
    }
    if (Array.isArray(rec.evidence_refs)) {
      for (const r of rec.evidence_refs) addRefValue(r);
    }
  };
  const walk = (cur: unknown) => {
    if (Array.isArray(cur)) {
      for (const elem of cur) {
        if (isRecord(elem) && isPrivateMemoryItem(elem)) {
          collectFromPrivateRecord(elem);
        } else {
          walk(elem);
        }
      }
      return;
    }
    if (isRecord(cur)) {
      if (isPrivateMemoryItem(cur)) {
        collectFromPrivateRecord(cur);
        return;
      }
      for (const v of Object.values(cur)) {
        walk(v);
      }
    }
  };
  walk(node);
  return out;
}

function stripPrivateMemoryInner<T>(obj: T, withheldIds: Set<string>): T {
  if (Array.isArray(obj)) {
    const out: unknown[] = [];
    for (const elem of obj) {
      if (isRecord(elem) && isPrivateMemoryItem(elem)) continue;
      const stripped = stripPrivateMemoryInner(elem, withheldIds);
      if (stripped !== undefined) out.push(stripped);
    }
    return out as unknown as T;
  }
  if (isRecord(obj)) {
    if (isPrivateMemoryItem(obj)) return undefined as unknown as T;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (PRIVATE_FIELD_KEYS.has(k)) continue;
      if (k === "writebacks" && Array.isArray(v)) {
        cleaned[k] = v
          .filter(isRecord)
          .map((wb) => {
            const safeWb: Record<string, unknown> = {};
            for (const wk of WRITEBACK_ALLOWED_KEYS) {
              if (wb[wk] !== undefined) safeWb[wk] = wb[wk];
            }
            return safeWb;
          });
        continue;
      }
      const candidate =
        ["evidence_refs", "citations", "accepted", "disputed"].includes(k) && Array.isArray(v) && withheldIds.size > 0
          ? v.filter((entry) => {
              if (typeof entry === "string") return !withheldIds.has(entry.trim());
              if (isRecord(entry)) {
                for (const rk of ["item_id", "id", "ref", "ref_id", "evidence_ref", "source_id", "record_id"]) {
                  const s = typeof entry[rk] === "string" ? entry[rk].trim() : "";
                  if (s && withheldIds.has(s)) return false;
                }
              }
              return true;
            })
          : v;
      const stripped = stripPrivateMemoryInner(candidate, withheldIds);
      if (stripped !== undefined || candidate === null) {
        cleaned[k] = stripped;
      }
    }
    return cleaned as unknown as T;
  }
  return obj;
}

export function stripPrivateMemory<T>(obj: T): T {
  const withheldIds = collectWithheldPrivateRefIds(obj);
  return stripPrivateMemoryInner(obj, withheldIds);
}

function extractErrorReason(err: BffError): string {
  const details = err.envelope?.error?.details;
  if (isRecord(details) && typeof details.reason === "string" && details.reason) {
    return details.reason;
  }
  const errPayload = err.envelope?.error as unknown as Record<string, unknown> | undefined;
  if (errPayload && typeof errPayload.reason === "string" && errPayload.reason) {
    return errPayload.reason;
  }
  if (err.envelope?.error?.cause) return err.envelope.error.cause;
  const msg = typeof err.message === "string" ? err.message.trim() : "";
  const colonMatch = /:\s*([a-z0-9]+(?:_[a-z0-9]+)+)$/i.exec(msg);
  if (colonMatch) return colonMatch[1];
  if (err.code === "UNKNOWN_ERROR" && msg && !/^HTTP\s+\d+$/i.test(msg)) {
    return msg;
  }
  return err.code || MEETINGS_REASON_UNKNOWN;
}

async function readMeetingsSurface<T>(
  fn: () => Promise<unknown>,
  pick: (raw: Record<string, unknown>) => T | undefined,
): Promise<MeetingsRead<T>> {
  let raw: unknown;
  try {
    raw = await fn();
  } catch (err) {
    if (err instanceof BffError) {
      if (err.status === 404 || err.code === "RESOURCE_NOT_FOUND") {
        return { state: "not_found", reason: extractErrorReason(err) || "meeting_not_found" };
      }
      return { state: "unavailable", reason: extractErrorReason(err) };
    }
    const fallbackReason =
      err instanceof Error && err.message.trim() ? err.message.trim() : MEETINGS_REASON_UNKNOWN;
    return { state: "unavailable", reason: fallbackReason };
  }

  const body = stripPrivateMemory(isRecord(raw) ? raw : {});
  const owner = typeof body.owner === "string" ? body.owner : "consultation";
  const meta = isRecord(body.meta) ? body.meta : undefined;
  const dataRec = isRecord(body.data) ? body.data : undefined;

  if (body.status === "not_found" || dataRec?.status === "not_found") {
    const reason =
      (typeof body.reason === "string" && body.reason) ||
      (typeof dataRec?.reason === "string" && dataRec.reason) ||
      "meeting_not_found";
    return { state: "not_found", reason, owner };
  }

  if (
    body.status === "unavailable" ||
    dataRec?.status === "unavailable" ||
    meta?.status === "unavailable"
  ) {
    const reason =
      (typeof body.reason === "string" && body.reason) ||
      (typeof dataRec?.reason === "string" && dataRec.reason) ||
      (typeof meta?.reason === "string" && meta.reason) ||
      MEETINGS_REASON_UNKNOWN;
    return { state: "unavailable", reason, owner };
  }

  const picked = pick(body);
  if (picked === undefined) {
    return { state: "unavailable", reason: "invalid_owner_response", owner };
  }
  return { state: "ok", data: stripPrivateMemory(picked), owner, meta };
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface MeetingParticipant {
  persona_id: string;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  role?: string;
  origin?: "institutional" | "agora_advisor" | "private_servant" | string;
  servant?: boolean;
  style?: string;
  agora_user_id?: string;
  trader_id?: string;
  account_id?: string;
  broker_ids?: string[];
  [key: string]: unknown;
}

export interface MeetingConvenedBy {
  kind: "operator" | "persona" | "agora_user" | "trader" | string;
  id?: string;
  agora_user_id?: string;
  trader_id?: string;
  redacted?: boolean;
}

export interface MeetingOperatorReview {
  status: "pending" | "reviewed" | string;
  disposition?: "closed_no_proposal" | string | null;
  note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  cause?: string | null;
  unreadable_reason?: string | null;
  [key: string]: unknown;
}

export interface MeetingSummaryItem {
  id?: string;
  meeting_id: string;
  meeting_type: string;
  topic?: string;
  status: string;
  outcome?: string | null;
  synthesis_unreadable_reason?: string | null;
  unreadable_reason?: string | null;
  operator_review?: MeetingOperatorReview | null;
  evidence_refs?: string[];
  chair_persona_id?: string | null;
  chair_persona_display_name?: string | null;
  chair_persona_name_missing?: boolean;
  persona_id?: string | null;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  sponsor_persona_id?: string | null;
  sponsor_persona_display_name?: string | null;
  sponsor_persona_name_missing?: boolean;
  subject_persona_id?: string | null;
  subject_persona_display_name?: string | null;
  subject_persona_name_missing?: boolean;
  strategy_id?: string | null;
  strategy_display_name?: string | null;
  strategy_name_missing?: boolean;
  convened_by?: MeetingConvenedBy | null;
  subject_ref?: Record<string, unknown> | string | null;
  participants: MeetingParticipant[];
  participant_count?: number;
  /** BFF-STRATEGY-SYNTHETIC-STUBS-20261120: plain-language topic and execution outcome. */
  topic_summary?: MeetingTopicSummary | string | null;
  execution_state?: MeetingExecutionState | string | null;
  /** 'execution_failed' when dead-lettered at round 0. */
  effective_status?: string | null;
  last_error?: string | null;
  has_agora_participants?: boolean;
  has_private_servant?: boolean;
  round?: number;
  created_at?: string;
  closed_at?: string | null;
  href?: string;
  [key: string]: unknown;
}

export interface MeetingTopicSummary {
  kind?: "pool_evolution_review" | "optimisation_review" | string | null;
  subject_persona_id?: string | null;
  subject_persona_display_name?: string | null;
  period?: string | null;
  lesson_count?: number | null;
}

export interface MeetingExecutionState {
  status?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  last_error?: string | null;
  updated_at?: string | null;
}

export interface MeetingsListData {
  items: MeetingSummaryItem[];
  next_cursor?: string | null;
  summary?: {
    total_items?: number;
    returned_items?: number;
    open_count?: number;
    closed_count?: number;
    review_count?: number;
    dead_letter_count?: number;
  };
}

export interface MeetingProposalDownstream {
  target?: string | null;
  id?: string | null;
  status?: string | null;
  href?: string | null;
}

export interface MeetingProposalItem {
  id?: string;
  proposal_id: string;
  meeting_id?: string | null;
  meeting_href?: string | null;
  kind?: string;
  sponsor_persona_id?: string | null;
  sponsor_persona_display_name?: string | null;
  sponsor_persona_name_missing?: boolean;
  persona_id?: string | null;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  strategy_id?: string | null;
  strategy_display_name?: string | null;
  strategy_name_missing?: boolean;
  summary?: string;
  title?: string;
  downstream: MeetingProposalDownstream;
  created_at?: string;
  [key: string]: unknown;
}

export interface MeetingProposalsData {
  items: MeetingProposalItem[];
}

export interface MeetingRosterRule {
  chair?: string;
  participants?: string[];
  min_trading_personas?: number;
  requires_risk?: boolean;
  requires_red_team?: boolean;
  red_team_assigned_case?: string;
  allow_agora_advisor?: boolean;
  allow_owning_user_servant?: boolean;
  allow_subject_trader_servant?: boolean;
  description?: string;
  [key: string]: unknown;
}

export interface MeetingTypeRule {
  meeting_type: string;
  name?: string;
  purpose?: string;
  enabled: boolean;
  cadence?: string;
  weekly_cadence_day?: string;
  roster_rule?: MeetingRosterRule;
  budget?: {
    max_participants?: number;
    max_rounds?: number;
    weekly_limit?: number;
    max_calls_per_meeting?: number;
  };
  [key: string]: unknown;
}

export interface MeetingScheduleEntry {
  persona_id: string;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  meeting_type: string;
  last_run_at?: string | null;
  next_due_at?: string | null;
  weekly_count?: number;
  weekly_limit?: number;
  [key: string]: unknown;
}

export interface MeetingRefusalEntry {
  persona_id?: string | null;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  meeting_type: string;
  reason: string;
  at?: string;
  [key: string]: unknown;
}

export interface MeetingCatalogueData {
  types: MeetingTypeRule[];
  schedule: MeetingScheduleEntry[];
  refusals: MeetingRefusalEntry[];
  summary?: {
    type_count?: number;
    schedule_count?: number;
    refusal_count?: number;
    insufficient_participants_count?: number;
  };
}

export interface MeetingCaseFileItem {
  item_id: string;
  kind?: string;
  relevance_scope?: string;
  source_owner?: string;
  source_id?: string;
  status?: string;
  unavailable_reason?: string;
  excerpt?: string;
  agora_user_id?: string;
  trader_id?: string;
  account_id?: string;
  broker_ids?: string[];
  raw_text?: string;
  [key: string]: unknown;
}

export interface MeetingPreReadInterpretation {
  persona_id: string;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  relevance_scope?: string;
  text?: string;
  summary?: string;
  citations?: string[];
  [key: string]: unknown;
}

export interface MeetingRoundPosition {
  label: string;
  persona_id?: string;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  revealed_persona_id?: string;
  role?: string;
  style?: string;
  stance?: string;
  confidence?: number;
  citations?: string[];
  changed?: boolean;
  accepted?: string[];
  disputed?: string[];
  rationale?: string;
  summary?: string;
  proposals?: unknown[];
  [key: string]: unknown;
}

export interface MeetingRound {
  round: number;
  evidence_note?: string;
  positions: MeetingRoundPosition[];
  [key: string]: unknown;
}

export interface MeetingSynthesis {
  proposals: MeetingProposalItem[];
  tally?: {
    by_stance?: Record<string, number>;
    support?: number;
    dissent?: number;
    binding?: boolean;
    [key: string]: unknown;
  } | null;
  dissent_memo_id?: string | null;
  dissent_summary?: string | null;
  actions?: unknown[];
  no_action_reason?: string | null;
  outcome?: string | null;
  summary?: string | null;
  unreadable_reason?: string | null;
  cause?: string | null;
  [key: string]: unknown;
}

export interface MeetingWritebackEntry {
  persona_id: string;
  persona_display_name?: string | null;
  persona_name_missing?: boolean;
  entry_id: string;
  status?: string;
  written_at?: string;
}

export interface MeetingAttributionRecord {
  record_id: string;
  subject_kind?: string;
  subject_id?: string;
  agora_user_id?: string;
  account_id?: string;
  broker_ids?: string[];
  direction?: "outstanding" | "underperforming" | string;
  decomposition?: {
    selection?: number;
    entry_timing?: number;
    sizing?: number;
    exit?: number;
    costs?: number;
    [key: string]: number | undefined;
  };
  sample_size?: number;
  luck_interval?: [number, number] | number[];
  [key: string]: unknown;
}

export interface MeetingUsage {
  participants?: number;
  rounds?: number;
  calls?: number;
  [key: string]: unknown;
}

export type MeetingActionState =
  | "open"
  | "in_progress"
  | "waiting_human_input"
  | "submitted"
  | "returned"
  | "accepted"
  | "unknown";

export interface MeetingActionItem {
  /** Stable action id; equals the research ticket id for ticket-backed work. */
  action_id: string;
  origin_meeting_id?: string | null;
  title?: string | null;
  owner_label?: string | null;
  owner_kind?: string | null;
  deliverable?: string | null;
  acceptance_criterion?: string | null;
  due_at?: string | null;
  next_review?: string | null;
  state: MeetingActionState;
  /** Whether the assignee has actually produced a result (distinct from acceptance). */
  executed: boolean;
  evidence_refs: string[];
  review_reason?: string | null;
  review_source?: string | null;
  required_actor?: string | null;
  next_transition?: string | null;
  missing_input?: string | null;
  ticket_href?: string | null;
  downstream_ref?: string | null;
  /** "retain_pool" and similar chair decisions, distinct from a participant stance. */
  decision_kind?: string | null;
}

export type MeetingActionsRead =
  | { state: "ok"; items: MeetingActionItem[] }
  | { state: "unavailable"; reason: string }
  | { state: "forbidden"; reason: string };

export interface MeetingParticipantCapability {
  label: string;
  persona_id?: string | null;
  limits: string[];
}

export interface MeetingDetail extends MeetingSummaryItem {
  /** Actions adopted by this meeting's chair (frozen reference). */
  adopted_actions?: MeetingActionItem[];
  /** Same-series obligations assembled for this meeting; reviewed first. */
  prior_actions?: MeetingActionsRead;
  /** Reason the chair ended without adopting an action. */
  no_action_reason?: string | null;
  participant_capabilities?: MeetingParticipantCapability[];
  attribution_record_id?: string | null;
  attribution_record?: MeetingAttributionRecord | null;
  agenda?: string[] | string | null;
  case_file_items: MeetingCaseFileItem[];
  private_items_withheld?: number;
  pre_read?: {
    interpretations?: MeetingPreReadInterpretation[];
    items?: MeetingPreReadInterpretation[];
    [key: string]: unknown;
  } | MeetingPreReadInterpretation[] | null;
  rounds: MeetingRound[];
  label_reveal?: Record<string, string> | null;
  anonymised_labels_revealed?: boolean;
  synthesis?: MeetingSynthesis | null;
  proposals: MeetingProposalItem[];
  writebacks: MeetingWritebackEntry[];
  usage?: MeetingUsage | null;
  agora_records?: Array<Record<string, unknown>>;
  replayed?: boolean;
}

export interface ReviewMeetingInput {
  note: string;
}

export interface ConveneMeetingInput {
  meeting_type: string;
  topic: string;
  convened_by?: {
    kind: "operator" | "persona" | "agora_user";
    id?: string;
  };
  subject_ref?: unknown;
  participants?: string[];
  evidence_refs?: unknown[];
  attribution_record_id?: string;
}

export interface ConveneMeetingReceipt {
  meeting_id: string;
  status: string;
  meeting_type?: string;
  topic?: string;
  convened_by?: MeetingConvenedBy;
  [key: string]: unknown;
}

// ─── Client functions ────────────────────────────────────────────────────────

export interface ListMeetingsFilters {
  status?: string;
  type?: string;
  personaId?: string;
  cursor?: string;
  limit?: number;
  /** Include dead_letter / execution_failed meetings (hidden by default). */
  includeFailed?: boolean;
}

export function getMeetings(filters: ListMeetingsFilters = {}): Promise<MeetingsRead<MeetingsListData>> {
  const query: Record<string, string | number | undefined> = {};
  if (filters.status?.trim()) query.status = filters.status.trim();
  if (filters.type?.trim()) query.type = filters.type.trim();
  if (filters.personaId?.trim()) query.persona_id = filters.personaId.trim();
  if (filters.cursor?.trim()) query.cursor = filters.cursor.trim();
  if (filters.includeFailed) query.include_failed = "true";
  if (typeof filters.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
    query.limit = filters.limit;
  }
  return readMeetingsSurface<MeetingsListData>(
    () =>
      bffFetch({
        method: "GET",
        path: paths.mgmtMeetings(),
        query: Object.keys(query).length > 0 ? query : undefined,
      }),
    (raw) => {
      const data = isRecord(raw.data) ? raw.data : raw;
      const itemsRaw = Array.isArray(data.items)
        ? data.items
        : Array.isArray(raw.items)
          ? raw.items
          : undefined;
      if (!itemsRaw) return undefined;
      return {
        items: itemsRaw.filter(isRecord) as unknown as MeetingSummaryItem[],
        next_cursor:
          typeof data.next_cursor === "string"
            ? data.next_cursor
            : typeof raw.next_cursor === "string"
              ? raw.next_cursor
              : null,
        summary: isRecord(data.summary) ? (data.summary as MeetingsListData["summary"]) : undefined,
      };
    },
  );
}

export interface ListMeetingProposalsFilters {
  status?: string;
  personaId?: string;
  meetingId?: string;
}

export function getMeetingProposals(
  filters: ListMeetingProposalsFilters = {},
): Promise<MeetingsRead<MeetingProposalsData>> {
  const query: Record<string, string | undefined> = {};
  if (filters.status?.trim()) query.status = filters.status.trim();
  if (filters.personaId?.trim()) query.persona_id = filters.personaId.trim();
  if (filters.meetingId?.trim()) query.meeting_id = filters.meetingId.trim();
  return readMeetingsSurface<MeetingProposalsData>(
    () =>
      bffFetch({
        method: "GET",
        path: paths.mgmtMeetingProposals(),
        query: Object.keys(query).length > 0 ? query : undefined,
      }),
    (raw) => {
      const data = isRecord(raw.data) ? raw.data : raw;
      const itemsRaw = Array.isArray(data.items)
        ? data.items
        : Array.isArray(raw.items)
          ? raw.items
          : undefined;
      if (!itemsRaw) return undefined;
      return {
        items: itemsRaw.filter(isRecord).map((item) => {
          const proposalId = String(item.proposal_id ?? item.id ?? "").trim();
          const meetingId = typeof item.meeting_id === "string" && item.meeting_id.trim() ? item.meeting_id.trim() : null;
          const ds = isRecord(item.downstream) ? item.downstream : {};
          return {
            ...item,
            proposal_id: proposalId,
            meeting_id: meetingId,
            meeting_href:
              typeof item.meeting_href === "string"
                ? item.meeting_href
                : meetingId
                  ? `/management/meetings/${encodeURIComponent(meetingId)}`
                  : null,
            downstream: {
              target: typeof ds.target === "string" ? ds.target : null,
              id: typeof ds.id === "string" ? ds.id : null,
              status: typeof ds.status === "string" ? ds.status : "pending",
              href: typeof ds.href === "string" ? ds.href : null,
            },
          } as MeetingProposalItem;
        }),
      };
    },
  );
}

export function formatMeetingRosterRule(rule?: MeetingRosterRule | null): string {
  if (!isRecord(rule)) return "—";
  const description = typeof rule.description === "string" ? rule.description.trim() : "";
  if (description) return description;

  const parts: string[] = [];
  if (typeof rule.chair === "string" && rule.chair.trim()) {
    parts.push(`chair: ${rule.chair.trim()}`);
  }
  const participants = Array.isArray(rule.participants)
    ? rule.participants
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim())
    : [];
  if (participants.length > 0) {
    parts.push(`participants: ${participants.join(" + ")}`);
  }
  if (typeof rule.min_trading_personas === "number" && Number.isFinite(rule.min_trading_personas)) {
    parts.push(`min_trading_personas=${rule.min_trading_personas}`);
  }
  if (rule.requires_risk === true) {
    parts.push("requires_risk");
  }
  if (rule.requires_red_team === true) {
    const assignedCase =
      typeof rule.red_team_assigned_case === "string" ? rule.red_team_assigned_case.trim() : "";
    parts.push(assignedCase ? `requires_red_team (${assignedCase})` : "requires_red_team");
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function getMeetingCatalogue(
  filters: { personaId?: string } = {},
): Promise<MeetingsRead<MeetingCatalogueData>> {
  const query = filters.personaId?.trim() ? { persona_id: filters.personaId.trim() } : undefined;
  return readMeetingsSurface<MeetingCatalogueData>(
    () =>
      bffFetch({
        method: "GET",
        path: paths.mgmtMeetingCatalogue(),
        query,
      }),
    (raw) => {
      const data = isRecord(raw.data) ? raw.data : raw;
      const typesRaw = Array.isArray(data.types) ? data.types : Array.isArray(raw.types) ? raw.types : undefined;
      const scheduleRaw = Array.isArray(data.schedule)
        ? data.schedule
        : Array.isArray(raw.schedule)
          ? raw.schedule
          : [];
      const refusalsRaw = Array.isArray(data.refusals)
        ? data.refusals
        : Array.isArray(raw.refusals)
          ? raw.refusals
          : [];
      if (!typesRaw) return undefined;
      return {
        types: typesRaw.filter(isRecord) as unknown as MeetingTypeRule[],
        schedule: scheduleRaw.filter(isRecord) as unknown as MeetingScheduleEntry[],
        refusals: refusalsRaw.filter(isRecord) as unknown as MeetingRefusalEntry[],
        summary: isRecord(data.summary) ? (data.summary as MeetingCatalogueData["summary"]) : undefined,
      };
    },
  );
}

export function mgmtMeetingReviewPath(meetingId: string): string {
  return `${paths.mgmtMeetingDetail(meetingId)}/review`;
}

export function resolveMeetingReviewCause(
  cleaned: Record<string, unknown>,
  synthesis?: MeetingSynthesis | null,
): string | null {
  const opReview = isRecord(cleaned.operator_review) ? cleaned.operator_review : null;
  const candidates = [
    cleaned.synthesis_unreadable_reason,
    cleaned.unreadable_reason,
    synthesis?.unreadable_reason,
    synthesis?.cause,
    opReview?.cause,
    opReview?.unreadable_reason,
  ];
  for (const cand of candidates) {
    if (typeof cand === "string" && cand.trim()) {
      return cand.trim();
    }
  }
  const outcome = String(cleaned.outcome ?? synthesis?.outcome ?? "").trim().toUpperCase();
  const status = String(cleaned.status ?? "").trim().toUpperCase();
  if (outcome === "REVIEW" || status === "REVIEW" || opReview !== null) {
    return "unknown";
  }
  return null;
}

export function normalizeOperatorReview(
  raw: unknown,
  fallbackCause?: string | null,
): MeetingOperatorReview | null {
  if (!isRecord(raw)) return null;
  const status = String(raw.status ?? "").trim().toLowerCase();
  const noteRaw = raw.note ?? raw.rationale;
  const note = typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null;
  const reviewedByRaw = raw.reviewed_by ?? raw.reviewedBy ?? raw.actor ?? raw.decided_by;
  const reviewedBy =
    typeof reviewedByRaw === "string" && reviewedByRaw.trim() ? reviewedByRaw.trim() : null;
  const reviewedAtRaw = raw.reviewed_at ?? raw.reviewedAt ?? raw.decided_at ?? raw.timestamp;
  const reviewedAt =
    typeof reviewedAtRaw === "string" && reviewedAtRaw.trim() ? reviewedAtRaw.trim() : null;
  const causeRaw = raw.cause ?? raw.unreadable_reason;
  const cause =
    (typeof causeRaw === "string" && causeRaw.trim() ? causeRaw.trim() : null) ??
    (fallbackCause && fallbackCause.trim() ? fallbackCause.trim() : "unknown");

  if (status === "reviewed" || (note && (reviewedBy || reviewedAt))) {
    const disposition =
      typeof raw.disposition === "string" && raw.disposition.trim()
        ? raw.disposition.trim()
        : "closed_no_proposal";
    return {
      ...raw,
      status: "reviewed",
      disposition,
      note,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      cause,
      unreadable_reason: cause,
    };
  }
  if (status === "pending") {
    return {
      ...raw,
      status: "pending",
      disposition: null,
      note: null,
      reviewed_by: null,
      reviewed_at: null,
      cause,
      unreadable_reason: cause,
    };
  }
  return null;
}

export function collectMeetingEvidenceRefs(cleaned: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  const pushRef = (val: unknown) => {
    if (typeof val === "string") {
      const s = val.trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        refs.push(s);
      }
      return;
    }
    if (isRecord(val)) {
      for (const k of ["ref", "evidence_ref", "ref_id", "item_id", "id", "source_id", "record_id"]) {
        const s = typeof val[k] === "string" ? val[k].trim() : "";
        if (s) {
          if (!seen.has(s)) {
            seen.add(s);
            refs.push(s);
          }
          return;
        }
      }
    }
  };

  if (Array.isArray(cleaned.evidence_refs)) {
    for (const r of cleaned.evidence_refs) pushRef(r);
  }
  if (Array.isArray(cleaned.case_file_items)) {
    for (const cf of cleaned.case_file_items) {
      if (isRecord(cf)) pushRef(cf.item_id ?? cf.source_id ?? cf.id);
    }
  }
  const preRead = cleaned.pre_read;
  const preReadItems = Array.isArray(preRead)
    ? preRead
    : isRecord(preRead)
      ? Array.isArray(preRead.interpretations)
        ? preRead.interpretations
        : Array.isArray(preRead.items)
          ? preRead.items
          : []
      : [];
  for (const interp of preReadItems) {
    if (isRecord(interp) && Array.isArray(interp.citations)) {
      for (const c of interp.citations) pushRef(c);
    }
  }
  if (Array.isArray(cleaned.rounds)) {
    for (const rnd of cleaned.rounds) {
      if (isRecord(rnd) && Array.isArray(rnd.positions)) {
        for (const pos of rnd.positions) {
          if (isRecord(pos) && Array.isArray(pos.citations)) {
            for (const c of pos.citations) pushRef(c);
          }
        }
      }
    }
  }
  if (isRecord(cleaned.synthesis) && typeof cleaned.synthesis.dissent_memo_id === "string") {
    pushRef(cleaned.synthesis.dissent_memo_id);
  }
  if (typeof cleaned.attribution_record_id === "string") {
    pushRef(cleaned.attribution_record_id);
  } else if (isRecord(cleaned.attribution_record) && typeof cleaned.attribution_record.record_id === "string") {
    pushRef(cleaned.attribution_record.record_id);
  }
  return refs;
}


const MEETING_ACTION_STATES: readonly MeetingActionState[] = [
  "open", "in_progress", "waiting_human_input", "submitted", "returned", "accepted",
];

function optText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function normalizeMeetingAction(raw: unknown): MeetingActionItem | null {
  if (!isRecord(raw)) return null;
  const actionId = optText(raw.action_id) ?? optText(raw.ticket_id) ?? optText(raw.id);
  if (!actionId) return null;
  const rawState = String(raw.state ?? raw.status ?? "").trim().toLowerCase();
  const state = (MEETING_ACTION_STATES as readonly string[]).includes(rawState)
    ? (rawState as MeetingActionState)
    : "unknown";
  const refs = Array.isArray(raw.evidence_refs)
    ? raw.evidence_refs
        .map((r) => (typeof r === "string" ? r : isRecord(r) ? optText(r.href ?? r.ref ?? r.id) : null))
        .filter((r): r is string => Boolean(r))
    : [];
  const review = isRecord(raw.review) ? raw.review : {};
  const owner = isRecord(raw.assignee) ? raw.assignee : {};
  const executedRaw = raw.executed;
  // Never treat a missing signal as "executed": only a submitted result or explicit flag counts.
  const executed =
    typeof executedRaw === "boolean"
      ? executedRaw
      : state === "submitted" || state === "accepted" || (state === "returned" && refs.length > 0);
  return {
    action_id: actionId,
    origin_meeting_id: optText(raw.origin_meeting_id ?? raw.meeting_id),
    title: optText(raw.title),
    owner_label: optText(raw.assignee_label ?? raw.owner_label ?? owner.display_name ?? owner.label ?? raw.assignee),
    owner_kind: optText(raw.assignee_kind ?? owner.kind),
    deliverable: optText(raw.deliverable),
    acceptance_criterion: optText(raw.acceptance_criterion),
    due_at: optText(raw.due_at),
    next_review: optText(raw.next_review),
    state,
    executed,
    evidence_refs: refs,
    review_reason: optText(raw.review_reason ?? review.reason),
    review_source: optText(raw.review_source ?? review.source),
    required_actor: optText(raw.required_actor),
    next_transition: optText(raw.next_transition),
    missing_input: optText(raw.missing_input ?? raw.requested_material),
    ticket_href: optText(raw.ticket_href),
    downstream_ref: optText(raw.downstream_ref),
    decision_kind: optText(raw.decision_kind),
  };
}

function normalizeMeetingActionList(raw: unknown): MeetingActionItem[] {
  return Array.isArray(raw)
    ? raw.map(normalizeMeetingAction).filter((a): a is MeetingActionItem => a !== null)
    : [];
}

/** Owner unavailable, empty, and permission denied stay distinct. */
export function normalizePriorActions(raw: unknown): MeetingActionsRead | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) return { state: "ok", items: normalizeMeetingActionList(raw) };
  if (!isRecord(raw)) return undefined;
  const status = String(raw.status ?? raw.state ?? "").trim().toLowerCase();
  const reason = optText(raw.reason) ?? "unknown";
  if (status === "forbidden" || status === "permission_denied") return { state: "forbidden", reason };
  if (status === "unavailable" || status === "error") return { state: "unavailable", reason };
  if (Array.isArray(raw.items)) return { state: "ok", items: normalizeMeetingActionList(raw.items) };
  return undefined;
}

function normalizeCapabilities(raw: unknown): MeetingParticipantCapability[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(isRecord).map((c, i) => ({
    label: optText(c.label ?? c.participant_label) ?? optText(c.persona_display_name) ?? `#${i + 1}`,
    persona_id: optText(c.persona_id),
    limits: Array.isArray(c.limits ?? c.limitations)
      ? ((c.limits ?? c.limitations) as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim())
      : [],
  }));
}

export interface MeetingActionResponseInput {
  ticketId: string;
  /** Owner-provided next transition: `submit` (human deliverable) or `provide_input` (Persona resume). */
  transition: string;
  evidenceNote?: { title: string; body: string };
  evidenceRefs?: string[];
  revision?: string | number;
}

export const MEETING_ACTION_NOTE_TITLE_MAX = 120;
export const MEETING_ACTION_NOTE_BODY_MAX = 2000;
export const MEETING_ACTION_TRANSITIONS: readonly string[] = ["submit", "provide_input"];

export type MeetingActionFieldError = "transition" | "note_required" | "title_too_long" | "body_too_long";

export function validateMeetingActionResponse(input: MeetingActionResponseInput): MeetingActionFieldError | null {
  if (!MEETING_ACTION_TRANSITIONS.includes(input.transition)) return "transition";
  const title = input.evidenceNote?.title.trim() ?? "";
  const body = input.evidenceNote?.body.trim() ?? "";
  const hasRefs = (input.evidenceRefs?.length ?? 0) > 0;
  if (!title && !body && !hasRefs) return "note_required";
  if (!hasRefs && (!title || !body)) return "note_required";
  if (title.length > MEETING_ACTION_NOTE_TITLE_MAX) return "title_too_long";
  if (body.length > MEETING_ACTION_NOTE_BODY_MAX) return "body_too_long";
  return null;
}

export type MeetingActionResponseResult =
  | { state: "ok"; action: MeetingActionItem | null; replayed: boolean }
  | { state: "invalid"; reason: MeetingActionFieldError }
  | { state: "conflict"; reason: string }
  | { state: "forbidden"; reason: string }
  | { state: "unavailable"; reason: string };

/**
 * Human response on the ORIGINAL research ticket (no new page, no new backend id).
 * The owner binds the note idempotently; retries must reuse `idempotencyKey`.
 */
export async function submitMeetingActionResponse(
  input: MeetingActionResponseInput,
  idempotencyKey?: string,
): Promise<MeetingActionResponseResult> {
  const invalid = validateMeetingActionResponse(input);
  if (invalid) return { state: "invalid", reason: invalid };
  const ticketId = input.ticketId.trim();
  if (!ticketId) return { state: "unavailable", reason: "missing_ticket_id" };
  if (shouldCheckLiveWriteGate()) {
    const allowed = await liveWriteGated();
    if (!allowed) return { state: "unavailable", reason: "live_write_gate_closed" };
  }
  const note = input.evidenceNote;
  const body: Record<string, unknown> = {
    transition: input.transition,
    ...(note && (note.title.trim() || note.body.trim())
      ? { evidence_note: { title: note.title.trim(), body: note.body.trim() } }
      : {}),
    ...(input.evidenceRefs?.length ? { evidence_refs: input.evidenceRefs } : {}),
    ...(input.revision !== undefined ? { revision: input.revision } : {}),
  };
  try {
    const raw = await bffFetch({
      method: "PATCH",
      path: `/api/v1/research/tickets/${encodeURIComponent(ticketId)}`,
      body,
      idempotencyKey: idempotencyKey?.trim() || mintIdempotencyKey(),
    });
    const rec = isRecord(raw) ? raw : {};
    const data = isRecord(rec.data) ? rec.data : rec;
    const ticket = isRecord(data.ticket) ? data.ticket : data;
    const action = normalizeMeetingAction({ ...ticket, action_id: ticket.action_id ?? ticket.ticket_id ?? ticketId });
    const replayed = rec.replayed === true || data.replayed === true || (isRecord(rec.meta) && rec.meta.replayed === true);
    return { state: "ok", action, replayed };
  } catch (err) {
    if (err instanceof BffError) {
      const reason = extractErrorReason(err);
      if (err.status === 409 || err.status === 412) return { state: "conflict", reason };
      if (err.status === 401 || err.status === 403) return { state: "forbidden", reason };
      return { state: "unavailable", reason };
    }
    return { state: "unavailable", reason: err instanceof Error && err.message.trim() ? err.message.trim() : MEETINGS_REASON_UNKNOWN };
  }
}

function normalizeMeetingDetailPayload(raw: Record<string, unknown>): MeetingDetail | undefined {
  const data = isRecord(raw.data) ? raw.data : raw;
  const resolvedId = String(data.meeting_id ?? data.id ?? raw.meeting_id ?? raw.id ?? "").trim();
  if (!resolvedId) return undefined;
  const cleaned = stripPrivateMemory(data);
  const synthesisRaw = isRecord(cleaned.synthesis)
    ? (cleaned.synthesis as unknown as MeetingSynthesis)
    : null;
  const reviewCause = resolveMeetingReviewCause(cleaned, synthesisRaw);
  const synthesis = synthesisRaw
    ? {
        ...synthesisRaw,
        ...(reviewCause && synthesisRaw.unreadable_reason === undefined
          ? { unreadable_reason: reviewCause }
          : {}),
        ...(reviewCause && synthesisRaw.cause === undefined ? { cause: reviewCause } : {}),
      }
    : null;
  const operatorReview = normalizeOperatorReview(cleaned.operator_review, reviewCause);
  const proposalsRaw = Array.isArray(cleaned.proposals)
    ? cleaned.proposals
    : Array.isArray(synthesis?.proposals)
      ? synthesis.proposals
      : [];
  const evidenceRefs = collectMeetingEvidenceRefs(cleaned);
  const replayed =
    typeof cleaned.replayed === "boolean"
      ? cleaned.replayed
      : typeof raw.replayed === "boolean"
        ? raw.replayed
        : isRecord(raw.meta) && typeof raw.meta.replayed === "boolean"
          ? raw.meta.replayed
          : undefined;
  return {
    ...cleaned,
    id: resolvedId,
    meeting_id: resolvedId,
    meeting_type: String(cleaned.meeting_type ?? cleaned.type ?? ""),
    status: String(cleaned.status ?? ""),
    ...(reviewCause !== null
      ? {
          unreadable_reason:
            typeof cleaned.unreadable_reason === "string" && cleaned.unreadable_reason.trim()
              ? cleaned.unreadable_reason.trim()
              : reviewCause,
          synthesis_unreadable_reason:
            typeof cleaned.synthesis_unreadable_reason === "string" &&
            cleaned.synthesis_unreadable_reason.trim()
              ? cleaned.synthesis_unreadable_reason.trim()
              : reviewCause,
        }
      : {}),
    operator_review: operatorReview,
    evidence_refs: evidenceRefs,
    participants: Array.isArray(cleaned.participants)
      ? (cleaned.participants.filter(isRecord) as unknown as MeetingParticipant[])
      : [],
    case_file_items: Array.isArray(cleaned.case_file_items)
      ? (cleaned.case_file_items.filter(isRecord) as unknown as MeetingCaseFileItem[])
      : [],
    rounds: Array.isArray(cleaned.rounds)
      ? cleaned.rounds.filter(isRecord).map((round) => ({
          ...round,
          positions: Array.isArray(round.positions) ? round.positions.filter(isRecord) : [],
        }) as unknown as MeetingRound)
      : [],
    synthesis,
    adopted_actions: normalizeMeetingActionList(
      cleaned.adopted_actions ?? cleaned.actions ?? synthesis?.actions,
    ),
    ...(normalizePriorActions(cleaned.prior_actions) !== undefined
      ? { prior_actions: normalizePriorActions(cleaned.prior_actions) }
      : {}),
    no_action_reason: optText(cleaned.no_action_reason ?? synthesis?.no_action_reason),
    ...(normalizeCapabilities(cleaned.participant_capabilities) !== undefined
      ? { participant_capabilities: normalizeCapabilities(cleaned.participant_capabilities) }
      : {}),
    proposals: proposalsRaw.filter(isRecord) as unknown as MeetingProposalItem[],
    writebacks: Array.isArray(cleaned.writebacks)
      ? (cleaned.writebacks.filter(isRecord) as unknown as MeetingWritebackEntry[])
      : [],
    ...(replayed !== undefined ? { replayed } : {}),
  } as MeetingDetail;
}

export function getMeetingDetail(meetingId: string): Promise<MeetingsRead<MeetingDetail>> {
  return readMeetingsSurface<MeetingDetail>(
    () =>
      bffFetch({
        method: "GET",
        path: paths.mgmtMeetingDetail(meetingId),
      }),
    normalizeMeetingDetailPayload,
  );
}

export function buildFollowUpConveneInput(
  detail: Pick<
    MeetingDetail,
    | "meeting_id"
    | "meeting_type"
    | "topic"
    | "chair_persona_id"
    | "participants"
    | "subject_ref"
    | "evidence_refs"
    | "attribution_record_id"
  >,
): ConveneMeetingInput {
  const meetingType = String(detail.meeting_type || "MT-1").trim() || "MT-1";
  const baseTopic = String(detail.topic ?? "").trim();
  const topic = baseTopic
    ? `${baseTopic} (follow-up research for ${detail.meeting_id})`
    : `Follow-up research for ${detail.meeting_id}`;
  const participantIds = Array.from(
    new Set(
      [
        ...(Array.isArray(detail.participants)
          ? detail.participants.map((p) => String(p.persona_id ?? "").trim())
          : []),
        String(detail.chair_persona_id ?? "").trim(),
      ].filter(Boolean),
    ),
  );
  const evidenceRefs =
    Array.isArray(detail.evidence_refs) && detail.evidence_refs.length > 0
      ? detail.evidence_refs
      : [detail.meeting_id];
  return {
    meeting_type: meetingType,
    topic,
    ...(participantIds.length > 0 ? { participants: participantIds } : {}),
    subject_ref: detail.subject_ref ?? { source_meeting_id: detail.meeting_id },
    evidence_refs: evidenceRefs,
    ...(detail.attribution_record_id ? { attribution_record_id: detail.attribution_record_id } : {}),
  };
}

function shouldCheckLiveWriteGate(): boolean {
  if (detectMode() === "live") return true;
  if (!getMockResolver()) return true;
  const env = readBffEnv();
  return env?.VITE_BFF_REAL_WRITES !== undefined;
}

export async function conveneMeeting(
  input: ConveneMeetingInput,
  idempotencyKey?: string,
): Promise<MeetingsRead<ConveneMeetingReceipt>> {
  if (shouldCheckLiveWriteGate()) {
    const allowed = await liveWriteGated();
    if (!allowed) {
      return { state: "unavailable", reason: "live_write_gate_closed", owner: "consultation" };
    }
  }
  const key = idempotencyKey?.trim() || mintIdempotencyKey();
  return readMeetingsSurface<ConveneMeetingReceipt>(
    () =>
      bffFetch({
        method: "POST",
        path: paths.mgmtMeetingConvene(),
        body: input,
        idempotencyKey: key,
      }),
    (raw) => {
      const data = isRecord(raw.data) ? raw.data : raw;
      const meetingId = String(data.meeting_id ?? raw.meeting_id ?? data.id ?? "").trim();
      if (!meetingId) return undefined;
      return {
        ...data,
        meeting_id: meetingId,
        status: String(data.status ?? raw.status ?? "convened"),
      } as ConveneMeetingReceipt;
    },
  );
}

export async function reviewMeeting(
  meetingId: string,
  input: ReviewMeetingInput,
  idempotencyKey?: string,
): Promise<MeetingsRead<MeetingDetail>> {
  const cleanId = String(meetingId ?? "").trim();
  if (!cleanId) {
    return { state: "not_found", reason: "missing_meeting_id", owner: "consultation" };
  }
  const cleanNote = String(input?.note ?? "").trim();
  if (!cleanNote) {
    return { state: "unavailable", reason: "review_note_required", owner: "consultation" };
  }
  if (countMeetingReviewNoteChars(cleanNote) > MEETING_OPERATOR_REVIEW_NOTE_MAX_CHARS) {
    return { state: "unavailable", reason: "review_note_too_long", owner: "consultation" };
  }
  if (shouldCheckLiveWriteGate()) {
    const allowed = await liveWriteGated();
    if (!allowed) {
      return { state: "unavailable", reason: "live_write_gate_closed", owner: "consultation" };
    }
  }
  const key = idempotencyKey?.trim() || mintIdempotencyKey();
  const res = await readMeetingsSurface<MeetingDetail>(
    () =>
      bffFetch({
        method: "POST",
        path: mgmtMeetingReviewPath(cleanId),
        body: { note: cleanNote },
        idempotencyKey: key,
      }),
    normalizeMeetingDetailPayload,
  );
  if (res.state === "ok") {
    const inboxItemId = `meeting_review:${cleanId}`;
    const matchInboxQuery = (q: {
      queryKey: readonly unknown[];
      state?: { data?: unknown };
    }) => {
      const keyMatch = q.queryKey.some((part) => {
        if (typeof part !== "string") return false;
        const lower = part.toLowerCase();
        return (
          lower.includes("humaninbox") ||
          lower.includes("human_inbox") ||
          lower.includes("human-inbox") ||
          lower.includes("humangate") ||
          lower.includes("human_gate") ||
          lower.includes("human-gate") ||
          lower.includes("governancedecisionqueue") ||
          lower.includes("inbox") ||
          lower === "v5.live.anonymous" ||
          part === cleanId ||
          part === inboxItemId
        );
      });
      if (keyMatch) return true;
      const data = q.state?.data;
      if (Array.isArray(data)) {
        return data.some(
          (entry) =>
            (typeof entry === "string" &&
              (entry === inboxItemId || entry === cleanId || entry.includes(cleanId))) ||
            (isRecord(entry) &&
              (entry.id === inboxItemId ||
                entry.inbox_id === inboxItemId ||
                entry.meetingId === cleanId ||
                entry.meeting_id === cleanId ||
                entry.kind === "meeting_review")),
        );
      }
      if (isRecord(data)) {
        return (
          data.id === inboxItemId ||
          data.inbox_id === inboxItemId ||
          data.meetingId === cleanId ||
          data.meeting_id === cleanId
        );
      }
      return false;
    };
    const clients = new Set<QueryClient>([getSharedQueryClient(), ...knownQueryClients]);
    for (const qc of clients) {
      try {
        await qc.invalidateQueries({ predicate: matchInboxQuery });
        qc.removeQueries({ predicate: matchInboxQuery, type: "inactive" });
      } catch {
        // Query client invalidation is best-effort per client.
      }
    }
    try {
      emitV5Event({
        channel: "oversight.humanInbox",
        type: "meeting_review.resolved",
        payload: {
          meeting_id: cleanId,
          inbox_id: inboxItemId,
          operator_review: res.data.operator_review ?? null,
        },
      });
    } catch {
      // Realtime event emission is best-effort.
    }
  }
  return res;
}

export const meetings = {
  list: getMeetings,
  proposals: getMeetingProposals,
  catalogue: getMeetingCatalogue,
  detail: getMeetingDetail,
  convene: conveneMeeting,
  review: reviewMeeting,
};
