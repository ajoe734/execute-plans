// Agora learning surfaces (committee, memory review, persona lab, evaluation,
// change log, shadow comparison, human feedback). Thin typed client over the
// restored BFF routes. Unavailable owner data is surfaced as `unavailable`
// with the recorded reason; nothing is defaulted, synthesised or cached here.
import { bffFetch } from "../client";
import { BffError } from "../errors";
import { paths } from "../paths";
import type { CaseFileView } from "../caseFile";

export type LearningRead<T> =
  | { state: "ok"; data: T; owner?: string }
  | { state: "unavailable"; reason: string; owner?: string };

export const REASON_UNKNOWN = "owner_unavailable";

const PRIVATE_SCOPES = new Set(["persona_private", "private_user", "user_private", "private"]);
const PRIVATE_SCOPE_KEYS = ["relevance_scope", "memory_layer", "scope", "memory_scope", "visibility_scope", "owner_scope"] as const;
const PRIVATE_FIELD_KEYS = new Set(["private_memory", "persona_private_memory"]);

export function isPrivateMemoryObject(item: Record<string, unknown>): boolean {
  for (const key of PRIVATE_SCOPE_KEYS) {
    const val = item[key];
    if (typeof val === "string" && PRIVATE_SCOPES.has(val.trim().toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function stripPrivateMemory<T>(value: T): T {
  if (Array.isArray(value)) {
    const filtered = value
      .filter((item) => !(item && typeof item === "object" && !Array.isArray(item) && isPrivateMemoryObject(item as Record<string, unknown>)))
      .map((item) => stripPrivateMemory(item));
    return filtered as unknown as T;
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (PRIVATE_FIELD_KEYS.has(k)) continue;
      if (v && typeof v === "object" && !Array.isArray(v) && isPrivateMemoryObject(v as Record<string, unknown>)) {
        continue;
      }
      out[k] = stripPrivateMemory(v);
    }
    return out as T;
  }
  return value;
}

function extractErrorReason(body: Record<string, unknown>): { reason: string; owner?: string } | null {
  const topOwner = typeof body.owner === "string" ? body.owner : undefined;
  if (body.status === "unavailable") {
    const r = typeof body.reason === "string" && body.reason ? body.reason : REASON_UNKNOWN;
    return { reason: r, owner: topOwner };
  }
  if (typeof body.detail === "string" && body.detail.trim()) {
    return { reason: body.detail.trim(), owner: topOwner };
  }
  if (body.detail && typeof body.detail === "object" && !Array.isArray(body.detail)) {
    const detail = body.detail as Record<string, unknown>;
    const detailOwner = typeof detail.owner === "string" ? detail.owner : topOwner;
    if (typeof detail.reason === "string" && detail.reason.trim()) {
      return { reason: detail.reason.trim(), owner: detailOwner };
    }
    if (detail.error && typeof detail.error === "object" && !Array.isArray(detail.error)) {
      const errObj = detail.error as Record<string, unknown>;
      const detailsObj = errObj.details && typeof errObj.details === "object" && !Array.isArray(errObj.details)
        ? (errObj.details as Record<string, unknown>)
        : undefined;
      const r = (typeof errObj.cause === "string" && errObj.cause)
        || (detailsObj && typeof detailsObj.reason === "string" && detailsObj.reason)
        || (typeof errObj.code === "string" && errObj.code)
        || (typeof errObj.message === "string" && errObj.message);
      if (r) return { reason: r, owner: detailOwner };
    }
  }
  if (body.error && typeof body.error === "object" && !Array.isArray(body.error)) {
    const errObj = body.error as Record<string, unknown>;
    const detailsObj = errObj.details && typeof errObj.details === "object" && !Array.isArray(errObj.details)
      ? (errObj.details as Record<string, unknown>)
      : undefined;
    const r = (typeof errObj.cause === "string" && errObj.cause)
      || (detailsObj && typeof detailsObj.reason === "string" && detailsObj.reason)
      || (typeof errObj.code === "string" && errObj.code)
      || (typeof errObj.message === "string" && errObj.message);
    if (r) return { reason: r, owner: topOwner };
  }
  return null;
}

/** Run a read; HTTP failures and `status: unavailable` envelopes become `unavailable` with a reason. */
async function read<T>(fn: () => Promise<unknown>, pick: (raw: Record<string, unknown>) => T | undefined): Promise<LearningRead<T>> {
  let raw: unknown;
  try {
    raw = await fn();
  } catch (err) {
    if (err instanceof BffError) {
      const detailReason = err.details && typeof err.details.reason === "string" && err.details.reason
        ? err.details.reason
        : undefined;
      return { state: "unavailable", reason: err.envelope.error.cause ?? detailReason ?? err.code };
    }
    return { state: "unavailable", reason: REASON_UNKNOWN };
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const owner = typeof body.owner === "string" ? body.owner : undefined;
  const errReason = extractErrorReason(body);
  if (errReason) {
    return { state: "unavailable", reason: errReason.reason, owner: errReason.owner ?? owner };
  }
  const data = pick(body);
  if (data === undefined) {
    const fallbackReason = typeof body.reason === "string" && body.reason ? body.reason : "invalid_owner_response";
    return { state: "unavailable", reason: fallbackReason, owner };
  }
  return { state: "ok", data, owner };
}

const arr = <T>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v as T[]) : undefined);
const dataObj = <T>(raw: Record<string, unknown>): T | undefined =>
  raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? (raw.data as T) : undefined;

// ─── Committee & Deliberative Persona Meetings ──────────────────────────────

export type DeliberativeMeetingType =
  | "MT-1"
  | "MT-2"
  | "MT-3"
  | "MT-4"
  | "MT-5"
  | "MT-6"
  | "pool_evolution_review"
  | "optimisation_review"
  | "optimization_review"
  | "strategy_ideation"
  | "performance_attribution_review"
  | "post_mortem"
  | "regime_interpretation"
  | "quarterly_review";

export const DELIBERATIVE_MEETING_TYPE_OPTIONS: ReadonlyArray<{ value: DeliberativeMeetingType; label: string }> = [
  { value: "MT-1", label: "MT-1 · Pool Evolution Review (池子演進會議)" },
  { value: "MT-2", label: "MT-2 · Optimisation Review (優化會議)" },
  { value: "MT-3", label: "MT-3 · Strategy Ideation (新策略發想會議)" },
  { value: "MT-4", label: "MT-4 · Performance Attribution Review (績效歸因檢討)" },
  { value: "MT-5", label: "MT-5 · Regime Interpretation (盤勢研判會議)" },
  { value: "MT-6", label: "MT-6 · Quarterly Review (季度檢討會議)" },
];

export interface CommitteeParticipant {
  persona_id: string;
  role?: string;
  origin?: "institutional" | "agora_advisor" | "private_servant" | string;
  agora_user_id?: string;
  [key: string]: unknown;
}

export interface CommitteePosition {
  label?: string | null;
  persona_id?: string | null;
  role?: string | null;
  style?: string | null;
  stance?: string | null;
  confidence?: number | null;
  citations?: string[];
  changed?: boolean;
  [key: string]: unknown;
}

export interface CommitteeRound {
  round: number;
  mode?: string;
  positions: CommitteePosition[];
  [key: string]: unknown;
}

export interface CommitteeMeetingProposal {
  proposal_id: string;
  meeting_id?: string;
  kind?: string;
  sponsor_persona_id?: string | null;
  approval_path?: "agora_candidate_decision" | "governed_owner_entry_point" | string;
  approval_status?: string;
  status?: string;
  payload?: Record<string, unknown>;
  citations?: string[];
  downstream?: {
    target?: string;
    id?: string | null;
    status?: string;
  };
  execution_authority?: string;
  [key: string]: unknown;
}

export interface CommitteeSynthesis {
  proposals?: CommitteeMeetingProposal[];
  tally?: {
    support?: number;
    oppose?: number;
    [key: string]: unknown;
  } | null;
  dissent_memo_id?: string | null;
  dissent?: string | Record<string, unknown> | null;
  outcome?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface CommitteeSession {
  request_id: string;
  session_id?: string;
  meeting_id?: string;
  tenant_id?: string;
  consultation_type?: "persona_panel" | "persona_meeting" | string;
  session_class?: "gate_panel" | "deliberative_meeting" | string;
  meeting_type?: string;
  status?: string;
  outcome?: string | null;
  topic?: string;
  agenda?: string;
  question?: string;
  requester_persona_id?: string;
  from_persona_id?: string;
  chair_persona_id?: string | null;
  convened_by?: { kind?: string; id?: string } | null;
  subject_ref?: string | null;
  workshop_id?: string | null;
  participants?: Array<string | CommitteeParticipant>;
  round?: number;
  rounds?: CommitteeRound[];
  case_file_items?: Array<Record<string, unknown>>;
  case_file_view?: CaseFileView | null;
  pre_read?: unknown;
  synthesis?: CommitteeSynthesis | null;
  proposals?: CommitteeMeetingProposal[];
  writebacks?: Array<{ persona_id: string; entry_id: string }>;
  usage?: { rounds?: number; calls?: number } | null;
  private_items_withheld?: number;
  created_at?: string;
  closed_at?: string | null;
  environment_ceiling?: string;
  execution_authority?: string;
  [key: string]: unknown;
}

export interface CommitteeMemo {
  memo_id: string;
  request_id: string;
  status?: string;
  summary?: string;
  recommendation?: string;
  created_at?: string;
  published_at?: string | null;
  /** Case file the memo was decided on (BFF-DECISION-CASE-FILE-VIEWS-20261113); absent/null when not returned. */
  case_file_view?: CaseFileView | null;
  [key: string]: unknown;
}

export interface CandidateDecisionReadback {
  candidate?: {
    proposal_id: string;
    meeting_id?: string;
    sponsor_persona_id?: string | null;
    state: string;
    revision?: number;
    proposed_value?: unknown;
    proposal_digest?: string;
    execution_authority?: string;
    [key: string]: unknown;
  };
  validation_receipts?: Array<{
    validation_receipt_id?: string;
    outcome?: string;
    authority?: string;
    [key: string]: unknown;
  }>;
  formal_approval_receipts?: Array<{
    approval_decision_id?: string;
    outcome?: string;
    reviewer_id?: string;
    execution_authority?: string;
    [key: string]: unknown;
  }>;
  readiness?: {
    validation?: { current_passed?: boolean; [key: string]: unknown };
    reviewer?: { can_link_formal_approval?: boolean; [key: string]: unknown };
    [key: string]: unknown;
  };
  execution_authority?: string;
  [key: string]: unknown;
}

export interface ConveneWorkshopMeetingInput {
  meeting_type: DeliberativeMeetingType | string;
  topic: string;
  subject_ref?: string;
  participants?: string[];
  evidence_refs?: string[];
  attribution_record_id?: string;
  environment?: "research" | "shadow" | "paper";
  include_private_servant?: boolean;
}

export interface ConvenedWorkshopMeeting {
  meeting_id: string;
  status: string;
  workshop_id?: string;
  meeting_type: string;
  topic?: string;
  agenda?: string;
  convened_by?: { kind?: string; id?: string } | null;
  subject_ref?: string | null;
  participants: Array<string | CommitteeParticipant>;
  evidence_refs?: string[];
  attribution_record_id?: string;
  round?: number;
  rounds?: CommitteeRound[];
  synthesis?: CommitteeSynthesis | null;
  proposals?: CommitteeMeetingProposal[];
  outcome?: string | null;
  created_at?: string;
  environment_ceiling?: string;
  execution_authority?: string;
  [key: string]: unknown;
}

export function sessionIdOf(session: CommitteeSession): string {
  return String(session.session_id ?? session.meeting_id ?? session.request_id ?? "");
}

export function isDeliberativeSession(session: CommitteeSession): boolean {
  if (session.session_class === "deliberative_meeting" || session.consultation_type === "persona_meeting") {
    return true;
  }
  if (session.session_class === "gate_panel" || session.consultation_type === "persona_panel") {
    return false;
  }
  return Boolean(session.meeting_id || session.meeting_type);
}

export function isUnsponsoredCandidateProposal(proposal: CommitteeMeetingProposal): boolean {
  const sponsor = typeof proposal.sponsor_persona_id === "string" ? proposal.sponsor_persona_id.trim() : "";
  return !sponsor || proposal.approval_path === "agora_candidate_decision" || proposal.kind === "agora_candidate_decision";
}

export function candidateApprovalStatusOf(
  proposal: CommitteeMeetingProposal,
  readback?: CandidateDecisionReadback | null,
): string {
  const formalOutcome = readback?.formal_approval_receipts?.[0]?.outcome;
  if (typeof formalOutcome === "string" && formalOutcome.trim()) {
    return formalOutcome.trim();
  }
  const candidateState = readback?.candidate?.state;
  if (typeof candidateState === "string" && candidateState.trim()) {
    return candidateState.trim();
  }
  if (typeof proposal.approval_status === "string" && proposal.approval_status.trim()) {
    return proposal.approval_status.trim();
  }
  if (typeof proposal.downstream?.status === "string" && proposal.downstream.status.trim()) {
    return proposal.downstream.status.trim();
  }
  if (typeof proposal.status === "string" && proposal.status.trim()) {
    return proposal.status.trim();
  }
  return "draft";
}

function normalizeCommitteeSession(raw: CommitteeSession): CommitteeSession {
  const cleaned = stripPrivateMemory(raw);
  const id = String(cleaned.request_id ?? cleaned.session_id ?? cleaned.meeting_id ?? "");
  return {
    ...cleaned,
    request_id: id,
    session_id: String(cleaned.session_id ?? cleaned.meeting_id ?? id),
  };
}

export const getCommitteeSessions = () =>
  read(
    () => bffFetch({ method: "GET", path: paths.agoraCommitteeSessions() }),
    (r) => {
      const items = arr<CommitteeSession>(r.data);
      return items ? items.map(normalizeCommitteeSession) : undefined;
    },
  );

export const getCommitteeSession = (sessionId: string) =>
  read(
    () => bffFetch({ method: "GET", path: paths.agoraCommitteeSession(sessionId) }),
    (r) => {
      const item = dataObj<CommitteeSession>(r);
      return item ? normalizeCommitteeSession(item) : undefined;
    },
  );

export const getCommitteeMeetings = () =>
  read(
    () => bffFetch({ method: "GET", path: "/bff/agora/committee/meetings" }),
    (r) => {
      const items = arr<CommitteeSession>(r.data);
      return items ? items.map(normalizeCommitteeSession) : undefined;
    },
  );

export const getCommitteeMeeting = (meetingId: string) =>
  read(
    () => bffFetch({ method: "GET", path: `/bff/agora/committee/meetings/${encodeURIComponent(meetingId)}` }),
    (r) => {
      const item = dataObj<CommitteeSession>(r);
      return item ? normalizeCommitteeSession(item) : undefined;
    },
  );

export const getCommitteeMeetingProposals = (meetingId: string) =>
  read(
    () => bffFetch({ method: "GET", path: `/bff/agora/committee/meetings/${encodeURIComponent(meetingId)}/proposals` }),
    (r) => {
      const items = arr<CommitteeMeetingProposal>(r.data);
      return items ? items.map((item) => stripPrivateMemory(item)) : undefined;
    },
  );

export const getCommitteeMemos = (sessionId: string) =>
  read(() => bffFetch({ method: "GET", path: paths.agoraCommitteeMemos(sessionId) }), (r) => arr<CommitteeMemo>(r.data));

/** Receipt is the owner-confirmed published memo (the BFF refuses unless status is `published`). */
export const publishCommitteeMemo = (sessionId: string, memoId: string) =>
  read(() => bffFetch({ method: "POST", path: paths.agoraCommitteeMemoPublish(sessionId, memoId), body: {} }), (r) => dataObj<CommitteeMemo>(r));

/** Route an unsponsored meeting proposal onto the Agora candidate-decision approval path. */
export const createMeetingCandidateDecision = (
  meetingId: string,
  proposalId: string,
  idempotencyKey?: string,
) =>
  read(
    () =>
      bffFetch({
        method: "POST",
        path: `/bff/agora/meetings/${encodeURIComponent(meetingId)}/proposals/${encodeURIComponent(proposalId)}/candidates`,
        body: {},
        idempotencyKey,
      }),
    (r) => dataObj<CandidateDecisionReadback>(r) ?? (r.candidate ? (r as unknown as CandidateDecisionReadback) : undefined),
  );

export const getCandidateReviewReadiness = (proposalId: string) =>
  read(
    () => bffFetch({ method: "GET", path: paths.agoraCandidateReviewReadiness(proposalId) }),
    (r) => dataObj<CandidateDecisionReadback>(r),
  );

/** Convene a deliberative meeting from a Strategy Workshop session through the BFF consultation owner adapter. */
export const conveneWorkshopMeeting = (
  workshopId: string,
  input: ConveneWorkshopMeetingInput,
  idempotencyKey?: string,
): Promise<LearningRead<ConvenedWorkshopMeeting>> =>
  read(
    () =>
      bffFetch({
        method: "POST",
        path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/meetings`,
        body: {
          meeting_type: input.meeting_type,
          topic: input.topic,
          ...(input.subject_ref ? { subject_ref: input.subject_ref } : {}),
          ...(input.participants ? { participants: input.participants } : {}),
          ...(input.evidence_refs ? { evidence_refs: input.evidence_refs } : {}),
          ...(input.attribution_record_id ? { attribution_record_id: input.attribution_record_id } : {}),
          ...(input.environment ? { environment: input.environment } : {}),
          include_private_servant: input.include_private_servant ?? true,
        },
        idempotencyKey,
      }),
    (r) => {
      const inner = dataObj<Record<string, unknown>>(r) ?? r;
      const meetingId = typeof inner.meeting_id === "string" && inner.meeting_id.trim()
        ? inner.meeting_id.trim()
        : typeof r.meeting_id === "string" && r.meeting_id.trim()
          ? r.meeting_id.trim()
          : undefined;
      if (!meetingId) return undefined;
      const status = typeof inner.status === "string" && inner.status.trim()
        ? inner.status.trim()
        : typeof r.status === "string" && r.status.trim()
          ? r.status.trim()
          : "convened";
      const cleaned = stripPrivateMemory(inner);
      return {
        ...cleaned,
        meeting_id: meetingId,
        status,
        workshop_id: typeof cleaned.workshop_id === "string" ? cleaned.workshop_id : workshopId,
        meeting_type: typeof cleaned.meeting_type === "string" ? cleaned.meeting_type : String(input.meeting_type),
        topic: typeof cleaned.topic === "string" ? cleaned.topic : input.topic,
        participants: Array.isArray(cleaned.participants)
          ? (cleaned.participants as Array<string | CommitteeParticipant>)
          : (input.participants ?? []),
        environment_ceiling: "paper",
        execution_authority: "none",
      };
    },
  );

// ─── Memory review ───────────────────────────────────────────────────────────

export type MemoryScope = "persona" | "institutional" | "both";

export interface MemoryHit {
  type: "persona" | "institutional";
  entry: Record<string, unknown> & { memory_id?: string; entry_id?: string };
  [key: string]: unknown;
}

export interface LessonCandidate {
  lesson_candidate_id: string;
  persona_id?: string;
  proposed_change?: string;
  review_state?: string;
  confidence?: number;
  expiry?: string;
  target_env?: string;
  [key: string]: unknown;
}

export interface MemoryReview {
  entries: MemoryHit[];
  lesson_candidates: LessonCandidate[];
  authz?: Record<string, unknown>;
}

export const getMemoryReview = (input: { personaId?: string; scope: MemoryScope; limit?: number }) =>
  read(
    () => bffFetch({ method: "GET", path: paths.agoraMemoryReview(), query: { persona_id: input.personaId, scope: input.scope, limit: input.limit } }),
    (r) => {
      const d = dataObj<MemoryReview>(r);
      return d && Array.isArray(d.entries) && Array.isArray(d.lesson_candidates) ? d : undefined;
    },
  );

export interface QuarantineInput { memoryId: string; reason: string; auditReceiptId: string }

/** Receipt: the owner-confirmed candidate record (`review_state: "quarantined"`). */
export const quarantineLessonCandidate = (input: QuarantineInput) =>
  read(
    () => bffFetch({
      method: "POST",
      path: paths.agoraMemoryQuarantine(input.memoryId),
      body: { reason: input.reason, audit_receipt_id: input.auditReceiptId, kind: "lesson_candidate" },
    }),
    (r) => dataObj<LessonCandidate>(r),
  );

// ─── Persona lab ─────────────────────────────────────────────────────────────

export interface HarnessPatchRow {
  status?: string;
  patch_type?: string;
  proposal?: { evidence_refs?: string[]; [key: string]: unknown };
  comparisons?: unknown[];
  governance_proposal_ref?: string | null;
  [key: string]: unknown;
}

export interface HarnessState {
  active_version?: number | string | null;
  versions?: Array<{ version: number | string; patch_id?: string; [key: string]: unknown }>;
  patches?: Record<string, HarnessPatchRow>;
  [key: string]: unknown;
}

export interface ChangeLogEntry {
  version: number | string | null;
  patch_id: string | null;
  status?: string | null;
  evidence_refs: string[];
  active: boolean;
  experience?: unknown;
  operator_feedback?: unknown;
  actions: Array<"accept" | "undo" | "never_again" | "tell_why">;
}
export interface ChangeLog { active_version: number | string | null; entries: ChangeLogEntry[] }

export interface EvaluationSuite { suite_id: string; runs: number }
export interface EvaluationRun {
  run_id: string; suite_id: string; patch_id: string; status?: string | null; decision?: string | null;
  reasons: string[]; criteria?: unknown; bundle_count: number;
}

export interface ShadowRow {
  decision_time: string | null;
  base?: unknown; candidate?: unknown;
  decisions_differ?: boolean | null;
  virtual_book_delta?: unknown;
}
export interface ShadowComparison {
  patch_id: string; status?: string | null; decision?: string | null; reasons: string[];
  arms: string[]; rows: ShadowRow[];
}

export interface PatchReceipt { [key: string]: unknown }
export interface SubmitReceipt {
  handoff_kind: string; patch_id: string; execution_authority: string;
  review_ref?: string; review_status?: "delivered" | "committed"; review_receipt?: unknown; committed?: unknown; precheck?: unknown;
}

const lab = (personaId: string, tail = "") => paths.agoraPersonaLab(personaId, tail);
const labGet = <T>(personaId: string, tail: string) =>
  read(() => bffFetch({ method: "GET", path: lab(personaId, tail) }), (r) => (r.data === undefined || r.data === null ? undefined : (r.data as T)));
const labPost = <T = PatchReceipt>(personaId: string, tail: string, body: unknown) =>
  read(() => bffFetch({ method: "POST", path: lab(personaId, tail), body }), (r) => (r.data === undefined || r.data === null ? undefined : (r.data as T)));

export const getHarness = (personaId: string) => labGet<HarnessState>(personaId, "/harness");
export const getChangeLog = (personaId: string) => labGet<ChangeLog>(personaId, "/change-log");
export const getEvaluationSuites = (personaId: string) => labGet<EvaluationSuite[]>(personaId, "/evaluation/suites");
export const getEvaluationRuns = (personaId: string) => labGet<EvaluationRun[]>(personaId, "/evaluation/runs");
export const getShadowComparison = (personaId: string, patchId: string) =>
  labGet<ShadowComparison>(personaId, `/patches/${encodeURIComponent(patchId)}/shadow-comparison`);

export const draftPatch = (personaId: string, body: Record<string, unknown>) => labPost(personaId, "/patches", body);
export const draftSkillPatch = (personaId: string, body: Record<string, unknown>) => labPost(personaId, "/skill-coaching/patches", body);
export const runShadow = (personaId: string, patchId: string) => labPost(personaId, `/patches/${encodeURIComponent(patchId)}/shadow-runs`, {});
export const submitPatch = (personaId: string, patchId: string, adoptionRef?: string) =>
  labPost<SubmitReceipt>(personaId, `/patches/${encodeURIComponent(patchId)}/submit`, adoptionRef ? { adoption_ref: adoptionRef } : {});

export const acceptChange = (personaId: string, patchId: string, adoptionRef: string) =>
  labPost(personaId, `/change-log/${encodeURIComponent(patchId)}/accept`, { adoption_ref: adoptionRef });
export const undoChange = (personaId: string, patchId: string, reason: string) =>
  labPost(personaId, `/change-log/${encodeURIComponent(patchId)}/undo`, { reason });
export const neverAgain = (personaId: string, patchId: string, reason: string) =>
  labPost(personaId, `/change-log/${encodeURIComponent(patchId)}/never-again`, { reason });

export interface TellWhyInput {
  reflection_id: string; trade_episode_ids: string[]; reflection_version: string | number; text: string; expiry: string; confidence?: number;
}
export const tellWhy = (personaId: string, patchId: string, body: TellWhyInput) =>
  labPost(personaId, `/change-log/${encodeURIComponent(patchId)}/tell-why`, body);

// ─── Human evidence (feedback forms) ─────────────────────────────────────────

export type HumanEvidenceKind = "signal-feedback" | "notes" | "insights" | "training-examples";

export interface HumanEvidenceInput {
  evidence_id: string;
  persona_id: string;
  subject_ref: string;
  content: Record<string, unknown>;
  source_refs: string[];
  captured_at: string;
  consent_granted: boolean;
  learning_eligible: boolean;
  retention_days: number;
  environment_ceiling: "paper";
}

export interface HumanEvidenceReceipt { status: "created" | "exists"; idempotent: boolean; data: Record<string, unknown> }

export async function submitHumanEvidence(kind: HumanEvidenceKind, input: HumanEvidenceInput, idempotencyKey: string): Promise<LearningRead<HumanEvidenceReceipt>> {
  const res = await read(
    () => bffFetch({ method: "POST", path: paths.agoraHumanEvidenceSubmit(kind), body: input, idempotencyKey }),
    (r) => (typeof r.status === "string" && r.data ? ({ status: r.status, idempotent: Boolean(r.idempotent), data: r.data } as HumanEvidenceReceipt) : undefined),
  );
  return res;
}

export interface HumanEvidenceObservation { items: Array<Record<string, unknown>>; total: number }
export const getPersonaHumanEvidence = (personaId: string) =>
  read(
    () => bffFetch({ method: "GET", path: paths.agoraPersonaHumanEvidence(personaId) }),
    (r) => (Array.isArray(r.items) ? ({ items: r.items as Array<Record<string, unknown>>, total: Number(r.total ?? r.items.length) } as HumanEvidenceObservation) : undefined),
  );
