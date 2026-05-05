// v3 Part 10 Batch B4 — Agora page contracts.
// Resolves G50, G51, G53, G54, G55, G59, G60, G62, G63, G64.

import type { LinkedEntityRef } from "./B5-shared";

// ───────── G50 — Persona Ask Modes ─────────
export type PersonaAskMode = "quick_ask" | "deep_research" | "challenge" | "summarize" | "translate";

export const PERSONA_ASK_MODE_SCOPES: Record<PersonaAskMode, {
  maxTokens: number;
  allowsToolUse: boolean;
  allowsCitations: boolean;
  expectedLatencyMs: number;
}> = {
  quick_ask:      { maxTokens: 800,  allowsToolUse: false, allowsCitations: true,  expectedLatencyMs: 2000 },
  deep_research:  { maxTokens: 4000, allowsToolUse: true,  allowsCitations: true,  expectedLatencyMs: 30000 },
  challenge:      { maxTokens: 2000, allowsToolUse: false, allowsCitations: true,  expectedLatencyMs: 5000 },
  summarize:      { maxTokens: 1000, allowsToolUse: false, allowsCitations: false, expectedLatencyMs: 2000 },
  translate:      { maxTokens: 2000, allowsToolUse: false, allowsCitations: false, expectedLatencyMs: 2000 },
};

// ───────── G51 / G58 — Committee evidence pack template ─────────
// (Concrete EvidencePack already lives in src/lib/v3/committeeEvidence.ts; this adds template registry.)
export type CommitteeTemplateId =
  | "signal_trust" | "strategy_promotion" | "incident_analysis"
  | "regime_debate" | "postmortem" | "alpha_redteam";

export const COMMITTEE_TEMPLATE_REQUIRED_EVIDENCE: Record<CommitteeTemplateId, readonly string[]> = {
  signal_trust:        ["signalRef", "strategyRef", "recentFeedbackPack"],
  strategy_promotion:  ["backtestReportRef", "oosReportRef", "stressTestRef", "riskOfficerMemo"],
  incident_analysis:   ["incidentRef", "alertRefs", "timelineExport", "mitigationLog"],
  regime_debate:       ["marketEventRefs", "factorAttributionRef"],
  postmortem:          ["incidentRef", "mitigationLog", "rcaDraft"],
  alpha_redteam:       ["strategyRef", "thesisDoc", "counterEvidenceRefs"],
};

// ───────── G53 / G62 / G63 — Trainer evaluation suite ─────────
export interface EvaluationSuiteDTO {
  id: string;
  name: string;
  targetType: "persona" | "skill";
  cases: Array<{ id: string; input: unknown; expected: unknown; weight: number }>;
  passingScore: number;
  requiredForPublish: boolean;
  scoringRubric: Array<{ criterion: string; maxPoints: number }>;
}

export const TRAINER_PUBLISH_GATE = {
  /** Publish blocked unless every requiredForPublish suite has latest score >= passingScore. */
  blockIfLatestScoreBelowPassing: true,
} as const;

// ───────── G54 / G55 — Agora prohibited actions + role default route ─────────
export const AGORA_PROHIBITED_ACTIONS = {
  promote_to_live:           "not_shown",       // request handoff only
  apply_rebalance:           "not_shown",
  rollback_live:             "not_shown",       // can escalate alert→incident
  emergency_kill:            "not_shown",
  change_capital_allocation: "not_shown",
  grant_mcp_permission:      "request_only",
  approve_skill:             "request_only",
  change_route_policy:       "request_only",
} as const;

export type AgoraRole = "analyst" | "trader" | "ai_trainer" | "research_assistant" | "observer";
export const AGORA_DEFAULT_ROUTE: Record<AgoraRole, string> = {
  analyst:            "/agora/daily",
  trader:             "/agora/daily",
  ai_trainer:         "/agora/trainer",
  research_assistant: "/agora/notebook",
  observer:           "/agora/markets",
};

// ───────── G59 — Notebook markdown extensions ─────────
export const NOTEBOOK_MARKDOWN_EXTENSIONS = {
  gfm: true,
  math: true,
  mermaid: true,
  embeddedCharts: true,
  inlineCitations: true,        // [[ref:entityType/entityId]]
  rawHtml: false,               // sanitized & blocked
} as const;

export interface ResearchNoteBlockRef {
  blockId: string;
  refs: LinkedEntityRef[];
}

// ───────── G60 — Persona Lab sandbox commit workflow ─────────
export const PERSONA_LAB_COMMIT_FLOW = [
  "sandbox_draft", "evaluation_required", "handoff_submitted",
  "management_review", "approved", "published",
] as const;

export interface PersonaSandboxCommitRequest {
  personaDraftId: string;
  basePersonaId?: string;
  evaluationRunIds: string[];
  changeSummary: string;
  requestedRoutePolicyId?: string;
}

export const PERSONA_LAB_COMMIT_ENDPOINT = (draftId: string) =>
  `/bff/agora/persona-lab/${draftId}/actions/submit-commit`;

// ───────── G64 — Channel detail ─────────
export type ChannelTypeFull = "web" | "telegram" | "discord" | "webhook";
export type ChannelStatusFull = "disabled" | "enabled" | "degraded";

export interface ChannelDTOFull {
  id: string;
  type: ChannelTypeFull;
  name: string;
  status: ChannelStatusFull;
  boundPersonaIds: string[];
  allowedUserRoles: string[];
  allowedActions: string[];
  retentionDays: number;
  auditEnabled: boolean;
  rateLimitPerMinute: number;
  lastMessageAt?: string;
  error?: string | null;
}
