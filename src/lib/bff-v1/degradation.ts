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
  /** Strict live transport failed; seed/mock fallback was intentionally blocked. */
  strictFallbackBlocked?: boolean;
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
  const strictFallbackBlocked =
    degradation?.strictFallbackBlocked === true ||
    degradation?.strict_fallback_blocked === true ||
    degradation?.seedFallbackBlocked === true ||
    degradation?.seed_fallback_blocked === true;

  // A `degradation` block without an unavailable/degraded surface still counts
  // as degraded (the BFF only emits it intentionally).
  if (!level && degradation) level = "degraded";

  const out: Degradation = { degraded: Boolean(level) };
  if (level) out.level = level;
  if (reason) out.reason = reason;
  if (strictFallbackBlocked) out.strictFallbackBlocked = true;
  return out;
}

export function extractSurfaceMessage(meta: unknown): string | undefined {
  const record = asRecord(meta);
  if (!record) return undefined;
  const surfaces = asRecord(record.surfaces);
  if (!surfaces) return undefined;
  for (const surface of Object.values(surfaces)) {
    const s = asRecord(surface);
    if (!s) continue;
    if (s.status === "unavailable" || s.status === "degraded") {
      if (typeof s.message === "string" && s.message.trim()) return s.message.trim();
      if (typeof s.reason === "string" && s.reason.trim()) return s.reason.trim();
    }
  }
  return undefined;
}

export function cleanUnavailableReason(
  rawReason: string | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | undefined {
  if (!rawReason) return undefined;
  const cleaned = rawReason
    .replace(/^strict\s*typed\s*error\s*[·:-]?\s*/i, "")
    .replace(/\s*[·:-]?\s*seed\s*fallback\s*(?:blocked|armed|disabled)?$/i, "")
    .replace(/^strict:\s*/i, "")
    .trim();
  if (!cleaned) return undefined;
  if (/^(failed to fetch|networkerror.*|live read failed|live bff unavailable)$/i.test(cleaned)) {
    return t("common.networkFailureReason", { defaultValue: "Network connection failed" });
  }
  return cleaned;
}

/**
 * Extract degraded/failed upstream source keys from `meta.surfaces.<name>.degraded_sources`
 * (or `failed_sources` / `failed_source`). Supports both Record<string, string>
 * (as emitted by BFF `_owner_job_list_meta`, e.g. `{ source_ingestion: "unreachable" }`)
 * and string[] shapes.
 */
export function extractDegradedSources(meta: unknown): string[] {
  const record = asRecord(meta);
  if (!record) return [];
  const out = new Set<string>();
  const addFrom = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      out.add(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) out.add(item.trim());
      }
      return;
    }
    const map = asRecord(value);
    if (map) {
      for (const [key, status] of Object.entries(map)) {
        if (!key.trim()) continue;
        if (typeof status === "string" && status.trim().toLowerCase() === "ok") continue;
        if (status === false || status === null) continue;
        out.add(key.trim());
      }
    }
  };

  const surfaces = asRecord(record.surfaces);
  if (surfaces) {
    for (const rawSurface of Object.values(surfaces)) {
      const surface = asRecord(rawSurface);
      if (!surface) continue;
      addFrom(surface.degraded_sources);
      addFrom(surface.degradedSources);
      addFrom(surface.failed_sources);
      addFrom(surface.failedSources);
      addFrom(surface.failed_source);
      addFrom(surface.failedSource);
    }
  }
  const degradation = asRecord(record.degradation);
  if (degradation) {
    addFrom(degradation.degraded_sources);
    addFrom(degradation.degradedSources);
    addFrom(degradation.failed_sources);
    addFrom(degradation.failedSources);
    addFrom(degradation.failed_source);
    addFrom(degradation.failedSource);
  }
  addFrom(record.degraded_sources);
  addFrom(record.degradedSources);
  return Array.from(out);
}
