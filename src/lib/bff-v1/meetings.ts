// Management & Agora deliberative persona meetings client (FE-MANAGEMENT-MEETINGS-20261115).
// Thin typed client over the BFF meetings routes (/bff/management/meetings*).
// The BFF keeps no meeting store and forwards reads and operator convening to
// the consultation service. Unavailable owner data is surfaced explicitly as
// `unavailable` with the recorded reason; unknown meeting IDs surface as `not_found`.
// Private memory is stripped everywhere as defense-in-depth.

import { bffFetch, detectMode, getMockResolver } from "./client";
import { BffError } from "./errors";
import { idempotencyKey as mintIdempotencyKey } from "./headers";
import { paths } from "./paths";
import { readBffEnv } from "./runtimeEnv";
import { liveWriteGated } from "./writeGate";

export type MeetingsRead<T> =
  | { state: "ok"; data: T; owner?: string; meta?: Record<string, unknown> }
  | { state: "not_found"; reason: string; owner?: string }
  | { state: "unavailable"; reason: string; owner?: string };

export const MEETINGS_REASON_UNKNOWN = "consultation_owner_unavailable";

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

export function stripPrivateMemory<T>(obj: T): T {
  if (Array.isArray(obj)) {
    const out: unknown[] = [];
    for (const elem of obj) {
      if (isRecord(elem) && isPrivateMemoryItem(elem)) continue;
      const stripped = stripPrivateMemory(elem);
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
      const stripped = stripPrivateMemory(v);
      if (stripped !== undefined || v === null) {
        cleaned[k] = stripped;
      }
    }
    return cleaned as unknown as T;
  }
  return obj;
}

function extractErrorReason(err: BffError): string {
  const details = err.envelope?.error?.details;
  if (isRecord(details) && typeof details.reason === "string" && details.reason) {
    return details.reason;
  }
  if (err.envelope?.error?.cause) return err.envelope.error.cause;
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
    return { state: "unavailable", reason: MEETINGS_REASON_UNKNOWN };
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

export interface MeetingSummaryItem {
  id?: string;
  meeting_id: string;
  meeting_type: string;
  topic?: string;
  status: string;
  outcome?: string | null;
  chair_persona_id?: string | null;
  convened_by?: MeetingConvenedBy | null;
  subject_ref?: Record<string, unknown> | string | null;
  participants: MeetingParticipant[];
  participant_count?: number;
  has_agora_participants?: boolean;
  has_private_servant?: boolean;
  round?: number;
  created_at?: string;
  closed_at?: string | null;
  href?: string;
  [key: string]: unknown;
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
  summary?: string;
  title?: string;
  downstream: MeetingProposalDownstream;
  created_at?: string;
  [key: string]: unknown;
}

export interface MeetingProposalsData {
  items: MeetingProposalItem[];
}

export interface MeetingTypeRule {
  meeting_type: string;
  name?: string;
  purpose?: string;
  enabled: boolean;
  cadence?: string;
  weekly_cadence_day?: string;
  roster_rule?: string;
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
  meeting_type: string;
  last_run_at?: string | null;
  next_due_at?: string | null;
  weekly_count?: number;
  weekly_limit?: number;
  [key: string]: unknown;
}

export interface MeetingRefusalEntry {
  persona_id?: string | null;
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
  relevance_scope?: string;
  text?: string;
  summary?: string;
  citations?: string[];
  [key: string]: unknown;
}

export interface MeetingRoundPosition {
  label: string;
  persona_id?: string;
  revealed_persona_id?: string;
  role?: string;
  style?: string;
  stance?: string;
  confidence?: number;
  citations?: string[];
  changed?: boolean;
  accepts?: string | string[];
  disputes?: string | string[];
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
    support?: number;
    dissent?: number;
    binding?: boolean;
    [key: string]: unknown;
  } | null;
  dissent_memo_id?: string | null;
  dissent_summary?: string | null;
  outcome?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface MeetingWritebackEntry {
  persona_id: string;
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

export interface MeetingDetail extends MeetingSummaryItem {
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
}

export function getMeetings(filters: ListMeetingsFilters = {}): Promise<MeetingsRead<MeetingsListData>> {
  const query: Record<string, string | number | undefined> = {};
  if (filters.status?.trim()) query.status = filters.status.trim();
  if (filters.type?.trim()) query.type = filters.type.trim();
  if (filters.personaId?.trim()) query.persona_id = filters.personaId.trim();
  if (filters.cursor?.trim()) query.cursor = filters.cursor.trim();
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

export function getMeetingDetail(meetingId: string): Promise<MeetingsRead<MeetingDetail>> {
  return readMeetingsSurface<MeetingDetail>(
    () =>
      bffFetch({
        method: "GET",
        path: paths.mgmtMeetingDetail(meetingId),
      }),
    (raw) => {
      const data = isRecord(raw.data) ? raw.data : raw;
      const resolvedId = String(data.meeting_id ?? data.id ?? raw.meeting_id ?? raw.id ?? "").trim();
      if (!resolvedId) return undefined;
      const cleaned = stripPrivateMemory(data);
      const synthesis = isRecord(cleaned.synthesis)
        ? (cleaned.synthesis as unknown as MeetingSynthesis)
        : null;
      const proposalsRaw = Array.isArray(cleaned.proposals)
        ? cleaned.proposals
        : Array.isArray(synthesis?.proposals)
          ? synthesis.proposals
          : [];
      return {
        ...cleaned,
        id: resolvedId,
        meeting_id: resolvedId,
        meeting_type: String(cleaned.meeting_type ?? cleaned.type ?? ""),
        status: String(cleaned.status ?? ""),
        participants: Array.isArray(cleaned.participants)
          ? (cleaned.participants.filter(isRecord) as unknown as MeetingParticipant[])
          : [],
        case_file_items: Array.isArray(cleaned.case_file_items)
          ? (cleaned.case_file_items.filter(isRecord) as unknown as MeetingCaseFileItem[])
          : [],
        rounds: Array.isArray(cleaned.rounds)
          ? (cleaned.rounds.filter(isRecord) as unknown as MeetingRound[])
          : [],
        synthesis,
        proposals: proposalsRaw.filter(isRecord) as unknown as MeetingProposalItem[],
        writebacks: Array.isArray(cleaned.writebacks)
          ? (cleaned.writebacks.filter(isRecord) as unknown as MeetingWritebackEntry[])
          : [],
      } as MeetingDetail;
    },
  );
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

export const meetings = {
  list: getMeetings,
  proposals: getMeetingProposals,
  catalogue: getMeetingCatalogue,
  detail: getMeetingDetail,
  convene: conveneMeeting,
};
