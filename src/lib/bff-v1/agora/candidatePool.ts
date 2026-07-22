/**
 * BFF client for the Candidate Pool surface (v1.4, agora.research.v1).
 * All data reads go through these functions; pages must not call fetch() directly.
 * No order routing, no capital binding — read/review/score only.
 *
 * Mutating methods (reviewCandidateMember, triggerCandidatePoolScore) require:
 *   If-Match        — ETag captured from the preceding GET response
 *   Idempotency-Key — caller-supplied or minted by the canonical header helper
 *   X-Request-Id    — caller-supplied or minted by the canonical header helper
 * AG-BE-CP-001 rejects writes that omit these headers.
 */

import { buildHeaders } from "@/lib/bff-v1/headers";

// ── Types (snake_case matches BFF JSON response) ──────────────────────────────

export interface CandidateScoreComponent {
  component_id: string;
  label: string;
  category:
    | "alpha"
    | "confidence"
    | "liquidity"
    | "risk"
    | "execution"
    | "data_quality"
    | "custom";
  raw_value: number | null;
  normalized_value: number | null;
  transform: string;
  direction: "higher_better" | "lower_better";
  weight: number;
  contribution: number;
  missing_policy: string;
  evidence_refs: string[];
  explanation: string;
}

export interface CandidateScoreResult {
  candidate_id: string;
  pool_id: string;
  recipe_id: string;
  recipe_version: number;
  raw_score: number;
  penalty_score: number;
  evidence_confidence: number;
  effective_score: number;
  rank: number | null;
  band: "priority_review" | "discuss" | "needs_research" | "park" | "suppressed";
  components: CandidateScoreComponent[];
  blockers: string[];
  data_cutoff: string;
  scored_at: string;
  override_reason: string | null;
}

export type CandidateFieldUnavailableReason =
  | "score_not_run"
  | "no_governed_source"
  | "not_recorded";

export interface CandidateFieldProvenance {
  source_type:
    | "candidate_pool_member"
    | "candidate_score_result"
    | "candidate_review"
    | "candidate_monitoring";
  source_ref: string;
  as_of: string;
}

export type CandidateFieldState<T> =
  | {
      availability: "available";
      value: T;
      provenance: CandidateFieldProvenance;
    }
  | {
      availability: "unavailable";
      reason: CandidateFieldUnavailableReason;
    };

export interface CandidateComponentDigest {
  component_id: string;
  label: string | null;
  contribution: number | null;
  explanation: string | null;
}

export type CandidateRationaleValue =
  | {
      kind: "operator_review_rationale";
      decision: string | null;
      rationale: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
    }
  | {
      kind: "score_component_attribution";
      band: string | null;
      effective_score: number | null;
      top_components: CandidateComponentDigest[];
    };

export interface CandidateConcernsValue {
  kind: "score_risk_attribution";
  blockers: string[];
  penalty_components: CandidateComponentDigest[];
}

export interface CandidateNextEventValue {
  kind: "monitoring_schedule";
  monitoring_state: "active" | "paused";
  review_due_at: string | null;
  trigger_conditions: Record<string, unknown>[];
  added_by?: string | null;
  added_at?: string | null;
}

export interface CandidateEvidenceItem {
  component_id: string;
  label?: string | null;
  evidence_refs: string[];
  summary: string | null;
  summary_redacted: boolean;
  redaction_reason?: "list_response" | "viewer_role";
}

export interface CandidateEvidenceValue {
  kind: "score_evidence_refs";
  items: CandidateEvidenceItem[];
  total_refs: number;
}

export interface CandidateDetailsValue {
  kind: "candidate_identity";
  title?: string | null;
  strategy_ref: string | null;
  run_ref?: string | null;
  producing_persona_id?: string | null;
  lifecycle_state: string | null;
  created_at: string | null;
}

export interface CandidateTruthFields {
  rationale: CandidateFieldState<CandidateRationaleValue>;
  concerns: CandidateFieldState<CandidateConcernsValue>;
  next_event: CandidateFieldState<CandidateNextEventValue>;
  evidence: CandidateFieldState<CandidateEvidenceValue>;
  details: CandidateFieldState<CandidateDetailsValue>;
}

export interface CandidateScoreSemanticsEntry {
  kind: "recipe_weighted_score" | "sharpe_ratio";
  availability: "available" | "unavailable";
  is_confidence_score: false;
  scale_min?: number;
  scale_max?: number;
  recipe_id?: string | null;
  recipe_version?: number | null;
  transformation?: "sharpe_ratio_from_producing_research_run";
  source_ref?: string | null;
  as_of?: string | null;
  reason?: CandidateFieldUnavailableReason;
}

export interface CandidateScoreSemantics {
  effective_score: CandidateScoreSemanticsEntry;
  sharpe_summary: CandidateScoreSemanticsEntry;
}

export interface CandidatePoolMember {
  artifact_id: string;
  strategy_ref: string;
  title?: string;
  lifecycle_state: "candidate" | "review" | "approved" | "rejected";
  producing_persona_id?: string;
  sharpe_summary?: number;
  run_ref?: string;
  created_at: string;
  current_score?: CandidateScoreResult;
  effective_score?: number;
  rank?: number | null;
  band?: CandidateScoreResult["band"] | null;
  fields: CandidateTruthFields;
  as_of: string;
  score_semantics: CandidateScoreSemantics;
}

export interface CandidateMemberPageInfo {
  next_page_token: string | null;
  page_size: number;
  has_more: boolean;
  total: number;
  order_by: "created_at,artifact_id";
}

export interface CandidateMemberListFreshness {
  pool_snapshot_at: string | null;
  data_cutoff: string | null;
  last_score_run_at: string | null;
}

export interface CandidatePoolMembersMeta {
  snapshot_at: string | null;
  freshness: CandidateMemberListFreshness;
  /** Common envelope state; v1.12 currently omits it unless the source is degraded/stale. */
  read_state?: string;
  warnings?: string[];
}

/** v1.4 contract enum — must match _REVIEW_DECISION_TO_LIFECYCLE on the BFF */
export type CandidateReviewDecision =
  | "approve_for_monitoring"
  | "send_to_shadow"
  | "needs_more_research"
  | "park"
  | "reject";

export interface CandidateReviewBody {
  decision: CandidateReviewDecision;
  rationale?: string;
  reviewed_by: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolvedBase(baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

function extractItems<T>(value: unknown): T[] {
  const root = recordFrom(value);
  const items = root.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

interface CandidatePoolRequestOptions {
  ifMatch?: string;
  idempotencyKey?: string;
  requestId?: string;
}

function candidatePoolHeaders(
  method: "GET" | "POST",
  options?: CandidatePoolRequestOptions,
): Record<string, string> {
  const extra: Record<string, string> = {};
  if (options?.ifMatch) extra["If-Match"] = options.ifMatch;
  if (options?.requestId) extra["X-Request-Id"] = options.requestId;
  return buildHeaders({
    method,
    idempotency: options?.idempotencyKey,
    extra,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get ranked A2 score results for all candidates in a pool.
 * Returns empty array when no scores are computed yet (pool returns status:"queued").
 */
export async function getCandidatePoolScore(
  poolId: string,
  baseUrl?: string,
): Promise<CandidateScoreResult[]> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/score`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: candidatePoolHeaders("GET"),
  });
  if (!res.ok) {
    const body = await parseJson(res);
    const message =
      recordFrom(recordFrom(body).error).message ??
      `GET ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const body = await parseJson(res);
  const root = recordFrom(body);
  // When no scores computed yet, BFF returns { status: "queued", data: {...} }
  if (root.status === "queued") return [];
  return extractItems<CandidateScoreResult>(body);
}

/**
 * Trigger (or re-trigger) A2 recipe scoring for a pool.
 * Non-blocking: returns immediately; fetch scores again after a delay.
 */
export async function triggerCandidatePoolScore(
  poolId: string,
  options?: { ifMatch?: string; idempotencyKey?: string; requestId?: string },
  baseUrl?: string,
): Promise<void> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/score`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: candidatePoolHeaders("POST", options),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await parseJson(res);
    const message =
      recordFrom(recordFrom(body).error).message ??
      `POST ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
}

export interface CandidatePoolMembersResult {
  items: CandidatePoolMember[];
  /** ETag from the response — forward as If-Match in subsequent writes. */
  etag: string | null;
  pageInfo: CandidateMemberPageInfo | null;
  meta: CandidatePoolMembersMeta;
}

/** List candidate pool members (metadata, lifecycle state). Returns items + ETag for If-Match. */
export async function listCandidatePoolMembers(
  poolId: string,
  baseUrl?: string,
): Promise<CandidatePoolMembersResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/members`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: candidatePoolHeaders("GET"),
  });
  if (!res.ok) {
    const body = await parseJson(res);
    const message =
      recordFrom(recordFrom(body).error).message ??
      `GET ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const body = await parseJson(res);
  const root = recordFrom(body);
  const rawMeta = recordFrom(root.meta);
  const rawFreshness = recordFrom(rawMeta.freshness);
  const rawPageInfo = recordFrom(root.page_info);
  return {
    items: extractItems<CandidatePoolMember>(body),
    etag: res.headers.get("ETag"),
    pageInfo: Object.keys(rawPageInfo).length > 0
      ? rawPageInfo as unknown as CandidateMemberPageInfo
      : null,
    meta: {
      snapshot_at: typeof rawMeta.snapshot_at === "string" ? rawMeta.snapshot_at : null,
      freshness: {
        pool_snapshot_at: typeof rawFreshness.pool_snapshot_at === "string"
          ? rawFreshness.pool_snapshot_at
          : null,
        data_cutoff: typeof rawFreshness.data_cutoff === "string"
          ? rawFreshness.data_cutoff
          : null,
        last_score_run_at: typeof rawFreshness.last_score_run_at === "string"
          ? rawFreshness.last_score_run_at
          : null,
      },
      read_state: typeof rawMeta.read_state === "string" ? rawMeta.read_state : undefined,
      warnings: Array.isArray(rawMeta.warnings)
        ? rawMeta.warnings.filter((warning): warning is string => typeof warning === "string")
        : undefined,
    },
  };
}

/**
 * Record a candidate review decision.
 * Decisions: approve_for_monitoring, send_to_shadow, needs_more_research, park, reject.
 * park and reject require a non-empty rationale.
 * Rejected candidates are retained as negative/preference examples; they are not deleted.
 *
 * options.ifMatch       — ETag from listCandidatePoolMembers; required by AG-BE-CP-001.
 * options.idempotencyKey — optional override for the canonical generated key.
 * options.requestId      — optional override for the canonical generated request id.
 */
export async function reviewCandidateMember(
  poolId: string,
  artifactId: string,
  body: CandidateReviewBody,
  options?: { ifMatch?: string; idempotencyKey?: string; requestId?: string },
  baseUrl?: string,
): Promise<Record<string, unknown>> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/members/${encodeURIComponent(artifactId)}/review`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: candidatePoolHeaders("POST", options),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await parseJson(res);
    const message =
      recordFrom(recordFrom(responseBody).error).message ??
      `POST ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const responseBody = await parseJson(res);
  const root = recordFrom(responseBody);
  return recordFrom(root.data ?? root);
}
