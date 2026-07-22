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

export interface CandidatePoolMember {
  artifact_id: string;
  strategy_ref: string;
  title?: string;
  lifecycle_state: "candidate" | "review" | "approved" | "rejected";
  producing_persona_id?: string;
  sharpe_summary?: number;
  run_ref?: string;
  created_at: string;
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
  return {
    items: extractItems<CandidatePoolMember>(body),
    etag: res.headers.get("ETag"),
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
