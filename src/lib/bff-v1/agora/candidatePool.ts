/**
 * BFF client for the Candidate Pool surface (v1.4 base plus v1.12 candidate
 * truth projection, agora.research.v1). The additive truth contract consumed
 * here landed in Pantheon PR #3980 at merge 5004450c5493aa8aef284cf42439c9b27ef54235.
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
import type {
  CandidateComponentDigest as GeneratedCandidateComponentDigest,
  CandidateConcernsValue as GeneratedCandidateConcernsValue,
  CandidateDetailsValue as GeneratedCandidateDetailsValue,
  CandidateEvidenceItem as GeneratedCandidateEvidenceItem,
  CandidateEvidenceValue as GeneratedCandidateEvidenceValue,
  CandidateFieldProvenance as GeneratedCandidateFieldProvenance,
  CandidateMemberListFreshness as GeneratedCandidateMemberListFreshness,
  CandidateMemberPageInfo as GeneratedCandidateMemberPageInfo,
  CandidatePoolMember as GeneratedCandidatePoolMember,
  CandidateNextEventValue as GeneratedCandidateNextEventValue,
  CandidateRationaleValue as GeneratedCandidateRationaleValue,
  CandidateScoreResult as GeneratedCandidateScoreResult,
  CandidateScoreSemantics as GeneratedCandidateScoreSemantics,
  CandidateTruthFields as GeneratedCandidateTruthFields,
  UnavailableField as GeneratedUnavailableField,
} from "./types";

// ── Types (snake_case matches BFF JSON response) ──────────────────────────────

export type CandidateScoreComponent = GeneratedCandidateScoreResult["components"][number];
export type CandidateScoreResult = GeneratedCandidateScoreResult;

export type CandidateFieldUnavailableReason = GeneratedUnavailableField;
export type CandidateFieldProvenance = GeneratedCandidateFieldProvenance;

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

export type CandidateComponentDigest = GeneratedCandidateComponentDigest;
export type CandidateRationaleValue = GeneratedCandidateRationaleValue;
export type CandidateConcernsValue = GeneratedCandidateConcernsValue;
export type CandidateNextEventValue = GeneratedCandidateNextEventValue;
export type CandidateEvidenceItem = GeneratedCandidateEvidenceItem;
export type CandidateEvidenceValue = GeneratedCandidateEvidenceValue;
export type CandidateDetailsValue = GeneratedCandidateDetailsValue;
export type CandidateTruthFields = GeneratedCandidateTruthFields;

export type CandidateScoreSemanticsEntry = GeneratedCandidateScoreSemantics["effective_score"];
export type CandidateScoreSemantics = GeneratedCandidateScoreSemantics;

export type CandidatePoolMember = GeneratedCandidatePoolMember;
export type CandidateMemberPageInfo = GeneratedCandidateMemberPageInfo;
export type CandidateMemberListFreshness = GeneratedCandidateMemberListFreshness;

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
