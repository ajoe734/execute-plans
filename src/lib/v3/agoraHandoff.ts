// v3 §15 Agora Handoff Schema. Resolves G48 / G65.

export type AgoraHandoffType =
  | "strategy_idea" | "research_task" | "training_example"
  | "committee_memo" | "skill_draft" | "mcp_tool_request"
  | "incident_note" | "signal_feedback";

export const AGORA_HANDOFF_TYPES: readonly AgoraHandoffType[] = [
  "strategy_idea", "research_task", "training_example",
  "committee_memo", "skill_draft", "mcp_tool_request",
  "incident_note", "signal_feedback",
] as const;

export interface AgoraHandoffBase {
  id: string;
  type: AgoraHandoffType;
  sourceRoute: string;
  sourceSessionId: string;
  sourceMessageIds: string[];
  creator: string;
  priority: "low" | "normal" | "high" | "urgent";
  targetEntityType: string;
  targetEntityId?: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  recommendedManagementAction: string;
  status: "queued" | "accepted" | "rejected" | "completed" | "expired";
  slaHours?: number;
  createdAt: string;
}

// Per-type payload constraints (subset; extend in dedicated PR per type)
export interface StrategyIdeaPayload {
  thesis: string;
  marketScope: string[];
  expectedSharpe?: number;
  references: string[];
}
export interface ResearchTaskPayload {
  question: string;
  hypothesis?: string;
  datasets: string[];
  deadlineHours?: number;
}
export interface TrainingExamplePayload {
  personaId: string;
  inputContext: string;
  desiredResponse: string;
  rationale: string;
}
export interface CommitteeMemoPayload {
  topic: string;
  evidencePackId?: string;
  proposedDecision: string;
}
export interface SkillDraftPayload {
  skillId?: string;
  diff: string;
  rationale: string;
}
export interface McpToolRequestPayload {
  serverId: string;
  toolId: string;
  scope: "read" | "write" | "destructive";
  envScope: Array<"research" | "paper" | "live">;
  rationale: string;
}
export interface IncidentNotePayload {
  incidentId: string;
  observation: string;
  severityHint?: "low" | "medium" | "high" | "critical";
}
export interface SignalFeedbackPayload {
  signalId: string;
  decision: "agree" | "disagree" | "flag_suspicious";
  confidence: 1 | 2 | 3 | 4 | 5;
  reason?: string;
}
