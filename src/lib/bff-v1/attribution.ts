// Management outlier / attribution / shadow-comparison read client (FE-MANAGEMENT-ATTRIBUTION-VIEWS-20261116).
// Thin typed client over /bff/management/attribution/* (BFF-ATTRIBUTION-VIEWS-20261116).
// The BFF only forwards and shapes reads; no attribution number is computed here.
// Missing/unavailable owner data surfaces explicitly with the recorded reason.
// Paper only: a paper-proxy settlement is never relabelled as an actual fill.

import { bffFetch } from "./client";
import { BffError } from "./errors";
import { paths } from "./paths";

export type AttributionRead<T> =
  | { state: "ok"; data: T; degraded?: Record<string, string> }
  | { state: "empty"; reason?: string }
  | { state: "not_found"; reason: string }
  | { state: "unavailable"; reason: string };

export const ATTRIBUTION_REASON_UNKNOWN = "attribution_owner_unavailable";
export const SHADOW_ARMS = ["trader", "base_strategy", "private_servant", "institutional_view"] as const;

export interface AttributionHypothesisValidation {
  status?: string;
  reason?: string;
  items?: Array<{ hypothesis?: string; status?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export interface AttributionRecordItem {
  record_id: string;
  subject_kind?: string;
  subject_id?: string;
  direction?: string;
  decomposition: Record<string, number | undefined>;
  luck_interval?: number[] | null;
  sample_size?: number;
  meeting_id?: string;
  meeting?: {
    meeting_id: string;
    meeting_type?: string;
    href?: string;
    status?: string;
    outcome?: string;
    topic?: string;
    unavailable_reason?: string;
  } | null;
  hypothesis_validation?: AttributionHypothesisValidation | unknown[] | null;
  [k: string]: unknown;
}

export interface AttributionRecordsData {
  items: AttributionRecordItem[];
  next_cursor?: string | null;
}

export interface ShadowArm {
  arm: string;
  decision_detail: Record<string, unknown> & { available?: boolean; unavailable_reason?: string };
  settlement_source: string | null;
  outcome: unknown;
  settled_at: string | null;
  unavailable_reason: string | null;
}

export interface ShadowComparisonData {
  decision_id: string;
  arms: ShadowArm[];
  trader_identity?: unknown;
  account_id?: string | null;
}

export interface AttributionFilters {
  since?: string;
  subjectKind?: string;
  direction?: string;
  cursor?: string;
  limit?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function reasonOf(err: BffError): string {
  const d = err.envelope?.error?.details;
  if (isRecord(d) && typeof d.reason === "string" && d.reason) return d.reason;
  return err.envelope?.error?.cause || err.code || ATTRIBUTION_REASON_UNKNOWN;
}

async function readSurface<T>(
  fn: () => Promise<unknown>,
  pick: (raw: Record<string, unknown>) => AttributionRead<T>,
  notFoundReason: string,
): Promise<AttributionRead<T>> {
  let raw: unknown;
  try {
    raw = await fn();
  } catch (err) {
    if (err instanceof BffError) {
      if (err.status === 404 || err.code === "RESOURCE_NOT_FOUND") {
        return { state: "not_found", reason: reasonOf(err) || notFoundReason };
      }
      return { state: "unavailable", reason: reasonOf(err) };
    }
    return { state: "unavailable", reason: ATTRIBUTION_REASON_UNKNOWN };
  }
  const body = isRecord(raw) ? raw : {};
  const meta = isRecord(body.meta) ? body.meta : undefined;
  if (body.status === "unavailable" || meta?.status === "unavailable") {
    const reason =
      (typeof body.reason === "string" && body.reason) ||
      (typeof meta?.reason === "string" && meta.reason) ||
      ATTRIBUTION_REASON_UNKNOWN;
    return { state: "unavailable", reason };
  }
  return pick(body);
}

export function getAttributionOutliers(
  filters: AttributionFilters = {},
): Promise<AttributionRead<AttributionRecordsData>> {
  const query: Record<string, string | number | undefined> = {};
  if (filters.since?.trim()) query.since = filters.since.trim();
  if (filters.subjectKind?.trim()) query.subject_kind = filters.subjectKind.trim();
  if (filters.direction?.trim()) query.direction = filters.direction.trim();
  if (filters.cursor?.trim()) query.cursor = filters.cursor.trim();
  if (typeof filters.limit === "number" && filters.limit > 0) query.limit = filters.limit;
  return readSurface<AttributionRecordsData>(
    () =>
      bffFetch({
        method: "GET",
        path: paths.mgmtAttributionOutliers(),
        query: Object.keys(query).length ? query : undefined,
      }),
    (raw) => {
      if (!Array.isArray(raw.items)) return { state: "unavailable", reason: "invalid_owner_response" };
      const items = raw.items.filter(isRecord).map((r) => ({
        ...r,
        record_id: String(r.record_id ?? r.id ?? ""),
        decomposition: isRecord(r.decomposition) ? (r.decomposition as Record<string, number>) : {},
      })) as AttributionRecordItem[];
      if (raw.status === "empty" || items.length === 0) return { state: "empty" };
      const page = isRecord(raw.page_info) ? raw.page_info : {};
      return {
        state: "ok",
        data: { items, next_cursor: typeof page.next_cursor === "string" ? page.next_cursor : null },
      };
    },
    "attribution_not_found",
  );
}

export function getAttributionRecord(recordId: string): Promise<AttributionRead<AttributionRecordItem>> {
  return readSurface<AttributionRecordItem>(
    () => bffFetch({ method: "GET", path: paths.mgmtAttributionRecord(recordId) }),
    (raw) => {
      const data = isRecord(raw.data) ? raw.data : undefined;
      if (!data) return { state: "unavailable", reason: "invalid_owner_response" };
      return {
        state: "ok",
        data: {
          ...data,
          record_id: String(data.record_id ?? data.id ?? recordId),
          decomposition: isRecord(data.decomposition) ? (data.decomposition as Record<string, number>) : {},
        } as AttributionRecordItem,
      };
    },
    "attribution_not_found",
  );
}

export function getShadowComparison(decisionId: string): Promise<AttributionRead<ShadowComparisonData>> {
  return readSurface<ShadowComparisonData>(
    () => bffFetch({ method: "GET", path: paths.mgmtAttributionShadow(decisionId) }),
    (raw) => {
      const data = isRecord(raw.data) ? raw.data : undefined;
      if (!data || !Array.isArray(data.arms)) return { state: "unavailable", reason: "invalid_owner_response" };
      const meta = isRecord(raw.meta) ? raw.meta : {};
      const sources = isRecord(meta.sources) ? meta.sources : {};
      const degraded: Record<string, string> = {};
      for (const [k, v] of Object.entries(sources)) if (typeof v === "string" && v !== "ok") degraded[k] = v;
      return {
        state: "ok",
        data: {
          ...data,
          decision_id: String(data.decision_id ?? decisionId),
          arms: data.arms.filter(isRecord) as unknown as ShadowArm[],
        } as ShadowComparisonData,
        degraded: Object.keys(degraded).length ? degraded : undefined,
      };
    },
    "decision_not_found",
  );
}

/** Settlement labelling: only an owner-declared actual fill may read "actual fill". */
export function settlementLabelKind(source: string | null | undefined): "actual_fill" | "paper_proxy" | "unknown" {
  const s = String(source ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("proxy") || s.includes("paper") || s.includes("simulated")) return "paper_proxy";
  if (s === "actual_fill" || s === "broker_fill" || s === "fill") return "actual_fill";
  return "unknown";
}

export const attribution = {
  outliers: getAttributionOutliers,
  record: getAttributionRecord,
  shadow: getShadowComparison,
};
