// v4 / Pack C §C033–C034 — Handoff SLA runtime helpers.
// Pure, no side effects; consumed by HandoffDrawer + Agora list/badge.

import { HANDOFF_SLA, SLA_WARNING_THRESHOLD, SLA_ESCALATION_EXTENSION_RATIO, type HandoffType } from "./handoffSla";

export type HandoffSlaPhase = "ok" | "warning" | "breached" | "escalated";

export interface HandoffSlaStatus {
  type: HandoffType;
  createdAt: string;
  dueAt: string;
  remainingSec: number;
  elapsedRatio: number;
  phase: HandoffSlaPhase;
  escalateTo?: string;
  escalationAction: string;
}

export function computeHandoffSla(args: {
  type: HandoffType;
  createdAt: string;
  /** When set, indicates the handoff was already escalated and dueAt was extended. */
  escalatedAt?: string;
  now?: Date;
}): HandoffSlaStatus | null {
  const row = HANDOFF_SLA.find((r) => r.type === args.type);
  if (!row) return null;
  const now = (args.now ?? new Date()).getTime();
  const created = Date.parse(args.createdAt);
  const baseDue = created + row.initialSec * 1000;
  const due = args.escalatedAt
    ? baseDue + row.initialSec * 1000 * SLA_ESCALATION_EXTENSION_RATIO
    : baseDue;
  const elapsed = (now - created) / (due - created);
  const remainingSec = Math.max(0, Math.floor((due - now) / 1000));
  let phase: HandoffSlaPhase;
  if (args.escalatedAt) phase = "escalated";
  else if (now >= due) phase = "breached";
  else if (elapsed >= SLA_WARNING_THRESHOLD) phase = "warning";
  else phase = "ok";
  return {
    type: args.type,
    createdAt: args.createdAt,
    dueAt: new Date(due).toISOString(),
    remainingSec,
    elapsedRatio: Math.min(1, Math.max(0, elapsed)),
    phase,
    escalateTo: row.secondary,
    escalationAction: row.escalationAction,
  };
}
