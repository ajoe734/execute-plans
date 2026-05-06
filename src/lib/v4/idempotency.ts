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

// ---------- Mock replay cache (BFF side, Pack C C028) ----------
interface ReplayEntry<T> { at: number; result: T }
const REPLAY = new Map<string, ReplayEntry<unknown>>();

export function idempotencyReplay<T>(key: string): T | undefined {
  const e = REPLAY.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > IDEMPOTENCY_REPLAY_WINDOW_MS) {
    REPLAY.delete(key);
    return undefined;
  }
  return e.result as T;
}

export function idempotencyRemember<T>(key: string, result: T): void {
  REPLAY.set(key, { at: Date.now(), result });
}

export function __resetIdempotencyForTests(): void {
  REPLAY.clear();
}
