// Pack D D21 — ErrorCode master list (canonical at FE runtime).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md (D21, 26 codes).
//
// LANDED 2026-05-10 — Pack D D21 markdown 已對齊 26 條（FE_Blueprint_Gap §B2 backport）。
// OpenAPI components.schemas.ErrorCode 同步 26 條。

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "AUTH_REQUIRED",
  "TOKEN_EXPIRED",
  "REFRESH_FAILED",
  "PERMISSION_DENIED",
  "CAPABILITY_MISSING",
  "TENANT_SCOPE_MISMATCH",
  "FEATURE_DISABLED",
  "STATE_CONFLICT",
  "ILLEGAL_TRANSITION",
  "CONFIRM_TOKEN_REQUIRED",
  "CONFIRM_TOKEN_EXPIRED",
  "CONFIRM_TOKEN_REUSED",
  "CONFIRM_TOKEN_BINDING_MISMATCH",
  "TWO_MAN_REQUIRED",
  "COOLDOWN_ACTIVE",
  "CURSOR_EXPIRED",
  "CURSOR_INVALID",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "BACKEND_UNAVAILABLE",
  "SSE_REPLAY_UNAVAILABLE",
  "UNKNOWN_ERROR",
  // Pack D D21 v26 — confirmed canonical 2026-05-07 by Planner Response §A2.
  // No longer "FE superset"; this list IS the canonical D21 master.
  "RESOURCE_NOT_FOUND",
  "APPROVAL_REQUIRED",
  "CONFIRM_TOKEN_REVOKED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function errorI18nKey(code: ErrorCode): string {
  return `errors.${code}`;
}

// Pack D D14 — DisabledReasonCode (15-enum, capability/state gating).
export const DISABLED_REASON_CODES = [
  "PERMISSION_DENIED",
  "CAPABILITY_MISSING",
  "TENANT_SCOPE_MISMATCH",
  "FEATURE_DISABLED",
  "ROLE_INSUFFICIENT",
  "STATE_INVALID",
  "ILLEGAL_TRANSITION",
  "TWO_MAN_REQUIRED",
  "COOLDOWN_ACTIVE",
  "CONFIRM_TOKEN_REQUIRED",
  "DEPENDENCY_MISSING",
  "QUORUM_INSUFFICIENT",
  "RATE_LIMITED",
  "RESOURCE_LOCKED",
  "ENV_RESTRICTED",
] as const;

export type DisabledReasonCode = (typeof DISABLED_REASON_CODES)[number];

export function isDisabledReasonCode(value: unknown): value is DisabledReasonCode {
  return typeof value === "string" && (DISABLED_REASON_CODES as readonly string[]).includes(value);
}

export function disabledReasonI18nKey(code: DisabledReasonCode): string {
  return `disabledReasons.${code}`;
}
