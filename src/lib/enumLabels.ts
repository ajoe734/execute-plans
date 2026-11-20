export type EnumCategory =
  | "status"
  | "outcome"
  | "action"
  | "risk"
  | "reason"
  | "lineageEdge";

export type EnumTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "accent"
  | "paused"
  | "pending"
  | "running";

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export interface ResolvedEnumLabel {
  label: string;
  code: string;
  tone: EnumTone;
  badgeClass: string;
  isKnown: boolean;
}

export interface ReasonCodeDisplay {
  text: string;
  code?: string;
  tone: EnumTone;
  badgeClass: string;
  isKnown: boolean;
}

export const BFF_JOB_STATUS_VALUES = [
  "pending",
  "queued",
  "dispatched",
  "running",
  "completed",
  "succeeded",
  "success",
  "warning",
  "failed",
  "error",
  "canceled",
  "cancelled",
  "timeout",
  "timed_out",
  "retrying",
  "accepted",
  "skipped",
  "blocked",
  "awaiting_intervention",
  "paused",
  "stopped",
  "idle",
] as const;

export const BFF_INCIDENT_STATUS_VALUES = [
  "open",
  "mitigating",
  "investigating",
  "acknowledged",
  "resolved",
  "closed",
] as const;

export const BFF_DEPLOYMENT_STATUS_VALUES = [
  "draft",
  "submitted",
  "approved",
  "scheduled",
  "deploying",
  "deployed",
  "executed",
  "applied",
  "completed",
  "rolled_back",
  "failed",
  "rejected",
  "cancelled",
  "canceled",
  "pending",
  "running",
  "success",
  "skipped",
] as const;

export const BFF_MEETING_STATUS_VALUES = [
  "triggered",
  "convened",
  "open",
  "in_round",
  "round_1",
  "round_2",
  "synthesizing",
  "closed",
  "completed",
  "refused",
  "cancelled",
  "canceled",
  "pending",
  "pending_operator",
  "approved",
  "rejected",
  "applied",
  "ready",
  "empty",
  "unavailable",
] as const;

export const BFF_STATUS_VALUES = [
  ...BFF_JOB_STATUS_VALUES,
  ...BFF_INCIDENT_STATUS_VALUES,
  ...BFF_DEPLOYMENT_STATUS_VALUES,
  ...BFF_MEETING_STATUS_VALUES,
  "in_progress",
  "complete",
  "concluded",
  "revoked",
  "superseded",
  "unknown",
  "sandbox",
  "probation",
  "candidate",
  "review",
  "in_review",
  "under_review",
  "paper_running",
  "canary_running",
  "live_running",
  "active",
  "restricted",
  "suspended",
  "frozen",
  "retired",
  "deprecated",
  "archived",
  "invalidated",
  "rebalancing",
  "metrics_freezing",
  "metrics_frozen",
  "ranking_calculated",
  "simulation_ready",
  "testing",
  "scored",
  "promoted",
  "discarded",
  "published",
  "waiting_for_approval",
  "proposed",
  "decided",
  "recommendation",
  "approval",
  "rejection",
  "expiry",
  "ttl_expired",
  "research_only",
  "consultable",
  "paper_owner",
  "live_owner",
  "declared",
  "unbound",
  "healthy",
  "watch",
  "degraded",
  "critical",
  "ok",
  "fresh",
  "live",
  "missing",
  "unverifiable",
  "breached",
  "observing",
  "orienting",
  "deciding",
  "acting",
  "learning",
  "not_checked",
  "mount_unavailable",
  "authorized",
  "account_session",
  "capturing",
  "processing",
  "code_submitted",
  "expired",
  "registered",
  "not_configured",
  "inactive",
  "enabled",
  "disabled",
  "traceable",
  "redacted",
  "stale",
  "needs_evidence",
  "unresolved_source",
  "incomplete",
  "partial",
  "fallback",
  "formal",
  "eligible",
  "insufficient_data",
  "disqualified",
  "not_running",
  "connecting",
] as const;

export const BFF_OUTCOME_VALUES = [
  "in_progress",
  "review",
  "proposals_issued",
  "no_proposal",
  "no_action",
  "concluded",
  "refused",
  "insufficient_participants",
  "ok",
  "rejected",
  "candidate_created",
  "no_candidate",
  "evaluation_rejected",
  "pending",
  "good",
  "neutral",
  "bad",
  "improved",
  "accepted",
  "approved",
  "degraded",
  "failed",
  "passed",
  "not_evaluated",
  "inconclusive",
  "completed",
  "succeeded",
  "canceled",
  "cancelled",
  "executed",
] as const;

export const BFF_ACTION_VALUES = [
  "create",
  "edit",
  "view",
  "delete",
  "approve",
  "reject",
  "deploy",
  "rollback",
  "suspend",
  "retire",
  "cancel",
  "confirm",
  "save",
  "reset",
  "propose_change",
  "promote_live",
  "promote_paper",
  "promote_canary",
  "apply_rebalance",
  "back",
  "submit_for_review",
  "open",
  "submitting",
  "flag_for_review",
  "freeze",
  "unfreeze",
  "pause",
  "resume",
  "archive",
  "invalidate",
  "promote",
  "demote",
  "quarantine",
  "merge",
  "keep",
  "escalate",
  "request_changes",
  "retry",
  "refresh",
  "advance",
  "buy",
  "sell",
  "hold",
] as const;

export const BFF_RISK_VALUES = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
  "unavailable",
  "unknown",
  "none",
  "warning",
] as const;

export const BFF_REASON_CODES = [
  "tool_record_unavailable:no_proposal_submitted",
  "tool_record_unavailable",
  "no_proposal_submitted",
  "no_qualification_has_run",
  "proposal_rejected",
  "risk_veto",
  "runtime_unavailable",
  "datasource_unavailable",
  "memory_writeback_failed",
  "consultation_unavailable",
  "execution_blocked",
  "stale_telemetry",
  "no_active_strategy",
  "cycle_timeout",
  "cycle_owner_unavailable",
  "insufficient_cash",
  "missing_binding",
  "degraded_source",
  "upstream_degraded",
  "no_candidate_source",
  "answer_probe_not_run",
  "codex_mount_missing_credentials",
  "claude_mount_missing_credentials",
  "claude_auth_probe_non_zero_exit",
  "codex_auth_probe_non_zero_exit",
  "refresh_token_expired",
  "not_configured",
  "provider_snapshot",
  "management_ai_bff_audit",
  "bff_observed_management_ai_only",
  "claude_reauth_login_interrupted",
  "claude_reauth_ready_probe_degraded",
  "adapter_probe",
  "insufficient_participants",
  "weekly_budget_exhausted",
  "meeting_type_disabled",
  "consultation_owner_unavailable",
  "live_write_gate_closed",
  "meeting_not_found",
  "missing_meeting_id",
  "invalid_owner_response",
  "meeting_outcome_review",
  "proposal_waiting_for_operator",
  "cooldown_active",
  "no_eligible_peers",
  "budget_cap_reached",
  "in_progress",
  "review",
  "proposals_issued",
  "no_proposal",
  "no_action",
  "concluded",
  "refused",
  "read_ok",
  "readback_ok",
  "smoke_ok",
  "datasource_smoke_ok",
  "quote_readback_ok",
  "read_unavailable",
  "public_reference_unavailable",
  "credential_unavailable",
  "read_timeout",
  "timeout_fallback",
  "shadow_not_settled_or_unknown",
  "agora_owner_unavailable",
  "insufficient_capability",
  "tenant_scope_mismatch",
  "policy_redacted",
  "permission_denied",
  "capability_missing",
] as const;

export const BFF_LINEAGE_EDGE_TYPES = [
  "parent",
  "source_strategy_spec",
  "source_run",
  "persona",
  "capital_pool",
  "derived_from",
  "promoted_to",
  "deployed_to",
  "depends_on",
  "produced_by",
  "consumes",
  "evaluates",
  "binds_to",
  "governed_by",
  "strategy",
  "artifact",
  "experiment",
  "dataset",
  "runtime",
] as const;

const TONE_BADGE_CLASS: Record<EnumTone, string> = {
  success: "status-success",
  running: "status-running",
  pending: "status-pending",
  warning: "status-warning",
  danger: "status-failed",
  paused: "status-paused",
  info: "bg-info/15 text-info border-info/30",
  accent: "bg-accent/15 text-accent border-accent/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

const STATUS_BADGE_OVERRIDES: Record<string, string> = {
  retired: "status-retired",
  superseded: "status-retired",
  archived: "status-retired",
  deprecated: "status-retired",
};

const STATUS_TONE_MAP: Record<string, EnumTone> = {
  // Neutral / Draft / Inactive
  draft: "neutral",
  sandbox: "neutral",
  probation: "neutral",
  candidate: "neutral",
  retired: "neutral",
  superseded: "neutral",
  archived: "neutral",
  deprecated: "neutral",
  unavailable: "neutral",
  unknown: "neutral",
  missing: "neutral",
  unverifiable: "neutral",
  empty: "neutral",
  research_only: "neutral",
  consultable: "neutral",
  paper_owner: "neutral",
  live_owner: "neutral",
  none: "neutral",
  neutral: "neutral",
  not_evaluated: "neutral",
  inconclusive: "neutral",

  // Info / Review / Cycle stages / Deliberation
  review: "info",
  in_review: "info",
  under_review: "info",
  paper_running: "info",
  observing: "info",
  orienting: "info",
  deciding: "info",
  acting: "info",
  learning: "info",
  triggered: "info",
  convened: "info",
  in_round: "info",
  round_1: "info",
  round_2: "info",
  synthesizing: "info",
  info: "info",

  // Accent / Approved / Resolved
  approved: "accent",
  accepted: "accent",
  decided: "accent",
  approval: "accent",
  authorized: "accent",
  eligible: "accent",
  resolved: "accent",
  closed: "neutral",
  concluded: "accent",
  proposals_issued: "accent",
  candidate_created: "accent",

  // Success / Healthy / Completed / Executed
  live_running: "success",
  active: "success",
  deployed: "success",
  executed: "success",
  applied: "success",
  completed: "success",
  complete: "success",
  succeeded: "success",
  success: "success",
  healthy: "success",
  ok: "success",
  fresh: "success",
  live: "success",
  ready: "success",
  promoted: "success",
  published: "success",
  passed: "success",
  enabled: "success",
  traceable: "success",
  formal: "success",
  account_session: "success",
  registered: "success",
  good: "success",
  improved: "success",
  read_ok: "success",
  readback_ok: "success",
  smoke_ok: "success",
  datasource_smoke_ok: "success",
  quote_readback_ok: "success",

  // Running / In progress
  running: "running",
  in_progress: "running",
  deploying: "running",
  dispatched: "running",
  capturing: "running",
  processing: "running",
  code_submitted: "running",
  testing: "running",
  connecting: "running",

  // Pending / Queued
  pending: "pending",
  queued: "pending",
  submitted: "pending",
  scheduled: "pending",
  waiting_for_approval: "pending",
  proposed: "pending",
  pending_operator: "pending",
  recommendation: "pending",
  metrics_frozen: "pending",
  ranking_calculated: "pending",
  simulation_ready: "pending",
  scored: "pending",
  declared: "pending",
  not_checked: "pending",
  proposal_waiting_for_operator: "pending",

  // Warning / Degraded / Mitigating
  canary_running: "warning",
  warning: "warning",
  watch: "warning",
  degraded: "warning",
  restricted: "warning",
  stale: "warning",
  partial: "warning",
  fallback: "warning",
  needs_evidence: "warning",
  unresolved_source: "warning",
  incomplete: "warning",
  insufficient_data: "warning",
  mount_unavailable: "warning",
  not_configured: "warning",
  expired: "warning",
  expiry: "warning",
  ttl_expired: "warning",
  retrying: "warning",
  mitigating: "warning",
  investigating: "warning",
  acknowledged: "warning",
  rebalancing: "warning",
  metrics_freezing: "warning",
  open: "warning",
  medium: "warning",
  high: "warning",
  no_proposal: "warning",
  no_action: "warning",
  no_candidate: "warning",

  // Danger / Failed / Rejected / Critical
  failed: "danger",
  error: "danger",
  rejected: "danger",
  rejection: "danger",
  revoked: "danger",
  critical: "danger",
  breached: "danger",
  blocked: "danger",
  awaiting_intervention: "danger",
  refused: "danger",
  timeout: "danger",
  timed_out: "danger",
  invalidated: "danger",
  disqualified: "danger",
  bad: "danger",
  evaluation_rejected: "danger",
  insufficient_participants: "danger",

  // Paused / Canceled / Stopped
  paused: "paused",
  suspended: "paused",
  stopped: "paused",
  frozen: "paused",
  canceled: "paused",
  cancelled: "paused",
  rolled_back: "paused",
  skipped: "paused",
  discarded: "paused",
  inactive: "paused",
  disabled: "paused",
  redacted: "paused",
  not_running: "paused",
  idle: "paused",
  unbound: "paused",
};

const KNOWN_STATUS_SET = new Set<string>(BFF_STATUS_VALUES);
const KNOWN_OUTCOME_SET = new Set<string>(BFF_OUTCOME_VALUES);
const KNOWN_ACTION_SET = new Set<string>(BFF_ACTION_VALUES);
const KNOWN_RISK_SET = new Set<string>(BFF_RISK_VALUES);
const KNOWN_REASON_SET = new Set<string>(BFF_REASON_CODES);
const KNOWN_LINEAGE_EDGE_SET = new Set<string>(BFF_LINEAGE_EDGE_TYPES);

/**
 * Fallback English labels used only when no `t` function is supplied or when a key is not present in a custom test mock.
 */
const EN_FALLBACK_STATUS: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  dispatched: "Dispatched",
  running: "Running",
  in_progress: "In Progress",
  completed: "Completed",
  complete: "Complete",
  concluded: "Concluded",
  succeeded: "Succeeded",
  success: "Success",
  warning: "Warning",
  failed: "Failed",
  error: "Error",
  canceled: "Canceled",
  cancelled: "Cancelled",
  timeout: "Timed Out",
  timed_out: "Timed Out",
  retrying: "Retrying",
  accepted: "Accepted",
  skipped: "Skipped",
  blocked: "Blocked",
  awaiting_intervention: "Awaiting Intervention",
  paused: "Paused",
  stopped: "Stopped",
  idle: "Idle",
  open: "Open",
  mitigating: "Mitigating",
  investigating: "Investigating",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  closed: "Closed",
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  scheduled: "Scheduled",
  deploying: "Deploying",
  deployed: "Deployed",
  executed: "Executed",
  applied: "Applied",
  rolled_back: "Rolled Back",
  rejected: "Rejected",
  revoked: "Revoked",
  superseded: "Superseded",
  triggered: "Triggered",
  convened: "Convened",
  in_round: "In Round",
  round_1: "Round 1",
  round_2: "Round 2",
  synthesizing: "Synthesizing",
  refused: "Refused",
  pending_operator: "Pending Operator",
  ready: "Ready",
  empty: "Empty",
  unavailable: "Unavailable",
  unknown: "Unknown",
  sandbox: "Sandbox",
  probation: "Probation",
  candidate: "Candidate",
  review: "In Review",
  in_review: "In Review",
  under_review: "Under Review",
  paper_running: "Paper Running",
  canary_running: "Canary Running",
  live_running: "Live Running",
  active: "Active",
  restricted: "Restricted",
  suspended: "Suspended",
  frozen: "Frozen",
  retired: "Retired",
  deprecated: "Deprecated",
  archived: "Archived",
  invalidated: "Invalidated",
  rebalancing: "Rebalancing",
  metrics_freezing: "Freezing Metrics",
  metrics_frozen: "Metrics Frozen",
  ranking_calculated: "Ranking Calculated",
  simulation_ready: "Simulation Ready",
  testing: "Testing",
  scored: "Scored",
  promoted: "Promoted",
  discarded: "Discarded",
  published: "Published",
  waiting_for_approval: "Awaiting Approval",
  proposed: "Proposed",
  decided: "Decided",
  recommendation: "Recommendation",
  approval: "Approval",
  rejection: "Rejection",
  expiry: "Expired",
  ttl_expired: "TTL Expired",
  research_only: "Research Only",
  consultable: "Consultable",
  paper_owner: "Paper Owner",
  live_owner: "Live Owner",
  declared: "Declared",
  unbound: "Unbound",
  healthy: "Healthy",
  watch: "Watch",
  degraded: "Degraded",
  critical: "Critical",
  ok: "OK",
  fresh: "Fresh",
  live: "Live",
  missing: "Missing",
  unverifiable: "Unverifiable",
  breached: "Breached",
  observing: "Observing",
  orienting: "Orienting",
  deciding: "Deciding",
  acting: "Acting",
  learning: "Learning",
  not_checked: "Not Checked",
  mount_unavailable: "Mount Unavailable",
  authorized: "Authorized",
  account_session: "Account Session",
  capturing: "Capturing",
  processing: "Processing",
  code_submitted: "Code Submitted",
  expired: "Expired",
  registered: "Registered",
  not_configured: "Not Configured",
  inactive: "Inactive",
  enabled: "Enabled",
  disabled: "Disabled",
  traceable: "Traceable",
  redacted: "Redacted",
  stale: "Stale",
  needs_evidence: "Needs Evidence",
  unresolved_source: "Unresolved Source",
  incomplete: "Incomplete",
  partial: "Partial",
  fallback: "Fallback",
  formal: "Formal",
  eligible: "Eligible",
  insufficient_data: "Insufficient Data",
  disqualified: "Disqualified",
  not_running: "Not Running",
  connecting: "Connecting",
};

const EN_FALLBACK_OUTCOMES: Record<string, string> = {
  in_progress: "In Progress",
  review: "In Review",
  proposals_issued: "Proposals Issued",
  no_proposal: "No Proposal",
  no_action: "No Action",
  concluded: "Concluded",
  refused: "Refused",
  insufficient_participants: "Insufficient Participants",
  ok: "OK",
  rejected: "Rejected",
  candidate_created: "Candidate Created",
  no_candidate: "No Candidate",
  evaluation_rejected: "Evaluation Rejected",
  pending: "Pending",
  good: "Good",
  neutral: "Neutral",
  bad: "Bad",
  improved: "Improved",
  accepted: "Accepted",
  approved: "Approved",
  degraded: "Degraded",
  failed: "Failed",
  passed: "Passed",
  not_evaluated: "Not Evaluated",
  inconclusive: "Inconclusive",
  completed: "Completed",
  succeeded: "Succeeded",
  canceled: "Canceled",
  cancelled: "Cancelled",
  executed: "Executed",
};

const EN_FALLBACK_ACTIONS: Record<string, string> = {
  create: "Create",
  edit: "Edit",
  view: "View",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  deploy: "Deploy",
  rollback: "Rollback",
  suspend: "Suspend",
  retire: "Retire",
  cancel: "Cancel",
  confirm: "Confirm",
  save: "Save",
  reset: "Reset",
  propose_change: "Propose Change",
  promote_live: "Promote to Live",
  promote_paper: "Promote to Paper",
  promote_canary: "Promote to Canary",
  apply_rebalance: "Apply Rebalance",
  back: "Back",
  submit_for_review: "Submit for Review",
  open: "Open",
  submitting: "Submitting…",
  flag_for_review: "Flag for Review",
  freeze: "Freeze",
  unfreeze: "Unfreeze",
  pause: "Pause",
  resume: "Resume",
  archive: "Archive",
  invalidate: "Invalidate",
  promote: "Promote",
  demote: "Demote",
  quarantine: "Quarantine",
  merge: "Merge",
  keep: "Keep",
  escalate: "Escalate",
  request_changes: "Request Changes",
  retry: "Retry",
  refresh: "Refresh",
  advance: "Advance",
  buy: "Buy",
  sell: "Sell",
  hold: "Hold",
};

const EN_FALLBACK_RISK: Record<string, string> = {
  info: "Info",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
  unavailable: "Unavailable",
  unknown: "Unknown",
  none: "None",
  warning: "Warning",
};

const EN_FALLBACK_REASONS: Record<string, string> = {
  "tool_record_unavailable:no_proposal_submitted": "Tool record unavailable: no proposal submitted",
  tool_record_unavailable__no_proposal_submitted: "Tool record unavailable: no proposal submitted",
  tool_record_unavailable: "Tool execution record unavailable",
  no_proposal_submitted: "No proposal submitted in this cycle",
  no_qualification_has_run: "No qualification run has completed yet",
  proposal_rejected: "Proposal rejected during review",
  risk_veto: "Risk veto (proposal failed risk check)",
  runtime_unavailable: "Runtime environment unavailable",
  datasource_unavailable: "Data source unavailable",
  memory_writeback_failed: "Memory writeback failed",
  consultation_unavailable: "Consultation service unavailable",
  execution_blocked: "Execution blocked by governance gate",
  stale_telemetry: "Telemetry data is stale",
  no_active_strategy: "No active strategy bound",
  cycle_timeout: "Autonomous cycle timed out",
  cycle_owner_unavailable: "Cycle owner service unavailable",
  insufficient_cash: "Insufficient cash for order execution",
  missing_binding: "Missing active runtime binding",
  degraded_source: "Upstream data source degraded",
  upstream_degraded: "Upstream producer degraded",
  no_candidate_source: "No candidate source available",
  answer_probe_not_run: "Answer probe has not run yet",
  codex_mount_missing_credentials: "Codex CLI credential mount is missing",
  claude_mount_missing_credentials: "Claude CLI credential mount is missing",
  claude_auth_probe_non_zero_exit: "Claude authentication probe exited with an error",
  codex_auth_probe_non_zero_exit: "Codex authentication probe exited with an error",
  refresh_token_expired: "Refresh token has expired",
  not_configured: "Provider is not configured",
  provider_snapshot: "Provider status snapshot",
  management_ai_bff_audit: "Management AI BFF audit log",
  bff_observed_management_ai_only: "Observed from Management AI BFF traffic only",
  claude_reauth_login_interrupted: "Claude re-authentication login was interrupted",
  claude_reauth_ready_probe_degraded: "Claude re-authentication readiness probe is degraded",
  adapter_probe: "Adapter health probe",
  insufficient_participants: "Insufficient eligible participants to convene meeting",
  weekly_budget_exhausted: "Weekly meeting budget exhausted",
  meeting_type_disabled: "This meeting type is disabled by rule",
  consultation_owner_unavailable: "Consultation owner service is unavailable",
  live_write_gate_closed: "Live write gate is closed",
  meeting_not_found: "Meeting record not found",
  missing_meeting_id: "Missing meeting identifier",
  invalid_owner_response: "Invalid response from owner service",
  meeting_outcome_review: "Requires governance review",
  proposal_waiting_for_operator: "Waiting for operator review",
  cooldown_active: "Meeting cooldown window is active",
  no_eligible_peers: "No eligible peer personas available",
  budget_cap_reached: "Meeting budget cap reached",
  in_progress: "Meeting is currently in progress",
  review: "Routed to governance review",
  proposals_issued: "Governed proposals issued",
  no_proposal: "Concluded with no proposal required",
  no_action: "Concluded with no action required",
  concluded: "Meeting concluded",
  refused: "Meeting refused by governance rule",
  read_ok: "Read healthy",
  readback_ok: "Readback verified",
  smoke_ok: "Smoke check passed",
  datasource_smoke_ok: "Data source smoke check passed",
  quote_readback_ok: "Quote readback verified",
  read_unavailable: "Read endpoint unavailable",
  public_reference_unavailable: "Public reference data unavailable",
  credential_unavailable: "Provider credentials unavailable",
  read_timeout: "Upstream read timed out",
  timeout_fallback: "Using timeout fallback snapshot",
  shadow_not_settled_or_unknown: "Shadow decision not yet settled or unknown",
  agora_owner_unavailable: "Agora owner service unavailable",
  insufficient_capability: "Insufficient capability permission",
  tenant_scope_mismatch: "Tenant scope mismatch",
  policy_redacted: "Redacted by governance policy",
  permission_denied: "Permission denied",
  capability_missing: "Required capability missing",
};

const EN_FALLBACK_LINEAGE_EDGES: Record<string, string> = {
  parent: "Parent",
  source_strategy_spec: "Source Strategy Spec",
  source_run: "Source Run",
  persona: "Persona",
  capital_pool: "Capital Pool",
  derived_from: "Derived From",
  promoted_to: "Promoted To",
  deployed_to: "Deployed To",
  depends_on: "Depends On",
  produced_by: "Produced By",
  consumes: "Consumes",
  evaluates: "Evaluates",
  binds_to: "Binds To",
  governed_by: "Governed By",
  strategy: "Strategy",
  artifact: "Artifact",
  experiment: "Experiment",
  dataset: "Dataset",
  runtime: "Runtime",
};

export function isNanLike(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return lower === "nan" || lower === "undefined" || lower === "null";
}

export function sanitizeRawText(value: unknown): string | undefined {
  if (isNanLike(value)) return undefined;
  const trimmed = String(value).trim();
  if (trimmed === "—" || trimmed === "-") return undefined;
  return trimmed;
}

const KNOWN_TRANSLATION_KEY_PREFIXES = new Set([
  "errors",
  "app",
  "ui",
  "env",
  "topbar",
  "nav",
  "groups",
  "performanceCenter",
  "rankingsCenter",
  "meetingsCenter",
  "governanceDecisions",
  "commandPalette",
  "promotionAllocation",
  "v5",
  "risk",
  "status",
  "actions",
  "confirm",
  "common",
  "tradeJourneys",
  "detail",
  "permission",
  "inspector",
  "daily",
  "memoryReview",
  "skill",
  "tool",
  "mcp",
  "strategy",
  "runtime",
  "notifications",
  "jobs",
  "lineage",
  "commandCenter",
  "riskCenter",
  "incident",
  "governance",
  "handoff",
  "caseFile",
  "committee",
  "signal",
  "table",
  "section",
  "table_actions",
  "toast",
  "empty",
  "audit",
  "page",
  "filter",
  "approval",
  "lifecycle",
  "rebalance",
  "persona",
  "capital",
  "capitalPool",
  "confirmDialog",
  "agora",
  "artifact",
  "deployment",
  "evolution",
  "ranking",
  "rankingFormula",
  "research",
  "qa",
  "realtime",
  "strategyDetail",
  "settings",
  "lineageExplorer",
  "knowledge",
  "postmortem",
  "rankingDashboard",
  "workflows",
  "hooks",
  "discovery",
  "alphaFactory",
  "studios",
  "phase13",
  "phase21",
  "entityCreate",
  "oversight",
  "oneRing",
  "personaFleet",
  "humanInbox",
  "tradingPulse",
  "evolutionJournal",
  "evidence",
  "personaIntent",
  "readiness",
  "mgmt",
  "capabilities",
  "enumLabels",
]);

/**
 * Detects whether a rendered string matches a raw dot-separated i18n translation key pattern
 * (e.g. `capabilities.actions.disabledReason` or `status.completed`).
 */
export function isTranslationKeyLike(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(" ") || trimmed.includes("/")) return false;
  const match = /^([a-z][a-zA-Z0-9_]*)(?:\.([a-zA-Z0-9_-]+)){1,6}$/.exec(trimmed);
  if (!match) return false;
  const prefix = match[1];
  return KNOWN_TRANSLATION_KEY_PREFIXES.has(prefix);
}

export function normalizeEnumKey(value: unknown): string {
  const clean = sanitizeRawText(value);
  if (!clean) return "";
  return clean
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function humanizeEnumToken(token: string): string {
  return token
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function statusTone(value: unknown): EnumTone {
  const key = normalizeEnumKey(value);
  if (!key) return "neutral";
  return STATUS_TONE_MAP[key] ?? "neutral";
}

export function statusBadgeClass(value: unknown): string {
  const key = normalizeEnumKey(value);
  if (!key) return "border-dashed bg-muted/40 text-muted-foreground";
  if (STATUS_BADGE_OVERRIDES[key]) return STATUS_BADGE_OVERRIDES[key];
  const tone = statusTone(key);
  return TONE_BADGE_CLASS[tone];
}

export function resolveEnumLabel(
  category: EnumCategory,
  value: unknown,
  t?: TranslateFn,
): ResolvedEnumLabel {
  const raw = sanitizeRawText(value);
  if (!raw) {
    return {
      label: "—",
      code: "",
      tone: "neutral",
      badgeClass: "border-dashed bg-muted/40 text-muted-foreground",
      isKnown: false,
    };
  }

  const key = normalizeEnumKey(raw);
  const tone = STATUS_TONE_MAP[key] ?? "neutral";
  const badgeClass = STATUS_BADGE_OVERRIDES[key] ?? TONE_BADGE_CLASS[tone];

  if (category === "status") {
    const isKnown = KNOWN_STATUS_SET.has(key);
    const fallback = EN_FALLBACK_STATUS[key] ?? humanizeEnumToken(raw);
    const label = t ? t(`status.${key}`, { defaultValue: fallback }) : fallback;
    return { label, code: raw, tone, badgeClass, isKnown };
  }

  if (category === "outcome") {
    const isKnown = KNOWN_OUTCOME_SET.has(key) || KNOWN_STATUS_SET.has(key);
    const fallback =
      EN_FALLBACK_OUTCOMES[key] ??
      EN_FALLBACK_STATUS[key] ??
      EN_FALLBACK_REASONS[key] ??
      humanizeEnumToken(raw);
    const label = t
      ? t(`enumLabels.outcomes.${key}`, {
          defaultValue: t(`status.${key}`, { defaultValue: fallback }),
        })
      : fallback;
    return { label, code: raw, tone, badgeClass, isKnown };
  }

  if (category === "action") {
    const isKnown = KNOWN_ACTION_SET.has(key);
    const fallback = EN_FALLBACK_ACTIONS[key] ?? humanizeEnumToken(raw);
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const label = t
      ? t(`enumLabels.actions.${key}`, {
          defaultValue: t(`actions.${camelKey}`, { defaultValue: fallback }),
        })
      : fallback;
    return { label, code: raw, tone, badgeClass, isKnown };
  }

  if (category === "risk") {
    const isKnown = KNOWN_RISK_SET.has(key);
    const fallback = EN_FALLBACK_RISK[key] ?? humanizeEnumToken(raw);
    const label = t ? t(`risk.${key}`, { defaultValue: fallback }) : fallback;
    return { label, code: raw, tone, badgeClass, isKnown };
  }

  if (category === "lineageEdge") {
    const isKnown = KNOWN_LINEAGE_EDGE_SET.has(key);
    const fallback = EN_FALLBACK_LINEAGE_EDGES[key] ?? humanizeEnumToken(raw);
    const label = t ? t(`enumLabels.lineageEdges.${key}`, { defaultValue: fallback }) : fallback;
    return { label, code: raw, tone, badgeClass, isKnown };
  }

  // category === "reason"
  const i18nReasonKey = key.replace(/:/g, "__");
  const isKnown =
    KNOWN_REASON_SET.has(key) ||
    KNOWN_REASON_SET.has(i18nReasonKey) ||
    (key.includes(":") &&
      key
        .split(":")
        .every((part) => KNOWN_REASON_SET.has(part.trim()) || KNOWN_STATUS_SET.has(part.trim())));

  let fallback = EN_FALLBACK_REASONS[key] ?? EN_FALLBACK_REASONS[i18nReasonKey];
  if (!fallback && key.includes(":")) {
    const parts = key.split(":").map((part) => {
      const p = part.trim();
      return EN_FALLBACK_REASONS[p] ?? EN_FALLBACK_STATUS[p] ?? humanizeEnumToken(p);
    });
    fallback = parts.join(": ");
  }
  if (!fallback) {
    fallback = EN_FALLBACK_OUTCOMES[key] ?? EN_FALLBACK_STATUS[key] ?? raw;
  }

  let label: string;
  if (t) {
    if (
      key.includes(":") &&
      !(key in EN_FALLBACK_REASONS) &&
      !(i18nReasonKey in EN_FALLBACK_REASONS)
    ) {
      label = key
        .split(":")
        .map((part) => {
          const p = part.trim();
          const pFallback = EN_FALLBACK_REASONS[p] ?? EN_FALLBACK_STATUS[p] ?? humanizeEnumToken(p);
          return t(`enumLabels.reasons.${p}`, { defaultValue: pFallback });
        })
        .join(" · ");
    } else {
      label = t(`enumLabels.reasons.${i18nReasonKey}`, { defaultValue: fallback });
    }
  } else {
    label = fallback;
  }

  return { label, code: raw, tone, badgeClass, isKnown };
}

export function statusLabel(value: unknown, t?: TranslateFn): string {
  return resolveEnumLabel("status", value, t).label;
}

export function outcomeLabel(value: unknown, t?: TranslateFn): string {
  return resolveEnumLabel("outcome", value, t).label;
}

export function actionLabel(value: unknown, t?: TranslateFn): string {
  return resolveEnumLabel("action", value, t).label;
}

export function riskLabel(value: unknown, t?: TranslateFn): string {
  return resolveEnumLabel("risk", value, t).label;
}

export function lineageEdgeLabel(value: unknown, t?: TranslateFn): string {
  return resolveEnumLabel("lineageEdge", value, t).label;
}

export function reasonCodeLabel(value: unknown, t?: TranslateFn): string {
  return resolveEnumLabel("reason", value, t).label;
}

export function reasonCodeDisplay(value: unknown, t?: TranslateFn): ReasonCodeDisplay {
  const raw = sanitizeRawText(value);
  if (!raw) {
    return {
      text: "—",
      code: undefined,
      tone: "neutral",
      badgeClass: TONE_BADGE_CLASS.neutral,
      isKnown: false,
    };
  }
  const resolved = resolveEnumLabel("reason", raw, t);
  return {
    text: resolved.label,
    code: raw,
    tone: resolved.tone,
    badgeClass: resolved.badgeClass,
    isKnown: resolved.isKnown,
  };
}

export function outcomeDisplay(value: unknown, t?: TranslateFn): ReasonCodeDisplay {
  const raw = sanitizeRawText(value);
  if (!raw) {
    return {
      text: "—",
      code: undefined,
      tone: "neutral",
      badgeClass: TONE_BADGE_CLASS.neutral,
      isKnown: false,
    };
  }
  const resolved = resolveEnumLabel("outcome", raw, t);
  return {
    text: resolved.label,
    code: raw,
    tone: resolved.tone,
    badgeClass: resolved.badgeClass,
    isKnown: resolved.isKnown,
  };
}

export function notReportedLabel(t?: TranslateFn): string {
  if (!t) return "Not reported";
  return t("common.notReported", {
    defaultValue: t("governanceDecisions.capitalNotReported", { defaultValue: "未回報" }),
  });
}

// --- Folded domain maps (PostmortemLibrary, governanceDecisionState, Lists) ---

export function postmortemStatusLabel(status: string | undefined, t: TranslateFn): string {
  const key = normalizeEnumKey(status);
  if (!key) return "—";
  if (key === "draft" || key === "review" || key === "approved" || key === "published") {
    return t(`postmortem.status.${key}`, { defaultValue: statusLabel(key, t) });
  }
  return statusLabel(key, t);
}

export const GOVERNANCE_DECISION_STATES = [
  "recommendation",
  "review",
  "approval",
  "rejection",
  "expiry",
  "blocked",
  "applied",
  "superseded",
] as const;

export type GovernanceDecisionState = (typeof GOVERNANCE_DECISION_STATES)[number];

const GOVERNANCE_STATUS_ALIASES: Record<string, GovernanceDecisionState> = {
  draft: "recommendation",
  recommendation: "recommendation",
  recommended: "recommendation",
  proposed: "recommendation",
  candidate: "recommendation",
  pending: "review",
  queued: "review",
  review: "review",
  in_review: "review",
  under_review: "review",
  waiting_for_approval: "review",
  submitted: "review",
  approve: "approval",
  approved: "approval",
  approval: "approval",
  accepted: "approval",
  decided: "approval",
  reject: "rejection",
  rejected: "rejection",
  rejection: "rejection",
  denied: "rejection",
  revoked: "rejection",
  expire: "expiry",
  expired: "expiry",
  expiry: "expiry",
  ttl_expired: "expiry",
  timed_out: "expiry",
  timeout: "expiry",
  blocked: "blocked",
  applied: "applied",
  deployed: "applied",
  executed: "applied",
  completed: "applied",
  active: "applied",
  superseded: "superseded",
  replaced: "superseded",
  supersededby: "superseded",
};

export function normalizeGovernanceDecisionState(
  raw: string | undefined | null,
): GovernanceDecisionState | null {
  const key = normalizeEnumKey(raw);
  if (!key) return null;
  return GOVERNANCE_STATUS_ALIASES[key] ?? null;
}

export interface GovernanceDecisionStateInput {
  status?: string | null;
  canProceed?: boolean;
  canDecide?: boolean;
  blockingReasons?: string[] | null;
}

export function deriveGovernanceDecisionState(
  item: GovernanceDecisionStateInput,
): GovernanceDecisionState {
  if (item.canProceed === false && (item.blockingReasons?.length ?? 0) > 0) {
    return "blocked";
  }
  const normalized = normalizeGovernanceDecisionState(item.status);
  if (normalized) return normalized;
  return item.canDecide === false ? "recommendation" : "review";
}

export function governanceDecisionStateLabel(
  state: GovernanceDecisionState,
  t: TranslateFn,
): string {
  return t(`governanceDecisions.states.${state}`, {
    defaultValue: statusLabel(state, t),
  });
}

const REBALANCE_WORKFLOW_MAP: Record<string, string> = {
  draft: "recommendation",
  metrics_freezing: "recommendation",
  metrics_frozen: "recommendation",
  ranking_calculated: "recommendation",
  simulation_ready: "recommendation",
  review: "review",
  pending: "review",
  approved: "approved",
  rebalancing: "applied",
  deployed: "applied",
  completed: "applied",
  applied: "applied",
  executed: "applied",
  paused: "blocked",
  rejected: "blocked",
  failed: "blocked",
  blocked: "blocked",
  retired: "superseded",
  superseded: "superseded",
};

export function rebalanceWorkflowLabel(
  state: string | undefined,
  t: TranslateFn,
): string {
  const norm = normalizeEnumKey(state);
  const key = REBALANCE_WORKFLOW_MAP[norm] ?? "unknown";
  return t(`promotionAllocation.rebalanceWorkflow.${key}`, {
    defaultValue: statusLabel(key, t),
  });
}

export type StrategyOperationalStatus =
  | "running"
  | "idle"
  | "retired"
  | "unbound"
  | "unknown";

export function normalizeStrategyOperationalStatus(
  value: unknown,
): StrategyOperationalStatus | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (
    trimmed === "running" ||
    trimmed === "idle" ||
    trimmed === "retired" ||
    trimmed === "unbound" ||
    trimmed === "unknown"
  ) {
    return trimmed;
  }
  return "unknown";
}

export function strategyOperationalStatusClass(
  status: StrategyOperationalStatus,
): string {
  if (status === "running") return "border-status-success/40 text-status-success";
  if (status === "unknown") return "border-status-warning/40 text-status-warning";
  if (status === "idle") return "border-border text-foreground";
  return "border-muted text-muted-foreground";
}
