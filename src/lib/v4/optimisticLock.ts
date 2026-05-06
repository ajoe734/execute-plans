// v4 / Pack C §C010 — Optimistic locking & 409 envelope.

export const REQUIRED_MUTATION_HEADERS = ["If-Match", "Idempotency-Key", "X-Request-Id"] as const;

export interface StateConflictError {
  code: "STATE_CONFLICT";
  i18nKey: "errors.stateConflict";
  retryable: false;
  details: { expectedVersion: number; actualVersion: number };
}

export function makeStateConflict(expectedVersion: number, actualVersion: number): StateConflictError {
  return {
    code: "STATE_CONFLICT",
    i18nKey: "errors.stateConflict",
    retryable: false,
    details: { expectedVersion, actualVersion },
  };
}
