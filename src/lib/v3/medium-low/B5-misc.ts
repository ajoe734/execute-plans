// v3 Part 10 Batch B5 — BFF / Realtime / Format / Component contracts.
// Resolves G69, G70, G71, G75, G76, G77, G79, G82, G83, G84, G85, G87, G88, G89, G90, G91, G92.

import type { LinkedEntityRef } from "./B5-shared";
import type { LocaleCode, PersonaResponseLanguageMode } from "./B1-platform";

// ───────── G69 — Agora session / message attachment + citation ─────────
export interface AgoraMessageDTO {
  id: string;
  sessionId: string;
  sender: LinkedEntityRef;
  role: "user" | "persona" | "system" | "trainer";
  content: string;
  language: LocaleCode;
  attachments: MessageAttachmentDTO[];
  citations: InlineCitationDTO[];
  annotations: MessageAnnotationDTO[];
  createdAt: string;
}

export interface MessageAttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  previewUrl?: string;
}

export interface InlineCitationDTO {
  id: string;
  label: string;
  ref: LinkedEntityRef;
  quote?: string;
  range?: { start: number; end: number };
}

export interface MessageAnnotationDTO {
  id: string;
  authorRef: LinkedEntityRef;
  body: string;
  range?: { start: number; end: number };
  createdAt: string;
}

// ───────── G70 — Missing BFF endpoints ─────────
export const BFF_ENDPOINTS_MISSING = {
  strategyDryRun: (strategyId: string)   => `/bff/strategies/${strategyId}/dry-run`,
  personaTestPrompt: (personaId: string) => `/bff/personas/${personaId}/test-prompt`,
  skillSandboxEval: (skillId: string)    => `/bff/skills/${skillId}/sandbox-eval`,
  memoryQuarantine: (memoryId: string)   => `/bff/memory/${memoryId}/actions/quarantine`,
  auditExport:                              "/bff/audit/export",
} as const;

export interface StrategyDryRunRequest { strategyId: string; specVersionId: string; fixtureId: string; }
export interface StrategyDryRunResponse { jobId: string; expectedDurationMs: number; }

export interface PersonaTestPromptRequest {
  personaId: string;
  prompt: string;
  contextRefs: LinkedEntityRef[];
  responseLanguage: PersonaResponseLanguageMode;
}
export interface PersonaTestPromptResponse {
  responseText: string;
  citations: InlineCitationDTO[];
  safetyFlags: string[];
}

export interface QuarantineMemoryRequest { reason: string; linkedFeedbackId?: string; }
export interface QuarantineMemoryResponse { memoryId: string; status: "quarantined"; reviewTaskId: string; }

// ───────── G71 — Accept-Language fallback chain ─────────
export const SUPPORTED_LOCALES: readonly LocaleCode[] = ["zh-TW", "en-US"] as const;

export function resolveAcceptLocale(opts: {
  queryLocale?: string;
  headerLocale?: string;
  userLocale?: string;
  acceptLanguage?: string;
}): LocaleCode {
  const tries = [
    opts.queryLocale, opts.headerLocale, opts.userLocale,
    ...(opts.acceptLanguage?.split(",").map((s) => s.split(";")[0].trim()) ?? []),
  ];
  for (const t of tries) {
    if (t && (SUPPORTED_LOCALES as readonly string[]).includes(t)) return t as LocaleCode;
  }
  return "zh-TW";
}

// ───────── G75 / G76 — Date / Money formatting ─────────
export const FORMAT_RULES = {
  dateTimezoneDefault: "Asia/Taipei",
  dateTableFormat: "YYYY-MM-DD HH:mm",
  dateAuditFormat: "YYYY-MM-DD HH:mm:ss z",
  percentDefaultDecimals: 2,
  percentFormulaDecimals: 4,
} as const;

export interface MoneyDTO { amount: string; currency: "USD" | "TWD" | "JPY" | "EUR"; }
export const MONEY_PRECISION: Record<MoneyDTO["currency"], number> = {
  USD: 2, TWD: 0, JPY: 0, EUR: 2,
};

// ───────── G77 — Review participants ─────────
export interface ReviewParticipantDTO {
  userId: string;
  role: "requester" | "reviewer" | "approver" | "cc" | "observer";
  required: boolean;
  decision?: "approved" | "rejected" | "changes_requested" | null;
}

// ───────── G79 — HighRisk memo limits ─────────
export type HighRiskMemoCategory =
  | "live_deployment_rollback_kill"
  | "capital_rebalance_allocation"
  | "formula_activation_rollback"
  | "persona_mcp_skill_permission"
  | "non_high_risk";

export const HIGH_RISK_MEMO_LIMITS: Record<HighRiskMemoCategory, { min: number; max: number; required: boolean }> = {
  live_deployment_rollback_kill: { min: 20, max: 2000, required: true },
  capital_rebalance_allocation:  { min: 20, max: 2000, required: true },
  formula_activation_rollback:   { min: 10, max: 1500, required: true },
  persona_mcp_skill_permission:  { min: 10, max: 1500, required: true },
  non_high_risk:                 { min: 0,  max: 1000, required: false },
};

export function validateHighRiskMemo(category: HighRiskMemoCategory, memo: string): { ok: boolean; code?: "memo_too_short" | "memo_too_long" | "memo_required" } {
  const l = HIGH_RISK_MEMO_LIMITS[category];
  if (l.required && !memo) return { ok: false, code: "memo_required" };
  if (memo.length < l.min) return { ok: false, code: "memo_too_short" };
  if (memo.length > l.max) return { ok: false, code: "memo_too_long" };
  return { ok: true };
}

// ───────── G82 — FormulaBuilder shortcuts ─────────
export const FORMULA_BUILDER_SHORTCUTS = {
  saveDraft: "Mod+S",
  runPreview: "Mod+Enter",
  compareWithActive: "Mod+Shift+C",
  closeIfClean: "Escape",
  moveRow: "Alt+ArrowUp/ArrowDown",
} as const;

// ───────── G83 — Component namespacing ─────────
export const COMPONENT_NAMESPACING = {
  shared: { dir: "components/shared/*", prefix: "" },
  management: { prefix: "Management" },
  agora: { prefix: "Agora" },
  /** Reserved Agora-only — must be `AgoraMessageAnnotationBar`. */
  reserved: ["MessageAnnotationBar"] as const,
} as const;

// ───────── G84 — EventStreamPanel retain count ─────────
export const EVENT_STREAM_RETAIN: Record<"globalTopbar" | "commandCenter" | "entityDetail" | "audit", number | "server_paginated"> = {
  globalTopbar: 100,
  commandCenter: 300,
  entityDetail: 200,
  audit: "server_paginated",
};

// ───────── G85 — Form validation strategy ─────────
export interface FieldValidationErrorDTO { path: string; i18nKey: string; message: string; }
export const FORM_VALIDATION_RULES = {
  schemaValidationBeforeSubmit: true,
  mapBffErrorsByFieldPath: true,
  clientCannotReplaceServer: true,
  dirtyNavConfirmation: true,
  autosaveAllowedFor: ["notes", "drafts"] as const,
} as const;

// ───────── G87 / G92 — Mock naming ─────────
export const MOCK_ID_PATTERNS = {
  Strategy:       /^alpha_\d{3,}$/,
  Persona:        /^persona_\d{3,}$/,
  CapitalPool:    /^pool_\d{3,}$/,
  RankingFormula: /^formula_\d{3,}$/,
  Rebalance:      /^rebalance_\d{4}Q[1-4]_pool_\d{3,}$/,
  Experiment:     /^exp_\d{3,}$/,
  Job:            /^job_\d{3,}$/,
  Signal:         /^signal_\d{3,}$/,
  AgoraSession:   /^session_\d{3,}$/,
} as const;

// ───────── G88 / G89 — Demo scenario × page mapping ─────────
export const DEMO_SCENARIOS: Record<"A" | "B" | "C" | "D" | "E" | "F", { name: string; routes: string[] }> = {
  A: { name: "Strategy replicated → review → paper",          routes: ["/management/strategies/:id", "/management/governance/:id", "/management/deployment"] },
  B: { name: "Live drawdown alert → incident → rollback",     routes: ["/management/risk", "/management/incidents/:id", "/management/deployment"] },
  C: { name: "Quarterly ranking → rebalance",                 routes: ["/management/promotion-allocation?tab=formula-policy", "/management/promotion-allocation?tab=quarterly-capital&rebalance_id=:id", "/management/promotion-allocation?tab=quarterly-capital&capital_id=:id"] },
  D: { name: "New persona → route policy → MCP/Skill grant",  routes: ["/management/personas/:id", "/management/mcp", "/management/skills"] },
  E: { name: "Agora signal review → research task",           routes: ["/agora/signals/:id", "/agora/insights", "/management/experiments"] },
  F: { name: "Skill draft → sandbox → approval",              routes: ["/agora/skill-coaching", "/management/skills", "/management/governance/:id"] },
};

export const BUILD_PHASES: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string[]> = {
  1: ["shared shell", "Management Command Center", "Jobs", "Audit"],
  2: ["Strategies", "Strategy Detail", "Experiments"],
  3: ["Personas", "Capital", "Ranking", "Rebalance"],
  4: ["Evolution", "Governance", "Deployment/Risk/Incidents"],
  5: ["Tools", "MCP", "Skills", "Artifacts/Lineage"],
  6: ["Agora Daily", "Signals", "Notebook", "Ask Personas", "Committee"],
  7: ["Agora Journal", "Triage", "Insights", "Trainer", "Memory", "Skill Coaching"],
};

// ───────── G90 — Lovable prompt token budget ─────────
export const LOVABLE_PROMPT_BUDGET = {
  globalShell: 4000,
  pageGroup:   6000,
  component:   3000,
  remediation: 5000,
} as const;

// ───────── G91 — Dynamic route param patterns ─────────
export const ROUTE_PARAM_PATTERNS = {
  strategyId:   /^alpha_\d{3,}$/,
  personaId:    /^persona_\d{3,}$/,
  poolId:       /^pool_\d{3,}$/,
  rebalanceId:  /^rebalance_\d{4}Q[1-4]_pool_\d{3,}$/,
  experimentId: /^exp_\d{3,}$/,
  incidentId:   /^incident_\d{3,}$/,
  sessionId:    /^session_\d{3,}$/,
} as const;

export function isValidRouteParam(kind: keyof typeof ROUTE_PARAM_PATTERNS, value: string): boolean {
  return ROUTE_PARAM_PATTERNS[kind].test(value);
}
