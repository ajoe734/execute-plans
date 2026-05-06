// v4 / Pack C §C019 — Confirm Token API (TTL, single-use, revoke, idempotency-binding).

export interface ConfirmTokenRequest {
  entityType: string;
  entityId: string;
  actionId: string;
  expectedVersion: number;
  memo: string;
  idempotencyKey: string;
}

export interface ConfirmTokenDTO {
  tokenId: string;
  expiresAt: string;
  boundTo: {
    entityType: string;
    entityId: string;
    actionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    userId: string;
    role: string;
  };
  used: false;
}

export const CONFIRM_TOKEN_TTL_DEFAULT_MS = 120_000;
export const CONFIRM_TOKEN_TTL_CRITICAL_MS = 60_000;

export type ConfirmTokenError =
  | { code: "CONFIRM_TOKEN_REUSED"; httpStatus: 409 }
  | { code: "CONFIRM_TOKEN_REVOKED"; httpStatus: 410 }
  | { code: "CONFIRM_TOKEN_EXPIRED"; httpStatus: 410 }
  | { code: "CONFIRM_TOKEN_BINDING_MISMATCH"; httpStatus: 409 };
