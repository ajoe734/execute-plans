// v3 Part 10 Batch B1 — Platform contracts
// Resolves G06, G07, G08, G09, G10, G11, G12, G74, G81.
// Pure-types module — no runtime side effects beyond const tables.

import type { LinkedEntityRef } from "./B5-shared";

// ───────── G06 — Locale / Persona response language ─────────
export type LocaleCode = "zh-TW" | "en-US";
export type PersonaResponseLanguageMode = "follow_ui" | "zh-TW" | "en-US" | "mixed_original";

export interface UserLocalePreferenceDTO {
  uiLocale: LocaleCode;
  personaResponseLanguage: PersonaResponseLanguageMode;
}
export interface AgoraSessionLanguageDTO {
  sessionId: string;
  responseLanguage: PersonaResponseLanguageMode;
  lockedByUser: boolean;
}
/** Resolve effective persona response locale (priority 1→4 from §1). */
export function resolvePersonaLocale(args: {
  session?: AgoraSessionLanguageDTO;
  user?: UserLocalePreferenceDTO;
}): LocaleCode {
  const s = args.session;
  if (s && s.lockedByUser && s.responseLanguage !== "follow_ui" && s.responseLanguage !== "mixed_original") {
    return s.responseLanguage;
  }
  const u = args.user;
  if (u?.personaResponseLanguage && u.personaResponseLanguage !== "follow_ui" && u.personaResponseLanguage !== "mixed_original") {
    return u.personaResponseLanguage;
  }
  return u?.uiLocale ?? "zh-TW";
}

// ───────── G07 — Notifications ─────────
export type NotificationType =
  | "approval_required" | "approval_decision" | "risk_alert" | "incident_update"
  | "job_completed" | "job_failed" | "deployment_event" | "rollback_event"
  | "rebalance_event" | "persona_policy_violation" | "handoff_incoming"
  | "mention" | "system_health";

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  severity: "info" | "warning" | "critical";
  titleKey: string;
  bodyKey: string;
  titleParams?: Record<string, string | number>;
  bodyParams?: Record<string, string | number>;
  createdAt: string;
  readAt: string | null;
  actor?: LinkedEntityRef;
  target: LinkedEntityRef;
  route: string;
  actionId?: string;
  requiresUserAction: boolean;
  expiresAt?: string | null;
}

export const NOTIFICATION_ROUTING: Record<NotificationType, { routeTemplate: string; requiresUserAction: boolean; severity: "info" | "warning" | "critical" }> = {
  approval_required:        { routeTemplate: "/management/governance/:id", requiresUserAction: true,  severity: "warning" },
  approval_decision:        { routeTemplate: ":targetRoute",               requiresUserAction: false, severity: "info" },
  risk_alert:               { routeTemplate: "/management/risk?alertId=:id", requiresUserAction: true,  severity: "warning" },
  incident_update:          { routeTemplate: "/management/incidents/:id",  requiresUserAction: true,  severity: "warning" },
  job_completed:            { routeTemplate: "/management/jobs/:id",       requiresUserAction: false, severity: "info" },
  job_failed:               { routeTemplate: "/management/jobs/:id",       requiresUserAction: true,  severity: "warning" },
  deployment_event:         { routeTemplate: "/management/deployment/:id", requiresUserAction: true,  severity: "warning" },
  rollback_event:           { routeTemplate: "/management/deployment/:id", requiresUserAction: true,  severity: "warning" },
  rebalance_event:          { routeTemplate: "/management/promotion-allocation?tab=quarterly-capital&rebalance_id=:id",  requiresUserAction: false, severity: "info" },
  persona_policy_violation: { routeTemplate: "/management/personas/:id",   requiresUserAction: true,  severity: "warning" },
  handoff_incoming:         { routeTemplate: "/management/command-center", requiresUserAction: true,  severity: "info" },
  mention:                  { routeTemplate: ":targetRoute",               requiresUserAction: false, severity: "info" },
  system_health:            { routeTemplate: "/management/runtime",        requiresUserAction: true,  severity: "warning" },
};

// ───────── G08 — Right Drawer surfaces ─────────
export type RightDrawerSurface =
  | "strategy_inspector" | "persona_inspector" | "capital_pool_inspector"
  | "job_inspector" | "alert_inspector" | "incident_inspector"
  | "signal_inspector" | "message_inspector" | "artifact_inspector"
  | "tool_call_inspector" | "persona_quick_ask" | "handoff_inspector"
  | "audit_event_inspector";

export interface RightDrawerState {
  open: boolean;
  surface: RightDrawerSurface | null;
  entityRef?: LinkedEntityRef;
  payload?: Record<string, unknown>;
  sourceRoute: string;
}

// ───────── G09 — Global Search ─────────
export type SearchEntityType =
  | "strategy" | "persona" | "capital_pool" | "experiment" | "artifact"
  | "review_request" | "deployment" | "runtime" | "incident" | "tool"
  | "mcp_server" | "mcp_tool" | "skill" | "insight" | "research_note"
  | "agora_session" | "decision_journal_entry" | "job" | "audit_event";

export interface SearchResultDTO {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle?: string;
  status?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  owner?: LinkedEntityRef;
  updatedAt: string;
  route: string;
  score: number;
  matchedFields: string[];
}

export const SEARCH_SCORE_WEIGHTS = {
  exactId: 100, exactTitle: 90, prefixTitle: 75, fuzzyTitle: 55,
  linkedEntity: 35, noteBody: 15, recencyBoostMax: 10,
  openAlertBoost: 8, liveRiskBoost: 8,
} as const;

export const SEARCH_ENDPOINT = (q: string, types?: SearchEntityType[], limit = 20) =>
  `/bff/search?q=${encodeURIComponent(q)}${types?.length ? `&types=${types.join(",")}` : ""}&limit=${limit}`;

// ───────── G10 — ADR ─────────
export interface ArchitectureDecisionRecordDTO {
  adrId: string;
  title: string;
  decision: string;
  status: "proposed" | "accepted" | "superseded" | "rejected";
  decidedAt: string;
  decidedBy: LinkedEntityRef;
  supersedes?: string[];
  supersededBy?: string | null;
  affectedSpecParts: string[];
}

export const REQUIRED_ADRS: readonly Pick<ArchitectureDecisionRecordDTO, "adrId" | "title" | "decision">[] = [
  { adrId: "ADR-FE-0001", title: "Management + Operations merged", decision: "Single Management Console" },
  { adrId: "ADR-FE-0002", title: "Agora live restriction",         decision: "Agora cannot directly execute live/capital high-risk actions" },
  { adrId: "ADR-FE-0003", title: "availableActions contract",      decision: "BFF returns ActionDescriptor[]" },
  { adrId: "ADR-FE-0004", title: "Risk canonical route",           decision: "/management/risk is canonical" },
  { adrId: "ADR-FE-0005", title: "Strategy lifecycle",             decision: "8 canonical lifecycle statuses" },
] as const;

// ───────── G11 / G81 — Design tokens ─────────
export const DESIGN_TOKENS = {
  "--pantheon-risk-critical":   "bg-red-600 text-white",
  "--pantheon-risk-high":       "bg-orange-500 text-white",
  "--pantheon-risk-medium":     "bg-amber-400 text-black",
  "--pantheon-risk-low":        "bg-slate-300 text-slate-900",
  "--pantheon-status-live":     "bg-emerald-600 text-white",
  "--pantheon-status-paper":    "bg-yellow-500 text-black",
  "--pantheon-status-retired":  "bg-zinc-500 text-white",
  "--pantheon-surface-console": "bg-slate-950",
  "--pantheon-surface-workbench": "bg-neutral-50",
} as const;

// ───────── G12 / G74 — i18n + BFF errors ─────────
export interface BffError {
  code: string;
  message: string;
  i18nKey: string;
  i18nParams?: Record<string, string | number>;
  severity: "info" | "warning" | "error" | "critical";
  retryable: boolean;
  details?: Record<string, unknown>;
}

export const I18N_QA = {
  pseudoLocale: "en-XA",
  failBuildOnMissingKey: true,
} as const;
