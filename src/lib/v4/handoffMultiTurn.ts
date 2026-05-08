// Planner Response §E9 (2026-05-07) — Handoff multi-turn message DTO.
// Each message is immutable + auditable. Source: §6.E9.

import type { EvidenceKind } from "@/lib/bff-v1/dto";

export type HandoffSenderType = "human" | "persona" | "sentinel" | "system";

export interface EvidenceRef {
  kind: EvidenceKind;
  id: string;
}

export interface HandoffMessageDTO {
  id: string;
  handoffId: string;
  senderType: HandoffSenderType;
  senderId: string;
  body: string;
  evidenceRefs?: readonly EvidenceRef[];
  createdAt: string;
  correlationId: string;
}

/** Pack C C037 was `false`; planner §E9 supersedes — multi-turn is now default. */
export const HANDOFF_MULTI_TURN_ENABLED = true as const;

export const HANDOFF_MULTI_TURN_SOURCE = "planner-response-2026-05-07" as const;
