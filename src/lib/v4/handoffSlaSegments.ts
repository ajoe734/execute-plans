// Planner Response §D30 (2026-05-07) — Handoff Reopen SLA via SlaSegment[].
// Default: reopen does NOT reset SLA; reset requires approval + audit reason.
// Source: §5.D30.

export type HandoffStatus =
  | "open"
  | "responded"
  | "reopened"
  | "escalated"
  | "closed"
  | "expired";

export type SlaSegmentReason =
  | "initial"
  | "reopen_missing_info"
  | "reopen_rejected_response"
  | "reopen_incident_update"
  | "manual_reset_approved";

export interface SlaSegment {
  id: string;
  openedAt: string;
  closedAt?: string;
  reasonCode: SlaSegmentReason;
  actor: string;
  note?: string;
  /** True only for `manual_reset_approved`. Default false. */
  resetSla: boolean;
  dueAt: string;
}

export interface HandoffSlaTimeline {
  handoffId: string;
  status: HandoffStatus;
  segments: readonly SlaSegment[];
  /** Effective due date — last segment dueAt. */
  effectiveDueAt: string;
}

export function buildSlaTimeline(handoffId: string, status: HandoffStatus, segments: readonly SlaSegment[]): HandoffSlaTimeline {
  const last = segments[segments.length - 1];
  return {
    handoffId,
    status,
    segments,
    effectiveDueAt: last?.dueAt ?? new Date().toISOString(),
  };
}

/** Compute total accumulated SLA seconds (closed segments + open elapsed). */
export function accumulatedSlaSec(segments: readonly SlaSegment[], now: Date = new Date()): number {
  let total = 0;
  for (const seg of segments) {
    const start = new Date(seg.openedAt).getTime();
    const end = seg.closedAt ? new Date(seg.closedAt).getTime() : now.getTime();
    total += Math.max(0, end - start);
  }
  return Math.floor(total / 1000);
}

export const HANDOFF_SLA_SEGMENT_SOURCE = "planner-response-2026-05-07" as const;
