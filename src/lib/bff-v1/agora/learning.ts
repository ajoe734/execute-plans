// Agora learning surfaces (committee, memory review, persona lab, evaluation,
// change log, shadow comparison, human feedback). Thin typed client over the
// restored BFF routes. Unavailable owner data is surfaced as `unavailable`
// with the recorded reason; nothing is defaulted, synthesised or cached here.
import { bffFetch } from "../client";
import { BffError } from "../errors";
import { paths } from "../paths";

export type LearningRead<T> =
  | { state: "ok"; data: T; owner?: string }
  | { state: "unavailable"; reason: string; owner?: string };

export const REASON_UNKNOWN = "owner_unavailable";

/** Run a read; HTTP failures and `status: unavailable` envelopes become `unavailable` with a reason. */
async function read<T>(fn: () => Promise<unknown>, pick: (raw: Record<string, unknown>) => T | undefined): Promise<LearningRead<T>> {
  let raw: unknown;
  try {
    raw = await fn();
  } catch (err) {
    if (err instanceof BffError) {
      return { state: "unavailable", reason: err.envelope.error.cause ?? err.code };
    }
    return { state: "unavailable", reason: REASON_UNKNOWN };
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const owner = typeof body.owner === "string" ? body.owner : undefined;
  if (body.status === "unavailable") {
    return { state: "unavailable", reason: typeof body.reason === "string" && body.reason ? body.reason : REASON_UNKNOWN, owner };
  }
  const data = pick(body);
  if (data === undefined) return { state: "unavailable", reason: "invalid_owner_response", owner };
  return { state: "ok", data, owner };
}

const arr = <T>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v as T[]) : undefined);
const dataObj = <T>(raw: Record<string, unknown>): T | undefined =>
  raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? (raw.data as T) : undefined;

// ─── Committee ───────────────────────────────────────────────────────────────

export interface CommitteeSession {
  request_id: string;
  tenant_id?: string;
  consultation_type?: string;
  status?: string;
  topic?: string;
  question?: string;
  requester_persona_id?: string;
  created_at?: string;
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
  [key: string]: unknown;
}

export const getCommitteeSessions = () =>
  read(() => bffFetch({ method: "GET", path: paths.agoraCommitteeSessions() }), (r) => arr<CommitteeSession>(r.data));

export const getCommitteeSession = (sessionId: string) =>
  read(() => bffFetch({ method: "GET", path: paths.agoraCommitteeSession(sessionId) }), (r) => dataObj<CommitteeSession>(r));

export const getCommitteeMemos = (sessionId: string) =>
  read(() => bffFetch({ method: "GET", path: paths.agoraCommitteeMemos(sessionId) }), (r) => arr<CommitteeMemo>(r.data));

/** Receipt is the owner-confirmed published memo (the BFF refuses unless status is `published`). */
export const publishCommitteeMemo = (sessionId: string, memoId: string) =>
  read(() => bffFetch({ method: "POST", path: paths.agoraCommitteeMemoPublish(sessionId, memoId), body: {} }), (r) => dataObj<CommitteeMemo>(r));

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
