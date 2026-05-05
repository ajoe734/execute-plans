// v3 Part 10 Batch B2 — Entity contracts.
// Resolves G20, G21, G22, G23, G24, G25, G26, G27, G39, G40, G43, G48, G52, G61, G65, G73, G80.

import type { LinkedEntityRef } from "./B5-shared";
import type { LocaleCode, BffError } from "./B1-platform";

// ───────── G20 / G80 — Incident ─────────
export type IncidentStatus =
  | "new" | "acknowledged" | "assigned" | "investigating"
  | "mitigated" | "resolved" | "postmortem_required" | "closed";

export type MitigationActionType =
  | "pause_strategy" | "reduce_allocation" | "rollback"
  | "disable_tool" | "restrict_persona" | "open_research_task" | "manual_note";

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  new: ["acknowledged"],
  acknowledged: ["assigned"],
  assigned: ["investigating"],
  investigating: ["mitigated"],
  mitigated: ["resolved", "postmortem_required"],
  resolved: ["closed", "postmortem_required"],
  postmortem_required: ["closed"],
  closed: [],
};

export interface IncidentAttachmentDTO {
  id: string;
  fileName: string;
  mimeType: "text/plain" | "application/json" | "text/markdown" | "image/png" | "application/pdf";
  sizeBytes: number;
  storageUrl: string;
}

export interface IncidentTimelineEventDTO {
  id: string;
  incidentId: string;
  occurredAt: string;
  actor: LinkedEntityRef;
  eventType: "created" | "acknowledged" | "assigned" | "mitigation_applied"
    | "status_changed" | "note_added" | "attachment_added" | "closed";
  summary: string;
  attachments: IncidentAttachmentDTO[];
}

export interface IncidentTrainingFeedbackDTO {
  id: string;
  incidentId: string;
  targetPersonaId?: string;
  targetStrategyId?: string;
  feedbackType: "persona_behavior" | "strategy_failure_mode" | "risk_rule" | "tool_misuse";
  summary: string;
  recommendedAction: "create_training_example" | "update_memory" | "update_route_policy" | "update_evolution_constraint";
  status: "proposed" | "accepted" | "rejected";
}

// ───────── G21 / G61 — Memory & Training Update ─────────
export type MemoryStatus = "proposed" | "active" | "quarantined" | "rejected" | "deprecated" | "deleted";
export type TrainingUpdateStatus = "draft" | "evaluation_required" | "under_review"
  | "approved" | "published" | "rejected" | "rolled_back";

export interface MemoryTrainingLinkDTO {
  id: string;
  memoryId: string;
  trainingExampleId?: string;
  trainerFeedbackId?: string;
  updateId?: string;
  relationship: "created_from_feedback" | "requires_training_example"
    | "conflicts_with_training" | "approved_by_update";
}

// ───────── G22 / G39 / G40 — Tool / MCP / Skill separation ─────────
export const CAPABILITY_LIST_COLUMNS = {
  tool:      ["toolId", "name", "type", "sideEffectLevel", "status", "allowedPersonasCount", "lastUsedAt", "errorRate"],
  mcpServer: ["serverId", "name", "transport", "status", "toolsCount", "authType", "lastHealthCheckAt"],
  mcpTool:   ["mcpToolId", "serverId", "name", "sideEffectLevel", "schemaVersion", "allowedPersonasCount", "lastCallAt"],
  skill:     ["skillId", "name", "version", "status", "riskLevel", "sandboxStatus", "allowedPersonasCount", "lastUsedAt"],
} as const;

// ───────── G23 — Insight lineage ─────────
export interface InsightLineageDTO {
  insightId: string;
  sourceType: "trader_note" | "signal_feedback" | "persona_response"
    | "committee_memo" | "alert_triage" | "market_event" | "postmortem";
  sourceRef: LinkedEntityRef;
  createdBy: LinkedEntityRef;
  linkedStrategyIds: string[];
  linkedSignalIds: string[];
  linkedPersonaIds: string[];
  convertedTo?: LinkedEntityRef[];
  parentInsightIds: string[];
  childInsightIds: string[];
}

// ───────── G24 / G25 / G73 — Jobs ─────────
export type JobType =
  | "backtest" | "oos" | "stress_test" | "parameter_sweep" | "artifact_build"
  | "validator_run" | "formula_recalculation" | "rebalance_simulation"
  | "evolution_run" | "mcp_discovery" | "skill_sandbox" | "persona_evaluation"
  | "deployment" | "rollback" | "postmortem_generation";

export interface JobDTO<TInput = unknown, TOutput = unknown> {
  id: string;
  type: JobType;
  status: "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying";
  target: LinkedEntityRef;
  triggeredBy: LinkedEntityRef;
  persona?: LinkedEntityRef | null;
  input: TInput;
  output?: TOutput | null;
  progress: {
    percent: number;
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
    messageKey?: string;
    updatedAt: string;
  };
  logsUrl?: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: BffError | null;
}

export const JOB_ASYNC_THRESHOLDS = {
  expectedDurationMs: 2000,
  alwaysAsyncWhen: [
    "produces_artifact", "affects_deployment", "affects_runtime",
    "external_mcp_discovery", "sandbox_or_evaluation", "experiment_backtest_oos",
  ] as const,
};

export const JOB_PROGRESS_RULES = {
  sseMinIntervalMs: 1000,
  maxSsePayloadBytes: 16 * 1024,
  logsViaUrlOnly: true,
} as const;

// Per-type input/output payloads (subset; only the names normalized — full schemas already covered by spec text).
export interface BacktestJobInput {
  strategyId: string; specVersionId: string;
  engine: "qlib" | "vectorbt" | "statmodels" | "custom";
  datasetId: string; startDate: string; endDate: string;
  costModelId: string; parameterSetId?: string;
}

export interface DeploymentJobInput {
  promotionRequestId: string; strategyId: string;
  artifactId: string; runtimeId: string; capitalPoolId: string;
}
export interface RollbackJobInput {
  deploymentId: string; targetArtifactId: string;
  reason: string; confirmToken: string;
}
export interface PostmortemGenerationJobInput { incidentId: string; language: LocaleCode; }

// ───────── G26 / G48 / G52 / G65 — Agora Handoff full schema ─────────
export type AgoraHandoffTypeFull =
  | "trader_insight_to_strategy"
  | "signal_feedback_to_research_task"
  | "committee_memo_to_review_evidence"
  | "trainer_feedback_to_persona_update"
  | "skill_draft_to_skill_approval"
  | "mcp_tool_request_to_permission_review"
  | "alert_triage_to_incident";

export type HandoffStatus = "draft" | "submitted" | "accepted" | "rejected" | "rerouted" | "expired";

export interface AgoraHandoffDTOFull<TPayload = unknown> {
  id: string;
  handoffType: AgoraHandoffTypeFull;
  status: HandoffStatus;
  source: { app: "agora"; route: string; entity: LinkedEntityRef };
  destination: {
    app: "management"; route: string;
    queue: "insight" | "research" | "governance" | "persona" | "capability" | "incident";
  };
  priority: "low" | "normal" | "high" | "urgent";
  slaDueAt: string;
  rerouteCount: number;
  payload: TPayload;
  createdBy: LinkedEntityRef;
  createdAt: string;
  updatedAt: string;
}

export const HANDOFF_SLA_HOURS: Record<AgoraHandoffDTOFull["priority"], number> = {
  low: 24 * 7, normal: 24 * 2, high: 24, urgent: 4,
};

export const ATTACH_INSIGHT_TO_STRATEGY_ENDPOINT = (insightId: string) =>
  `/bff/insights/${insightId}/actions/attach-strategy`;

// ───────── G27 / G43 — Audit retention ─────────
export const AUDIT_RETENTION_YEARS = {
  liveDeploymentRollbackKill: 7,
  capitalAllocationRebalanceFormula: 7,
  personaToolMcpPermission: 5,
  skillSandboxApproval: 5,
  agoraNotesAnnotations: 3,
  notificationReadStateDays: 180,
  jobLogsDefault: 1,
  jobLogsLinkedToIncident: 7,
} as const;

export const AUDIT_EXPORT_ENDPOINT = (params: { format: "csv"; from: string; to: string; entityType?: string; entityId?: string }) => {
  const qs = new URLSearchParams({ format: params.format, from: params.from, to: params.to });
  if (params.entityType) qs.set("entityType", params.entityType);
  if (params.entityId) qs.set("entityId", params.entityId);
  return `/bff/audit/export?${qs.toString()}`;
};

export const AUDIT_CSV_COLUMNS = [
  "eventId", "occurredAt", "actorId", "actorRole", "entityType",
  "entityId", "action", "beforeHash", "afterHash", "memo", "ipAddress", "userAgent",
] as const;
