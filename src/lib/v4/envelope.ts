// v4 / Pack C §C002 — BFF response envelope + apiVersion policy.

export type BffApiVersion = "v3"; // Pack C C002 — keep literal "v3" through migration window

export interface BffEnvelope<T> {
  apiVersion: BffApiVersion;
  data: T;
  /** Permitted only until 2026-06-30. Frontend MUST NOT drive UI from this. */
  legacyFields?: Record<string, unknown>;
  migrationWarnings?: string[];
}

export const LEGACY_FIELDS_SUNSET = "2026-07-01";

export function isLegacyWindowOpen(now: Date = new Date()): boolean {
  return now.toISOString() < LEGACY_FIELDS_SUNSET;
}

export function wrap<T>(data: T, opts?: { legacyFields?: Record<string, unknown>; warnings?: string[] }): BffEnvelope<T> {
  return {
    apiVersion: "v3",
    data,
    ...(opts?.legacyFields ? { legacyFields: opts.legacyFields } : {}),
    ...(opts?.warnings?.length ? { migrationWarnings: opts.warnings } : {}),
  };
}
