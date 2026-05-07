// BFF Contract v1 — Error envelope + typed error class.
// Maps HTTP 428/409 → semantic ErrorCode per Final.md C.1/C.3.

import type { BffErrorEnvelope, BffErrorPayload, ErrorCode } from "./dto";

export type { BffErrorEnvelope, BffErrorPayload, ErrorCode };

export class BffError extends Error {
  readonly code: ErrorCode;
  readonly i18nKey: string;
  readonly retryable: boolean;
  readonly userActionable: boolean;
  readonly correlationId: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly envelope: BffErrorEnvelope;

  constructor(status: number, envelope: BffErrorEnvelope) {
    super(envelope.error.message);
    this.name = "BffError";
    this.status = status;
    this.envelope = envelope;
    this.code = envelope.error.code;
    this.i18nKey = envelope.error.i18nKey;
    this.retryable = envelope.error.retryable;
    this.userActionable = envelope.error.userActionable;
    this.correlationId = envelope.error.correlationId;
    this.details = envelope.error.details as Record<string, unknown> | undefined;
  }

  /** Final C.1 — 428 cluster: missing precondition (confirm token / approval / two-man). */
  isPreconditionRequired(): boolean {
    return this.status === 428;
  }
  /** Final C.1 — 409 cluster: state/idempotency conflict. */
  isConflict(): boolean {
    return this.status === 409;
  }
  requiresConfirmToken(): boolean {
    return this.code === "CONFIRM_TOKEN_REQUIRED";
  }
  requiresApproval(): boolean {
    return this.code === "APPROVAL_REQUIRED";
  }
  requiresTwoMan(): boolean {
    return this.code === "TWO_MAN_REQUIRED";
  }
}

/** Default HTTP status mapping per Final.md §C.1 / §C.3. Backend authoritative. */
export const ERROR_CODE_TO_STATUS: Readonly<Partial<Record<ErrorCode, number>>> = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  TOKEN_EXPIRED: 401,
  REFRESH_FAILED: 401,
  PERMISSION_DENIED: 403,
  CAPABILITY_MISSING: 403,
  TENANT_SCOPE_MISMATCH: 403,
  FEATURE_DISABLED: 403,
  RESOURCE_NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  ILLEGAL_TRANSITION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  CONFIRM_TOKEN_REQUIRED: 428,
  APPROVAL_REQUIRED: 428,
  TWO_MAN_REQUIRED: 428,
  CONFIRM_TOKEN_EXPIRED: 428,
  CONFIRM_TOKEN_REUSED: 428,
  CONFIRM_TOKEN_REVOKED: 428,
  CONFIRM_TOKEN_BINDING_MISMATCH: 428,
  COOLDOWN_ACTIVE: 429,
  RATE_LIMITED: 429,
  CURSOR_EXPIRED: 410,
  CURSOR_INVALID: 400,
  BACKEND_UNAVAILABLE: 503,
  SSE_REPLAY_UNAVAILABLE: 503,
  UNKNOWN_ERROR: 500,
};

export interface MakeErrorArgs {
  code: ErrorCode;
  message?: string;
  correlationId?: string;
  retryable?: boolean;
  userActionable?: boolean;
  details?: BffErrorPayload["details"];
  cause?: string;
}

export function makeBffError(args: MakeErrorArgs): BffError {
  const status = ERROR_CODE_TO_STATUS[args.code] ?? 500;
  const envelope: BffErrorEnvelope = {
    error: {
      code: args.code,
      i18nKey: `errors.${args.code}`,
      message: args.message ?? args.code,
      retryable: args.retryable ?? (status === 503 || status === 429),
      userActionable: args.userActionable ?? (status === 428 || status === 409 || status === 400),
      correlationId: args.correlationId ?? `corr_${Math.random().toString(36).slice(2, 10)}`,
      cause: args.cause,
      details: args.details,
    },
  };
  return new BffError(status, envelope);
}

export function isBffErrorEnvelope(value: unknown): value is BffErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const e = (value as { error?: unknown }).error;
  if (typeof e !== "object" || e === null) return false;
  const p = e as Record<string, unknown>;
  return typeof p.code === "string" && typeof p.correlationId === "string";
}
