// Planner Response §B4 (2026-05-07) — typed SSE payload unions per channel.
// Source: Pantheon_System_Dev_Response_to_34_Spec_Backlog_2026-05-07.md
// Closes B4 D26 — replaces `payload: unknown` for the channels listed below.
// Channels not yet enumerated here remain `payload: unknown` until planner emits canonical union.

import type { SseChannel } from "./channels";

// ---------- approval (Planner §A3) ----------
export type ApprovalEvent =
  | { type: "approval.created"; approvalId: string; kind: string; subject: string; riskLevel: string; at: string }
  | { type: "approval.stage.changed"; approvalId: string; stageName: string; state: "pending" | "approved" | "rejected" | "skipped"; decidedBy?: string; at: string }
  | { type: "approval.decided"; approvalId: string; decision: "approved" | "rejected" | "changes_requested"; decidedBy: string; at: string }
  | { type: "approval.sla.escalated"; approvalId: string; stageName: string; escalateTo: string; at: string };

// ---------- ask (Planner §A3) ----------
export type AskEvent =
  | { type: "ask.session.started"; sessionId: string; personaIds: string[]; at: string }
  | { type: "ask.message.delta"; sessionId: string; messageId: string; personaId?: string; delta: string; seq: number; at: string }
  | { type: "ask.tool.called"; sessionId: string; toolName: string; callId: string; at: string }
  | { type: "ask.message.completed"; sessionId: string; messageId: string; at: string }
  | { type: "ask.session.completed"; sessionId: string; summary?: string; at: string }
  | { type: "ask.session.failed"; sessionId: string; errorCode: string; at: string };

// ---------- transition (Planner §B1) ----------
export type TransitionEvent =
  | { type: "transition.started"; transitionId: string; entityType: string; entityId: string; actionId: string; at: string }
  | { type: "transition.warning"; transitionId: string; elapsedMs: number; at: string }
  | { type: "transition.succeeded"; transitionId: string; at: string }
  | { type: "transition.failed"; transitionId: string; failureReasonCode: string; at: string }
  | { type: "transition.timed_out"; transitionId: string; at: string };

// ---------- rollback (Planner §D04) ----------
export type RollbackEvent =
  | { type: "rollback.saga.created"; sagaId: string; incidentId: string; deploymentId: string; at: string }
  | { type: "rollback.saga.step_changed"; sagaId: string; currentStep: string; at: string }
  | { type: "rollback.saga.completed"; sagaId: string; at: string }
  | { type: "rollback.saga.failed"; sagaId: string; failureReasonCode: string; at: string };

// ---------- confirm_token (Planner §C1/D36) ----------
export type ConfirmTokenEvent =
  | { type: "confirm_token.issued"; tokenId: string; actionId: string; entityType: string; entityId: string; expiresAt: string; at: string }
  | { type: "confirm_token.redeemed"; tokenId: string; at: string }
  | { type: "confirm_token.expired"; tokenId: string; at: string }
  | { type: "confirm_token.revoked"; tokenId: string; reason: string; at: string };

// ---------- cooldown (Planner §C1/D36) ----------
export type CooldownEvent =
  | { type: "cooldown.started"; actionId: string; entityType: string; entityId: string; endsAt: string; at: string }
  | { type: "cooldown.ended"; actionId: string; entityType: string; entityId: string; at: string };

// ---------- handoff (Planner §D30) ----------
export type HandoffEvent =
  | { type: "handoff.opened"; handoffId: string; at: string }
  | { type: "handoff.responded"; handoffId: string; responderId: string; at: string }
  | { type: "handoff.reopened"; handoffId: string; reasonCode: string; at: string }
  | { type: "handoff.escalated"; handoffId: string; to: string; at: string }
  | { type: "handoff.closed"; handoffId: string; at: string }
  | { type: "handoff.message.posted"; handoffId: string; messageId: string; at: string };

// ---------- Channel → payload-union map ----------

export interface SseChannelPayloadMap {
  approval: ApprovalEvent;
  ask: AskEvent;
  transition: TransitionEvent;
  rollback: RollbackEvent;
  confirm_token: ConfirmTokenEvent;
  cooldown: CooldownEvent;
  handoff: HandoffEvent;
}

/** Channels that have a typed payload union landed (Planner Response §B4 batch 1). */
export type TypedSseChannel = keyof SseChannelPayloadMap;

export const TYPED_SSE_CHANNELS: readonly TypedSseChannel[] = [
  "approval",
  "ask",
  "transition",
  "rollback",
  "confirm_token",
  "cooldown",
  "handoff",
] as const;

export function isTypedSseChannel(c: SseChannel): c is TypedSseChannel {
  return (TYPED_SSE_CHANNELS as readonly string[]).includes(c);
}

/** Resolve payload type for a channel; defaults to `unknown` for not-yet-typed channels. */
export type SsePayloadFor<C extends SseChannel> = C extends TypedSseChannel
  ? SseChannelPayloadMap[C]
  : unknown;
