// v4 / Pack C §C019 — Confirm Token API (TTL, single-use, revoke, idempotency-binding).

import { lookupHighRisk } from "./highRiskCatalog";

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
  used: boolean;
}

export const CONFIRM_TOKEN_TTL_DEFAULT_MS = 120_000;
export const CONFIRM_TOKEN_TTL_CRITICAL_MS = 60_000;

export type ConfirmTokenError =
  | { code: "CONFIRM_TOKEN_REUSED"; httpStatus: 409 }
  | { code: "CONFIRM_TOKEN_REVOKED"; httpStatus: 410 }
  | { code: "CONFIRM_TOKEN_EXPIRED"; httpStatus: 410 }
  | { code: "CONFIRM_TOKEN_BINDING_MISMATCH"; httpStatus: 409 };

interface StoredToken extends ConfirmTokenDTO {
  revoked: boolean;
}

const STORE = new Map<string, StoredToken>();

export interface IssueOptions {
  userId: string;
  role: string;
}

export function issueConfirmTokenV4(req: ConfirmTokenRequest, opts: IssueOptions): ConfirmTokenDTO {
  const rule = lookupHighRisk(req.entityType, req.actionId);
  const ttlMs = rule
    ? rule.confirmTtlSec * 1000
    : CONFIRM_TOKEN_TTL_DEFAULT_MS;
  const tokenId = `ctok_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const dto: StoredToken = {
    tokenId,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    boundTo: {
      entityType: req.entityType,
      entityId: req.entityId,
      actionId: req.actionId,
      expectedVersion: req.expectedVersion,
      idempotencyKey: req.idempotencyKey,
      userId: opts.userId,
      role: opts.role,
    },
    used: false,
    revoked: false,
  };
  STORE.set(tokenId, dto);
  return dto;
}

export function revokeConfirmToken(tokenId: string): boolean {
  const t = STORE.get(tokenId);
  if (!t) return false;
  t.revoked = true;
  return true;
}

export interface RedeemInput {
  tokenId: string;
  entityType: string;
  entityId: string;
  actionId: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export type RedeemResult =
  | { ok: true; token: ConfirmTokenDTO }
  | { ok: false; error: ConfirmTokenError };

export function redeemConfirmToken(input: RedeemInput): RedeemResult {
  const t = STORE.get(input.tokenId);
  if (!t) return { ok: false, error: { code: "CONFIRM_TOKEN_REVOKED", httpStatus: 410 } };
  if (t.revoked) return { ok: false, error: { code: "CONFIRM_TOKEN_REVOKED", httpStatus: 410 } };
  if (t.used) return { ok: false, error: { code: "CONFIRM_TOKEN_REUSED", httpStatus: 409 } };
  if (Date.parse(t.expiresAt) < Date.now())
    return { ok: false, error: { code: "CONFIRM_TOKEN_EXPIRED", httpStatus: 410 } };
  const b = t.boundTo;
  if (
    b.entityType !== input.entityType ||
    b.entityId !== input.entityId ||
    b.actionId !== input.actionId ||
    b.expectedVersion !== input.expectedVersion ||
    b.idempotencyKey !== input.idempotencyKey
  ) {
    return { ok: false, error: { code: "CONFIRM_TOKEN_BINDING_MISMATCH", httpStatus: 409 } };
  }
  t.used = true;
  return { ok: true, token: t };
}

/** Test-only — clear store between tests. */
export function __resetConfirmTokenStoreForTests(): void {
  STORE.clear();
}
