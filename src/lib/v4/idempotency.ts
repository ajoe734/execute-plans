// v4 / Pack C §C028 — Idempotency.

export const IDEMPOTENCY_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CommandHeaders {
  "Idempotency-Key": string;
  "X-Request-Id": string;
  "If-Match": string;
}

export type IdempotencyMismatchError = {
  code: "IDEMPOTENCY_PAYLOAD_MISMATCH";
  httpStatus: 409;
  i18nKey: "errors.idempotencyMismatch";
};

/** ULID generator placeholder — Stage 2 will swap to a real ULID lib. */
export function newRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
}
