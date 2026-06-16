// BFF Contract v1 — list/read degradation reader.
//
// The BFF returns 200 with an explicit degradation envelope when a surface has
// no real data yet (build gap: no strategy artifact / signal producer / market
// data, or an unwired registry). That signal lives in `meta`:
//   meta.degradation.reason            — human-readable reason string
//   meta.surfaces.<name>.status        — "unavailable" | "degraded" | "ok" | ...
//   meta.surfaces.<name>.source        — e.g. "missing"
//
// `ListEnvelope.meta` carries this object verbatim (see normalizeLiveListResponse).
// Pages should surface it as an intentional "awaiting data" state instead of a
// bare empty table that reads as "broken".

export type DegradationLevel = "unavailable" | "degraded";

export interface Degradation {
  degraded: boolean;
  /** Worst surface status observed ("unavailable" dominates "degraded"). */
  level?: DegradationLevel;
  /** Human-readable reason from meta.degradation.reason, when present. */
  reason?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Inspect a `ListEnvelope.meta` (or any read envelope `meta`) and report whether
 * the surface is degraded/unavailable, plus a reason to show the operator.
 */
export function extractDegradation(meta: unknown): Degradation {
  const record = asRecord(meta);
  if (!record) return { degraded: false };

  let level: DegradationLevel | undefined;
  const surfaces = asRecord(record.surfaces);
  if (surfaces) {
    for (const surface of Object.values(surfaces)) {
      const status = asRecord(surface)?.status;
      if (status === "unavailable") {
        level = "unavailable";
        break; // worst case — no need to scan further
      }
      if (status === "degraded") {
        level = "degraded";
      }
    }
  }

  const degradation = asRecord(record.degradation);
  const reason = typeof degradation?.reason === "string" ? degradation.reason : undefined;

  // A `degradation` block without an unavailable/degraded surface still counts
  // as degraded (the BFF only emits it intentionally).
  if (!level && degradation) level = "degraded";

  return { degraded: Boolean(level), level, reason };
}
