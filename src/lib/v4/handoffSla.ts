// v4 / Pack C §C033–C037 — Handoff SLA, escalation, reject DTO, attachment limits.

export type HandoffType =
  | "strategy_idea" | "research_task" | "signal_feedback" | "training_feedback"
  | "committee_memo" | "skill_draft" | "incident_note";

export interface HandoffSlaRow {
  type: HandoffType;
  slaStartAt: "created";
  initialSec: number;
  primaryOwner: string;
  secondary: string;
  escalationAction: string;
}

export const HANDOFF_SLA: readonly HandoffSlaRow[] = [
  { type: "strategy_idea", slaStartAt: "created", initialSec: 86_400, primaryOwner: "research_lead", secondary: "admin", escalationAction: "notify + Command Center pin" },
  { type: "research_task", slaStartAt: "created", initialSec: 43_200, primaryOwner: "research_lead", secondary: "strategy_manager", escalationAction: "notify" },
  { type: "signal_feedback", slaStartAt: "created", initialSec: 21_600, primaryOwner: "strategy_manager", secondary: "research_lead", escalationAction: "notify + strategy alert badge" },
  { type: "training_feedback", slaStartAt: "created", initialSec: 604_800, primaryOwner: "research_lead", secondary: "admin", escalationAction: "notify trainer + persona owner" },
  { type: "committee_memo", slaStartAt: "created", initialSec: 43_200, primaryOwner: "reviewer", secondary: "research_lead", escalationAction: "attach to governance queue" },
  { type: "skill_draft", slaStartAt: "created", initialSec: 604_800, primaryOwner: "capability_admin", secondary: "admin", escalationAction: "notify + skill draft badge" },
  { type: "incident_note", slaStartAt: "created", initialSec: 3_600, primaryOwner: "risk_officer", secondary: "system_operator", escalationAction: "create incident escalation" },
] as const;

export const SLA_WARNING_THRESHOLD = 0.8;
export const SLA_ESCALATION_EXTENSION_RATIO = 0.5; // newDueAt = original + 50%

// ---------- C035 Reject DTO ----------

export type HandoffRejectReason =
  | "insufficient_context" | "duplicate" | "out_of_scope"
  | "needs_attachment" | "invalid_target" | "policy_blocked";

export type RequiredAttachment =
  | "chart" | "signal_snapshot" | "experiment_result" | "trade_log" | "market_note";

export interface HandoffRejectDTO {
  handoffId: string;
  reasonCode: HandoffRejectReason;
  message: string;
  requiresAttachments?: RequiredAttachment[];
  returnedTo: string;
  returnedAt: string;
}

// ---------- C036 Attachments ----------

export const ATTACHMENT_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxFilesPerHandoff: 10,
  allowedMime: ["image/png", "image/jpeg", "image/webp", "application/pdf",
    "text/csv", "application/json", "text/plain", "text/markdown"] as readonly string[],
  parquetPolicy: "metadata-pointer-only" as const,
} as const;

export function validateAttachment(file: { mime: string; bytes: number }): string | null {
  if (file.bytes > ATTACHMENT_LIMITS.maxFileBytes) return "file exceeds 25MB";
  if (!ATTACHMENT_LIMITS.allowedMime.includes(file.mime)) return `mime ${file.mime} not allowed`;
  return null;
}

/** Pack C C037: v1 handoff is single-shot; threading future work. */
export const HANDOFF_THREADING_ENABLED = false as const;
