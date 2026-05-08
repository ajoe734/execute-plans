// Planner Response §C1 / D36 (2026-05-07) — Confirm token vs cooldown precedence.
// Cooldown wins. Source: §4.C1/D36 of planner doc.

import type { ErrorCode } from "@/lib/v4/errorCodes";

export const COOLDOWN_PRIORITY_RULES = {
  /** Cooldown active → BFF must NOT issue confirm token. */
  blockTokenIssueDuringCooldown: true,
  /** Token issued; if action enters cooldown before redeem, redeem fails. */
  failRedeemWhenCooldownStarted: true,
  /** Token TTL never extends cooldown. */
  tokenDoesNotExtendCooldown: true,
  /** serverTime is the only countdown ground truth. */
  countdownSource: "serverTime" as const,
} as const;

export interface CooldownState {
  active: boolean;
  endsAt?: string;        // ISO; required when active
  serverTime: string;     // ISO
  actionId: string;
  entityType: string;
  entityId: string;
}

export interface ConfirmTokenIssueResult {
  ok: boolean;
  errorCode?: Extract<ErrorCode, "COOLDOWN_ACTIVE">;
  cooldownEndsAt?: string;
}

/** Mock-safe precondition check used by FE before requesting a confirm token. */
export function canIssueConfirmToken(cooldown: CooldownState | undefined): ConfirmTokenIssueResult {
  if (!cooldown || !cooldown.active) return { ok: true };
  return {
    ok: false,
    errorCode: "COOLDOWN_ACTIVE",
    cooldownEndsAt: cooldown.endsAt,
  };
}

/** Mock-safe precondition check used by FE before redeeming a confirm token. */
export function canRedeemConfirmToken(cooldown: CooldownState | undefined): ConfirmTokenIssueResult {
  return canIssueConfirmToken(cooldown);
}

export const COOLDOWN_PRIORITY_SOURCE = "planner-response-2026-05-07" as const;
